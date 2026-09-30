"use client";
import { useEffect, useState } from 'react';
import { ArrowUpRight, ExternalLink, LockKeyhole, RefreshCw, WifiOff } from 'lucide-react';

const applications = {
  finance: { title: '票据收件箱', subtitle: '凭证、账单与商家分析，在同一个工作空间整理。', entry: 'finance-receipt-inbox-v12/index.html#inbox', label: '财务记录' },
  github: { title: 'GitHub 工作台', subtitle: '查看仓库、代码片段、任务与真实开发活动。', entry: 'github-workspace-v6/index.html#overview', label: '开发工作' },
  media: { title: '录制与截图库', subtitle: '录制屏幕、捕捉画面，整理这台电脑保存的素材。', entry: 'emotion-action-v1/index.html#emotion-library', label: '影像素材' },
};
type Status = { canManage: boolean; connected: boolean; apps: Record<string, boolean>; lastSeen?: string };
export default function LocalAppCenter({ application, refreshToken = 0 }: { application: keyof typeof applications; refreshToken?: number }) {
  const app = applications[application];
  const [status, setStatus] = useState<Status | null>(null);
  const [started, setStarted] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    async function check() {
      if (pending) return; pending = true;
      try {
        const response = await fetch('/api/local-apps/status', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok && response.status !== 403) throw new Error('Offline');
        const value = await response.json() as Status;
        if (controller.signal.aborted) return;
        setStatus(value); setFailed(false);
        if (!value.canManage) setStarted(false);
        else if (value.connected && value.apps[application]) setStarted(true);
      } catch { if (!controller.signal.aborted) setFailed(true); }
      finally { pending = false; }
    }
    check(); const timer = setInterval(check, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [application, refresh, refreshToken]);
  const online = !!status?.canManage && status.connected && status.apps[application] && !failed;
  const [entry, hash] = app.entry.split('#');
  return <section className="local-app-center">
    <div className="intro"><div><p className="eyebrow">我的本机应用 · {app.label}</p><h1>{app.title}</h1><p className="intro-description">{app.subtitle}</p></div><span className="activity-private"><LockKeyhole size={14}/>仅本人可访问</span></div>
    <div className={`activity-connection ${online ? 'is-online' : ''}`} role="status"><div className="activity-connection-name"><span className="activity-status-dot"/><strong>{online ? '电脑已连接' : !status && !failed ? '正在连接' : status?.canManage ? '正在重新连接' : '私人应用'}</strong><span>开机联网后自动恢复连接</span></div><div className="activity-connection-detail"><button className="activity-icon-button" aria-label={`刷新${app.title}连接`} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={15}/></button>{status?.canManage && <a className="activity-open-link" href={'/local-apps/' + app.entry} target="_blank" rel="noopener" aria-label={`在新页面展开${app.title}`}><ExternalLink size={16}/></a>}</div></div>
    {status && !status.canManage ? <div className="activity-gate"><LockKeyhole size={30}/><h2>登录后打开你的{app.title}</h2><p>此处连接原电脑上的私人应用，数据仅管理账号可查看。</p><a className="library-button primary" href={'/signin-with-chatgpt?return_to=' + encodeURIComponent('/#' + application)} target="_top">登录并打开<ArrowUpRight size={15}/></a></div> : <div className="local-app-frame-wrap">
      {started && <iframe key={application} title={app.title} src={`/local-apps/${entry}?pulse=1#${hash}`} allow="clipboard-write; display-capture; microphone; fullscreen" referrerPolicy="same-origin" onLoad={() => setLoading(false)}/>}
      {(!online || loading) && <div className="local-app-overlay" role="status">{online ? <RefreshCw size={24}/> : <WifiOff size={27}/>}<h2>{online ? '正在打开应用…' : !status && !failed ? '正在确认本机连接…' : '等待原电脑的应用上线'}</h2><p>{online ? '即将读取你的本机记录。' : '电脑开机并联网后会自动重连。页面保留当前状态，未确认的操作请勿重复提交。'}</p></div>}
    </div>}
    <div className="activity-footnote"><p><LockKeyhole size={14}/>独立新版连接本机数据，原网页保持原样。</p><a href={'http://127.0.0.1:5174/' + app.entry} target="_blank" rel="noopener">在原电脑打开<ArrowUpRight size={14}/></a></div>
  </section>;
}
