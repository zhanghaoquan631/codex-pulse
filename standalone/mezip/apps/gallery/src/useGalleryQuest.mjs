import { useCallback, useEffect, useRef, useState } from 'react';
import { QUEST_KEY, QUEST_TOTAL, newQuest, restoreQuest, matchGalleryCards, nearestGalleryCard } from './galleryQuest.mjs';

// Opening, restarting, and finishing a pair all select the reference automatically.
// This reference defines the required image; BOTH physical cards need a click.
export function useAutoGalleryTarget(game, cards, origin, images, imageSize = 14) {
  const { active, target, anchor, pending, quest, lock } = game;
  useEffect(() => {
    if (!active || target || pending || quest.cleared.length === QUEST_TOTAL || !cards.length) return;
    const from = anchor || origin;
    const inFront = !anchor ? cards.filter(card => card.pz < origin.pz - 1) : cards;
    let next = nearestGalleryCard(inFront, from, quest) || nearestGalleryCard(cards, from, quest);
    if (!next) {
      const url = quest.order.find(url => !quest.cleared.includes(url));
      const media = images.find(image => image.url === url);
      if (!media) return;
      next = { id: 'remaining:' + url, url, media, px: from.px + 24, py: from.py + 5, pz: from.pz - 30, size: imageSize, scaleX: imageSize * media.width / media.height, scaleY: imageSize };
    }
    lock(next);
  }, [active, target, anchor, pending, quest, lock, cards, origin.px, origin.py, origin.pz, images, imageSize]);
}

export function useGalleryQuest(images) {
  const [quest, setQuest] = useState(() => {
    try { return restoreQuest(localStorage.getItem(QUEST_KEY), images) || newQuest(images); }
    catch { return newQuest(images); }
  });
  const [active, setActive] = useState(false);
  const [target, setTarget] = useState(null);
  const [picked, setPicked] = useState(null);
  const [searching, setSearching] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [anchor, setAnchor] = useState(null);
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState('两张相同图片各点一次，才会一起回收并加 1 分。');
  const [saveStatus, setSaveStatus] = useState('');
  const interactionBusy = useRef(false);
  const setInteractionBusy = value => { interactionBusy.current = value; };
  const timer = useRef(), busy = useRef(false), selected = useRef(null), clicked = useRef(null);
  const lock = useCallback(card => { selected.current = card; clicked.current = null; setTarget(card); setPicked(null); setFocusRequest(value => value + 1); }, []);
  const cancel = useCallback(() => { clearTimeout(timer.current); busy.current = false; setPending(null); setSearching(false); setCandidate(null); lock(null); setAnchor(null); }, [lock]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    try { localStorage.setItem(QUEST_KEY, JSON.stringify(quest)); setSaveStatus('进度仅保存在此浏览器'); }
    catch { setSaveStatus('进度未保存，请勿刷新'); }
  }, [quest]);
  const open = () => { cancel(); setActive(true); setNotice('本轮只配左上角指定图片。找到画廊里两张相同的，各点一次才加分。'); };
  const close = () => { cancel(); setActive(false); };
  const restart = () => { cancel(); setQuest(newQuest(images)); setNotice('已重新开始。两张相同图片各点一次，才消除并加分。'); };
  const acceptCloudQuest = next => {
    if (!restoreQuest(JSON.stringify(next), images)) return;
    if (JSON.stringify(next) === JSON.stringify(quest)) return;
    // Balance-only acknowledgements must not change the selected target.
    if (next.seed !== quest.seed || JSON.stringify(next.order) !== JSON.stringify(quest.order) || (selected.current && next.cleared.includes(selected.current.url))) cancel();
    setQuest(next);
  };
  const pick = card => {
    if (!active || busy.current || interactionBusy.current) return;
    if (!quest.order.includes(card.url)) { setNotice('这张是示例图片；请选你的 220 张个人图片。'); return; }
    if (quest.cleared.includes(card.url)) return;
    const reference = selected.current;
    if (!reference) { setNotice('正在准备指定图片，请稍候。'); return; }
    if (reference.url !== card.url) {
      setNotice('点击已收到，但这不是左上角指定图片。本轮目标不变，已点选的图片保留。');
      return;
    }
    const first = clicked.current;
    if (!first) {
      clicked.current = card; setPicked(card);
      setNotice('已点选 1 / 2 张指定图片。请点另一张相同图片，才会消除并加分。');
      return;
    }
    if (first.id === card.id) { setNotice('这张已经点过了，重复点同一张不计分；请点另一张相同图片。'); return; }
    busy.current = true;
    setPending(card.url);
    setNotice('配对成功，+1 分！两张消失后，自动锁定距离它最近的下一张。');
    timer.current = setTimeout(() => {
      setQuest(current => matchGalleryCards(current, first, card));
      lock(null); setAnchor(card); setPending(null); busy.current = false;
    }, 420);
  };
  const startSearch = () => {
    if (!active || pending || busy.current) return;
    setSearching(true);
    setCandidate(null);
    setNotice(clicked.current
      ? '追寻已开启：第一张已选好。点击卡片移动视野，找到另一张后再确认目标。'
      : '追寻已开启：点击任意卡片，视野会平滑靠近它；确认后再提交目标。');
  };
  const stopSearch = () => {
    setSearching(false);
    setCandidate(null);
    setNotice('已结束追寻，可以继续按目标图片配对。');
  };
  const inspect = card => {
    if (!active || !searching || pending || busy.current || !card) return;
    setCandidate(card);
    setNotice('正在靠近这张卡片。可以继续点别的卡片追寻；确定后点击“确认目标”。');
  };
  const confirmCandidate = () => {
    if (!candidate || !searching || pending || busy.current) return;
    const selectedCard = candidate;
    if (selected.current?.url !== selectedCard.url) {
      setCandidate(null);
      setNotice('目标不正确，没有计分也没有消除。追寻仍在开启，请重新寻找。');
      return;
    }
    const first = clicked.current;
    setCandidate(null);
    if (first?.id === selectedCard.id) {
      setNotice('这是刚才已经确认过的同一张卡片。追寻仍在开启，请寻找另一张相同图片。');
      return;
    }
    pick(selectedCard);
    if (!first) {
      setSearching(true);
      setNotice('第一张目标正确，已选中。继续追寻另一张相同图片，再次点击“确认目标”。');
    } else {
      setSearching(false);
    }
  };
  return { quest, setQuest, setInteractionBusy, active, target, picked, searching, candidate, focusRequest, anchor, pending, notice, setNotice, saveStatus, lock, pick, startSearch, stopSearch, inspect, confirmCandidate, open, close, restart, acceptCloudQuest };
}
