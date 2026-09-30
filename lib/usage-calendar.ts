export const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** UTC calendar arithmetic; day strings already describe the collector's UTC+8 dates. */
export function usageCalendar(month: string, totals: Record<string, number>) {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + dayCount) / 7) * 7 }, (_, index) => {
    const date = index - offset + 1;
    if (date < 1 || date > dayCount) return null;
    const day = `${month}-${String(date).padStart(2, '0')}`;
    const value = totals[day] || 0;
    return value > 0 ? { day, date, value } : null;
  });
}

export function usageMonths(totals: Record<string, number>) {
  return [...new Set(Object.keys(totals).filter(day => totals[day] > 0).map(day => day.slice(0, 7)))].sort();
}
