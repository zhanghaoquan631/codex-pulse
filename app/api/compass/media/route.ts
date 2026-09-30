import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { compassScope, compassHeaders, compassReply as reply } from '@/lib/compass-auth';
import { cleanPng } from '@/lib/compass-png';
import { uuid } from '@/lib/compass-workspace';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const scope=await compassScope(request);if(!scope)return reply({error:'请登录网站管理账号。'},401);
  const id=new URL(request.url).searchParams.get('id');if(!id||!uuid.test(id))return reply({error:'封面不存在。'},404);
  try{if(!await database().prepare('SELECT id FROM compass_media WHERE scope=? AND id=?').bind(scope,id).first())return reply({error:'封面不存在。'},404);const object=await env.BUCKET?.get(`compass/${scope}/${id}.png`);if(!object)return reply({error:'封面暂时无法读取。'},503);return new Response(object.body,{headers:{...compassHeaders,'Content-Type':'image/png','Content-Security-Policy':"default-src 'none'; sandbox"}});}catch{return reply({error:'封面暂时无法读取。'},503);}
}
export async function POST(request:Request){
  const scope=await compassScope(request);if(!scope)return reply({error:'请登录网站管理账号。'},401);if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'请从本站上传。'},403);
  if(request.headers.get('Content-Type')!=='image/png')return reply({error:'请选择 PNG、JPEG 或 WebP 图片。'},400);
  let image;
  try{const reader=request.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3_000_000){await reader.cancel();throw new Error();}chunks.push(value);}image=await cleanPng(new Uint8Array(await new Blob(chunks as BlobPart[]).arrayBuffer()));}catch{return reply({error:'图片无效或太大，请换一张图片。'},400);}
  const id=crypto.randomUUID(),key=`compass/${scope}/${id}.png`;
  try{if(!env.BUCKET)throw new Error('Storage unavailable');await env.BUCKET.put(key,image.bytes,{httpMetadata:{contentType:'image/png'}});try{await database().prepare('INSERT INTO compass_media(scope,id,width,height,created) VALUES(?,?,?,?,?)').bind(scope,id,image.width,image.height,Date.now()).run();}catch(error){await env.BUCKET.delete(key);throw error;}return reply({id,width:image.width,height:image.height});}catch{return reply({error:'封面未能保存，请重试。原来的封面仍保留。'},503);}
}
