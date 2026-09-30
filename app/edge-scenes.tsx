"use client";
import { useEffect, useRef } from "react";

export default function EdgeScene({ kind }: { kind: "cat" | "town" }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const sync = () => frame.current?.contentWindow?.postMessage({
      type: "pulse:theme",
      theme: document.documentElement.dataset.pulseTheme || "light",
    }, window.location.origin);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === "pulse:scene-ready") sync();
      if (kind === "town" && event.data?.type === "pulse:scene-theme" && ["light", "dark", "eink"].includes(event.data.theme)) {
        document.documentElement.dataset.pulseTheme = event.data.theme;
        try { localStorage.setItem("codex-pulse:theme:v1", event.data.theme); } catch {}
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pulse-theme"] });
    window.addEventListener("message", receive);
    sync();
    return () => { observer.disconnect(); window.removeEventListener("message", receive); };
  }, [kind]);
  return (
    <div className={`pulse-edge-scene pulse-edge-scene--${kind}`} data-scene={kind}>
      <iframe
        ref={frame}
        src={`/edge-scenes/${kind}.html`}
        title={kind === "cat" ? "虚线上小猫：点击逗猫或喂食" : "虚线上的互动城镇"}
        className="pulse-edge-scene__frame"
        loading={kind === "cat" ? "eager" : "lazy"}
      />
    </div>
  );
}
