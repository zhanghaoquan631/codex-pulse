import {resolveJourneySites} from './chapter-journey-sites.mjs';
import {groundHeight,segmentGroundDistance} from './landforms.mjs';
import {segmentBoxDistance} from './camera-math.mjs';
import {guangjiPoint} from './guangji-scene.mjs';

const site=(x,z,label)=>({x,z,label});
const pickup=(title,cargo)=>({kind:'pickup',title,cargo,instruction:`靠近按 E 领取${cargo}，随后沿地图紫色编号前进。`});
const install=(title,cargo)=>({kind:'install',title,cargo,instruction:`把${cargo}带到这里，靠近按 E 安装。`});
const hold=(title,duration)=>({kind:'hold',title,duration,radius:6,blockedRadius:3,instruction:`按 E 启动，留在 6 米工作圈内守卫 ${duration} 秒；同层敌人进入 3 米内圈时暂停，已完成进度保留。`});
const puzzle=(kind,title,cargo)=>({kind,title,cargo,instruction:kind==='align'?'按 E 查看纸面目标，依次选择与两枚目标箭头相同的方向。目标一直显示，选错可重试。':'按 E 查看纸面次序，依次点击相同图形；目标一直显示，选错只清空本次排列。'});
const relay=(title,stations=[1,2],dwell=2)=>({kind:'relay',title,stations,dwell,radius:3,instruction:`靠近当前站按 E 启动，按地图依次到站，每站驻留 ${dwell} 秒；离开只暂停，不清零。`});
const definition=(title,hook,hints,steps,extra={})=>({title,hook,hints,steps,reward:{coins:20,consumable:'medkit',amount:1},sourceNote:'道路与岸线沿现有地理快照；行动道具、机关、讯号及高度为游戏创作。',...extra});

