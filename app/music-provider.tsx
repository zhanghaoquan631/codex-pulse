"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { trackKey, validMusicTrack, type MusicTrack, type MusicHistoryEntry, type MusicSavedState } from "@/lib/music-types";
import { MusicCatalogProvider } from "./music-catalog-provider";

type MusicContextValue = {
  track: MusicTrack | null; position: number; duration: number; volume: number;
  playing: boolean; loading: boolean; restoring: boolean; error: string;
  history: MusicHistoryEntry[]; storageError: string; account: boolean; synchronized: boolean;
  play: (track?: MusicTrack, position?: number) => Promise<void>;
  pause: () => void; seek: (position: number) => void; setVolume: (volume: number) => void;
  refreshHistory: () => Promise<void>;
};
const MusicContext = createContext<MusicContextValue | null>(null);
type MusicResponse = { ok?: boolean; error?: string; needsInitialization?: boolean; scopeChanged?:boolean; revision?:string; state?: MusicSavedState | null; history?: MusicHistoryEntry[]; account?: boolean; url?: string };
export function useMusic() { const value = useContext(MusicContext); if (!value) throw new Error("MusicProvider is missing"); return value; }

function waitForMetadata(audio: HTMLAudioElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const clean = () => { clearTimeout(timer); audio.removeEventListener("loadedmetadata", ready); audio.removeEventListener("error", failed); signal.removeEventListener("abort", aborted); };
    const ready = () => { clean(); resolve(); };
    const failed = () => { clean(); reject(new Error("音源暂时无法播放，请换一首歌或重试。")); };
    const aborted = () => { clean(); reject(new DOMException("Aborted", "AbortError")); };
    audio.addEventListener("loadedmetadata", ready); audio.addEventListener("error", failed); signal.addEventListener("abort", aborted);
    timer = setTimeout(failed, 20000);
  });
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [track, setTrack] = useState<MusicTrack | null>(null), [position, setPosition] = useState(0), [duration, setDuration] = useState(0), [volume, updateVolume] = useState(.65);
  const [playing, setPlaying] = useState(false), [loading, setLoading] = useState(false), [restoring, setRestoring] = useState(true), [error, setError] = useState("");
  const [history, setHistory] = useState<MusicHistoryEntry[]>([]), [storageError, setStorageError] = useState(""), [account, setAccount] = useState(false), [synchronized, setSynchronized] = useState(false);
  const current = useRef<MusicTrack | null>(null), positionRef = useRef(0), durationRef = useRef(0), volumeRef = useRef(.65);
  const generation = useRef(0), resolver = useRef<AbortController | null>(null), played = useRef(false), playId = useRef(""), sequence = useRef(0), acknowledged = useRef(false);
  const acknowledgedIds = useRef(new Set<string>()), armedGeneration = useRef<number | null>(null);
  const queue = useRef(Promise.resolve()), lastTimestamp = useRef(0), lastRecord = useRef(0), alive = useRef(true);
  const revision=useRef<string|null>(null),refreshRef=useRef<()=>Promise<void>>(async()=>{});
  const needsIdentityRestore=useRef(false);
  const historyRequest=useRef(0);
  const resetIdentity=useCallback(()=>{
    resolver.current?.abort();armedGeneration.current=null;++generation.current;played.current=false;playId.current="";sequence.current=0;acknowledged.current=false;
    needsIdentityRestore.current=true;
    ++historyRequest.current;
    current.current=null;positionRef.current=0;durationRef.current=0;setTrack(null);setPosition(0);setDuration(0);setPlaying(false);setLoading(false);setError("");setHistory([]);setSynchronized(false);setStorageError("");
    if(audioRef.current){audioRef.current.pause();audioRef.current.removeAttribute("src");audioRef.current.load();}
  },[]);

  const record = useCallback((keepalive = false) => {
    const audio = audioRef.current, selected = current.current;
    if (!played.current || !selected || !audio || !playId.current) return;
    const state: MusicSavedState = { track: selected, position: Math.max(0, Number.isFinite(audio.currentTime) ? audio.currentTime : positionRef.current), duration: Number.isFinite(audio.duration) ? audio.duration : durationRef.current, volume: volumeRef.current, updatedAt: Math.max(Date.now(), lastTimestamp.current + 1) };
    lastTimestamp.current = state.updatedAt; lastRecord.current = Date.now();
    const entry = { track: selected, position: state.position, duration: state.duration, lastPlayedAt: state.updatedAt };
    setHistory(previous => [entry, ...previous.filter(e => trackKey(e.track) !== trackKey(selected))].slice(0, 80));
    if(!revision.current){setStorageError("播放记录尚未连接，连接恢复后会保存当前进度。");setSynchronized(false);void refreshRef.current();return;}
    const payload = { state, playId: playId.current, sequence: ++sequence.current, start: !acknowledged.current,revision:revision.current };
    if (keepalive && acknowledged.current) {
      const accepted = navigator.sendBeacon("/api/music/state", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      if (accepted) return;
    }
    setSynchronized(false);
    queue.current = queue.current.then(async () => {
      if(payload.revision!==revision.current)return;
      try {
        const response = await fetch("/api/music/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, start: !acknowledgedIds.current.has(payload.playId) }), keepalive, signal: keepalive ? undefined : AbortSignal.timeout(10000) });
        const data = await response.json() as MusicResponse;
        if(data.scopeChanged&&payload.revision===revision.current){resetIdentity();revision.current=null;void refreshRef.current();return;}
        if (!response.ok || !data.ok) throw new Error(data.error || "播放进度尚未同步，连接恢复后会再保存。");
        acknowledgedIds.current.add(payload.playId);
        if (acknowledgedIds.current.size > 100) acknowledgedIds.current.delete(acknowledgedIds.current.values().next().value!);
        if (payload.playId === playId.current) acknowledged.current = true;
        if (alive.current && payload.playId === playId.current && payload.sequence === sequence.current) { setStorageError(""); setSynchronized(true); }
      } catch (cause) { if (alive.current && payload.playId===playId.current) { setStorageError(cause instanceof Error ? cause.message : "播放进度尚未同步。"); setSynchronized(false); } }
    });
  }, [resetIdentity]);

  const refreshHistory = useCallback(async () => {
    let requestId=++historyRequest.current;
    try {
      let response = await fetch("/api/music/state", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      let data = await response.json() as MusicResponse;
      if(requestId!==historyRequest.current||!alive.current)return;
      if (response.ok && data.needsInitialization) {
        response = await fetch("/api/music/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bootstrap" }), signal: AbortSignal.timeout(10000) });
        data = await response.json() as MusicResponse;
      }
      if(requestId!==historyRequest.current||!alive.current)return;
      if (!response.ok) throw new Error(data.error || "播放记录暂时无法读取。");
      if (!alive.current) return;
      if(typeof data.revision!=="string")throw new Error("播放记录尚未连接，请重试。");
      const changed=revision.current!==null&&revision.current!==data.revision;
      if(changed){resetIdentity();requestId=historyRequest.current;}
      revision.current=data.revision;
      setAccount(!!data.account); setStorageError("");
      const entries = (Array.isArray(data.history) ? data.history : []).filter((entry: MusicHistoryEntry) => validMusicTrack(entry.track) && Number.isFinite(entry.position) && Number.isFinite(entry.duration) && Number.isFinite(entry.lastPlayedAt));
      setHistory(previous => {
        const byKey = new Map<string, MusicHistoryEntry>();
        for (const entry of [...entries, ...previous]) { const key = trackKey(entry.track), prior = byKey.get(key); if (!prior || entry.lastPlayedAt > prior.lastPlayedAt) byKey.set(key, entry); }
        return [...byKey.values()].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, 80);
      });
      if (generation.current === 0 || changed || needsIdentityRestore.current) {
        const saved = data.state as MusicSavedState | null;
        if (saved && validMusicTrack(saved.track) && Number.isFinite(saved.position) && Number.isFinite(saved.duration)) {
          current.current = saved.track; setTrack(saved.track); positionRef.current = saved.position; setPosition(saved.position); durationRef.current = saved.duration; setDuration(saved.duration);
          if (Number.isFinite(saved.volume)) { volumeRef.current = Math.max(0, Math.min(1, saved.volume)); updateVolume(volumeRef.current); if (audioRef.current) audioRef.current.volume = volumeRef.current; }
        }
        setSynchronized(true);
        needsIdentityRestore.current=false;
      }
    } catch (cause) { if (alive.current&&requestId===historyRequest.current) setStorageError(cause instanceof Error ? cause.message : "播放记录暂时无法读取。"); }
    finally { if (alive.current&&requestId===historyRequest.current) setRestoring(false); }
  }, [resetIdentity]);
  refreshRef.current=refreshHistory;

  useEffect(() => {
    alive.current = true;
    try { const value = Number(localStorage.getItem("codex-pulse:music-volume:v1")); if (localStorage.getItem("codex-pulse:music-volume:v1") !== null && Number.isFinite(value)) { volumeRef.current = Math.max(0, Math.min(1, value)); updateVolume(volumeRef.current); } } catch {}
    if (audioRef.current) audioRef.current.volume = volumeRef.current;
    void refreshHistory();
    const hide = () => record(true), visibility = () => { if (document.visibilityState === "hidden") record(true); };
    const online = () => { void refreshHistory().then(() => record()); };
    window.addEventListener("pagehide", hide); document.addEventListener("visibilitychange", visibility); window.addEventListener("online", online);
    const timer = setInterval(() => { if (played.current && (audioRef.current && !audioRef.current.paused || !acknowledged.current)) record(); }, 8000);
    return () => { alive.current = false; clearInterval(timer); window.removeEventListener("pagehide", hide); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", online); resolver.current?.abort(); };
  }, [record, refreshHistory]);

  const play = useCallback(async (requested?: MusicTrack, from?: number) => {
    const audio = audioRef.current, next = requested || current.current;
    if (!audio || !next) return;
    const same = current.current && trackKey(current.current) === trackKey(next);
    const target = Math.max(0, from ?? (same ? positionRef.current : 0));
    const cached = same && audio.readyState >= 1 && !!audio.getAttribute("src") && !audio.error;
    if (played.current) record();
    resolver.current?.abort(); armedGeneration.current = null; audio.pause();
    const token = ++generation.current, controller = new AbortController(); resolver.current = controller;
    played.current = false; acknowledged.current = false; playId.current = crypto.randomUUID(); sequence.current = 0;
    current.current = next; setTrack(next); positionRef.current = target; setPosition(target); durationRef.current = next.duration; setDuration(next.duration);
    setError(""); setLoading(true); setPlaying(false); setSynchronized(false);
    try {
      if (!cached) {
        audio.removeAttribute("src"); audio.load();
        const response = await fetch("/api/music/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track: next }), signal: controller.signal });
        const data = await response.json() as MusicResponse;
        if (!response.ok || !data.url) throw new Error(data.error || "这首歌暂时无法播放。");
        if (generation.current !== token) return;
        const ready = waitForMetadata(audio, controller.signal);
        audio.src = data.url; audio.load(); await ready;
      }
      if (generation.current !== token) return;
      const length = Number.isFinite(audio.duration) ? audio.duration : next.duration;
      audio.currentTime = target >= length - .3 ? 0 : Math.min(target, Math.max(0, length - .1));
      positionRef.current = audio.currentTime; setPosition(audio.currentTime); durationRef.current = length; setDuration(length);
      audio.volume = volumeRef.current;
      armedGeneration.current = token;
      await audio.play();
      if (generation.current !== token) return;
      setLoading(false);
    } catch (cause) {
      if (generation.current !== token || controller.signal.aborted) return;
      setLoading(false); setPlaying(false);
      setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "音源已准备好，请再点击一次播放。" : cause instanceof Error ? cause.message : "这首歌暂时无法播放，请重试。");
    }
  }, [record]);

  const pause = useCallback(() => {
    resolver.current?.abort(); armedGeneration.current = null; ++generation.current; setLoading(false);
    if (played.current) record(); audioRef.current?.pause(); setPlaying(false);
  }, [record]);
  const seek = useCallback((next: number) => {
    const value = Math.max(0, Math.min(Number.isFinite(next) ? next : 0, durationRef.current));
    positionRef.current = value; setPosition(value);
    if (audioRef.current && audioRef.current.readyState >= 1) { audioRef.current.currentTime = value; if (played.current) record(); }
  }, [record]);
  const setVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value)); volumeRef.current = next; updateVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
    try { localStorage.setItem("codex-pulse:music-volume:v1", String(next)); } catch {}
    if (played.current) record();
  }, [record]);

  return <MusicContext.Provider value={{ track, position, duration, volume, playing, loading, restoring, error, history, storageError, account, synchronized, play, pause, seek, setVolume, refreshHistory }}>
    <MusicCatalogProvider>{children}</MusicCatalogProvider>
    <audio ref={audioRef} preload="none" data-pulse-music-player="true"
      onPlaying={() => { if (!current.current || armedGeneration.current !== generation.current) return; setPlaying(true); setLoading(false); setError(""); if (!played.current) { played.current = true; record(); } }}
      onPause={() => { setPlaying(false); if (played.current) record(); }}
      onTimeUpdate={event => { const audio = event.currentTarget; if (!audio.getAttribute("src") || audio.readyState<1 || loading && !played.current) return; positionRef.current = audio.currentTime; setPosition(audio.currentTime); if (Number.isFinite(audio.duration)) { durationRef.current = audio.duration; setDuration(audio.duration); } if (played.current && Date.now() - lastRecord.current > 8000) record(); }}
      onEnded={() => { setPlaying(false); record(); }}
      onError={() => { if (!current.current || !audioRef.current?.getAttribute("src")) return; setPlaying(false); setLoading(false); setError("音源连接中断，点击播放可重新连接并继续。"); }}
    />
  </MusicContext.Provider>;
}
