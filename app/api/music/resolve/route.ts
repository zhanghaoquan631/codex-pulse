import { resolveMusic } from "@/lib/music-source";
import { validMusicTrack } from "@/lib/music-types";
import { boundedJson } from "@/lib/website-api";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (request.headers.get("Origin") !== new URL(request.url).origin) return Response.json({ error: "请在本站播放歌曲。" }, { status: 403, headers });
  let body;
  try { body = await boundedJson(request, 12000); } catch { return Response.json({ error: "歌曲资料无效。" }, { status: 400, headers }); }
  if (!validMusicTrack(body?.track)) return Response.json({ error: "歌曲资料无效。" }, { status: 400, headers });
  try { return Response.json(await resolveMusic(body.track), { headers }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "音源暂时无法连接。" }, { status: 502, headers }); }
}
