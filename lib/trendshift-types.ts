export const trendPeriods = {
  daily: { label: "日榜", gain: "今日新增", path: "" },
  weekly: { label: "周榜", gain: "本周新增", path: "weekly" },
  monthly: { label: "月榜", gain: "本月新增", path: "monthly" },
  yearly: { label: "年榜", gain: "本年新增", path: "yearly" },
} as const;
export type TrendPeriod = keyof typeof trendPeriods;
export type TrendRepository = {
  id: number;
  name: string;
  rank: number;
  description: string;
  translationPending: boolean;
  language: string;
  stars: number | null;
  forks: number | null;
  starsGained: number | null;
  topics: { slug: string; label: string }[];
};
export type TrendRanking = {
  period: TrendPeriod;
  periodLabel: string;
  sourceUrl: string;
  capturedAt: string;
  stale: boolean;
  notice: string;
  items: TrendRepository[];
};
