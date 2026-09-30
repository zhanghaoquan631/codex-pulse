"use client";
import { useEffect, useRef, useState } from "react";

const inks = [{id:"azure",name:"蓝色",hex:"#0033ff"},{id:"sun",name:"黄色",hex:"#e9b936"},{id:"rose",name:"粉色",hex:"#dc8098"},{id:"mint",name:"绿色",hex:"#67b99a"}] as const;
type Ink = typeof inks[number]["id"];
type Stroke = { text:string; start:number; end:number; ink:Ink; route:string };
const storageKey = "codex-pulse:reading-marks:v1";
const readingSelector = ".intro-description,.notice,.settings-panel p,.knowledge-feature p,.knowledge-steps li,.pro-info-card p,.rooster-guide,.atlas-footnote p,.music-footnote p,.ledger-explanation p,.activity-footnote p,.activity-gate p,.betteropc-intro p";

export default function ReadingPen() {
  const [enabled,setEnabled] = useState(false);
  const [ink,setInk] = useState<Ink>("azure");
  const [supported,setSupported] = useState(false);
  const [wrote,setWrote] = useState(false);
  const settings = useRef({enabled,ink});
  useEffect(()=>{ settings.current = {enabled,ink}; },[enabled,ink]);
  useEffect(()=>{
    if (!("highlights" in CSS) || !("Highlight" in window)) return;
    setSupported(true);
    let saved:Stroke[] = [];
    let rendered:{range:Range; stroke:Stroke}[] = [];
    let frame = 0;
    let touchTimer = 0;
    let writeTimer = 0;
    let justWrote = 0;
    const route = () => {
      const [hash,query=""]=location.hash.split("?");
      return hash==="#tokens"?`${hash}?view=${new URLSearchParams(query).get("view")||"overview"}`:hash||"#tokens?view=overview";
    };
    try {
      const value:unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(value)) saved = value.filter((entry):entry is Stroke => !!entry && typeof entry.text==="string" && entry.text.length<3000 && Number.isInteger(entry.start) && Number.isInteger(entry.end) && entry.start>=0 && entry.end>entry.start && entry.end<=entry.text.length && inks.some(ink=>ink.id===entry.ink) && typeof entry.route==="string").slice(-80);
    } catch {}
    const persist = () => { try { localStorage.setItem(storageKey,JSON.stringify(saved.slice(-80))); } catch {} };
    function textRange(container:Element,start:number,end:number):Range|null {
      const walker = document.createTreeWalker(container,NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let count=0,found=false;
      while (walker.nextNode()) {
        const node=walker.currentNode,length=node.textContent?.length||0;
        if (!found && start<=count+length) { range.setStart(node,start-count); found=true; }
        if (found && end<=count+length) { range.setEnd(node,end-count); return range; }
        count+=length;
      }
      return null;
    }
    function render() {
      frame=0; rendered=[];
      const containers=[...document.querySelectorAll(readingSelector)];
      containers.forEach(node=>node.classList.add("pulse-readable"));
      for (const stroke of saved.filter(stroke=>stroke.route===route())) {
        const container=containers.find(node=>node.textContent===stroke.text);
        const range=container&&textRange(container,stroke.start,stroke.end);
        if (range) rendered.push({range,stroke});
      }
      for (const ink of inks) CSS.highlights.set(`pulse-ink-${ink.id}`,new Highlight(...rendered.filter(item=>item.stroke.ink===ink.id).map(item=>item.range)));
    }
    function write() {
      if (!settings.current.enabled) return;
      const selection=window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount!==1 || selection.toString().trim().length<3) return;
      const range=selection.getRangeAt(0);
      const startElement=range.startContainer.parentElement;
      const container=startElement?.closest(readingSelector);
      if (!container || !container.contains(range.endContainer) || container.closest("input,textarea,[contenteditable=true]")) return;
      const prefix=document.createRange(); prefix.selectNodeContents(container); prefix.setEnd(range.startContainer,range.startOffset);
      const start=prefix.toString().length;
      const text=container.textContent||"";
      if (text.length>3000) return;
      const stroke:Stroke={text,start,end:start+range.toString().length,ink:settings.current.ink,route:route()};
      if (saved.some(item=>item.route===stroke.route&&item.text===text&&item.start===start&&item.end===stroke.end&&item.ink===stroke.ink)) return;
      // CSS Highlight ranges leave React's text nodes intact during live updates.
      saved=[...saved,stroke].slice(-80); persist();
      justWrote=performance.now();
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        [...range.getClientRects()].forEach((rect,index)=>{
          const wash=document.createElement("span"); wash.className="pulse-ink-stroke";
          Object.assign(wash.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,background:inks.find(item=>item.id===stroke.ink)!.hex});
          document.body.appendChild(wash);
          const animation=wash.animate([{clipPath:"inset(0 100% 0 0)",opacity:.32},{clipPath:"inset(0 0 0 0)",opacity:.18}],{duration:240,delay:index*55,fill:"both",easing:"cubic-bezier(.25,1,.5,1)"});
          animation.finished.then(()=>wash.remove()).catch(()=>wash.remove());
        });
      }
      selection.removeAllRanges(); render(); setWrote(true);
      clearTimeout(writeTimer); writeTimer=window.setTimeout(()=>setWrote(false),420);
    }
    function remove(event:MouseEvent) {
      if (performance.now()-justWrote<450 || window.getSelection()?.toString()) return;
      const hit=rendered.find(item=>[...item.range.getClientRects()].some(rect=>event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom));
      if (hit) { saved=saved.filter(item=>item!==hit.stroke); persist(); render(); }
    }
    function selectionChanged() {
      if (!matchMedia("(pointer:coarse)").matches) return;
      clearTimeout(touchTimer); touchTimer=window.setTimeout(write,700);
    }
    function key(event:KeyboardEvent) { if (event.key==="Escape")setEnabled(false); }
    function keyboardSelection(event:KeyboardEvent) { if (event.key==="Shift")write(); }
    render();
    const observer=new MutationObserver(records=>{
      if (records.some(record=>[...record.addedNodes].some(node=>node instanceof Element && !node.matches(".pulse-ink-stroke,.pulse-cursor-tip"))) && !frame) frame=requestAnimationFrame(render);
    });
    observer.observe(document.querySelector(".console-content")||document.body,{childList:true,subtree:true});
    document.addEventListener("mouseup",write); document.addEventListener("click",remove); document.addEventListener("selectionchange",selectionChanged); document.addEventListener("keydown",key); document.addEventListener("keyup",keyboardSelection);
    return ()=>{
      observer.disconnect();cancelAnimationFrame(frame);clearTimeout(touchTimer);clearTimeout(writeTimer);
      document.removeEventListener("mouseup",write);document.removeEventListener("click",remove);document.removeEventListener("selectionchange",selectionChanged);document.removeEventListener("keydown",key);document.removeEventListener("keyup",keyboardSelection);
      inks.forEach(ink=>CSS.highlights.delete(`pulse-ink-${ink.id}`));
      document.querySelectorAll(".pulse-readable").forEach(node=>node.classList.remove("pulse-readable"));
    };
  },[]);
  useEffect(()=>{
    const color=inks.find(item=>item.id===ink)!.hex;
    const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><g transform='rotate(45 12 12)'><polygon points='12,21.5 9.8,16.5 14.2,16.5' fill='${color}' stroke='#111111' stroke-width='1.2' stroke-linejoin='round'/><rect x='9.8' y='7' width='4.4' height='9.6' fill='#ffffff' stroke='#111111' stroke-width='1.2'/><rect x='9.8' y='3.4' width='4.4' height='3.6' fill='#111111' stroke='#111111' stroke-width='1.2'/></g></svg>`;
    document.body.classList.toggle("pulse-pen-mode",enabled);
    document.body.style.setProperty("--pulse-pen-cursor",`url("data:image/svg+xml,${encodeURIComponent(svg)}") 5 19, text`);
    return ()=>{ document.body.classList.remove("pulse-pen-mode");document.body.style.removeProperty("--pulse-pen-cursor"); };
  },[enabled,ink]);
  return <div className="pulse-pen-tools" data-enabled={enabled}>
    <button type="button" className={`pulse-pen ${wrote?"did-ink":""}`} disabled={!supported} aria-label={enabled?"收起荧光笔":"拿起荧光笔"} title={enabled?"选中文字划重点；点击标记擦掉；Esc 收笔":"拿起荧光笔，给说明文字划重点"} aria-pressed={enabled} onClick={()=>setEnabled(value=>!value)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 3.5C16.6 5.2 18.5 7.3 20.3 9.3C17.2 12.5 14.1 15.8 10.9 19C9 19.1 7 19 5.1 19C5.1 17.1 5 15.2 5.1 13.3C8.3 10 11.4 6.7 14.7 3.5Z"/><path d="M11.9 6.3C13.8 8.3 15.7 10.2 17.6 12.1"/><path d="M5.1 13.6C5 15.4 5.1 17.2 5.1 19C6.9 19 8.7 19.1 10.5 19C8.7 17.2 6.9 15.4 5.1 13.6Z" fill={inks.find(item=>item.id===ink)!.hex}/></svg>
    </button>
    {enabled&&<div className="pulse-pen-palette" role="group" aria-label="荧光笔颜色">{inks.map(item=><button key={item.id} type="button" aria-label={`${item.name}荧光笔`} aria-pressed={ink===item.id} onClick={()=>setInk(item.id)} style={{"--pulse-dab":item.hex} as React.CSSProperties}><svg viewBox="0 0 14 10" width="16" height="12" aria-hidden="true"><path d="M1.6 7.8C4.6 5.9 8.2 3.6 12.4 2.4"/></svg></button>)}<span>选中文字划重点 · 点标记擦掉</span></div>}
  </div>;
}