/** Data deliberately describes the implemented actions, not unimplemented NPCs. */
export const CHAPTER_JOURNEYS=Object.freeze({
 guangji:definition('桥灯连岸','沿连续桥面搬运灯芯，再守卫东岸接收台。',[{...guangjiPoint(.08),label:'西岸供给架'},{...guangjiPoint(.53),label:'浮桥灯座'},site(73,27,'东岸接收台')],[pickup('领取护桥灯芯箱','护桥灯芯箱'),install('把灯芯送到浮桥','护桥灯芯箱'),hold('守卫东岸灯讯',14)]),
 'jieyang-tower':definition('广场三向灯阵','在开阔广场复核灯阵次序，再守住楼前记录台。',[site(68,-26,'东场校准架'),site(46,-30,'广场灯阵'),site(24,-34,'楼前记录台')],[pickup('领取三色校准片','三色校准片'),puzzle('order','排列三向灯阵','三色校准片'),hold('守卫楼前记录台',16)]),
 lighthouse:definition('风中归航灯','携带防潮灯芯，校准沿岸灯罩，让归航灯保持稳定。',[site(15,31,'停车场供给架'),site(-11,30,'沿岸临时灯座'),site(12,40,'守灯棚接收台')],[pickup('领取防潮灯芯匣','防潮灯芯匣'),puzzle('align','校准归航灯罩','防潮灯芯匣'),hold('守卫归航灯讯',18)]),
 'puning-deanli':definition('古厝家书归档','带着封存家书穿过院巷，完成两站封签与归档。',[site(-20,58,'入口家书架'),site(-10,23,'院巷封签台'),site(-9,-53,'深巷归档架')],[pickup('领取封存家书箱','封存家书箱'),relay('完成两站防潮封签'),puzzle('order','排列家书归档印记','封存家书箱')]),
 'chaoyang-wenguang':definition('塔街三站接力','在塔街外场建立联络，再把镜片送到远端投影架。',[site(5,20,'塔街起讯站'),site(-4,-48,'外场镜片站'),site(81,-32,'远端投影架')],[relay('联通塔街两站',[0,1]),pickup('领取塔影镜片箱','塔影镜片箱'),install('安装塔影镜片','塔影镜片箱')]),
 'chaonan-cuihu':definition('沿岸物资接力','沿湖岸递送防水测绘包，完成两站接力与交接守卫。',[site(-105,25,'西岸物资架'),site(15,67,'亭群中转站'),site(105,-43,'东岸交接站')],[pickup('领取防水测绘包','防水测绘包'),relay('沿岸两站接力',[1,2],3),hold('守卫测绘包交接',20)]),
 'chenghai-chen':definition('嵌瓷修复图','在巷道工作台校准拓样，再将样板送往展示架。',[site(62,12,'前美拓样架'),site(-49.5,-19,'巷道修复台'),site(-24,-78,'院前展示架')],[pickup('领取嵌瓷拓样匣','嵌瓷拓样匣'),puzzle('align','校准两片拓样方向'),install('安放嵌瓷拓样','嵌瓷拓样匣')]),
 'chaoan-tianchi':definition('双岸观测回路','沿山径把电芯送上东侧，再绕现有步道连接西岸。',[site(-33,53,'南端电芯架'),site(105,48,'东侧观测架'),site(-42,-28,'西岸接收台')],[pickup('领取观测电芯','观测电芯'),install('安装东侧观测电芯','观测电芯'),relay('联通双岸观测点',[1,2],3)]),
 'raoping-daoyun':definition('八角值守轮转','沿围楼外环传递讯牌，在北向入口核对轮值次序。',[site(-56,13,'外缘讯牌架'),site(61,24,'东侧联络站'),site(0,-5,'北向核验台')],[pickup('领取轮值讯牌','轮值讯牌'),relay('外环两站联络',[1,2],3),puzzle('order','复核八角轮值表','轮值讯牌')]),
 'huilai-jinghai':definition('城道讯号复核','携接收箱穿过老街，在路口校验图形讯号后守住传讯台。',[site(-49,31,'西路接收箱'),site(73,26,'东路校验架'),site(-18,-23,'城内传讯台')],[pickup('领取屏蔽接收箱','屏蔽接收箱'),puzzle('order','复核城道图形讯号','屏蔽接收箱'),hold('守卫城内传讯台',22)]),
 'jiexi-falls':definition('瀑谷终点信标','把行旅信标沿谷坡向上接力，充能后迎战终章首领。',[site(14.624,43.922,'下谷信标架'),site(18.346,-13.826,'中谷接力台'),site(-40.1,-67,'上谷充能台')],[pickup('领取行旅信标','行旅信标'),relay('沿谷坡逐站上行',[1,2],3),hold('守卫终点信标',24)],{reward:{coins:30,consumable:'medkit',amount:1},ending:{title:'十二地行旅完成',text:'桥灯、家书、湖岸讯号与瀑谷信标连成了这次行旅。回营地整理收获，也可以重访已经解锁的地区。',actions:['回营地','重访已解锁地区','查看行旅收藏'],requiresBossDefeat:true}}),
});

