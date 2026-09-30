"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Smartphone, Square, Volume2 } from "lucide-react";
import { gatherMicIce, validMicSdp, validRoomId, validRoomToken, type MicRoomResponse } from "@/lib/microphone-utils";
import type { MicrophoneController } from "@/hooks/use-microphone";

type RoomKeys = { room: string; receiverToken: string; senderToken: string; expiresAt: number };
// LAN pairing does not depend on an external STUN service being reachable.
const peerConfig: RTCConfiguration = { iceServers: [] };
export default function MicrophoneReceiver({ mic, beforeStart }: { mic: MicrophoneController; beforeStart: () => void }) {
  const [phase, setPhase] = useState("idle"), [canCreate, setCanCreate] = useState<boolean | null>(null), [link, setLink] = useState(""), [expiry, setExpiry] = useState(0), [qr, setQr] = useState(""), [copied, setCopied] = useState(false), [notice, setNotice] = useState("");
  const peer = useRef<RTCPeerConnection | null>(null), room = useRef<RoomKeys | null>(null), poll = useRef<ReturnType<typeof setTimeout> | null>(null), recovery = useRef<ReturnType<typeof setTimeout> | null>(null), session = useRef(0), mounted = useRef(true), abort = useRef<AbortController | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null), attached = useRef(false), activateAudio = useRef<(() => Promise<void>) | null>(null);
  const { stop, receive, setError } = mic;
  const deleteRoom = useCallback((keys: RoomKeys) => { void fetch(`/api/microphone/room?room=${keys.room}`, { method: "DELETE", headers: { Authorization: `Bearer ${keys.receiverToken}` }, keepalive: true }).catch(() => {}); }, []);
  const cleanup = useCallback((update = true) => {
    ++session.current; abort.current?.abort(); abort.current = null;
    if (poll.current) clearTimeout(poll.current); if (recovery.current) clearTimeout(recovery.current);
    poll.current = recovery.current = null;
    const current = peer.current; peer.current = null; if (current) { current.onconnectionstatechange = null; current.ontrack = null; current.close(); }
    if (remoteAudio.current) { remoteAudio.current.pause(); remoteAudio.current.srcObject = null; } attached.current = false; activateAudio.current = null;
    if (room.current) deleteRoom(room.current); room.current = null; stop();
    if (update && mounted.current) { setPhase("idle"); setLink(""); setQr(""); setNotice(""); }
  }, [deleteRoom, stop]);
  useEffect(() => { if (mic.inputEnded && peer.current) cleanup(); }, [mic.inputEnded, cleanup]);
  useEffect(() => {
    mounted.current = true; const controller = new AbortController();
    void fetch("/api/microphone/room", { cache: "no-store", signal: controller.signal }).then(response => response.json() as Promise<MicRoomResponse>).then(data => { if (mounted.current) setCanCreate(data.canCreate === true); }).catch(() => { if (mounted.current) setCanCreate(false); });
    const leaving = () => cleanup(false); window.addEventListener("pagehide", leaving);
    return () => { mounted.current = false; controller.abort(); window.removeEventListener("pagehide", leaving); cleanup(false); };
  }, [cleanup]);

  const start = async () => {
    cleanup(); const attempt = session.current; beforeStart(); setError(""); setNotice(""); setPhase("preparing");
    let current: RTCPeerConnection | null = null;
    try {
      if (typeof RTCPeerConnection === "undefined") throw new Error("这个浏览器不支持手机传音，请使用新版 Chrome、Edge 或 Safari。");
      current = new RTCPeerConnection(peerConfig); peer.current = current; const connection = current;
      connection.addTransceiver("audio", { direction: "recvonly" });
      connection.ontrack = event => {
        if (session.current !== attempt) { event.track.stop(); return; }
        const stream = event.streams[0] || new MediaStream([event.track]), element = remoteAudio.current;
        if (!element) { cleanup(); setError("未能准备接收音频，请重新创建连接。"); return; }
        // Chromium needs an active media element to pull remote RTP audio before
        // the same stream can be processed by Web Audio. Muting prevents feedback.
        element.srcObject = stream;
        activateAudio.current = async () => {
          try { await element.play(); }
          catch { if (attempt === session.current) { setNotice("请点击启用接收音频，开始接收手机声音。"); if (connection.connectionState === "connected") setPhase("ready"); } return; }
          if (attempt !== session.current || attached.current) return;
          attached.current = true;
          try { await receive(stream); if (attempt === session.current && connection.connectionState === "connected") { setPhase("connected"); setNotice(""); } }
          catch { if (attempt === session.current) cleanup(); }
        };
        void activateAudio.current();
      };
      connection.onconnectionstatechange = () => {
        if (session.current !== attempt) return;
        if (connection.connectionState === "connected") { if (recovery.current) clearTimeout(recovery.current); setPhase(attached.current ? "connected" : "ready"); setLink(""); setQr(""); if (room.current) { deleteRoom(room.current); room.current = null; } }
        else if (connection.connectionState === "disconnected") { setPhase("reconnecting"); setNotice("手机连接中断，正在等待恢复…"); recovery.current = setTimeout(() => { if (connection.connectionState === "disconnected") { cleanup(); setError("手机连接已断开，录音已停止。请重新创建连接，并让两台设备连接同一 Wi-Fi。"); } }, 10000); }
        else if (connection.connectionState === "failed") { cleanup(); setError("未能连接手机。请让两台设备连同一 Wi-Fi、关闭 VPN，并重新创建连接。部分网络无法直接传音，可使用 MicYou 桌面端。"); }
      };
      await connection.setLocalDescription(await connection.createOffer()); await gatherMicIce(connection);
      if (attempt !== session.current) return;
      abort.current = new AbortController();
      const response = await fetch("/api/microphone/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", offer: connection.localDescription }), signal: abort.current.signal });
      const keys = await response.json() as RoomKeys & { error?: string };
      if (!response.ok) throw new Error(keys.error || "未能创建连接，请重试。");
      if (!validRoomId(keys.room) || !validRoomToken(keys.receiverToken) || !validRoomToken(keys.senderToken)) throw new Error("连接信息无效，请重试。");
      if (attempt !== session.current) { deleteRoom(keys); return; }
      room.current = keys; setExpiry(keys.expiresAt); const url = `${window.location.origin}/microphone#room=${keys.room}&key=${keys.senderToken}`; setLink(url); setPhase("waiting");
      void import("qrcode").then(module => module.default.toDataURL(url, { width: 220, margin: 2, errorCorrectionLevel: "M" })).then(value => { if (session.current === attempt) setQr(value); }).catch(() => {});
      let failures = 0;
      const check = async () => {
        if (attempt !== session.current) return;
        if (Date.now() >= keys.expiresAt) { cleanup(); setError("配对链接已过期，请重新创建连接。"); return; }
        try {
          const response = await fetch(`/api/microphone/room?room=${keys.room}`, { cache: "no-store", headers: { Authorization: `Bearer ${keys.receiverToken}`, "X-Mic-Role": "receiver" }, signal: AbortSignal.timeout(10000) });
          const data = await response.json() as MicRoomResponse; if (attempt !== session.current) return;
          if (!response.ok) { if (response.status < 500) { cleanup(); setError(data.error || "连接链接已失效。"); return; } throw new Error(data.error); }
          failures = 0; setNotice("");
          if (data.answer) { if (!validMicSdp(data.answer, "answer")) throw new Error("手机音频连接信息无效。"); setPhase("connecting"); await connection.setRemoteDescription(data.answer); recovery.current = setTimeout(() => { if (connection.connectionState !== "connected" && attempt === session.current) { cleanup(); setError("手机未能建立音频连接。请连接同一 Wi-Fi 后重新配对，或使用 MicYou 桌面端。"); } }, 25000); return; }
        } catch { if (attempt !== session.current) return; setNotice("配对服务暂时中断，正在重试…"); if (++failures >= 4) { cleanup(); setError("配对服务连接中断，请稍后重新创建连接。"); return; } }
        if (attempt === session.current) poll.current = setTimeout(() => void check(), 1600);
      };
      void check();
    } catch (cause) { if (attempt === session.current) { cleanup(); setError(cause instanceof Error ? cause.message : "未能创建连接，请重试。"); } else current?.close(); }
  };
  return <div className="mic-receiver"><audio ref={remoteAudio} autoPlay muted playsInline hidden aria-hidden="true"/><p className="mic-note">电脑接收，手机发送。请连接同一 Wi-Fi；无需安装手机应用。网页声音可在这里监听和录音。</p>
    <div className="mic-start-actions">{phase === "idle" ? <button className="music-button music-primary" onClick={() => void start()} disabled={canCreate !== true || mic.recording}><Smartphone size={17}/>创建手机连接</button> : <button className="music-button" onClick={() => cleanup()}><Square size={16}/>结束手机连接</button>}<span role="status">{{ idle: "等待创建连接", preparing: "正在准备连接…", waiting: "等待手机开启麦克风", connecting: "正在建立音频连接…", ready: "连接已建立，等待开启声音", connected: "手机已连接", reconnecting: "连接中断，等待恢复" }[phase]}</span>{(phase === "connected" || phase === "ready") && <button className="music-button" onClick={() => { void activateAudio.current?.(); void mic.resume(); }}><Volume2 size={16}/>启用接收音频</button>}</div>
    {canCreate === false && <p className="mic-note">请先<a href="/signin-with-chatgpt?return_to=%2F%23music%3Fview%3Dmicrophone" target="_top">使用网站管理账号登录</a>，再创建配对链接。手机打开链接后无需登录。</p>}
    {link && <div className="mic-pairing">{qr && <img src={qr} width={220} height={220} alt="手机扫描此二维码连接麦克风"/>}<div><strong>用手机扫描二维码</strong><p>也可以复制链接，在手机浏览器打开，然后点击“开启手机麦克风”。</p><input className="mic-share-link" aria-label="手机配对链接" readOnly value={link} onFocus={event => event.target.select()}/><button className="music-button" onClick={() => { void navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => setNotice("无法自动复制，请选中上方链接手动复制。")); }}><Copy size={16}/>{copied ? "已复制" : "复制手机链接"}</button><p>仅配对一台手机 · {new Date(expiry).toLocaleTimeString("zh-CN", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false })} 前有效</p></div></div>}
    {notice && <p className="mic-note" role="status">{notice}</p>}
  </div>;
}
