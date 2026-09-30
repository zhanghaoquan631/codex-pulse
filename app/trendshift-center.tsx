"use client";

import { useEffect, useMemo, useState } from "react";
import { Code2, GitBranch, GitFork, RefreshCw, Search, Star, TrendingUp, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trendPeriods, type TrendPeriod, type TrendRanking } from "@/lib/trendshift-types";

function count(value: number | null) {
  if (value === null) return "暂无数据";
  if (value >= 10_000) return `${(value / 10_000).toFixed(1).replace(/\.0$/, "")} 万`;
  return value.toLocaleString("zh-CN");
}

function RankingFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="trend-filter" aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent className="trend-filter-options">{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

export default function TrendshiftCenter() {
  const [period, setPeriod] = useState<TrendPeriod>("daily");
  const [data, setData] = useState<TrendRanking | null>(null);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("all");
  const [topic, setTopic] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/trendshift?period=${period}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<TrendRanking>; })
      .then(value => { if (value.period !== period || !Array.isArray(value.items)) throw new Error(); setData(value); })
      .catch(() => { if (!controller.signal.aborted) setError("榜单暂时无法加载，请稍后重试，或打开原站查看。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, refresh]);
  const current = data?.period === period ? data : null;
  const languages = useMemo(() => [...new Set(current?.items.map(item => item.language).filter(Boolean))].sort(), [current]);
  const topics = useMemo(() => [...new Map(current?.items.flatMap(item => item.topics).map(tag => [tag.slug, tag])).values()].sort((a, b) => a.label.localeCompare(b.label, "zh-CN")), [current]);
  const search = query.trim().toLocaleLowerCase();
  const items = current?.items.filter(item => (language === "all" || item.language === language) && (topic === "all" || item.topics.some(tag => tag.slug === topic)) && (!search || [item.name, item.description, item.language, ...item.topics.map(tag => tag.label)].join(" ").toLocaleLowerCase().includes(search))) || [];
  const filtered = !!query || language !== "all" || topic !== "all";
  function clearFilters() { setQuery(""); setLanguage("all"); setTopic("all"); }
  function reload() { setLoading(true); setError(""); setRefresh(value => value + 1); }
  function changePeriod(value: string) {
    if (value === period) return;
    setLoading(true); setError(""); setPeriod(value as TrendPeriod); clearFilters();
  }

  return <section className="trend-center" aria-labelledby="trend-title">
    <header className="trend-header">
      <div className="trend-heading"><span className="trend-brand-icon"><TrendingUp size={25} aria-hidden="true" /></span><div><h2 id="trend-title">开源趋势</h2><p>来自 Trendshift 的热门开源项目</p></div></div>
      <div className="trend-actions"><button type="button" onClick={reload} disabled={loading}><RefreshCw size={16} className={loading ? "trend-spinning" : ""} aria-hidden="true" />{loading ? "同步中" : "刷新榜单"}</button><a href={`https://trendshift.io/${trendPeriods[period].path}`} target="_blank" rel="noopener noreferrer">打开原站<span className="sr-only">（新页面）</span></a></div>
    </header>
    <Tabs value={period} onValueChange={changePeriod} className="trend-period-tabs">
      <div className="trend-period-row"><TabsList aria-label="榜单周期" className="trend-period-list">{Object.entries(trendPeriods).map(([value, item]) => <TabsTrigger key={value} value={value}>{item.label}</TabsTrigger>)}</TabsList><span className="trend-period-date">{current?.periodLabel || "正在获取榜单日期"}</span></div>
      <TabsContent value={period}>
        <div className="trend-filters">
          <label className="trend-search"><Search size={18} aria-hidden="true" /><input aria-label="搜索开源项目" placeholder="搜索项目名称、中文简介或主题" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery("")}><X size={16} /></button>}</label>
          <RankingFilter label="筛选编程语言" value={language} onChange={setLanguage} options={[{ value: "all", label: "全部语言" }, ...languages.map(value => ({ value, label: value }))]} />
          <RankingFilter label="筛选项目主题" value={topic} onChange={setTopic} options={[{ value: "all", label: "全部主题" }, ...topics.map(tag => ({ value: tag.slug, label: tag.label }))]} />
        </div>
        <div className="trend-summary" aria-live="polite"><span>{current ? `共 ${current.items.length} 个上榜项目${filtered ? ` · 找到 ${items.length} 个` : " · 按原站排名排列"}` : "正在加载开源榜单…"}</span>{filtered && <button type="button" onClick={clearFilters}>清除筛选</button>}</div>
        {error && <div className="trend-notice" role="alert">{error}</div>}
        {current?.stale && <div className="trend-notice" role="status">{current.notice}</div>}
        <ol className="trend-repositories" aria-label={`${trendPeriods[period].label}项目`} aria-busy={loading}>
          {items.map(item => <li className="trend-repository" key={item.id}>
            <span className={`trend-rank${item.rank <= 3 ? " trend-rank-top" : ""}`} aria-label={`排名第 ${item.rank}`}>{String(item.rank).padStart(2, "0")}</span>
            <article className="trend-repository-main">
              <div className="trend-repository-title"><a href={`https://github.com/${item.name}`} target="_blank" rel="noopener noreferrer"><span>{item.name.split("/")[0]} / </span><strong>{item.name.split("/")[1]}</strong><span className="sr-only">（在新页面打开项目）</span></a></div>
              <p className={item.translationPending ? "trend-description trend-description-pending" : "trend-description"}>{item.description}</p>
              <div className="trend-topics">{item.topics.map(tag => <button type="button" key={tag.slug} onClick={() => setTopic(tag.slug)} aria-pressed={topic === tag.slug}>{tag.label}</button>)}</div>
              <div className="trend-repository-meta"><span><Code2 size={14} aria-hidden="true" />{item.language || "未标注语言"}</span><span title={`累计收藏 ${item.stars?.toLocaleString("zh-CN") || "暂无数据"}`}><Star size={14} aria-hidden="true" />{count(item.stars)} 收藏</span><span><GitFork size={14} aria-hidden="true" />{count(item.forks)} 复刻</span><a href={`https://trendshift.io/repositories/${item.id}`} target="_blank" rel="noopener noreferrer">原站详情<span className="sr-only">（新页面）</span></a></div>
            </article>
            <div className="trend-gain"><span>{trendPeriods[period].gain}</span><strong>{item.starsGained === null ? "—" : `+${count(item.starsGained)}`}</strong><small>收藏</small></div>
          </li>)}
        </ol>
        {!current && loading && <div className="trend-empty"><RefreshCw className="trend-spinning" size={24} aria-hidden="true" /><p>正在获取并整理中文榜单…</p></div>}
        {current && !items.length && <div className="trend-empty"><Search size={28} aria-hidden="true" /><h3>没有找到匹配的项目</h3><p>试试其他关键词，或清除语言和主题筛选。</p><button type="button" onClick={clearFilters}>查看全部项目</button></div>}
        {!loading && !current && error && <div className="trend-empty"><button type="button" onClick={reload}>重新加载</button></div>}
      </TabsContent>
    </Tabs>
    <footer className="trend-footer"><span><GitBranch size={15} aria-hidden="true" />数据来源：Trendshift · 中文项目简介</span><span>{current ? `${current.stale ? "保存" : "同步"}时间：${new Date(current.capturedAt).toLocaleString("zh-CN", { timeZone: "Asia/Taipei", hour12: false })}（台北时间）` : "每次打开自动获取，数据缓存 5 分钟"}</span></footer>
  </section>;
}
