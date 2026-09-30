import {PARK_BOUNDS,PARK_ORIGIN,PARK_SCALE,makeSmallParkWalls,smallParkDoors,smallParkQuest,smallParkLayout,parkPoint} from './small-park-scene.mjs';
import {guangjiChapter,guangjiLayout,guangjiPoint} from './guangji-scene.mjs';
import {jieyangLevel,jieyangLayout,jieyangHuntSites} from './jieyang-scene.mjs';
import {nanaoChapter} from './nanao-scene.mjs';
import {westChapters} from './west-chapters.mjs';
import {eastRawLevels} from './east-chapters.mjs';
import {STORY_CHAPTERS} from './story-content.mjs';
import {districtRiddles,districtBosses} from './district-riddles.mjs';
import {enrichLegacyPerches} from './legacy-perches.mjs';
import {BOSS_BY_LEVEL} from './boss-catalog.mjs';
import {enrichBuildingInteriors} from './building-interiors.mjs';
import {enrichWorldBoundaries} from './world-boundaries.mjs';
const room=smallParkLayout.rooms.find(r=>r.id==='warehouse');
const park={
  id:'small-park',title:'第一章 · 骑楼寻迹',shortTitle:'汕头小公园',theme:'arcade',placeId:'small-park',ll:[116.66945,23.35785],region:'汕头市',layout:'osm-small-park-five-roads',
  art:{style:'paper-ink',accent:0xb95b4f,sky:0xf1ecdf,identity:'五路交会 · 八角纪念亭 · 南生百货'},landform:{type:'flat-street'},
  geoReference:{origin:PARK_ORIGIN,scale:PARK_SCALE,checkedAt:'2026-09-11'},
  description:'沿升平路、同平路寻找密码线索，躲开主动来袭的墨怪，打开国平路北侧游戏仓间迎战首领。',
  objectiveText:'主动来袭 → 读路标、解谜拼钥 → 北巷仓间 → 首领',
  sourceNote:'五路交会、南生百货轮廓来自OSM；骑楼立面、室内、路标与任务为游戏创作。',
  bounds:{...PARK_BOUNDS},spawn:{...smallParkQuest.spawn},exit:{...parkPoint(room,0,.9),radius:1.4},lighting:{time:'午后'},
  walls:makeSmallParkWalls(),doors:smallParkDoors.map(d=>({...d})),switches:[],npcs:[{...smallParkQuest.merchant}],
  spawnSites:smallParkLayout.arcades.map(a=>({...parkPoint(a,0,a.d/2-.65),y:a.height+.25,kind:'roof',id:`perch-${a.id}`})),
  collectibles:smallParkQuest.collectibles.map((c,i)=>({...c,kind:'clue',symbol:['茶','亭'][i],name:['茶铺密码路标 · 茶','花艺铺密码路标 · 亭'][i]})),
  enemies:[...Array.from({length:9},(_,i)=>({id:['alley-ink','alley-shade','warehouse-guard'][i]||`park-ink-${i}`,x:9+i%3,z:12+Math.floor(i/3),type:['doodler','inkling','shade','lantern'][i%4],rank:1})),
    {id:'park-ink-boss',...parkPoint(room,0,-1.35),type:'boss',name:'北巷墨魁',hp:135,damage:9,height:1.95,radius:.48,visualScale:.58,speed:1.25}],
  goals:{boss:true},reward:{xp:120,gold:110},decorations:[],
};
export function hunt(level,index,{gateId,bossId,target,clues,riddles}){
  const data=JSON.parse(JSON.stringify(enrichLegacyPerches(level)));
  data.art={...data.art,style:'paper-ink'};
  data.encounters=[];data.escort=null;data.defendZone=null;data.goals={boss:true};
  if(data.id==='guangji'){
    // The retired winch encounter must not partition the current hunt map.
    // The distant task room remains the sole password-controlled objective.
    for(const door of data.doors)if(/^bridge-gate-/.test(door.id))Object.assign(door,{open:true,locked:false,switchId:null});
    data.switches=data.switches.filter(s=>!/^winch-/.test(s.id));
  }
  data.enemies.forEach((e,i)=>{delete e.encounterId;if(e.type!=='boss'){e.elite=i%4===3;if(!e.elite){e.type='doodler';e.name='涂鸦小兵';delete e.hp;delete e.maxHp;delete e.damage;}else e.name=e.name||'墨潮精英';}});
  const demon=BOSS_BY_LEVEL[data.id];
  for(const [i,e] of data.enemies.entries()){
    if(e.type==='boss'&&demon){e.bossKind=demon.id;e.attackStyle=demon.attackStyle;e.name=demon.name;delete e.visualType;delete e.visualScale;}
  }
  for(const [i,type] of ['wraith','imp'].entries())data.enemies.splice(Math.min(4+i*5,data.enemies.length-1),0,{id:`${data.id}-${type}`,type,name:type==='imp'?'角纸小恶魔':'游巷恶灵',...data.spawn,elite:true,rank:1});
  data.collectibles=clues;data.difficulty={hp:1+index*.18,damage:1+index*.09};
  data.hunt={killTarget:18+index*6,waveSize:Math.min(14,6+index),maxAlive:Math.min(24,10+index*2),waveInterval:Math.max(6,10-index*.4),pressureEvery:25,gateId,bossId,target,clueIds:clues.map(c=>c.id),riddles:riddles.map(r=>{const story=STORY_CHAPTERS[data.id]?.riddles.find(s=>s.id===r.id&&s.answer===r.answer);return story?{...r,...story}:{...r};})};
  data.exit={...target};data.objectiveText=`击败 ${data.hunt.killTarget} 只来袭墨怪 · 找线索解谜拼钥 · 赶往任务房 · 击败 Boss`;
  return data;
}
function districtHunt(raw,index){
  const sites=raw.huntSites||raw.integration;
  const boss=raw.enemies.find(e=>e.id===sites.bossId);
  const visuals=['boss','lantern','crab','brute','shade','boss','brute','lantern'];
  const definition={...raw,enemies:raw.enemies.map(e=>e===boss?{...e,name:districtBosses[raw.id],visualType:visuals[index-4],hp:270+(index-4)*38,damage:17+(index-4)*1.3,height:2.8,radius:.95,rank:3,speed:1.3+(index-4)*.07}:e)};
  return hunt(definition,index,{...sites,clues:raw.collectibles.filter(c=>sites.clueIds.includes(c.id)).map((c,i)=>({...c,kind:'clue',symbol:['山','水','印'][i],name:`谜语线索 ${i+1} · ${c.name}`})),riddles:districtRiddles[raw.id]});
}
export const levels=[
  hunt(park,0,{gateId:'warehouse-door',bossId:'park-ink-boss',target:park.exit,clues:park.collectibles,
    riddles:[{id:'tea',prompt:'小小杯中有山色，热水唤醒叶子香。潮汕待客少不了我。请拼出这个饮品的英文单词。',answer:'TEA'},
      {id:'key',prompt:'我没有脚，却能让一道紧闭的门让路。请拼出这件物品的英文单词。',answer:'KEY'}]}),
  hunt({...guangjiChapter,geoReference:{origin:guangjiLayout.origin,scale:guangjiLayout.scale,checkedAt:'2026-09-12'}},1,
    {gateId:'guangji-task-door',bossId:'river-boss',target:{x:80,z:27,radius:2.6},
      clues:[{id:'guangji-west-manifest',...guangjiPoint(.18,1.6),kind:'clue',symbol:'桥',name:'西桥密码路标 · 桥'},
        {id:'guangji-floating-rope-note',...guangjiPoint(.60,-1.6),kind:'clue',symbol:'舟',name:'浮桥密码路标 · 舟'}],
      riddles:[{id:'bridge',prompt:'我把两岸牵在一起。韩江从我身下流过，脚步从我身上走过。请拼出我的英文名字。',answer:'BRIDGE'},
        {id:'stream',prompt:'我一直向前，却没有双脚。雨后声音更响，最终投入江海怀抱。请拼出“小溪”的英文。',answer:'STREAM'}]}),
  hunt({...jieyangLevel,enemies:[...jieyangLevel.enemies.filter(e=>e.type!=='boss'),{...jieyangHuntSites.boss,id:'tower-boss',type:'boss',name:'守鼎墨将',hp:215,maxHp:215,damage:15,rank:2}],
    geoReference:{origin:jieyangLayout.origin,scale:jieyangLayout.scale,checkedAt:'2026-09-12'}},2,
    {gateId:'hall-door',bossId:'tower-boss',target:{x:15,z:-32.8,radius:2.3},
      clues:[{id:'tower-cipher-east',x:68,z:-26,kind:'clue',symbol:'鼎',name:'东场密码路标 · 鼎'},
        {id:'tower-cipher-west',x:46,z:-30,kind:'clue',symbol:'城',name:'楼前密码路标 · 城'}],
      riddles:[{id:'lantern',prompt:'我把火光装进肚子，把黑夜留在外面。节庆时，街头常有红色的我。请拼出英文单词。',answer:'LANTERN'},
        {id:'compass',prompt:'我不会替你走路，却能在陌生广场告诉你北方。旋转的是指针，指向的是方向。请拼出英文单词。',answer:'COMPASS'}]}),
  hunt(nanaoChapter,3,{gateId:'beacon-gate',bossId:'mist-boss',target:nanaoChapter.exit,clues:nanaoChapter.collectibles,
    riddles:[{id:'lighthouse',prompt:'我站在陆地边缘，替海上的人看守黑夜。我的光会转动，我的脚却从不离开岸边。请拼出英文单词。',answer:'LIGHTHOUSE'},
      {id:'navigation',prompt:'航海者将地图、方向与位置连成一个行动，才能从未知海面抵达目的地。这个“导航”的英文是什么？',answer:'NAVIGATION'}]}),
  ...[...westChapters,...eastRawLevels].map((raw,i)=>districtHunt(raw,i+4)),
].map((level,i)=>enrichWorldBoundaries(enrichBuildingInteriors(level,i)));
export const LEVELS=levels;
export const levelById=Object.fromEntries(levels.map(l=>[l.id,l]));
export default levels;
