import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker/main.js';
export function environment(){
  const sql=new DatabaseSync(':memory:');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')))sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  const objects=new Map(),multiparts=new Map();
  return {OWNER_EMAIL:'owner@example.com',SYNC_TOKEN:'a'.repeat(40),DB:{
    prepare(query){
      const stmt=sql.prepare(query);
      return {bind(...values){return {
        async first(){return stmt.get(...values)||null;},
        async all(){return {results:stmt.all(...values)};},
        async run(){const r=stmt.run(...values);return {meta:{changes:r.changes}};}
      };}};
    }
  },BUCKET:{
    async delete(key){objects.delete(key);},
    async createMultipartUpload(key,options){const uploadId=crypto.randomUUID();multiparts.set(uploadId,{key,options,parts:new Map()});return this.resumeMultipartUpload(key,uploadId);},
    resumeMultipartUpload(key,uploadId){return {key,uploadId,async uploadPart(partNumber,bytes){const m=multiparts.get(uploadId);if(!m||m.key!==key)throw Error('missing upload');const etag=crypto.randomUUID();m.parts.set(partNumber,{etag,bytes:Uint8Array.from(bytes)});return {partNumber,etag};},async complete(parts){const m=multiparts.get(uploadId);if(!m)throw Error('missing upload');const arrays=parts.map(p=>{const x=m.parts.get(p.partNumber);if(x?.etag!==p.etag)throw Error('bad etag');return x.bytes;});const bytes=new Uint8Array(arrays.reduce((n,x)=>n+x.length,0));let offset=0;for(const x of arrays){bytes.set(x,offset);offset+=x.length;}objects.set(key,{bytes,options:m.options});multiparts.delete(uploadId);},async abort(){multiparts.delete(uploadId);}};},
    async head(key){const x=objects.get(key);return x?{size:x.bytes.length,...x.options}:null},
    async put(key,bytes,options){objects.set(key,{bytes:Uint8Array.from(bytes),options});},
    async get(key,opts){const x=objects.get(key);if(!x)return null;let bytes=x.bytes;if(opts?.range)bytes=bytes.slice(opts.range.offset,opts.range.offset+opts.range.length);return {size:bytes.length,...x.options,body:new Response(bytes).body,async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}}}
  },close(){sql.close()}};
}
export async function call(env,path,{auth='owner',method='GET',body,headers={}}={}){
  const h={...headers};if(auth==='owner'){h['oai-authenticated-user-id']='user-1';h['oai-authenticated-user-email']='owner@example.com';if(!Object.hasOwn(h,'origin'))h.origin='https://example.com';}if(auth==='other'){h['oai-authenticated-user-id']='other';h['oai-authenticated-user-email']='other@example.com';}if(auth==='sync')h.authorization='Bearer '+env.SYNC_TOKEN;
  if(body&&!(body instanceof Uint8Array)){body=JSON.stringify(body);h['content-type']='application/json';}
  return worker.fetch(new Request('https://example.com'+path,{method,headers:h,body}),env);
}
export const image=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);

