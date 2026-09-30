import {Problem,load,mutate,emptyState} from './state.js';
import {hash,filePattern,detect,bounded,putFile} from './files.js';
import {publicURL} from './preview.js';
import {exportBundle} from './bundle.js';
import {Unzlib} from 'fflate';

const limit=25*1024*1024;
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const sameCache=(a,b)=>canonical(a)===canonical(b);
export async function selectSource(state,payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Problem('请选择周刊或内容');
  const sourceType=payload.sourceType||'newsletter',sourceId=payload.sourceId||payload.issueId;
  if(!['newsletter','content'].includes(sourceType)||typeof sourceId!=='string')throw new Problem('请选择周刊或内容');
  const item=state[sourceType==='newsletter'?'newsletters':'content'].find(x=>x.id===sourceId&&!x.deletedAt);
  if(!item)throw new Problem('所选周刊或内容已不存在，请重新选择',404);
  const source=structuredClone(sourceType==='newsletter'?item:{title:item.title,date:item.date,items:[item]});
  const sourceHash=await hash(new TextEncoder().encode(canonical(source)));
  if(payload.sourceHash&&payload.sourceHash!==sourceHash)throw new Problem('内容在生成期间已被修改，请重新生成；已生成图片仍可下载',409);
  return {sourceType,sourceId,source,sourceHash};
}
// Sources are derived from owner records; never forward browser credentials.
async function remoteImage(value,{wechat=false}={}){
  const allowed=u=>{
    const url=publicURL(u),host=url.hostname.toLowerCase();
    if(wechat&&!['qpic.cn','qlogo.cn'].some(d=>host===d||host.endsWith('.'+d)))throw new Problem('此微信图片链接不支持直接读取，请拖入原图文件或从相册选择');
    return url;
  };
  let url=allowed(value);
  // Bilibili's AVIF thumbnail transformation has an original raster resource.
  // Read the same cover as JPEG/PNG for older phone decoders as well.
  if((url.hostname==='hdslb.com'||url.hostname.endsWith('.hdslb.com'))&&/\.(jpe?g|png|webp)@[^/]*\.avif$/i.test(url.pathname))url.pathname=url.pathname.split('@')[0];
  for(let i=0;i<5;i++){
    const response=await fetch(url,{redirect:'manual',headers:{Accept:'image/*'},signal:AbortSignal.timeout(15000)});
    if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');await response.body?.cancel();if(!next)throw new Problem('图片重定向不完整');url=allowed(new URL(next,url).href);continue;}
    if(!response.ok||!response.headers.get('content-type')?.startsWith('image/')){await response.body?.cancel();throw new Problem('图片暂时无法读取，请重试或替换封面');}
    const bytes=await bounded(response,10*1024*1024),type=detect(bytes,'cover');
    if(!type.startsWith('image/'))throw new Problem('来源未返回支持的图片');
    return {bytes,type};
  }
  throw new Problem('图片重定向过多');
}
export async function materialImage(payload){if(!payload||typeof payload.url!=='string')throw new Problem('图片地址不正确');return remoteImage(payload.url,{wechat:true});}
export async function sourceCover(env,payload){
  const selected=await selectSource((await load(env)).state,payload);
  const index=Number(payload.index);if(!Number.isInteger(index)||index< -1||index>=selected.source.items.length)throw new Problem('图片位置不正确');
  const cover=(index===-1?selected.source:selected.source.items[index]).coverUrl;
  if(!cover)throw new Problem('该内容没有封面',404);
  const id=filePattern.exec(cover)?.[1];
  if(id){const obj=await env.BUCKET.get('files/'+id);if(!obj)throw new Problem('封面文件不存在',404);const bytes=await bounded(new Response(obj.body),limit),type=detect(bytes,'cover');if(!type.startsWith('image/'))throw new Problem('封面不是图片');return {bytes,type};}
  return remoteImage(cover);
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const byte of bytes)n=crcTable[(n^byte)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
export function pngSize(bytes){
  if(bytes.length<57||![137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)||new TextDecoder().decode(bytes.slice(12,16))!=='IHDR')throw new Problem('请选择完整的 PNG 长图');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getUint32(16),height=view.getUint32(20);
  if(view.getUint32(8)!==13||!width||width>3000||!height||width*height>100000000||bytes[24]!==8||bytes[25]!==6||bytes[26]||bytes[27]||bytes[28])throw new Problem('长图尺寸或 PNG 编码不支持');
  let offset=8,idat=false,ended=false,rawSize=0;
  const stride=1+width*4,expected=height*stride,decoder=new Unzlib((data)=>{for(let p=(stride-rawSize%stride)%stride;p<data.length;p+=stride)if(data[p]>4)throw new Problem('PNG 行编码不正确');rawSize+=data.length;if(rawSize>expected)throw new Problem('PNG 像素数据过多');});
  try{while(offset<bytes.length){if(offset+12>bytes.length)throw new Problem('PNG 文件不完整');const size=view.getUint32(offset),end=offset+12+size;if(end>bytes.length||crc(bytes.subarray(offset+4,end-4))!==view.getUint32(end-4))throw new Problem('PNG 文件校验失败');const type=new TextDecoder().decode(bytes.subarray(offset+4,offset+8));if(type==='IHDR'&&offset!==8)throw new Problem('PNG 重复头部');if(type==='IDAT'){if(!size||ended)throw new Problem('PNG 图像数据不完整');idat=true;for(let p=offset+8;p<end-4;p+=1024)decoder.push(bytes.subarray(p,Math.min(p+1024,end-4)),false);}if(type==='IEND'){if(size||end!==bytes.length||!idat)throw new Problem('PNG 文件尾部不正确');decoder.push(new Uint8Array(),true);ended=true;}offset=end;}}
  catch(error){if(error instanceof Problem)throw error;throw new Problem('PNG 像素数据校验失败');}
  if(!idat||!ended||rawSize!==expected)throw new Problem('PNG 文件不完整');return {width,height};
}
function submission(payload){if(typeof payload.submissionId!=='string'||!/^[-\w]{8,100}$/.test(payload.submissionId))throw new Problem('备份请求标识不正确');return 'backup-'+payload.submissionId;}
function matchRetry(cache,payload,kind){if(cache.kind!==kind||cache.sourceId!==(payload.sourceId||payload.issueId)||cache.sourceType!==(payload.sourceType||'newsletter')||cache.sourceHash!==payload.sourceHash||(kind==='long-image'&&cache.fileUrl!==payload.fileUrl))throw new Problem('同一备份请求的内容已变化，请重新生成',409);return cache;}
async function register(env,payload,selected,file,kind,dimensions={}){
  const id=submission(payload);
  const {result}=await mutate(env,async state=>{
    const old=state.backupCaches.find(x=>x.id===id);if(old)return matchRetry(old,payload,kind);
    await selectSource(state,{...payload,sourceHash:selected.sourceHash});
    const cache={id,kind,sourceType:selected.sourceType,sourceId:selected.sourceId,title:selected.source.title,sourceHash:selected.sourceHash,createdAt:new Date().toISOString(),fileUrl:file.url,fileName:(selected.source.title||'灵感备份').slice(0,90)+(kind==='long-image'?'.png':'.zip'),fileType:file.type,size:file.size,sha256:file.sha256,...dimensions};
    state.backupCaches.unshift(cache);return cache;
  });return {cache:result};
}
export async function saveLongImage(env,payload){
  if(!payload||!/^[a-f0-9]{64}$/.test(payload.sourceHash||''))throw new Problem('请先读取内容再生成长图');
  const id=submission(payload),state=(await load(env)).state,old=state.backupCaches.find(x=>x.id===id);if(old)return {cache:matchRetry(old,payload,'long-image')};
  const selected=await selectSource(state,payload),fileId=filePattern.exec(payload.fileUrl||'')?.[1];if(!fileId)throw new Problem('请先上传长图');
  const obj=await env.BUCKET.get('files/'+fileId);if(!obj)throw new Problem('长图尚未上传',404);
  const bytes=await bounded(new Response(obj.body),limit),sha256=await hash(bytes),file=JSON.parse(obj.customMetadata.info||'{}');
  if(file.type!=='image/png'||file.sha256!==sha256||file.id!==sha256.slice(0,32)||file.size!==bytes.length)throw new Problem('长图附件校验失败');
  return register(env,payload,selected,file,'long-image',pngSize(bytes));
}
export async function saveIssueBackup(env,payload){
  if(!payload||!/^[a-f0-9]{64}$/.test(payload.sourceHash||''))throw new Problem('请先读取要备份的周刊');
  const id=submission(payload),state=(await load(env)).state,old=state.backupCaches.find(x=>x.id===id);if(old)return {cache:matchRetry(old,payload,'issue-backup')};
  const selected=await selectSource(state,payload);if(selected.sourceType!=='newsletter')throw new Problem('请选择要备份的周刊');
  const frozen=structuredClone(selected.source),downloaded=new Map();
  for(const record of [frozen,...frozen.items])if(record.coverUrl&&!filePattern.test(record.coverUrl)){
    const original=record.coverUrl;if(!downloaded.has(original)){const image=await remoteImage(original);downloaded.set(original,await putFile(env,image.bytes,'issue-cover.'+image.type.split('/')[1]));}
    record.originalCoverUrl=record.originalCoverUrl||original;record.coverUrl=downloaded.get(original).url;
  }
  const scoped={...emptyState(),newsletters:[frozen],content:structuredClone(frozen.items),sourceBackupPaths:[]};
  const {bytes,manifest}=await exportBundle(env,scoped);if(bytes.length>limit)throw new Problem('该期备份超过 25 MB，请使用完整电脑备份',413);
  const file=await putFile(env,bytes,'issue-backup.zip');return {...await register(env,payload,selected,file,'issue-backup'),manifest};
}
