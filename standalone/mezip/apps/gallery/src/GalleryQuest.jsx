import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { QUEST_KEY, QUEST_TOTAL, PAIRS_PER_STAGE, newQuest, restoreQuest, stageCards, matchQuest, redeemQuest } from './galleryQuest.mjs';
import './galleryQuest.css';

function QuestField({ Plane, board, pending, onPick, images }) {
  const { camera, size } = useThree();
  const controller = useRef({ focusTarget: null });
  const narrow = size.width < 700;
  const cols = narrow ? 3 : 4, rows = Math.ceil(PAIRS_PER_STAGE * 2 / cols);
  const gapX = narrow ? 11 : 14, gapY = narrow ? 11.5 : 14;
  const aspect = size.width / size.height;
  const usableHeight = Math.max(.3, (size.height - (narrow ? 260 : 215)) / size.height);
  const distance = Math.max((rows * gapY) / usableHeight, (cols * gapX + 6) / aspect) / (2 * Math.tan(Math.PI / 6));
  const baseZ = -board.stage * 90;
  const shiftY = narrow ? -2 : 0;
  useFrame((_, dt) => {
    const a = 1 - Math.exp(-dt * 5);
    camera.position.x += (0 - camera.position.x) * a;
    camera.position.y += (shiftY - camera.position.y) * a;
    camera.position.z += (baseZ + distance + 5 - camera.position.z) * a;
  });
  const media = useMemo(() => new Map(images.map(image => [image.url, image])), [images]);
  return board.cards.map(card => (
    <Plane key={card.id} media={media.get(card.url)}
      info={{ id: card.id, px: ((card.slot % cols) - (cols - 1) / 2) * gapX + card.dx * 1.2, py: ((rows - 1) / 2 - Math.floor(card.slot / cols)) * gapY + card.dy * 1.2, pz: baseZ + card.depth, size: narrow ? 9.3 : 11.5 }}
      controllerRef={controller} cellSize={10000} viewRange={2} imageRadius={.08}
      questStatus={pending?.url === card.url ? 'removing' : board.target?.id === card.id ? 'target' : 'card'}
      onFocus={() => onPick(card)} />
  ));
}

