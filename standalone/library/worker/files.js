import {Problem} from './state.js';
export const filePattern=/^\/api\/files\/([a-f0-9]{32})$/;
export const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function bounded(response,limit){
  if(Number(response.headers.get('content-length'))>limit)throw new Problem('文件超过允许大小',413);
  const reader=response.body?.getReader();if(!reader)return new Uint8Array();
  const parts=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Problem('文件超过允许大小',413);parts.push(value);}}
  catch(error){await reader.cancel();throw error;}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export function detect(bytes,name){
  const s=new TextDecoder('latin1').decode(bytes.slice(0,16));
  if(bytes[0]===137&&s.slice(1,4)==='PNG')return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(s.startsWith('GIF87a')||s.startsWith('GIF89a'))return 'image/gif';
  if(s.startsWith('RIFF')&&s.slice(8,12)==='WEBP')return 'image/webp';
  if(s.startsWith('%PDF-'))return 'application/pdf';
  if(bytes[0]===80&&bytes[1]===75&&((bytes[2]===3&&bytes[3]===4)||(bytes[2]===5&&bytes[3]===6)))return 'application/zip';
  if(s.slice(4,8)==='ftyp'&&['isom','iso2','mp41','mp42','avc1','M4V ','qt  '].includes(s.slice(8,12)))return 'video/mp4';
  if(bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163&&new TextDecoder().decode(bytes.slice(0,4096)).includes('webm'))return 'video/webm';
  if(bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163&&new TextDecoder().decode(bytes.slice(0,4096)).includes('matroska'))return 'video/x-matroska';
  if(/\.(txt|md)$/i.test(name)&&!bytes.includes(0)){new TextDecoder('utf-8',{fatal:true}).decode(bytes);return 'text/plain; charset=utf-8';}
  throw new Problem('支持图片、MP4、WebM、PDF 和 UTF-8 文本');
}
export async function putFile(env,bytes,name,{id,sourceUrl}={}){
  if(!env.BUCKET)throw new Problem('文件存储暂不可用',503);
  const type=detect(bytes,name),sha256=await hash(bytes);id=id||sha256.slice(0,32);
  if(!/^[a-f0-9]{32}$/.test(id))throw new Problem('文件标识不正确');
  const existing=await env.BUCKET.head('files/'+id);
  if(existing&&existing.customMetadata?.sha256!==sha256)throw new Problem('相同文件标识内容不一致',409);
  const result={id,url:'/api/files/'+id,name:name.split(/[\\/]/).pop().slice(0,160)||'文件',type,size:bytes.length,sha256,...(sourceUrl?{sourceUrl}:{})};
  if(!existing)await env.BUCKET.put('files/'+id,bytes,{httpMetadata:{contentType:type},customMetadata:{info:JSON.stringify(result),sha256}});
  return existing?.customMetadata?.info?JSON.parse(existing.customMetadata.info):result;
}
export async function serveFile(request,env,id){
  const head=await env.BUCKET.head('files/'+id);if(!head)throw new Problem('文件不存在',404);
  let start=0,end=head.size-1,partial=false;
  const range=request.headers.get('range');
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
    start=match[1]?Number(match[1]):Math.max(0,head.size-Number(match[2]));end=match[1]&&match[2]?Math.min(Number(match[2]),end):end;
    if(start>end||start>=head.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});partial=true;
  }
  const info=JSON.parse(head.customMetadata.info),headers={'Content-Type':info.type,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(info.name)};
  if(partial)headers['Content-Range']=`bytes ${start}-${end}/${head.size}`;
  const file=request.method==='HEAD'?null:await env.BUCKET.get('files/'+id,{range:{offset:start,length:end-start+1}});
  return new Response(file?.body||null,{status:partial?206:200,headers});
}
