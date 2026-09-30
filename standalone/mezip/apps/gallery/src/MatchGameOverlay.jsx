import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMAIL_STORAGE_KEY = 'infinite-gallery-game-email';
const PAIR_COUNT = 10;

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [next[index], next[other]] = [next[other], next[index]];
  }
  return next;
}

function buildDeck(images) {
  const localImages = images.filter(image => image.url.startsWith('/'));
  const source = localImages.length >= PAIR_COUNT ? localImages : images;
  const pairs = shuffle(source).slice(0, Math.min(PAIR_COUNT, Math.floor(source.length)));
  return shuffle(pairs.flatMap((media, pairIndex) => [
    { id: `${pairIndex}-a-${media.url}`, pairId: pairIndex, media },
    { id: `${pairIndex}-b-${media.url}`, pairId: pairIndex, media },
  ]));
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function MatchGameOverlay({ images, onClose }) {
  const [email, setEmail] = useState(() => window.localStorage.getItem(EMAIL_STORAGE_KEY) || '');
  const [cards, setCards] = useState(() => buildDeck(images));
  const [selected, setSelected] = useState([]);
  const [wrong, setWrong] = useState([]);
  const [resolving, setResolving] = useState(false);
  const [score, setScore] = useState(null);
  const [notice, setNotice] = useState('从任意一张卡开始，连续找出相同画面。');
  const timeoutRef = useRef();
  const validEmail = isEmail(email);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const wrongSet = useMemo(() => new Set(wrong), [wrong]);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!validEmail) {
      setScore(null);
      return undefined;
    }
    const normalized = email.trim().toLowerCase();
    window.localStorage.setItem(EMAIL_STORAGE_KEY, normalized);
    let active = true;
    fetch(`/api/game/score?email=${encodeURIComponent(normalized)}`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('score unavailable')))
      .then(next => { if (active) setScore(next); })
      .catch(() => { if (active) setNotice('邮箱积分暂时无法读取；本局仍可继续。'); });
    return () => { active = false; };
  }, [email, validEmail]);

  const newRound = useCallback(() => {
    clearTimer();
    setCards(buildDeck(images));
    setSelected([]);
    setWrong([]);
    setResolving(false);
    setNotice('已重新洗牌：找出两张相同画面。');
  }, [clearTimer, images]);

  const record = useCallback((delta, outcome) => {
    const normalized = email.trim().toLowerCase();
    if (!isEmail(normalized)) return;
    setScore(previous => previous ? {
      ...previous,
      score: previous.score + delta,
      correct: previous.correct + (outcome === 'correct' ? 1 : 0),
      wrong: previous.wrong + (outcome === 'wrong' ? 1 : 0),
    } : previous);
    fetch('/api/game/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized, delta, outcome }),
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('score save failed')))
      .then(next => setScore(next))
      .catch(() => setNotice('本次分数未写入邮箱记录，请确认网络后再试。'));
  }, [email]);

  const selectCard = useCallback((card) => {
    if (resolving || selectedSet.has(card.id)) return;
    if (!validEmail) {
      setNotice('请先输入登录邮箱，积分才会保存到你的账号。');
      return;
    }
    if (selected.length === 0) {
      setSelected([card.id]);
      setNotice('再选一张相同的画面。');
      return;
    }
    const first = cards.find(item => item.id === selected[0]);
    if (!first) {
      setSelected([card.id]);
      return;
    }
    const pairIds = [first.id, card.id];
    setSelected(pairIds);
    setResolving(true);
    if (first.pairId === card.pairId) {
      setNotice('配对成功，+1。已消除的卡片让后面的画面向前补位。');
      record(1, 'correct');
      timeoutRef.current = window.setTimeout(() => {
        setCards(current => current.filter(item => !pairIds.includes(item.id)));
        setSelected([]);
        setResolving(false);
      }, 520);
      return;
    }
    setWrong(pairIds);
    setNotice('配对错误，−3。两张卡会翻回去，从后面第三张继续。');
    record(-3, 'wrong');
    timeoutRef.current = window.setTimeout(() => {
      setSelected([]);
      setWrong([]);
      setResolving(false);
    }, 900);
  }, [cards, record, resolving, selected, selectedSet, validEmail]);

  const cleared = cards.length === 0;
  return (
    <section className="match-game-overlay" aria-label="相同图片配对游戏">
      <div className="match-game-shell">
        <header className="match-game-header">
          <div>
            <p className="match-game-kicker">IMAGE MATCH · 5235</p>
            <h1>相同画面配对</h1>
            <p className="match-game-rules">同图相消 +1；找错 −3。正确卡片消失后，后面的卡片会向前补位。</p>
          </div>
          <button type="button" className="match-game-close" onClick={onClose}>关闭游戏</button>
        </header>

        <div className="match-game-toolbar">
          <label className="match-game-email">
            <span>登录邮箱</span>
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" />
          </label>
          <div className="match-game-score" aria-live="polite">
            <span>积分</span><strong>{score ? score.score : '—'}</strong>
            <small>{score ? `正确 ${score.correct} · 错误 ${score.wrong}` : '输入邮箱后读取记录'}</small>
          </div>
          <button type="button" className="match-game-reset" onClick={newRound}>换一局</button>
        </div>

        <p className="match-game-notice" aria-live="polite">{notice}</p>

        {cleared ? (
          <div className="match-game-complete">
            <p>这一轮的画面已经全部相消。</p>
            <button type="button" onClick={newRound}>重新洗牌</button>
          </div>
        ) : (
          <div className="match-game-grid">
            {cards.map((card, index) => {
              const isSelected = selectedSet.has(card.id);
              const isWrong = wrongSet.has(card.id);
              return (
                <button
                  type="button"
                  key={card.id}
                  className={`match-card${isSelected ? ' is-selected' : ''}${isWrong ? ' is-wrong' : ''}`}
                  onClick={() => selectCard(card)}
                  disabled={resolving}
                  aria-label={`第 ${index + 1} 张配对卡`}
                >
                  <img src={card.media.url} alt="" />
                  <span>{String(index + 1).padStart(2, '0')}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
