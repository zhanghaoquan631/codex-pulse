import { useCallback, useEffect, useRef, useState } from 'react';
const BINDING_KEY = 'gallery-quest-account-binding-v1';

export function useAccountSync(game) {
  const gameRef = useRef(game); gameRef.current = game;
  const binding = useRef(null), running = useRef(false), mounted = useRef(false);
  const [user, setUser] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('正在检查账号…');
  const sync = useCallback(async (action = 'auto', override = null) => {
    if (running.current || gameRef.current.pending) return false;
    running.current = true;
    if (mounted.current) setBusy(true);
    const snapshot = gameRef.current.quest;
    try {
      const session = await fetch('/api/quest/state', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (session.status === 401) {
        if (mounted.current) { setUser(null); setEnabled(false); setMessage('未登录：进度暂存在此浏览器'); }
        return false;
      }
      if (!session.ok) throw new Error('账号服务暂不可用，进度仍保存在本地');
      const remote = await session.json();
      if (!remote.user?.key) throw new Error('账号验证失败，本地进度未覆盖');
      if (!mounted.current) return false;
      setUser(remote.user);
      const matching = binding.current?.identity === remote.user.key;
      if (action === 'auto' && !matching) {
        setEnabled(false); setMessage('请确认将本地进度合并到此账号');
        return false;
      }
      if (!['auto', 'import'].includes(action) && !matching) throw new Error('账号已变化，请重新确认合并');
      const accept = record => {
        if (!record?.quest || !record.runId) throw new Error('账号存档格式异常');
        const nextBinding = { identity: remote.user.key, runId: record.runId };
        localStorage.setItem(BINDING_KEY, JSON.stringify(nextBinding));
        binding.current = nextBinding;
        setEnabled(true);
        return record;
      };
      // A reset in another browser starts a new run. Never merge stale old points
      // into it, and never erase the old local snapshot without a recovery copy.
      if (matching && remote.record && binding.current.runId !== remote.record.runId && action !== 'import') {
        const record = accept(remote.record);
        localStorage.setItem('gallery-quest-before-cloud-reset', JSON.stringify(snapshot));
        gameRef.current.acceptCloudQuest(record.quest);
        setMessage('已同步另一浏览器的新一局；原本地进度已留备份');
        return false;
      }
      if (action === 'auto' && matching && !remote.record) {
        setEnabled(false); setMessage('账号存档不存在，请确认重新合并本地进度');
        return false;
      }
      const payload = {
        action: action === 'import' ? 'import' : action === 'reset' ? 'reset' : action === 'lock' ? 'lock' : 'merge',
        expectedIdentity: remote.user.key,
        runId: matching ? binding.current.runId : null,
        quest: action === 'lock' ? snapshot : override || snapshot,
        requestId: action === 'reset' ? crypto.randomUUID() : action === 'lock' ? override.requestId : undefined
      };
      const response = await fetch('/api/quest/state', {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'X-Gallery-Sync': '1' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!mounted.current) return false;
      if (result.accountChanged) { setEnabled(false); binding.current = null; throw new Error('登录账号已变化，请重新确认合并'); }
      if (!response.ok && response.status !== 409) throw new Error(result.error || '同步未完成，进度仍保存在本地');
      if (!result.record) throw new Error(result.error || '账号存档暂不可用');
      const record = accept(result.record);
      // Preserve clicks completed while a request was in flight. The next pass
      // will merge them; do not overwrite those local points with an older reply.
      const unchanged = gameRef.current.quest === snapshot && !gameRef.current.pending;
      if (response.status === 409 || action === 'reset') {
        localStorage.setItem('gallery-quest-before-cloud-reset', JSON.stringify(gameRef.current.quest));
        gameRef.current.acceptCloudQuest(record.quest);
      } else if (unchanged) {
        gameRef.current.acceptCloudQuest(record.quest);
      }
      setMessage(response.status === 409 ? result.conflict : unchanged ? '账号进度已确认保存 · 其他浏览器约 10 秒内更新' : '新增进度待下一次同步，本地已保留');
      return response.ok && (action !== 'lock' || record.quest.hintPurchases?.includes(override.requestId)) && (!override?.redeemed || record.quest.redeemed === override.redeemed);
    } catch (error) {
      if (mounted.current) setMessage(error.name === 'TimeoutError' ? '同步超时，本地进度保留，可重试' : error.message);
      return false;
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    try { binding.current = JSON.parse(localStorage.getItem(BINDING_KEY)); } catch { binding.current = null; }
    sync();
    const interval = setInterval(() => sync(), 10000);
    const focus = () => sync();
    window.addEventListener('focus', focus);
    return () => { mounted.current = false; clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [sync]);
  useEffect(() => { if (enabled && !game.pending) sync(); }, [game.quest, enabled, game.pending, sync]);
  return {
    user, enabled, busy, message, accountBound: Boolean(binding.current),
    connect: () => sync('import'), refresh: () => sync(),
    reset: () => sync('reset'),
    spendLock: requestId => sync('lock', { requestId }),
    redeem: url => sync('merge', { ...gameRef.current.quest, redeemed: url })
  };
}
