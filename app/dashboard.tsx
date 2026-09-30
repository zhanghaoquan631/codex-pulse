"use client";
import { useEffect, useState } from "react";
import { Activity, ArrowDownLeft, ArrowUpRight, Database, RefreshCw, Settings2, ShieldCheck, Zap, Globe, PanelLeftClose, PanelLeftOpen, Wallet, CalendarDays, ChevronRight, Monitor, X, ReceiptText, GitBranch, Video, Download, Store, MapPinned, PanelsTopLeft, Gamepad2, Library, Headphones, Compass, BookOpen } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { tokenYi, exactTokens as exact } from "@/lib/token-format";
import Websites from "./websites";
import Ledger from "./ledger";
import BookingCenter from "./booking-center";
import ActivityCenter from "./activity-center";
import LocalAppCenter from "./local-app-center";
import ShopCenter from "./shop-center";
import BookshelfCenter from "./bookshelf-center";
import MusicCenter from "./music-center";
import MusicDock from "./music-controls";
import { MusicProvider } from "./music-provider";
import AtlasCenter from "./atlas-center";
import ProCenter from "./pro-center";
import KnowledgeCenter, { KnowledgeEntry } from "./knowledge-center";
import RoosterCenter from "./rooster-center";
import BetterOpcCenter from "./betteropc-center";
import UsageHeatmap from "./usage-heatmap";
import ThemeToggle from "./theme-toggle";
import AccountOverview from "./account-overview";
import type { QuotaProfile } from "@/lib/quota";
import SnowToggle from "./snow-toggle";
import EdgeScene from "./edge-scenes";
import InteractionLayer from "./interaction-layer";
import SoundToggle from "./sound-toggle";
import ReadingPen from "./reading-pen";
import QDuoCenter from "./qduo-center";
import FullscreenToggle from "./fullscreen-toggle";
import { playNavigationSound } from "@/lib/theme-sound";
import { preservesUsageHistory } from "@/lib/usage-history";
type Usage={input:number;cached:number;output:number;reasoning:number;total:number;requests:number;cacheWrite:number};
type Row=Usage&{day:string;model:string;hour?:string;accountId?:string|null};
type TokenAccount={id:string;email:string;lastSeen:string};
type Snapshot={generatedAt:string;lastEvent:string|null;phase:string;files:number;scanned:number;errors:number;anomalies:number;daily:Row[];hourly:Row[];accounts?:TokenAccount[];accountDetails?:QuotaProfile[];quotaHistory?:QuotaProfile[];currentAccountEmail?:string|null;accountTrackingSince?:string|null;recent:(Usage&{time:string;model:string;accountId?:string|null})[]};
const empty:Usage={input:0,cached:0,output:0,reasoning:0,total:0,requests:0,cacheWrite:0};
const tokenSections=[{id:"overview",label:"用量总览",icon:Zap},{id:"ledger",label:"额度账本",icon:Wallet},{id:"data",label:"用量明细",icon:Database},{id:"settings",label:"连接设置",icon:Settings2}];
const labels:Record<string,string>={today:"今天",week:"7 天",month:"30 天",year:"今年",all:"全部"};
const dayOf=(d:Date)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
const add=(a:Usage,b:Usage)=>{for(const k of Object.keys(empty) as (keyof Usage)[])a[k]+=b[k]||0;return a;};
const time=(s:string)=>new Date(s).toLocaleTimeString("zh-CN",{timeZone:"Asia/Taipei",hour12:false});
const snapshotCacheKey='codex-pulse:usage-snapshot:v1',filterCacheKey='codex-pulse:usage-filters:v1';
const isSnapshot=(value:unknown):value is Snapshot=>!!value&&typeof value==='object'&&'generatedAt' in value&&typeof value.generatedAt==='string'&&Number.isFinite(Date.parse(value.generatedAt))&&'daily' in value&&Array.isArray(value.daily)&&'hourly' in value&&Array.isArray(value.hourly)&&'recent' in value&&Array.isArray(value.recent)&&preservesUsageHistory({daily:[]},{daily:value.daily});
export default function Home(){return <MusicProvider><Dashboard/></MusicProvider>;}
function Dashboard(){
 const [tab,setTab]=useState("tokens"),[tokenView,setTokenView]=useState("overview"),[sidebarCollapsed,setSidebarCollapsed]=useState(false),[mobileMenu,setMobileMenu]=useState(false),[mobileTools,setMobileTools]=useState(false),[account,setAccount]=useState("all"),[visibleDays,setVisibleDays]=useState(60);
 useEffect(()=>{if(!mobileTools)return;const close=(event:PointerEvent)=>{if(event.target instanceof Element&&!event.target.closest('.console-header-actions'))setMobileTools(false);};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMobileTools(false);document.querySelector<HTMLButtonElement>('.mobile-tools-toggle')?.focus();}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);};},[mobileTools]);
 useEffect(()=>{if(!mobileMenu)return;setMobileTools(false);const previous=document.body.style.overflow;document.body.style.overflow="hidden";const trigger=document.activeElement as HTMLElement|null;document.querySelector<HTMLButtonElement>(".mobile-close")?.focus();const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setMobileMenu(false);};const resize=()=>{if(!window.matchMedia("(max-width:850px), (max-width:1100px) and (pointer:coarse)").matches)setMobileMenu(false);};window.addEventListener("keydown",close);window.addEventListener("resize",resize);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close);window.removeEventListener("resize",resize);trigger?.focus({preventScroll:true});};},[mobileMenu]);
 useEffect(()=>{const readHash=()=>{const [route,query=""]=window.location.hash.split("?");const legacy=tokenSections.find(section=>section.id===route.slice(1)&&section.id!=="overview");const requested=new URLSearchParams(query).get("view");setTokenView(legacy?.id||(tokenSections.some(section=>section.id===requested)?requested!:"overview"));setTab(legacy||route==="#tokens"?"tokens":["#websites","#betteropc","#activity","#finance","#github","#media","#shop","#atlas","#pro","#rooster","#knowledge","#bookshelf","#music","#booking","#qduo"].includes(route)?route.slice(1):"tokens");};readHash();window.addEventListener("hashchange",readHash);return()=>window.removeEventListener("hashchange",readHash);},[]);
 const [data,setData]=useState<Snapshot|null>(null),[period,setPeriod]=useState("all"),[filtersReady,setFiltersReady]=useState(false),[error,setError]=useState(""),[now,setNow]=useState(new Date()),[refresh,setRefresh]=useState(0);
 // Browser-only persisted state must be restored after server hydration.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(snapshotCacheKey)||'null');if(isSnapshot(saved))setData(saved);}catch{}try{const saved=JSON.parse(localStorage.getItem(filterCacheKey)||'null');if(saved&&Object.hasOwn(labels,saved.period))setPeriod(saved.period);if(saved&&typeof saved.account==='string')setAccount(saved.account);}catch{}setFiltersReady(true);},[]);
 useEffect(()=>{if(filtersReady)try{localStorage.setItem(filterCacheKey,JSON.stringify({period,account}));}catch{}},[period,account,filtersReady]);
 useEffect(()=>{let active=true,pending=false;const c=new AbortController();async function load(){if(pending)return;pending=true;try{const r=await fetch("/api/snapshot",{cache:"no-store",signal:c.signal});if(!r.ok)throw new Error("暂时无法连接，正在自动重试");const value=await r.json() as {snapshot:unknown};if(!isSnapshot(value.snapshot)||!preservesUsageHistory({daily:[]},value.snapshot))throw new Error('暂未收到完整数据，保留上次记录');const next=value.snapshot;if(active){setData(previous=>previous&&(Date.parse(previous.generatedAt)>Date.parse(next.generatedAt)||!preservesUsageHistory(previous,next))?previous:next);setError(next.daily.length?'':'暂无新用量，已保留已有记录');}}catch(e){if(active)setError(e instanceof Error?e.message:"连接中断");}finally{pending=false;}}load();const timer=setInterval(load,5000);return()=>{active=false;c.abort();clearInterval(timer);};},[refresh]);
 useEffect(()=>{if(data)try{localStorage.setItem(snapshotCacheKey,JSON.stringify(data));}catch{/* The collector database remains the durable source if browser storage is full. */}},[data]);
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),5000);return()=>clearInterval(timer);},[]);
 const today=dayOf(now),start=new Date(today+"T00:00:00+08:00");start.setUTCDate(start.getUTCDate()-(period==="week"?6:period==="month"?29:0));const since=period==="all"?(data?.daily.reduce((first,row)=>row.day<first?row.day:first,today)||today):period==="year"?today.slice(0,4)+"-01-01":dayOf(start);
 const inAccount=(r:{accountId?:string|null})=>account==="all"||(r.accountId||"unknown")===account;
 const periodRows=(data?.daily||[]).filter(r=>r.day>=since&&r.day<=today),rows=periodRows.filter(inAccount),total=rows.reduce((s,r)=>add(s,r),{...empty});
 const accountName=(id?:string|null)=>data?.accounts?.find(a=>a.id===id)?.email||"账号未知";
 const accountUsage=(source:Row[],id:string)=>source.filter(r=>(r.accountId||"unknown")===id).reduce((sum,r)=>add(sum,r),{...empty});
 const accountIds=[...new Set([...(data?.accounts||[]).map(a=>a.id),...(data?.daily||[]).map(r=>r.accountId||"unknown")])],allTime=(data?.daily||[]).reduce((sum,r)=>add(sum,r),{...empty});
 const days=Object.values(rows.reduce<Record<string,Row>>((by,r)=>{const key=r.day+"/"+(r.accountId||"unknown");by[key]=add(by[key]||{...empty,day:r.day,model:"",accountId:r.accountId},r) as Row;return by;},{})).sort((a,b)=>b.day.localeCompare(a.day)||accountName(a.accountId).localeCompare(accountName(b.accountId)));
 const models=Object.entries(rows.reduce<Record<string,Usage>>((m,r)=>{m[r.model]=add(m[r.model]||{...empty},r);return m;},{})).sort((a,b)=>b[1].total-a[1].total),rate=total.input?100*total.cached/total.input:0;
 const bars=period==="today"?Array.from({length:24},(_,i)=>({label:String(i).padStart(2,"0"),value:(data?.hourly||[]).filter(inAccount).filter(r=>r.hour===today+"T"+String(i).padStart(2,"0")).reduce((s,r)=>s+r.total,0)})):Object.entries(rows.reduce<Record<string,number>>((m,r)=>{m[r.day]=(m[r.day]||0)+r.total;return m;},{})).sort().map(([d,value])=>({label:d.slice(5),value}));
 const peak=Math.max(...bars.map(b=>b.value),0),maximum=Math.max(peak,1),stale=!!data&&now.getTime()-Date.parse(data.generatedAt)>60000;
 const status=error?"连接中断":!data?"等待首次同步":stale?"采集器离线":data.phase==="importing"?`正在导入 ${data.scanned}/${data.files}`:"正在实时同步";
 const rankedAccounts=accountIds.map(id=>({id,email:accountName(id),value:accountUsage(periodRows,id).total})).sort((a,b)=>b.value-a.value);
 const rankingTotal=rankedAccounts.reduce((sum,item)=>sum+item.value,0);
 const dailyTotals=(data?.daily||[]).filter(inAccount).reduce<Record<string,number>>((sum,row)=>{sum[row.day]=(sum[row.day]||0)+row.total;return sum;},{});
 function exportUsage(){const quote=(value:string|number)=>'"'+(typeof value==='string'&&/^[=+@-]/.test(value)?"'"+value:String(value)).replaceAll('"','""')+'"';const csv=[["日期","账号邮箱","输入 Token","缓存 Token","输出 Token","总 Token"],...days.map(r=>[r.day,accountName(r.accountId),r.input,r.cached,r.output,r.total])].map(row=>row.map(quote).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`Codex用量-${since}-${today}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const pageNames:Record<string,string>={qduo:"QDuo Windows",tokens:"Token 统计",websites:"网站收藏",betteropc:"BetterOPC",activity:"ME.zip 记录",ledger:"额度账本",data:"用量明细",settings:"连接设置",finance:"票据收件箱",github:"GitHub 工作台",media:"录制与截图库",shop:"我的小店",atlas:"潮汕 3D 地图",knowledge:"灵感库",bookshelf:"我的书架",music:"音乐空间",booking:"预约系统",pro:"ME·zip Pro",rooster:"公鸡快跑"};
 const navItems=[{id:"qduo",label:"QDuo Windows",icon:Monitor},{id:"tokens",label:"Token 统计",icon:Zap},{id:"websites",label:"网站收藏",icon:Globe},{id:"betteropc",label:"BetterOPC",icon:Compass},{id:"activity",label:"ME.zip 记录",icon:Activity},{id:"knowledge",label:"灵感库",icon:Library},{id:"bookshelf",label:"我的书架",icon:BookOpen},{id:"pro",label:"ME·zip Pro",icon:PanelsTopLeft},{id:"finance",label:"票据收件箱",icon:ReceiptText},{id:"shop",label:"我的小店",icon:Store},{id:"atlas",label:"潮汕 3D 地图",icon:MapPinned},{id:"rooster",label:"公鸡快跑",icon:Gamepad2},{id:"github",label:"GitHub 工作台",icon:GitBranch},{id:"media",label:"录制与截图库",icon:Video},{id:"music",label:"音乐空间",icon:Headphones},{id:"booking",label:"预约系统",icon:CalendarDays}];
 function selectTab(value:string){window.scrollTo({top:0,behavior:"instant"});setTab(value);if(value==="tokens")setTokenView("overview");setMobileMenu(false);setMobileTools(false);window.history.replaceState(null,"","#"+value);}
 function selectTokenView(value:string){window.scrollTo({top:0,behavior:"instant"});setTokenView(value);window.history.replaceState(null,"",value==="overview"?"#tokens":"#tokens?view="+value);}
 return <main className={`console-shell ${sidebarCollapsed?"sidebar-collapsed":""} ${mobileMenu?"mobile-menu-open":""}`}>
  <InteractionLayer/>
  <Tabs value={tab} onValueChange={selectTab} orientation="vertical" className="console-workspace">
   <button className="sidebar-backdrop" tabIndex={mobileMenu?0:-1} aria-label="关闭导航菜单" onClick={()=>setMobileMenu(false)}/>
   <aside className="console-sidebar" id="console-navigation">
    <a className="console-brand" href="#tokens" onClick={()=>{setMobileMenu(false);setMobileTools(false);}} aria-label="Codex Pulse 首页"><span className="console-logo">⌘</span><span className="sidebar-copy">Codex Pulse<small>个人数据中心</small></span></a>
    <button className="mobile-close" aria-label="关闭导航" onClick={()=>setMobileMenu(false)}><X size={18}/></button>
    <div className="sidebar-section-label sidebar-copy">工作空间</div>
    <TabsList className="console-nav" aria-label="主导航">{navItems.map(item=>{const Icon=item.icon;return <TabsTrigger key={item.id} value={item.id} title={item.label} aria-label={item.label} onClick={()=>{playNavigationSound();setMobileMenu(false);}}><Icon size={18}/><span className="sidebar-copy">{item.label}</span><ChevronRight className="sidebar-chevron" size={14}/></TabsTrigger>;})}</TabsList>
    <div className="sidebar-bottom"><div className="sidebar-note sidebar-copy"><Monitor size={19}/><strong>与这台电脑保持连接</strong><p>开机登录后自动采集<br/>按邮箱归档，每天持续记录</p></div><div className={`sidebar-status ${error||stale?"offline":""}`}><i/><span className="sidebar-copy">{status}</span></div><span className="sidebar-version sidebar-copy">你的用量，你的每一份积累。</span></div>
   </aside>
   <div className="console-main" inert={mobileMenu || undefined}>
    <header className="console-header"><div className="console-breadcrumb"><button className="sidebar-toggle desktop-toggle" aria-label={sidebarCollapsed?"展开侧边栏":"收起侧边栏"} aria-expanded={!sidebarCollapsed} aria-controls="console-navigation" onClick={()=>setSidebarCollapsed(v=>!v)}>{sidebarCollapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button><button className="sidebar-toggle mobile-toggle" aria-label="展开导航菜单" aria-expanded={mobileMenu} aria-controls="console-navigation" onClick={()=>setMobileMenu(v=>!v)}><PanelLeftOpen size={19}/></button><span>我的工作空间</span><ChevronRight size={13}/><strong>{pageNames[tab]}</strong>{tab==="tokens"&&tokenView!=="overview"&&<><ChevronRight size={13}/><strong className="token-breadcrumb">{tokenSections.find(section=>section.id===tokenView)?.label}</strong></>}</div><div className="console-header-actions"><button type="button" className="mobile-tools-toggle" aria-label="页面工具" aria-expanded={mobileTools} aria-controls="console-tools" onClick={()=>setMobileTools(value=>!value)}><Settings2 size={20}/></button><div className={"console-tools"+(mobileTools?" is-open":"")} id="console-tools"><SnowToggle/><ReadingPen/><SoundToggle/><ThemeToggle/><FullscreenToggle/><span className="header-date"><CalendarDays size={14}/>{today.replaceAll("-"," / ")}</span>{tab==="tokens"&&tokenView==="overview"&&<button className="export-report" onClick={exportUsage} disabled={!data||!days.length}><Download size={15}/><span>导出明细</span></button>}<button className="refresh" onClick={()=>setRefresh(n=>n+1)} aria-label="刷新数据"><RefreshCw size={15}/><span>刷新</span></button><span className="profile-mark" aria-label="个人数据中心">⌘</span></div></div></header>
    <MusicDock onOpenMusic={()=>selectTab("music")}/>
    <div className="console-content">
     <EdgeScene kind="cat"/>
     <TabsContent value="tokens" className="tokens-view">
      <Tabs value={tokenView} onValueChange={selectTokenView} className="token-sections">
       <TabsList className="token-section-tabs" aria-label="Token 统计功能">{tokenSections.map(section=>{const Icon=section.icon;return <TabsTrigger key={section.id} value={section.id} onClick={playNavigationSound}><Icon size={17}/><span>{section.label}</span></TabsTrigger>;})}</TabsList>
       <TabsContent value="overview">
      <div className="intro"><div><p className="eyebrow">每一天的真实使用，都有记录</p><h1>Token 用量总览</h1><p className="intro-description">按账号查看使用情况，所有 Token 数统一换算为「亿」。</p></div><span className="date-range"><CalendarDays size={14}/>{since.replaceAll("-",".")} — {today.replaceAll("-",".")}</span></div>
      <AccountOverview currentAccountEmail={data?.currentAccountEmail||null} accounts={data?.accounts||[]} profiles={data?.accountDetails||[]} history={data?.quotaHistory||[]} refreshToken={refresh} onRefresh={()=>setRefresh(n=>n+1)} totals={Object.fromEntries(accountIds.map(id=>[id,accountUsage(data?.daily||[],id).total]))} onStatistics={id=>{setAccount(id||"all");setVisibleDays(60);setPeriod("all");setTimeout(()=>document.getElementById("daily-token-records")?.scrollIntoView({behavior:"smooth",block:"start"}),60);}}/>
      <KnowledgeEntry/>
      <div className="token-controls"><div className="period-selector" role="group" aria-label="统计时间范围">{Object.entries(labels).map(([k,l])=><button key={k} aria-pressed={k===period} onClick={()=>{setPeriod(k);setVisibleDays(60);}}>{l}</button>)}</div><label className="account-filter"><span>统计账号</span><select aria-label="筛选 Token 账号" value={account} onChange={e=>{setAccount(e.target.value);setVisibleDays(60);}}><option value="all">所有账号总计</option>{(data?.accounts||[]).map(a=><option key={a.id} value={a.id}>{a.email}</option>)}<option value="unknown">账号未知</option></select></label></div>
      <section className="summary-grid" aria-label="Token 统计概览">
       <article className="summary-card total-card"><div className="summary-label"><span>{labels[period]}总用量</span><Zap size={17}/></div>{data?<TokenAmount value={total.total} prominent/>:<strong className="summary-pending">等待数据</strong>}<p className="summary-caption">{account==="all"?"所有账号合计":accountName(account)}</p></article>
       <article className="summary-card"><div className="summary-label"><span>输入 Token</span><ArrowDownLeft size={17}/></div><TokenAmount value={total.input}/><p className="summary-caption">已包含缓存 · 未缓存 {tokenYi(Math.max(0,total.input-total.cached))} 亿</p></article>
       <article className="summary-card cache-summary"><div className="summary-label"><span>缓存命中率</span><RefreshCw size={17}/></div><strong className="cache-percentage">{data?rate.toFixed(1):"—"}<em>%</em></strong><small className="cache-exact">{exact(total.cached)} 缓存 Token</small><p className="summary-caption">复用 {tokenYi(total.cached)} 亿 · 已包含在输入中</p></article>
       <article className="summary-card"><div className="summary-label"><span>输出 Token</span><ArrowUpRight size={17}/></div><TokenAmount value={total.output}/><p className="summary-caption">其中推理 {tokenYi(total.reasoning)} 亿</p></article>
       <article className="summary-card lifetime-card"><div className="summary-label"><span>累计总用量</span><Database size={17}/></div><TokenAmount value={account==="all"?allTime.total:accountUsage(data?.daily||[],account).total}/><p className="summary-caption">{account==="all"?`${accountIds.length} 个账号分组 · 包含未知账号`:"当前账号的全部累计"}</p></article>
      </section>
      <div className="usage-context"><span><ShieldCheck size={14}/>本机日志实测 · 相同邮箱自动合并</span><span>{exact(total.requests)} 次有效调用 · 1 亿 = 100,000,000 Token</span></div>
      <div className="analytics-grid">
       <section className="models panel"><div className="section-title"><h2>模型用量</h2><span>{models.length} 个模型</span></div>{models.length?models.map(([m,u])=><div className="model-row" key={m}><div><span>{m}</span><strong title={`${exact(u.total)} Token`}>{tokenYi(u.total)} 亿</strong></div><div className="model-meter"><i style={{width:`${total.total?u.total/total.total*100:0}%`}}/></div><small>{total.total?(u.total/total.total*100).toFixed(1):"0.0"}% · {exact(u.requests)} 次调用</small></div>):<p className="empty">有新用量时，模型会自动出现在这里。</p>}</section>
       <section className="account-overview panel"><div className="section-title"><div><h2>账号使用分布</h2><p className="section-description">{labels[period]} · 所有账号</p></div><span>{accountIds.length} 个分组</span></div><div className="account-ranking">{rankedAccounts.map((item,i)=><button className="ranking-row" key={item.id} aria-label={`筛选 ${item.email}`} aria-pressed={account===item.id} onClick={()=>{setAccount(item.id);setVisibleDays(60);}}><span className="ranking-avatar">{item.email.slice(0,1).toUpperCase()}</span><span className="ranking-copy"><strong>{item.email}</strong><small>{tokenYi(item.value)} 亿 Token</small></span><span className="ranking-meter"><i style={{width:`${rankingTotal?item.value/rankingTotal*100:0}%`,background:i===3?'#aad171':undefined}}/></span><span className="ranking-value">{rankingTotal?(item.value/rankingTotal*100).toFixed(0):0}%</span></button>)}</div><p className="ranking-note"><ShieldCheck size={14}/>相同邮箱自动合并，完整汇总见下方。</p></section>
       <section className="trend panel"><div className="section-title"><h2>用量趋势</h2><span>{period==="today"?"每小时":"每日"} · 单位：亿</span></div><div className="trend-total"><strong>{tokenYi(total.total)}<small> 亿</small></strong><span>{labels[period]} · {account==="all"?"所有账号":accountName(account)}</span></div><div className="chart" role="img" aria-label={`用量趋势，最高 ${tokenYi(peak)} 亿 Token，${exact(peak)} Token`}><div className="grid-lines"><span>{tokenYi(peak)}</span><span>0</span></div><div className="bars" style={{gap:`min(7px, ${40/Math.max(bars.length,1)}%)`}}>{bars.map((b,i)=><div className="bar-slot" key={i} title={`${b.label}：${tokenYi(b.value)} 亿 / ${exact(b.value)} Token`}><div className="bar" style={{height:`${b.value?Math.max(2,b.value/maximum*100):0}%`}}/></div>)}</div>{!rows.length&&<div className="chart-empty">{data?"这个时段暂无用量":"等待同步后绘制趋势"}</div>}</div><div className="chart-labels"><span>{period==="today"?"00:00":since.slice(5)}</span><span>{period==="today"?"12:00":""}</span><span>{period==="today"?"23:00":today.slice(5)}</span></div><p className="chart-note">每天按北京时间（UTC+8）保存，网页每 5 秒自动更新。</p></section>
       <UsageHeatmap totals={dailyTotals} accountName={account==='all'?'所有账号':accountName(account)} today={today}/>
      </div>
      <section className="token-accounts panel"><div className="section-title"><div><h2>每个账号，用了多少？</h2><p className="section-description">点击邮箱即可筛选；相同邮箱的使用记录自动归纳。</p></div><span>{labels[period]} / 全部累计</span></div><div className="account-usage-row account-usage-head"><span>账号邮箱</span><span>{labels[period]}用量</span><span>累计用量</span></div>{accountIds.map(id=><button className={"account-usage-row "+(account===id?"selected":"")} key={id} aria-pressed={account===id} onClick={()=>{setAccount(id);setVisibleDays(60);}}><span className="account-email"><i>{accountName(id).slice(0,1).toUpperCase()}</i><span>{accountName(id)}</span></span><TokenAmount value={accountUsage(periodRows,id).total} compact/><TokenAmount value={accountUsage(data?.daily||[],id).total} compact/></button>)}<button className="account-usage-row account-usage-total" onClick={()=>{setAccount("all");setVisibleDays(60);}}><span>所有账号总计</span><TokenAmount value={periodRows.reduce((sum,r)=>sum+r.total,0)} compact/><TokenAmount value={allTime.total} compact/></button><p className="notice">{data?.accountTrackingSince?`邮箱分组从 ${new Date(data.accountTrackingSince).toLocaleString("zh-CN",{timeZone:"Asia/Taipei",hour12:false})} 启用。`:"等待采集器读取登录邮箱。"}旧日志无邮箱、采集停止期间或切换边界的记录保留为“账号未知”，仍计入总数。</p></section>
      {total.total!==total.input+total.output&&<p className="notice">另有 {tokenYi(total.total-total.input-total.output)} 亿（{exact(total.total-total.input-total.output)} Token）在旧日志中没有输入／输出分类。</p>}
      <section id="daily-token-records" className="daily-accounts panel"><div className="section-title"><div><h2>每日使用记录</h2><p className="section-description">{account==="all"?"所有邮箱":accountName(account)} · {labels[period]} · 主数值单位为亿</p></div><span>{days.length} 条日期与账号记录</span></div><div className="daily-table-wrap"><table className="daily-table"><thead><tr><th>日期 / 邮箱</th><th>输入</th><th>缓存</th><th>输出</th><th>总计</th></tr></thead><tbody>{days.slice(0,visibleDays).map(row=><tr key={row.day+"/"+(row.accountId||"unknown")}><td>{row.day}<small>{accountName(row.accountId)}</small></td><td><TokenAmount value={row.input} compact/></td><td><TokenAmount value={row.cached} compact/></td><td><TokenAmount value={row.output} compact/></td><td><TokenAmount value={row.total} compact/></td></tr>)}</tbody></table>{!days.length&&<p className="empty">该时段暂无记录。有使用时会自动保存到对应日期。</p>}</div>{days.length>visibleDays&&<button className="library-button" onClick={()=>setVisibleDays(n=>n+60)}>显示更早的记录</button>}<p className="notice">历史用量保存在本机数据库中，自动更新不会清空记录。选择「全部」可查看、导出全部每日汇总。</p></section>
       </TabsContent>
     <TabsContent value="ledger"><Ledger/></TabsContent>
     <TabsContent value="data"><div className="intro"><div><p className="eyebrow">每次使用，清楚可查</p><h1>最近用量明细</h1><p className="intro-description">统一显示为亿，同时保留每次调用的精确 Token 数。</p></div><span className="date-range">全局最近 50 条 · 所选账号</span></div><div className="account-toolbar"><label className="account-filter">统计账号<select aria-label="筛选明细账号" value={account} onChange={e=>setAccount(e.target.value)}><option value="all">所有账号总计</option>{(data?.accounts||[]).map(a=><option key={a.id} value={a.id}>{a.email}</option>)}<option value="unknown">账号未知</option></select></label></div><div className="record-table panel"><div className="record-row record-head"><span>时间 / 模型 / 账号</span><span>缓存</span><span>输入</span><span>输出</span><span>总计</span></div>{(data?.recent||[]).filter(inAccount).map((r,i)=><div className="record-row" key={`${r.time}-${i}`}><div><strong>{r.model}</strong><small>{dayOf(new Date(r.time))} {time(r.time)}</small><small>{accountName(r.accountId)}</small></div><TokenAmount value={r.cached} compact/><TokenAmount value={r.input} compact/><TokenAmount value={r.output} compact/><TokenAmount value={r.total} compact/></div>)}{!(data?.recent||[]).filter(inAccount).length&&<p className="empty">全局最近 50 条中暂无该账号记录。更早的用量可在 Token 统计的每日记录查看。</p>}</div><p className="notice">缓存已包含在输入中；分支继承记录不会重复计入。</p></TabsContent>
     <TabsContent value="settings"><div className="intro"><div><p className="eyebrow">持续记录，自动连接</p><h1>数据连接</h1></div><ShieldCheck/></div><div className="settings-grid"><section className="panel settings-panel"><h2>本机 Codex → 用量仪表盘</h2><dl>{[["采集状态",status],["最后同步",data?new Date(data.generatedAt).toLocaleString("zh-CN",{timeZone:"Asia/Taipei",hour12:false}):"尚未同步"],["最近用量",data?.lastEvent?new Date(data.lastEvent).toLocaleString("zh-CN",{timeZone:"Asia/Taipei",hour12:false}):"暂无"],["已发现日志",`${data?.files||0} 个`],["读取异常",`${data?.errors||0} 个文件`],["计数校正",`${data?.anomalies||0} 条`],["刷新频率","网页 5 秒 / 采集约 10 秒"]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section><section className="panel settings-panel help"><h2>让记录持续更新</h2><p>本机采集器已设置为登录 Windows 后自动启动，异常退出后自动恢复。电脑需要保持开机；关闭本网页不影响后台采集。</p><p>电脑离线时，手机仍可查看最后同步的 Token 数据。重新连接后会自动补录；ME.zip 活动记录需要原电脑在线。</p><h3>同步用量与账号邮箱</h3><p>记录邮箱、时间、模型、输入、输出和缓存命中。对话正文、文件内容及 Codex 登录凭据不会上传。</p><h3>统计范围</h3><p>覆盖这台电脑的 Codex 日志，按登录邮箱分别累计，相同邮箱自动合并；每天按 UTC+8 保存。旧日志无账号身份、采集停止期间和账号切换边界的用量保留为“账号未知”，仍计入总计。其他设备和未保存在本机的云端任务不在统计范围内；Token 使用量不等同于账单或剩余额度。</p><h3>查看权限</h3><p>用量、网站收藏及额度账本保持公开查看。ME.zip 活动记录、财务收件箱、GitHub 和素材库仅网站管理账号可访问。本机原页面保持原样。</p></section></div></TabsContent>
      </Tabs>
     </TabsContent>
     <TabsContent value="qduo"><QDuoCenter/></TabsContent>
     <TabsContent value="websites"><Websites/></TabsContent>
     <TabsContent value="betteropc"><BetterOpcCenter refreshToken={refresh}/></TabsContent>

     <TabsContent value="activity"><KnowledgeEntry/><ActivityCenter refreshToken={refresh}/></TabsContent>
     <TabsContent value="shop"><ShopCenter refreshToken={refresh}/></TabsContent>
     <TabsContent value="atlas"><AtlasCenter refreshToken={refresh}/></TabsContent>
     <TabsContent value="pro"><ProCenter/></TabsContent>
     <TabsContent value="knowledge"><KnowledgeCenter/></TabsContent>
     <TabsContent value="bookshelf"><BookshelfCenter refreshToken={refresh}/></TabsContent>
     <TabsContent value="booking"><BookingCenter refreshToken={refresh}/></TabsContent>
     <TabsContent value="music"><MusicCenter/></TabsContent>
     <TabsContent value="rooster"><RoosterCenter refreshToken={refresh}/></TabsContent>
     {(["finance","github","media"] as const).map(app=><TabsContent key={app} value={app}><LocalAppCenter application={app} refreshToken={refresh}/></TabsContent>)}


     <EdgeScene kind="town"/>
     <footer><span>Codex Pulse <span className="footer-sep">/</span> 每一枚 Token，都有迹可循。</span><span>{error||(!data?"等待采集器":stale?"显示最后同步记录":`更新于 ${time(data.generatedAt)}`)}</span></footer>
    </div>
    <nav className="mobile-quick-nav" aria-label="手机快捷导航"><button type="button" aria-current={tab==="tokens"?"page":undefined} onClick={()=>selectTab("tokens")}><Zap size={20}/><span>用量</span></button><button type="button" aria-current={tab==="rooster"?"page":undefined} onClick={()=>selectTab("rooster")}><Gamepad2 size={20}/><span>游戏</span></button><button type="button" aria-current={tab==="atlas"?"page":undefined} onClick={()=>selectTab("atlas")}><MapPinned size={20}/><span>地图</span></button><button type="button" aria-expanded={mobileMenu} aria-controls="console-navigation" onClick={()=>setMobileMenu(true)}><PanelsTopLeft size={20}/><span>全部</span></button></nav>
   </div>
  </Tabs>
 </main>;
}
function TokenAmount({value,prominent=false,compact=false}:{value:number;prominent?:boolean;compact?:boolean}){
 return <span className={`token-amount ${prominent?"is-prominent":""} ${compact?"is-compact":""}`} title={`${exact(value)} Token`}><strong>{tokenYi(value)}<em> 亿</em></strong><small>{exact(value)} Token</small></span>;
}