export default function GalleryQuest({ images, Plane, onClose }) {
  const [quest, setQuest] = useState(() => {
    try { return restoreQuest(localStorage.getItem(QUEST_KEY), images) || newQuest(images); }
    catch { return newQuest(images); }
  });
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState('最前方的紫色卡片已选中，直接点击另一张相同的图片。');
  const [saveStatus, setSaveStatus] = useState('');
  const [rewardOpen, setRewardOpen] = useState(false);
  const [choice, setChoice] = useState(quest.redeemed || images[0].url);
  const [downloading, setDownloading] = useState(false);
  const timer = useRef(), busy = useRef(false), mounted = useRef(true);
  const board = useMemo(() => stageCards(quest), [quest]);
  const won = quest.cleared.length === QUEST_TOTAL;
  useEffect(() => {
    try { localStorage.setItem(QUEST_KEY, JSON.stringify(quest)); setSaveStatus('进度已保存在此浏览器'); }
    catch { setSaveStatus('浏览器未能保存进度，请勿刷新'); }
  }, [quest]);
  useEffect(() => () => { mounted.current = false; clearTimeout(timer.current); }, []);

  function pick(card) {
    if (busy.current || !board.target) return;
    if (card.id === board.target.id) { setNotice('这张是当前目标，点击另一张相同图片即可消除。'); return; }
    if (card.url !== board.target.url) { setNotice('这两张不相同，再找找。此模式答错不扣分。'); return; }
    busy.current = true;
    setPending({ url: card.url });
    setNotice('配对成功，+1 分！这张图片本局不再出现。');
    const firstId = board.target.id, secondId = card.id;
    timer.current = setTimeout(() => {
      setQuest(current => matchQuest(current, firstId, secondId));
      setPending(null); busy.current = false;
    }, 460);
  }

  function restart() {
    clearTimeout(timer.current); busy.current = false; setPending(null); setRewardOpen(false);
    setQuest(newQuest(images)); setNotice('已从 0 分重新开始，全部 220 组图片重新洗牌。');
  }

  async function downloadReward() {
    if (downloading || !won) return;
    const url = quest.redeemed || choice;
    const next = redeemQuest(quest, url);
    if (next === quest && quest.redeemed !== url) return;
    setDownloading(true);
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('image unavailable');
      const blob = await response.blob();
      if (!mounted.current) return;
      // Keep the entitlement before offering the file; the same image can be retried.
      localStorage.setItem(QUEST_KEY, JSON.stringify(next));
      setQuest(next);
      const objectUrl = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = objectUrl; link.download = `我的通关卡片-${url.split('/').pop()}`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      setNotice('已兑换这张卡片并发起下载；若未保存，可再次下载同一张。');
    } catch { if (mounted.current) setNotice('下载未能发起，请重试。积分尚未扣除。'); }
    finally { if (mounted.current) setDownloading(false); }
  }

  return <section className="gallery-quest" aria-label="画廊直接配对闯关">
    <Canvas camera={{ position: [0, 0, -board.stage * 90 + 100], fov: 60, near: .1, far: 1000 }} dpr={Math.min(devicePixelRatio || 1, 1.5)} flat gl={{ antialias: false }}>
      <color attach="background" args={['#050408']} />
      <QuestField Plane={Plane} board={board} pending={pending} onPick={pick} images={images} />
    </Canvas>
    <header className="quest-hud">
      <div><span className="quest-kicker">GALLERY QUEST · 220</span><h1>画廊闯关</h1></div>
      <div className="quest-score"><strong>{quest.cleared.length}<small> / 220</small></strong><span>已完成配对 · 每组 1 分</span></div>
      <nav><button onClick={restart} disabled={downloading}>重新开始</button><button onClick={onClose} disabled={downloading}>关闭游戏</button></nav>
      <progress value={quest.cleared.length} max={220} aria-label="通关进度" />
    </header>
    {!won && <aside className="quest-target">
      <img src={board.target.url} alt="本关最前方的目标图片" /><div><strong>寻找这张图片的另一张</strong><span>第 {board.stage + 1} / {Math.ceil(220 / PAIRS_PER_STAGE)} 段 · 剩余 {220 - quest.cleared.length} 组</span></div>
    </aside>}
    <footer className="quest-footer"><p role="status">{notice}</p><small>{saveStatus} · 关闭后可继续 · 重新开始会清零本局</small></footer>
    {won && <div className="quest-win">
      <span className="quest-kicker">ALL MOMENTS FOUND</span><h2>220 次相遇，全部找到。</h2>
      <p>你已消除全部 440 张配对卡，累计获得 220 积分。</p>
      <p>可用积分：{quest.redeemed ? 0 : 220} · 可兑换一张个人卡片</p>
      <button onClick={() => { setChoice(quest.redeemed || images[0].url); setRewardOpen(true); }}>{quest.redeemed ? '查看已兑换卡片' : '220 积分 · 选择卡片下载'}</button>
      <button onClick={restart}>再玩一次</button>
    </div>}
    {rewardOpen && <section className="quest-rewards" role="dialog" aria-modal="true" aria-label="选择通关卡片" onKeyDown={e => { if(e.key === 'Escape' && !downloading) setRewardOpen(false); }}>
      <header><div><h2>{quest.redeemed ? '你的通关卡片' : '选一张，带走这次相遇。'}</h2><p>{quest.redeemed ? '已使用 220 积分兑换；同一张可重新下载。' : '从 220 张个人图片中任选一张，兑换后扣除 220 积分。'}</p></div><button onClick={() => setRewardOpen(false)} disabled={downloading}>关闭</button></header>
      <div className="quest-reward-grid">{(quest.redeemed ? images.filter(image => image.url === quest.redeemed) : images).map((image, index) => <button key={image.url} className={choice === image.url ? 'chosen' : ''} aria-pressed={choice === image.url} aria-label={`选择卡片 ${index + 1}`} onClick={() => setChoice(image.url)} disabled={downloading}>
        <img loading="lazy" src={image.url} alt={`个人卡片 ${index + 1}`} /><span>{String(index + 1).padStart(3, '0')}</span>
      </button>)}</div>
      <footer><p role="status">{notice}</p><button autoFocus onClick={downloadReward} disabled={downloading}>{downloading ? '正在准备图片…' : quest.redeemed ? '重新下载已兑换卡片' : '兑换所选卡片并下载 · 220 分'}</button></footer>
    </section>}
  </section>;
}
