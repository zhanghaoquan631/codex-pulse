import {groundHeight} from './landforms.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const absolute=(level,p)=>Number.isFinite(p.absoluteY)?p.absoluteY:p.absoluteY===true?(p.y||0):groundHeight(level,p.x,p.z)+(p.y||0);
const target=(level,p,data)=>({...data,x:p.x,y:absolute(level,p),z:p.z,available:data.available!==false,completed:!!data.completed});

/** Targets use live runtime positions, never the chapter's old spawn coordinates. */
export function missionTargets(level){
 if(!level?.hunt)return [];
 const h=level.hunt,items=[],allClues=h.clueIds.every(id=>level.collectibles.find(c=>c.id===id)?.collected);
 for(const id of h.clueIds){const c=level.collectibles.find(c=>c.id===id);if(c)items.push(target(level,c,{id:'chip:'+id,category:'main',kind:'chip',label:c.name||'密码芯片',completed:c.collected,instruction:c.collected?'这枚芯片已收集':'到标记旁按 E 收集，楼上物品需要走楼梯。'}));}
 const station=level.collectibles.find(c=>c.id===(h.riddleSiteId||h.clueIds[0]));
 if(station)items.push(target(level,station,{id:'riddle',category:'main',kind:'riddle',label:'猜谜地点',completed:h.riddleSolved,instruction:h.riddleSolved?'本关谜语已解开':h.letters.length>=(h.riddle?.answer.length||Infinity)?'字母齐全，到现场打开 Q 验证谜底。':'先击倒野怪并拾取字母卡；Q 可随时输入草稿。'}));
 const j=level.journey,step=j?.steps[j.stepIndex];
 if(step&&!j.completed)items.push(target(level,step,{id:'journey:'+step.id,category:'main',kind:'journey',label:'地区任务 · '+step.title,instruction:step.instruction||'到紫色任务标记旁按 E 操作。'}));
 const gate=level.doors.find(d=>d.id===h.gateId),ready=h.killHalf&&h.clueHalf&&(!j||j.completed);
 const destination=h.phase==='boss'||gate?.open?h.target:gate||h.target;
 items.push(target(level,destination,{id:'task',category:'main',kind:'task',label:h.phase==='boss'?'本关 Boss 战场':'远端任务房',completed:h.phase==='won',instruction:h.phase==='boss'?'击败已出现的地区首领。':ready?'开门条件齐全，靠近任务房门按 E，再进入战场。':`击杀 ${h.kills} / ${h.killTarget}；${allClues?'芯片齐全':'仍需寻找芯片'}，解谜合成两半钥匙${j&&!j.completed?'，并完成地区任务「'+(step?.title||j.title)+'」':''}后开门。`}));
 for(const d of h.letterDrops||[])if(!d.collected)items.push(target(level,{...d,absoluteY:true},{id:'letter:'+d.id,category:'main',kind:'letter',label:'字母卡 '+d.letter,instruction:'靠近且可见时自动拾取，注意卡片实际楼层。'}));
 if(level.evacuation){const e=level.evacuation;items.push(target(level,e.safeZone,{id:'evacuation',category:'rescue',kind:'evacuation',label:'旅人避难处',completed:e.status==='complete',available:e.status!=='failed',instruction:e.status==='failed'?'存活人数不足 5，仍可完成主线。':`已护送 ${e.delivered} / ${e.target}；靠近街上旅人带领他们到这里。`}));}
 for(const s of level.survivors||[])items.push(target(level,{...s,absoluteY:true},{id:'survivor:'+s.id,category:'rescue',kind:'survivor',label:'屋内受困旅人',completed:s.rescued,available:s.alive!==false,urgent:level.structures?.find(b=>b.id===s.structureId)?.status==='warning',instruction:s.rescued?'屋内旅人已经安全救出。':s.alive===false?'旅人已遇难，请重试本关。':s.following?'旅人正在跟随，带他走出房屋才能完成救援。':'到同一楼层，让他看见你或按 E 招呼，然后带他离开房屋。'}));
 for(const n of level.npcs||[])if(['merchant','shop'].includes(n.type))items.push(target(level,n,{id:'merchant:'+n.id,category:'supplies',kind:'merchant',label:'行商',available:n.alive!==false,instruction:n.alive===false?'行商遇难，本局无法购买。':n.fleeing?'行商正奔跑避险，方向随他的位置更新。':'靠近同一楼层按 E 交易。'}));
 for(const e of level.expedition?.evidence||[])items.push(target(level,e,{id:'evidence:'+e.id,category:'exploration',kind:'evidence',label:e.name,completed:e.collected,instruction:e.collected?(e.rewardClaimed?'调查与补给领取已完成。':'记录已收入 N 笔记，可选择一份调查补给。'):'靠近绿色「证」按 E 调查，在 N 笔记选择补给。'}));
 for(const c of level.collectibles||[])if(c.kind==='supply')items.push(target(level,c,{id:'supply:'+c.id,category:'supplies',kind:'supply',label:c.name||'补给',completed:c.collected,instruction:c.collected?'这份物资已拾取。':'到实际楼层靠近按 E 领取。'}));
 return items.filter(t=>[t.x,t.y,t.z].every(Number.isFinite));
}

export function recommendedTarget(level,player,items=missionTargets(level)){
 const active=items.filter(t=>t.available&&!t.completed),nearest=kind=>active.filter(t=>t.kind===kind).sort((a,b)=>distance(player,a)-distance(player,b))[0];
 return active.find(t=>t.urgent)||(['ready','boss'].includes(level?.hunt?.phase)?nearest('task'):null)||nearest('letter')||nearest('journey')||nearest('chip')||(!level?.hunt?.riddleSolved?nearest('riddle'):null)||nearest('task')||null;
}

export function trackingDirection(level,player,point,yaw=0){
 if(!point)return null;
 const dx=point.x-player.x,dz=point.z-player.z,range=Math.hypot(dx,dz),height=point.y-(groundHeight(level,player.x,player.z)+(player.y||0));
 // Camera forward is (-sin(yaw), -cos(yaw)); positive angle points right.
 const angle=Math.atan2(dx,-dz)+yaw,wrapped=Math.atan2(Math.sin(angle),Math.cos(angle));
 const octant=(Math.round(Math.atan2(dx,-dz)/(Math.PI/4))+8)%8;
 const raised=point.y-groundHeight(level,point.x,point.z)>1.2;
 return {distance:range,height,angle:wrapped,bearing:['北','东北','东','东南','南','西南','西','西北'][octant],floor:height>1.2?(raised?'楼上 · 找楼梯':'地势较高'):height< -1.2?(player.y>1.2?'下方 · 先下楼':'地势较低'):'附近高度'};
}

export function createMissionTracker(){
 let current=null,selection='auto';
 const sync=level=>{if(level!==current){current=level;selection='auto';}};
 return {select(level,id){sync(level);if(!['auto','off'].includes(id)&&!missionTargets(level).some(t=>t.id===id))return false;selection=id;return true;},
  resolve(level,player){sync(level);const items=missionTargets(level);if(selection==='off')return {selection,items,target:null};let point=selection==='auto'?recommendedTarget(level,player,items):items.find(t=>t.id===selection);if(!point&&selection!=='auto'){selection='auto';point=recommendedTarget(level,player,items);}return {selection,items,target:point};}};
}
