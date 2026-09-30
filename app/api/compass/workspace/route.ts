import { database } from '@/db/raw';
import { boundedJson } from '@/lib/website-api';
import { compassScope, compassReply as reply } from '@/lib/compass-auth';
import { defaultConfig, emptyTimer, timerTransition, uuid, validConfig, type Timer, type WorkspaceConfig } from '@/lib/compass-workspace';
export const dynamic='force-dynamic';
async function read(scope:string){
  const db=database();
  const [docs,memories]=await Promise.all([db.prepare('SELECT key,payload,version FROM compass_workspace WHERE scope=?').bind(scope).all<{key:string;payload:string;version:number}>(),db.prepare('SELECT id,text,priority,done,remind_at AS remindAt,notified,version,created FROM compass_memories WHERE scope=? ORDER BY done ASC,created DESC LIMIT 500').bind(scope).all<{id:string;text:string;priority:string;done:number;remindAt:number|null;notified:number;version:number;created:number}>()]);
  const config=docs.results.find(d=>d.key==='config'),timer=docs.results.find(d=>d.key==='timer');
  const [alerts,due]=await Promise.all([db.prepare('SELECT id,text FROM compass_alerts WHERE scope=? AND seen=0 ORDER BY created ASC LIMIT 50').bind(scope).all<{id:string;text:string}>(),db.prepare('SELECT id,text,priority,done,remind_at AS remindAt,notified,version,created FROM compass_memories WHERE scope=? AND done=0 AND notified=0 AND remind_at<=? ORDER BY remind_at ASC LIMIT 50').bind(scope,Date.now()).all()]);
  return {config:config?JSON.parse(config.payload) as WorkspaceConfig:defaultConfig(),configVersion:config?.version||0,timer:timer?{...JSON.parse(timer.payload),version:timer.version} as Timer:emptyTimer(),memories:memories.results.map(m=>({...m,done:!!m.done,notified:!!m.notified})),dueMemories:due.results,alerts:alerts.results,serverNow:Date.now()};
}
async function cas(scope:string,key:string,payload:unknown,version:number){
  if(version===0)return !!(await database().prepare('INSERT INTO compass_workspace(scope,key,payload,version) VALUES(?,?,?,1) ON CONFLICT(scope,key) DO NOTHING').bind(scope,key,JSON.stringify(payload)).run()).meta.changes;
  return !!(await database().prepare('UPDATE compass_workspace SET payload=?,version=version+1 WHERE scope=? AND key=? AND version=?').bind(JSON.stringify(payload),scope,key,version).run()).meta.changes;
}
export async function GET(request:Request){const scope=await compassScope(request);if(!scope)return reply({error:'请登录网站管理账号。',needsLogin:true},401);try{return reply(await read(scope));}catch{return reply({error:'暂时无法读取，请重试。'},503);}}
export async function POST(request:Request){
  const scope=await compassScope(request);if(!scope)return reply({error:'请重新登录网站管理账号。',needsLogin:true},401);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'请从本站操作。'},403);
  let b;try{b=await boundedJson(request,150000);}catch{return reply({error:'内容无效或过长。'},400);}
  if(!b||!Number.isSafeInteger(b.version)||b.version<0)return reply({error:'记录版本无效。'},400);
  try{
    const db=database();let notify=false;
    if(b.action==='config'){
      if(!validConfig(b.config))return reply({error:'请检查板块名称、标签、内容和计时设置。'},400);
      for(const id of [...b.config.sections.map((s:{cover:string|null})=>s.cover),...b.config.portraits])if(id&&!await db.prepare('SELECT id FROM compass_media WHERE scope=? AND id=?').bind(scope,id).first())return reply({error:'图片不存在，请重新上传。'},400);
      if(!await cas(scope,'config',b.config,b.version))return reply({error:'配置已在另一页面更改。草稿已保留，请重新读取后核对。'},409);
    }else if(b.action==='timer'){
      const current=(await read(scope)).timer;
      if(current.version!==b.version)return reply({error:'计时状态已变化，正在重新同步。'},409);
      const next=timerTransition(current,b.command,Date.now(),b);
      if(!next)return reply({error:'当前计时状态不支持此操作。'},400);
      if(b.command==='finish'){
        const results=await db.batch([db.prepare('UPDATE compass_workspace SET payload=?,version=version+1 WHERE scope=? AND key=? AND version=?').bind(JSON.stringify(next),scope,'timer',b.version),db.prepare("INSERT INTO compass_alerts(scope,id,text,seen,created) SELECT ?,?,?,0,? WHERE EXISTS(SELECT 1 FROM compass_workspace WHERE scope=? AND key='timer' AND version=? AND json_extract(payload,'$.id')=? AND json_extract(payload,'$.status')='finished') ON CONFLICT(scope,id) DO NOTHING").bind(scope,'timer:'+current.id,current.phase==='focus'?'专注完成了，休息一下吧。':'休息结束了，准备好再开始。',Date.now(),scope,b.version+1,current.id)]);
        if(!results[0].meta.changes)return reply({error:'计时状态已在另一页面更新。'},409);
      }else if(!await cas(scope,'timer',next,b.version))return reply({error:'计时状态已在另一页面更新。'},409);
      notify=b.command==='finish';
    }else if(b.action==='memory'){
      if(typeof b.id!=='string'||!uuid.test(b.id)||typeof b.text!=='string'||!b.text.trim()||b.text.length>2000||!['normal','important'].includes(b.priority)||typeof b.done!=='boolean'||!(b.remindAt===null||(Number.isSafeInteger(b.remindAt)&&b.remindAt>0&&b.remindAt<4102444800000)))return reply({error:'请填写有效的重要事项。'},400);
      if(b.version===0){
        const result=await db.prepare('INSERT INTO compass_memories(scope,id,text,priority,done,remind_at,notified,version,created) VALUES(?,?,?,?,?,?,0,1,?) ON CONFLICT(scope,id) DO NOTHING').bind(scope,b.id,b.text.trim(),b.priority,b.done?1:0,b.remindAt,Date.now()).run();
        if(!result.meta.changes){const old=await db.prepare('SELECT text,priority,done,remind_at FROM compass_memories WHERE scope=? AND id=?').bind(scope,b.id).first<{text:string;priority:string;done:number;remind_at:number|null}>();if(!old||old.text!==b.text.trim()||old.priority!==b.priority||!!old.done!==b.done||old.remind_at!==b.remindAt)return reply({error:'事项已更新，请重新读取。'},409);}
      }else if(!(await db.prepare('UPDATE compass_memories SET text=?,priority=?,done=?,notified=CASE WHEN remind_at IS ? THEN notified ELSE 0 END,remind_at=?,version=version+1 WHERE scope=? AND id=? AND version=?').bind(b.text.trim(),b.priority,b.done?1:0,b.remindAt,b.remindAt,scope,b.id,b.version).run()).meta.changes)return reply({error:'事项已在另一页面更新，输入已保留。'},409);
    }else if(b.action==='memory-delete'){
      if(typeof b.id!=='string'||!uuid.test(b.id))return reply({error:'事项编号无效。'},400);
      const results=await db.batch([db.prepare('DELETE FROM compass_alerts WHERE scope=? AND id LIKE ? AND EXISTS(SELECT 1 FROM compass_memories WHERE scope=? AND id=? AND version=?)').bind(scope,'memory:'+b.id+':%',scope,b.id,b.version),db.prepare('DELETE FROM compass_memories WHERE scope=? AND id=? AND version=?').bind(scope,b.id,b.version)]);
      if(!results[1].meta.changes)return reply({error:'事项已变化，请重新读取。'},409);
    }else if(b.action==='memory-alert'){
      if(typeof b.id!=='string'||!uuid.test(b.id))return reply({error:'事项编号无效。'},400);
      const results=await db.batch([db.prepare("INSERT INTO compass_alerts(scope,id,text,seen,created) SELECT scope,'memory:'||id||':'||remind_at,'你交代的事：'||text,0,? FROM compass_memories WHERE scope=? AND id=? AND done=0 AND notified=0 AND remind_at<=? AND version=? ON CONFLICT(scope,id) DO NOTHING").bind(Date.now(),scope,b.id,Date.now(),b.version),db.prepare('UPDATE compass_memories SET notified=1 WHERE scope=? AND id=? AND done=0 AND notified=0 AND remind_at<=? AND version=?').bind(scope,b.id,Date.now(),b.version)]);notify=!!results[0].meta.changes;
    }else if(b.action==='ack-alert'){
      if(typeof b.id!=='string'||b.id.length>120)return reply({error:'提醒编号无效。'},400);
      await db.prepare('UPDATE compass_alerts SET seen=1 WHERE scope=? AND id=?').bind(scope,b.id).run();
    }else return reply({error:'不支持此操作。'},400);
    return reply({...await read(scope),notify});
  }catch{return reply({error:'保存暂时失败，输入已保留，请重试。'},503);}
}
