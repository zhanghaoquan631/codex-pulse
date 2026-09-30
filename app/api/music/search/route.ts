import { searchMusic } from "@/lib/music-source";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  const params = new URL(request.url).searchParams;
  const provider = params.get("provider") || "original";
  const offset = Number(params.get("offset") || 0);
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!query || query.length > 100) return Response.json({ error: "请输入 1–100 字的歌名或歌手。" }, { status: 400, headers });
  if (!["original", "netease"].includes(provider) || !Number.isInteger(offset) || offset < 0 || offset > 9900) return Response.json({ error: "搜索条件无效。" }, { status: 400, headers });
  try { return Response.json(await searchMusic(query, provider as "original" | "netease", offset), { headers }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "曲库暂时无法连接。" }, { status: 502, headers }); }
}
