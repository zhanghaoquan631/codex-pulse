"use client";
import { useEffect, useState } from 'react';
import { Clock3, ExternalLink, Mail, RefreshCw } from 'lucide-react';
type Booking = { id: string; date: string; time: string; name: string; email: string; notes: string; notification: string; created: number };
const delivery: Record<string,string> = { pending:'已保存 · 通知尚未发送', sending:'已保存 · 正在核对通知', sent:'已保存 · 通知已发送', failed:'已保存 · 通知发送失败' };
export default function BookingCenter({ refreshToken = 0 }: { refreshToken?: number }) {
  const [records,setRecords] = useState<Booking[]>([]), [canManage,setCanManage] = useState(false), [error,setError] = useState(''), [refresh,setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try { const response = await fetch('/api/booking',{cache:'no-store',signal:controller.signal}); const data = await response.json() as {canManage:boolean;bookings?:Booking[];error?:string};
        if (!response.ok) throw new Error(data.error || '预约记录暂时无法读取。');
        setCanManage(data.canManage); setRecords(data.bookings || []); setError('');
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '读取失败'); }
    }
    void load();
    const onSaved = (event: MessageEvent) => { if (event.origin === window.location.origin && event.data?.type === 'pulse-booking-saved') void load(); };
    window.addEventListener('message',onSaved);
    return () => { controller.abort(); window.removeEventListener('message',onSaved); };
  },[refreshToken,refresh]);
  async function sendNotification(booking: Booking) {
    try {
      const response = await fetch('/api/booking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:booking.id,date:booking.date,time:booking.time,name:booking.name,email:booking.email,notes:booking.notes})});
      const data = await response.json() as {error?:string};
      if (!response.ok) throw new Error(data.error || '通知状态暂时无法确认。');
      setRefresh(n=>n+1);
    } catch(e) {setError(e instanceof Error ? e.message : '通知状态暂时无法确认。');}
  }
  return <section className="booking-center">
    <div className="intro"><div><p className="eyebrow">15 分钟 · 中国标准时间 UTC+8</p><h1>预约系统</h1><p className="intro-description">留出 15 分钟，把想法说清楚。</p></div><a className="library-button" href="/booking/index.html" target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>独立打开</a></div>
    <div className="booking-cloud-note"><Clock3 size={18}/><p>选择日期与时间，留下联系邮箱和想聊的内容。提交后预约会保存，邮件通知状态会单独显示。</p></div>
    <div className="booking-cloud-frame"><iframe title="Alex · 15 分钟预约" src="/booking/index.html?embed=1" allow="clipboard-write"/></div>
    {canManage ? <section className="panel booking-records"><div className="section-title"><h2>收到的预约</h2><button type="button" className="library-button" onClick={() => setRefresh(n=>n+1)}><RefreshCw size={15}/>刷新记录</button></div>
      {error && <p role="alert">{error}</p>}
      {!records.length && !error && <p className="booking-empty">还没有收到预约。</p>}
      <div className="booking-record-list">{records.map(booking => <article key={booking.id}><div><strong>{booking.date} {booking.time}</strong><span>{delivery[booking.notification] || delivery.sending}</span></div><p>{booking.name || '未填写称呼'} · <a href={`mailto:${booking.email}`}><Mail size={14}/>{booking.email}</a></p>{booking.notes && <p className="booking-record-notes">{booking.notes}</p>}<small>预约编号 {booking.id}</small>{['pending','sending'].includes(booking.notification) && <p><button className="library-button" onClick={()=>void sendNotification(booking)}>尝试发送通知</button></p>}</article>)}</div>
    </section> : <a className="booking-manager" href="/signin-with-chatgpt?return_to=%2F%23booking" target="_top">登录管理账号查看收到的预约</a>}
    {!canManage && error && <p role="alert">{error}</p>}
  </section>;
}
