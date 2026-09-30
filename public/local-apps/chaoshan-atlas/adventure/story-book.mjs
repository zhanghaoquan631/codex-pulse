import {STORY_CHAPTERS,STORY_ORDER,STORY_ACTS,STORY_PROLOGUE,STORY_ENDING} from './story-content.mjs';
import {storyStatus} from './story-state.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pageNumber=id=>String(STORY_ORDER.indexOf(id)+1).padStart(2,'0');
const shortTitle=id=>STORY_CHAPTERS[id].title;
const statusOf=state=>storyStatus(state.progress?.story,state.progress?.completedLevelIds||[]);
const canWork=state=>['camp','complete'].includes(state.status);
const safeResult=result=>result?.message||result?.reason||'暂时未能完成，请保留纸片后重试。';

function craneSvg(){return `<svg class="story-crane" viewBox="0 0 600 320" aria-hidden="true"><ellipse class="story-crane-shadow" cx="299" cy="266" rx="77" ry="10" fill="#566d7130"/><g class="story-crane-body" fill="#f5efdc" stroke="#38556a" stroke-width="2.7" stroke-linejoin="round"><path class="story-wing-left" d="M298 196 77 72 225 215Z" fill="#e0caa7"/><path class="story-wing-right" d="M304 195 467 51 390 222Z" fill="#f7edcf"/><path d="m223 215 75-63 95 71-76 23Z" fill="#d4e0dc"/><path d="m297 152 20 94-94-31Z" fill="#eee4ca"/><path d="m318 201 68-86 58 12-42 11-44 93Z"/><path d="m386 115 21-26 38 38-43 11Z" fill="#e7d3b7"/><path d="m444 127 40 20-82-9Z" fill="#ba875f"/><path d="m223 215-73 20 108-51" fill="#e8dcc1"/><path d="m298 196 19 50 41-15M298 152l92 71" fill="none" opacity=".5"/><circle cx="409" cy="120" r="3.2" fill="#38556a" stroke="none"/></g></svg>`;}

function foldScene(animating){
 const pieces=STORY_ORDER.map((id,i)=>{const col=i%6,row=Math.floor(i/6),x=(col-2.5)*72,y=(row?74:-92);return `<span class="story-paper-shard" aria-hidden="true" style="--piece-x:${x}px;--piece-y:${y}px;--piece-angle:${(i%3-1)*9}deg;--piece-delay:${i*.08}s">${esc(STORY_CHAPTERS[id].glyph)}</span>`;}).join('');
 return `<div class="story-fold-scene ${animating?'is-folding':'is-settled'}" data-story-animation role="img" aria-label="十二张归途纸片合拢，折成一只舒展双翼的纸鹤"><div class="story-fold-papers">${pieces}</div>${craneSvg()}<p class="story-fold-caption">十二页回信，一双纸翼。</p></div>`;
}

/** Accessible, self-contained archive and optional camp assembly panel.
 * No game mutation is performed here: callbacks own state, rewards and travel.
 */
