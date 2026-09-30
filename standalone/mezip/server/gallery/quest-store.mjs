import { newQuest, restoreQuest, purchaseLock, questBalance } from './galleryQuest.mjs';

// These URL strings are persisted IDs, not deployment URLs. Do not prefix them.
export const questImages = [
  ...Array.from({ length: 56 }, (_, i) => ({ url: '/wechat-0327/wechat-0327-' + String(i + 1).padStart(3, '0') + '.jpg' })),
  ...Array.from({ length: 89 }, (_, i) => ({ url: '/wechat-0051/wechat-0051-' + String(i + 1).padStart(3, '0') + '.jpg' })),
  ...Array.from({ length: 75 }, (_, i) => ({ url: '/original-image-library/card-' + String(i + 1).padStart(3, '0') + '.png' })),
];

export const publicRecord = record => record ? {
  runId: record.runId, revision: record.revision, quest: record.quest, updatedAt: record.updatedAt,
} : null;

export function mergeQuestProgress(serverQuest, localQuest) {
  const cleared = serverQuest.order.filter(url => serverQuest.cleared.includes(url) || localQuest.cleared.includes(url));
  const purchases = [...new Set([...(serverQuest.hintPurchases || []), ...(localQuest.hintPurchases || [])])];
  return { ...serverQuest, cleared, ...(purchases.length ? { hintPurchases: purchases } : {}), redeemed: serverQuest.redeemed || localQuest.redeemed || null };
}

// Same transition ordering/validation as the original filesystem quest store.
// Conflict returns must include the current public record for useAccountSync.
export function transitionQuest(previous, input) {
  const conflict = reason => ({ conflict: reason, record: publicRecord(previous) });
  if (!['import', 'merge', 'reset', 'redeem', 'lock'].includes(input.action)) throw new Error('invalid action');
  if (previous && input.action === 'reset' && previous.resetId === input.requestId) return { record: publicRecord(previous), unchanged: true };
  if (previous && input.action !== 'import' && input.runId !== previous.runId) return conflict('游戏已在另一浏览器重新开始，已读取最新一局');
  if (!previous && input.action !== 'import') return conflict('账号尚无存档，请先合并本地进度');
  let quest;
  if (input.action === 'redeem') {
    if (!previous || (!previous.quest.redeemed && questBalance(previous.quest) < 220)) return conflict('账号积分不足 220，或画廊进度尚未同步');
    if (!previous.quest.order.includes(input.url)) throw new Error('invalid reward');
    if (previous.quest.redeemed && previous.quest.redeemed !== input.url) return conflict('本局已兑换另一张卡片，可以重新下载已兑换卡片');
    quest = { ...previous.quest, redeemed: input.url };
  } else if (input.action === 'lock') {
    if (typeof input.requestId !== 'string' || input.requestId.length < 8 || input.requestId.length > 100) throw new Error('lock request id required');
    const local = restoreQuest(JSON.stringify(input.quest), questImages);
    if (!local) throw new Error('invalid quest');
    quest = purchaseLock(mergeQuestProgress(previous.quest, local), input.requestId);
    if (!quest) return conflict('可用积分不足 2 分，未扣分');
  } else if (input.action === 'reset') {
    if (typeof input.requestId !== 'string' || input.requestId.length < 8) throw new Error('reset request id required');
    quest = newQuest(questImages);
  } else {
    quest = restoreQuest(JSON.stringify(input.quest), questImages);
    if (!quest) throw new Error('invalid quest');
    if (previous) {
      if (previous.quest.redeemed && quest.redeemed && previous.quest.redeemed !== quest.redeemed) return conflict('此账号已兑换另一张卡片，已读取账号兑换结果');
      quest = mergeQuestProgress(previous.quest, quest);
    }
  }
  if (!restoreQuest(JSON.stringify(quest), questImages)) return conflict('积分已变化，无法完成此次操作，请同步后重试');
  if (previous && input.action !== 'reset' && JSON.stringify(quest) === JSON.stringify(previous.quest)) return { record: publicRecord(previous), unchanged: true };
  return { next: {
    runId: !previous || input.action === 'reset' ? crypto.randomUUID() : previous.runId,
    revision: (previous?.revision || 0) + 1,
    quest,
    updatedAt: new Date().toISOString(),
    resetId: input.action === 'reset' ? input.requestId : previous?.resetId,
    history: input.action === 'reset' ? [...(previous?.history || []), publicRecord(previous)].slice(-20) : (previous?.history || []),
  } };
}

function decodeRecord(row) {
  if (!row) return null;
  const quest = restoreQuest(row.quest_json, questImages);
  const history = JSON.parse(row.history_json);
  if (!quest || !Array.isArray(history) || !row.run_id || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('invalid stored quest');
  return { runId: row.run_id, revision: row.revision, quest, updatedAt: row.updated_at, resetId: row.reset_id ?? undefined, history };
}

export class GalleryStoreBusyError extends Error {}

export function createQuestStore(database) {
  const primary = () => typeof database.withSession === 'function' ? database.withSession('first-primary') : database;
  const read = async (db, key) => decodeRecord(await db.prepare(
    'SELECT run_id, revision, quest_json, reset_id, history_json, updated_at FROM gallery_quest_accounts WHERE owner_key = ?',
  ).bind(key).first());
  return {
    get: async key => publicRecord(await read(primary(), key)),
    apply: async (key, input) => {
      const db = primary();
      // CAS, not a process-local promise queue: different Worker isolates can race.
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const previous = await read(db, key);
        const result = transitionQuest(previous, input);
        if (!result.next) return { ...(result.conflict ? { conflict: result.conflict } : {}), record: result.record };
        const next = result.next;
        const values = [next.runId, next.revision, JSON.stringify(next.quest), next.resetId ?? null, JSON.stringify(next.history), next.updatedAt];
        const saved = previous
          ? await db.prepare(`UPDATE gallery_quest_accounts SET run_id = ?, revision = ?, quest_json = ?, reset_id = ?, history_json = ?, updated_at = ?
              WHERE owner_key = ? AND revision = ? AND run_id = ?`).bind(...values, key, previous.revision, previous.runId).run()
          : await db.prepare(`INSERT INTO gallery_quest_accounts (run_id, revision, quest_json, reset_id, history_json, updated_at, owner_key)
              VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_key) DO NOTHING`).bind(...values, key).run();
        if (saved.meta?.changes === 1) return { record: publicRecord(next) };
        // Another writer won: re-read and re-apply the transition to its result.
      }
      throw new GalleryStoreBusyError('quest busy, retry with the same requestId');
    },
  };
}
