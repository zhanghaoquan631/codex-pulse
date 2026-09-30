import {groundHeight} from './landforms.mjs';
import {guangjiPoint} from './guangji-scene.mjs';
import {bodySpaceFree,groundRoute} from './combat-navigation.mjs';

// Story objects are authored game props. Geography stays on the verified OSM
// street graph; no new roads, real interiors or live geography are asserted.
export const DISTRICT_CONTENT = {
 'small-park': {stages:['街口集合','骑楼穿行','北巷接敌'],tactics:['先认避难处，远程点射清开人群前方。','利用骑楼柱侧移，优先处理窗口射手。','保留药包，留出回头对付追兵的街口。'],enemies:[['doodler','inkling'],['doodler','archer','shade'],['imp','doodler','wraith']],evidence:['茶铺账签','骑楼门牌拓片'],notes:['账签写着：先看谜面说的是饮品还是物品，再对照怪物掉落的字母。','门牌把五条街分向标出：方向信息用于辨路，背后的字母仍须击倒后拾取。']},
 'guangji': {stages:['西岸整备','浮桥推进','东岸集结'],tactics:['先救西岸补给楼旅人，再带队进入桥面。','桥面狭窄，蟹类蓄力时沿桥纵向撤退，不向水面闪避。','弓手与恶灵交替来袭；先用远程消除射线，再靠近任务房。'],enemies:[['doodler','inkling'],['crab','doodler','lantern'],['archer','wraith','doodler']],evidence:['桥舟维修记录','韩江水纹手札'],notes:['梁、舟都能托起通路。谜面若强调连接两岸，应找“连接物”，不是水流本身。','观察动词：承托脚步的是构造；不停向前的是流水。用这两条证据区分本章两个谜面。']},
 'jieyang-tower': {stages:['广场观察','侧路绕行','楼前布防'],tactics:['开阔广场先绕行，不在多条射线交点停留。','沿外侧接近弓手，石甲怪蓄力时换边。','首领三路弹幕之间留有通道，保留横移气力。'],enemies:[['doodler','archer'],['brute','doodler'],['imp','archer','shade']],evidence:['铜鼎影子记录','旅人方向便笺'],notes:['把“装着火光”和“指着方向”分开：前者照明，后者引路。','看怪物背后的重复字母和词长，不要把广场名字直接当答案。']},
 'lighthouse': {stages:['岸边集结','沿岸迎潮','灯塔前沿'],tactics:['沿陆地标线集合，远离无掩护岸缘。','灯笼精在雷雨中更危险，预警出现后再侧移。','用长射程应对螺旋，别把所有投掷物花在先头小兵。'],enemies:[['crab','doodler'],['lantern','archer'],['wraith','lantern','doodler']],evidence:['守灯人值夜纸','航线草稿'],notes:['固定在岸上的建筑与使用地图的行动是两类词，留意谜面问“物”还是“行动”。','十个字母不必一次猜完：先按词义判断，再把重复字母放入相应位置。']},
 'puning-deanli': {stages:['古厝入口','院巷调查','深巷收束'],tactics:['长巷保持退路，别堵住救援旅人的出口。','纸影会近身，转角先用短连射探明方向。','交叉针线出现时换到另一条巷道，留意身后。'],enemies:[['shade','doodler'],['imp','shade'],['wraith','archer','doodler']],evidence:['家书残页','乡野行记'],notes:['家书讲“传给后人”；行记讲“城镇之外”。先认本局谜面的主题。','同一字母可能出现多次，每份掉落只补一个位置；线索册显示真实缺口。']},
 'chaoyang-wenguang': {stages:['塔街观察','外场游走','塔影接敌'],tactics:['街区射线多，先扫清正面射手再上楼。','在外场绕石甲怪，不用身体硬挡冲撞。','环形弹幕逼近前找到缺口，避免在墙角停留。'],enemies:[['archer','doodler'],['brute','lantern'],['lantern','imp','doodler']],evidence:['塔灯修缮簿','匠人构图纸'],notes:['照亮与建造是不同的过程；谜语若提到光，别被“塔”这个地点词带偏。','找词尾表达过程的部分，再把剩余字母与谜意对照。']},
 'chaonan-cuihu': {stages:['湖畔整备','沿岸远行','归岸集结'],tactics:['路线较长，出发前补足治疗，带好救援队伍。','沿湖岸移动，蟹怪冲撞前往陆地方向拉开。','反弹扇形会改变来向，留出第二次闪避空间。'],enemies:[['crab','doodler'],['lantern','crab','archer'],['wraith','lantern','doodler']],evidence:['雨量观察页','夜空连点图'],notes:['雨量页讲水从云中落下；连点图把天上的星排列成形。','看清题目属于天气还是星空，再用字母验证，而不是只挑最长的词。']},
 'chenghai-chen': {stages:['旧厝辨门','巷道穿行','院前收束'],tactics:['密集房屋先看门窗，别用爆炸伤到未救旅人。','细巷用霰弹应对近身，远处窗口用步枪。','蛛网扇形限制退路，保留炸弹处理聚集追兵。'],enemies:[['shade','doodler'],['archer','imp'],['wraith','shade','doodler']],evidence:['嵌瓷拼补稿','图像说明签'],notes:['拼补稿强调拆散后的再建，说明签强调用图像表达。','长词也有可辨的词头和词尾；按中文含义分段，不必盲排全部字母。']},
 'chaoan-tianchi': {stages:['山路整备','湖盆观察','高坡接敌'],tactics:['上坡前恢复气力，沿已标路线行走。','雾里保持移动，先看高处恶灵轮廓。','翼形爆发先展开后收束，离开中心射线。'],enemies:[['wraith','doodler'],['lantern','shade'],['archer','wraith','imp']],evidence:['登山适应笔记','水脉关系草图'],notes:['适应环境与彼此连接是两个主题，题目会告诉你要描述哪个过程。','先辨意思，再数重复字母。山地高度是游戏改编，笔记不作为现实登山指引。']},
 'raoping-daoyun': {stages:['围楼外缘','回廊辨向','八角接敌'],tactics:['先认出入口，绕行时记住回到安全区的方向。','回廊中优先清除近身纸影，避免多面夹击。','八角环形预警时向相邻空隙移动，别固定绕一侧。'],enemies:[['shade','doodler'],['imp','archer'],['brute','shade','doodler']],evidence:['协作轮值表','值守约定纸'],notes:['一张写彼此依赖，另一张写各自责任。留意谜面是否强调“互相”。','本章可能出现复数，词尾也要计入，不能漏掉最后一个重复字母。']},
 'huilai-jinghai': {stages:['古城集结','城道迎敌','海防前沿'],tactics:['城道先清远程，保留墙体遮挡侧面射线。','蟹怪与弓手混编，先引冲撞再打后排。','锚形齐射会封住正面，向空出的侧路移动。'],enemies:[['archer','doodler'],['crab','archer'],['imp','wraith','doodler']],evidence:['误读信号日志','传讯校对稿'],notes:['把看错含义与传话出错区别开，两个词都可能带表示错误的开头。','题目讲一次误解还是多次沟通差错，决定单数与复数的结尾。']},
 'jiexi-falls': {stages:['谷口整备','坡台推进','瀑前终战'],tactics:['先安排补给，沿坡台分段推进。','层次高低会挡射线，移动到看得见目标的平台再开火。','瀑流连幕一段接一段，留治疗应对后续回响。'],enemies:[['crab','doodler'],['wraith','archer'],['brute','lantern','imp']],evidence:['水系连通图','错认痕迹簿'],notes:['水系图强调彼此相连的状态，痕迹簿记录不止一次的错误识别。','终章词长十八位，先用中文语义排除另一类词，再按重复字母核对。']},
};
const d=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function initializeDistrictContent(level){
 const data=DISTRICT_CONTENT[level.id],street=level.evacuation?.streetPoints;if(!data||!street?.length)return null;
 const pool=[...street];
 if(level.id==='guangji')for(const p of [guangjiPoint(.18),guangjiPoint(.53),guangjiPoint(.95),{x:73,z:27}]){
   if(bodySpaceFree(level,p,.4,1.8)&&groundRoute(level,p,level.spawn,.4))pool.push({...p,y:0});
 }
 const nearest=(wanted,excluded=[])=>pool.filter(p=>excluded.every(q=>d(p,q)>5)).reduce((best,p)=>!best||d(p,wanted)<d(best,wanted)?p:best,null)||pool[0];
 const target=level.hunt.target,from=level.spawn;
 const desired=level.id==='guangji'?[from,guangjiPoint(.53),{x:73,z:27}]:[from,{x:from.x+(target.x-from.x)*.5,z:from.z+(target.z-from.z)*.5},target];
 const points=[];for(const p of desired)points.push(nearest(p,points));
 const stages=points.map((p,i)=>({id:`${level.id}-stage-${i}`,title:data.stages[i],tactic:data.tactics[i],enemyTypes:data.enemies[i],point:{...p},visited:i===0}));
 const evidence=data.evidence.map((name,i)=>{const stage=points[i+1],point=nearest(stage,[from,...points.filter((_,n)=>n!==i+1)]);return {id:`${level.id}-evidence-${i}`,name,x:point.x,y:groundHeight(level,point.x,point.z),z:point.z,absoluteY:true,text:data.notes[i],collected:false,rewardClaimed:false};});
 level.expedition={stages,evidence,activeIndex:0,sourceNote:'沿现有地理快照道路布置；战术分段、证据与补给为游戏创作。'};return level.expedition;
}
export function updateDistrictStage(level,player){
 const e=level.expedition;if(!e)return null;
 const nearest=e.stages.reduce((best,s,i)=>d(player,s.point)<d(player,e.stages[best].point)?i:best,0);
 // Hysteresis prevents repeated notices while crossing a region boundary.
 if(nearest!==e.activeIndex&&d(player,e.stages[nearest].point)+4<d(player,e.stages[e.activeIndex].point)){
   e.activeIndex=nearest;const stage=e.stages[nearest],first=!stage.visited;stage.visited=true;return {...stage,first};
 }
 return null;
}
export function nearbyEvidence(level,p,hasSight){return level.expedition?.evidence.filter(e=>!e.collected&&Math.hypot(e.x-p.x,e.z-p.z,e.y-groundHeight(level,p.x,p.z)-(p.y||0))<=2.5&&hasSight(e))||[];}
