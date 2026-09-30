"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

const betteropcUrl = "https://betteropc.com/";

export default function BetterOpcCenter({ refreshToken = 0 }: { refreshToken?: number }) {
  const [attempt, setAttempt] = useState(0);
  return <BetterOpcSession key={`${refreshToken}-${attempt}`} onReload={() => setAttempt(value => value + 1)} />;
}

function BetterOpcSession({ onReload }: { onReload: () => void }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "slow" | "error">("loading");

  useEffect(() => {
    const timer = window.setTimeout(() => setStatus(current => current === "loading" ? "slow" : current), 15000);
    return () => window.clearTimeout(timer);
  }, []);

  return <section className="betteropc-center" aria-labelledby="betteropc-title">
    <div className="intro betteropc-intro">
      <div>
        <p className="eyebrow">AI 情报 · 超级个体社区</p>
        <h1 id="betteropc-title">BetterOPC</h1>
        <p className="intro-description">精选动态、OPC 社区、活动政策与产品优惠。</p>
      </div>
      <div className="betteropc-actions">
        <button type="button" onClick={onReload} aria-label="重新加载 BetterOPC"><RefreshCw size={16} />重新加载</button>
        <a href={betteropcUrl} target="_blank" rel="noopener noreferrer">独立打开<ExternalLink size={16} /></a>
      </div>
    </div>
    <div className="betteropc-frame-wrap">
      <div className="betteropc-source-bar">
        <a href={betteropcUrl} target="_blank" rel="noopener noreferrer">betteropc.com<ExternalLink size={14} /></a>
        <span role="status">{status === "loading" ? "正在载入原站…" : status === "slow" || status === "error" ? "加载较慢，可重新加载或独立打开" : "内容来自 BetterOPC 原站"}</span>
      </div>
      <iframe
        title="BetterOPC：AI 情报与 OPC 社区"
        src={betteropcUrl}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
    </div>
    <p className="betteropc-note">内容随原站更新。若页面空白或登录受限，请<a href={betteropcUrl} target="_blank" rel="noopener noreferrer">独立打开 BetterOPC</a>。</p>
  </section>;
}
