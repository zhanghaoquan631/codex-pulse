"use client";
import {useEffect,useRef,useState} from 'react';
import {MousePointer2,Monitor,HardDrive,Download,RefreshCw,Copy,Volume2,Search,Link2,Unplug,ShieldCheck,FolderOpen,FileJson,ArrowRight,SlidersHorizontal} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {formatBytes,isQDuoReport,type QDuoReport} from '@/lib/qduo-report';
import {textOperations,transformText,type TextOperation} from '@/lib/qduo-text';
import QDuoSafety from './qduo-safety';

const bridge='http://127.0.0.1:17643';
const aiActions=[['translate','翻译'],['polish','润色'],['summarize','总结'],['explain','解释']] as const;
const downloadBase='/qduo-windows';
const mobileQuery='(max-width:850px), (max-width:1100px) and (pointer:coarse)';
const mobileDevice=()=>!/(Win32|Win64|Windows)/i.test(navigator.platform+' '+navigator.userAgent)&&window.matchMedia(mobileQuery).matches;
type PairingStorage='persistent'|'session'|'none';
const pairingKey='qduo:connection',pairingRecordKey='qduo:pairing:v1';
type PairingRecord={version:1;key:string;revision:number};
const pairingStores=[{get:()=>localStorage,kind:'persistent' as const},{get:()=>sessionStorage,kind:'session' as const}];
function storedPairing(get:()=>Storage):PairingRecord|null{
 try{const value:unknown=JSON.parse(get().getItem(pairingRecordKey)||'null');if(value&&typeof value==='object'&&'version'in value&&value.version===1&&'key'in value&&typeof value.key==='string'&&'revision'in value&&typeof value.revision==='number'&&Number.isSafeInteger(value.revision)&&value.revision>0)return {version:1,key:value.key.trim(),revision:value.revision};}catch{}
 try{const key=get().getItem(pairingKey)?.trim();if(key)return {version:1,key,revision:0};}catch{}return null;
}
function readPairing():{key:string;storage:PairingStorage;revision:number}{
 let best:PairingRecord|null=null,storage:PairingStorage='none';
 for(const item of pairingStores){const candidate=storedPairing(item.get);if(candidate&&(!best||candidate.revision>best.revision)){best=candidate;storage=candidate.key?item.kind:'none';}}
 return {key:best?.key||'',storage,revision:best?.revision||0};
}
function pairingRevision(){return Math.max(Date.now(),...pairingStores.map(item=>(storedPairing(item.get)?.revision||0)+1));}
function savePairingRecord(get:()=>Storage,record:PairingRecord){const value=JSON.stringify(record);try{get().setItem(pairingRecordKey,value);return get().getItem(pairingRecordKey)===value;}catch{return false;}}
function rememberPairing(key:string):PairingStorage{
 const record:PairingRecord={version:1,key,revision:pairingRevision()};let result:PairingStorage='none';
 for(const item of pairingStores){if(savePairingRecord(item.get,record)){if(result==='none')result=item.kind;try{item.get().setItem(pairingKey,key);}catch{}}}return result;
}
function forgetPairing(revision=pairingRevision()){
 const record:PairingRecord={version:1,key:'',revision};
 for(const item of pairingStores){if(!savePairingRecord(item.get,record)){try{item.get().removeItem(pairingRecordKey);}catch{}}try{item.get().removeItem(pairingKey);}catch{}}
}
function pairingNotice(storage:PairingStorage,automatic=false){return storage==='persistent'?automatic?'电脑已自动连接，已记住配对。':'电脑已连接，已在此浏览器记住配对并开启自动重连。':storage==='session'?'电脑已连接，刷新当前标签页会自动重连。浏览器限制了长期保存；关闭此标签页后可能需要重新配对。':'电脑已连接，但浏览器禁止保存配对。请在普通浏览器窗口中允许此网站保存数据后重新连接。';}
export default function QDuoCenter(){
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const media=window.matchMedia(mobileQuery);setMobile(mobileDevice());if(mobileDevice())setView('text');const update=()=>{setMobile(mobileDevice());if(mobileDevice())setView(value=>['connection','safety'].includes(value)?'text':value);};media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const [view,setView]=useState('computer'),[text,setText]=useState(''),[output,setOutput]=useState(''),[operation,setOperation]=useState<TextOperation>('jsonPretty');
 const [token,setToken]=useState(''),[connected,setConnected]=useState(false),[report,setReport]=useState<QDuoReport|null>(null),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[listing,setListing]=useState('applications'),[source,setSource]=useState('');
 const fileInput=useRef<HTMLInputElement>(null),textArea=useRef<HTMLTextAreaElement>(null),generation=useRef(0);
 const autoKey=useRef(''),connectedRef=useRef(false),activeRequests=useRef(0),importedMode=useRef(false);
 const [pairingStorage,setPairingStorage]=useState<PairingStorage>('none');
 useEffect(()=>{connectedRef.current=connected;},[connected]);
 useEffect(()=>{
  let live=true,pending=false;
  const saved=readPairing();autoKey.current=saved.key;setToken(saved.key);setPairingStorage(saved.storage);if(saved.key)setMessage('已找到保存的配对，正在自动连接本机…');
  async function reconnect(){
   const key=autoKey.current,current=generation.current;
   if(!live||pending||!key||activeRequests.current||document.hidden||mobileDevice())return;
   pending=true;
   try{
    if(connectedRef.current){
     try{const status=await request('/connection/status',undefined,key,6000);if(!status||typeof status!=='object'||!('ok' in status)||status.ok!==true)throw new Error('请更新 Windows 客户端。');}
     catch(e){if(!e||typeof e!=='object'||!('status' in e)||e.status!==404)throw e;const next=await request('/report',undefined,key,20000);if(!isQDuoReport(next))throw new Error('请更新 Windows 客户端。');if(live&&current===generation.current)setMessage('电脑已连接。更新 Windows 客户端后可使用 D 盘备份清理。');}
     return;
    }
    const next=await request('/report',undefined,key,20000);
    if(!live||current!==generation.current||key!==autoKey.current)return;
    if(!isQDuoReport(next))throw new Error('请更新 Windows 客户端。');
    const storage=rememberPairing(key);setPairingStorage(storage);setToken(key);setReport(next);setConnected(true);connectedRef.current=true;setSource('实时本机连接');setMessage(pairingNotice(storage,true));
   }catch(e){
    if(!live||current!==generation.current||key!==autoKey.current)return;
    setConnected(false);connectedRef.current=false;setSource('上次读取的本机报告');
    if(e instanceof Error&&e.message.includes('连接码不正确')){autoKey.current='';forgetPairing();setPairingStorage('none');setToken('');setMessage('配对码已失效，请从客户端重新复制配对码。');}
    else setMessage('等待本机客户端，网页会自动重连。浏览器首次询问本地网络访问时请允许。');
   }finally{pending=false;}
  }
  const onVisible=()=>{if(!document.hidden)void reconnect();};
  void reconnect();const timer=window.setInterval(()=>void reconnect(),15000);
  window.addEventListener('online',onVisible);document.addEventListener('visibilitychange',onVisible);
  const onStorage=(event:StorageEvent)=>{
   if((event.key!==pairingKey&&event.key!==pairingRecordKey)||importedMode.current)return;
   let saved=readPairing();
   if(event.key===pairingKey){if(event.newValue===null){forgetPairing();saved={key:'',storage:'none',revision:readPairing().revision};}else if(saved.revision===0)saved={key:event.newValue.trim(),storage:'persistent',revision:0};}
   if(saved.key&&saved.key===autoKey.current)return;
   generation.current++;setBusy('');autoKey.current=saved.key;setToken(saved.key);setConnected(false);connectedRef.current=false;setPairingStorage(saved.storage);
   if(!saved.key){forgetPairing(saved.revision||undefined);setReport(null);setSource('');setMessage('已取消自动连接。');}else void reconnect();
  };window.addEventListener('storage',onStorage);
  return()=>{live=false;generation.current++;window.clearInterval(timer);window.removeEventListener('online',onVisible);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('storage',onStorage);};
 },[]);
 async function request(path:string,body?:unknown,key=autoKey.current||token,timeout=30000){
  if(mobileDevice())throw new Error('此功能在原 Windows 电脑上使用。手机可处理文本和导入体检报告。');
  activeRequests.current++;try{
  const response=await fetch(bridge+path,{method:body===undefined?'GET':'POST',mode:'cors',cache:'no-store',headers:{'X-QDuo-Token':key,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});
  const result=await response.json();
  const error=result&&typeof result==='object'&&'error' in result&&typeof result.error==='string'?result.error:'本机操作失败';
  if(!response.ok)throw Object.assign(new Error(response.status===401?'连接码不正确，请从 Windows 客户端重新复制。':error),{status:response.status});
  return result;
  }finally{activeRequests.current--;}
 }
 async function connect(){
  if(!token.trim()){setMessage('请先打开 Windows 客户端，复制其中的网页配对码。');setView('connection');return;}
  importedMode.current=false;const current=++generation.current;setBusy('正在连接电脑');setMessage('');
  try{const next=await request('/report',undefined,token.trim());if(current!==generation.current)return;if(!isQDuoReport(next))throw new Error('本机报告格式不兼容，请更新客户端。');setReport(next);setConnected(true);connectedRef.current=true;autoKey.current=token.trim();setSource('实时本机连接');setView('computer');const storage=rememberPairing(token.trim());setPairingStorage(storage);setMessage(pairingNotice(storage));}
  catch(e){if(current===generation.current){setConnected(false);setMessage(e instanceof TypeError?'未能连接本机。请确认客户端正在运行；浏览器提示访问本地网络时允许连接。也可导入客户端导出的报告。':e instanceof Error?e.message:'连接失败');}}
  finally{if(current===generation.current)setBusy('');}
 }
 function disconnect(){generation.current++;autoKey.current='';connectedRef.current=false;setConnected(false);setReport(null);setSource('');setToken('');setBusy('');forgetPairing();setPairingStorage('none');setMessage('已断开并忘记这台电脑，自动重连已停止。');}
 async function scan(deep=false){
  const current=++generation.current;setBusy(deep?'正在扫描缓存和大文件':'正在刷新电脑状态');setMessage('');
  try{const next=await request(deep?'/scan':'/report',deep?{}:undefined,autoKey.current||token,deep?180000:30000);if(current!==generation.current)return;if(!isQDuoReport(next))throw new Error('未收到完整报告，已保留原来的结果。');setReport(next);setSource('实时本机连接');setMessage(deep?'扫描完成。详情中的扫描限制也已列出。':'电脑状态已更新。');}
  catch(e){if(current===generation.current)setMessage(e instanceof Error?e.message:'扫描失败，请检查客户端。');}finally{if(current===generation.current)setBusy('');}
 }
 async function localAction(kind:string,action:string,input=text){
  if(!connected){setView('connection');setMessage('此操作需要 Windows 客户端。连接后使用客户端中设置的模型。');return;}
  const current=++generation.current;setBusy('正在处理');setMessage('');
  try{const result=await request('/action',{kind,action,text:input},autoKey.current||token,90000);if(current!==generation.current)return;const obj=result&&typeof result==='object'?result as Record<string,unknown>:null;setOutput(typeof result==='string'?result:typeof obj?.result==='string'?obj.result:typeof obj?.output==='string'?obj.output:JSON.stringify(result));}
  catch(e){if(current===generation.current)setMessage(e instanceof Error?e.message:'操作失败');}finally{if(current===generation.current)setBusy('');}
 }
 async function importReport(file?:File){
  if(!file)return;setMessage('');
  try{if(file.size>8*1024*1024)throw new Error('报告文件不能超过 8 MB。');const value:unknown=JSON.parse(await file.text());if(!isQDuoReport(value))throw new Error('请选择 QDuo Windows 导出的 JSON 体检报告。');generation.current++;importedMode.current=true;autoKey.current='';connectedRef.current=false;setBusy('');setConnected(false);setReport(value);setSource('导入的本机报告');setView('computer');setMessage('报告已在本页打开，未上传到网站。');}
  catch(e){setMessage(e instanceof Error?e.message:'报告读取失败');}finally{if(fileInput.current)fileInput.current.value='';}
 }
 function exportReport(){if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`QDuo-体检-${report.generatedAt.slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function transform(){try{setOutput(transformText(text,operation));setMessage('');}catch{setMessage(operation==='urlDecode'?'URL 编码格式不正确。':'JSON 格式不正确，请检查输入。');}}
 async function copy(){try{await navigator.clipboard.writeText(output);setMessage('结果已复制。');}catch{setMessage('浏览器未允许复制，请在结果框中手动选择并复制。');}}
 function speak(){if(!('speechSynthesis'in window)){setMessage('当前浏览器不支持朗读，请使用 Windows 客户端。');return;}window.speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(output||text);voice.lang=/[\u3400-\u9fff]/.test(voice.text)?'zh-CN':'en-US';window.speechSynthesis.speak(voice);}
 function useSelection(){const area=textArea.current;if(area){const selected=text.slice(area.selectionStart,area.selectionEnd);if(selected){setText(selected);return;}}const selected=window.getSelection()?.toString();if(selected)setText(selected);else setMessage('先选中本页的文字，或把其他应用的文字粘贴进来。');}
 const caches=report?.caches||[],cacheTotal=caches.reduce((n,c)=>n+c.bytes,0),oldTotal=caches.reduce((n,c)=>n+c.eligibleBytes,0);
 const apps=report?.applications.filter(a=>`${a.name} ${a.publisher}`.toLowerCase().includes(query.toLowerCase()))||[];
 const processes=report?.processes.filter(p=>p.name.toLowerCase().includes(query.toLowerCase()))||[];
 return <section className={"qd-center"+(mobile?" qd-mobile":"")}>
  <div className="intro"><div><p className="eyebrow">本机工具 · Windows</p><h1><MousePointer2 size={25}/>QDuo 工作台</h1><p className="intro-description">划词处理、快捷动作与电脑体检。</p></div><div className="qd-top-actions"><span className={`qd-status ${connected?'connected':''}`}><Monitor size={15}/>{connected?'电脑已连接':report?'已导入报告':mobile?'手机工具':'未连接电脑'}</span>{!mobile&&<a className="library-button" href={downloadBase+'/QDuo-Windows.zip'} download><Download size={16}/>下载 Windows 版</a>}</div></div>
  <Tabs value={view} onValueChange={setView} className="qd-tabs">
   <TabsList className="qd-tab-list" aria-label="QDuo 功能"><TabsTrigger value="computer"><HardDrive size={16}/>{mobile?'电脑报告':'电脑体检'}</TabsTrigger>{!mobile&&<TabsTrigger value="safety"><ShieldCheck size={16}/>清理与文件</TabsTrigger>}<TabsTrigger value="text"><MousePointer2 size={16}/>{mobile?'文本处理':'划词工作台'}</TabsTrigger>{!mobile&&<TabsTrigger value="connection"><Link2 size={16}/>连接与下载</TabsTrigger>}</TabsList>
   {(message||busy)&&<p className={`qd-message ${busy?'is-busy':''}`} role="status">{busy&&<RefreshCw size={15} className="qd-spinning"/>}{busy||message}</p>}
   <TabsContent value="computer">
    <div className="qd-actions"><button className="library-button primary qd-desktop-only" disabled={!connected||!!busy} onClick={()=>scan(true)}><Search size={16}/>扫描缓存与大文件</button><button className="library-button qd-desktop-only" disabled={!connected||!!busy} onClick={()=>scan()}><RefreshCw size={16}/>刷新状态</button><button className="library-button" onClick={()=>fileInput.current?.click()}><FolderOpen size={16}/>导入报告</button>{report&&<button className="library-button" onClick={exportReport}><FileJson size={16}/>导出报告</button>}</div>
    {!report?<div className="qd-empty panel"><HardDrive size={36}/><h2>{mobile?'导入电脑体检报告':'查看这台电脑的真实状态'}</h2><p>{mobile?'选择 Windows 客户端导出的 JSON 报告，即可在手机查看。实时扫描和电脑控制请在原 Windows 电脑使用。':'运行 Windows 客户端并连接，可查看磁盘占用、应用、进程和缓存。也可导入客户端导出的报告。'}</p><button className="library-button primary" onClick={()=>mobile?fileInput.current?.click():setView('connection')}>{mobile?'选择报告':'连接电脑'}<ArrowRight size={16}/></button></div>:<>
     <div className="qd-report-heading"><strong>{report.computer}</strong><span>{report.os}</span><small>{source} · {new Date(report.generatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Taipei',hour12:false})}</small></div>
     <div className="qd-disk-grid">{report.disks.map(d=><article key={d.name} className="panel qd-disk"><div className="qd-panel-title"><h2>{d.name}</h2><HardDrive size={18}/></div><strong>{formatBytes(d.freeBytes)}<small>可用空间</small></strong><div className="qd-meter" role="img" aria-label={`${d.name} 已使用 ${formatBytes(d.totalBytes-d.freeBytes)}，共 ${formatBytes(d.totalBytes)}`}><span style={{width:`${d.totalBytes?(d.totalBytes-d.freeBytes)/d.totalBytes*100:0}%`}}/></div><p>已用 {formatBytes(d.totalBytes-d.freeBytes)} / 共 {formatBytes(d.totalBytes)}</p></article>)}</div>
     <div className="qd-stats"><div><span>已安装应用</span><strong>{report.applications.length}</strong></div><div><span>运行进程</span><strong>{report.processes.length}</strong></div><div><span>已扫描缓存</span><strong>{formatBytes(cacheTotal)}</strong></div><div><span>7 天前的缓存文件</span><strong>{formatBytes(oldTotal)}</strong></div></div>
     <section className="panel qd-cache"><div className="qd-panel-title"><div><h2>缓存与清理建议</h2><p>扫描估计值；在 Windows 存储设置中查看并确认清理项目。</p></div><button className="library-button" disabled={!connected||!!busy} onClick={async()=>{try{await request('/open-cleanup',{});setMessage('已打开 Windows 存储设置，请在电脑上查看并确认清理项目。');}catch{setMessage('无法打开本地窗口，请检查客户端。');}}}><SlidersHorizontal size={16}/>打开 Windows 清理设置</button></div>{caches.length?<div className="qd-scroll"><table><thead><tr><th>缓存位置</th><th>总占用</th><th>7 天前文件</th><th>读取异常</th></tr></thead><tbody>{caches.map(c=><tr key={c.id}><td><strong>{c.name}</strong><small>{c.path}</small></td><td>{formatBytes(c.bytes)}</td><td>{formatBytes(c.eligibleBytes)}</td><td>{c.errors||'—'}</td></tr>)}</tbody></table></div>:<p className="qd-subtle">尚无缓存扫描结果。点击“扫描缓存与大文件”读取。</p>}</section>
     <section className="panel qd-list"><div className="qd-panel-title"><div className="qd-list-switch" role="group" aria-label="电脑状态列表">{[['applications','已安装应用'],['processes','运行进程'],['startup','启动项'],['files','大文件']].map(([key,label])=><button key={key} aria-pressed={listing===key} onClick={()=>{setListing(key);setQuery('');}}>{label}</button>)}</div>{(listing==='applications'||listing==='processes')&&<input type="search" aria-label="筛选应用或进程" placeholder="搜索名称" value={query} onChange={e=>setQuery(e.target.value)}/>}</div><div className="qd-scroll">
      {listing==='applications'&&<table><thead><tr><th>应用</th><th>版本 / 发布者</th><th>登记占用</th></tr></thead><tbody>{apps.slice(0,200).map((a,i)=><tr key={i}><td>{a.name}</td><td>{a.version||'—'}<small>{a.publisher}</small></td><td>{a.estimatedBytes?formatBytes(a.estimatedBytes):'未登记'}</td></tr>)}</tbody></table>}
      {listing==='processes'&&<table><thead><tr><th>进程 / PID</th><th>内存占用</th><th>累计 CPU 秒</th></tr></thead><tbody>{processes.slice(0,200).map(p=><tr key={p.id}><td>{p.name}<small>PID {p.id}</small></td><td>{formatBytes(p.memoryBytes)}</td><td>{p.cpuSeconds.toFixed(1)}</td></tr>)}</tbody></table>}
      {listing==='startup'&&<table><thead><tr><th>启动项</th><th>启动命令</th></tr></thead><tbody>{report.startup.map((s,i)=><tr key={i}><td>{s.name}</td><td className="qd-path">{s.command}</td></tr>)}</tbody></table>}
      {listing==='files'&&<table><thead><tr><th>文件位置</th><th>占用空间</th></tr></thead><tbody>{report.largeFiles.map((f,i)=><tr key={i}><td className="qd-path">{f.path}</td><td>{formatBytes(f.bytes)}</td></tr>)}</tbody></table>}
     </div><p className="qd-subtle">{listing==='applications'?`匹配 ${apps.length} 个应用，显示前 200 个。登记占用由应用提供，可能不完整。`:listing==='processes'?`匹配 ${processes.length} 个进程，显示前 200 个。累计 CPU 秒不是当前 CPU 使用率。`:listing==='files'?'大文件仅建议核对，不会自动删除。扫描范围和限制见下方。':'列出注册表中的启动项；服务和计划任务不在此列表内。'}</p></section>
     {report.errors.length>0&&<details className="panel qd-errors"><summary>扫描范围与限制 · {report.errors.length} 条</summary><ul>{report.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></details>}
    </>}
   </TabsContent>
   <TabsContent value="safety"><QDuoSafety connected={connected} request={request}/></TabsContent>
   <TabsContent value="text">
    <div className="qd-text-grid"><section className="panel"><div className="qd-panel-title"><h2>输入文字</h2><button className="library-button" onClick={useSelection}><MousePointer2 size={15}/>使用选中文字</button></div><textarea ref={textArea} aria-label="要处理的文字" value={text} onChange={e=>setText(e.target.value)} placeholder="粘贴或输入文字，也可以在本页选择文字。" maxLength={200000}/><div className="qd-ai-actions qd-desktop-only">{aiActions.map(([action,label])=><button className="library-button" key={action} disabled={mobile||!text.trim()||!!busy} onClick={()=>localAction('ai',action)}>{label}</button>)}</div><p className="qd-subtle qd-desktop-only">AI 使用 Windows 客户端中配置的模型。文字会发给你选择的模型服务。</p><div className="qd-transform"><select aria-label="本地文本处理动作" value={operation} onChange={e=>setOperation(e.target.value as TextOperation)}>{textOperations.map(([op,label])=><option key={op} value={op}>{label}</option>)}</select><button className="library-button primary" disabled={!text} onClick={transform}>本地处理<ArrowRight size={15}/></button></div><div className="qd-actions"><button className="library-button" disabled={!text.trim()} onClick={()=>window.open('https://www.google.com/search?q='+encodeURIComponent(text),'_blank','noopener') }><Search size={15}/>搜索文字</button><button className="library-button" disabled={!text} onClick={speak}><Volume2 size={15}/>朗读</button></div></section>
     <section className="panel"><div className="qd-panel-title"><h2>处理结果</h2><button className="library-button" disabled={!output} onClick={copy}><Copy size={15}/>复制</button></div><textarea aria-label="处理结果" value={output} onChange={e=>setOutput(e.target.value)} placeholder="处理结果会显示在这里。"/><div className="qd-actions"><button className="library-button" disabled={!output} onClick={()=>{setText(output);setOutput('');}}>替换本页输入</button><button className="library-button" disabled={!output} onClick={()=>setText(v=>v+(v?'\n':'')+output)}>追加到本页输入</button></div><p className="qd-subtle">{mobile?'文本转换在手机浏览器内完成。电脑报告可从“电脑报告”导入；跨应用划词和截图识字请在 Windows 客户端使用。':'跨应用划词、截图识字和回写由桌面客户端完成：Ctrl + Alt + Q 划词，Ctrl + Alt + S 截图。'}</p></section></div>
   </TabsContent>
   <TabsContent value="connection"><div className="qd-connect-grid">
    <section className="panel qd-connect"><div className="qd-panel-title"><h2>连接 Windows 电脑</h2><Monitor size={22}/></div><p className="qd-subtle">网页连接 1.2.1 · 自动连接：{pairingStorage==='persistent'?'已长期记住配对':pairingStorage==='session'?'已记住当前标签页':'尚未保存配对'}</p><ol><li>下载并解压 Windows 版，双击 <strong>QDuoWindows.exe</strong>。</li><li>在客户端“网页连接”处复制配对码。</li><li>粘贴到下方；浏览器询问访问本地网络时，允许连接。</li></ol><label htmlFor="qd-connection-code">网页连接码</label><input id="qd-connection-code" type="password" autoComplete="off" spellCheck={false} value={token} onChange={e=>setToken(e.target.value)} placeholder="粘贴 Windows 客户端显示的连接码"/><div className="qd-actions"><button className="library-button primary" disabled={!!busy} onClick={connect}><Link2 size={16}/>连接本机</button><button className="library-button" onClick={disconnect}><Unplug size={16}/>断开并忘记</button></div><p className="qd-subtle">配对码仅保存在此浏览器。重新打开网页或客户端重启后会自动重连；“断开并忘记”会停止自动连接。客户端可开启“登录 Windows 时自动启动”。</p></section>
    <section className="panel qd-download"><div className="qd-panel-title"><h2>Windows 桌面版</h2><MousePointer2 size={23}/></div><p>选中其他应用中的文字，按快捷键打开动作窗口。支持 AI 动作、文本转换、朗读、搜索、截图识字和本地脚本。</p><div className="qd-hotkeys"><span>划词动作<kbd>Ctrl + Alt + Q</kbd></span><span>截图识字<kbd>Ctrl + Alt + S</kbd></span></div><a className="library-button primary" href={downloadBase+'/QDuo-Windows.zip'} download><Download size={16}/>下载便携版</a><a className="library-button" href={downloadBase+'/QDuo-Windows-Source.zip'} download><FileJson size={16}/>下载源代码</a><p className="qd-subtle">Windows 10 / 11 · .NET Framework 4.8 · 首次使用 AI 需在客户端配置模型。截图识字使用 Windows 已安装的 OCR 语言。</p><a className="qd-source-link" href="https://github.com/XueshiQiao/qduo" target="_blank" rel="noopener">基于 QDuo 的功能思路独立实现 · GPL-3.0</a></section>
   </div><div className="qd-privacy"><ShieldCheck size={17}/><p>体检、文件详情和图片预览由本机提供，不上传到网站。低风险缓存清理使用可恢复隔离；中风险隔离和 Defender 威胁处理在本机窗口确认。模型密钥保存在 Windows 客户端中。</p></div></TabsContent>
  </Tabs>
  <input ref={fileInput} type="file" accept="application/json,.json" aria-label="导入 QDuo 本机体检报告" className="qd-hidden-input" onChange={e=>importReport(e.target.files?.[0])}/>
 </section>;
}






