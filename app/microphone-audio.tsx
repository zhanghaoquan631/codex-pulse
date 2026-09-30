"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Headphones, MicOff, Radio, RotateCcw, Square, Trash2 } from "lucide-react";
import { clockTime, flatTone } from "@/lib/microphone-utils";
import type { MicrophoneController } from "@/hooks/use-microphone";

export function MicrophoneMeter({ mic }: { mic: MicrophoneController }) {
  const canvas = useRef<HTMLCanvasElement>(null), [level, setLevel] = useState(-60), [clipping, setClipping] = useState(false);
  useEffect(() => {
    if (mic.phase !== "active") { setLevel(-60); setClipping(false); return; }
    let frame = 0, last = 0;
    const draw = (now: number) => {
      const graph = mic.graph.current, element = canvas.current, painter = element?.getContext("2d");
      if (graph && element && painter) {
        const samples = new Float32Array(graph.analyser.fftSize); graph.analyser.getFloatTimeDomainData(samples);
        let sum = 0, peak = 0; for (const value of samples) { sum += value * value; peak = Math.max(peak, Math.abs(value)); }
        if (now - last > 120) { setLevel(Math.max(-60, Math.min(0, 20 * Math.log10(Math.sqrt(sum / samples.length) || .001)))); setClipping(peak >= .99); last = now; }
        const width = element.width, height = element.height;
        painter.clearRect(0, 0, width, height);
        painter.strokeStyle = getComputedStyle(element).color; painter.lineWidth = 2; painter.beginPath();
        for (let i = 0; i < samples.length; i += 4) { const x = i / samples.length * width, y = height / 2 - Math.max(-1, Math.min(1, samples[i])) * height * .43; if (!i) painter.moveTo(x, y); else painter.lineTo(x, y); }
        painter.stroke();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, [mic.phase, mic.graph]);
  return <div className="mic-meter">
    <div className="mic-meter-top"><span>{mic.phase === "active" ? mic.label : "麦克风未开启"}</span><strong>{mic.phase === "active" ? `${Math.round(level)} dBFS` : "— dBFS"}</strong></div>
    <canvas ref={canvas} width={640} height={90} aria-label="实时音频波形" className={mic.phase === "active" ? "is-active" : ""}/>
    <div role="meter" aria-label="麦克风音量" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.round(level)} className="mic-level"><i style={{ width: `${(level + 60) / 60 * 100}%` }}/></div>
    <div className="mic-meter-bottom"><span>{mic.phase === "active" ? `${Math.round((mic.settings?.sampleRate || mic.graph.current?.context.sampleRate || 48000) / 1000)} kHz${mic.settings?.channelCount ? ` · ${mic.settings.channelCount} 声道` : ""}${mic.muted ? " · 已静音" : ""}` : "开启后显示真实输入电平"}</span><span className={clipping ? "mic-clipping" : ""}>{clipping ? "声音过大，请降低增益" : "-60 至 0 dBFS"}</span></div>
    {mic.phase === "active" && !mic.audioRunning && <div className="mic-start-actions"><span role="status">音频已暂停</span><button className="music-button" onClick={() => void mic.resume()}>恢复音频采集</button></div>}
  </div>;
}

export function MicrophoneInputs({ mic }: { mic: MicrophoneController }) {
  return <div className="mic-inputs">
    <label>音频输入<select value={mic.deviceId} onChange={event => mic.setDeviceId(event.target.value)} disabled={mic.phase !== "idle"}><option value="">系统默认麦克风</option>{mic.devices.filter(item => item.deviceId && item.deviceId !== "default").map((item, index) => <option value={item.deviceId} key={item.deviceId}>{item.label || `音频输入 ${index + 1}`}</option>)}</select></label>
    <button className="music-button" onClick={() => void mic.refreshDevices()} aria-label="刷新音频输入设备"><RotateCcw size={16}/>刷新设备</button>
    <label>采集模式<select value={mic.profile} onChange={event => mic.setProfile(event.target.value as "voice" | "music")} disabled={mic.phase !== "idle"}><option value="voice">人声 · 浏览器降噪与回声消除</option><option value="music">音乐 · 保留原声</option></select></label>
    <p className="mic-note">首次允许麦克风后才会显示设备名称。切换设备或采集模式，请先停用麦克风。</p>
  </div>;
}

export function MicrophoneTone({ mic }: { mic: MicrophoneController }) {
  const fields = [{ key: "gain" as const, label: "输入增益", min: 0, max: 2, step: .05 }, { key: "low" as const, label: "低频 · 120 Hz", min: -12, max: 12, step: 1 }, { key: "mid" as const, label: "中频 · 1 kHz", min: -12, max: 12, step: 1 }, { key: "high" as const, label: "高频 · 4 kHz", min: -12, max: 12, step: 1 }];
  return <div className="mic-tone"><div className="mic-subheading"><h3>声音调整</h3><button className="music-inline-button" onClick={() => mic.setTone({ ...flatTone })}>恢复原声</button></div><div className="mic-sliders">{fields.map(field => <label key={field.key}><span>{field.label}<output>{field.key === "gain" ? `${Math.round(mic.tone.gain * 100)}%` : `${mic.tone[field.key] > 0 ? "+" : ""}${mic.tone[field.key]} dB`}</output></span><input aria-label={field.label} type="range" min={field.min} max={field.max} step={field.step} value={mic.tone[field.key]} onChange={event => mic.setTone(previous => ({ ...previous, [field.key]: Number(event.target.value) }))}/></label>)}</div></div>;
}

export function MicrophoneRecording({ mic, beforePlay }: { mic: MicrophoneController; beforePlay?: () => void }) {
  return <>
    <div className="mic-record-actions">
      {mic.recording ? <button className="music-button mic-recording-button" onClick={mic.stopRecording}><Square size={16}/>结束录音 · {clockTime(mic.elapsed)}</button> : <button className="music-button music-primary" disabled={mic.phase !== "active" || !mic.audioRunning} onClick={mic.startRecording}><Radio size={16}/>开始录音</button>}
      <button className="music-button" disabled={mic.phase !== "active"} aria-pressed={mic.muted} onClick={() => mic.setMuted(value => !value)}><MicOff size={16}/>{mic.muted ? "取消静音" : "静音"}</button>
      <button className="music-button" disabled={mic.phase !== "active"} aria-pressed={mic.monitoring} onClick={() => { beforePlay?.(); void mic.toggleMonitor(); }}><Headphones size={16}/>{mic.monitoring ? "关闭监听" : "耳机监听"}</button>
    </div>
    <p className="mic-note">监听前请戴耳机。增益与均衡器会写入录音；单段最长 10 分钟。</p>
    <div className="mic-recordings"><div className="mic-subheading"><h3>本次录音{mic.recordings.length ? ` · ${mic.recordings.length}` : ""}</h3><span>离开前请下载</span></div>
      {!mic.recordings.length && <p className="mic-empty">开启麦克风后点击“开始录音”，结束后可试听和下载。</p>}
      {mic.recordings.map(item => <article className="mic-recording" key={item.id}><div className="mic-recording-name"><strong>{item.name}</strong><span>{clockTime(item.seconds)} · {(item.bytes / 1024 / 1024).toFixed(2)} MB</span></div><audio controls src={item.url} preload="metadata" onPlay={beforePlay} aria-label={`试听 ${item.name}`}/><div className="mic-file-actions"><a className="music-button" href={item.url} download={item.name}><Download size={16}/>下载</a><button className="music-button" onClick={() => mic.removeRecording(item.id)} aria-label={`移除录音 ${item.name}`}><Trash2 size={16}/></button></div></article>)}
      <p className="mic-note">录音文件仅保留在当前页面，不上传云端。刷新、切换板块或关闭页面会清除未下载的录音。</p>
    </div>
  </>;
}
