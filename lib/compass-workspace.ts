import { compassHabits, compassQuestions } from './compass-types';
export const sectionIds = ['tasks','journal','questions','habits','focus','companions'] as const;
export type SectionId = typeof sectionIds[number];
export type Section = { id:string; name:string; description:string; tags:string[]; cover:string|null; color:string };
export type WorkspaceConfig = { title:string; sections:Section[]; habits:string[]; questions:string[]; kinds:string[]; companions:string[]; portraits:(string|null)[]; focusSeconds:number; restSeconds:number; rotate:boolean };
export type Timer = { id:string; phase:'focus'|'rest'; status:'idle'|'running'|'paused'|'finished'; endAt:number; remainingMs:number; durationMs:number; version:number };
export type Memory = { id:string; text:string; priority:'normal'|'important'; done:boolean; remindAt:number|null; notified:boolean; version:number; created:number };
export type Workspace = { config:WorkspaceConfig; configVersion:number; timer:Timer; memories:Memory[]; dueMemories:Memory[]; alerts:{id:string;text:string}[]; serverNow:number; notify?:boolean };
export const colors=['sage','rose','night','sand','lilac'] as const;
export function defaultConfig():WorkspaceConfig { return { title:'Compass 今日', sections:[
  ['tasks','下一件事','把想法落到行动。','行动'],['journal','一天的片段','记下收获，也留住微小的幸福。','记录'],['questions','与自己对话','用六个问题，回看今天的努力。','回顾'],['habits','小小坚持','完成一件，点亮一件。','习惯'],['focus','专注时光','一次只做一件事。','专注'],['companions','伙伴与重要事项','把细节交给这里，留出心力做事。','陪伴']
].map(([id,name,description,tag],i)=>({id,name,description,tags:[tag],cover:null,color:colors[i%colors.length]})), habits:[...compassHabits],questions:[...compassQuestions],kinds:['日记','今日收获','感恩'],companions:['绯红','紫夜','墨绿','默白','暮酒'],portraits:[null,null,null,null,null],focusSeconds:1500,restSeconds:300,rotate:true }; }
export function emptyTimer():Timer{return {id:'',phase:'focus',status:'idle',endAt:0,remainingMs:0,durationMs:0,version:0};}
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const short=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function validConfig(value:unknown):value is WorkspaceConfig {
  if(!value||typeof value!=='object')return false;const c=value as WorkspaceConfig;
  if(!short(c.title,40)||!Array.isArray(c.sections)||c.sections.length<6||c.sections.length>18||new Set(c.sections.map(s=>s?.id)).size!==c.sections.length)return false;
  if(!sectionIds.every(id=>c.sections.some(s=>s.id===id)))return false;
  if(!c.sections.every(s=>s&&typeof s.id==='string'&&(sectionIds.includes(s.id as SectionId)||uuid.test(s.id))&&short(s.name,40)&&typeof s.description==='string'&&s.description.length<=2000&&Array.isArray(s.tags)&&s.tags.length<=8&&s.tags.every(t=>short(t,24))&&(s.cover===null||(typeof s.cover==='string'&&uuid.test(s.cover)))&&colors.includes(s.color as typeof colors[number])))return false;
  for(const [list,count,max] of [[c.habits,3,40],[c.questions,6,160],[c.kinds,3,40],[c.companions,5,24]] as [string[],number,number][])if(!Array.isArray(list)||list.length!==count||!list.every(v=>short(v,max)))return false;
  return Array.isArray(c.portraits)&&c.portraits.length===5&&c.portraits.every(p=>p===null||(typeof p==='string'&&uuid.test(p)))&&Number.isInteger(c.focusSeconds)&&c.focusSeconds>=1&&c.focusSeconds<=21600&&Number.isInteger(c.restSeconds)&&c.restSeconds>=1&&c.restSeconds<=21600&&typeof c.rotate==='boolean';
}
export function remaining(timer:Timer,now:number){return timer.status==='running'?Math.max(0,timer.endAt-now):timer.status==='paused'?timer.remainingMs:0;}
export function mergeConfig(base:WorkspaceConfig,draft:WorkspaceConfig,latest:WorkspaceConfig):WorkspaceConfig {
  const merge=<T extends object>(a:T,b:T,c:T):T=>Object.fromEntries(Object.keys(c).map(key=>[key,JSON.stringify(a[key as keyof T])===JSON.stringify(b[key as keyof T])?c[key as keyof T]:b[key as keyof T]])) as T;
  const result=merge(base,draft,latest);
  result.sections=latest.sections.filter(s=>!base.sections.some(b=>b.id===s.id)||draft.sections.some(d=>d.id===s.id)).map(s=>{const a=base.sections.find(b=>b.id===s.id),b=draft.sections.find(b=>b.id===s.id);return a&&b?merge(a,b,s):s;});
  for(const s of draft.sections)if(!latest.sections.some(c=>c.id===s.id)&&!base.sections.some(c=>c.id===s.id))result.sections.push(s);
  return result;
}
export function timerTransition(timer:Timer,action:string,now:number,options:{seconds?:number;phase?:string;id?:string}={}):Timer|null {
  if(action==='start'){
    if(!['idle','finished'].includes(timer.status)||!Number.isInteger(options.seconds)||options.seconds!<1||options.seconds!>21600||!['focus','rest'].includes(options.phase||'')||!uuid.test(options.id||''))return null;
    return {id:options.id!,phase:options.phase as Timer['phase'],status:'running',endAt:now+options.seconds!*1000,remainingMs:options.seconds!*1000,durationMs:options.seconds!*1000,version:timer.version+1};
  }
  if(action==='pause'&&timer.status==='running'&&timer.endAt>now)return {...timer,status:'paused',remainingMs:remaining(timer,now),endAt:0,version:timer.version+1};
  if(action==='resume'&&timer.status==='paused')return {...timer,status:'running',endAt:now+timer.remainingMs,version:timer.version+1};
  if(action==='finish'&&timer.status==='running'&&timer.endAt<=now)return {...timer,status:'finished',remainingMs:0,version:timer.version+1};
  if(action==='reset'&&timer.status!=='idle')return {...emptyTimer(),version:timer.version+1};
  return null;
}
