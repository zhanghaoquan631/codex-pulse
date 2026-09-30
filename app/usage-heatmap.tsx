import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usageCalendar, usageMonths, weekdays } from '@/lib/usage-calendar';
import { exactTokens, tokenYi } from '@/lib/token-format';

export default function UsageHeatmap({ totals, accountName, today }: { totals: Record<string, number>; accountName: string; today: string }) {
  const [selected, setSelected] = useState('');
  const months = usageMonths(totals);
  const month = months.includes(selected) ? selected : months.at(-1) || today.slice(0, 7);
  const index = months.indexOf(month);
  const cells = usageCalendar(month, totals);
  const peak = Math.max(1, ...cells.map(cell => cell?.value || 0));
  const activeDays = cells.filter(Boolean).length;
  return <section className="usage-heatmap panel">
    <div className="section-title"><div><h2>每日使用热力图</h2><p className="section-description">{accountName} · 全部历史可按月查看</p></div></div>
    <div className="heatmap-month-control">
      <button aria-label="查看上一个有记录的月份" disabled={index <= 0} onClick={() => setSelected(months[index - 1])}><ChevronLeft size={16}/></button>
      <select aria-label="热力图月份" value={month} disabled={!months.length} onChange={event => setSelected(event.target.value)}>{(months.length ? months : [month]).map(value => <option value={value} key={value}>{value.slice(0, 4)} 年 {Number(value.slice(5))} 月</option>)}</select>
      <button aria-label="查看下一个有记录的月份" disabled={index < 0 || index >= months.length - 1} onClick={() => setSelected(months[index + 1])}><ChevronRight size={16}/></button>
    </div>
    <div className="heatmap-weekdays">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
    <div className="heatmap-cells">{cells.map((cell, index) => cell ? <div className="heatmap-cell" key={cell.day} tabIndex={0} data-level={Math.min(4, Math.max(1, Math.ceil(cell.value / peak * 4)))} title={`${cell.day}：${tokenYi(cell.value)} 亿 / ${exactTokens(cell.value)} Token`} aria-label={`${cell.day}，${exactTokens(cell.value)} Token`}><span>{cell.date}</span></div> : <div key={`blank-${index}`} className="heatmap-cell heatmap-blank" aria-hidden="true"/>)}</div>
    <div className="heatmap-legend"><span>少</span>{[1, 2, 3, 4].map(level => <i key={level} data-level={level}/>)}<span>多</span><small>有使用的日期才显示数字</small></div>
    <p className="heatmap-history-note">{activeDays ? `本月 ${activeDays} 天有使用记录，悬停查看精确用量。` : '本月暂无使用记录。'} 历史记录持续保留。</p>
  </section>;
}
