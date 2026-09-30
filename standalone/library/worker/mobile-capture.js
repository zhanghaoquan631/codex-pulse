import qrcode from 'qrcode-generator';
import {Problem,load,mutate,validateState,normalizeItem} from './state.js';
import {bounded,hash,putFile,serveFile,filePattern,detect} from './files.js';
import {preview} from './preview.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const digest=value=>hash(new TextEncoder().encode(value));
export async function currentLink(env){return env.DB.prepare('SELECT * FROM capture_links WHERE id = ?').bind('current').first();}
export async function requireLink(request,env){
  const token=request.headers.get('x-lingan-capture-token')||'';
  if(!/^[a-f0-9]{64}$/.test(token))throw new Problem('请扫描电脑上的手机上传二维码',401);
  const link=await currentLink(env);
  if(!link||link.expires_at<=Date.now()||link.token_hash!==await digest(token))throw new Problem('上传链接已到期或已换新，请重新扫描电脑上的二维码',401);
  return link;
}
async function quota(env,link,kind){
  const names=['preview_count','submission_count','file_count'],limit={preview_count:30,submission_count:120,file_count:40}[kind],hour=Math.floor(Date.now()/3600000);
  const fields=names.map(name=>`${name} = CASE WHEN quota_window = ? THEN ${name}${name===kind?' + 1':''} ELSE ${name===kind?'1':'0'} END`).join(', ');
  const result=await env.DB.prepare(`UPDATE capture_links SET ${fields}, quota_window = ? WHERE id = ? AND grant_id = ? AND expires_at > ? AND (quota_window <> ? OR ${kind} < ?)`)
    .bind(hour,hour,hour,hour,'current',link.grant_id,Date.now(),hour,limit).run();
  if(result.meta.changes!==1)throw new Problem('上传入口已失效或本小时次数已用完，请稍后重试',429);
}
async function readBody(request){try{const value=JSON.parse(new TextDecoder().decode(await bounded(request,180000)));if(!value||typeof value!=='object'||Array.isArray(value))throw new Problem('提交格式不正确');return value;}catch(error){if(error instanceof Problem)throw error;throw new Problem('提交格式不正确');}}
async function rememberFile(env,link,id){await env.DB.prepare('INSERT OR IGNORE INTO capture_files (grant_id, file_id) VALUES (?, ?)').bind(link.grant_id,id).run();}
async function permittedFile(env,link,id){return env.DB.prepare('SELECT file_id FROM capture_files WHERE grant_id = ? AND file_id = ?').bind(link.grant_id,id).first();}
function field(data,key,max){const value=data[key]??'';if(typeof value!=='string'||value.length>max)throw new Problem(`${{caption:'原始文案',body:'笔记',title:'标题',url:'链接',coverUrl:'封面'}[key]||key}过长或格式不正确`);return value;}
function cleanURL(value){if(!value)return '';try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw 0;return url.href;}catch{throw new Problem('请填写有效的网页链接');}}
function sourceOf(value){const host=value?new URL(value).hostname.toLowerCase():'';return /(^|\.)douyin\.com$/.test(host)?'douyin':/^(www\.|mobile\.)?(x|twitter)\.com$/.test(host)?'x':'manual';}
function submissionChanged(){const error=new Problem('上次提交已保存；新改动仍在草稿中，请再次点击保存为一条新记录',409);error.code='submission_changed';return error;}
async function captureItem(input,scope,permittedCover,captureVia){
  if(!input||typeof input!=='object'||!/^[a-zA-Z0-9-]{16,64}$/.test(input.submissionId||''))throw new Problem('提交标识缺失，请保留草稿并刷新');
  const url=cleanURL(field(input,'url',2000)),title=field(input,'title',300).trim(),caption=field(input,'caption',50000),body=field(input,'body',50000),coverUrl=field(input,'coverUrl',2000),cover=filePattern.exec(coverUrl);
  if(coverUrl&&(!cover||!await permittedCover(cover[1])))throw new Problem('请重新预览或上传这张图片');
  if(!url&&!title&&!body.trim()&&!caption.trim()&&!cover)throw new Problem('请填写链接、文字或选择一张图片');
  const id='mobile-'+(await digest(scope+':'+input.submissionId)).slice(0,32),source=sourceOf(url),at=new Date().toISOString(),mobileSubmissionHash=await digest(JSON.stringify({url,title,caption,body,coverUrl}));
  return {id,title:title||(caption||body).trim().slice(0,100)||(url?'待补全 · '+new URL(url).hostname:'手机图片'),url,caption,desc:caption,body,coverUrl,source,sourceLabel:source==='douyin'?'抖音':source==='x'?'X':'手机记录',rating:0,tags:[],status:'pending',createdAt:at,updatedAt:at,date:at.slice(0,10),captureVia,mobileSubmissionHash};
}
async function imageFile(env,id){
  const file=await env.BUCKET.head('files/'+id);if(!file?.httpMetadata?.contentType?.startsWith('image/'))return null;
  try{return JSON.parse(file.customMetadata.info).type?.startsWith('image/')?file:null;}catch{return null;}
}
function previewResult(result,url,cover){return {url:result.url||url,source:result.source,title:result.title,description:result.description,coverUrl:cover?result.coverUrl:'',coverKind:result.coverKind,previewStatus:cover?result.previewStatus:'incomplete',captionWarning:result.captionWarning,coverWarning:result.coverWarning};}
async function appendCapture(request,env,link,item){
  // Check the current grant in the same SQLite write as the content commit.
  const guard="EXISTS (SELECT 1 FROM capture_links WHERE id = ? AND grant_id = ? AND expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))";
  for(let attempt=0;attempt<5;attempt++){
    await requireLink(request,env);const {revision,state}=await load(env),existing=state.content.find(x=>x.id===item.id);
    if(existing){if(existing.mobileSubmissionHash!==item.mobileSubmissionHash)throw submissionChanged();return {id:item.id,saved:true,duplicate:true};}
    state.content.push(normalizeItem({...item,sequence:state.content.length+1},state.content.length));state.updatedAt=new Date().toISOString()+'-'+crypto.randomUUID().slice(0,8);validateState(state);
    const query=revision===null?env.DB.prepare(`INSERT INTO library (id, revision, payload) SELECT ?, ?, ? WHERE ${guard} ON CONFLICT(id) DO NOTHING`).bind('main',1,JSON.stringify(state),'current',link.grant_id):env.DB.prepare(`UPDATE library SET revision = ?, payload = ? WHERE id = ? AND revision = ? AND ${guard}`).bind(revision+1,JSON.stringify(state),'main',revision,'current',link.grant_id);
    const result=await query.run();if(result.meta.changes===1)return {id:item.id,saved:true,duplicate:false};
    await requireLink(request,env);
  }
  throw new Problem('另一设备正在保存，请重试，草稿仍然保留',409);
}

