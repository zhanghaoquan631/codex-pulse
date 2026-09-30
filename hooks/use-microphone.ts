"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flatTone, micError, microphoneConstraints, recordingExtension, recordingType, type MicProfile, type MicTone } from "@/lib/microphone-utils";

export type MicRecording = { id: string; url: string; name: string; bytes: number; seconds: number };
type AudioGraph = { context: AudioContext; stream: MediaStream; source: MediaStreamAudioSourceNode; gain: GainNode; low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode; analyser: AnalyserNode; output: MediaStreamAudioDestinationNode; monitor: GainNode };
export function useMicrophone() {
  const [phase, setPhase] = useState<"idle" | "requesting" | "active">("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [deviceId, setDeviceId] = useState("");
  const [profile, setProfile] = useState<MicProfile>("voice"), [tone, setTone] = useState<MicTone>({ ...flatTone });
  const [error, setError] = useState(""), [label, setLabel] = useState(""), [settings, setSettings] = useState<MediaTrackSettings | null>(null);
  const [monitoring, setMonitoring] = useState(false), [muted, setMuted] = useState(false);
  const [audioRunning, setAudioRunning] = useState(false), [inputEnded, setInputEnded] = useState(0);
  const [recording, setRecording] = useState(false), [elapsed, setElapsed] = useState(0), [recordings, setRecordings] = useState<MicRecording[]>([]);
  const graph = useRef<AudioGraph | null>(null), recorder = useRef<MediaRecorder | null>(null), generation = useRef(0), alive = useRef(true);
  const urls = useRef(new Map<string, string>()), clock = useRef<ReturnType<typeof setInterval> | null>(null);
  const toneRef = useRef(tone), muteRef = useRef(muted); toneRef.current = tone; muteRef.current = muted;
  const stopRecording = useCallback(() => { if (recorder.current?.state === "recording") recorder.current.stop(); }, []);
  const release = useCallback(() => {
    const current = graph.current; graph.current = null;
    if (current) { current.context.onstatechange = null; current.stream.getTracks().forEach(track => { track.onended = null; track.stop(); }); current.output.stream.getTracks().forEach(track => track.stop()); void current.context.close().catch(() => {}); }
  }, []);
  const stop = useCallback(() => {
    ++generation.current; stopRecording(); release();
    if (alive.current) { setPhase("idle"); setMonitoring(false); setAudioRunning(false); setSettings(null); }
  }, [release, stopRecording]);
  const refreshDevices = useCallback(async () => {
    try { if (navigator.mediaDevices?.enumerateDevices) { const all = await navigator.mediaDevices.enumerateDevices(); if (alive.current) setDevices(all.filter(item => item.kind === "audioinput")); } }
    catch { if (alive.current) setError("未能读取输入设备，请检查浏览器权限后刷新。 "); }
  }, []);

  const attach = useCallback(async (stream: MediaStream, inputLabel?: string) => {
    release();
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream), gain = context.createGain(), low = context.createBiquadFilter(), mid = context.createBiquadFilter(), high = context.createBiquadFilter(), analyser = context.createAnalyser(), output = context.createMediaStreamDestination(), monitor = context.createGain();
      low.type = "lowshelf"; low.frequency.value = 120; mid.type = "peaking"; mid.frequency.value = 1000; mid.Q.value = .7; high.type = "highshelf"; high.frequency.value = 4000;
      gain.gain.value = muteRef.current ? 0 : toneRef.current.gain;
      low.gain.value = toneRef.current.low; mid.gain.value = toneRef.current.mid; high.gain.value = toneRef.current.high;
      analyser.fftSize = 1024; analyser.smoothingTimeConstant = .65; monitor.gain.value = 0;
      source.connect(gain); gain.connect(low); low.connect(mid); mid.connect(high); high.connect(analyser); analyser.connect(output); analyser.connect(monitor); monitor.connect(context.destination);
      graph.current = { context, stream, source, gain, low, mid, high, analyser, output, monitor };
      const activeContext = context;
      context.onstatechange = () => { if (graph.current?.context !== activeContext || !alive.current) return; setAudioRunning(activeContext.state === "running"); if (activeContext.state !== "running" && recorder.current?.state === "recording") { stopRecording(); setError("音频已暂停，录音已停止。请点击恢复音频采集后继续。"); } };
      void context.resume().catch(() => {});
      if (graph.current?.context !== context || !alive.current) throw new Error("连接已取消。");
      const track = stream.getAudioTracks()[0]; if (!track || track.readyState === "ended") throw new Error("音频输入已经断开，请重新连接。");
      track.onended = () => { stop(); if (alive.current) { setInputEnded(value => value + 1); setError("音频输入已断开，录音已停止。请重新连接。"); } };
      setLabel(inputLabel || track.label || "默认麦克风"); setSettings(track.getSettings()); setMonitoring(false); setError(""); setAudioRunning(context.state === "running"); setPhase("active");
      return output.stream;
    } catch (cause) { stream.getTracks().forEach(track => track.stop()); if (context) void context.close().catch(() => {}); graph.current = null; throw cause; }
  }, [release, stop, stopRecording]);

  const start = useCallback(async () => {
    stop(); const attempt = generation.current; setPhase("requesting"); setError("");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("这个浏览器无法采集麦克风，请用新版 Chrome、Edge 或 Safari 打开 HTTPS 网站。");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(profile, deviceId), video: false });
      if (!alive.current || attempt !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      await attach(stream); await refreshDevices();
    } catch (cause) { if (alive.current && attempt === generation.current) { setPhase("idle"); setError(micError(cause)); } }
  }, [attach, deviceId, profile, refreshDevices, stop]);

  const receive = useCallback(async (stream: MediaStream) => {
    stop(); setPhase("requesting");
    try { await attach(stream, "手机传入的声音"); }
    catch (cause) { if (alive.current) { setPhase("idle"); setError(micError(cause)); } throw cause; }
  }, [attach, stop]);

  const toggleMonitor = useCallback(async () => {
    const current = graph.current; if (!current) return;
    try { await current.context.resume(); if (graph.current !== current || !alive.current) return; const enabled = current.monitor.gain.value === 0; current.monitor.gain.setTargetAtTime(enabled ? .65 : 0, current.context.currentTime, .02); setMonitoring(enabled); }
    catch { setError("未能开启监听，请再次点击。 "); }
  }, []);

  const startRecording = useCallback(() => {
    const current = graph.current; if (!current || recorder.current) return;
    if (current.context.state !== "running") { setError("音频已暂停，请先点击恢复音频采集。"); return; }
    if (recordings.length >= 8) { setError("本次已保留 8 段录音，请先下载并移除部分录音。 "); return; }
    if (typeof MediaRecorder === "undefined") { setError("这个浏览器不支持录音，请使用新版 Chrome、Edge 或 Safari。 "); return; }
    const started = Date.now(); let bytes = 0; const chunks: Blob[] = [];
    try {
      const mimeType = recordingType(type => MediaRecorder.isTypeSupported(type));
      const next = new MediaRecorder(current.output.stream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : undefined); recorder.current = next;
      next.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes >= 100 * 1024 * 1024 && next.state === "recording") { next.stop(); if (alive.current) setError("录音已达到 100 MB，已自动停止，请先下载。 "); } } };
      next.onerror = () => { if (alive.current) setError("录音发生错误，请检查下方是否生成可试听的文件后重试。"); if (next.state !== "inactive") next.stop(); };
      next.onstop = () => {
        if (clock.current) clearInterval(clock.current); clock.current = null; recorder.current = null;
        if (alive.current) { setRecording(false); setElapsed(0); }
        if (!chunks.length || !alive.current) return;
        const type = next.mimeType || chunks[0].type || "audio/webm", blob = new Blob(chunks, { type }), url = URL.createObjectURL(blob), id = crypto.randomUUID(); urls.current.set(id, url);
        const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(started)).replace(/[: ]/g, "-");
        setRecordings(previous => [{ id, url, name: `Pulse-录音-${stamp}.${recordingExtension(type)}`, bytes: blob.size, seconds: Math.max(1, Math.round((Date.now() - started) / 1000)) }, ...previous]);
      };
      void current.context.resume().catch(() => {});
      next.start(1000); setRecording(true); setElapsed(0); setError("");
      clock.current = setInterval(() => { const seconds = Math.floor((Date.now() - started) / 1000); if (alive.current) setElapsed(seconds); if (seconds >= 600 && next.state === "recording") { next.stop(); if (alive.current) setError("已录满 10 分钟并自动停止，可下载后继续录制。 "); } }, 250);
    } catch (cause) { recorder.current = null; setRecording(false); setError(micError(cause)); }
  }, [recordings.length]);

  const removeRecording = useCallback((id: string) => { const url = urls.current.get(id); if (url) URL.revokeObjectURL(url); urls.current.delete(id); setRecordings(previous => previous.filter(item => item.id !== id)); }, []);
  const resume = useCallback(async () => { const current = graph.current; if (!current) return; try { await current.context.resume(); if (graph.current === current && alive.current) { setAudioRunning(current.context.state === "running"); setError(""); } } catch { if (alive.current) setError("未能恢复音频，请停用麦克风后重新开启。"); } }, []);
  useEffect(() => {
    const current = graph.current; if (!current) return;
    const time = current.context.currentTime;
    current.gain.gain.setTargetAtTime(muted ? 0 : tone.gain, time, .02);
    current.low.gain.setTargetAtTime(tone.low, time, .02); current.mid.gain.setTargetAtTime(tone.mid, time, .02); current.high.gain.setTargetAtTime(tone.high, time, .02);
  }, [muted, tone]);
  useEffect(() => {
    alive.current = true; void refreshDevices(); const changed = () => void refreshDevices(); navigator.mediaDevices?.addEventListener("devicechange", changed);
    const unloading = () => stop(); window.addEventListener("pagehide", unloading);
    return () => { alive.current = false; stop(); if (clock.current) clearInterval(clock.current); navigator.mediaDevices?.removeEventListener("devicechange", changed); window.removeEventListener("pagehide", unloading); urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current.clear(); };
  }, [refreshDevices, stop]);
  return { phase, devices, deviceId, setDeviceId, profile, setProfile, tone, setTone, error, setError, label, settings, monitoring, toggleMonitor, muted, setMuted, audioRunning, inputEnded, recording, elapsed, recordings, start, stop, receive, resume, startRecording, stopRecording, removeRecording, refreshDevices, graph };
}
export type MicrophoneController = ReturnType<typeof useMicrophone>;
