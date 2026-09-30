export type MusicTrack = {
  id: string;
  source: string;
  engine: "go-music-dl" | "netease";
  name: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  availability?: "available" | "restricted" | "unknown";
  unavailableReason?: string;
  extra?: Record<string, string>;
};
export type MusicHistoryEntry = {
  track: MusicTrack;
  position: number;
  duration: number;
  lastPlayedAt: number;
};
export type MusicSavedState = {
  track: MusicTrack | null;
  position: number;
  duration: number;
  volume: number;
  updatedAt: number;
};
export const trackKey = (track: MusicTrack) => `${track.source}:${track.id}`;
// Playback identity fields read by the original site's music-lib resolvers.
// Media URLs and account credentials are resolved on the original server.
const originalExtraKeys = new Set([
  "song_id", "netease_level", "level", "songmid", "mid", "media_mid", "hash",
  "sq_hash", "hq_hash", "res_hash", "ogg_320_hash", "file_hash", "ogg_128_hash",
  "album_audio_id", "audio_id", "album_id", "privilege", "rid", "copyright_id",
  "content_id", "resource_type", "format_type", "track_id", "quality", "bvid",
  "cid", "songid", "songtype", "tsid",
]);
export function validMusicExtra(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 32
    && entries.every(([key, item]) => originalExtraKeys.has(key) && typeof item === "string" && item.length <= 2000 && !/[\u0000-\u001f\u007f]/.test(item))
    && new TextEncoder().encode(JSON.stringify(value)).byteLength <= 4096;
}
export function readOriginalMusicExtra(value: unknown): Record<string, string> {
  // Go's JSON encoder represents a nil map as null.
  if (value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("原音乐站返回的歌曲资料格式无法读取。");
  const extra = Object.fromEntries(Object.entries(value).filter(([key]) => originalExtraKeys.has(key)));
  if (!validMusicExtra(extra)) throw new Error("原音乐站返回的歌曲资料格式无法读取。");
  return extra;
}
export function musicTime(value: number) {
  const seconds = Math.floor(Number.isFinite(value) ? Math.max(0, value) : 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function validMusicTrack(value: unknown): value is MusicTrack {
  if (!value || typeof value !== "object") return false;
  const t = value as MusicTrack;
  return typeof t.id === "string" && t.id.length > 0 && t.id.length <= 512 && !/[\u0000-\u001f\u007f]/.test(t.id)
    && typeof t.source === "string" && /^[a-z\d_-]{1,32}$/.test(t.source)
    && (t.engine === "netease" && t.source === "netease" && /^\d{1,18}$/.test(t.id) || t.engine === "go-music-dl")
    && typeof t.name === "string" && t.name.length > 0 && t.name.length <= 300
    && typeof t.artist === "string" && t.artist.length <= 500
    && typeof t.album === "string" && t.album.length <= 500
    && typeof t.cover === "string" && t.cover.length <= 1000
    && (!t.cover || /^https:\/\//.test(t.cover))
    && Number.isFinite(t.duration) && t.duration >= 0 && t.duration <= 86400
    && (!t.availability || ["available", "restricted", "unknown"].includes(t.availability))
    && (!t.unavailableReason || typeof t.unavailableReason === "string" && t.unavailableReason.length <= 160)
    && (t.extra === undefined || validMusicExtra(t.extra));
}
