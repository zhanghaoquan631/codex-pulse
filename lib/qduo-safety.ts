export type NativeRequest = (path:string, body?:unknown, key?:string, timeout?:number)=>Promise<unknown>;
export type Risk = 'low'|'medium';
export type CleanupCandidate = {id:string;path:string;name:string;bytes:number;risk:Risk;reason:string;createdAt:string;modifiedAt:string;lastAccessAt:string;application:string;applicationEvidence:string};
export type CleanupScan = {schemaVersion:1;generatedAt:string;scanId:string;complete:boolean;examinedFiles:number;protectedFiles:number;candidates:CleanupCandidate[];totals:{lowFiles:number;mediumFiles:number;lowBytes:number;mediumBytes:number};exclusions:string[];errors:string[];suggestions:string[]};
export type CleanupPlan = {schemaVersion:1;planId:string;createdAt:string;expiresAt:string;risk:Risk;requiresMediumApproval:boolean;files:CleanupCandidate[];fileCount:number;logicalBytes:number;excludedCount:number;warnings:string[]};
export type CleanupResult = {schemaVersion:1;transactionId:string;startedAt:string;completedAt:string;status:string;quarantinePath:string;fileCount:number;quarantinedFiles:number;restoredFiles?:number;skippedFiles:number;failedFiles:number;logicalBytes:number;archiveBytes:number;drives:{name:string;freeBefore:number;freeAfter:number;freeDelta:number}[];results:{id:string;path:string;status:'quarantined'|'skipped'|'failed'|'restored';bytes:number;reason:string}[];suggestions:string[]};
export type CleanupHistory = {transactionId:string;startedAt:string;completedAt:string|null;status:string;fileCount:number;quarantinedFiles:number;restoredFiles:number;logicalBytes:number;archiveBytes:number;canRestore:boolean};
export type SafetyStatus = {backupDrive?:string;schemaVersion:1;generatedAt:string;policyVersion:string;quarantinePath:string;lastScan:CleanupScan|null;lastCleanup:CleanupResult|null;transactions:CleanupHistory[];busy:boolean;errors:string[]};
export type DefenderJob = {id:string;action:string;state:'running'|'succeeded'|'failed';startedAt:string;completedAt:string|null;message:string;exitCode:number|null};
export type DefenderStatus = {schemaVersion:1;checkedAt:string;available:boolean;status:null|{antivirusEnabled:boolean;realTimeProtectionEnabled:boolean;signatureVersion:string;signatureUpdatedAt:string|null;quickScanStartedAt:string|null;quickScanEndedAt:string|null;fullScanStartedAt:string|null;fullScanEndedAt:string|null};threats:{id:string|number;name:string;severityId:number;isActive:boolean;resources:string[]}[];detections:{id:string|number;threatId:string|number;initialDetectionAt:string|null;lastStatusChangeAt:string|null;actionSuccess:boolean;resources:string[]}[];errors:string[];suggestions:string[];job:DefenderJob|null};
export type SavedBookmark = {id:string;title:string;url:string;projectId?:string};
export type FileRoot = {id:string;name:string;path:string;category:string};
export type FileBinding = {path:string;bookmarkId:string;rootId:string|null};
export type FileRoots = {roots:FileRoot[];bindings:FileBinding[]};
export type LocalFile = {id:string;path:string;name:string;bytes:number;extension:string;createdAt:string;lastModifiedAt:string;lastAccessAt:string;risk:'low'|'medium'|'protected'|'unknown';reasons:string[];creator:{name:string;confidence:'unknown'|'inferred'|'verified';evidence:string};links:{id:string;title:string;url:string;confidence:'explicit'|'exact'|'domain'|'inferred';evidence:string}[];isImage:boolean;thumbnailAvailable:boolean;rootId:string;category:string};
export type FileCoverage = {complete:boolean;truncated:boolean;examinedFiles:number;durationMs:number;roots:(FileRoot&{complete:boolean;examinedFiles:number;errors:string[]})[];errors:string[];notes:string[]};
export type FilePage = {items:LocalFile[];total:number;nextCursor:string|null;generatedAt:string;coverage:FileCoverage};
export type FileCatalog = {schemaVersion:1;generatedAt:string;summary:{totalFiles:number;totalBytes:number;lowFiles:number;mediumFiles:number;protectedFiles:number;images:number;linkedFiles:number};coverage:FileCoverage;provenance:{sysmonAvailable:boolean;examinedEvents:number;note:string};bookmarksCount:number;bindings:FileBinding[];firstPage:FilePage};

