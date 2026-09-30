"use client";

import { useEffect, useRef, useState } from "react";
import { Sun, Moon, FileText } from "lucide-react";
import { playClickSound } from "@/lib/theme-sound";

type Theme = "light" | "dark" | "eink";
const storageKey = "codex-pulse:theme:v1";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [open,setOpen] = useState(false);
  const leaveTimer=useRef<ReturnType<typeof setTimeout> | null>(null);
  const dock=useRef<HTMLDivElement>(null);
  useEffect(()=>()=>{if(leaveTimer.current)clearTimeout(leaveTimer.current);},[]);
  useEffect(()=>{
    function outside(event:PointerEvent){if(event.target instanceof Node && !dock.current?.contains(event.target))setOpen(false);}
    document.addEventListener("pointerdown",outside);
    return()=>document.removeEventListener("pointerdown",outside);
  },[]);

  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.pulseTheme === "dark" ? "dark" : document.documentElement.dataset.pulseTheme === "eink" ? "eink" : "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pulse-theme"] });
    function sync(event: StorageEvent) {
      if (event.key !== storageKey && event.key !== null) return;
      const next = event.newValue === "dark" ? "dark" : event.newValue === "eink" ? "eink" : "light";
      document.documentElement.dataset.pulseTheme = next;
      setTheme(next);
    }
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("storage", sync); observer.disconnect(); };
  }, []);

  function selectTheme(next: Theme) {
    playClickSound();
    setOpen(false);
    if (next === theme) return;
    document.documentElement.dataset.pulseTheme = next;
    setTheme(next);
    try { localStorage.setItem(storageKey, next); } catch { /* The current page still switches when storage is unavailable. */ }
  }

  const options = [{id:"light" as const,name:"浅色模式",Icon:Sun},{id:"dark" as const,name:"深色模式",Icon:Moon},{id:"eink" as const,name:"墨水模式",Icon:FileText}];
  return <div ref={dock} className={`theme-toggle pulse-theme-dock ${open?"is-open":""}`} role="group" aria-label="页面主题" data-theme={theme}
    onPointerEnter={event=>{if(leaveTimer.current)clearTimeout(leaveTimer.current);if(event.pointerType==="mouse")setOpen(true);}} onPointerLeave={event=>{if(event.pointerType==="mouse")leaveTimer.current=setTimeout(()=>setOpen(false),380);}}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}} onKeyDown={event=>{if(event.key==="Escape")setOpen(false);}}>
    <button type="button" className="pulse-theme-current" aria-label="选择页面主题" title="选择页面主题" aria-expanded={open} onClick={event=>{if(event.detail&&matchMedia("(hover:hover) and (pointer:fine)").matches)setOpen(true);else setOpen(value=>!value);}}>
      {options.map(({id,Icon})=><Icon key={id} size={16} className={theme===id?"is-current":""} aria-hidden="true"/>)}
    </button>
    <div className="pulse-theme-tray" aria-hidden={!open}><div>{options.map(({id,name,Icon})=><button key={id} type="button" aria-label={name} title={name} aria-pressed={theme===id} data-current={theme===id} tabIndex={open&&theme!==id?0:-1} onClick={()=>selectTheme(id)}><Icon size={16} aria-hidden="true"/></button>)}</div></div>
  </div>;
}