// This address identifies a login-protected page, never an upload grant.
export function fixedMobileEntry(request){
  const url=new URL('/mobile',request.url).href,qr=qrcode(0,'M');qr.addData(url);qr.make();
  return json({url,qr:qr.createSvgTag({cellSize:4,margin:16,scalable:true}),permanent:true,requiresLogin:true});
}

// main.js authenticates the owner and checks same-origin writes before dispatch.
// Existing owner images remain usable across devices without a capture grant.
export async function ownerMobileCapture(request,env){
  const path=new URL(request.url).pathname,method=request.method;
  if(path==='/api/mobile/drop/status'&&method==='GET')return json({active:true,permanent:true,requiresLogin:true});
  const file=/^\/api\/mobile\/drop\/files\/([a-f0-9]{32})$/.exec(path);
  if(file&&['GET','HEAD'].includes(method)){
    if(!await imageFile(env,file[1]))throw new Problem('图片不存在',404);
    return serveFile(request,env,file[1]);
  }
  if(path==='/api/mobile/drop/files'&&method==='POST'){
    const bytes=await bounded(request,12*1024*1024);if(!bytes.length)throw new Problem('图片不能为空');
    if(!detect(bytes,'photo').startsWith('image/'))throw new Problem('请上传 JPG、PNG、WebP 或 GIF 图片');
    const result=await putFile(env,bytes,'手机图片');return json({url:result.url},201);
  }
  if(path==='/api/mobile/drop/preview'&&method==='POST'){
    const input=await readBody(request),url=cleanURL(field(input,'url',2000));if(!url)throw new Problem('请先粘贴链接');
    if(sourceOf(url)==='manual')return json({url,source:'manual',previewStatus:'incomplete',captionWarning:'已记录网页链接，你可以补充标题、图片和文字后保存。'});
    const result=await preview(env,url,{allowBrowser:true}),cover=filePattern.exec(result.coverUrl||'');
    return json(previewResult(result,url,cover&&await imageFile(env,cover[1])));
  }
  if(path==='/api/mobile/drop/submit'&&method==='POST'){
    const item=await captureItem(await readBody(request),'owner:'+env.OWNER_EMAIL.trim().toLowerCase(),id=>imageFile(env,id),'mobile-login');
    const {result}=await mutate(env,state=>{
      const existing=state.content.find(x=>x.id===item.id);
      if(existing){if(existing.mobileSubmissionHash!==item.mobileSubmissionHash)throw submissionChanged();return {id:item.id,saved:true,duplicate:true};}
      state.content.push(normalizeItem({...item,sequence:state.content.length+1},state.content.length));
      return {id:item.id,saved:true,duplicate:false};
    });return json(result,201);
  }
  throw new Problem('此入口仅用于上传',404);
}

