import {Problem,mutate,normalizeItem} from './state.js';
import {bounded,putFile,hash,serveFile,detect} from './files.js';

export const VIDEO_LIMIT=25*1024*1024;
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const random=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const digest=value=>hash(new TextEncoder().encode(value));
const readyDatabases=new WeakMap();
async function ensureDevices(env){
  if(!readyDatabases.has(env.DB)){
    const ready=(async()=>{
      // Compatibility for older archive deployments that do not apply source migrations.
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS jianying_devices (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, pair_hash TEXT, pair_expires INTEGER NOT NULL DEFAULT 0, token_hash TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0)').bind().run();
      for(const field of ['pair_hash','token_hash'])await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS jianying_devices_'+field+'_unique ON jianying_devices ('+field+')').bind().run();
    })();readyDatabases.set(env.DB,ready);ready.catch(()=>readyDatabases.delete(env.DB));
  }
  await readyDatabases.get(env.DB);
}
async function payload(request){try{const value=JSON.parse(new TextDecoder().decode(await bounded(request,4096)));if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value;}catch{throw new Problem('请求格式不正确');}}
export async function deviceRequest(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/jianying/pair'&&request.method==='POST'){
    const {code}=await payload(request);
    if(!/^[a-f0-9]{64}$/.test(code||''))throw new Problem('连接码无效',403);
    const now=Date.now(),codeHash=await digest(code),token=random(),tokenHash=await digest(token);
    const device=await env.DB.prepare('SELECT id FROM jianying_devices WHERE pair_hash = ? AND pair_expires > ? AND token_hash IS NULL AND revoked = 0').bind(codeHash,now).first();
    if(!device)throw new Problem('连接码已使用或已过期，请在网站重新连接',403);
    const result=await env.DB.prepare('UPDATE jianying_devices SET token_hash = ?, expires_at = ?, pair_hash = NULL, pair_expires = 0, last_seen = ? WHERE id = ? AND pair_hash = ? AND token_hash IS NULL AND revoked = 0 AND pair_expires > ?').bind(tokenHash,now+90*86400000,now,device.id,codeHash,now).run();
    if(result.meta.changes!==1)throw new Problem('连接码已使用，请重新连接',403);
    return json({deviceId:device.id,token,expiresAt:now+90*86400000,maxFileBytes:VIDEO_LIMIT});
  }
  if(!path.startsWith('/api/jianying/native/'))return null;
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!/^[a-f0-9]{64}$/.test(token||''))throw new Problem('请先连接此电脑',401);
  const device=await env.DB.prepare('SELECT id FROM jianying_devices WHERE token_hash = ? AND expires_at > ? AND revoked = 0').bind(await digest(token),Date.now()).first();
  if(!device)throw new Problem('此电脑的连接已过期或被断开，请重新连接',401);
  await env.DB.prepare('UPDATE jianying_devices SET last_seen = ? WHERE id = ?').bind(Date.now(),device.id).run();
  if(path==='/api/jianying/native/status'&&request.method==='GET')return json({connected:true,maxFileBytes:VIDEO_LIMIT});
  const match=/^\/api\/jianying\/native\/files\/([a-f0-9]{32})$/.exec(path);
  if(match&&request.method==='GET'){
    const head=await env.BUCKET.head('files/'+match[1]);
    if(!head)throw new Problem('视频不存在',404);
    const info=JSON.parse(head.customMetadata.info);
    if(!info.type?.startsWith('video/'))throw new Problem('此连接仅可读取视频文件',403);
    const response=await serveFile(request,env,match[1]);response.headers.set('X-Lingan-SHA256',info.sha256);return response;
  }
  if(path==='/api/jianying/native/returns'&&request.method==='POST'){
    const tokenHash=await digest(token),guard={
      sql:"EXISTS (SELECT 1 FROM jianying_devices WHERE id = ? AND token_hash = ? AND revoked = 0 AND expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))",
      values:[device.id,tokenHash],
      async check(){if(!await env.DB.prepare('SELECT id FROM jianying_devices WHERE id = ? AND token_hash = ? AND revoked = 0 AND expires_at > ?').bind(device.id,tokenHash,Date.now()).first())throw new Problem('此电脑已断开，请重新连接',401);}
    };
    return json(await saveVideo(request,env,'result',guard),201);
  }
  throw new Problem('此连接不能执行该操作',403);
}
export async function ownerJianying(request,env){
  await ensureDevices(env);
  const path=new URL(request.url).pathname;
  if(path==='/api/jianying/devices'&&request.method==='GET'){
    const rows=await env.DB.prepare('SELECT id, name, created_at, expires_at, last_seen, 1 AS connected FROM jianying_devices WHERE revoked = 0 AND token_hash IS NOT NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 100').bind(Date.now()).all();
    return json({devices:rows.results,maxFileBytes:VIDEO_LIMIT});
  }
  if(path==='/api/jianying/connect'&&request.method==='POST'){
    const {name}=await payload(request),code=random(),id='jy-'+crypto.randomUUID(),now=Date.now();
    await env.DB.prepare('INSERT INTO jianying_devices (id,name,pair_hash,pair_expires,created_at,expires_at,last_seen,revoked) VALUES (?,?,?,?,?,?,?,0)').bind(id,String(name||'我的剪映电脑').slice(0,80),await digest(code),now+5*60000,now,0,0).run();
    return json({id,code,expiresAt:now+5*60000},201);
  }
  const revoke=/^\/api\/jianying\/devices\/(jy-[a-f0-9-]{36})\/revoke$/.exec(path);
  if(revoke&&request.method==='POST'){
    await env.DB.prepare('UPDATE jianying_devices SET revoked = 1, pair_hash = NULL, token_hash = NULL WHERE id = ?').bind(revoke[1]).run();return json({revoked:true});
  }
  if(path==='/api/jianying/materials'&&request.method==='POST')return json(await saveVideo(request,env,'source'),201);
  if(path==='/api/jianying/returns'&&request.method==='POST')return json(await saveVideo(request,env,'result'),201);
  throw new Problem('操作不存在',404);
}
export async function saveVideo(request,env,kind,guard=null){
  let name;try{name=decodeURIComponent(request.headers.get('x-file-name')||'剪映视频.mp4');}catch{throw new Problem('文件名不正确');}
  const bytes=await bounded(request,VIDEO_LIMIT);
  if(!bytes.length)throw new Problem('视频不能为空');
  // Validate before saving. The existing signature detector remains authoritative.
  if(!detect(bytes,name).startsWith('video/'))throw new Problem('请选择 MP4 或 WebM 视频');
  const file=await putFile(env,bytes,name),now=new Date().toISOString(),id='jianying-'+kind+'-'+file.id;
  const {result}=await mutate(env,state=>{
    const collection=kind==='source'?state.materials:state.content;
    const old=collection.find(item=>item.id===id);
    if(old)return {file,item:old,duplicate:true};
    const title=file.name.replace(/\.[^.]+$/,'');
    const item=kind==='source'?{id,title,type:'video',typeLabel:'剪映素材',desc:'导入剪映进行剪辑',fileUrl:file.url,fileName:file.name,fileType:file.type,fileSize:file.size,tags:['剪映'],createdAt:now,updated:'刚刚'}:
      normalizeItem({id,title,source:'jianying',sourceLabel:'剪映成品',date:'刚刚',caption:'',desc:'剪映导出的成品视频',body:'',url:'',videoUrl:file.url,fileName:file.name,fileType:file.type,fileSize:file.size,tags:['剪映','成品'],status:'pending',createdAt:now},state.content.length);
    collection.unshift(item);return {file,item,duplicate:false};
  },guard);
  return result;
}
