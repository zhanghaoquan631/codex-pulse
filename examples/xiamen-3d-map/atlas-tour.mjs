// A presentation clock: never advances while a dialog, hidden tab or scene pause suspends it.
export function createAtlasTour({onVisit,onChange=()=>{},seconds=18}){
 let ids=[],index=0,elapsed=0,running=false,ended=false;
 const state=()=>({ids:[...ids],index,total:ids.length,current:ids[index]??null,elapsed,seconds,running,ended});
 const emit=()=>onChange(state());
 const visit=()=>{elapsed=0;ended=false;onVisit(ids[index],index);emit();};
 return {
  start(list,current){ids=[...new Set(list)];if(!ids.length)return false;index=Math.max(0,ids.indexOf(current));running=true;visit();return true;},
  pause(){running=false;emit();},
  resume(){if(!ids.length)return false;running=true;if(ended){index=0;visit();}else emit();return true;},
  cancel(){ids=[];index=0;elapsed=0;running=false;ended=false;emit();},
  step(delta){if(!ids.length)return;index=(index+delta+ids.length)%ids.length;visit();},
  speed(value){if(!Number.isFinite(Number(value)))return;seconds=Math.max(5,Math.min(60,Number(value)));elapsed=Math.min(elapsed,seconds*1000);emit();},
  tick(ms,suspended=false){if(!running||suspended)return;elapsed+=Math.max(0,ms);if(elapsed>=seconds*1000){if(index===ids.length-1){elapsed=seconds*1000;running=false;ended=true;emit();}else{index++;visit();}}},
  getState:state
 };
}
