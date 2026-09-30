import type {Website} from "./website-url";

export type WebsiteBox={id:string;title:string;address:string;url:string;kind:Website["kind"];firstSeen:string;lastSeen:string;items:Website[];recordCount:number;matchedCount:number};
export type WebsiteEvent={id:string;websiteId:string;url:string;title:string;observedAt:string;recordType:"delivery"|"saved"|"first"|"last"};
export function websiteBoxKey(item:Website){
  const name=item.boxName?.trim();
  if(name)return `named:${name}`;
  const url=new URL(item.url);
  if(["localhost","127.0.0.1","[::1]"].includes(url.hostname))url.hostname="localhost";
  return `origin:${url.origin}`;
}
export function groupWebsiteBoxes(items:Website[],query="",kind=""){
  const groups=new Map<string,Website[]>();
  for(const item of items){const key=websiteBoxKey(item);const group=groups.get(key)||[];group.push(item);groups.set(key,group);}
  const boxes:WebsiteBox[]=[];
  const needle=query.trim().toLocaleLowerCase();
  for(const [id,links] of groups){
    links.sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)||a.id.localeCompare(b.id));
    const representative=links.find(item=>{const url=new URL(item.url);return url.pathname==="/"&&!url.search&&!url.hash;})||links[0];
    const firstSeen=links.reduce((stamp,item)=>item.firstSeen<stamp?item.firstSeen:stamp,links[0].firstSeen);
    const boxKind=links.some(item=>item.kind==="developed")?"developed":"shared";
    const title=representative.boxName?.trim()||representative.title;
    const nameMatches=title.toLocaleLowerCase().includes(needle);
    const matchedCount=links.filter(item=>!needle||nameMatches||`${item.title} ${item.url}`.toLocaleLowerCase().includes(needle)).length;
    if(!matchedCount||(kind&&kind!==boxKind))continue;
    boxes.push({id,title,address:new URL(representative.url).host,url:representative.url,kind:boxKind,firstSeen,lastSeen:links[0].lastSeen,items:links,matchedCount,recordCount:links.reduce((count,item)=>count+(item.eventCount|| (item.firstSeen===item.lastSeen?1:2)),0)});
  }
  return boxes.sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)||a.id.localeCompare(b.id));
}
const formatter=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
export function websiteTime(value:string){
  if(!Number.isFinite(Date.parse(value)))return "时间未记录";
  const parts=Object.fromEntries(formatter.formatToParts(new Date(value)).map(part=>[part.type,part.value]));
  return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}:${parts.second}`;
}
