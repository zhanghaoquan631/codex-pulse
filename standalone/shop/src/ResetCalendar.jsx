import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import './reset-calendar.css';

const dayKey = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year','month','day'].map((name) => parts.find((p) => p.type === name).value).join('-');
};
const eventDay = (event) => event.occurredOn || dayKey(event.schedule?.from || event.confirmedAt || event.createdAt);
const eventKind = (event) => event.status === 'announced' ? 'preview' : event.type === 'reset_credit' ? 'credit' : 'reset';
const labels = { preview: '预告', credit: '已发卡', reset: '已重置' };
const validLink = (url) => typeof url === 'string' && /^https:\/\/(?:x\.com|aihot\.news)\//.test(url);

export default function ResetCalendar() {
  const [feed, setFeed] = useState(null), [error, setError] = useState('');
  const [month, setMonth] = useState(''), [selected, setSelected] = useState('');
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState(''), [subscribeError, setSubscribeError] = useState('');
  const [mailEnabled, setMailEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/reset-calendar');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '暂时读不到日历');
        if (!active) return;
        setFeed(data); setError('');
        const days = data.events.map(eventDay).filter(Boolean).sort();
        const current = dayKey(data.checkedAt).slice(0,7);
        const initialMonth = days.some((day) => day.startsWith(current)) ? current : days.at(-1)?.slice(0,7) || current;
        setMonth((old) => old || initialMonth);
        setSelected((old) => old || days.filter((day) => day.startsWith(initialMonth)).at(-1) || `${initialMonth}-01`);
        setMailEnabled(Boolean(data.emailEnabled));
      } catch (e) { if (active) setError(e.message); }
    };
    refresh(); const interval = setInterval(refresh, 120000);
    return () => { active = false; clearInterval(interval); };
  }, []);
  const events = feed?.events || [];
  const grouped = new Map();
  for (const event of events) {
    const date = eventDay(event);
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(event);
  }
  const [year, monthNumber] = (month || dayKey(new Date().toISOString()).slice(0,7)).split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthly = [...grouped.entries()].filter(([day]) => day.startsWith(month));
  const resetCount = monthly.filter(([, list]) => list.some((event) => eventKind(event) === 'reset')).length;
  const creditCount = monthly.filter(([, list]) => list.some((event) => eventKind(event) === 'credit')).length;
  const selection = grouped.get(selected) || [];
  function changeMonth(delta) {
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    const key = next.toISOString().slice(0,7);
    setMonth(key); setSelected([...grouped.keys()].filter((day) => day.startsWith(key)).sort().at(-1) || `${key}-01`);
  }
  async function subscribe(e) {
    e.preventDefault(); setBusy(true); setSubscribeError('');
    try {
      const response = await fetch('/api/codex-reset-subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '暂时提交不了，请稍后再试');
      setResult(data.message || '确认邮件已发送，请点击邮件中的链接完成订阅。');
    } catch (e) { setSubscribeError(e.message); } finally { setBusy(false); }
  }
  return <>
    <section className="panel reset-card" aria-label="Codex 重置日历">
      {!feed ? <div className="reset-loading"><strong>{error || '正在读取重置日历'}</strong><p>{error ? '稍后自动再试' : '加载中…'}</p></div> : <div className="reset-layout">
        <div><div className="reset-month-row"><strong>{year} 年 {monthNumber} 月</strong><div><button className="icon-button" onClick={() => changeMonth(-1)} aria-label="上个月"><ChevronLeft size={16} /></button><button className="icon-button" onClick={() => changeMonth(1)} aria-label="下个月"><ChevronRight size={16} /></button></div></div>
          <p className="reset-summary">本月：{resetCount} 条全员重置 · {creditCount} 条发重置卡</p>
          <div className="reset-grid">{'一二三四五六日'.split('').map((day) => <span className="reset-weekday" key={day}>{day}</span>)}{Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2,'0')}`;
              const kinds = (grouped.get(date) || []).map(eventKind);
              const kind = ['reset','credit','preview'].find((value) => kinds.includes(value));
              return <button key={date} className={`reset-day ${kind || ''} ${selected === date ? 'selected' : ''}`} aria-label={`${monthNumber}月${i+1}日${kind ? ` ${labels[kind]}` : ''}`} aria-pressed={selected === date} onClick={() => setSelected(date)}><span>{i+1}</span>{kind && <small>{kind === 'reset' ? '全员' : kind === 'credit' ? '发卡' : '预告'}</small>}</button>;
            })}
          </div><div className="reset-legend"><span className="reset">全员重置</span><span className="credit">发重置卡</span><span className="preview">预告</span></div>
        </div>
        <div className="reset-records"><h3>{selected.replaceAll('-', ' / ')}</h3>{!selection.length && <p className="reset-no-record">这一天没有公开重置记录</p>}{selection.map((event) => <article className="reset-record" key={event.id}>
          <div className="reset-record-top"><span className="reset-avatar">T</span><strong>Tibo</strong><span className={`reset-status ${eventKind(event)}`}>{event.status === 'confirmed' ? '✓ ' : ''}{labels[eventKind(event)]}</span></div>
          <p className="reset-event-title">{event.title}</p>{(event.posts || []).map((post) => <div className="reset-post" key={`${post.id}-${post.stage}`}><small>{post.stage} · 中文译文</small><p>{post.text}</p>{validLink(post.url) && <a href={post.url} target="_blank" rel="noreferrer">查看原帖<ArrowUpRight size={12} /></a>}</div>)}
        </article>)}</div>
      </div>}
      <p className="reset-source">数据 <a href="https://aihot.news/codex-reset" target="_blank" rel="noreferrer">aihot.news</a> · 跟 Tibo 公开帖，非官方时刻表{(feed?.stale || (feed && error)) && <span> · 当前展示上次成功读取的数据</span>}</p>
    </section>
    <section className="panel reset-subscribe"><div><h2><Mail size={17} />重置时发邮件通知你</h2><p>预告和已重置都会发到邮箱，不用一直刷新日历</p></div>
      {result ? <div className="reset-subscribe-success" role="status"><CheckCircle2 size={19} /><span>{result}</span></div> : <form onSubmit={subscribe}><label className="admin-sr-only" htmlFor="reset-email">订阅通知邮箱</label><input id="reset-email" type="email" required autoComplete="email" placeholder="输入邮箱地址" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy || !mailEnabled} /><button className="button dark" disabled={busy || !mailEnabled}>{busy ? '提交中…' : '订阅通知'}</button></form>}
      {!mailEnabled && <p className="reset-subscribe-note">邮件通知服务配置中，暂未开放订阅。</p>}{subscribeError && <p className="form-error" role="alert">{subscribeError}</p>}
    </section>
  </>;
}
