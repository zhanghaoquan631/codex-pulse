"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, BookOpen, ChevronRight, Clock3, ExternalLink, FolderHeart, Globe, Home, Link2, LockKeyhole, Monitor, Play, RefreshCw, Settings2, Sparkles, WifiOff } from "lucide-react";

type BridgeStatus = { canManage: boolean; connected: boolean; lastSeen: string | null; label: string };
const modules = [
  { id: "overview", group: "活动记录", label: "总览", description: "今天发生的事，一眼回顾。", path: "x-local-capture-v7/index.html#overview", icon: Home },
  { id: "timeline", group: "活动记录", label: "全局时间轴", description: "把阅读、观看与收藏，放回同一条时间线。", path: "x-local-capture-v7/global-timeline.html", icon: Clock3 },
  { id: "x", group: "活动记录", label: "X 行为", description: "查找在 X 上留下的浏览与互动记录。", path: "x-local-capture-v7/index.html#timeline", icon: Activity },
  { id: "watch", group: "活动记录", label: "观看记录", description: "找回看过的内容，接着上次的进度。", path: "x-local-capture-v7/watch.html", icon: Play },
  { id: "links", group: "资料与研究", label: "X 链接收集", description: "为有价值的链接留下标签与用途。", path: "x-link-archive-v1/index.html", icon: Link2 },
  { id: "resources", group: "资料与研究", label: "网页 · 文章 · 代码", description: "保存资源，整理每一份值得再看的资料。", path: "x-local-capture-v7/resources.html", icon: Globe },
  { id: "reading", group: "资料与研究", label: "阅读与研究", description: "继续未读完的内容，记录阅读进度。", path: "x-local-capture-v7/reading.html", icon: BookOpen },
  { id: "library", group: "资料与研究", label: "私人资料库", description: "用收藏夹与标签，整理你的长期积累。", path: "x-local-capture-v7/index.html#special", icon: FolderHeart },
  { id: "interest", group: "偏好与设置", label: "兴趣档案", description: "从真实记录中，回顾自己的关注与兴趣。", path: "x-local-capture-v7/index.html#interest", icon: Sparkles },
  { id: "settings", group: "偏好与设置", label: "隐私设置", description: "管理记录范围、导出与本机历史。", path: "x-local-capture-v7/index.html#settings", icon: Settings2 },
] as const;
const groups = ["活动记录", "资料与研究", "偏好与设置"];
const localRoot = "http://127.0.0.1:5174/";
const date = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Taipei", hour12: false });
function embeddedPath(path: string) {
  const [page, hash] = path.split("#");
  return `/mezip/${page}?pulse=1${hash ? `#${hash}` : ""}`;
}

