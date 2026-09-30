import {STORY_CHAPTERS, STORY_ORDER, STORY_ACTS} from './story-content.mjs';

const chapters = new Map(STORY_ORDER.map(id => [id, STORY_CHAPTERS[id]]));
const acts = new Map(STORY_ACTS.map(act => [act.id, act]));
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isStory = value => isRecord(value) && value.version === 1 && Array.isArray(value.solves) && Array.isArray(value.assembledActs);
const emptyStory = () => ({version: 1, solves: [], assembledActs: [], endingSeen: false, companionEnabled: false});

function validRiddle(chapterId, riddleId) {
  return typeof chapterId === 'string' && typeof riddleId === 'string'
    && Boolean(chapters.get(chapterId)?.riddles.some(riddle => riddle.id === riddleId));
}

function cleanSolves(raw) {
  const seen = new Set(), result = [];
  for (const solve of Array.isArray(raw) ? raw : []) {
    if (!isRecord(solve) || !validRiddle(solve.chapterId, solve.riddleId)) continue;
    const key = `${solve.chapterId}:${solve.riddleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({chapterId: solve.chapterId, riddleId: solve.riddleId});
  }
  return result;
}

function eligibility(solves, completedLevelIds) {
  const collectedIds = new Set(solves.map(solve => solve.chapterId));
  const completedIds = new Set(Array.isArray(completedLevelIds) ? completedLevelIds : []);
  return {
    allFragments: STORY_ORDER.every(id => collectedIds.has(id)),
    // Progress parsing also checks its contiguous prefix. Requiring every chapter
    // here prevents an isolated final-level marker from unlocking the ending.
    finalBossDefeated: STORY_ORDER.every(id => completedIds.has(id)),
  };
}

/** Restore only proven story records; old level completion never invents pages. */
export function normalizeStory(raw, completedLevelIds = []) {
  if (!isRecord(raw) || raw.version !== 1) return emptyStory();
  const solves = cleanSolves(raw.solves);
  const {allFragments, finalBossDefeated} = eligibility(solves, completedLevelIds);
  const assembledActs = allFragments && finalBossDefeated
    ? [...new Set((Array.isArray(raw.assembledActs) ? raw.assembledActs : []).filter(id => acts.has(id)))] : [];
  const endingSeen = assembledActs.length === STORY_ACTS.length;
  return {version: 1, solves, assembledActs, endingSeen, companionEnabled: endingSeen && raw.companionEnabled === true};
}

/** Called only after the current run has actually validated a riddle submission. */
export function recordStorySolve(story, chapterId, riddleId) {
  if (!isStory(story)) return {ok: false, reason: '归途记录格式无效。'};
  if (!validRiddle(chapterId, riddleId)) return {ok: false, reason: '这不是本章已知的谜题。'};
  const solves = cleanSolves(story.solves);
  const fragmentId = chapters.get(chapterId).fragmentId;
  if (solves.some(solve => solve.chapterId === chapterId && solve.riddleId === riddleId)) {
    return {ok: true, added: false, fragmentAdded: false, fragmentId};
  }
  const fragmentAdded = !solves.some(solve => solve.chapterId === chapterId);
  // Do not normalize with missing completion data here: a revisit can solve the
  // alternate riddle after the ending, without erasing acts or companion choice.
  story.solves = [...solves, {chapterId, riddleId}];
  return {ok: true, added: true, fragmentAdded, fragmentId};
}

export function storyStatus(story, completedLevelIds = []) {
  const normalized = normalizeStory(story, completedLevelIds);
  const collectedSet = new Set(normalized.solves.map(solve => solve.chapterId));
  const collectedChapterIds = STORY_ORDER.filter(id => collectedSet.has(id));
  const {allFragments, finalBossDefeated} = eligibility(normalized.solves, completedLevelIds);
  const complete = normalized.endingSeen;
  return {
    collected: collectedChapterIds.length, total: STORY_ORDER.length,
    collectedChapterIds, missingChapterIds: STORY_ORDER.filter(id => !collectedSet.has(id)),
    fragmentIds: collectedChapterIds.map(id => chapters.get(id).fragmentId),
    solves: normalized.solves,
    allFragments, finalBossDefeated, canAssemble: allFragments && finalBossDefeated && !complete,
    complete, endingSeen: complete, companionEnabled: normalized.companionEnabled,
    assembledActs: normalized.assembledActs, assembledCount: normalized.assembledActs.length,
    acts: STORY_ACTS.map(act => ({
      id: act.id, title: act.title, chapterIds: [...act.chapterIds],
      assembled: normalized.assembledActs.includes(act.id),
      ready: allFragments && finalBossDefeated && !normalized.assembledActs.includes(act.id),
    })),
  };
}

/** No fragments are consumed. Bad or incomplete combinations are pure failures. */
export function assembleStoryAct(story, actId, chapterIds, completedLevelIds = []) {
  if (!isStory(story)) return {ok: false, reason: '归途记录格式无效。'};
  const act = acts.get(actId);
  if (!act) return {ok: false, reason: '没有这篇归途记录。'};
  const status = storyStatus(story, completedLevelIds);
  if (!status.allFragments) return {ok: false, reason: '先在十二章现场解谜，收齐十二张归途纸片。'};
  if (!status.finalBossDefeated) return {ok: false, reason: '先完成十二章并击败终章首领，再整理归途簿。'};
  if (!Array.isArray(chapterIds) || chapterIds.length !== act.chapterIds.length
    || !act.chapterIds.every((id, index) => chapterIds[index] === id)) {
    return {ok: false, reason: '顺序还不对。请按本篇线索排列三张纸片；纸片不会被消耗。'};
  }
  if (status.assembledActs.includes(actId)) {
    return {ok: true, added: false, alreadyAssembled: true, complete: status.complete};
  }
  story.assembledActs = [...status.assembledActs, actId];
  const complete = story.assembledActs.length === STORY_ACTS.length;
  story.endingSeen = complete;
  story.companionEnabled = complete;
  return {ok: true, added: true, alreadyAssembled: false, complete};
}

export function setStoryCompanion(story, enabled, completedLevelIds = []) {
  if (!isStory(story)) return {ok: false, reason: '归途记录格式无效。'};
  if (typeof enabled !== 'boolean') return {ok: false, reason: '请选择召出或收起纸鹤。'};
  if (!storyStatus(story, completedLevelIds).complete) return {ok: false, reason: '先完成归途簿的四篇合成，才能召出纸鹤。'};
  story.companionEnabled = enabled;
  return {ok: true, enabled};
}
