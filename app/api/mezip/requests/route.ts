import { database } from '@/db/raw';
import { boundedJson, canWrite, isOwner, websiteId } from '@/lib/website-api';
import { bridgeStatus, connected, reply, validCommandId } from '@/lib/mezip-api';
import { allowedBridgeRequest } from '@/integration/mezip/bridge-policy.mjs';
type CommandRow={fingerprint:string;state:string;response_status:number|null;response_body:string|null;expires:number};
export async function POST(request:Request) {
  if(!canWrite(request))return reply({error:'请使用网站所属账号登录'},403);
  try {
    const data=await boundedJson(request,150000);
    if(!validCommandId(data.id)||!allowedBridgeRequest(data.method,data.path))return reply({error:'不支持的 ME.zip 操作'},400);
    if(data.method==='GET'&&data.body!==undefined&&data.body!==null)return reply({error:'GET 请求不能携带内容'},400);
    const body=data.body===undefined||data.body===null?null:JSON.stringify(data.body);
    const fingerprint=await websiteId(JSON.stringify([data.method,data.path,body]));
    const db=database(),existing=await db.prepare('SELECT fingerprint FROM mezip_commands WHERE id=?').bind(data.id).first<{fingerprint:string}>();
    if(existing)return existing.fingerprint===fingerprint?reply({ok:true,id:data.id},202):reply({error:'请求编号冲突'},409);
    const status=await bridgeStatus();if(!connected(status))return reply({error:'电脑上的 ME.zip 暂时离线，联网后会自动恢复'},503);
    const now=Date.now();
    const result=await db.prepare("INSERT OR IGNORE INTO mezip_commands (id,fingerprint,device_id,method,path,body,state,created_at,expires,lease_until) SELECT ?,?,?,?,?,?,'pending',?,?,0 WHERE (SELECT COUNT(*) FROM mezip_commands WHERE state!='done' AND expires>?)<256").bind(data.id,fingerprint,status!.device_id,data.method,data.path,body,now,now+60000,now).run();
    if(!result.meta.changes){const row=await db.prepare('SELECT fingerprint FROM mezip_commands WHERE id=?').bind(data.id).first<{fingerprint:string}>();if(row?.fingerprint===fingerprint)return reply({ok:true,id:data.id},202);return reply({error:'正在处理其他请求，请稍后重试'},429);}
    return reply({ok:true,id:data.id},202);
  }catch{return reply({error:'无法提交操作'},503);}
}
export async function GET(request:Request) {
  if(!isOwner(request))return reply({error:'请使用网站所属账号登录'},403);
  const id=new URL(request.url).searchParams.get('id');if(!validCommandId(id))return reply({error:'请求编号无效'},400);
  try {const row=await database().prepare('SELECT fingerprint,state,response_status,response_body,expires FROM mezip_commands WHERE id=?').bind(id).first<CommandRow>();
    if(!row)return reply({error:'请求不存在或已过期'},404);
    if(row.state==='done')return row.expires<Date.now()?reply({error:'操作回执已过期，请重新读取记录'},410):reply({state:'done',status:row.response_status,body:JSON.parse(row.response_body||'null')});
    if(row.expires<Date.now())return reply({state:'expired',error:'连接中断，操作结果尚未确认；请重新读取记录后检查'},408);
    return reply({state:row.state},202);
  }catch{return reply({error:'无法读取操作状态'},503);}
}
