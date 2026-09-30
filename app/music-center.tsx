"use client";
import { useEffect, useState } from "react";
import { ExternalLink, GitBranch, Headphones, History, Mic, Search } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MusicHistory, MusicSearch, MusicTransport } from "./music-controls";
import { useMusic } from "./music-provider";
import MusicSourcePanel from "./music-source-panel";
import MicrophonePanel from "./microphone-panel";
export default function MusicCenter() {
  const music = useMusic(), [view, setView] = useState("search");
  useEffect(()=>{const read=()=>{if(new URLSearchParams(window.location.hash.split("?")[1]||"").get("view")==="microphone"){music.pause();setView("microphone");}};read();window.addEventListener("hashchange",read);return()=>window.removeEventListener("hashchange",read);},[music.pause]);
  useEffect(()=>{if(view==="source"&&(music.playing||music.loading))setView("search");},[music.playing,music.loading,view]);
  return <section className="music-center" aria-labelledby="music-heading">
    <div className="music-intro"><div className="music-title"><span className="music-mark"><Headphones size={24}/></span><div><h1 id="music-heading">音乐空间</h1><p>选歌、收听，下一次接着上次的位置。</p></div></div><a className="music-button" href="https://music.zkkp.nyc.mn/" target="_blank" rel="noopener noreferrer">打开来源站<ExternalLink size={16}/></a></div>
    {music.track && <p className="music-selected-source">当前歌曲来源：{music.track.engine === "go-music-dl" ? `原音乐站 · ${music.track.source}` : "网易云备用曲库"}</p>}
    <div className="music-player"><div className="music-toolbar"><div className="music-service"><Headphones size={18}/><strong>{music.track?.name || "还未选择歌曲"}</strong><span>{music.track?.artist || "点击下方歌曲开始播放"}</span></div><span className="music-save-status" role="status">{music.storageError ? "进度尚未同步" : music.restoring ? "正在读取记录" : music.synchronized ? "进度已保存" : music.track ? "自动保存进度" : "等待开始播放"}</span></div><MusicTransport/>{music.error && <div className="music-message" role="alert">{music.error}</div>}{music.storageError && <div className="music-message" role="status">{music.storageError}<button className="music-inline-button" onClick={() => void music.refreshHistory()}>重新连接</button></div>}</div>
    <Tabs value={view} onValueChange={next=>{if(next==="source"||next==="microphone")music.pause();setView(next);}} className="music-library"><TabsList aria-label="音乐曲库、播放历史与麦克风"><TabsTrigger value="search"><Search size={16}/>选歌</TabsTrigger><TabsTrigger value="history"><History size={16}/>播放历史</TabsTrigger><TabsTrigger value="source"><ExternalLink size={16}/>来源站</TabsTrigger><TabsTrigger value="microphone"><Mic size={16}/>麦克风</TabsTrigger></TabsList><TabsContent value="search"><MusicSearch/></TabsContent><TabsContent value="history"><MusicHistory/></TabsContent><TabsContent value="source"><MusicSourcePanel/></TabsContent><TabsContent value="microphone"><MicrophonePanel/></TabsContent></Tabs>
    <div className="music-footnote"><p>本站播放会自动保存歌曲和进度。原音乐站连接失败时会明确提示；只有你选择网易云备用曲库后才会切换来源。受账号或版权限制的歌曲会显示原因。</p><a href="https://github.com/guohuiyuan/go-music-dl" target="_blank" rel="noopener noreferrer"><GitBranch size={15}/>Go Music DL<ExternalLink size={13}/></a></div>
  </section>;
}
