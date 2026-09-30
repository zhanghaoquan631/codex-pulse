import {distanceMeters} from './geo-utils.mjs';
export const STAY_MS=20*60*1000;
export const HISTORY_KEY='xiamen-trips-v1';
const MAX_GAP=90000;
export function createTripRecorder({places,onChange=()=>{}}){
 let trip=null,last=null,arrival=null,candidate=null,departure=null,stay=null,paused=false;
 const emit=()=>onChange(trip);
 function event(type,at,extra={}){trip.events.push({id:trip.events.length+1,type,at,...extra});}
 function resetMotion(){last=null;candidate=null;departure=null;stay=null;arrival=null;}
 function begin(at){trip={version:1,id:'trip-'+at,startedAt:at,endedAt:null,events:[],track:[]};resetMotion();paused=false;event('start',at);}
 function pause(at,reason='定位中断'){
  if(!trip||trip.endedAt||paused)return;
  event('gap',last?.at??at,{until:at,reason});paused=true;resetMotion();emit();
 }
 function feed(position){
  const {ll,accuracy,at}=position;
  if(!Array.isArray(ll)||ll.length!==2||!ll.every(Number.isFinite)||!Number.isFinite(at)||!Number.isFinite(accuracy)||accuracy>100||accuracy<0)return;
  if(!trip||trip.endedAt)begin(at);
  if(last&&at<=last.at)return;
  if(last&&at-last.at>MAX_GAP)pause(at,'定位更新中断，期间未计入停留');
  if(last&&distanceMeters(last.ll,ll)>Math.max(250,(at-last.at)/1000*60))pause(at,'位置跳变，未连接这段轨迹');
  const broken=paused;
  if(paused){const gap=[...trip.events].reverse().find(e=>e.type==='gap');if(gap)gap.until=at;event('resume',at);paused=false;}
  const previous=trip.track.at(-1);
  if(!previous||broken||at-previous.at>=15000||distanceMeters(previous.ll,ll)>=6){
   trip.track.push({ll:[...ll],at,accuracy,breakBefore:broken});
   if(trip.track.length>4000)trip.track=trip.track.filter((p,i)=>i%2===0||p.breakBefore||i===trip.track.length-1);
  }
  if(accuracy<=35){
   const nearest=places.map(p=>({p,d:distanceMeters(p.ll,ll)})).filter(({p,d})=>d<=(p.arrivalRadius??45)).sort((a,b)=>a.d-b.d)[0]?.p;
   if(arrival){
    if(distanceMeters(arrival.place.ll,ll)>(arrival.place.arrivalRadius??45)+35){
     if(!departure)departure={at,count:1};else departure.count++;
     if(departure.count>=2&&at-departure.at>=10000){event('leave',departure.at,{placeId:arrival.place.id,name:arrival.place.name,ll:arrival.place.ll,duration:departure.at-arrival.at});arrival=null;departure=null;candidate=null;}
    }else departure=null;
   }
   if(!arrival&&nearest){
    if(candidate?.place.id!==nearest.id)candidate={place:nearest,at,count:1};else candidate.count++;
    if(candidate.count>=2&&at-candidate.at>=10000){arrival={place:nearest,at:candidate.at};event('arrive',candidate.at,{placeId:nearest.id,name:nearest.name,ll:nearest.ll});candidate=null;}
   }else if(!nearest)candidate=null;
   if(!stay||distanceMeters(stay.ll,ll)>60)stay={ll:[...ll],at,recorded:false};
   if(!stay.recorded&&at-stay.at>=STAY_MS){
    const name=arrival?.place.name||nearest?.name||'沿途停留点';
    event('stay',stay.at+STAY_MS,{name,placeId:arrival?.place.id||nearest?.id,ll:stay.ll,startedAt:stay.at,duration:at-stay.at});stay.recorded=true;
   }
  }else{candidate=null;departure=null;stay=null;}
  last={ll:[...ll],at};emit();
 }
 function stop(at){if(!trip||trip.endedAt)return;event('end',at);trip.endedAt=at;resetMotion();paused=false;emit();}
 return {feed,pause,stop,getTrip:()=>trip,clear(){trip=null;resetMotion();paused=false;}};
}
export function readTrips(storage){
 try{const data=JSON.parse(storage.getItem(HISTORY_KEY)||'[]');return Array.isArray(data)?data.filter(t=>t?.version===1&&typeof t.id==='string'&&Number.isFinite(t.startedAt)&&Array.isArray(t.events)&&Array.isArray(t.track)).slice(-5):[];}catch{return [];}
}
export function saveTrips(storage,trips){storage.setItem(HISTORY_KEY,JSON.stringify(trips.slice(-5)));}
const dateFormat=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
export const tripTime=timestamp=>dateFormat.format(new Date(timestamp));
export function tripDuration(ms){const seconds=Math.max(0,Math.floor(ms/1000)),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);return `${hours?hours+'小时 ':''}${minutes}分 ${seconds%60}秒`;}
