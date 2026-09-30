import {growthStatus} from './traveller-growth.mjs';
import {DISTRICT_CONTENT} from './district-content.mjs';
import {journeyMarkup} from './chapter-journey-panels.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function growthMarkup(state){
 const s=growthStatus(state.player,state.progress),can=['camp','complete'].includes(state.status);
 return `<div class="gear-balance">成长点 <b>${s.remaining} / ${s.total}</b><span>每升 3 级 +1；每通关 2 地 +1；最多 6 点</span></div>
 <p class="gear-intro">红围巾旅人 · 在原角色上成长。${can?'在营地自由分配与重置。':'本关使用出发前的分配，回营地或通关后调整。'}</p>
 <div class="gear-grid">${s.branches.map(b=>`<article><h3>${b.name} · ${s.growth.ranks[b.id]} / 3</h3><p>${b.description}</p><button data-growth="${b.id}" class="outlined dark" ${!can||!s.remaining||s.growth.ranks[b.id]>=3?'disabled':''}>投入 1 点</button></article>`).join('')}</div>
 <button data-growth-reset class="quiet" ${!can?'disabled':''}>重置分配 · 退回成长点</button>
 <h3>十二地纪念徽记</h3><p>首次通关解锁对应徽记，可佩戴在红围巾胸前；纯纪念外观，不影响数值。</p>
 <div class="memento-grid">${s.mementos.map(m=>`<button data-memento="${m.id}" class="memento ${s.growth.memento===m.id?'selected':''}" ${!can||!m.unlocked?'disabled':''}><b>${m.symbol}</b><span>${m.name}</span><small>${s.growth.memento===m.id?'正在佩戴':m.unlocked?'已解锁':'完成对应章节解锁'}</small></button>`).join('')}</div><button data-memento="" class="quiet" ${!can?'disabled':''}>收起徽记</button>`;
}
export function expeditionMarkup(state){
 const e=state.level?.expedition;if(!e)return '<p class="gear-note">进入章节后，这里记录本局路段、已调查证据和可领取补给。开场卡可先查看地区路线。</p>';
 const current=e.stages[e.activeIndex];
 return `${journeyMarkup(state)}<p class="gear-intro">当前位置：<strong>${esc(current.title)}</strong> · 地图「证」标出可选调查点。靠近按 E 阅读，调查不会替代主线钥匙。</p>
 <ol class="district-stages">${e.stages.map((s,i)=>`<li class="${i===e.activeIndex?'current':''}"><b>${String(i+1).padStart(2,'0')} · ${esc(s.title)}</b><small>${i===e.activeIndex?'正在这里':s.visited?'已到访':'尚未到访'}</small><p>${esc(s.tactic)}</p></li>`).join('')}</ol>
 <h3>地区证据 · 可选探索</h3><div class="gear-grid">${e.evidence.map(q=>`<article data-evidence-card="${q.id}"><h4>${esc(q.name)} ${q.collected?'✓':''}</h4><p>${q.collected?esc(q.text):'到地图「证」标记旁按 E 调查，记录推理思路，并选择一份随行补给。'}</p><button class="quiet" data-track-evidence="${q.id}">在地图追踪此处</button>${q.collected?(q.rewardClaimed?'<small>✓ 此证据补给已领取</small>':`<div class="evidence-rewards" aria-label="三选一调查补给">${[['medkit','药包'],['bomb','炸弹'],['molotov','燃烧瓶']].map(([id,label])=>`<button data-evidence="${q.id}" data-reward="${id}" class="outlined dark" ${state.player.consumables[id]>=99?'disabled':''}>${label} +1</button>`).join('')}</div>`):'<small>尚未调查 · 本局可重复查看记录</small>'}</article>`).join('')}</div><p class="gear-note">${esc(e.sourceNote)} 重试时可重新调查；每份证据补给在本存档仅领取一次，避免反复重开刷物资。阅读期间暂停。</p>`;
}
export function districtIntroduction(level){const c=DISTRICT_CONTENT[level.id];if(!c)return '';return `<section class="district-introduction"><h3>本地三段路线 · 环境决定应对</h3><ol class="district-stages">${c.stages.map((s,i)=>`<li><b>${i+1} · ${esc(s)}</b><p>${esc(c.tactics[i])}</p></li>`).join('')}</ol><p>可选调查：${c.evidence.map(esc).join('、')}。靠近地图「证」按 E，获得推理记录与三选一补给；按 N 重读。</p></section>`;}
