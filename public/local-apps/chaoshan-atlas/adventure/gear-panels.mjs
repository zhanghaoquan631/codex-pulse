import {WEAPONS,CONSUMABLES} from './game-state.mjs';
import {growthMarkup,expeditionMarkup} from './expansion-panels.mjs';
import {TACTICAL_WEAPONS,TACTICAL_CONSUMABLES} from './tactical-equipment.mjs';
export const CONTROL_GROUPS=[
  ['移动与镜头',[['W A S D / 方向键','前后左右移动'],['Shift','按住奔跑'],['CapsLock','锁定向前奔跑；再按或后退停止'],['Z','切换蹲走；再按恢复站立'],['Y','切换匍匐；再按恢复站立'],['[ / ]','按住向左／向右探头，松开回正'],['J','跳跃、越过低墙'],['E','拾取、翻窗、开门、救援、与商人交互'],['鼠标','环视；在镜头设置中可改为按住拖动'],['V','第一／第三人称切换'],['T','快速回身 180°'],['R','镜头回到行进方向'],['镜头设置','普通转向灵敏度、各倍镜独立灵敏度和准星大小'],['滚轮','调整第三人称镜头远近']]],
  ['战斗与行装',[['左键 / Space','按住攻击；远程连续射击，近战连续挥击；建造模式下改为放置方块'],['右键','鼠标跟随模式按住开镜；平底锅按住防御；拖动镜头模式下为转向'],['7 / 开镜时滚轮','红点 → 2 倍 → 4 倍切换'],['8','开镜／收镜；第三人称开镜贴近目光，收镜恢复'],['F','循环切换已拥有的装备'],['1 / 2 / 3 / 4','步枪／霰弹枪／连弩／法杖'],['5 / 6','切换已拥有的短刀／平底锅'],['G','打开或关闭背包，查看武器特色、射程、弹药与价格'],['B','投掷炸弹'],['K','使用药包'],['M','投掷燃烧瓶'],['O','投掷烟雾弹，掩护转移与救援'],['H','饮用工夫茶回复体力']]],
  ['建造、调查与菜单',[['9','主角换装：红巾旅人／八重神子，营地与关卡中均可切换；换装面板中再按关闭'],['X','开启／退出方块建造'],['左键 / Space（建造时）','在准星的有效落点放一块；绿框可放，红框不可放'],['Tab','任务地图：分类选择追踪目标；箭头显示直线方向、距离与楼层，沿道路或楼梯前进'],['Q','侦探线索册与字母拼词'],['N','本章行动、图形机关、地区调查记录与补给'],['U','旅人成长与地区纪念徽记'],['C','地区与 Boss 收藏册'],['I','收起或展开游戏信息卡'],['L','本操作指南'],['Esc / P','暂停或继续；弹窗内先关闭当前弹窗']]],
];
export function equipmentInfo(id){
 const own=(table,key)=>Object.hasOwn(table,key)?table[key]:null,w=own(WEAPONS,id),s=own(CONSUMABLES,id),t=own(TACTICAL_WEAPONS,id)||own(TACTICAL_CONSUMABLES,id);
 if(w){const original={rifle:'远距离连续点射，适合高窗和分散目标。',shotgun:'近距离六发散射，适合窄巷围攻。',crossbow:'中距离连发，单发伤害较高。',staff:'命中后范围爆发，适合聚集的怪物。',sword:'快速近身挥击。',spear:'距离较长的近战刺击。'};
  return {name:w.name,description:t?.description||w.description||original[id]||'靠近目标后使用当前装备。',specialty:t?.specialty||'',use:t?.use||'',limits:t?.limits||'',range:`有效射程 ${w.range} 游戏米`,ammo:t?.ammo||(w.kind==='ranged'?'墨弹持续生成 · 无需换弹':'近战装备 · 不消耗子弹'),stats:`${w.kind==='ranged'?'单发':'单次'} ${w.damage}${w.pellets?' × '+w.pellets:''} 伤害 · 间隔 ${w.cooldown} 秒${w.projectileSpeed?' · 弹速 '+w.projectileSpeed+' 米/秒':''} · 商人价格 ${w.price} 金币`};
 }
 if(s)return {name:s.name,description:t?.description||s.description||'使用后消耗一份随身补给。',specialty:t?.specialty||'',use:t?.use||'',limits:t?.limits||'',range:s.radius?`影响半径 ${s.radius} 游戏米${s.height?' · 高度 '+s.height+' 米':''}`:'对自己使用',ammo:t?.ammo||'每次使用消耗一份',stats:[`商人价格 ${s.price} 金币`,...(s.fuse?[`生效延时 ${s.fuse} 秒`]:[]),...(s.duration?[`持续 ${s.duration} 秒`]:[])].join(' · ')};
 if(id==='potion')return {name:'工夫茶',description:'回复 65 点体力。',range:'对自己使用',ammo:'每次饮用消耗一份',stats:'商人价格 25 金币'};
 return {name:'纸砖方块',description:'逐块堆叠，搭建墙体和掩体；双方子弹会损伤方块，底部被击毁会连带失去支撑的上层。',range:'放置距离 7 游戏米 · 方块边长 1.2 米',ammo:'每放一块消耗一块库存',stats:'25 金币 / 5 块 · 每块耐久 160'};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function installGearPanels({getState,onOpen,onClose,onEquip,onUse,onBuild,onGrowth,onMemento,onEvidence,getBlocks,onBlock,onTrack,onJourney}){
 let kind=null;
 const dialog=document.createElement('dialog');dialog.id='gear-panel';dialog.className='gear-panel';dialog.setAttribute('aria-labelledby','gear-title');document.body.append(dialog);
 function close(){if(!dialog.open)return;dialog.close();kind=null;onClose();}
 const description=id=>{const d=equipmentInfo(id);return `${d.specialty?'<p><b>'+esc(d.specialty)+'</b></p>':''}<p>${esc(d.description)}</p><small>${esc(d.range)}<br>${esc(d.ammo)}<br>${esc(d.stats)}${d.use?'<br>适用：'+esc(d.use):''}${d.limits?'<br>限制：'+esc(d.limits):''}</small>`;};
 function render(){const {player:p,status}=getState();
  dialog.innerHTML=`<header><div><small>${kind==='guide'?'操作指南 / FIELD MANUAL':'旅人背包 / INVENTORY'}</small><h2 id="gear-title">${kind==='guide'?'先认按键，再走进街巷。':'行装随你，跨境同行。'}</h2></div><button id="gear-close" class="quiet" aria-label="关闭面板">×</button></header>`;
  dialog.insertAdjacentHTML('beforeend','<nav class="gear-tabs" aria-label="行装栏目">'+[['inventory','背包 G'],['expedition','地区笔记 N'],['growth','旅人成长 U'],['guide','操作指南 L']].map(([id,label])=>'<button class="quiet '+(kind===id?'selected':'')+'" data-gear-tab="'+id+'">'+label+'</button>').join('')+'</nav>');
  if(kind==='growth'){dialog.querySelector('#gear-title').textContent='把走过的路，留在身上。';dialog.insertAdjacentHTML('beforeend',growthMarkup(getState()));}
  else if(kind==='expedition'){dialog.querySelector('#gear-title').textContent='循着线索，走自己的路。';dialog.insertAdjacentHTML('beforeend',expeditionMarkup(getState()));}
  else if(kind==='guide')dialog.insertAdjacentHTML('beforeend',`<p class="gear-intro">电脑按键以英文键位为准；输入谜底时不会触发战斗快捷键。手机可点击画面上的对应按钮。</p><div class="guide-groups">${CONTROL_GROUPS.map(([title,rows])=>`<section><h3>${title}</h3><dl>${rows.map(([key,meaning])=>`<dt><kbd>${key}</kbd></dt><dd>${meaning}</dd>`).join('')}</dl></section>`).join('')}</div><section class="gear-note"><h3>这一关怎样完成</h3><p>开局 10 秒街上有 9 位行人和 3 辆各载 2 人的车辆，共 15 人。怪物出现后，人车避险；行人每局分散随机出现并走动；靠近或进入其视线会跟随你，奔跑时会追上，送至少 5 人到地图「安」完成支线并获得 60 金币。支线失败仍可继续主线。</p><p>地图「商」显示行商当前位置；他每局随机出现并走动，看见你后跟随，遇敌优先奔跑躲避，也可在楼上藏身。双方子弹、爆炸与火焰都会伤害他；遇难后本次关内无法交易。每位旅人与车辆都有血量，开火时留意周围。</p><p>抵挡主动来袭的怪物 → 收集随机芯片和字母卡 → 回猜谜点解出单词 → 凑齐密码半钥与击杀半钥 → 完成本章地区行动（第二至十二章）→ 去远端任务房开门 → 进入房间触发 Boss → 击败后选择下一关装备。</p><p>楼梯可上楼，低窗台按 E 可翻入／跳出。屋内旅人的位置也随机，他看见你或被 E 招呼后会跟随，带他走出房屋才完成救援；房屋危急时会倒塌，未救出的幸存者遇难即任务失败。方块向商人购买，不能放进人物、实墙、任务入口或悬空位置。基地支撑被破坏，上层方块也会坍塌。</p><p>怪物数量、射速和弹速随时间增强；10 秒平静期后，移动速度每 3 秒提高一次（普通怪与 Boss 均适用），缓慢持续增长；部分敌人会奔跑并移动射击。看地图、背包和指南时游戏暂停。</p></section>`);
  else dialog.insertAdjacentHTML('beforeend',`<div class="gear-balance">金币 <b>${p.gold}</b><span>当前装备：${esc(WEAPONS[p.weaponId].name)}</span><span>纸砖方块 ${p.buildingBlocks||0} 块</span></div><h3>武器 · F 循环切换已拥有装备</h3><div class="gear-grid">${Object.values(WEAPONS).map(w=>{const owned=p.weapons.includes(w.id);return `<article class="${owned?'':'unowned'}"><h4>${esc(w.name)}${w.id===p.weaponId?' · 已装备':''}</h4>${description(w.id)}<button class="outlined dark" data-equip="${w.id}" ${!owned||p.weaponId===w.id?'disabled':''}>${owned?p.weaponId===w.id?'正在使用':'装备':'未拥有 · 商人 '+w.price+' 金币'}</button></article>`;}).join('')}</div><h3>随身补给</h3><div class="gear-grid">${[...Object.keys(CONSUMABLES),'potion'].map(id=>{const amount=id==='potion'?p.potions:p.consumables[id];return `<article><h4>${esc(equipmentInfo(id).name)} × ${amount}</h4>${description(id)}<button class="outlined dark" data-use="${id}" ${!amount||status!=='playing'?'disabled':''}>${status==='playing'?'使用':'进关后使用'}</button></article>`;}).join('')}<article><h4>纸砖方块 × ${p.buildingBlocks||0}</h4>${description('building-block')}<button id="gear-build" class="outlined dark" ${status!=='playing'?'disabled':''}>${status==='playing'?'关闭背包并建造 · X':'进关后按 X 建造'}</button></article></div><p class="gear-note">武器、金币、未使用的补给与方块库存随成长保存。放在场景中的方块属于本次关卡，重试会重建场景。</p>`);
  if(kind==='inventory')dialog.insertAdjacentHTML('beforeend','<section class="gear-note"><h3>附近掩体维护</h3><p>靠近自己的方块 3 米内，打开背包操作。修理花费 10 铜钱，恢复最多 80 耐久。完好且上方腾空的方块可收回背包；无出售或现金退款。</p><div class="gear-grid">'+(getBlocks?.()||[]).map((b,i)=>'<article><h4>纸砖 '+(i+1)+' · '+Math.ceil(b.hp)+' / '+b.maxHp+'</h4><button class="outlined dark" data-block="'+b.id+'" data-service="repair" '+(b.hp>=b.maxHp||p.gold<10?'disabled':'')+'>修理 · 10 铜钱</button><button class="quiet" data-block="'+b.id+'" data-service="recover" '+(b.hp<b.maxHp?'disabled':'')+'>收回完好方块</button></article>').join('')+'</div></section>');
  for(const b of dialog.querySelectorAll('[data-block]'))b.addEventListener('click',()=>{onBlock(b.dataset.block,b.dataset.service);render();});
  dialog.querySelector('#gear-close').addEventListener('click',close);
  for(const b of dialog.querySelectorAll('[data-gear-tab]'))b.addEventListener('click',()=>{kind=b.dataset.gearTab;render();dialog.scrollTop=0;});
  for(const b of dialog.querySelectorAll('[data-growth]'))b.addEventListener('click',()=>{onGrowth(b.dataset.growth);render();});
  dialog.querySelector('[data-growth-reset]')?.addEventListener('click',()=>{onGrowth(null,true);render();});
  for(const b of dialog.querySelectorAll('[data-memento]'))b.addEventListener('click',()=>{onMemento(b.dataset.memento||null);render();});
  for(const b of dialog.querySelectorAll('[data-evidence]'))b.addEventListener('click',()=>{onEvidence(b.dataset.evidence,b.dataset.reward);render();});
  for(const b of dialog.querySelectorAll('[data-track-evidence]'))b.addEventListener('click',()=>{close();onTrack?.('evidence:'+b.dataset.trackEvidence);});
  for(const b of dialog.querySelectorAll('[data-track-journey]'))b.addEventListener('click',()=>{close();onTrack?.('journey:'+b.dataset.trackJourney);});
  for(const b of dialog.querySelectorAll('[data-journey-choice]'))b.addEventListener('click',()=>{onJourney?.(b.dataset.journeyChoice);render();});
  for(const b of dialog.querySelectorAll('[data-equip]'))b.addEventListener('click',()=>{onEquip(b.dataset.equip);render();});
  for(const b of dialog.querySelectorAll('[data-use]'))b.addEventListener('click',()=>{const id=b.dataset.use;close();onUse(id);});
  dialog.querySelector('#gear-build')?.addEventListener('click',()=>{close();onBuild();});
 }
 function open(which='inventory'){if(!dialog.open&&onOpen()===false)return;kind=which;render();if(!dialog.open)dialog.showModal();dialog.scrollTop=0;}
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 return {open,close,get isOpen(){return dialog.open;},get kind(){return kind;},dispose(){close();dialog.remove();}};
}
