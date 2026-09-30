import {desktopAnimalIntroduction} from './animal-field-guide.mjs';
import {CLOWN_BOSSES,clownForLevel} from './clown-bosses.mjs';
import {BOSS_BY_LEVEL,BOSS_BY_ID} from './boss-catalog.mjs';
import {WEAPONS,CONSUMABLES,ENEMY_TYPES} from './game-state.mjs';
import {getBossPortrait} from './record-book.mjs';
import {chapterIntroduction} from './chapter-introduction.mjs';
import {CHAPTER_JOURNEYS} from './chapter-journeys.mjs';
import {DISTRICT_CONTENT} from './district-content.mjs';

const kits=[
  ['rifle','medkit','先用已有墨线步枪点射窗口，留一份药包应对近身围攻。'],
  ['rifle','medkit','桥面退路较窄，远程点射比追进弹幕更稳，药包留给首领阶段。'],
  ['rifle','bomb','广场先处理远处弓手，炸弹用于聚在一起的追兵。'],
  ['rifle','medkit','海岸视野开阔，先用步枪清掉高处射手，再沿掩体靠近灯塔。'],
  ['shotgun','molotov','古厝短巷适合近距离散射；燃烧瓶可以暂时阻住窄口。'],
  ['rifle','bomb','先点掉楼窗火力，再用炸弹应对塔前聚集的小兵。'],
  ['rifle','medkit','湖岸避免贴着水边后退，保持射程并留药包应对反弹弹幕。'],
  ['shotgun','molotov','房间和窄廊先清近身怪，燃烧瓶覆盖入口，别堵住自己的退路。'],
  ['rifle','medkit','山路与高窗以远程点射为主，回血后再穿过暴露的坡道。'],
  ['staff','bomb','星火法杖适合密集小兵，炸弹补充群体伤害；射击后及时换位。'],
  ['rifle','molotov','远处窗口用步枪，追兵进窄巷时再用燃烧瓶限制路线。'],
  ['rifle','medkit','终章先清高处火力，药包留给瀑石首领的连续弹幕间隙。'],
];
const behavior={
  doodler:'举笔预警后射击，会追着你换位；后期可能奔跑追击。',
  inkling:'近身围攻，别停在死角。',shade:'移动敏捷，会从侧面追近。',brute:'血量较高，保持距离逐个处理。',
  archer:'远处瞄准射击，先找掩体再回击。',lantern:'悬浮横移并投射灯火。',crab:'低头蓄力后直线冲撞，横向闪开。',
  wraith:'横移追踪，袖爪蓄力后投出墨弹。',imp:'追到射程内蓄力点射，后期会加速追赶。',
};
export function briefingData(level,next,player,index=0){
  const chosen=BOSS_BY_ID[level.bossPreviewId]||BOSS_BY_LEVEL[level.id];
  const [weaponId,supplyId,reason]=chosen?.equipmentAdvice?[chosen.recommendedEquipment.find(id=>WEAPONS[id])||'rifle',chosen.recommendedEquipment.find(id=>CONSUMABLES[id])||'medkit',chosen.equipmentAdvice]:kits[index]||kits[0];
  const kit=(id,kind)=>{const item=(kind==='weapon'?WEAPONS:CONSUMABLES)[id],owned=kind==='weapon'?player.weapons.includes(id):player.consumables[id]>0;return{id,kind,name:item.name,price:item.price,owned,amount:kind==='weapon'?Number(owned):player.consumables[id]};};
  const nextKit=next?kits[index+1]||kits.at(-1):null;
  return {id:level.id,title:level.shortTitle||level.title,boss:chosen,gold:player.gold,
    killTarget:level.hunt?.killTarget||0,reason,kit:[kit(weaponId,'weapon'),kit(supplyId,'supply')],
    enemies:[...new Set([...level.enemies.filter(e=>e.type!=='boss').map(e=>e.type),...(DISTRICT_CONTENT[level.id]?.enemies.flat()||[])])].map(type=>({type,name:ENEMY_TYPES[type]?.name||type,description:behavior[type]||'保持移动，观察攻击预警。',gold:ENEMY_TYPES[type]?.gold||0})),
    next:next?{title:next.shortTitle||next.title,boss:(BOSS_BY_ID[next.bossPreviewId]||BOSS_BY_LEVEL[next.id])?.name,weapon:WEAPONS[nextKit[0]].name,supply:CONSUMABLES[nextKit[1]].name}:null};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function installChapterBriefing({levels,getPlayer,onOpen,onClose,onStart,onShop,onGuide,getBossChoice=()=>null,onBossChoice=()=>{}}){
  const dialog=document.createElement('dialog');dialog.id='chapter-briefing';dialog.className='chapter-briefing';dialog.setAttribute('aria-labelledby','briefing-title');document.body.append(dialog);
  let selected=null,serial=0;
  const close=()=>{if(!dialog.open)return;serial++;dialog.close();onClose();};
  function open(id){
    const index=levels.findIndex(l=>l.id===id);if(index<0)return;
    selected=id;const current={...levels[index],bossPreviewId:getBossChoice(id)},next=levels[index+1]?{...levels[index+1],bossPreviewId:getBossChoice(levels[index+1].id)}:null;const data=briefingData(current,next,getPlayer(),index),ticket=++serial;
    const boss=data.boss;
    dialog.innerHTML=`<header><div><small>行前情报 / FIELD BRIEFING</small><h2 id="briefing-title">${esc(data.title)}</h2><p>击败 ${data.killTarget} 只来袭怪物，收齐密码芯片与字母${CHAPTER_JOURNEYS[id]?'，完成「'+esc(CHAPTER_JOURNEYS[id].title)+'」地区行动':''}，进入任务房迎战首领。</p></div><button id="briefing-close" class="quiet" aria-label="关闭关卡情报">×</button></header>
      ${clownForLevel(id)?`<section class="clown-selector"><label>这一关挑战谁<select id="boss-choice" aria-label="选择本关首领"><option value="regional" ${!current.bossPreviewId?'selected':''}>${esc(BOSS_BY_LEVEL[id].name)} · 地区首领</option><option value="${clownForLevel(id).id}" ${current.bossPreviewId?'selected':''}>${esc(clownForLevel(id).name)} · 小丑首领</option></select></label><small>保留这一地区的路线、谜语、救援与击杀目标。小丑有独立外观和攻击节奏；击败后可收入图鉴。</small></section>`:''}
      <details class="clown-library"><summary>新增五位小丑首领 · 查看外形和战术</summary><div class="clown-gallery">${CLOWN_BOSSES.map(c=>`<article data-clown-card="${c.id}"><div class="clown-image"></div><b>${esc(c.name)}</b><small>${esc(c.region)} · 难度 ${c.difficulty}/5</small><p>${esc(c.description)}</p><p>${esc(c.weakness)}</p></article>`).join('')}</div></details>
      ${desktopAnimalIntroduction()}
      ${chapterIntroduction(current,next,index)}
      <div class="briefing-body"><section class="briefing-boss"><div id="briefing-portrait" aria-label="本关首领画像"><span>绘制首领…</span></div><small>本关 BOSS</small><h3>${esc(boss?.name)}</h3><p>${esc(boss?.epithet)}</p><blockquote>${esc(boss?.weakness)}</blockquote></section>
      <div><section class="briefing-route"><h3>先看路，再出发</h3><p><b>开局 10 秒是平静街景。</b>街上 9 位行人，3 辆车各载 2 人，共 15 人。每局随机分散，主动走动；靠近或让他们看到你便会跟随和奔跑，怪物出现后未跟随的人群避险；护送至少 5 人到地图「安」标记完成支线，奖励 60 金币。</p><p>沿楼梯上楼找物资；靠近低窗台按 E 翻入或翻出，J 可跳越低墙。楼上窗口可能藏着射手。屋内旅人位置随机，看到你或按 E 招呼后跟随；带出房屋才算救出；房屋耐久耗尽后 3.5 秒倒塌，未救出会导致本关失败。</p><p><b>密码芯片每次进关随机刷新</b>，楼上、屋内和街边都要留意。怪物越拖越多，移动速度在平静期后每 3 秒提升，射击和弹速也会加快。7 或开镜滚轮切换红点／2 倍／4 倍；8 切换开镜，镜头设置可独立调各倍镜灵敏度。地图「商」会跟随行商移动，他随机出现并走动，看到你后跟随，遇敌奔跑避险，也可能藏在楼上；保护好他，遇难后本次关内便无法交易。</p></section>
      <section><h3>本关会遇见</h3><div class="briefing-enemies">${data.enemies.map(e=>`<article><strong>${esc(e.name)}</strong><p>${esc(e.description)}</p><small>基础掉落 ${e.gold} 金币</small></article>`).join('')}<article><strong>窗口伏兵</strong><p>在楼上窗口架枪；利用窗框间隙回击，也可以上楼绕近。</p></article></div></section></div></div>
      <section class="briefing-kit"><div><small>装备建议 · 按你的习惯选择</small><h3>这一关，带这些更顺手</h3><p>${esc(data.reason)}</p></div><div class="briefing-kit-items">${data.kit.map(item=>`<article><strong>${esc(item.name)}</strong><span>${item.owned?item.kind==='weapon'?'已拥有，可直接装备':`背包已有 ${item.amount} 份`:`商人价格 ${item.price} 金币`}</span></article>`).join('')}</div></section>
      ${data.next?`<section class="briefing-next"><b>下一关 · ${esc(data.next.title)}</b><span>首领：${esc(data.next.boss)}。建议准备 ${esc(data.next.weapon)}＋${esc(data.next.supply)}；通关选择的装备可以带过去。</span></section>`:'<section class="briefing-next"><b>旅程终章</b><span>留好药包，击败首领完成这次行旅。</span></section>'}
      <footer><p>金币 <b>${data.gold}</b><small>击杀怪物获得金币；营地与关卡商人均可兑换装备、药包和投掷物。</small></p><div><button id="briefing-shop" class="outlined dark">去商人处备装</button><button id="briefing-start" class="primary">准备好了，出发 →</button></div></footer>`;
    dialog.querySelector('#briefing-close').addEventListener('click',close);
    dialog.querySelector('#boss-choice')?.addEventListener('change',event=>{onBossChoice(id,event.target.value==='regional'?null:event.target.value);open(id);});
    dialog.querySelector('.clown-library').addEventListener('toggle',()=>{if(!dialog.querySelector('.clown-library').open)return;for(const c of CLOWN_BOSSES)getBossPortrait(c.id).then(src=>{if(ticket!==serial||!dialog.open||!src)return;const cell=dialog.querySelector(`[data-clown-card="${c.id}"] .clown-image`);if(cell&&!cell.children.length){const img=document.createElement('img');img.src=src;img.alt=c.name;cell.append(img);}});});
    if(onGuide){const guide=document.createElement('button');guide.id='briefing-guide';guide.className='quiet';guide.textContent='操作指南 L';guide.addEventListener('click',()=>onGuide(selected));dialog.querySelector('footer>div').prepend(guide);}
    dialog.querySelector('#briefing-start').addEventListener('click',()=>{const id=selected;close();onStart(id);});
    dialog.querySelector('#briefing-shop').addEventListener('click',()=>{const id=selected;close();onShop(id);});
    if(!dialog.open){onOpen();dialog.showModal();}dialog.scrollTop=0;
    getBossPortrait(boss?.id).then(src=>{if(!dialog.open||ticket!==serial)return;const node=dialog.querySelector('#briefing-portrait');node.replaceChildren();if(src){const img=document.createElement('img');img.src=src;img.alt=boss.name;node.append(img);}else node.textContent=boss.name;}).catch(()=>{if(ticket===serial&&dialog.open)dialog.querySelector('#briefing-portrait').textContent=boss.name;});
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  return{open,close,get isOpen(){return dialog.open;},dispose(){close();dialog.remove();}};
}
