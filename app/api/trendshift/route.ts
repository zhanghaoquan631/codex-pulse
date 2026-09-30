import { getTrendRanking } from "@/lib/trendshift";
import { trendPeriods, type TrendPeriod } from "@/lib/trendshift-types";

export async function GET(request: Request) {
  const period = new URL(request.url).searchParams.get("period") || "daily";
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!Object.hasOwn(trendPeriods, period)) return Response.json({ error: "请选择日榜、周榜、月榜或年榜。" }, { status: 400, headers });
  return Response.json(await getTrendRanking(period as TrendPeriod), { headers });
}
