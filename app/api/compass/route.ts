import { database } from '@/db/raw';
import { boundedJson, isOwner, websiteId } from '@/lib/website-api';
import { compassKinds, validCompassDate } from '@/lib/compass-types';
import { readCompass, saveCompassDay } from '@/lib/compass-store';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization, OAI-Authenticated-User-Id, OAI-Authenticated-User-Email','X-Content-Type-Options':'nosniff'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function scopeFor(request:Request){const id=request.headers.get('oai-authenticated-user-id');return id&&isOwner(request)?websiteId('compass:'+id):null;}
export async function GET(request:Request){
  const scope=await scopeFor(request);
  if(!scope)return reply({error:'请登录网站管理账号，查看自己的 Compass 记录。',needsLogin:true},401);
  const date=new URL(request.url).searchParams.get('date');
  if(!validCompassDate(date))return reply({error:'请选择有效日期。'},400);
  try{return reply(await readCompass(scope,date));}catch{return reply({error:'记录暂时无法读取，请重试。'},503);}
}
export async function POST(request:Request){
  const scope=await scopeFor(request);
  if(!scope)return reply({error:'登录状态已变化，请重新登录网站管理账号。',needsLogin:true},401);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'请从本站保存记录。'},403);
  let body;
  try{body=await boundedJson(request,16000);}catch{return reply({error:'记录格式无效或过长。'},400);}
  if(!body||!validCompassDate(body.date))return reply({error:'请选择有效日期。'},400);
  const date=body.date;
  try{
    const db=database();
    if(body.action==='entry'||body.action==='task'){
      if(typeof body.id!=='string'||!idPattern.test(body.id)||typeof body.text!=='string'||!body.text.trim()||body.text.length>4000)return reply({error:'请输入 1–4000 字的记录。'},400);
      const text=body.text.trim(),id=body.id.toLowerCase();
      if(body.action==='entry'){
        if(!Object.hasOwn(compassKinds,body.kind))return reply({error:'记录类型无效。'},400);
        await db.prepare('INSERT INTO compass_entries(scope,id,date,kind,text,created) VALUES(?,?,?,?,?,?) ON CONFLICT(scope,id) DO NOTHING').bind(scope,id,date,body.kind,text,Date.now()).run();
        const saved=await db.prepare('SELECT date,kind,text FROM compass_entries WHERE scope=? AND id=?').bind(scope,id).first<{date:string;kind:string;text:string}>();
        if(!saved||saved.date!==date||saved.kind!==body.kind||saved.text!==text)return reply({error:'这条记录的编号已使用，请修改内容后重试。'},409);
      }else{
        const due=body.due||null;
        if(due!==null&&!validCompassDate(due))return reply({error:'截止日期无效。'},400);
        await db.prepare('INSERT INTO compass_tasks(scope,id,text,due,done,version,created) VALUES(?,?,?,?,0,1,?) ON CONFLICT(scope,id) DO NOTHING').bind(scope,id,text,due,Date.now()).run();
        const saved=await db.prepare('SELECT text,due FROM compass_tasks WHERE scope=? AND id=?').bind(scope,id).first<{text:string;due:string|null}>();
        if(!saved||saved.text!==text||saved.due!==due)return reply({error:'这条任务的编号已使用，请修改内容后重试。'},409);
      }
    }else if(body.action==='toggle'){
      if(typeof body.id!=='string'||!idPattern.test(body.id)||typeof body.done!=='boolean'||!Number.isSafeInteger(body.version)||body.version<1)return reply({error:'任务状态无效。'},400);
      const result=await db.prepare('UPDATE compass_tasks SET done=?,version=version+1 WHERE scope=? AND id=? AND version=?').bind(body.done?1:0,scope,body.id,body.version).run();
      if(!result.meta.changes){const current=await db.prepare('SELECT done FROM compass_tasks WHERE scope=? AND id=?').bind(scope,body.id).first<{done:number}>();if(!current||!!current.done!==body.done)return reply({error:'任务已在另一页面更新，请重新读取。',conflict:true},409);}
    }else if(body.action==='habit'||body.action==='scores'){
      if(!Number.isSafeInteger(body.version)||body.version<0)return reply({error:'记录版本无效。'},400);
      const current=(await readCompass(scope,date)).day;
      let matches=false;
      if(body.action==='habit'){
        if(!Number.isInteger(body.index)||body.index<0||body.index>2||typeof body.value!=='boolean')return reply({error:'习惯格式无效。'},400);
        matches=current.habits[body.index]===body.value;
        current.habits[body.index]=body.value;
      }else{
        if(!Array.isArray(body.scores)||body.scores.length!==6||body.scores.some((v:unknown)=>v!==null&&(!Number.isInteger(v)||Number(v)<1||Number(v)>10)))return reply({error:'每题请选择 1–10 分，或留空。'},400);
        matches=JSON.stringify(current.scores)===JSON.stringify(body.scores);
        current.scores=body.scores;
      }
      if(!matches&&(current.version!==body.version||!await saveCompassDay(scope,date,current,body.version)))return reply({error:'这一天已在另一页面更新。你的输入已保留，请重新读取后核对。',conflict:true},409);
    }else return reply({error:'不支持的操作。'},400);
    return reply(await readCompass(scope,date));
  }catch{return reply({error:'暂时无法确认保存结果，输入已保留。请点击原按钮重试，同一条记录不会重复添加。'},503);}
}
