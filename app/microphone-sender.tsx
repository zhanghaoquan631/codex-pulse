"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { useMicrophone } from "@/hooks/use-microphone";
import { gatherMicIce, validMicSdp, validRoomId, validRoomToken, type MicRoomResponse } from "@/lib/microphone-utils";
import { MicrophoneInputs, MicrophoneMeter, MicrophoneTone } from "./microphone-audio";

export default function MicrophoneSender() {
  const mic = useMicrophone(), [invitation, setInvitation] = useState<{ room: string; key: string } | null>(null), [ready, setReady] = useState(false), [phase, setPhase] = useState("idle"), [error, setError] = useState("");
  const peer = useRef<RTCPeerConnection | null>(null), session = useRef(0), mounted = useRef(true), timeout = useRef<ReturnType<typeof setTimeout> | null>(null), wakeLock = useRef<WakeLockSentinel | null>(null), wakeRequest = useRef(false), busy = useRef(false);
  const { stop } = mic;
  const cleanup = useCallback((update = true) => { ++session.current; busy.current = false; if (timeout.current) clearTimeout(timeout.current); timeout.current = null; const current = peer.current; peer.current = null; if (current) { current.onconnectionstatechange = null; current.close(); } stop(); void wakeLock.current?.release().catch(() => {}); wakeLock.current = null; if (update && mounted.current) setPhase("idle"); }, [stop]);
  useEffect(() => { if (mic.inputEnded && peer.current) cleanup(); }, [mic.inputEnded, cleanup]);
  useEffect(() => {
    mounted.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1)), room = params.get("room"), key = params.get("key");
    if (validRoomId(room) && validRoomToken(key)) setInvitation({ room, key }); setReady(true);
    const leaving = () => cleanup(false), hidden = () => { if (document.hidden && (peer.current || busy.current)) { cleanup(); setError("页面进入后台，手机传音已停止。请让电脑重新生成链接，并保持手机页面在前台。"); } };
    window.addEventListener("pagehide", leaving); document.addEventListener("visibilitychange", hidden);
    return () => { mounted.current = false; window.removeEventListener("pagehide", leaving); document.removeEventListener("visibilitychange", hidden); cleanup(false); };
  }, [cleanup]);

  const start = async () => {
    if (!invitation) return; cleanup(); const attempt = session.current; busy.current = true; setError(""); mic.setError(""); setPhase("preparing");
    try {
      const response = await fetch(`/api/microphone/room?room=${invitation.room}`, { cache: "no-store", headers: { Authorization: `Bearer ${invitation.key}`, "X-Mic-Role": "sender" }, signal: AbortSignal.timeout(10000) });
      const data = await response.json() as MicRoomResponse; if (attempt !== session.current) return;
      if (!response.ok) throw new Error(data.error || "连接链接已失效，请在电脑上重新生成。");
      if (data.claimed) throw new Error("这个链接已经使用过，请在电脑上重新生成连接。");
      if (!validMicSdp(data.offer, "offer")) throw new Error("电脑音频连接信息无效，请重新生成连接。");
      if (typeof RTCPeerConnection === "undefined") throw new Error("这个浏览器不支持手机传音，请使用新版 Chrome 或 Safari。");
      await mic.start(); if (attempt !== session.current) return;
      const stream = mic.graph.current?.output.stream; if (!stream) { busy.current = false; setPhase("idle"); return; }
      const connection = new RTCPeerConnection({ iceServers: [] }); peer.current = connection;
      connection.onconnectionstatechange = () => {
        if (attempt !== session.current) return;
        if (connection.connectionState === "connected") { if (timeout.current) clearTimeout(timeout.current); timeout.current = null; setPhase("connected"); if ((!wakeLock.current || wakeLock.current.released) && !wakeRequest.current && navigator.wakeLock) { wakeRequest.current = true; void navigator.wakeLock.request("screen").then(lock => { if (attempt === session.current) wakeLock.current = lock; else void lock.release(); }).catch(() => {}).finally(() => { wakeRequest.current = false; }); } }
        else if (connection.connectionState === "disconnected") { setPhase("reconnecting"); timeout.current = setTimeout(() => { if (connection.connectionState === "disconnected" && attempt === session.current) { cleanup(); setError("电脑已断开，请在电脑上重新生成链接。"); } }, 10000); }
        else if (connection.connectionState === "failed") { cleanup(); setError("未能连接电脑。请使用同一 Wi-Fi，并重新生成连接链接。"); }
      };
      stream.getAudioTracks().forEach(track => connection.addTrack(track, stream));
      await connection.setRemoteDescription(data.offer); await connection.setLocalDescription(await connection.createAnswer()); await gatherMicIce(connection);
      if (attempt !== session.current) return;
      busy.current = false;
      const body = JSON.stringify({ action: "answer", room: invitation.room, answer: connection.localDescription });
      let accepted = false;
      for (let retry = 0; retry < 2 && !accepted; retry++) {
        try {
          const submitted = await fetch("/api/microphone/room", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${invitation.key}` }, body, signal: AbortSignal.timeout(10000) });
          const result = await submitted.json() as MicRoomResponse; if (attempt !== session.current) return;
          if (!submitted.ok) { if (connection.connectionState === "connected") { accepted = true; break; } if (submitted.status < 500 || retry) throw new Error(result.error || "未能连接电脑。"); }
          else accepted = true;
        } catch (cause) { if (attempt !== session.current) return; if (connection.connectionState === "connected") { accepted = true; break; } if (retry) throw cause; }
      }
      if (attempt !== session.current) return;
      if (connection.connectionState !== "connected") { setPhase("connecting"); timeout.current = setTimeout(() => { if (attempt === session.current && connection.connectionState !== "connected") { cleanup(); setError("电脑没有收到声音。请让两台设备连同一 Wi-Fi 后重新生成链接。"); } }, 25000); }
    } catch (cause) { if (attempt === session.current) { cleanup(); setError(cause instanceof Error ? cause.message : "未能连接电脑，请重试。"); } }
  };
  return <main className="mic-phone-page"><a href="/#music?view=microphone" className="mic-back">Codex Pulse · 音乐空间</a><section className="mic-workspace"><div className="mic-heading"><span className="mic-heading-icon"><Mic size={24}/></span><div><h1>手机麦克风</h1><p>把此手机的声音传到电脑工作台。</p></div></div>
    {!ready ? <p className="mic-note">正在读取连接信息…</p> : !invitation ? <p className="mic-error">没有有效配对链接。请在电脑的“音乐空间 → 麦克风 → 手机传音”里创建连接，再用手机扫描二维码。</p> : <><MicrophoneInputs mic={mic}/><div className="mic-start-actions">{phase === "idle" ? <button className="music-button music-primary" onClick={() => void start()}><Mic size={18}/>开启手机麦克风</button> : <button className="music-button" onClick={() => cleanup()}><Square size={17}/>停止传音</button>}<span role="status">{{ idle: "麦克风未开启", preparing: "正在准备，请允许麦克风…", connecting: "正在连接电脑…", connected: mic.audioRunning ? "已连接 · 正在传音" : "已连接 · 音频已暂停", reconnecting: "连接中断，等待恢复…" }[phase]}</span></div>
      {phase === "connected" && <><button className="music-button" aria-pressed={mic.muted} onClick={() => mic.setMuted(value => !value)}><MicOff size={16}/>{mic.muted ? "取消静音" : "静音"}</button>{!mic.audioRunning && <p className="mic-note" role="status">连接已建立，音频暂停；请点击下方恢复音频采集。</p>}</>}
      <MicrophoneMeter mic={mic}/><MicrophoneTone mic={mic}/><p className="mic-note">请保持此页面在前台。两台设备连同一 Wi-Fi 时效果更稳定；部分网络无法直接连接。电脑上可监听、录音和下载。</p></>}
    {(error || mic.error) && <p className="mic-error" role="alert">{error || mic.error}</p>}<p className="mic-note">点击开启后才采集声音。点击停止即关闭麦克风；音频通过浏览器连接发送到配对电脑，不存入云端。</p>
  </section></main>;
}
