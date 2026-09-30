/** One 亿 is exactly 100,000,000 tokens. Small values keep enough precision to stay nonzero. */
export function tokenYi(value: number) {
  const amount = value / 100_000_000;
  const magnitude = Math.abs(amount);
  const digits = magnitude >= 1 ? 2 : magnitude >= 0.01 ? 4 : 8;
  return amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

export const exactTokens = (value: number) => Math.round(value).toLocaleString("zh-CN");
