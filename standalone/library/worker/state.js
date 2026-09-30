import {periodFields} from './periods.js';
import {textStyleFields} from './text-style-schema.js';
import {validCache} from './backup-cache-schema.js';
export class Problem extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const emptyState=()=>({content:[],materials:[],materialBoxes:[],backupCaches:[],tags:[],newsletters:[],updatedAt:null});
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const plain=x=>x!==null && typeof x==='object' && !Array.isArray(x);
export function validateState(state){
  if(!plain(state)||!['content','materials','tags','newsletters'].every(k=>Array.isArray(state[k])&&state[k].every(plain))) throw new Problem('资料库格式不正确');
  for(const key of ['content','materials','newsletters']) if(new Set(state[key].map(x=>x.id)).size!==state[key].length||state[key].some(x=>typeof x.id!=='string'||!x.id)) throw new Problem('记录标识重复或缺失');
  if(state.materialBoxes===undefined)state.materialBoxes=[];
  if(state.backupCaches===undefined)state.backupCaches=[];
  if(!Array.isArray(state.backupCaches)||state.backupCaches.some(x=>!validCache(x))||new Set(state.backupCaches.map(x=>x.id)).size!==state.backupCaches.length)throw new Problem('备份缓存格式不正确');
  if(!Array.isArray(state.materialBoxes)||state.materialBoxes.some(x=>!plain(x)||typeof x.id!=='string'||!x.id||typeof x.name!=='string'||!x.name.trim()||x.name.length>60)||new Set(state.materialBoxes.map(x=>x.id)).size!==state.materialBoxes.length)throw new Problem('素材箱格式不正确');
  if(state.newsletters.some(x=>!Array.isArray(x.items)||!x.items.every(plain)||!/^[-\w]{16,100}$/.test(x.token))) throw new Problem('周刊快照格式不正确');
  for(const issue of state.newsletters){periodFields(issue);textStyleFields(issue);for(const item of issue.items)textStyleFields(item);}
  for(const item of state.content)textStyleFields(item);
  if(JSON.stringify(state).length>1500000) throw new Problem('资料库超过当前单次保存容量，请先备份',413);
  return state;
}
export function normalizeItem(item,index=0){
  if(!plain(item)) throw new Problem('内容格式不正确');
  return {...item,id:String(item.id||crypto.randomUUID()),title:String(item.title||'未命名灵感').slice(0,300),
    caption:String(item.caption??item.desc??''),body:String(item.body||''),
    desc:String(item.desc||item.caption||''),url:String(item.url||'').slice(0,2000),coverUrl:String(item.coverUrl||'').slice(0,2000),
    tags:Array.isArray(item.tags)?item.tags.map(String).slice(0,12):[],rating:Math.max(0,Math.min(5,Math.trunc(Number(item.rating)||0))),
    sequence:Math.max(1,Math.trunc(Number(item.sequence)||index+1)),status:item.status==='ready'?'ready':'pending'};
}
export async function load(env){
  if(!env.DB) throw new Problem('资料库暂时无法连接，请稍后重试',503);
  const row=await env.DB.prepare('SELECT revision, payload FROM library WHERE id = ?').bind('main').first();
  if(!row) return {revision:null,state:emptyState()};
  return {revision:row.revision,state:validateState(JSON.parse(row.payload))};
}
export async function mutate(env,change,guard=null){
  for(let attempt=0;attempt<5;attempt++){
    if(guard)await guard.check();
    const {revision,state}=await load(env);
    const result=await change(state);
    state.updatedAt=new Date().toISOString()+'-'+crypto.randomUUID().slice(0,8);
    validateState(state);
    const query=guard ? (revision===null
      ? env.DB.prepare('INSERT INTO library (id, revision, payload) SELECT ?, ?, ? WHERE '+guard.sql+' ON CONFLICT(id) DO NOTHING').bind('main',1,JSON.stringify(state),...guard.values)
      : env.DB.prepare('UPDATE library SET revision = ?, payload = ? WHERE id = ? AND revision = ? AND '+guard.sql).bind(revision+1,JSON.stringify(state),'main',revision,...guard.values)) : revision===null
      ? env.DB.prepare('INSERT OR IGNORE INTO library (id, revision, payload) VALUES (?, ?, ?)').bind('main',1,JSON.stringify(state))
      : env.DB.prepare('UPDATE library SET revision = ?, payload = ? WHERE id = ? AND revision = ?').bind(revision+1,JSON.stringify(state),'main',revision);
    const saved=await query.run();
    if(saved.meta.changes===1) return {state,result};
    if(guard)await guard.check();
  }
  throw new Problem('另一设备正在保存，请重试',409);
}
export function applyChanges(state,changes){
  if(!Array.isArray(changes)||changes.length>10000) throw new Problem('修改内容格式不正确');
  for(const change of changes){
    if(!plain(change)||!['content','materials','tags','materialBoxes'].includes(change.collection)||!plain(change.item)||!(change.base===null||plain(change.base))) throw new Problem('修改内容格式不正确');
    const key=change.collection==='tags'?'name':'id', incoming=change.item,base=change.base,id=incoming[key];
    if(typeof id!=='string'||!id||(base&&base[key]!==id)) throw new Problem('记录标识不正确');
    const target=state[change.collection].find(x=>x[key]===id);
    if(target?.deletedAt)throw new Problem('记录已删除，请刷新或从回收站恢复',409);
    if(Object.hasOwn(incoming,'deletedAt')&&!same(incoming.deletedAt,base?.deletedAt))throw new Problem('请通过删除或恢复按钮改变记录状态',400);
    if(!base){if(!target)state[change.collection].push(change.collection==='content'?normalizeItem(incoming,state.content.length):incoming);else if(!same(target,incoming))throw new Problem('相同记录已存在，请刷新后核对',409);continue;}
    if(!target) throw new Problem('记录已被另一设备移除，请保留草稿',409);
    const updates=Object.entries(incoming).filter(([k,v])=>!same(base[k],v));
    if(updates.some(([k,v])=>!same(target[k],base[k])&&!same(target[k],v)&&!['updatedAt','date'].includes(k))) throw new Problem('另一设备修改了同一字段，请保留草稿并核对',409);
    for(const [k,v] of updates) if(!['__proto__','constructor','prototype'].includes(k))target[k]=v;
    if(change.collection==='content') Object.assign(target,normalizeItem(target));
  }
}