export function installStoryBook({getState,onOpen=()=>true,onClose=()=>{},onAssemble,onCompanion,onRevisit}){
 const dialog=document.createElement('dialog');dialog.id='story-book';dialog.className='story-book';dialog.setAttribute('aria-labelledby','story-book-title');dialog.setAttribute('aria-describedby','story-book-subtitle');document.body.append(dialog);
 const drafts=new Map(STORY_ACTS.map(a=>[a.id,[]]));
 // Deliberately different from the answer order, and stable across re-renders.
 const choices=new Map(STORY_ACTS.map((a,i)=>[a.id,i%2?[a.chapterIds[1],a.chapterIds[2],a.chapterIds[0]]:[a.chapterIds[2],a.chapterIds[0],a.chapterIds[1]]]));
 let tab='archive',notice='',noticeError=false,busy=false,animating=false,animationTimer=null,disposed=false,priorFocus=null;
 const stopAnimation=()=>{clearTimeout(animationTimer);animationTimer=null;animating=false;};
 function close(){if(!dialog.open)return;stopAnimation();dialog.close();onClose();if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});}
 function announce(text,error=false){notice=text;noticeError=error;}
 function focus(selector){dialog.querySelector(selector)?.focus({preventScroll:true});}
 function finishAnimation(){stopAnimation();if(dialog.open){render();focus('[data-story-replay]');}}
 function startAnimation(){
  stopAnimation();animating=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;tab='assembly';render();
  if(animating){animationTimer=setTimeout(finishAnimation,5800);focus('[data-story-skip]');}else focus('[data-story-companion]');
 }
 function chapterCard(id,state,status){
  const c=STORY_CHAPTERS[id],collected=status.collectedChapterIds.includes(id),allowed=canWork(state),unlocked=state.progress?.unlockedLevelIds?.includes(id)||state.progress?.completedLevelIds?.includes(id);
  const revisit=allowed&&unlocked&&onRevisit?`<button type="button" class="story-text-button" data-story-revisit="${esc(id)}">回营地重访 · 第 ${pageNumber(id)} 章</button>`:'';
  if(!collected)return `<article class="story-fragment is-missing" data-story-chapter="${esc(id)}" data-story-missing><div class="story-fragment-top"><span class="story-page-number">${pageNumber(id)}</span><span class="story-fragment-empty" aria-hidden="true">?</span></div><h4>${esc(c.title)}</h4><p>纸片缺失</p><small>${unlocked?'回访本章，在现场收齐字母并正式验证谜底。':'沿已解锁章节继续行旅，抵达后再寻找这一页。'}</small>${revisit}</article>`;
  const solves=status.solves.filter(s=>s.chapterId===id),known=c.riddles.filter(r=>solves.some(s=>s.riddleId===r.id));
  return `<article class="story-fragment" data-story-chapter="${esc(id)}" data-story-collected><div class="story-fragment-top"><span class="story-page-number">${pageNumber(id)}</span><span class="story-fragment-glyph" aria-hidden="true">${esc(c.glyph)}</span><span class="story-collected-label">已找回 ✓</span></div><h4>${esc(c.fragmentTitle)}</h4><small>${esc(c.title)}</small><p>${esc(c.connection)}</p><details class="story-answer-record"><summary>查看已解谜题与依据 <span>${known.length} 条</span></summary>${known.map(r=>`<section data-story-riddle="${esc(r.id)}"><p class="story-original-riddle">${esc(r.prompt)}</p><p class="story-word"><strong lang="en">${esc(r.answer)}</strong> · ${esc(r.meaning)}</p><p>${esc(r.explanation)}</p></section>`).join('')}<small>同章两种谜面通向同一张纸片；只解过其中一种即可收集本页。</small></details>${revisit}</article>`;
 }
 function archiveMarkup(state,status){
  const oldMissing=(state.progress?.completedLevelIds||[]).some(id=>STORY_CHAPTERS[id]&&!status.collectedChapterIds.includes(id));
  return `${oldMissing?'<p class="story-archive-note">有些已通关章节还没有归途记录。旧存档不会自动补出未记录的谜底；回营地重访，在原猜谜点验证一次即可找回纸片。</p>':''}${STORY_ACTS.map((a,index)=>`<section class="story-act-archive" aria-labelledby="story-act-${a.id}"><header><small>第 ${index+1} 幕</small><h3 id="story-act-${a.id}">${esc(a.title)}</h3><span>${a.chapterIds.filter(id=>status.collectedChapterIds.includes(id)).length} / 3 页</span></header><div class="story-fragment-grid">${a.chapterIds.map(id=>chapterCard(id,state,status)).join('')}</div></section>`).join('')}`;
 }
 function actMarkup(act,state,status){
  const assembled=status.assembledActs.includes(act.id),work=canWork(state)&&status.canAssemble&&!status.complete&&!busy,draft=drafts.get(act.id),data=status.acts.find(a=>a.id===act.id),ready=work&&data?.ready!==false;
  return `<section class="story-assembly-act ${assembled?'is-assembled':''}" data-story-act="${esc(act.id)}"><header><div><small>${assembled?'已凝结 ✓':'回信拼接'}</small><h3>${esc(act.title)}</h3></div><span>${assembled?'3 / 3':`${draft.length} / 3`}</span></header><p class="story-act-clue">${esc(act.clue)}</p>${assembled?`<ol class="story-assembly-slots">${act.chapterIds.map(id=>`<li><span>${esc(STORY_CHAPTERS[id].glyph)}</span><b>${esc(STORY_CHAPTERS[id].fragmentTitle)}</b></li>`).join('')}</ol>`:`<ol class="story-assembly-slots" aria-label="${esc(act.title)}的三个排列位置">${[0,1,2].map(i=>`<li class="${draft[i]?'is-filled':''}" data-story-slot="${i}"><span>${draft[i]?esc(STORY_CHAPTERS[draft[i]].glyph):i+1}</span><b>${draft[i]?esc(STORY_CHAPTERS[draft[i]].fragmentTitle):'选择一张纸片放在这里'}</b></li>`).join('')}</ol><div class="story-fragment-choices" aria-label="选择本幕纸片">${choices.get(act.id).map(id=>`<button type="button" data-story-pick="${esc(id)}" data-story-pick-act="${esc(act.id)}" ${!ready||draft.includes(id)||draft.length>=3?'disabled':''}><span aria-hidden="true">${esc(STORY_CHAPTERS[id].glyph)}</span>${esc(STORY_CHAPTERS[id].fragmentTitle)}${draft.includes(id)?' ✓':''}</button>`).join('')}</div><div class="story-act-actions"><button type="button" data-story-undo="${esc(act.id)}" ${!ready||!draft.length?'disabled':''}>退回一片</button><button type="button" data-story-clear="${esc(act.id)}" ${!ready||!draft.length?'disabled':''}>清空本组</button><button type="button" class="story-primary" data-story-assemble="${esc(act.id)}" ${!ready||draft.length!==3?'disabled':''}>凝结这一组 →</button></div>${work&&!ready?'<p class="story-muted">先完成前一幕，再继续这一组。</p>':''}`}</section>`;
 }
 function assemblyMarkup(state,status){
  if(status.complete)return `<section class="story-ending" data-story-ending><small>归途簿 · 已凝结 ${status.assembledCount} / 4 幕</small><h3>${esc(STORY_ENDING.title)}</h3>${foldScene(animating)}<div class="story-animation-actions">${animating?'<button type="button" data-story-skip>跳过动画，直接看回信</button>':'<button type="button" data-story-replay>重播纸片凝结</button>'}</div><p class="story-reveal">${esc(STORY_ENDING.reveal)}</p>${STORY_ENDING.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<div class="story-companion-card"><div><small>行旅伙伴 · 已解锁</small><h4>${esc(STORY_ENDING.rewardName)}</h4><p>它会在场景中跟随旅人，也可以暂时收回。不会代你战斗、解谜或救人。</p></div><button type="button" class="story-primary" data-story-companion="${status.companionEnabled?'false':'true'}" aria-pressed="${status.companionEnabled}" ${busy?'disabled':''}>${status.companionEnabled?'收回纸鹤':'召唤纸鹤跟随'}</button></div><p class="story-muted">${esc(STORY_ENDING.sourceNote)}</p></section>`;
  if(!status.allFragments||!status.finalBossDefeated)return `<section class="story-assembly-locked" data-story-assembly-locked><span class="story-lock-glyph" aria-hidden="true">叠</span><h3>还在等待其余的回信</h3><p>找回十二张不同章节的纸片，并击败第十二章主 Boss 后，才可以拼合完整归途记录。</p><ul><li>${status.allFragments?'✓':'○'} 故事纸片：${status.collected} / 12</li><li>${status.finalBossDefeated?'✓ 终章首领已经击败':'○ 终章首领尚未击败'}</li></ul><p>每章只需解开随机出现的一道谜题；仍要现场集字、验证，并完成原有通关条件。</p><button type="button" data-story-tab="archive">回看已经找回的纸片</button></section>`;
  return `<section class="story-assembly-heading"><small>十二页已经到齐</small><h3>把回信连成四段路</h3><p>依照每幕纸面的因果提示，按从左到右的顺序放入三片记录。错序可退回、清空再试，不消耗物品。</p>${!canWork(state)?'<p class="story-work-location" data-story-camp-required>返回营地后凝结。战斗中可以阅读；继续探索或回营地后，再来排列纸片。</p>':''}</section>${STORY_ACTS.map(a=>actMarkup(a,state,status)).join('')}`;
 }
 function render(){
  if(disposed)return;const state=getState(),status=statusOf(state),scroll=dialog.scrollTop;
  dialog.innerHTML=`<header class="story-book-header"><div><small>旅人档案 / RETURN LETTERS</small><h2 id="story-book-title">归途簿</h2><p id="story-book-subtitle">在十二地的谜面之间，找回一份相互回应的记录。</p></div><button type="button" class="story-close" data-story-close aria-label="关闭归途簿">×</button></header><div class="story-book-progress"><span>已找回 <b>${status.collected}</b> / 12 页</span><ol aria-label="十二章故事纸片收集状态">${STORY_ORDER.map(id=>`<li class="${status.collectedChapterIds.includes(id)?'is-found':''}" aria-label="第${pageNumber(id)}章${status.collectedChapterIds.includes(id)?'已找回':'缺失'}">${pageNumber(id)}</li>`).join('')}</ol></div><section class="story-prologue"><small>故事起点</small><h3>${esc(STORY_PROLOGUE.title)}</h3><p>${esc(STORY_PROLOGUE.text)}</p><details><summary>纸片与原有任务有什么关系？</summary><p>${esc(STORY_PROLOGUE.task)}</p><p>故事纸片收入这本归途簿。任务房继续使用原来的密码半钥、战斗半钥与地区行动条件；拼合故事不会代替它们。</p><small>${esc(STORY_PROLOGUE.sourceNote)}</small></details></section><nav class="story-book-tabs" role="tablist" aria-label="归途簿页面"><button type="button" role="tab" aria-selected="${tab==='archive'}" aria-controls="story-book-page" data-story-tab="archive">归途记录 <span>${status.collected}/12</span></button><button type="button" role="tab" aria-selected="${tab==='assembly'}" aria-controls="story-book-page" data-story-tab="assembly">${status.complete?'完整回信':'拼合回信'} <span>${status.assembledCount}/4</span></button></nav><p class="story-notice ${noticeError?'is-error':''}" role="status" aria-live="polite" data-story-notice ${notice?'':'hidden'}>${esc(notice)}</p><div id="story-book-page" role="tabpanel" aria-label="${tab==='archive'?'归途记录':'拼合回信'}" aria-busy="${busy}">${tab==='archive'?archiveMarkup(state,status):assemblyMarkup(state,status)}</div><footer class="story-book-footer"><span>阅读期间暂停 · Esc 关闭</span><button type="button" data-story-close>收好归途簿</button></footer>`;
  dialog.scrollTop=scroll;
 }
 async function handleAction(button){
  if(button.disabled||busy)return;
  if(button.hasAttribute('data-story-close')){close();return;}
  if(button.dataset.storyTab){stopAnimation();tab=button.dataset.storyTab;notice='';render();focus(`[data-story-tab="${tab}"]`);return;}
  if(button.dataset.storyRevisit){const state=getState();if(!canWork(state))return;const id=button.dataset.storyRevisit;close();onRevisit?.(id);return;}
  if(button.hasAttribute('data-story-skip')){finishAnimation();return;}
  if(button.hasAttribute('data-story-replay')){startAnimation();return;}
  const state=getState(),status=statusOf(state);
  if(button.hasAttribute('data-story-companion')){
   if(!status.complete)return;stopAnimation();busy=true;render();
   try{const result=await onCompanion?.(button.dataset.storyCompanion==='true');announce(result?.ok===false?safeResult(result):'纸鹤状态已更新。',result?.ok===false);}catch{announce('纸鹤暂时未能回应，请重试。',true);}finally{busy=false;if(dialog.open){render();focus('[data-story-companion]');}}return;
  }
  if(!canWork(state)||!status.canAssemble||status.complete){announce('请在收齐纸片并完成终章后，回营地拼合回信。',true);render();return;}
  const actId=button.dataset.storyPickAct||button.dataset.storyUndo||button.dataset.storyClear||button.dataset.storyAssemble,act=STORY_ACTS.find(a=>a.id===actId);
  if(!act||status.assembledActs.includes(actId)||status.acts.find(a=>a.id===actId)?.ready===false)return;
  const draft=drafts.get(actId);
  if(button.dataset.storyPick){const id=button.dataset.storyPick;if(!act.chapterIds.includes(id)||draft.includes(id)||draft.length>=3)return;draft.push(id);announce(`已放入第 ${draft.length} 片。`);render();focus(draft.length===3?`[data-story-assemble="${actId}"]`:`[data-story-pick-act="${actId}"]:not(:disabled)`);return;}
  if(button.dataset.storyUndo){draft.pop();announce('已退回最后一片。');render();focus(`[data-story-pick-act="${actId}"]:not(:disabled)`);return;}
  if(button.dataset.storyClear){draft.length=0;announce('本组纸片已清空，可以重新排列。');render();focus(`[data-story-pick-act="${actId}"]:not(:disabled)`);return;}
  if(button.dataset.storyAssemble){
   if(draft.length!==3)return;busy=true;render();
   try{const result=await onAssemble?.(actId,[...draft]);const updated=statusOf(getState());if(result?.ok===false){announce(safeResult(result),true);}else if(updated.assembledActs.includes(actId)){announce(updated.complete?'十二页已经凝结，回信展开。':`${act.title}已凝结，继续下一组。`);}else announce('这组纸片尚未凝结，请检查顺序后重试。',true);
    busy=false;if(updated.complete){startAnimation();return;}
   }catch{busy=false;announce('暂时未能保存本组，请重新确认。纸片没有消耗。',true);}
   if(dialog.open){render();focus(`[data-story-clear="${actId}"]:not(:disabled)`);if(!dialog.contains(document.activeElement))focus('[data-story-pick]:not(:disabled)');}
  }
 }
 dialog.addEventListener('click',event=>{event.stopPropagation();const b=event.target.closest('button');if(b&&dialog.contains(b))void handleAction(b);});
 dialog.addEventListener('keydown',event=>{
  event.stopPropagation();
  if(event.key==='Escape'){event.preventDefault();close();return;}
  if(event.target.matches('[role="tab"]')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();stopAnimation();tab=event.key==='Home'?'archive':event.key==='End'?'assembly':tab==='archive'?'assembly':'archive';render();focus(`[data-story-tab="${tab}"]`);}
 });
 dialog.addEventListener('keyup',event=>event.stopPropagation());
 dialog.addEventListener('pointerdown',event=>event.stopPropagation());
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 return{
  open(section){
   if(disposed)return;const selected=['archive','assembly'].includes(section);
   if(!dialog.open&&onOpen()===false)return;
   if(selected){stopAnimation();tab=section;}
   if(!dialog.open){priorFocus=document.activeElement;notice='';render();dialog.showModal();focus('[data-story-close]');}else render();
   if(selected&&section==='assembly'){const tabs=dialog.querySelector('.story-book-tabs');dialog.scrollTop+=tabs.getBoundingClientRect().top-dialog.getBoundingClientRect().top-20;}
   else if(selected)dialog.scrollTop=0;
  },
  close,
  refresh(){if(dialog.open&&!busy)render();},
  get isOpen(){return dialog.open;},
  dispose(){if(disposed)return;close();stopAnimation();disposed=true;dialog.remove();},
 };
}
