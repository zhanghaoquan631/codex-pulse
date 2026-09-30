import { validMusicTrack, readOriginalMusicExtra, trackKey, type MusicTrack } from "@/lib/music-types";

export const goMusicOrigin = "https://music.zkkp.nyc.mn";
const basePath = "/music";
let goRetryAfter = 0;
let goUnavailableReason = "本站暂时无法读取原音乐站的曲库。原站能单独播放，并不代表已允许本站接入。";
function decodeAttribute(value: string) {
  return value.replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : parseInt(n, 10)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
async function boundedText(response: Response, limit = 1800000) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const parts: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error("音乐来源响应过长，请稍后重试。"); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return new TextDecoder().decode(bytes);
}
export async function searchMusic(query: string, provider: "original" | "netease" = "original", offset = 0) {
  if (provider === "original") {
    if (Date.now() < goRetryAfter) throw new Error(goUnavailableReason);
    try {
      const url = new URL(basePath + "/search", goMusicOrigin);
      // Omitting sources uses the original site's own configured search providers.
      url.search = new URLSearchParams({ q: query, type: "song" }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "error", headers: { Accept: "text/html" } });
      const html = await boundedText(response);
      if (/captcha|EdgeOne|验证您|确认您|__tst_status|EO-Bot/i.test(html)) throw new Error("原音乐站要求真人验证，当前无法读取它的歌曲。这里没有自动换用其他曲库。");
      else if (response.ok && /song-card|search-form|Go Music DL/.test(html)) {
        const tracks: MusicTrack[] = [];
        const seen = new Set<string>();
        for (const tag of html.matchAll(/<[^>]+class=["'][^"']*\bsong-card\b[^"']*["'][^>]*>/g)) {
          const attrs: Record<string, string> = {};
          for (const attr of tag[0].matchAll(/data-([\w-]+)=["']([^"']*)["']/g)) attrs[attr[1]] = decodeAttribute(attr[2]);
          if (!attrs.id || !attrs.source || !attrs.name) continue;
          let extra: Record<string, string>;
          try { extra = readOriginalMusicExtra(JSON.parse(attrs.extra || "{}")); }
          catch { throw new Error("原音乐站返回的歌曲资料格式无法读取。"); }
          const track: MusicTrack = { id: attrs.id, source: attrs.source, engine: "go-music-dl", name: attrs.name, artist: attrs.artist || "", album: attrs.album || "", cover: (attrs.cover || "").replace(/^http:/, "https:"), duration: Number(attrs.duration) || 0, extra, availability: "unknown" };
          if (!validMusicTrack(track) || seen.has(trackKey(track))) continue;
          seen.add(trackKey(track)); tracks.push(track);
          if (tracks.length === 1000) break;
        }
        return { tracks: tracks.slice(offset, offset + 30), total: tracks.length, nextOffset: offset + 30 < tracks.length ? offset + 30 : null, source: "go-music-dl", notice: "歌曲直接来自 music.zkkp.nyc.mn。" };
      }
      throw new Error("原音乐站没有返回可读取的曲库，请稍后重试。");
    } catch (cause) {
      goRetryAfter = Date.now() + 15000;
      goUnavailableReason = cause instanceof Error && cause.message.startsWith("原音乐站") ? cause.message : "本站暂时无法读取原音乐站的曲库。原站能单独播放，并不代表已允许本站接入。这里没有自动换用其他曲库。";
      throw new Error(goUnavailableReason);
    }
  }
  // Independent HTTP adapter for the official NetEase catalog used by Go Music DL.
  // No upstream application or crypto code is copied; no cookies or account credentials are supplied.
  const response = await fetch("https://music.163.com/api/cloudsearch/pc", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: "https://music.163.com/" },
    body: new URLSearchParams({ s: query, type: "1", offset: String(offset), limit: "30" }), signal: AbortSignal.timeout(12000),
  });
  let body;
  try { body = JSON.parse(await boundedText(response)); } catch { throw new Error("曲库暂时无法连接，请稍后再搜索。"); }
  if (!response.ok || body.code !== 200) throw new Error("曲库暂时无法连接，请稍后再搜索。");
  const tracks: MusicTrack[] = (Array.isArray(body.result?.songs) ? body.result.songs : [])
    .map((song: { id: number; name: string; ar?: { name: string }[]; al?: { name: string; picUrl: string }; dt: number; fee?: number; privilege?: { st?: number; pl?: number; fl?: number } }): MusicTrack => {
      const paid = song.fee === 1 || song.fee === 4;
      const rate = song.privilege?.pl ?? song.privilege?.fl;
      const restricted = paid || (song.privilege?.st ?? 0) < 0 || rate === 0;
      return {
        id: String(song.id), source: "netease", engine: "netease", name: song.name,
        artist: (song.ar || []).map(a => a.name).join(" / "), album: song.al?.name || "",
        cover: (song.al?.picUrl || "").replace(/^http:/, "https:"), duration: song.dt / 1000,
        availability: restricted ? "restricted" : rate && rate > 0 ? "available" : "unknown",
        unavailableReason: restricted ? paid ? "需网易云账号权限" : "该音源暂无公开播放权限" : undefined,
      };
    }).filter(validMusicTrack);
  const total = Number.isFinite(body.result?.songCount) ? Math.max(0, body.result.songCount) : offset + tracks.length;
  return { tracks, total, nextOffset: tracks.length && offset + 30 < total ? offset + 30 : null, source: "netease", notice: "网易云备用曲库；这不是原音乐站的搜索结果。" };
}
export async function resolveMusic(track: MusicTrack) {
  if (track.availability === "restricted") throw new Error(track.unavailableReason || "这首歌在该音源没有公开播放权限。");
  if (track.engine === "go-music-dl") {
    const parameters = new URLSearchParams({ id: track.id, source: track.source, name: track.name, artist: track.artist, extra: JSON.stringify(track.extra || {}) });
    // The original player plays this stream directly. Its optional inspect
    // request can fail independently; native audio reports actual load failure.
    return { url: goMusicOrigin + basePath + "/download?" + parameters + "&stream=1", source: "go-music-dl" };
  }
  if (!/^\d{1,18}$/.test(track.id)) throw new Error("歌曲编号无效。");
  const entry = await fetch("https://music.163.com/song/media/outer/url?id=" + track.id + ".mp3", { redirect: "manual", signal: AbortSignal.timeout(10000) });
  const location = entry.headers.get("Location");
  await entry.body?.cancel();
  if (!location || ![301, 302, 303, 307, 308].includes(entry.status)) throw new Error("这首歌暂时没有可用音源，请选择另一首。");
  const url = new URL(location);
  if (url.hostname !== "music.126.net" && !url.hostname.endsWith(".music.126.net")) throw new Error("这首歌目前无法完整播放，请选择另一首。");
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("音源地址无效。");
  url.protocol = "https:";
  return { url: url.href, source: "netease" };
}
