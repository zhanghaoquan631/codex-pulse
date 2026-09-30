"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Gamepad2, Maximize2, RefreshCw, Smartphone } from "lucide-react";

import {gameLinks} from "@/lib/game-urls";
import SourceActions from './source-actions';

const gameUrl = "/games/rooster-rush/index.html";

export default function RoosterCenter({ refreshToken = 0 }: { refreshToken?: number }) {
  return <RoosterSession key={refreshToken} />;
}

function RoosterSession() {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [fullscreenError, setFullscreenError] = useState(false);
  useEffect(() => {
    if (status === "ready" && window.matchMedia("(max-width:850px), (max-width:1100px) and (pointer:coarse)").matches) stage.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [status]);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== "pulse-rooster-state") return;
      if (event.data.state === "ready" || event.data.state === "error") setStatus(event.data.state);
    }
    window.addEventListener("message", receive);
    const timer = window.setTimeout(() => setStatus(value => value === "loading" ? "error" : value), 25000);
    return () => { window.removeEventListener("message", receive); window.clearTimeout(timer); };
  }, [attempt]);

  async function fullscreen() {
    try {
      if (!stage.current?.requestFullscreen) throw new Error("Fullscreen unavailable");
      await stage.current.requestFullscreen();
      frame.current?.focus();
      setFullscreenError(false);
    } catch { setFullscreenError(true); }
  }

  function retry() { setStatus("loading"); setAttempt(value => value + 1); }

  return <section className="rooster-center" aria-labelledby="rooster-title">
    <div className="intro rooster-intro">
      <div><p className="eyebrow">休息一下 · ROOSTER RUSH</p><h1 id="rooster-title">公鸡快跑</h1><p className="intro-description">收集金币、踩怪、乘上火箭，向 10,000 分出发。</p></div>
      <div className="rooster-actions"><button type="button" onClick={fullscreen}><Maximize2 size={16} />全屏游玩</button><a href={gameUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />独立打开</a><a href={gameLinks[0].mobile} target="_blank" rel="noopener noreferrer"><Smartphone size={16} />手机版</a></div>
    </div>
    <SourceActions project="rooster-rush"/>
    <div className="rooster-stage" ref={stage} aria-busy={status === "loading"}>
      <iframe key={attempt} ref={frame} src={gameUrl} title="公鸡快跑 Rooster Rush" allow="fullscreen; autoplay" allowFullScreen referrerPolicy="same-origin" onLoad={() => frame.current?.contentWindow?.postMessage({ type: "pulse-rooster-ping" }, window.location.origin)} onError={() => setStatus("error")} />
      {status !== "ready" && <div className="rooster-loading" role="status"><Gamepad2 size={30} /><strong>{status === "loading" ? "小公鸡正在准备出发…" : "游戏暂时没有加载完成"}</strong><p>{status === "loading" ? "即将进入游戏。" : "请重试，或在独立页面打开。"}</p>{status === "error" && <button type="button" onClick={retry}><RefreshCw size={16} />重新载入</button>}</div>}
    </div>
    {fullscreenError && <p className="rooster-fullscreen-note" role="status">这个浏览器暂不支持全屏，可点「独立打开」使用完整画面。</p>}
    <div className="rooster-guide"><p><kbd>← →</kbd> / <kbd>A D</kbd> 移动 <span>·</span> <kbd>Space</kbd> 跳跃，长按跳得更高 <span>·</span> <kbd>P</kbd> 暂停 <span>·</span> <kbd>R</kbd> 重开</p><p>先点击游戏画面再使用键盘。手机使用画面内摇杆和 JUMP；切换板块会结束当前局，最高分保留在当前标签页。</p></div>
  </section>;
}
