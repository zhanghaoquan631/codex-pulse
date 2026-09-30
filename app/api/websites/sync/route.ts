import {env} from "cloudflare:workers";
import {database} from "@/db/raw";
import {boundedJson,websiteId} from "@/lib/website-api";
import {cleanWebsiteUrl} from "@/lib/website-url";
export async function POST(request:Request){
  const token=(env as unknown as Record<string,string>).INGEST_TOKEN;
  if(!token||request.headers.get("Authorization")!==`Bearer ${token}`)return new Response("Unauthorized",{status:401});
  try{
    const data=await boundedJson(request,300000);
    if(!Array.isArray(data.items)||data.items.length>50|| (data.events!==undefined&&(!Array.isArray(data.events)||data.events.length>50)))return new Response("Invalid batch",{status:400});
    const db=database(),statements=[];
    for(const item of data.items){const url=cleanWebsiteUrl(item.url);if(!url||typeof item.title!=="string"||!Number.isFinite(Date.parse(item.firstSeen))||!Number.isFinite(Date.parse(item.lastSeen)))return new Response("Invalid link",{status:400});
      statements.push(db.prepare("INSERT INTO websites (id,url,title,kind,source,first_seen,last_seen,hidden,customized) VALUES (?,?,?,?,?,?,?,0,0) ON CONFLICT(url) DO UPDATE SET first_seen=MIN(websites.first_seen,excluded.first_seen),last_seen=MAX(websites.last_seen,excluded.last_seen),title=CASE WHEN websites.customized=0 AND excluded.title<>? AND (websites.title=? OR length(excluded.title)>length(websites.title)) THEN excluded.title ELSE websites.title END,kind=CASE WHEN websites.customized=0 AND excluded.kind='developed' THEN 'developed' ELSE websites.kind END").bind(await websiteId(url),url,item.title.slice(0,120)||new URL(url).hostname,item.kind==="developed"?"developed":"shared","codex",new Date(item.firstSeen).toISOString(),new Date(item.lastSeen).toISOString(),new URL(url).hostname,new URL(url).hostname));
    }
    for(const event of data.events||[]){
      const url=cleanWebsiteUrl(event.url);
      if(!url||typeof event.title!=="string"||!Number.isFinite(Date.parse(event.observedAt)))return new Response("Invalid event",{status:400});
      const stamp=new Date(event.observedAt).toISOString();
      statements.push(db.prepare("INSERT OR IGNORE INTO website_events (id,website_id,title,observed_at,record_type) VALUES (?,?,?,?,'delivery')").bind(await websiteId(`${url}|${stamp}`),await websiteId(url),event.title.slice(0,120)||new URL(url).hostname,stamp));
    }
    const progress=data.progress||{},number=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?v:0;
    const payload=JSON.stringify({lastSync:new Date().toISOString(),phase:progress.phase==="importing"?"importing":"ready",files:number(progress.files),scanned:number(progress.scanned),saved:number(progress.saved),errors:number(progress.errors)});
    statements.push(db.prepare("INSERT INTO website_sync (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").bind(payload));
    await db.batch(statements);return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"Sync unavailable"},{status:503});}
}