const SHAPES=[{id:'circle',label:'○ 圆形'},{id:'triangle',label:'△ 三角'},{id:'square',label:'□ 方形'}];
const ARROWS=[{id:'north',label:'↑ 上'},{id:'east',label:'→ 右'},{id:'south',label:'↓ 下'},{id:'west',label:'← 左'}];
const number=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const xyDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const baseY=(level,entity)=>entity.absoluteY===true?number(entity.y):groundHeight(level,entity.x,entity.z)+number(entity.y);
function generator(seed){let n=2166136261;for(const c of String(seed))n=Math.imul(n^c.charCodeAt(0),16777619);return()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
const labelFor=(step,id)=>step.choices.find(c=>c.id===id)?.label||id;

/** Creates fresh per-attempt state. Optional seed/sites support deterministic tests. */
export function initializeChapterJourney(level,{seed=Math.random(),sites}={}){
 level.journey=null;const data=CHAPTER_JOURNEYS[level.id];if(!data)return null;
 const points=sites||resolveJourneySites(level,3,data.hints);
 if(points.length<3||points.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw new Error(`本章行动无法布置三个可达任务点：${level.id}`);
 const rng=generator(seed);
 const steps=data.steps.map((raw,index)=>{
  const s={...structuredClone(raw),...structuredClone(points[index]),id:`${level.id}-journey-${index+1}`,absoluteY:true,progress:0,duration:raw.duration||0,completed:false,started:false,status:'尚未开始',interactRadius:3.1};
  if(s.kind==='order'||s.kind==='align'){
   s.choices=structuredClone(s.kind==='order'?SHAPES:ARROWS);s.selection=[];
   const pool=s.choices.map(c=>c.id);for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
   s.target=pool.slice(0,s.kind==='order'?3:2);s.duration=s.target.length;s.clue=`纸面目标：${s.target.map(id=>labelFor(s,id)).join(' → ')}`;s.status=s.clue;
  }
  if(s.kind==='relay'){
   s.waypoints=s.stations.map(i=>({...structuredClone(points[i])}));s.stationIndex=0;s.stationElapsed=0;s.duration=s.waypoints.length*s.dwell;
   Object.assign(s,s.waypoints[0],{absoluteY:true});
  }
  return s;
 });
 level.journey={id:`${level.id}-journey`,title:data.title,hook:data.hook,sourceNote:data.sourceNote,steps,stepIndex:0,completed:false,reward:structuredClone(data.reward),rewardClaimed:false,carrying:null,carrySpeedMultiplier:1,ending:data.ending?structuredClone(data.ending):null,seed};
 return level.journey;
}

export function activeJourneyStep(level){const j=level?.journey;return !j||j.completed?null:j.steps[j.stepIndex]||null;}

function clearSight(level,from,to){
 const a={x:from.x,y:baseY(level,from)+.8,z:from.z},b={x:to.x,y:baseY(level,to)+.8,z:to.z};
 const d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(d<=.05)return true;
 const dir={x:(b.x-a.x)/d,y:(b.y-a.y)/d,z:(b.z-a.z)/d};
 const terrain=segmentGroundDistance(level,a,dir,d-.05,.02);if(terrain!==null)return false;
 return ![...(level.walls||[]),...(level.doors||[]).filter(q=>!q.open)].some(q=>q.collapsed!==true&&q.status!=='collapsed'&&segmentBoxDistance(a,dir,q,d-.05,0)!==null);
}
function inRange(level,player,step,radius=step.interactRadius){return xyDistance(player,step)<=radius&&Math.abs(baseY(level,player)-step.y)<=1.5&&clearSight(level,player,step);}
function finishStep(j,step){
 step.completed=true;step.progress=step.duration||1;step.status='已完成';j.stepIndex++;j.completed=j.stepIndex>=j.steps.length;
 if(j.completed){j.carrying=null;j.carrySpeedMultiplier=1;}
 return{ok:true,advanced:true,completed:j.completed,stepId:step.id,message:j.completed?`${j.title}完成。合齐两半钥匙后前往任务房。`:`${step.title}完成。下一步：${j.steps[j.stepIndex].title}`};
}
function choiceResult(step,message=step.clue){return{ok:true,needsChoice:true,choices:step.choices.map(c=>({...c})),stepId:step.id,message,clue:step.clue,selection:[...step.selection]};}

/** Called only on a deliberate nearby E/choice action; never changes keys or currency. */
export function interactChapterJourney(level,player,{choice,stepId}={}){
 const j=level?.journey,step=activeJourneyStep(level);if(!step)return{ok:false,message:j?.completed?'本章行动已完成。':'本关没有待办地区行动。'};
 if(stepId&&stepId!==step.id)return{ok:false,message:'任务已进入下一步，请查看当前紫色编号。'};
 if(!inRange(level,player,step))return{ok:false,message:'请靠近地图紫色编号，在同一层无遮挡处操作。'};
 if(choice!==undefined&&!['order','align'].includes(step.kind))return{ok:false,message:'这一阶段不使用图形按钮，请靠近任务点按 E。'};
 if(step.kind==='pickup'){j.carrying=step.cargo;j.carrySpeedMultiplier=.92;return finishStep(j,step);}
 if(step.kind==='install'){
  if(j.carrying!==step.cargo)return{ok:false,message:`需要先携带${step.cargo}。`};
  j.carrying=null;j.carrySpeedMultiplier=1;return finishStep(j,step);
 }
 if(step.kind==='order'||step.kind==='align'){
  if(step.cargo&&j.carrying!==step.cargo)return{ok:false,message:`需要先携带${step.cargo}。`};
  if(choice===undefined)return choiceResult(step);
  if(!step.choices.some(c=>c.id===choice))return{ok:false,needsChoice:true,choices:step.choices.map(c=>({...c})),stepId:step.id,message:'请使用面板中的图形按钮。',clue:step.clue};
  if(choice!==step.target[step.selection.length]){step.selection=[];step.progress=0;step.status=`次序不符，已清空。${step.clue}`;return{...choiceResult(step,step.status),ok:false};}
  step.selection.push(choice);step.progress=step.selection.length;step.status=`已校准 ${step.progress}/${step.target.length} · ${step.clue}`;
  if(step.selection.length<step.target.length)return choiceResult(step,step.status);
  if(step.cargo){j.carrying=null;j.carrySpeedMultiplier=1;}
  return finishStep(j,step);
 }
 if(step.kind==='hold'||step.kind==='relay'){
  step.started=true;step.status=step.kind==='hold'?`守卫中  ${Math.floor(step.progress)}/${step.duration} 秒`:`接力 ${step.stationIndex+1}/${step.waypoints.length} · 驻留 ${Math.floor(step.stationElapsed)}/${step.dwell} 秒`;
  return{ok:true,started:true,stepId:step.id,message:step.status};
 }
 return{ok:false,message:'当前行动类型尚未接入。'};
}

/** Pure simulation update. Call only with active game seconds, never wall-clock time. */
export function updateChapterJourney(level,player,dt,{threats=[],active=true}={}){
 const j=level?.journey,step=activeJourneyStep(level);dt=Number(dt);
 if(!step||!step.started||!active||!Number.isFinite(dt)||dt<=0)return null;
 if(!['hold','relay'].includes(step.kind))return null;
 if(!inRange(level,player,step,step.radius)){step.status='已暂停：回到当前紫色编号工作圈，进度保留。';return null;}
 if(step.kind==='hold'){
  const blocked=threats.some(e=>e.alive!==false&&e.active!==false&&number(e.hp,1)>0&&xyDistance(e,step)<step.blockedRadius&&Math.abs(baseY(level,e)-step.y)<=1.8&&clearSight(level,e,step));
  if(blocked){step.status='已暂停：敌人进入警戒内圈，先清理敌人；进度保留。';return null;}
  step.progress=Math.min(step.duration,step.progress+dt);step.status=`守卫中 ${Math.floor(step.progress)}/${step.duration} 秒`;
  return step.progress>=step.duration?finishStep(j,step):null;
 }
 step.stationElapsed=Math.min(step.dwell,step.stationElapsed+dt);step.progress=step.stationIndex*step.dwell+step.stationElapsed;
 step.status=`接力 ${step.stationIndex+1}/${step.waypoints.length} · 驻留 ${Math.floor(step.stationElapsed)}/${step.dwell} 秒`;
 if(step.stationElapsed<step.dwell)return null;
 step.stationIndex++;step.stationElapsed=0;
 if(step.stationIndex>=step.waypoints.length)return finishStep(j,step);
 Object.assign(step,step.waypoints[step.stationIndex],{absoluteY:true});step.status=`本站已连通，前往接力站 ${step.stationIndex+1}/${step.waypoints.length}。`;
 return{ok:true,stationAdvanced:true,stepId:step.id,message:step.status};
}
