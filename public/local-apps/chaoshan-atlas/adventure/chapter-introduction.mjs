import {STORY_CHAPTERS} from './story-content.mjs';
import {BOSS_BY_LEVEL,BOSS_BY_ID} from './boss-catalog.mjs';
import {districtIntroduction} from './expansion-panels.mjs';
import {CHAPTER_JOURNEYS} from './chapter-journeys.mjs';
import {journeyIntroduction} from './chapter-journey-panels.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const guide='./project-guide/';
const asset=name=>guide+encodeURIComponent(name);
function chapterFacts(level){
  if(!level)return null;
  const lengths=[...new Set((level.hunt?.riddles||[]).map(r=>r.answer.length))].sort((a,b)=>a-b);
  return {id:level.id,title:level.shortTitle||level.title,kills:level.hunt?.killTarget||0,
    chips:level.hunt?.clueIds?.length||0,letters:lengths.length===1?`${lengths[0]} 个字母`:`${lengths[0]}—${lengths.at(-1)} 个字母`,
    wave:level.hunt?.waveSize||0,boss:(BOSS_BY_ID[level.bossPreviewId]||BOSS_BY_LEVEL[level.id])?.name||'地区首领',
    identity:level.art?.identity||level.description||level.title};
}

// Derive the introduction from chapter definitions so later content changes
// cannot leave a different chapter's targets or Boss on the opening card.
export function chapterIntroduction(level,next,index){
  const current=chapterFacts(level),following=chapterFacts(next);
  const rows=[['击杀目标',`${current.kills} 只`,following?`${following.kills} 只`:'本次行旅终章'],
    ['密码芯片',`${current.chips} 枚`,following?`${following.chips} 枚`:'完成后可重访地区'],
    ['谜语单词',current.letters,following?.letters||'收藏已解开的地区记录'],
    ['初始波次',`${current.wave} 只 / 批`,following?`${following.wave} 只 / 批`:'完成十二地行旅'],
    ['地区首领',current.boss,following?.boss||'没有下一章'],
    ['独特行动',CHAPTER_JOURNEYS[level.id]?.title||'小公园基础行旅',CHAPTER_JOURNEYS[next?.id]?.title||'回营地收藏本次行旅'],
    ['行动步骤',CHAPTER_JOURNEYS[level.id]?.steps.map(s=>s.title).join(' → ')||'熟悉双钥匙与救援',CHAPTER_JOURNEYS[next?.id]?.steps.map(s=>s.title).join(' → ')||'完成十二地后可重访']];
  return `<section class="chapter-introduction" data-chapter-id="${esc(current.id)}" aria-labelledby="chapter-intro-title">
    <div class="chapter-intro-heading"><div><small>第 ${String(index+1).padStart(2,'0')} 章 · 任务介绍图</small><h3 id="chapter-intro-title">${esc(current.title)} · 出发前看这一页</h3></div><span class="chapter-intro-read">阅读期间，关卡计时暂停</span></div>
    <p class="chapter-intro-setting">${esc(current.identity)}</p>
    <ol class="chapter-intro-route" aria-label="本章任务路线">
      <li><span>01</span><strong>观察街区</strong><p>前 10 秒熟悉道路与「商」「安」标记。</p></li>
      <li><span>02</span><strong>迎击与解谜</strong><p>击败 ${current.kills} 只敌人，寻找 ${current.chips} 枚芯片，收集字母拼出谜底。</p></li>
      <li><span>03</span><strong>${CHAPTER_JOURNEYS[level.id]?'完成地区行动与钥匙':'合成密码钥匙'}</strong><p>取得线索与击杀两半钥匙${CHAPTER_JOURNEYS[level.id]?'，完成下方本章行动':''}，前往远端任务房开门。</p></li>
      <li><span>04</span><strong>迎战本关首领</strong><p>击败${esc(current.boss)}${following?'，选择装备带入下一章。':'，完成十二地行旅。'}</p></li>
    </ol>
    <div class="chapter-intro-rescue"><strong>同行救援 · 支线</strong><span>15 人中护送至少 5 人到「安」处。另有屋内受困旅人，先救出再交火。救援进度与完成状态可在左侧任务栏查看。</span></div>
    ${STORY_CHAPTERS[level.id]?`<section class="chapter-story-opening"><small>归途簿 · 连续故事</small><h3>${esc(STORY_CHAPTERS[level.id].title)}</h3><p>${esc(STORY_CHAPTERS[level.id].opening)}</p><p>本章现场解开任意一道谜语，都会收进同一张故事纸片。十二章各留一页，最终在归途手记中拼接；故事纸片不代替密码钥匙与本章任务。</p></section>`:''}
    ${journeyIntroduction(level)}
    ${districtIntroduction(level)}
    <div class="chapter-intro-comparison"><table aria-label="本章与下一章目标对比"><thead><tr><th scope="col">目标</th><th scope="col">本章 · ${esc(current.title)}</th><th scope="col">${following?`下一章 · ${esc(following.title)}`:'完成本章后'}</th></tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${esc(cell)}</th>`:`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <details class="chapter-intro-library"><summary>玩家指南与关卡对比图 <span>点击展开 · 每章都可查看</span></summary>
      <nav class="chapter-intro-docs" aria-label="关卡参考资料"><a href="./project-guide/STORY-V20.html" target="_blank" rel="noopener">归途故事与收集说明 ↗</a><a href="./project-guide/CHAPTERS-V19.html" target="_blank" rel="noopener">十一章行动与下一章对比 ↗</a><a href="./project-guide/操作指南.html" target="_blank" rel="noopener">玩家操作指南 ↗</a></nav>
      <p>上方介绍随当前章节变化。第 2—12 章地区行动见章节说明；换装、跟随与瞄具按键见操作指南。</p>
      <div class="chapter-intro-figures"><figure><a href="${asset('01-关卡内容对比.png')}" target="_blank" rel="noopener" aria-label="放大当前关与下一关完整对比图"><img src="${asset('01-关卡内容对比.png')}" loading="lazy" width="2160" height="2951" alt="首关小公园与第二关广济桥的内容、规则及目标对比"></a><figcaption>关卡内容对比 · 点击图片看大图</figcaption></figure></div>
    </details>
  </section>`;
}
