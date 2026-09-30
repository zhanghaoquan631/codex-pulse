import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Megaphone, Package, Search, SlidersHorizontal, X } from 'lucide-react';
import QRCode from 'qrcode';
import ResetCalendar from './ResetCalendar.jsx';
import BackupQQ from './BackupQQ.jsx';
import PurchaseNotice, { PURCHASE_NOTICE_REVISION } from './PurchaseNotice.jsx';
import './home.css';

export function ContactCode({ settings }) {
  const [generated, setGenerated] = useState('');
  const qq = /^\d{5,15}$/.test(settings.qq || '') ? settings.qq : '';
  const url = qq ? `https://wpa.qq.com/msgrd?v=3&uin=${qq}&site=qq&menu=yes` : '';
  useEffect(() => {
    let active = true;
    setGenerated('');
    if (url && !settings.contactQr) QRCode.toString(url, { type: 'svg', width: 220, margin: 2 }).then((svg) => {
      if (active) setGenerated(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    }).catch(() => {});
    return () => { active = false; };
  }, [url, settings.contactQr]);
  const src = settings.contactQr || generated;
  return src ? <a className="home-contact-code" href={url || src} target="_blank" rel="noreferrer"><img src={src} alt="QQ客服二维码" /></a> : null;
}
function telegramLink(value) {
  if (!value) return '';
  if (/^https:\/\/t\.me\/[\w/]+$/.test(value)) return value;
  return /^[\w@]+$/.test(value) ? `https://t.me/${value.replace(/^@/, '')}` : '';
}
export function Home({ products, settings, navigate, copyQQ }) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const drawer = useRef(null);
  const filtered = products.filter((p) => `${p.title} ${p.summary || ''}`.toLowerCase().includes(term.trim().toLowerCase()));
  const telegram = telegramLink(settings.telegram);
  useEffect(() => {
    if (filterOpen) drawer.current?.showModal(); else drawer.current?.close();
  }, [filterOpen]);
  const category = <button className="home-category active" type="button" onClick={() => { setFilterOpen(false); setSearch(''); setTerm(''); }}>
    <span className="home-category-icon"><Package size={19} /></span><span>Chat GPT</span><small>{products.length}</small>
  </button>;
  const openProduct = (event, id) => { event.preventDefault(); navigate(`/item/${encodeURIComponent(id)}`); };
  const stock = (p) => p.stock === 0 ? '售罄' : p.id === '4' ? '即将售罄' : p.stock === null ? '充足' : `${p.stock} 件`;
  return <main className="shell home-page">
    <div className="home-layout">
      <div className="home-sidebar">
        <section className="panel home-categories"><header className="home-heading"><span className="eyebrow">Categories</span><h2>商品分类</h2></header><div className="home-category-body">{category}</div></section>
        <aside className="panel home-contact-panel">
          <span className="home-fee-badge">0 手续费</span><h2>QQ下单</h2>
          <p className="home-contact-copy">在线支付有通道费<br />加我QQ，按原价成交</p>
          <ContactCode settings={settings} />
          <p className="home-contact-hint">扫码添加，说明要买的套餐即可</p>
          {telegram && <a className="button home-telegram" href={telegram} target="_blank" rel="noreferrer">Telegram</a>}
          <button type="button" className="button home-qq" onClick={copyQQ}><Copy size={16} />QQ：{settings.qq}</button>
          <BackupQQ number={settings.backupQq} />
        </aside>
      </div>
      <div className="home-catalog-stack">
        <section className="panel home-catalog">
          <header className="home-heading home-catalog-heading"><span className="eyebrow">Catalog</span><h1>Chat GPT</h1>
            <div className="home-tools"><button type="button" className="button home-filter" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={16} />筛选分类</button>
              <form className="home-search" onSubmit={(e) => { e.preventDefault(); setTerm(search); }}><label><Search size={16} /><input aria-label="搜索商品" type="search" placeholder="搜索商品关键词" value={search} onChange={(e) => setSearch(e.target.value)} /></label><button className="button dark" type="submit"><Search size={15} />搜索</button></form>
            </div>
          </header>
          <div className="home-catalog-body"><div className="home-table-wrap"><table className="home-products">
            <colgroup><col /><col className="home-price-col" /><col className="home-stock-col" /><col className="home-action-col" /></colgroup>
            <thead><tr><th>商品</th><th>价格</th><th>库存</th><th><span className="admin-sr-only">操作</span></th></tr></thead>
            <tbody>{filtered.map((p) => <tr key={p.id}><td><a className="home-product-link" href={`/item/${encodeURIComponent(p.id)}`} onClick={(e) => openProduct(e, p.id)}>
              {p.cover ? <img className="home-product-thumb" src={p.cover} alt="" /> : <span className="home-product-thumb"><Package /></span>}
              <span className="home-product-copy"><strong title={p.title}>{p.title}</strong><span className="home-product-tags"><span className="home-pill blue">自动发货</span><span className="home-pill mobile-meta price">¥{Number(p.price).toFixed(2)}</span><span className="home-pill mobile-meta">{stock(p)}</span></span></span>
            </a></td><td className="home-product-price">¥{Number(p.price).toFixed(2)}</td><td className="home-product-stock">{stock(p)}</td><td><a className={`home-buy ${p.stock === 0 ? 'sold-out' : ''}`} href={`/item/${encodeURIComponent(p.id)}`} onClick={(e) => openProduct(e, p.id)}>{p.stock === 0 ? '查看商品' : '购买'}<ArrowUpRight size={14} /></a></td></tr>)}
              {!filtered.length && <tr><td colSpan={4} className="home-empty">{term ? '没有找到相关商品，试试其他关键词。' : '暂无上架商品。'}</td></tr>}
            </tbody>
          </table></div></div>
        </section>
        <ResetCalendar />
      </div>
    </div>
    <dialog className="home-category-drawer" ref={drawer} onCancel={(e) => { e.preventDefault(); setFilterOpen(false); }} onClick={(e) => { if (e.target === e.currentTarget) setFilterOpen(false); }}><header className="home-heading"><span className="eyebrow">Categories</span><h2>商品分类</h2><button className="icon-button" aria-label="关闭分类" onClick={() => setFilterOpen(false)}><X /></button></header><div className="home-category-body">{category}</div></dialog>
  </main>;
}

