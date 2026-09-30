import { env } from "cloudflare:workers";
export const privateHeaders = {"Cache-Control":"no-store", "Vary":"Cookie"};
export function isOwner(request:Request) {
  const owner=(env as unknown as Record<string,string>).OWNER_EMAIL;
  return !!owner && request.headers.get("oai-authenticated-user-email")?.toLowerCase()===owner.toLowerCase();
}
export function canWrite(request:Request) {
  const origin=request.headers.get("Origin");
  return isOwner(request) && !!origin && origin===new URL(request.url).origin;
}
export async function boundedJson(request:Request,limit=150000) {
  const reader=request.body?.getReader(); if(!reader)throw new Error("Missing body");
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error("Body too large");}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function websiteId(url:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(url)))).map(v=>v.toString(16).padStart(2,"0")).join("");}
