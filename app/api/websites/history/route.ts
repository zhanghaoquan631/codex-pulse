import {database} from "@/db/raw";
import {privateHeaders} from "@/lib/website-api";
import {websiteBoxKey,type WebsiteEvent} from "@/lib/website-boxes";
import type {Website} from "@/lib/website-url";
export async function GET(request:Request){
  try{
    const parameters=new URL(request.url).searchParams,box=parameters.get("box");
    const page=Math.max(1,Math.min(10000,Math.floor(Number(parameters.get("page"))||1))),db=database();
    const rows=await db.prepare("SELECT id,url,box_name boxName FROM websites WHERE hidden=0").all<Website>();
    const ids=rows.results.filter(item=>websiteBoxKey(item)===box).map(item=>item.id);
    if(!ids.length)return Response.json({items:[],hasMore:false,page},{headers:privateHeaders});
    const history=await db.prepare(`WITH links AS (SELECT * FROM websites WHERE hidden=0 AND id IN (SELECT value FROM json_each(?))), records AS (
      SELECT e.id,w.id websiteId,w.url,e.title,e.observed_at observedAt,e.record_type recordType FROM website_events e JOIN links w ON w.id=e.website_id
      UNION ALL SELECT 'first:'||w.id,w.id,w.url,w.title,w.first_seen,'first' FROM links w WHERE NOT EXISTS (SELECT 1 FROM website_events e WHERE e.website_id=w.id AND ABS(julianday(e.observed_at)-julianday(w.first_seen))<2.0/86400)
      UNION ALL SELECT 'last:'||w.id,w.id,w.url,w.title,w.last_seen,'last' FROM links w WHERE w.last_seen<>w.first_seen AND NOT EXISTS (SELECT 1 FROM website_events e WHERE e.website_id=w.id AND ABS(julianday(e.observed_at)-julianday(w.last_seen))<2.0/86400)
    ) SELECT * FROM records ORDER BY observedAt DESC,id LIMIT 51 OFFSET ?`).bind(JSON.stringify(ids),(page-1)*50).all<WebsiteEvent>();
    return Response.json({items:history.results.slice(0,50),hasMore:history.results.length>50,page},{headers:privateHeaders});
  }catch{return Response.json({error:"时间线暂时无法读取，请重试"},{status:503,headers:privateHeaders});}
}
