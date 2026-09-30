"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Compass, ExternalLink, Gamepad2, MapPinned, SunMoon, Smartphone } from 'lucide-react';

import {gameLinks} from '@/lib/game-urls';
import SourceActions from './source-actions';

const atlasUrl = '/local-apps/chaoshan-atlas/index.html';

export default function AtlasCenter({ refreshToken = 0 }: { refreshToken?: number }) {
  return <AtlasSession key={refreshToken}/>;
}

function AtlasSession() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'stopped' | 'error'>('loading');
  const [stage, setStage] = useState('正在载入社区地图…');
  const lastProgress = useRef(0);
  const loading = status === 'loading';
  const mounted = loading || status === 'ready';
  useEffect(() => {
    lastProgress.current = Date.now();
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== 'pulse-community-status') return;
      if (event.data.state === 'ready') setStatus('ready');
      else if (event.data.state === 'error') setStatus('error');
      else if (event.data.state === 'loading' && typeof event.data.label === 'string') {
        lastProgress.current = Date.now(); setStage(event.data.label);
      }
    }
    window.addEventListener('message', receive);
    const timer = window.setInterval(() => {
      if (Date.now() - lastProgress.current > 45000) setStatus(current => current === 'loading' ? 'error' : current);
    }, 1000);
    return () => { window.removeEventListener('message', receive); window.clearInterval(timer); };
  }, [attempt]);
  useEffect(() => {
    const element = frame.current;
    if (!element || !mounted) return;
    let inView = true;
    const update = () => element.contentWindow?.postMessage({ type:'pulse-atlas-visibility', visible:inView && !document.hidden }, window.location.origin);
    const observer = new IntersectionObserver(entries => { inView = entries[0]?.isIntersecting ?? true; update(); });
    observer.observe(element); element.addEventListener('load', update); document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); element.removeEventListener('load', update); document.removeEventListener('visibilitychange', update); };
  }, [attempt, mounted]);
  function retry() { lastProgress.current = Date.now(); setStage('正在载入社区地图…'); setStatus('loading'); setAttempt(value => value + 1); }

  return <section className="atlas-center">
    <div className="intro"><div><p className="eyebrow">我的地图 · 沿着江河，走向山海</p><h1>潮汕 · 共创地图</h1><p className="intro-description">发现全国社区、榜单与城市机会，也在潮汕 3D 地图中记录自己的地点。</p></div><a className="atlas-open" href={atlasUrl} target="_blank" rel="noopener noreferrer">独立打开<ExternalLink size={15}/></a></div>
    <div className="atlas-features" aria-label="地图功能"><span><MapPinned size={16}/>全国社区与榜单</span><span><SunMoon size={16}/>活动与城市政策</span><span><Compass size={16}/>潮汕 3D · 我的地点</span><span><Gamepad2 size={16}/>十二章互动冒险</span></div>
    <div className="source-project-pair"><SourceActions project="chaoshan-map" heading/><SourceActions project="chaoshan-adventure" heading/></div>
    <div className="atlas-frame-wrap" aria-busy={loading}>
      {mounted && <iframe key={attempt} ref={frame} title="潮汕共创地图：全国社区与潮汕 3D" src={atlasUrl} allow="fullscreen; autoplay" allowFullScreen referrerPolicy="same-origin" onError={() => setStatus('error')}/>}
      {status !== 'ready' && <div className="atlas-loading" role="status"><Compass size={28}/><strong>{loading ? stage : status === 'stopped' ? '已停止加载地图' : '地图加载未完成'}</strong><p>{loading ? '正在分步载入，期间可以切换左侧栏目。' : '你可以重新载入，或在独立页面打开地图。'}</p><div className="atlas-loading-actions">{loading ? <button type="button" onClick={() => setStatus('stopped')}>停止加载</button> : <button type="button" onClick={retry}>重新载入地图</button>}<a href={atlasUrl} target="_blank" rel="noopener noreferrer">在独立页面打开<ArrowUpRight size={14}/></a></div></div>}
    </div>
    <div className="atlas-footnote"><p>地图、社区、榜单与活动政策可直接在线浏览。收藏、地点和游戏进度保存在当前浏览器，本机旧记录不会自动迁移。</p><div className="atlas-link-pair"><a href="http://127.0.0.1:5242/" target="_blank" rel="noopener noreferrer">打开原本机页面<ArrowUpRight size={13}/></a><a href={gameLinks[1].mobile} target="_blank" rel="noopener noreferrer"><Smartphone size={14}/>手机版游戏<ArrowUpRight size={13}/></a></div></div>
  </section>;
}
