import {Problem} from './state.js';
export const periodKeys=['periodStart','periodEnd','periodTimeZone','periodPreset'];
export const periodDraft=issue=>Object.fromEntries(periodKeys.filter(key=>Object.hasOwn(issue,key)).map(key=>[key,issue[key]]));
export function periodFields(value){
  if(!periodKeys.some(key=>Object.hasOwn(value,key)))return {};
  const {periodStart:start,periodEnd:end,periodTimeZone:zone,periodPreset:preset}=value;
  const valid=text=>typeof text==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.000)?Z$/.test(text)&&Number.isFinite(Date.parse(text))&&new Date(text).toISOString().replace('.000Z','Z')===text.replace('.000Z','Z');
  if(!valid(start)||!valid(end)||Date.parse(start)>Date.parse(end))throw new Problem('刊期需填写有效的起止时间，结束时间不能早于开始时间');
  if(typeof zone!=='string'||zone.length>80)throw new Problem('刊期时区格式不正确');
  try{new Intl.DateTimeFormat('zh-CN',{timeZone:zone}).format(new Date(start));}catch{throw new Problem('刊期时区格式不正确');}
  if(!['daily','three-days','four-days','weekly','custom'].includes(preset))throw new Problem('刊期类型格式不正确');
  return {periodStart:start,periodEnd:end,periodTimeZone:zone,periodPreset:preset};
}
export function periodLabel(issue){
  try{
    const p=periodFields(issue);if(!p.periodStart)return '';
    const fmt=new Intl.DateTimeFormat('zh-CN',{timeZone:p.periodTimeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    return fmt.format(new Date(p.periodStart))+' — '+fmt.format(new Date(p.periodEnd))+' ('+p.periodTimeZone+')';
  }catch{return '';}
}