export function announcementSignature(settings) {
  return JSON.stringify([settings.announcement, settings.qq, settings.backupQq, settings.telegram, settings.contactQr, PURCHASE_NOTICE_REVISION]);
}
export function Announcement({ settings, close, acknowledge, manual, purchase = false, copyQQ }) {
  const dialog = useRef(null);
  const lines = (settings.announcement || '欢迎光临，有问题请联系客服。').split('\n').filter(Boolean);
  const telegram = telegramLink(settings.telegram);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus?.(); };
  }, []);
  return <dialog ref={dialog} className={`home-notice ${manual ? 'manual' : ''}`} aria-labelledby="notice-title" onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <header className="home-notice-head"><span>Notice</span><h2 id="notice-title"><Megaphone size={19} />公告</h2></header>
    <div className="home-notice-body"><PurchaseNotice /><h3>{lines[0]}</h3><p>{lines.slice(1,3).map((line, i) => <span key={i}>{line}<br /></span>)}</p>
      {lines.length > 3 && <div className="home-notice-tip-box">{lines.slice(3).map((line, i) => <span key={i}>{line}<br /></span>)}</div>}
      {telegram && <p>有事直接戳我Telegram：<br /><a className="home-notice-telegram" href={telegram} target="_blank" rel="noreferrer">{telegram}</a></p>}
      <button className="home-notice-qq" onClick={copyQQ}>QQ：{settings.qq}</button>
      <BackupQQ number={settings.backupQq} />
      <section className="home-notice-contact"><h4>添加QQ客服下单 · 0手续费</h4><ContactCode settings={settings} /></section>
    </div>
    <footer className="home-notice-actions"><button className="button" onClick={close}>取消</button><button className="button dark" onClick={acknowledge}><Check size={16} />{purchase ? '我已阅读，继续购买' : '我已阅读'}</button></footer><p className="home-notice-foot">{purchase ? '请先阅读下单须知，再选择商品信息并下单。' : '首页公告确认后 1 小时内不再弹出；进入商品页时仍会提醒。'}</p>
  </dialog>;
}
