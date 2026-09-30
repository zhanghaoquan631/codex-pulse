"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ExternalLink, RefreshCw, Settings2, ShieldCheck, Smartphone } from "lucide-react";

const bookshelfOrigin = "https://my-bookshelf-f8k2.wozhe0196.chatgpt.site";
const sections = [
  { id: "browse", label: "浏览书架", path: "/", icon: BookOpen },
  { id: "manage", label: "后台管理", path: "/admin", icon: Settings2 },
  { id: "upload", label: "手机上传", path: "/admin?add=1", icon: Smartphone },
] as const;

export default function BookshelfCenter({ refreshToken = 0 }: { refreshToken?: number }) {
  const [section, setSection] = useState<(typeof sections)[number]["id"]>("browse");
  const [reload, setReload] = useState(0);
  const [readyFrame, setReadyFrame] = useState<string | null>(null);
  const [waitingFrame, setWaitingFrame] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const frameKey = `${section}-${reload}-${refreshToken}`;
  const ready = readyFrame === frameKey;
  const entry = sections.find(item => item.id === section)!;
  const url = bookshelfOrigin + entry.path;

  useEffect(() => {
    if (readyFrame === frameKey) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== bookshelfOrigin || event.source !== frame.current?.contentWindow || event.data?.type !== "bookshelf:ready" || event.data?.requestId !== frameKey) return;
      setReadyFrame(frameKey);
    };
    const ping = () => frame.current?.contentWindow?.postMessage({ type: "pulse:bookshelf:ping", requestId: frameKey }, bookshelfOrigin);
    window.addEventListener("message", receive);
    const interval = window.setInterval(ping, 1000);
    const timeout = window.setTimeout(() => setWaitingFrame(frameKey), 12000);
    ping();
    return () => { window.removeEventListener("message", receive); window.clearInterval(interval); window.clearTimeout(timeout); };
  }, [frameKey, readyFrame]);

  return <section className="bookshelf-center" aria-labelledby="bookshelf-title">
    <div className="bookshelf-heading"><div><h1 id="bookshelf-title">我的书架</h1><p>收藏、分类和对应电子版，手机电脑一起管理。</p></div><a href={url} target="_blank" rel="noopener noreferrer">独立打开<ExternalLink size={16} aria-hidden="true"/><span className="sr-only">（新页面）</span></a></div>
    <div className="bookshelf-toolbar">
      <nav className="bookshelf-sections" aria-label="书架功能">{sections.map(item => { const Icon = item.icon; return <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => setSection(item.id)}><Icon size={17} aria-hidden="true"/>{item.label}</button>; })}</nav>
      <button className="bookshelf-reload" type="button" onClick={() => setReload(value => value + 1)}><RefreshCw size={16} aria-hidden="true"/>重新加载</button>
    </div>
    <div className="bookshelf-access"><ShieldCheck size={16} aria-hidden="true"/><p>首次使用请<a href={url} target="_blank" rel="noopener noreferrer">独立打开并登录</a>同一个 ChatGPT 账号，再回到这里重新加载。后台使用原书架管理员密码。</p></div>
    <div className="bookshelf-frame" aria-busy={!ready}>
      <iframe key={frameKey} ref={frame} title={`我的书架 · ${entry.label}`} src={url} allow="clipboard-write" referrerPolicy="strict-origin-when-cross-origin"/>
      {!ready && <div className="bookshelf-loading" role="status"><BookOpen size={28} aria-hidden="true"/><strong>{waitingFrame === frameKey ? "书架尚未打开" : `正在打开${entry.label}…`}</strong><p>若尚未登录，请先在独立页面登录，再点击「重新加载」。</p><div><a href={url} target="_blank" rel="noopener noreferrer">打开书架登录</a><button type="button" onClick={() => setReload(value => value + 1)}>重新加载</button></div></div>}
    </div>
    <p className="bookshelf-footnote">手机可上传 PDF、EPUB、TXT，单个最大 50 MB。上传文件和私人笔记仅在管理员登录后开放。</p>
  </section>;
}