export default function ActivityCenter({ refreshToken = 0 }: { refreshToken?: number }) {
  const [selected, setSelected] = useState<string>("timeline");
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [frameVersion, setFrameVersion] = useState(0);
  const [frameStarted, setFrameStarted] = useState(false);
  const [frameLoading, setFrameLoading] = useState(true);
  const wasConnected = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const current = modules.find(module => module.id === selected) || modules[1];

  useEffect(() => {
    let active = true, pending = false;
    const controller = new AbortController();
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/mezip/status", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
        if (response.status === 401 || response.status === 403) {
          if (active) {
            setStatus({ canManage: false, connected: false, lastSeen: null, label: "这台电脑上的 ME.zip" });
            setFrameStarted(false);
            setError("");
            wasConnected.current = false;
          }
          return;
        }
        if (!response.ok) throw new Error("暂时无法确认电脑连接，正在自动重试。");
        const value = await response.json() as BridgeStatus;
        if (!active) return;
        setStatus(value);
        setError("");
        if (!value.canManage) {
          setFrameStarted(false);
          wasConnected.current = false;
          return;
        }
        if (value.connected) {
          if (!wasConnected.current) {
            setFrameLoading(true);
            setFrameVersion(version => version + 1);
          }
          setFrameStarted(true);
        }
        wasConnected.current = value.connected;
      } catch {
        if (active) {
          setError("暂时无法确认电脑连接，正在自动重试。");
          wasConnected.current = false;
        }
      } finally {
        pending = false;
      }
    }
    load();
    const timer = setInterval(load, 10000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [refresh, refreshToken]);

  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "mezip:pulse-ready") setFrameLoading(false);
    };
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, []);

  const online = !!status?.canManage && status.connected && !error;
  const connectionLabel = !status && !error ? "正在连接" : error ? "正在重连" : !status?.canManage ? "私人空间" : online ? "电脑已连接" : "电脑暂时离线";
  function choose(id: string) { if (id !== selected) { setSelected(id); setFrameLoading(true); } }

  return <section className="activity-center">
    <div className="intro activity-intro">
      <div><p className="eyebrow">我的活动记录</p><h1>ME.zip <span>活动空间</span></h1><p className="activity-subtitle">连接这台电脑，继续查看与整理你的真实记录。</p></div>
      <span className="activity-private"><LockKeyhole size={14}/>仅本人可访问</span>
    </div>
    <div className={`activity-connection ${online ? "is-online" : ""}`} role="status">
      <div className="activity-connection-name"><span className="activity-status-dot"/><strong>{connectionLabel}</strong><span>{status?.canManage ? status.label || "这台电脑上的 ME.zip" : "ME.zip 本机服务"}</span></div>
      <div className="activity-connection-detail">{status?.canManage && status.lastSeen && <time dateTime={status.lastSeen}>最近连接 {date(status.lastSeen)}</time>}<button type="button" className="activity-icon-button" aria-label="重新检查 ME.zip 连接" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15}/></button></div>
    </div>
    {!status && !error ? <div className="activity-gate" role="status"><Monitor size={30}/><h2>正在连接你的活动空间</h2><p>正在确认访问权限与本机服务状态…</p></div> : !status && error ? <div className="activity-gate" role="alert"><WifiOff size={30}/><h2>连接暂时中断</h2><p>{error}</p><button className="library-button" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15}/>立即重试</button></div> : !status?.canManage ? <div className="activity-gate">
      <span className="activity-gate-symbol"><LockKeyhole size={27}/></span><p className="eyebrow">你的私人空间</p><h2>你的活动记录，只有你能打开。</h2><p>登录这个网站的管理账号后，即可连接这台电脑上的 ME.zip，查看时间轴、阅读进度与私人资料库。</p><a className="library-button primary" href="/signin-with-chatgpt?return_to=%2F%23activity" target="_top">登录并打开<ArrowUpRight size={16}/></a>
    </div> : <>
      <div className="activity-workspace">
        <nav className="activity-module-nav" aria-label="ME.zip 模块">
          {groups.map(group => <div className="activity-module-group" key={group}><p>{group}</p><div>{modules.filter(module => module.group === group).map(module => { const Icon = module.icon; return <button key={module.id} type="button" aria-current={selected === module.id ? "page" : undefined} className={selected === module.id ? "selected" : ""} onClick={() => choose(module.id)}><Icon size={17}/><span>{module.label}</span><ChevronRight size={13} className="activity-nav-chevron"/></button>; })}</div></div>)}
          <div className="activity-nav-note"><Monitor size={17}/><span>电脑开机联网后<br/>会自动恢复连接</span></div>
        </nav>
        <div className="activity-canvas">
          <div className="activity-canvas-header"><div><p>{current.group}</p><h2>{current.label}</h2><span>{current.description}</span></div><a className="activity-open-link" href={`/mezip/${current.path}`} target="_blank" rel="noopener noreferrer" aria-label={`在新页面打开${current.label}`} title="在新页面打开"><ExternalLink size={17}/></a></div>
          <div className="activity-frame-wrap" aria-busy={online && frameLoading}>
            {frameStarted && <iframe ref={frame} key={`${selected}-${frameVersion}`} src={embeddedPath(current.path)} title={`ME.zip · ${current.label}`} loading="lazy" allow="clipboard-write" referrerPolicy="same-origin" onLoad={() => setFrameLoading(false)} className={online ? "" : "activity-frame-unavailable"} tabIndex={online ? 0 : -1}/>}
            {online && frameLoading && <div className="activity-frame-loading" role="status"><RefreshCw size={20}/><span>正在读取{current.label}…</span></div>}
            {!online && <div className="activity-offline" role="status"><WifiOff size={30}/><h3>{error ? "正在重新连接电脑" : "等待这台电脑上线"}</h3><p>{error || "电脑开机并连接网络后，这里会自动恢复。无需重新填写地址或配对。"}</p>{status.lastSeen && <small>最近连接：{date(status.lastSeen)}</small>}<button className="library-button" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15}/>检查连接</button></div>}
          </div>
        </div>
      </div>
      <div className="activity-footnote"><p><LockKeyhole size={14}/>这些活动记录仅本人可访问。电脑离线时暂停操作，连接恢复后自动更新。</p><a href={`${localRoot}${current.path}`} target="_blank" rel="noopener noreferrer">在原电脑打开<ArrowUpRight size={14}/></a></div>
    </>}
  </section>;
}
