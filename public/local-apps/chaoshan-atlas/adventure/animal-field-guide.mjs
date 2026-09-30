import {DESKTOP_ANIMALS,DESKTOP_ANIMAL_COUNTS,FEATURED_ANIMAL_IDS} from './animal-definitions.mjs';
import {ANIMAL_MOVES} from './animal-combat.mjs';

const esc = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function desktopAnimalIntroduction() {
  const featured=FEATURED_ANIMAL_IDS.map(id=>DESKTOP_ANIMALS.find(animal=>animal.id===id));
  return `<details class="animal-field-guide"><summary><span>桌宠全图鉴，加入墨潮</span><small>${DESKTOP_ANIMAL_COUNTS.catalog} 条资料 · ${DESKTOP_ANIMAL_COUNTS.unique} 种独立形象 · 展开查看</small></summary>
    <div class="animal-field-heading"><div><small>桌宠来袭 / DESKTOP MENAGERIE</small><h3>每次交手，都有新的面孔。</h3></div><span class="animal-field-count">${DESKTOP_ANIMAL_COUNTS.catalog}</span></div>
    <p class="animal-field-lede">全目录随机来袭，每种形象在一轮中只出现一次；${DESKTOP_ANIMAL_COUNTS.unique} 种全部出场后才重新洗牌。换关、重试或刷新会保留抽取历史，同图不同名字也会排重。浏览图鉴不消耗出场机会。</p>
    <p class="animal-field-lede">它们会扑击、侧翼包抄、假冲锋、折返冲撞，也会点射、连射、狙击和抛投；另有护卫、反击、治疗、毒池、火径与蛛网。观察起手预警和条件副招，再选择路线与装备。</p>
    <div class="animal-field-grid">${featured.map((animal,index) => `<article class="animal-field-card" data-animal-card="${esc(animal.id)}"><span class="animal-field-number">${String(index+1).padStart(2,'0')}</span><img src="${new URL(animal.preview,import.meta.url).href}" alt="${esc(animal.name)}" width="192" height="208" loading="lazy"><h4>${esc(animal.name)}</h4><b>${esc(ANIMAL_MOVES[animal.combatProfile.primary].name)}</b><p>${esc(animal.description)}</p></article>`).join('')}</div>
    <p class="animal-field-footnote">这里是十位熟悉的伙伴；营地「桌宠图鉴」可搜索全部 ${DESKTOP_ANIMAL_COUNTS.catalog} 个条目，逐项播放原素材动作。图像按需加载。${DESKTOP_ANIMAL_COUNTS.static} 份原素材为静态，图鉴会明确标注；其余保留原逐帧动作。抽取历史需要浏览器本地存储；清除站点数据后会开始新的一轮。</p>
  </details>`;
}
