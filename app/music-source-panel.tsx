"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, GitBranch, Headphones, Maximize2, Minimize2, RefreshCw } from "lucide-react";

const musicUrl = "https://music.zkkp.nyc.mn/";
const sourceUrl = "https://github.com/guohuiyuan/go-music-dl";

export default function MusicSourcePanel({ refreshToken = 0 }: { refreshToken?: number }) {
  const [reload, setReload] = useState(0);
  const [loadedFrame, setLoadedFrame] = useState<string | null>(null);
  const [slowFrame, setSlowFrame] = useState<string | null>(null);
  const [failedFrame, setFailedFrame] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const frameKey = `${refreshToken}-${reload}`;
  const loading = loadedFrame !== frameKey && failedFrame !== frameKey;
  const needsHelp = slowFrame === frameKey || failedFrame === frameKey;

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setSlowFrame(frameKey), 15000);
    return () => window.clearTimeout(timer);
  }, [frameKey, loading]);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  async function toggleFullscreen() {
    setFullscreenError(false);
    try {
      if (document.fullscreenElement === playerRef.current) await document.exitFullscreen();
      else if (playerRef.current?.requestFullscreen) await playerRef.current.requestFullscreen();
      else setFullscreenError(true);
    } catch { setFullscreenError(true); }
  }

  return <section className="music-center" aria-labelledby="music-source-heading">
    <div className="music-intro">
      <div className="music-title"><span className="music-mark"><Headphones size={24}/></span><div><h2 id="music-source-heading">Go Music DL 原站</h2><p>连接 Go Music DL，搜索歌曲与在线试听。</p></div></div>
      <a className="music-button music-primary" href={musicUrl} target="_blank" rel="noopener noreferrer">独立打开<ExternalLink size={16}/></a>
    </div>

    <div className="music-player" ref={playerRef}>
      <div className="music-toolbar">
        <div className="music-service"><Headphones size={17}/><strong>Go Music DL</strong><span>music.zkkp.nyc.mn</span></div>
        <div className="music-actions">
          <button className="music-button" type="button" onClick={() => setReload(value => value + 1)}><RefreshCw size={16}/><span>重新载入</span></button>
          <button className="music-button" type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "退出音乐全屏" : "全屏查看音乐"}>{fullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}<span>{fullscreen ? "退出全屏" : "全屏"}</span></button>
          <a className="music-button music-open-icon" href={musicUrl} target="_blank" rel="noopener noreferrer" aria-label="在独立页面打开 Go Music DL"><ExternalLink size={16}/></a>
        </div>
      </div>
      <div className="music-message" role="status">
        {fullscreenError ? "浏览器暂不支持全屏，可以独立打开音乐页面。" : needsHelp ? "音乐页面加载较慢；若出现空白或验证未完成，请独立打开。" : loading ? "正在载入音乐页面…" : "原站启用了安全验证；若提示访问受限或页面空白，请独立打开。"}
        <a href={musicUrl} target="_blank" rel="noopener noreferrer">独立打开<ExternalLink size={13}/></a>
      </div>
      <div className="music-frame-wrap">
        <iframe key={frameKey} title="Go Music DL 在线音乐搜索与播放器" src={musicUrl}
          allow="autoplay; clipboard-write; fullscreen" allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-storage-access-by-user-activation"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedFrame(frameKey)} onError={() => setFailedFrame(frameKey)}/>
      </div>
    </div>
    <div className="music-footnote"><p>音乐功能由 Go Music DL 在线站点提供，播放与下载以该站点实际可用情况为准。</p><a href={sourceUrl} target="_blank" rel="noopener noreferrer"><GitBranch size={15}/>开源项目<ExternalLink size={13}/></a></div>
  </section>;
}
