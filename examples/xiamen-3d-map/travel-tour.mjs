import {distanceMeters} from './geo-utils.mjs';

export const islandCategories={all:'全部地点',coast:'海滩海景',garden:'园林山景',heritage:'建筑街巷',museum:'展馆纪念',ferry:'码头'};
export function categoryOf(p){
 if(p.category)return p.category;
 if(p.area==='ferry')return 'ferry';
 if(['beach','lujiang'].includes(p.id))return 'coast';
 if(['sunlight','shuzhuang','haoyue','yuyuan'].includes(p.id))return 'garden';
 return ['piano','bagua'].includes(p.id)?'museum':'heritage';
}
export function filterIsland(places,category='all',query=''){
 const text=query.trim().toLowerCase();
 return places.filter(p=>p.island&&(category==='all'||categoryOf(p)===category)&&(!text||[p.name,p.kind,p.intro].some(v=>v.toLowerCase().includes(text))));
}
// Nearby-first camera order; this is a presentation, never a walking itinerary.
export function islandTourOrder(places,start='sanqiutian'){
 const pending=new Map(places.map(p=>[p.id,p])),result=[];
 let current=pending.get(start)||places[0];
 while(current){const from=current.ll;result.push(current.id);pending.delete(current.id);current=[...pending.values()].sort((a,b)=>distanceMeters(from,a.ll)-distanceMeters(from,b.ll))[0];}
 return result;
}
export function tourStage(elapsed,seconds){return Math.min(2,Math.floor(Math.max(0,elapsed)/(seconds*1000/3)));}
export function createTravelTour({onVisit,onChange=()=>{},onProgress=()=>{},now=()=>performance.now()}){
 let ids=[],index=0,running=false,started=0,held=0,seconds=18,ended=false;
 const state=()=>({running,ended,index,total:ids.length,current:ids[index]??null,seconds,elapsed:Math.min(seconds*1000,held+(running?now()-started:0))});
 const visit=()=>{ended=false;held=0;started=now();onVisit(ids[index]);onChange(state());onProgress(state());};
 return {
  start(list,start){ids=[...new Set(list)];if(!ids.length)return;index=Math.max(0,ids.indexOf(start));running=true;visit();},
  pause(){held=state().elapsed;running=false;onChange(state());},
  resume(){if(!ids.length||running)return;running=true;if(ended){index=0;visit();return;}started=now();onChange(state());},
  step(delta){if(!ids.length)return;index=(index+delta+ids.length)%ids.length;visit();},
  speed(value){seconds=Math.max(5,Math.min(60,Number(value)||18));held=0;started=now();ended=false;onChange(state());onProgress(state());},
  seekStage(stage){held=Math.max(0,Math.min(2,stage))*seconds*1000/3;started=now();onProgress(state());},
  tick(){if(!running)return;onProgress(state());if(state().elapsed>=seconds*1000){if(index===ids.length-1){held=seconds*1000;running=false;ended=true;onChange(state());}else{index++;visit();}}},
  resetClock(){held=0;started=now();},getState:state
 };
}
