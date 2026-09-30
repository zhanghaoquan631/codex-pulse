"use client";

import { useState } from 'react';
import { ArrowUpRight, Cloud, ExternalLink, PackageSearch, ShieldCheck, ShoppingBag, Store } from 'lucide-react';
import ShopPassword from './shop-password';

const shopOrigin = 'https://qq297063893-shop.wozhe0196.chatgpt.site';
const sections = [
  { id: 'storefront', title: '商品商城', description: '商品、收款码与下单', path: '/', icon: ShoppingBag },
  { id: 'orders', title: '订单查询', description: '查看订单与处理进度', path: '/user/index/query', icon: PackageSearch },
  { id: 'manage', title: '店铺管理', description: '商品、订单与店铺设置', path: '/manage', icon: Store },
] as const;

export default function ShopCenter({ refreshToken = 0 }: { refreshToken?: number }) {
  const [section, setSection] = useState<(typeof sections)[number]['id']>('storefront');
  const [loadedFrame, setLoadedFrame] = useState<string | null>(null);
  const frameKey = `${section}-${refreshToken}`;
  const loading = loadedFrame !== frameKey;
  const entry = sections.find(item => item.id === section)!;
  const url = shopOrigin + entry.path;

  return <section className="shop-center">
    <div className="intro"><div><p className="eyebrow">我的生意 · 在这里一起管理</p><h1>我的小店</h1><p className="intro-description">商品展示、订单查询与店铺管理，连接你正在使用的店铺。</p></div><a className="shop-open" href={url} target="_blank" rel="noopener noreferrer">独立打开<ExternalLink size={15}/></a></div>
    <ShopPassword/>
    <nav className="shop-sections" aria-label="小店功能">{sections.map(item => { const Icon = item.icon; return <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => setSection(item.id)}><span className="shop-section-icon"><Icon size={20}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowUpRight size={16}/></button>; })}</nav>
    <div className="shop-frame-heading"><span><Cloud size={15}/>云端店铺 · 手机电脑共享</span><span><ShieldCheck size={15}/>{section === 'manage' ? '使用原店铺密码登录管理' : '商品与订单沿用原店铺数据'}</span></div>
    <div className="shop-frame-wrap" aria-busy={loading}>
      <iframe key={frameKey} title={`我的小店 · ${entry.title}`} src={url} allow="clipboard-write" referrerPolicy="strict-origin-when-cross-origin" onLoad={() => setLoadedFrame(frameKey)}/>
      {loading && <div className="shop-loading" role="status"><ShoppingBag size={27}/><strong>正在打开{entry.title}…</strong><p>若浏览器未能显示，可在独立页面继续使用。</p><a href={url} target="_blank" rel="noopener noreferrer">独立打开<ArrowUpRight size={14}/></a></div>}
    </div>
    <p className="shop-footnote">店铺保存在云端，这台电脑关机后仍可访问。付款与订单操作请在店铺内核对后完成。</p>
  </section>;
}
