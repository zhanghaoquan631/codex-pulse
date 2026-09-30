"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};

function currentFullscreen() {
  const page = document as FullscreenDocument;
  return page.fullscreenElement || page.webkitFullscreenElement;
}

export default function FullscreenToggle() {
  const [fullscreen, setFullscreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const update = () => {
      setFullscreen(Boolean(currentFullscreen()));
      setNotice("");
    };
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !currentFullscreen()) return;
      const page = document as FullscreenDocument;
      const exit = page.exitFullscreen || page.webkitExitFullscreen;
      if (exit) Promise.resolve(exit.call(page)).catch(() => {
        if (currentFullscreen()) setNotice("暂时无法退出全屏，请点击「还原」重试。");
      });
    };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    document.addEventListener("keydown", exitOnEscape);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
      document.removeEventListener("keydown", exitOnEscape);
    };
  }, []);

  async function toggle() {
    if (busy) return;
    const page = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    const exiting = Boolean(currentFullscreen());
    const action = exiting
      ? page.exitFullscreen || page.webkitExitFullscreen
      : root.requestFullscreen || root.webkitRequestFullscreen;
    if (!action) {
      setNotice("这个浏览器暂不支持页面全屏。电脑上可按 F11 切换浏览器全屏。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await action.call(exiting ? page : root);
      setFullscreen(Boolean(currentFullscreen()));
    } catch {
      setNotice(exiting
        ? "暂时无法退出全屏，请按 Esc 恢复窗口。"
        : "无法进入全屏，请在浏览器中独立打开网站后重试，或按 F11。");
    } finally {
      setBusy(false);
    }
  }

  return <div className="pulse-fullscreen-control">
    <button type="button" className="pulse-fullscreen-toggle" onClick={toggle}
      aria-label={fullscreen ? "退出全屏，恢复窗口" : "全屏显示整个页面"}
      title={fullscreen ? "退出全屏，恢复窗口（Esc）" : "全屏显示整个页面"}
      aria-pressed={fullscreen} disabled={busy}>
      {fullscreen ? <Minimize2 size={16} aria-hidden="true"/> : <Maximize2 size={16} aria-hidden="true"/>}
      <span>{fullscreen ? "还原" : "全屏"}</span>
    </button>
    {notice && <div className="pulse-fullscreen-notice" role="status">
      <span>{notice}</span>
      <button type="button" aria-label="关闭全屏提示" onClick={() => setNotice("")}><X size={15}/></button>
    </div>}
  </div>;
}
