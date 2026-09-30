import {database} from "@/db/raw";
import {boundedJson,canWrite,isOwner,privateHeaders,websiteId} from "@/lib/website-api";
import {cleanWebsiteUrl,type Website} from "@/lib/website-url";
import {groupWebsiteBoxes} from "@/lib/website-boxes";
export async function GET(request:Request){
  try{
    const parameters=new URL(request.url).searchParams;
    const query=(parameters.get("q")||"").slice(0,120),kind=parameters.get("kind");
    const requestedPage=Math.max(1,Math.min(10000,Math.floor(Number(parameters.get("page"))||1)));
    const db=database();
    const [rows,sync]=await Promise.all([
      db.prepare("SELECT w.id,w.url,w.title,w.kind,w.source,w.first_seen firstSeen,w.last_seen lastSeen,w.box_name boxName,((SELECT COUNT(*) FROM website_events e WHERE e.website_id=w.id) + NOT EXISTS(SELECT 1 FROM website_events e WHERE e.website_id=w.id AND ABS(julianday(e.observed_at)-julianday(w.first_seen))<2.0/86400) + (w.last_seen<>w.first_seen AND NOT EXISTS(SELECT 1 FROM website_events e WHERE e.website_id=w.id AND ABS(julianday(e.observed_at)-julianday(w.last_seen))<2.0/86400))) eventCount FROM websites w WHERE hidden=0 ORDER BY last_seen DESC,id").all<Website>(),
      db.prepare("SELECT payload FROM website_sync WHERE id=1").first<{payload:string}>()
    ]);
    const all=groupWebsiteBoxes(rows.results),boxes=groupWebsiteBoxes(rows.results,query,kind==="developed"||kind==="shared"?kind:"");
    const page=Math.min(requestedPage,Math.max(1,Math.ceil(boxes.length/48)));
    const groups=["developed","shared"].map(kind=>({kind,count:all.filter(box=>box.kind===kind).length}));
    return Response.json({items:boxes.slice((page-1)*48,page*48),total:boxes.length,linkTotal:rows.results.length,groups,page,canManage:isOwner(request),sync:sync?JSON.parse(sync.payload):null},{headers:privateHeaders});
  }catch{return Response.json({error:"收藏暂时无法读取，请稍后重试"},{status:503,headers:privateHeaders});}
}
export async function POST(request:Request){
  if(!canWrite(request))return Response.json({error:"请使用网站创建账号登录后管理"},{status:403,headers:privateHeaders});
  try{
    const data=await boundedJson(request,10000),url=cleanWebsiteUrl(data.url);
    if(!url)return Response.json({error:"请输入有效网址；不收录登录或带访问密钥的链接"},{status:400});
    const title=typeof data.title==="string"?data.title.trim().slice(0,120):"",kind=data.kind==="developed"?"developed":"shared";
    const boxName=typeof data.boxName==="string"?data.boxName.trim().slice(0,120):"",stamp=new Date().toISOString(),id=await websiteId(url),db=database();
    const existing=await db.prepare("SELECT id FROM websites WHERE id=?").bind(id).first();
    const statements=[db.prepare("INSERT INTO websites (id,url,title,kind,source,first_seen,last_seen,hidden,customized,box_name) VALUES (?,?,?,?,?,?,?,0,1,?) ON CONFLICT(url) DO UPDATE SET title=excluded.title,kind=excluded.kind,box_name=excluded.box_name,hidden=0,customized=1").bind(id,url,title||new URL(url).hostname,kind,"manual",stamp,stamp,boxName)];
    if(!existing)statements.push(db.prepare("INSERT INTO website_events (id,website_id,title,observed_at,record_type) VALUES (?,?,?,?,'saved')").bind(await websiteId(`${url}|${stamp}`),id,title||new URL(url).hostname,stamp));
    await db.batch(statements);
    return Response.json({ok:true},{headers:privateHeaders});
  }catch{return Response.json({error:"保存失败，输入内容已保留，请重试"},{status:503,headers:privateHeaders});}
}
export async function DELETE(request:Request){
  if(!canWrite(request))return Response.json({error:"请先登录管理"},{status:403,headers:privateHeaders});
  const id=new URL(request.url).searchParams.get("id");if(!id||!/^[a-f0-9]{64}$/.test(id))return new Response("Invalid ID",{status:400});
  try{await database().prepare("UPDATE websites SET hidden=1,customized=1 WHERE id=?").bind(id).run();return Response.json({ok:true},{headers:privateHeaders});}
  catch{return Response.json({error:"删除失败，请重试"},{status:503,headers:privateHeaders});}
}
