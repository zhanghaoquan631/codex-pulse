import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QUEST_KEY, QUEST_TOTAL, redeemQuest, purchaseLock, questBalance } from './galleryQuest.mjs';
export { useGalleryQuest } from './useGalleryQuest.mjs';
import './galleryQuest.css';
import AccountSync from './AccountSync.jsx';

// HUD only: all clicks, cards and camera remain in the original InfiniteField.
export default function LiveGalleryQuest({ game, cloud, images, onLocate, onHint, controlsHost, navigationRef }) {
  const { quest, target, notice, setNotice, saveStatus, searching, candidate } = game;
  const [rewardOpen, setRewardOpen] = useState(false);
  const [choice, setChoice] = useState(quest.redeemed || images[0].url);
  const [downloading, setDownloading] = useState(false);
  const [hintReady, setHintReady] = useState(false);
  const [locking, setLocking] = useState(false);
  const lockRequest = useRef(null), lockBusy = useRef(false);
  const balance = questBalance(quest);
  const currentGame = useRef(game); currentGame.current = game;
  async function autoLock() {
    if (lockBusy.current || cloud.busy || game.pending) return;
    const destination = navigationRef.current?.getLock();
    if (!destination) { setNotice('目标尚未准备好，未扣分。'); return; }
    if (balance < 2 && !lockRequest.current) { setNotice('自动锁定需要 2 积分，当前积分不足。'); return; }
    lockBusy.current = true; game.setInteractionBusy(true); setLocking(true);
    const requestId = lockRequest.current || crypto.randomUUID();
    lockRequest.current = requestId;
    try {
      if (cloud.enabled || cloud.accountBound) {
        if (!await cloud.spendLock(requestId)) { setNotice('锁定未获账号确认，请同步后重试；重试不会重复扣分。'); return; }
      } else {
        const next = purchaseLock(currentGame.current.quest, requestId);
        if (!next) { setNotice('可用积分不足 2 分，未扣分。'); return; }
        localStorage.setItem(QUEST_KEY, JSON.stringify(next));
        game.setQuest(next);
      }
      lockRequest.current = null;
      if (mounted.current && currentGame.current.active && currentGame.current.target?.id === destination.targetId) {
        navigationRef.current?.lock(destination);
        setNotice('已扣 2 积分并锁定图片。仍需两张分别点击完成配对。');
      }
    } catch { setNotice('锁定未完成，请重试；同一次请求不会重复扣分。'); }
    finally { lockBusy.current = false; game.setInteractionBusy(false); if (mounted.current) setLocking(false); }
  }
  const busy = useRef(false), mounted = useRef(true);
  const won = quest.cleared.length === QUEST_TOTAL;
  const restart = () => { setRewardOpen(false); if (cloud.enabled || cloud.accountBound) cloud.reset(); else game.restart(); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; game.setInteractionBusy(false); }; }, []);
  useEffect(() => {
    setHintReady(false);
    if (!target) return;
    const timer = setTimeout(() => setHintReady(true), 15000);
    return () => clearTimeout(timer);
  }, [target?.id, quest.seed]);
  async function downloadReward() {
    if (busy.current || !won) return;
    const url = quest.redeemed || choice, next = redeemQuest(quest, url);
    if (next === quest && quest.redeemed !== url) return;
    busy.current = true; setDownloading(true);
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('image unavailable');
      const blob = await response.blob();
      if (!mounted.current) return;
      if (cloud.enabled || cloud.accountBound) {
        if (!await cloud.redeem(url)) throw new Error('account redemption not acknowledged');
      } else {
        localStorage.setItem(QUEST_KEY, JSON.stringify(next));
        game.setQuest(next);
      }
      if (!mounted.current) return;
      const objectUrl = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = objectUrl; link.download = '我的通关卡片-' + url.split('/').pop();
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      setNotice('已兑换并发起下载；若未保存，可以再次下载同一张。');
    } catch { if (mounted.current) setNotice('未能发起下载，请重试。'); }
    finally { busy.current = false; if (mounted.current) setDownloading(false); }
  }
  return <section className="gallery-quest quest-in-scene" aria-label="原画廊直接配对">
    <header className="quest-hud">
      <div><span className="quest-kicker">指定图片配对</span><h1>画廊探索配对</h1></div>
      <div className="quest-score"><strong>{balance}<small> 积分</small></strong><span>已配对 {quest.cleared.length} / 220</span></div>
      {controlsHost && createPortal(<div className="quest-settings-actions"><nav><button onClick={restart} disabled={downloading || locking || cloud.busy}>重新开始</button><button onClick={game.close} disabled={downloading || locking}>关闭游戏</button></nav><AccountSync cloud={cloud} /></div>, controlsHost)}
      <progress value={quest.cleared.length} max={220} aria-label="通关进度" />
    </header>
    {!won && <aside className="quest-target">
      {target && <img src={target.url} alt="已锁定的画廊图片" />}
      <div>
        <strong>{target ? game.pending ? '已点选 2 / 2 · 正在回收' : game.picked ? '已点选 1 / 2 · 再点另一张' : searching ? '追寻中 · 点击任意卡片查看' : '目标 · 已选 0 / 2' : '正在自动选定目标图片…'}</strong>
        <span>{searching ? '点卡片会平滑靠近；可以连续追寻，确认后才判断。' : '找到这张图的两张卡片，各点一次'}</span>
        <span>剩余 {220 - quest.cleared.length} 组</span>
        {target && <div className="quest-search-actions">
          <button onClick={onLocate}>回到目标</button>
          <button onClick={searching ? game.stopSearch : game.startSearch} disabled={Boolean(game.pending)}>{searching ? '结束追寻' : '追寻'}</button>
          {searching && candidate && <button className="quest-confirm-target" onClick={game.confirmCandidate} disabled={Boolean(game.pending)}>确认目标</button>}
          <button onClick={onHint} disabled={!hintReady || Boolean(game.pending) || searching} title={!hintReady ? '每轮寻找 15 秒后可查看方向，不会自动跳到答案' : '只提示大致方向，不显示位置'}>{hintReady ? '方向提示' : '提示 · 15秒后'}</button>
          <button onClick={autoLock} disabled={locking || cloud.busy || Boolean(game.pending) || searching || (balance < 2 && !lockRequest.current)}>{locking ? '锁定中…' : '自动锁定 · 2分'}</button>
        </div>}
        {searching && candidate && <div className="quest-search-candidate"><img src={candidate.media?.url || candidate.url} alt="当前查看的卡片" /><span>当前候选：继续追寻，或点击“确认目标”判断</span></div>}
      </div>
    </aside>}
    <footer className="quest-footer"><p role="status">{notice}</p><small>{cloud.enabled ? cloud.message : saveStatus} · 关闭可继续 · 重开清零</small></footer>
    {won && <div className="quest-win"><span className="quest-kicker">ALL MOMENTS FOUND</span><h2>220 次相遇，全部找到。</h2><p>220 组图片已全部消除，累计获得 220 积分，锁定已使用 {(quest.hintPurchases?.length || 0) * 2} 分。</p><p>可用积分：{balance}</p><button disabled={!quest.redeemed && balance < 220} onClick={() => { setChoice(quest.redeemed || images[0].url); setRewardOpen(true); }}>{quest.redeemed ? '查看已兑换卡片' : '220 积分 · 选择卡片下载'}</button><button onClick={restart} disabled={cloud.busy}>再玩一次</button></div>}
    {rewardOpen && <section className="quest-rewards" role="dialog" aria-modal="true" aria-label="选择通关卡片" onKeyDown={e => { if (e.key === 'Escape' && !downloading) setRewardOpen(false); }}>
      <header><div><h2>{quest.redeemed ? '你的通关卡片' : '选一张，带走这次相遇。'}</h2><p>{quest.redeemed ? '已兑换；同一张可重新下载。' : '从 220 张个人图片任选一张，兑换扣除 220 分。'}</p></div><button onClick={() => setRewardOpen(false)} disabled={downloading}>关闭</button></header>
      <div className="quest-reward-grid">{(quest.redeemed ? images.filter(image => image.url === quest.redeemed) : images).map((image, index) => <button key={image.url} className={choice === image.url ? 'chosen' : ''} aria-pressed={choice === image.url} aria-label={'选择卡片 ' + (index + 1)} onClick={() => setChoice(image.url)} disabled={downloading}><img loading="lazy" src={image.url} alt={'个人卡片 ' + (index + 1)} /><span>{String(index + 1).padStart(3, '0')}</span></button>)}</div>
      <footer><p role="status">{notice}</p><button autoFocus onClick={downloadReward} disabled={downloading}>{downloading ? '正在准备图片…' : quest.redeemed ? '重新下载已兑换卡片' : '兑换所选卡片并下载 · 220 分'}</button></footer>
    </section>}
  </section>;
}