export async function manageLink(request,env){
  if(request.method==='GET'){const row=await currentLink(env);return json({active:!!row&&row.expires_at>Date.now(),id:row?.grant_id,expiresAt:row?.expires_at});}
  if(request.method==='DELETE'){await env.DB.prepare('UPDATE capture_links SET expires_at = ? WHERE id = ?').bind(0,'current').run();return json({revoked:true});}
  if(request.method!=='POST')throw new Problem('不支持此操作',405);
  const token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const id=crypto.randomUUID(),expiresAt=Date.now()+30*86400000;
  await env.DB.prepare('INSERT INTO capture_links (id, grant_id, token_hash, created_at, expires_at, quota_window, preview_count, submission_count, file_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET grant_id=excluded.grant_id, token_hash=excluded.token_hash, created_at=excluded.created_at, expires_at=excluded.expires_at, quota_window=0, preview_count=0, submission_count=0, file_count=0')
    .bind('current',id,await digest(token),Date.now(),expiresAt,0,0,0,0).run();
  const url=new URL('/capture',request.url);url.hash='token='+token;
  const qr=qrcode(0,'M');qr.addData(url.href);qr.make();
  return json({id,url:url.href,expiresAt,qr:qr.createSvgTag({cellSize:4,margin:16,scalable:true})},201);
}

export async function mobileCapture(request,env){
  const path=new URL(request.url).pathname,method=request.method,link=await requireLink(request,env);
  if(!['GET','HEAD'].includes(method)&&(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site'))throw new Problem('请从手机上传页面提交',403);
  if(path==='/api/drop/status'&&method==='GET')return json({active:true,expiresAt:link.expires_at});
  const file=/^\/api\/drop\/files\/([a-f0-9]{32})$/.exec(path);
  if(file&&['GET','HEAD'].includes(method)){
    if(!await permittedFile(env,link,file[1]))throw new Problem('图片不属于此上传入口',404);
    return serveFile(request,env,file[1]);
  }
  if(path==='/api/drop/files'&&method==='POST'){
    await quota(env,link,'file_count');
    const bytes=await bounded(request,12*1024*1024);if(!bytes.length)throw new Problem('图片不能为空');
    if(!detect(bytes,'photo').startsWith('image/'))throw new Problem('请上传 JPG、PNG、WebP 或 GIF 图片');
    await requireLink(request,env);
    const result=await putFile(env,bytes,'手机图片');
    await requireLink(request,env);await rememberFile(env,link,result.id);
    return json({url:result.url},201);
  }
  if(path==='/api/drop/preview'&&method==='POST'){
    const input=await readBody(request),url=cleanURL(field(input,'url',2000));if(!url)throw new Problem('请先粘贴链接');
    if(sourceOf(url)==='manual')return json({url,source:'manual',previewStatus:'incomplete',captionWarning:'已记录网页链接，你可以补充标题、图片和文字后保存。'});
    await quota(env,link,'preview_count');
    const result=await preview(env,url,{allowBrowser:true});await requireLink(request,env);
    const cover=filePattern.exec(result.coverUrl||'');if(cover)await rememberFile(env,link,cover[1]);
    return json(previewResult(result,url,cover));
  }
  if(path==='/api/drop/submit'&&method==='POST'){
    const item=await captureItem(await readBody(request),link.grant_id,id=>permittedFile(env,link,id),'mobile-link');
    await quota(env,link,'submission_count');
    return json(await appendCapture(request,env,link,item),201);
  }
  throw new Problem('此入口仅用于上传',404);
}
