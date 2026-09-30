export type QDuoReport={schemaVersion:1;generatedAt:string;computer:string;os:string;disks:{name:string;totalBytes:number;freeBytes:number}[];applications:{name:string;version:string;publisher:string;estimatedBytes:number}[];processes:{id:number;name:string;memoryBytes:number;cpuSeconds:number}[];startup:{name:string;command:string}[];caches:{id:string;name:string;path:string;bytes:number;fileCount:number;eligibleBytes:number;errors:number}[];largeFiles:{path:string;bytes:number}[];errors:string[]};
const array=(a:unknown,check:(v:Record<string,unknown>)=>boolean):boolean=>Array.isArray(a)&&a.length<=20000&&a.every(v=>v&&typeof v==='object'&&!Array.isArray(v)&&check(v));
const string=(v:unknown)=>typeof v==='string'&&v.length<=32768;
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function isQDuoReport(value:unknown):value is QDuoReport {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const r=value as Record<string,unknown>;
  return r.schemaVersion===1&&string(r.generatedAt)&&Number.isFinite(Date.parse(r.generatedAt as string))&&string(r.computer)&&string(r.os)&&
    array(r.disks,v=>string(v.name)&&number(v.totalBytes)&&number(v.freeBytes)&&Number(v.freeBytes)<=Number(v.totalBytes))&&
    array(r.applications,v=>string(v.name)&&string(v.version)&&string(v.publisher)&&number(v.estimatedBytes))&&
    array(r.processes,v=>number(v.id)&&string(v.name)&&number(v.memoryBytes)&&number(v.cpuSeconds))&&
    array(r.startup,v=>string(v.name)&&string(v.command))&&
    array(r.caches,v=>string(v.id)&&string(v.name)&&string(v.path)&&number(v.bytes)&&number(v.fileCount)&&number(v.eligibleBytes)&&number(v.errors)&&Number(v.eligibleBytes)<=Number(v.bytes))&&
    array(r.largeFiles,v=>string(v.path)&&number(v.bytes))&&Array.isArray(r.errors)&&r.errors.length<=20000&&r.errors.every(string);
}
export function formatBytes(value:number):string {if(!Number.isFinite(value)||value<0)return '—';if(value===0)return '0 B';const unit=Math.min(4,Math.floor(Math.log(value)/Math.log(1024)));return `${(value/1024**unit).toLocaleString('zh-CN',{maximumFractionDigits:unit===0?0:2})} ${['B','KB','MB','GB','TB'][unit]}`;}
