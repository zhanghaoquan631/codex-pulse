import { boundedJson } from "@/lib/website-api";
import { musicScope, musicReply, readMusic, saveMusic, validSavedState, musicRevision } from "@/lib/music-store";

export async function GET(request: Request) {
  const identity = await musicScope(request);
  if (!identity) return musicReply({ needsInitialization: true, state: null, history: [], account: false });
  try { return musicReply({ ...await readMusic(identity.scope), account: identity.account }, 200, identity.cookie); }
  catch { return musicReply({ error: "播放记录暂时无法读取，请稍后重试。" }, 503, identity.cookie); }
}
export async function POST(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return musicReply({ error: "请从本站保存播放进度。" }, 403);
  let body;
  try { body = await boundedJson(request, 16000); } catch { return musicReply({ error: "播放进度格式无效。" }, 400); }
  if (body?.action === "bootstrap") {
    const identity = (await musicScope(request, true))!;
    try { return musicReply({ ...await readMusic(identity.scope), account: identity.account }, 200, identity.cookie); }
    catch { return musicReply({ error: "播放记录暂时无法读取，请稍后重试。" }, 503, identity.cookie); }
  }
  if (!body || !validSavedState(body.state) || typeof body.revision!=="string" || !/^[a-f\d-]{36}$/.test(body.revision) || typeof body.playId !== "string" || !/^[a-f\d-]{36}$/.test(body.playId) || !Number.isSafeInteger(body.sequence) || body.sequence < 1 || body.sequence > 10000000 || typeof body.start !== "boolean") return musicReply({ error: "播放进度格式无效。" }, 400);
  const identity = await musicScope(request);
  if (!identity) return musicReply({ error: "播放记录需要重新连接，请刷新页面。" }, 409);
  try { if(await musicRevision(identity.scope)!==body.revision)return musicReply({scopeChanged:true,error:"登录状态已变化，正在重新读取私人记录。"},409); const accepted=await saveMusic(identity.scope, body.state, body.playId, body.sequence, body.start); return musicReply(accepted ? { ok: true } : { error: "另一页面已开始播放，当前进度未覆盖新记录。" }, accepted ? 200 : 409, identity.cookie); }
  catch { return musicReply({ error: "播放进度尚未同步，连接恢复后会再保存。" }, 503, identity.cookie); }
}
