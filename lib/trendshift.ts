import rawSnapshot from "./trendshift-source.json";
import translations from "./trendshift-zh.json";
import { trendPeriods, type TrendPeriod, type TrendRanking, type TrendRepository } from "./trendshift-types";

type RawRow = Record<string, unknown>;
const descriptions: Record<string, { sourceDescription: string; descriptionZh: string }> = translations.repositories;
const topics: Record<string, { sourceName: string; nameZh: string }> = translations.topics;
const cache = new Map<TrendPeriod, { data: TrendRanking; retryAt: number }>();
const pending = new Map<TrendPeriod, Promise<TrendRanking>>();
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const number = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

function normalize(row: RawRow): TrendRepository | null {
  const id = number(row.repository_id), rank = number(row.rank);
  if (!id || !rank || typeof row.full_name !== "string" || !/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(row.full_name)) return null;
  if ([row.repository_stars, row.repository_forks, row.repository_stars_gained].some(value => value != null && number(value) === null)) return null;
  const original = typeof row.repository_description === "string" ? row.repository_description.trim() : "";
  const saved = descriptions[row.full_name];
  const translated = saved?.sourceDescription.trim() === original ? saved.descriptionZh : "";
  // Never reuse a translation for a changed upstream description or leak English fallback copy.
  const translationPending = !!original && !translated;
  const tags = Array.isArray(row.tags) ? row.tags : [];
  return {
    id, name: row.full_name, rank,
    description: translated || (original ? "此项目的中文简介尚未收录，可打开原站查看详情。" : "项目暂未提供简介。"),
    translationPending,
    language: typeof row.repository_language === "string" ? row.repository_language.slice(0, 60) : "",
    stars: number(row.repository_stars), forks: number(row.repository_forks), starsGained: number(row.repository_stars_gained),
    topics: tags.filter((tag): tag is Record<string, unknown> => !!tag && typeof tag === "object")
      .flatMap(tag => typeof tag.slug === "string" && Object.hasOwn(topics, tag.slug) ? [{ slug: tag.slug, label: topics[tag.slug].nameZh }] : []).slice(0, 8),
  };
}

export function parseTrendshiftHtml(html: string): RawRow[] {
  let stream = "";
  for (const match of html.matchAll(/self\.__next_f\.push\(([\s\S]*?)\)\s*;?\s*<\/script>/g)) {
    try {
      const chunk: unknown = JSON.parse(match[1]);
      if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === "string") stream += chunk[1];
    } catch { /* Non-JSON scripts are deliberately ignored, never evaluated. */ }
  }
  const candidates: RawRow[][] = [];
  function visit(value: unknown, depth = 0) {
    if (depth > 40 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const child of value) visit(child, depth + 1); return; }
    for (const [key, child] of Object.entries(value)) {
      if (key === "initialData" && Array.isArray(child) && child.length && child.length <= 100 && child.every(row => row && typeof row === "object" && normalize(row))) candidates.push(child);
      visit(child, depth + 1);
    }
  }
  for (const line of stream.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    try { visit(JSON.parse(line.slice(colon + 1))); } catch { /* RSC references and non-JSON rows are not ranking data. */ }
  }
  const rows = candidates.find(candidate => new Set(candidate.map(row => row.repository_id)).size === candidate.length && new Set(candidate.map(row => row.rank)).size === candidate.length);
  if (!rows?.length) throw new Error("榜单格式暂时无法识别。");
  return rows;
}

function periodLabel(period: TrendPeriod, row: RawRow) {
  const date = typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(row.date) ? row.date.slice(0, 10).replace(/-/g, "/") : "";
  const year = number(row.year), month = number(row.month), week = number(row.week);
  if (period === "daily" && date) return date;
  if (period === "weekly" && year && week && week <= 53) return `${year} 年第 ${week} 周`;
  if (period === "monthly" && year && month && month <= 12) return `${year} 年 ${month} 月`;
  if (period === "yearly" && year) return `${year} 年`;
  return "最新公开榜单";
}

export function makeRanking(period: TrendPeriod, rows: RawRow[], capturedAt: string, stale: boolean): TrendRanking {
  const items = rows.map(normalize).filter((item): item is TrendRepository => !!item).sort((a, b) => a.rank - b.rank);
  return {
    period, periodLabel: periodLabel(period, rows[0] || {}), sourceUrl: `https://trendshift.io/${trendPeriods[period].path}`,
    capturedAt, stale, notice: stale ? "原站暂时无法连接，正在显示上次保存的榜单。" : "", items,
  };
}

async function readBoundedHtml(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_HTML_BYTES || !response.body) throw new Error("上游响应异常。");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, html = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HTML_BYTES) throw new Error("上游响应过大。");
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function getTrendRanking(period: TrendPeriod): Promise<TrendRanking> {
  const current = cache.get(period);
  if (current && current.retryAt > Date.now()) return current.data;
  const existing = pending.get(period);
  if (existing) return existing;
  const operation = (async () => {
    try {
      const response = await fetch(`https://trendshift.io/${trendPeriods[period].path}`, {
        headers: { Accept: "text/html", "User-Agent": "CodexPulse/1.0 (Trendshift public ranking reader)" },
        redirect: "manual", signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error(`原站未返回榜单（${response.status}）。`);
      const data = makeRanking(period, parseTrendshiftHtml(await readBoundedHtml(response)), new Date().toISOString(), false);
      cache.set(period, { data, retryAt: Date.now() + 5 * 60_000 });
      return data;
    } catch (error) {
      console.warn("Trendshift sync unavailable:", error instanceof Error ? error.message : "Unknown source error");
      const saved = rawSnapshot.periods[period];
      const data = current?.data ? { ...current.data, stale: true, notice: "原站暂时无法连接，正在显示上次保存的榜单。" } : makeRanking(period, saved.items, saved.capturedAt, true);
      cache.set(period, { data, retryAt: Date.now() + 60_000 });
      return data;
    } finally { pending.delete(period); }
  })();
  pending.set(period, operation);
  return operation;
}
