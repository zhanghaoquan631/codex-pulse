import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { boundedJson } from '@/lib/website-api';
import { reply, validCommandId } from '@/lib/mezip-api';
type Claimed={id:string;method:string;path:string;body:string|null;expires:number};
export async function POST(request:Request) {
  const key=(env as unknown as Record<string,string>).INGEST_TOKEN;
  if(!key||request.headers.get('Authorization')!==`Bearer ${key}`)return reply({error:'Unauthorized'},401);
  try {
    const data=await boundedJson(request,4_000_000);
    if(!validCommandId(data.deviceId)||typeof data.online!=='boolean'||!Array.isArray(data.results)||data.results.length>16)return reply({error:'Invalid bridge payload'},400);
    const db=database(),now=Date.now();
    await db.prepare('INSERT OR IGNORE INTO mezip_connection (id,device_id,online,last_seen) VALUES (1,?,?,?)').bind(data.deviceId,data.online?1:0,now).run();
    const current=await db.prepare('SELECT device_id FROM mezip_connection WHERE id=1').first<{device_id:string}>();
    if(current?.device_id!==data.deviceId)return reply({error:'A different computer is already connected'},409);
    const statements=[];
    for(const result of data.results){
      if(!validCommandId(result.id)||!Number.isInteger(result.status)||result.status<200||result.status>599)return reply({error:'Invalid result'},400);
      const body=JSON.stringify(result.body??null);if(body.length>1_800_000)return reply({error:'Result too large'},413);
      statements.push(db.prepare("UPDATE mezip_commands SET state='done',response_status=?,response_body=?,expires=? WHERE id=? AND device_id=? AND state='running'").bind(result.status,body,now+120000,result.id,data.deviceId));
    }
    statements.push(db.prepare('UPDATE mezip_connection SET online=?,last_seen=? WHERE id=1 AND device_id=?').bind(data.online?1:0,now,data.deviceId));
    // Short-lived transport only: original history remains on the computer.
    statements.push(db.prepare('DELETE FROM mezip_commands WHERE expires<?').bind(now-120000));
    await db.batch(statements);
    let commands:Claimed[]=[];
    if(data.online){const claimed=await db.prepare("UPDATE mezip_commands SET state='running',lease_until=? WHERE id IN (SELECT id FROM mezip_commands WHERE device_id=? AND expires>? AND (state='pending' OR (state='running' AND lease_until<?)) ORDER BY created_at LIMIT 8) RETURNING id,method,path,body,expires").bind(now+30000,data.deviceId,now,now).all<Claimed>();commands=claimed.results;}
    return reply({ok:true,commands:commands.map(c=>({...c,body:c.body===null?null:JSON.parse(c.body)}))});
  }catch{return reply({error:'Bridge temporarily unavailable'},503);}
}
