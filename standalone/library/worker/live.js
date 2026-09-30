import {Problem,load,normalizeItem,validateState} from './state.js';
import {bounded,hash,detect} from './files.js';
import {sha256} from '@noble/hashes/sha2.js';
const CHUNK=8*1024*1024,MAX=8*1024*1024*1024;
const platforms={douyin:'抖音',bilibili:'B 站',kuaishou:'快手',youtube:'YouTube',twitch:'Twitch',other:'其他平台'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const digest=value=>hash(new TextEncoder().encode(value));
async function body(request){try{const data=JSON.parse(new TextDecoder().decode(await bounded(request,12000)));if(!data||typeof data!=='object'||Array.isArray(data))throw 0;return data;}catch(error){if(error instanceof Problem)throw error;throw new Problem('直播提交格式不正确');}}
export async function liveDevice(request,env){
  const match=/^Bearer llive_([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(request.headers.get('authorization')||'');
  if(!match)throw new Problem('请在网站生成配对码后连接直播助手',401);
  const device=await env.DB.prepare('SELECT * FROM live_devices WHERE id = ? AND revoked_at IS NULL AND expires_at > ?').bind(match[1],Date.now()).first();
  if(!device||device.token_hash!==await digest(match[2]))throw new Problem('配对已失效，请重新生成配对码',401);
  return {id:device.id,name:device.name,tokenHash:device.token_hash};
}
async function stillAuthorized(request,env,scope){if(scope.id!=='owner'){const current=await liveDevice(request,env);if(current.id!==scope.id)throw new Problem('配对已失效',401);}}
export async function manageDevices(request,env){
  if(request.method==='GET')return json({devices:(await env.DB.prepare('SELECT id, name, created_at, expires_at, revoked_at FROM live_devices ORDER BY created_at DESC').bind().all()).results});
  if(request.method==='POST'){
    const input=await body(request),name=typeof input.name==='string'?input.name.trim():'';if(!name||name.length>60)throw new Problem('设备名称请输入 1–60 字');
    const active=await env.DB.prepare('SELECT COUNT(*) AS n FROM live_devices WHERE revoked_at IS NULL AND expires_at > ?').bind(Date.now()).first();if(active.n>=10)throw new Problem('最多连接 10 台直播设备，请先断开旧设备');
    const id=crypto.randomUUID().replaceAll('-',''),token=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join(''),at=Date.now(),expires=at+365*86400000;
    await env.DB.prepare('INSERT INTO live_devices (id, name, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(id,name,await digest(token),at,expires).run();return json({id,name,pairingCode:`llive_${id}.${token}`,expiresAt:expires},201);
  }
  const match=/^\/api\/live\/devices\/([a-f0-9]{32})$/.exec(new URL(request.url).pathname);
  if(request.method==='DELETE'&&match){await env.DB.prepare('UPDATE live_devices SET revoked_at = ? WHERE id = ?').bind(Date.now(),match[1]).run();return json({revoked:true});}
  throw new Problem('不支持此操作',405);
}
async function session(env,id,scope,mode='live'){const row=await env.DB.prepare('SELECT * FROM live_uploads WHERE id = ? AND scope = ?').bind(id,scope.id).first();if(!row||(JSON.parse(row.metadata).mode||'live')!==mode)throw new Problem('找不到这次上传',404);if(row.expires_at<=Date.now())throw new Problem('上传已过期，请重新导入',410);return row;}
function metadata(input){
  if(typeof input.name!=='string'||!input.name||input.name.length>180||!Number.isSafeInteger(input.size)||input.size<16||input.size>MAX||!/^[a-f0-9]{64}$/.test(input.sha256||'')||!Object.hasOwn(platforms,input.platform))throw new Problem('回放文件或平台信息不正确（单文件最大 8 GB）');
  const name=input.name.split(/[\\/]/).pop();if(!/\.(mp4|webm|mkv)$/i.test(name))throw new Problem('请选择 MP4、WebM 或 MKV 回放');
  if(input.title!==undefined&&(typeof input.title!=='string'||input.title.length>300))throw new Problem('直播标题最多 300 字');
  const date=input.endedAt?new Date(input.endedAt):new Date();if(!Number.isFinite(date.getTime()))throw new Problem('直播结束时间不正确');const endedAt=date.toISOString();
  return {name,size:input.size,sha256:input.sha256,platform:input.platform,title:input.title?.trim()||name.replace(/\.[^.]+$/,''),endedAt};
}
async function appendReplay(request,env,scope,row){
  const meta=JSON.parse(row.metadata),edited=meta.mode==='jianying',id=edited?'jianying-result-'+meta.sha256.slice(0,32):'live-replay-'+row.file_id;
  for(let attempt=0;attempt<5;attempt++){
    await stillAuthorized(request,env,scope);const {revision,state}=await load(env),existing=state.content.find(x=>x.id===id);if(existing)return existing;
    const at=new Date().toISOString(),item=normalizeItem({id,kind:'live-replay',title:meta.title,source:['douyin','bilibili'].includes(meta.platform)?meta.platform:'manual',sourceLabel:platforms[meta.platform]+'直播回放',tags:['直播回放'],status:'pending',fileUrl:'/api/files/'+row.file_id,fileName:meta.name,fileType:row.type,fileSize:meta.size,livePlatform:meta.platform,liveEndedAt:meta.endedAt,liveDevice:scope.name,createdAt:at,updatedAt:at,date:meta.endedAt.slice(0,10),sequence:state.content.length+1});
    if(edited)Object.assign(item,{kind:'video',source:'jianying',sourceLabel:'网页剪辑成品',tags:['剪映','网页剪辑','成品'],videoUrl:item.fileUrl});
    state.content.push(item);state.updatedAt=at+'-'+crypto.randomUUID().slice(0,8);validateState(state);
    const guard=scope.id==='owner'?'1=1':'EXISTS (SELECT 1 FROM live_devices WHERE id = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > ?)';
    const params=scope.id==='owner'?[]:[scope.id,scope.tokenHash,Date.now()];
    const query=revision===null?env.DB.prepare(`INSERT INTO library (id, revision, payload) SELECT ?, ?, ? WHERE ${guard} ON CONFLICT(id) DO NOTHING`).bind('main',1,JSON.stringify(state),...params):env.DB.prepare(`UPDATE library SET revision = ?, payload = ? WHERE id = ? AND revision = ? AND ${guard}`).bind(revision+1,JSON.stringify(state),'main',revision,...params);
    if((await query.run()).meta.changes===1)return item;
  }throw new Problem('资料库正在保存，请重试',409);
}
export async function liveUploads(request,env,scope,mode='live'){
  const path=new URL(request.url).pathname,method=request.method;
  const base=mode==='jianying'?'/api/jianying/uploads':'/api/live/uploads';
  if(mode==='jianying'&&scope.id!=='owner')throw new Problem('请登录后保存剪辑成品',403);
  if(path==='/api/live/device'&&method==='GET')return json({name:scope.name});
  if(path===base&&method==='POST'){
    const input=await body(request),meta=metadata(mode==='jianying'?{...input,platform:'other'}:input);if(mode==='jianying'){meta.mode=mode;if(!/\.(mp4|webm)$/i.test(meta.name))throw new Problem('请选择 MP4 或 WebM 成品');}
    const id=(await digest((mode==='live'?'':mode+':')+scope.id+':'+meta.sha256)).slice(0,32);
    let row=await env.DB.prepare('SELECT * FROM live_uploads WHERE id = ? AND scope = ?').bind(id,scope.id).first();
    if(row&&(row.status==='complete'||row.status!=='cancelled'&&row.expires_at>Date.now())){if(JSON.parse(row.metadata).size!==meta.size)throw new Problem('相同回放的文件大小不一致',409);return json({id,chunkSize:CHUNK,complete:row.status==='complete'});}
    if(row){if(row.upload_id&&row.status==='uploading')try{await env.BUCKET.resumeMultipartUpload('files/'+row.file_id,row.upload_id).abort();}catch{}await env.DB.prepare('DELETE FROM live_uploads WHERE id = ? AND status <> ?').bind(id,'complete').run();}
    const daily=await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM live_uploads WHERE scope = ? AND created_at > ?').bind(scope.id,Date.now()-86400000).first();if(daily.n>=30||daily.bytes+meta.size>32*1024*1024*1024)throw new Problem('今天上传较多，请明天再试',429);
    const fileId=crypto.randomUUID().replaceAll('-','');
    await env.DB.prepare('INSERT OR IGNORE INTO live_uploads (id, scope, file_id, metadata, size, parts, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id,scope.id,fileId,JSON.stringify(meta),meta.size,'{}','uploading',Date.now(),Date.now()+7*86400000).run();
    return json({id,chunkSize:CHUNK,complete:false},201);
  }
  const match=new RegExp('^'+base+'/([a-f0-9]{32})/(?:parts/(\\d+)|(complete|cancel))$').exec(path);if(!match)throw new Problem('上传地址不正确',403);
  let row=await session(env,match[1],scope,mode),meta=JSON.parse(row.metadata);
  if(match[2]&&method==='PUT'){
    if(row.status==='complete')return json({complete:true});if(!['uploading','verified'].includes(row.status))throw new Problem('这次上传已停止',409);
    const part=Number(match[2]),count=Math.ceil(row.size/CHUNK);if(!Number.isInteger(part)||part<1||part>count)throw new Problem('回放分块编号不正确');
    const bytes=await bounded(request,CHUNK),expected=part===count?row.size-(part-1)*CHUNK:CHUNK;if(bytes.length!==expected)throw new Problem('回放分块大小不正确');
    const sha=await hash(bytes),old=JSON.parse(row.parts)[part];if(old){if(old.sha!==sha)throw new Problem('相同分块内容不一致',409);return json(old);}
    if(row.status==='verified')throw new Problem('回放已完成校验，请重试保存',409);
    const parts=JSON.parse(row.parts);if(part>1&&!parts[part-1])throw new Problem('请按顺序上传回放',409);
    if(part===1&&!row.upload_id){const type=detect(bytes,meta.name);if(!type.startsWith('video/'))throw new Problem('这不是可识别的视频回放');const info={id:row.file_id,url:'/api/files/'+row.file_id,name:meta.name,type,size:meta.size,sha256:meta.sha256};
      const upload=await env.BUCKET.createMultipartUpload('files/'+row.file_id,{httpMetadata:{contentType:type},customMetadata:{info:JSON.stringify(info),sha256:meta.sha256}});
      const saved=await env.DB.prepare('UPDATE live_uploads SET upload_id = ?, type = ? WHERE id = ? AND upload_id IS NULL').bind(upload.uploadId,type,row.id).run();if(saved.meta.changes!==1)await upload.abort();row=await session(env,row.id,scope,mode);
    }
    await stillAuthorized(request,env,scope);const upload=env.BUCKET.resumeMultipartUpload('files/'+row.file_id,row.upload_id),saved=await upload.uploadPart(part,bytes);const result={partNumber:part,etag:saved.etag,sha,size:bytes.length};
    await stillAuthorized(request,env,scope);await env.DB.prepare("UPDATE live_uploads SET parts = json_set(parts, ?, json(?)) WHERE id = ? AND status = 'uploading'").bind('$."'+part+'"',JSON.stringify(result),row.id).run();return json(result);
  }
  if(match[3]==='complete'&&method==='POST'){
    if(row.status==='cancelled')throw new Problem('这次上传已停止',409);
    const parts=Object.values(JSON.parse(row.parts)).sort((a,b)=>a.partNumber-b.partNumber);if(parts.length!==Math.ceil(row.size/CHUNK)||parts.reduce((n,x)=>n+x.size,0)!==row.size)throw new Problem('回放尚未上传完整',409);
    await stillAuthorized(request,env,scope);
    if(!await env.BUCKET.head('files/'+row.file_id)){try{await env.BUCKET.resumeMultipartUpload('files/'+row.file_id,row.upload_id).complete(parts.map(({partNumber,etag})=>({partNumber,etag})));}catch(error){if(!await env.BUCKET.head('files/'+row.file_id))throw error;}}
    if(!['verified','complete'].includes(row.status)){
      const object=await env.BUCKET.get('files/'+row.file_id);if(!object||object.size!==meta.size)throw new Problem('回放大小校验失败',409);
      let actual;if(typeof crypto.DigestStream==='function'){const stream=new crypto.DigestStream('SHA-256');await object.body.pipeTo(stream);actual=[...new Uint8Array(await stream.digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}else{const h=sha256.create(),reader=object.body.getReader();while(true){const {value,done}=await reader.read();if(done)break;h.update(value);}actual=[...h.digest()].map(x=>x.toString(16).padStart(2,'0')).join('');}
      if(actual!==meta.sha256){await env.BUCKET.delete('files/'+row.file_id);await env.DB.prepare("UPDATE live_uploads SET status = 'cancelled' WHERE id = ?").bind(row.id).run();throw new Problem('回放校验失败，请重新选择文件上传',409);}
      await env.DB.prepare("UPDATE live_uploads SET status = 'verified' WHERE id = ?").bind(row.id).run();
    }
    const item=await appendReplay(request,env,scope,row);await env.DB.prepare("UPDATE live_uploads SET status = 'complete' WHERE id = ?").bind(row.id).run();return json(scope.id==='owner'?{item,saved:true}:{item:{id:item.id},saved:true});
  }
  if(match[3]==='cancel'&&method==='POST'){if(row.status==='complete')throw new Problem('回放已经保存',409);if(row.upload_id)await env.BUCKET.resumeMultipartUpload('files/'+row.file_id,row.upload_id).abort();await env.DB.prepare("UPDATE live_uploads SET status = 'cancelled' WHERE id = ?").bind(row.id).run();return json({cancelled:true});}
  throw new Problem('不支持此操作',405);
}