type RecordValue = Record<string,unknown>;
const record=(v:unknown):v is RecordValue=>!!v&&typeof v==='object'&&!Array.isArray(v);
const string=(v:unknown):v is string=>typeof v==='string'&&v.length<=32768;
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const signed=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const bool=(v:unknown):v is boolean=>typeof v==='boolean';
const stamp=(v:unknown)=>string(v)&&Number.isFinite(Date.parse(v));
const nullableStamp=(v:unknown)=>v===null||stamp(v);
const identity=(v:unknown)=>string(v)||number(v);
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=20000&&v.every(string);
const array=(v:unknown,check:(item:RecordValue)=>boolean)=>Array.isArray(v)&&v.length<=200000&&v.every(item=>record(item)&&check(item));
const risk=(v:unknown)=>v==='low'||v==='medium';
const root=(r:RecordValue)=>string(r.id)&&string(r.name)&&string(r.path)&&string(r.category);
const binding=(r:RecordValue)=>string(r.path)&&string(r.bookmarkId)&&(r.rootId===null||string(r.rootId));
const candidate=(r:RecordValue)=>string(r.id)&&string(r.path)&&string(r.name)&&number(r.bytes)&&risk(r.risk)&&string(r.reason)&&stamp(r.createdAt)&&stamp(r.modifiedAt)&&stamp(r.lastAccessAt)&&string(r.application)&&string(r.applicationEvidence);
function scan(v:unknown):boolean {if(!record(v)||!record(v.totals))return false;const totals=v.totals;return v.schemaVersion===1&&stamp(v.generatedAt)&&string(v.scanId)&&bool(v.complete)&&number(v.examinedFiles)&&number(v.protectedFiles)&&array(v.candidates,candidate)&&['lowFiles','mediumFiles','lowBytes','mediumBytes'].every(k=>number(totals[k]))&&strings(v.exclusions)&&strings(v.errors)&&strings(v.suggestions);}
function result(v:unknown):boolean {if(!record(v))return false;return v.schemaVersion===1&&string(v.transactionId)&&stamp(v.startedAt)&&stamp(v.completedAt)&&string(v.status)&&string(v.quarantinePath)&&['fileCount','quarantinedFiles','skippedFiles','failedFiles','logicalBytes','archiveBytes'].every(k=>number(v[k]))&&(v.restoredFiles===undefined||number(v.restoredFiles))&&array(v.drives,d=>string(d.name)&&number(d.freeBefore)&&number(d.freeAfter)&&signed(d.freeDelta))&&array(v.results,r=>string(r.id)&&string(r.path)&&['quarantined','skipped','failed','restored'].includes(String(r.status))&&number(r.bytes)&&string(r.reason))&&strings(v.suggestions);}
function coverage(v:unknown):boolean {if(!record(v))return false;return bool(v.complete)&&bool(v.truncated)&&number(v.examinedFiles)&&number(v.durationMs)&&array(v.roots,r=>root(r)&&bool(r.complete)&&number(r.examinedFiles)&&strings(r.errors))&&strings(v.errors)&&strings(v.notes);}
function localFile(r:RecordValue):boolean {if(!record(r.creator))return false;return string(r.id)&&string(r.path)&&string(r.name)&&number(r.bytes)&&string(r.extension)&&stamp(r.createdAt)&&stamp(r.lastModifiedAt)&&stamp(r.lastAccessAt)&&['low','medium','protected','unknown'].includes(String(r.risk))&&strings(r.reasons)&&string(r.creator.name)&&['unknown','inferred','verified'].includes(String(r.creator.confidence))&&string(r.creator.evidence)&&array(r.links,l=>string(l.id)&&string(l.title)&&safeBookmarkHref(l.url)!==null&&['explicit','exact','domain','inferred'].includes(String(l.confidence))&&string(l.evidence))&&bool(r.isImage)&&bool(r.thumbnailAvailable)&&string(r.rootId)&&string(r.category);}
function page(v:unknown):boolean {if(!record(v))return false;return array(v.items,localFile)&&number(v.total)&&(v.nextCursor===null||string(v.nextCursor))&&stamp(v.generatedAt)&&coverage(v.coverage);}
function checked<T>(value:unknown,valid:boolean,name:string):T {if(!valid)throw new Error(`${name}格式不兼容，请更新 Windows 客户端。`);return value as T;}
export const parseCleanupScan=(v:unknown)=>checked<CleanupScan>(v,scan(v),'清理扫描');
export const parseCleanupResult=(v:unknown)=>checked<CleanupResult>(v,result(v),'清理结果');
export function parseCleanupPlan(v:unknown):CleanupPlan {const valid=record(v)&&v.schemaVersion===1&&string(v.planId)&&stamp(v.createdAt)&&stamp(v.expiresAt)&&risk(v.risk)&&bool(v.requiresMediumApproval)&&array(v.files,candidate)&&number(v.fileCount)&&number(v.logicalBytes)&&number(v.excludedCount)&&strings(v.warnings);return checked(v,valid,'清理计划');}
export function parseSafetyStatus(v:unknown):SafetyStatus {const valid=record(v)&&v.schemaVersion===1&&stamp(v.generatedAt)&&string(v.policyVersion)&&string(v.quarantinePath)&&(v.lastScan===null||scan(v.lastScan))&&(v.lastCleanup===null||result(v.lastCleanup))&&bool(v.busy)&&strings(v.errors)&&array(v.transactions,t=>string(t.transactionId)&&stamp(t.startedAt)&&nullableStamp(t.completedAt)&&string(t.status)&&['fileCount','quarantinedFiles','restoredFiles','logicalBytes','archiveBytes'].every(k=>number(t[k]))&&bool(t.canRestore));return checked(v,valid,'安全维护状态');}
export function parseDefenderStatus(v:unknown):DefenderStatus {if(!record(v))return checked(v,false,'病毒防护状态');const status=v.status;const valid=v.schemaVersion===1&&stamp(v.checkedAt)&&bool(v.available)&&(status===null||record(status)&&bool(status.antivirusEnabled)&&bool(status.realTimeProtectionEnabled)&&string(status.signatureVersion)&&['signatureUpdatedAt','quickScanStartedAt','quickScanEndedAt','fullScanStartedAt','fullScanEndedAt'].every(k=>nullableStamp(status[k])))&&(!v.available||status!==null)&&array(v.threats,t=>identity(t.id)&&string(t.name)&&number(t.severityId)&&bool(t.isActive)&&strings(t.resources))&&array(v.detections,d=>identity(d.id)&&identity(d.threatId)&&nullableStamp(d.initialDetectionAt)&&nullableStamp(d.lastStatusChangeAt)&&bool(d.actionSuccess)&&strings(d.resources))&&strings(v.errors)&&strings(v.suggestions)&&(v.job===null||record(v.job)&&string(v.job.id)&&string(v.job.action)&&['running','succeeded','failed'].includes(String(v.job.state))&&stamp(v.job.startedAt)&&nullableStamp(v.job.completedAt)&&string(v.job.message)&&(v.job.exitCode===null||signed(v.job.exitCode)));return checked(v,valid,'病毒防护状态');}
export function parseFileRoots(v:unknown):FileRoots {return checked(v,record(v)&&array(v.roots,root)&&array(v.bindings,binding),'文件目录');}
export const parseFilePage=(v:unknown)=>checked<FilePage>(v,page(v),'文件目录页');
export function parseFileCatalog(v:unknown):FileCatalog {if(!record(v)||!record(v.summary))return checked(v,false,'文件扫描');const summary=v.summary;const valid=v.schemaVersion===1&&stamp(v.generatedAt)&&['totalFiles','totalBytes','lowFiles','mediumFiles','protectedFiles','images','linkedFiles'].every(k=>number(summary[k]))&&coverage(v.coverage)&&record(v.provenance)&&bool(v.provenance.sysmonAvailable)&&number(v.provenance.examinedEvents)&&string(v.provenance.note)&&number(v.bookmarksCount)&&array(v.bindings,binding)&&page(v.firstPage);return checked(v,valid,'文件扫描');}
export function thumbnailUrl(v:unknown):string {if(!record(v)||!string(v.fileId)||v.mime!=='image/jpeg'||typeof v.base64!=='string'||!v.base64.length||v.base64.length>349528||v.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.base64)||!number(v.width)||!number(v.height)||v.width<1||v.height<1||v.width>320||v.height>240)throw new Error('本机缩略图格式不兼容。');return `data:image/jpeg;base64,${v.base64}`;}

const timeFormatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function localFileTime(value:string|null|undefined):string {if(!value||!Number.isFinite(Date.parse(value)))return '未记录';const fields=Object.fromEntries(timeFormatter.formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${fields.year}年${fields.month}月${fields.day}日 ${fields.hour}时${fields.minute}分${fields.second}秒`;}
export function safeBookmarkHref(value:unknown):string|null {if(typeof value!=='string'||value.length>32768)return null;try{const url=new URL(value);return (url.protocol==='https:'||url.protocol==='http:')&&!url.username&&!url.password?value:null;}catch{return null;}}
export const creatorLabels={unknown:'创建应用未知',inferred:'推断的创建应用',verified:'有事件证据的创建应用'} as const;
export const linkLabels={explicit:'手动绑定',exact:'精确关联',domain:'同域线索',inferred:'推断关联'} as const;
export const riskLabels={low:'低风险缓存',medium:'中风险 · 需电脑确认',protected:'受保护文件',unknown:'尚未确认用途'} as const;
export function nativeError(error:unknown):string {const text=error instanceof Error?error.message:'本机操作未完成。';return /Endpoint or method not found|404/.test(text)?'当前 Windows 客户端尚未提供这个接口，请先更新客户端再重试。':text;}

let thumbnailActive=0;
const thumbnailQueue:(()=>void)[]=[];
function drainThumbnails(){while(thumbnailActive<4&&thumbnailQueue.length)thumbnailQueue.shift()?.();}
export function loadNativeThumbnail(request:NativeRequest,id:string,valid:()=>boolean):Promise<string|null>{return new Promise((resolve,reject)=>{thumbnailQueue.push(()=>{if(!valid()){resolve(null);drainThumbnails();return;}thumbnailActive++;void request('/files/thumbnail',{id},undefined,20000).then(value=>{if(!record(value)||value.fileId!==id)throw new Error('本机返回的缩略图与此文件不匹配。');return thumbnailUrl(value);}).then(resolve,reject).finally(()=>{thumbnailActive--;drainThumbnails();});});drainThumbnails();});}

export function boundedBookmarks(all:SavedBookmark[],bindings:FileBinding[]):{items:SavedBookmark[];omitted:number;reasons:string[]} {
 const linked=new Set(bindings.map(b=>b.bookmarkId));const ordered=[...all.filter(b=>linked.has(b.id)),...all.filter(b=>!linked.has(b.id))];
 const items:SavedBookmark[]=[];const reasons=new Set<string>();let bytes=16000;
 for(const bookmark of ordered){
  if(bookmark.id.length>128||bookmark.url.length>4096){reasons.add('部分链接超过本机长度限制');continue;}
  const item={...bookmark,title:bookmark.title.slice(0,512)};const size=new TextEncoder().encode(JSON.stringify(item)).byteLength+1;
  if(items.length>=2000){reasons.add('本机单次最多接收 2000 条收藏');continue;}
  if(bytes+size>230*1024){reasons.add('本机单次请求容量有限');continue;}
  bytes+=size;items.push(item);
 }
 return {items,omitted:all.length-items.length,reasons:[...reasons]};
}

// The only site request here reads already-saved links. Native paths, filenames,
// diagnostics and image data are never sent to a site API.
export async function loadSavedBookmarks(signal?:AbortSignal):Promise<SavedBookmark[]> {
 const found=new Map<string,SavedBookmark>();let requested=1,pages=1,snapshotTotal:number|null=null,snapshotLinks:number|null=null;
 while(requested<=pages){
  const response=await fetch(`/api/websites?page=${requested}`,{cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  const value:unknown=await response.json();
  if(!response.ok)throw new Error(record(value)&&string(value.error)?value.error:'已保存网站暂时无法读取。');
  if(!record(value)||!number(value.total)||!number(value.linkTotal)||!number(value.page)||!Array.isArray(value.items)||value.page!==requested)throw new Error('网站分页发生变化，请重新读取完整收藏。');
  if(snapshotTotal===null){snapshotTotal=value.total;snapshotLinks=value.linkTotal;}else if(snapshotTotal!==value.total||snapshotLinks!==value.linkTotal)throw new Error('收藏在读取期间发生变化，请重新读取完整收藏。');
  pages=Math.max(1,Math.ceil(value.total/48));
  if(pages>10000)throw new Error('收藏超过网站分页范围，无法确认已取得全部链接。');
  for(const box of value.items){if(!record(box)||!Array.isArray(box.items))throw new Error('网站箱子格式不兼容。');for(const item of box.items){if(!record(item)||!string(item.id)||!string(item.title)||safeBookmarkHref(item.url)===null)throw new Error('收藏链接格式不兼容。');const projectId=typeof item.projectId==='string'?item.projectId:typeof item.project_id==='string'?item.project_id:undefined;found.set(item.id,{id:item.id,title:item.title,url:item.url as string,...(projectId&&projectId.length<=128?{projectId}:{})});}}
  requested++;
 }
 if(found.size!==snapshotLinks)throw new Error('收藏分页发生重排或遗漏，请重新读取完整收藏。');
 return [...found.values()];
}

