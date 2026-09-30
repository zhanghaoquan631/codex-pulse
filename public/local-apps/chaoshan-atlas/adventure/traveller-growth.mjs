/** Optional V1 save extension. Derived unlocks never replace existing collections. */
export const GROWTH_BRANCHES = [
  {id:'guardian',name:'守护',description:'每点减少 4% 受到的伤害，最多 12%。'},
  {id:'explorer',name:'探索',description:'每点增加每秒 2 点气力恢复，最多增加 6 点。'},
  {id:'marksman',name:'战斗',description:'每点增加 2.5% 武器伤害，最多 7.5%。'},
];
export const MEMENTOS = [
  ['small-park','亭','骑楼纪念徽'],['guangji','桥','韩江桥舟徽'],['jieyang-tower','鼎','揭阳铜鼎徽'],['lighthouse','灯','长山尾灯徽'],
  ['puning-deanli','厝','德安古厝徽'],['chaoyang-wenguang','塔','文光塔影徽'],['chaonan-cuihu','湖','翠湖水纹徽'],['chenghai-chen','瓷','黉宅嵌瓷徽'],
  ['chaoan-tianchi','云','天池云翼徽'],['raoping-daoyun','八','道韵八角徽'],['huilai-jinghai','锚','靖海沉锚徽'],['jiexi-falls','瀑','瀑谷飞流徽'],
].map(([id,symbol,name])=>({id,symbol,name}));
const rank=n=>Number.isFinite(n)?Math.max(0,Math.min(3,Math.floor(n))):0;
export function growthPoints(level=1,completed=[]){return Math.min(6,Math.floor((Math.max(1,Math.min(50,level))-1)/3)+Math.floor(new Set(completed.filter(id=>MEMENTOS.some(m=>m.id===id))).size/2));}
export function normalizeGrowth(raw,level=1,completed=[]){
  let left=growthPoints(level,completed);const ranks={};
  for(const b of GROWTH_BRANCHES){ranks[b.id]=Math.min(left,rank(raw?.ranks?.[b.id]));left-=ranks[b.id];}
  const memento=MEMENTOS.some(m=>m.id===raw?.memento&&completed.includes(m.id))?raw.memento:null;
  return {ranks,memento};
}
export function growthStatus(player,progress){
  const completed=progress?.completedLevelIds||[],growth=normalizeGrowth(player.growth,player.level,completed),total=growthPoints(player.level,completed);
  return {growth,total,remaining:total-Object.values(growth.ranks).reduce((a,b)=>a+b,0),branches:GROWTH_BRANCHES,mementos:MEMENTOS.map(m=>({...m,unlocked:completed.includes(m.id)}))};
}
export function growthBonuses(player){const r=player.growth?.ranks;return {damageReduction:rank(r?.guardian)*.04,staminaRecovery:rank(r?.explorer)*2,weaponMultiplier:1+rank(r?.marksman)*.025};}
