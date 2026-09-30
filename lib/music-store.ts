import { database } from "@/db/raw";
import { isOwner, websiteId } from "@/lib/website-api";
import { validMusicTrack, trackKey, type MusicSavedState, type MusicHistoryEntry } from "@/lib/music-types";

export async function musicScope(request: Request, create = false) {
  if (isOwner(request)) return { scope: await websiteId("pulse-music-owner:" + request.headers.get("oai-authenticated-user-email")!.toLowerCase()), cookie: null, account: true };
  const secure = new URL(request.url).protocol === "https:";
  const cookieName = secure ? "__Host-pulse-music" : "pulse_music_local";
  const candidate = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  const valid = candidate && /^[a-f\d]{64}$/.test(candidate);
  if (!valid && !create) return null;
  const token = valid ? candidate : Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  return { scope: await websiteId("pulse-music-device:" + token), account: false,
    cookie: valid ? null : `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure ? "; Secure" : ""}` };
}
export function musicReply(body: unknown, status = 200, cookie: string | null = null) {
  const headers = new Headers({ "Cache-Control": "no-store, private", Vary: "Cookie, Authorization, OAI-Authenticated-User-Email", "X-Content-Type-Options": "nosniff" });
  if (cookie) headers.set("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}
export function validSavedState(value: unknown): value is MusicSavedState {
  if (!value || typeof value !== "object") return false;
  const v = value as MusicSavedState;
  return (v.track === null || validMusicTrack(v.track)) && Number.isFinite(v.position) && v.position >= 0 && v.position <= 86400
    && Number.isFinite(v.duration) && v.duration >= 0 && v.duration <= 86400
    && Number.isFinite(v.volume) && v.volume >= 0 && v.volume <= 1
    && Number.isSafeInteger(v.updatedAt) && v.updatedAt>=0;
}
export async function musicRevision(scope:string) {
  const db=database(),revision=crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO music_listeners(scope,payload,updated_at,play_id,sequence,started_at,revision) VALUES(?,'null',0,'',0,0,?) ON CONFLICT(scope) DO NOTHING").bind(scope,revision),
    db.prepare("UPDATE music_listeners SET revision=? WHERE scope=? AND revision=''").bind(revision,scope),
  ]);
  const row=await db.prepare("SELECT revision FROM music_listeners WHERE scope=?").bind(scope).first<{revision:string}>();
  if(!row)throw new Error("Music history identity is unavailable");
  return row.revision;
}
export async function readMusic(scope: string) {
  const db = database();
  const revision=await musicRevision(scope);
  const [saved, entries] = await Promise.all([
    db.prepare("SELECT payload FROM music_listeners WHERE scope=?").bind(scope).first<{ payload: string }>(),
    db.prepare("SELECT payload FROM music_history WHERE scope=? ORDER BY last_played_at DESC LIMIT 80").bind(scope).all<{ payload: string }>(),
  ]);
  return { revision, state: saved ? JSON.parse(saved.payload) as MusicSavedState : null, history: entries.results.map(e => JSON.parse(e.payload) as MusicHistoryEntry) };
}
export async function saveMusic(scope: string, state: MusicSavedState, playId: string, sequence: number, start: boolean) {
  const db = database(), key = state.track ? trackKey(state.track) : null;
  state = { ...state, updatedAt: Date.now() };
  const statements = start ? [
    db.prepare(`INSERT INTO music_plays(scope,play_id,started_at)
      SELECT ?,?,MAX(?,COALESCE((SELECT updated_at FROM music_listeners WHERE scope=?),0)+1,COALESCE((SELECT started_at FROM music_listeners WHERE scope=?),0)+1)
      ON CONFLICT(scope,play_id) DO NOTHING`).bind(scope, playId, state.updatedAt, scope,scope),
    db.prepare(`INSERT INTO music_listeners(scope,payload,updated_at,play_id,sequence,started_at)
      SELECT ?,?,?,?,?,started_at FROM music_plays WHERE scope=? AND play_id=?
      ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,play_id=excluded.play_id,sequence=excluded.sequence,started_at=excluded.started_at
      WHERE excluded.play_id=music_listeners.play_id AND excluded.sequence>music_listeners.sequence
        OR excluded.play_id!=music_listeners.play_id AND excluded.started_at>music_listeners.started_at`).bind(scope, JSON.stringify(state), state.updatedAt, playId, sequence, scope, playId)]
    : [db.prepare(`UPDATE music_listeners SET payload=?,updated_at=?,sequence=? WHERE scope=? AND play_id=? AND sequence<?`).bind(JSON.stringify(state), state.updatedAt, sequence, scope, playId, sequence)];
  if (state.track && key) {
    const entry: MusicHistoryEntry = { track: state.track, position: state.position, duration: state.duration, lastPlayedAt: state.updatedAt };
    statements.push(db.prepare(`INSERT INTO music_history(scope,track_key,payload,last_played_at)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM music_listeners WHERE scope=? AND play_id=? AND sequence=?)
      ON CONFLICT(scope,track_key) DO UPDATE SET payload=excluded.payload,last_played_at=excluded.last_played_at
      WHERE excluded.last_played_at>music_history.last_played_at`).bind(scope, key, JSON.stringify(entry), state.updatedAt, scope, playId, sequence));
    statements.push(db.prepare(`DELETE FROM music_history WHERE scope=? AND track_key NOT IN
      (SELECT track_key FROM music_history WHERE scope=? ORDER BY last_played_at DESC LIMIT 80)`).bind(scope, scope));
  }
  await db.batch(statements);
  const accepted = await db.prepare("SELECT play_id,sequence FROM music_listeners WHERE scope=?").bind(scope).first<{play_id:string;sequence:number}>();
  if(start)await db.prepare("DELETE FROM music_plays WHERE scope=? AND started_at<? AND play_id<>?").bind(scope,Date.now()-7*86400000,playId).run();
  return accepted?.play_id===playId && accepted.sequence>=sequence;
}
