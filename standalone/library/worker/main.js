import {Problem,validateState,load,mutate,applyChanges} from './state.js';
import {bounded,putFile,serveFile,filePattern,hash} from './files.js';
import {renderIssue,compare,external} from './weekly.js';
import {preview} from './preview.js';
import {browserCaptureStatus} from './browser-capture.js';
import {readBundle,uploadBundleFiles,exportBundle,references} from './bundle.js';
import {manageLink,mobileCapture,fixedMobileEntry,ownerMobileCapture} from './mobile-capture.js';
import {editIssue} from './weekly-edit.js';
import {periodFields} from './periods.js';
import {textStyleFields} from './text-style-schema.js';
import {activeState,trashState,changeDeleted,removeIssueItem,replaceActiveContent,updateProfile,accountInfo} from './record-actions.js';
import {selectSource,sourceCover,materialImage,saveLongImage,saveIssueBackup,sameCache} from './backup-cache.js';
import {deviceRequest,ownerJianying} from './jianying.js';
import {liveDevice,liveUploads,manageDevices} from './live.js';
import {replayPage} from './replay.js';
const assets=typeof __ASSETS__==='undefined'?{}:__ASSETS__;
const installerHash=typeof __INSTALLER_SHA__==='undefined'?'':__INSTALLER_SHA__;
async function storeInstaller(request,env){const existing=await env.BUCKET.head('live-installer/windows.zip');if(existing?.customMetadata?.sha256===installerHash)return json({saved:true});const bytes=await bounded(request,25*1024*1024);if(!installerHash||await hash(bytes)!==installerHash)throw new Problem('直播助手安装包校验失败');await env.BUCKET.put('live-installer/windows.zip',bytes,{httpMetadata:{contentType:'application/zip'},customMetadata:{sha256:installerHash}});return json({saved:true});}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const html=(value,status=200)=>new Response(value,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
async function body(request){try{return JSON.parse(new TextDecoder().decode(await bounded(request,2*1024*1024)));}catch(error){if(error instanceof Problem)throw error;throw new Problem('请求格式不正确');}}
export async function authorized(request,env){
  const email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase(),user=request.headers.get('oai-authenticated-user-id');
  if(env.OWNER_EMAIL&&user&&email===env.OWNER_EMAIL.toLowerCase())return 'owner';
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(env.SYNC_TOKEN&&token&&env.SYNC_TOKEN.length>=32&&await hash(new TextEncoder().encode(token))===await hash(new TextEncoder().encode(env.SYNC_TOKEN)))return 'sync';
  return null;
}
function loginPage(returnTo='/',wrongAccount=false,isReplay=false){return html(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>我的灵感库</title><style>body{font:16px/1.7 system-ui;background:#f6f6f8;color:#24242b;margin:0;display:grid;place-items:center;min-height:100vh}main{background:white;padding:36px;border-radius:20px;max-width:360px;margin:20px}a{display:block;background:#7961d2;color:white;text-align:center;padding:12px;border-radius:10px;text-decoration:none}</style><main><h1>${isReplay?'我的直播回放':'我的灵感库'}</h1><p>${wrongAccount?'当前登录账号无权访问此私人资料库，请退出后使用资料库所有者账号登录。':isReplay?'登录你的账号，继续观看这段直播回放。':'登录你的账号，继续收集和整理。'}</p><a target="_top" href="/${wrongAccount?'signout':'signin'}-with-chatgpt?return_to=${encodeURIComponent(returnTo)}">${wrongAccount?'退出并切换账号':'使用 ChatGPT 登录'}</a><p>${isReplay?'手机和电脑均可使用此链接。':'周刊访客请打开收到的单期阅读链接。'}</p></main></html>`);}
async function verifyReferences(env,state){for(const id of references(state))if(!await env.BUCKET.head('files/'+id))throw new Problem('有本地文件尚未上传，请先同步附件');}
export default {async fetch(request,env){
  try{
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(path.startsWith('/api/live/')&&request.headers.get('authorization')?.startsWith('Bearer llive_'))return await liveUploads(request,env,await liveDevice(request,env));
    if(path==='/mobile'&&['GET','HEAD'].includes(method)&&await authorized(request,env)!=='owner'){
      const response=loginPage('/mobile',Boolean(request.headers.get('oai-authenticated-user-id')));
      return method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
    }
    if(['/mobile','/capture','/capture.js','/capture.css'].includes(path)&&['GET','HEAD'].includes(method)){
      const asset=assets[path==='/capture'||path==='/mobile'?'/capture.html':path];
      if(!asset)throw new Problem('页面暂不可用',503);
      return new Response(method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});
    }
    if(path.startsWith('/api/drop/'))return await mobileCapture(request,env);
    const nativeResponse=await deviceRequest(request,env);if(nativeResponse)return nativeResponse;
    if(['/weekly.css','/text-styling.css','/text-styling.js'].includes(path)&&['GET','HEAD'].includes(method))return new Response(method==='HEAD'?null:assets[path]?.body||'',{headers:{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','X-Content-Type-Options':'nosniff'}});
    const share=/^\/share\/([A-Za-z0-9_-]{16,100})(?:\/files\/([a-f0-9]{32}))?$/.exec(path);
    if(share&&['GET','HEAD'].includes(method)){
      const {state}=await load(env),issue=state.newsletters.find(x=>x.token===share[1]&&!x.deletedAt);if(!issue)throw new Problem('周刊链接不存在',404);
      if(share[2]){if(![issue,...issue.items].some(x=>x.coverUrl==='/api/files/'+share[2]))throw new Problem('图片不属于该期周刊',404);return await serveFile(request,env,share[2]);}
      return html(method==='HEAD'?'':renderIssue(issue));
    }
    const auth=await authorized(request,env);
    const replay=/^\/replay\/([a-f0-9]{32})$/.exec(path);
    if(!auth){if(replay&&['GET','HEAD'].includes(method)){const response=loginPage(path+url.search,Boolean(request.headers.get('oai-authenticated-user-id')),true);return method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;}if(path==='/'||path==='/index.html')return loginPage(path+url.search,Boolean(request.headers.get('oai-authenticated-user-id')));return json({message:'请先登录资料库所有者账号'},401);}
    if(auth==='sync'&&!/^\/api\/(sync(?:\/.*)?|files(?:\/[a-f0-9]{32})?|health)$/.test(path))throw new Problem('同步凭证不能执行此操作',403);
    if(auth==='owner'&&!['GET','HEAD'].includes(method)){
      if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')throw new Problem('请从灵感库页面提交操作',403);
    }
    if(replay&&['GET','HEAD'].includes(method))return await replayPage(request,env,replay[1]);
    if(path==='/api/jianying/uploads'||path.startsWith('/api/jianying/uploads/'))return await liveUploads(request,env,{id:'owner',name:'网页剪辑'},'jianying');
    if(path.startsWith('/api/jianying/'))return await ownerJianying(request,env);
    if(path==='/api/health'&&method==='GET')return json({ok:true,service:'lingan-cloud',storage:'cloud'});
    if(['/api/live/status','/api/sync/live-status'].includes(path)&&method==='GET'){
      const devices=await env.DB.prepare('SELECT COUNT(*) AS n FROM live_devices WHERE revoked_at IS NULL AND expires_at > ?').bind(Date.now()).first(),uploads=await env.DB.prepare('SELECT COUNT(*) AS n FROM live_uploads').bind().first(),installer=await env.BUCKET.head('live-installer/windows.zip');
      return json({available:true,devices:devices.n,uploads:uploads.n,installerReady:Boolean(installerHash&&installer?.customMetadata?.sha256===installerHash),installerSha256:installerHash,maxFileSize:8*1024*1024*1024});
    }
    if(['/api/live/installer','/api/sync/live-installer'].includes(path)&&method==='POST'){
      return await storeInstaller(request,env);
    }
    if(path==='/api/live/download'&&['GET','HEAD'].includes(method)){
      const file=method==='HEAD'?await env.BUCKET.head('live-installer/windows.zip'):await env.BUCKET.get('live-installer/windows.zip');if(!file||file.customMetadata?.sha256!==installerHash)throw new Problem('直播助手正在更新，请稍后重试',503);
      return new Response(method==='HEAD'?null:file.body,{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="LinganLive-Windows.zip"','Content-Length':String(file.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(path==='/api/live/devices'||/^\/api\/live\/devices\/[a-f0-9]{32}$/.test(path))return await manageDevices(request,env);
    if(path==='/api/live/uploads'||path.startsWith('/api/live/uploads/'))return await liveUploads(request,env,{id:'owner',name:'网页导入'});
    if(path==='/api/mobile-entry'){if(method!=='GET')throw new Problem('不支持此操作',405);return fixedMobileEntry(request);}
    if(path.startsWith('/api/mobile/drop/'))return await ownerMobileCapture(request,env);
    if(path==='/api/mobile-link')return await manageLink(request,env);
    if(path==='/api/capture/status'&&method==='GET')return json(browserCaptureStatus(env));
    const cloudShare=/^\/api\/cloud\/share\/([A-Za-z0-9_-]{16,100})$/.exec(path);
    if(cloudShare&&method==='GET'){
      const issue=(await load(env)).state.newsletters.find(x=>x.token===cloudShare[1]&&!x.deletedAt);
      if(!issue)throw new Problem('周刊链接不存在',404);
      return json({available:true,mode:'public',url:url.origin+'/share/'+issue.token});
    }
    const syncFile=/^\/api\/sync\/files\/([a-f0-9]{32})$/.exec(path);
    if(syncFile&&method==='GET'){const file=await env.BUCKET.head('files/'+syncFile[1]);if(!file)throw new Problem('文件不存在',404);return json(JSON.parse(file.customMetadata.info));}
    if((path==='/api/state'||path==='/api/export'||path==='/api/sync/state')&&method==='GET'){const {state}=await load(env);return json(path==='/api/state'?activeState(state):state);}
    if(path==='/api/trash'&&method==='GET')return json(trashState((await load(env)).state));
    if(path==='/api/account'&&method==='GET')return json(accountInfo(request,(await load(env)).state));
    if(path==='/api/account'&&method==='POST'){const payload=await body(request);const {state}=await mutate(env,state=>updateProfile(state,payload));return json(accountInfo(request,state));}
    const recordAction=/^\/api\/(content|newsletters)\/([^/]+)\/(delete|restore)$/.exec(path);
    if(recordAction&&method==='POST'){const payload=await body(request);const {state,result}=await mutate(env,state=>changeDeleted(state,recordAction[1],decodeURIComponent(recordAction[2]),recordAction[3],payload));return json({state:activeState(state),...result});}
    const removeItem=/^\/api\/newsletters\/([^/]+)\/items\/([^/]+)\/remove$/.exec(path);
    if(removeItem&&method==='POST'){const payload=await body(request);const {state,result}=await mutate(env,state=>removeIssueItem(state,decodeURIComponent(removeItem[1]),decodeURIComponent(removeItem[2]),payload));return json({...result,updatedAt:state.updatedAt});}
    if(path==='/api/session'&&method==='GET')return json({authenticated:true,cloud:true});
    if(path==='/api/access'&&method==='GET')return json({enabled:true,cloud:true,urls:[url.origin],message:'已登录，手机与电脑使用同一个地址。'});
    if(path==='/api/backup'&&method==='GET'){
      const {bytes,manifest}=await exportBundle(env,(await load(env)).state);
      return new Response(bytes,{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="lingan-backup.zip"','Cache-Control':'no-store','X-Lingan-External-Covers':String(manifest.externalCoverCount),'X-Lingan-Legacy-Attachments':String(manifest.legacyAttachmentCount)}});
    }
    if(path==='/api/backup-cache/source'&&method==='POST')return json(await selectSource((await load(env)).state,await body(request)));
    if(path==='/api/backup-cache/register'&&method==='POST')return json(await saveLongImage(env,await body(request)),201);
    if(path==='/api/backup-cache/issue'&&method==='POST')return json(await saveIssueBackup(env,await body(request)),201);
    if((path==='/api/backup-cache/cover'||path==='/api/material-image')&&method==='POST'){
      const payload=await body(request),image=path.endsWith('/cover')?await sourceCover(env,payload):await materialImage(payload);
      return new Response(image.bytes,{headers:{'Content-Type':image.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    if(path==='/api/sync/migrate'&&method==='POST'){
      const bundle=await readBundle(await bounded(request,60*1024*1024));
      const current=(await load(env)).state;
      if(current.content.length||current.materials.length||current.newsletters.length||current.tags.length||current.materialBoxes.length||current.backupCaches.length)throw new Problem('云端已有资料，已停止整体迁移以免覆盖',409);
      await uploadBundleFiles(env,bundle);
      const {state}=await mutate(env,state=>{if(state.content.length||state.materials.length||state.newsletters.length||state.tags.length||state.materialBoxes.length||state.backupCaches.length)throw new Problem('云端已有资料，已停止整体迁移',409);Object.assign(state,bundle.state);state.sourceBackupPaths=bundle.sourceBackups.map(([name])=>name);});
      return json({state,files:bundle.attachments.length},201);
    }
    if(path==='/api/sync/commit'&&method==='POST'){
      const payload=await body(request);validateState(payload.state);await verifyReferences(env,payload.state);
      const {state}=await mutate(env,current=>{if(current.updatedAt!==payload.expectedUpdatedAt)throw new Problem('云端已有新修改，请重试同步',409);const hasPaths=Object.hasOwn(current,'sourceBackupPaths'),paths=current.sourceBackupPaths;const caches=[...current.backupCaches];for(const incoming of payload.state.backupCaches){const old=caches.find(x=>x.id===incoming.id);if(old&&!sameCache(old,incoming))throw new Problem('备份缓存已存在，请保留原件',409);if(!old)caches.push(incoming);}Object.assign(current,payload.state);current.backupCaches=caches;if(hasPaths)current.sourceBackupPaths=paths;else delete current.sourceBackupPaths;});return json(state);
    }
    if(path==='/api/changes'&&method==='POST'){
      const payload=await body(request);const {state}=await mutate(env,state=>applyChanges(state,payload.changes));return json(activeState(state));
    }
    if(path==='/api/state'&&method==='PUT'){
      const payload=await body(request);for(const key of ['content','materials','tags'])if(!Array.isArray(payload[key]))throw new Problem('导入格式不正确');
      const {state}=await mutate(env,current=>{if(current.updatedAt!==payload.expectedUpdatedAt)throw new Problem('另一设备更新了内容，请先保留草稿',409);current.content=replaceActiveContent(current.content,payload.content);for(const key of ['materials','tags'])current[key]=payload[key];if(payload.materialBoxes!==undefined)current.materialBoxes=payload.materialBoxes;});return json(activeState(state));
    }
    if(path==='/api/files'&&method==='POST'){
      const bytes=await bounded(request,25*1024*1024);if(!bytes.length)throw new Problem('文件不能为空');let name;try{name=decodeURIComponent(request.headers.get('x-file-name')||'文件');}catch{throw new Problem('文件名不正确');}
      return json(await putFile(env,bytes,name,{id:auth==='sync'?request.headers.get('x-file-id')||undefined:undefined}),201);
    }
    const file=filePattern.exec(path);if(file&&['GET','HEAD'].includes(method))return await serveFile(request,env,file[1]);
    if(path==='/api/preview'&&(method==='POST'||method==='GET'))return json(await preview(env,method==='GET'?url.searchParams.get('url'):(await body(request)).url,{allowBrowser:method==='POST'}));
    const editingIssue=/^\/api\/newsletters\/([^/]+)\/edit$/.exec(path);
    if(editingIssue&&method==='POST'){
      const payload=await body(request),id=decodeURIComponent(editingIssue[1]);
      const {state,result}=await mutate(env,state=>editIssue(state,id,payload));
      return json({...result,updatedAt:state.updatedAt});
    }
    if((path==='/api/newsletters'||/^\/api\/newsletters\/[^/]+\/items$/.test(path))&&method==='POST'){
      const payload=await body(request);if(!Array.isArray(payload.itemIds))throw new Problem('请选择内容');
      const adding=path.endsWith('/items'),issueId=adding?decodeURIComponent(path.split('/')[3]):'weekly-'+crypto.randomUUID();
      const {state,result}=await mutate(env,async state=>{
        const selected=state.content.filter(x=>!x.deletedAt&&payload.itemIds.includes(x.id)).sort(compare);if(!selected.length)throw new Problem('请选择本期内容');
        const missing=[];
        for(const item of selected)if(item.url){const local=filePattern.exec(item.coverUrl||'');const head=local?await env.BUCKET.head('files/'+local[1]):null;if(!(local?head?.httpMetadata?.contentType?.startsWith('image/'):external(item.coverUrl))||!item.caption?.trim())missing.push(item.title);}
        if(missing.length)throw new Problem('以下内容缺少封面或原文：'+missing.join('、'));
        if(adding){const issue=state.newsletters.find(x=>x.id===issueId&&!x.deletedAt);if(!issue)throw new Problem('找不到所选周刊',404);const additions=selected.filter(x=>!issue.items.some(y=>y.id===x.id));issue.items.push(...structuredClone(additions));issue.items.sort(compare);issue.updatedAt=new Date().toISOString();return {newsletter:issue,added:additions.length};}
        const issue={id:issueId,token:crypto.randomUUID().replaceAll('-',''),title:String(payload.title||'灵感周刊').slice(0,120),date:String(payload.date||new Date().toISOString().slice(0,10)).slice(0,40),intro:String(payload.intro||'').slice(0,1000),items:structuredClone(selected),...periodFields(payload),...textStyleFields(payload),createdAt:new Date().toISOString()};state.newsletters.unshift(issue);return {newsletter:issue};
      });return json({...result,updatedAt:state.updatedAt,sharePath:'/share/'+result.newsletter.token},adding?200:201);
    }
    if(['/api/mezip/status','/api/mezip/sync'].includes(path)){
      const {state}=await load(env);const at=state.cloudSync?.at;return json({state:at?'connected':'waiting',message:at?'最近电脑同步：'+at:'等待电脑同步私人资料库',lastSyncedAt:at,activityState:state.xActivity?.state,activityAccounts:state.xActivity?.accounts||[],lastReceivedEventAt:state.xActivity?.lastReceivedEventAt,activityEventCount:state.xActivity?.activityEventCount,activityActiveCount:state.xActivity?.activityActiveCount});
    }
    if(['GET','HEAD'].includes(method)){
      const asset=assets[path==='/'?'/index.html':path];if(asset)return new Response(method==='HEAD'?null:asset.base64?Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0)):asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(asset.download?{'Content-Disposition':'attachment; filename="'+asset.download+'"'}:{})}});
    }
    throw new Problem('页面不存在',404);
  }catch(error){if(!(error instanceof Problem))console.error('Library request failed',error?.name,error?.message);return json({message:error instanceof Problem?error.message:'资料库暂时不可用，输入仍保留，请稍后重试',...(error instanceof Problem&&error.code==='submission_changed'?{code:error.code}:{})},error.status||503);}
}};
