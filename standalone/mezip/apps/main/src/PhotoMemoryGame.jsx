import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './PhotoMemoryGame.css';

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function normalizeImages(images) {
  const seen = new Set();
  return (Array.isArray(images) ? images : []).filter((image) => {
    if (!image?.src || seen.has(image.src)) return false;
    seen.add(image.src);
    return true;
  });
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

export default function PhotoMemoryGame({ images = [] }) {
  const availableImages = useMemo(() => normalizeImages(images), [images]);
  const imageSignature = JSON.stringify(availableImages.map((image) => image.src));
  const imagesRef = useRef(availableImages);
  imagesRef.current = availableImages;

  const [cards, setCards] = useState([]);
  const [openCards, setOpenCards] = useState([]);
  const [matchedCards, setMatchedCards] = useState([]);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [won, setWon] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [cloudStatus, setCloudStatus] = useState('正在读取游戏记录…');
  const [cloudReady, setCloudReady] = useState(false);
  const cloudRef = useRef({ identity:null, revision:0, busy:false, pending:null, failed:false });
  const latestRef = useRef(null);
  const loadedRef = useRef(false);

  const cardsRef = useRef([]);
  const openRef = useRef([]);
  const matchedRef = useRef(new Set());
  const lockedRef = useRef(false);
  const resetTimeoutRef = useRef(null);
  const intervalRef = useRef(null);
  const runningSinceRef = useRef(null);
  const elapsedMsRef = useRef(0);
  const hasStartedRef = useRef(false);
  const hasWonRef = useRef(false);

  const stopClock = useCallback(() => {
    if (runningSinceRef.current !== null) {
      elapsedMsRef.current += Date.now() - runningSinceRef.current;
      runningSinceRef.current = null;
    }
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setSeconds(Math.floor(elapsedMsRef.current / 1000));
  }, []);

  const startClock = useCallback(() => {
    if (intervalRef.current !== null || document.hidden || hasWonRef.current) return;
    runningSinceRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      setSeconds(
        Math.floor((elapsedMsRef.current + Date.now() - runningSinceRef.current) / 1000),
      );
    }, 250);
  }, []);

  const newGame = useCallback(() => {
    clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = null;
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    runningSinceRef.current = null;
    elapsedMsRef.current = 0;
    hasStartedRef.current = false;
    hasWonRef.current = false;
    lockedRef.current = false;
    openRef.current = [];
    matchedRef.current = new Set();

    const selected = shuffle(imagesRef.current).slice(0, 8);
    const nextCards = selected.length < 2 ? [] : shuffle(selected.flatMap((image, pair) => [
      { ...image, pair, id: `${pair}-a` },
      { ...image, pair, id: `${pair}-b` },
    ]));
    cardsRef.current = nextCards;
    setCards(nextCards);
    setOpenCards([]);
    setMatchedCards([]);
    setMoves(0);
    setSeconds(0);
    setWon(false);
    setAnnouncement('新的一局，翻开第一张卡片开始。');
  }, []);

  useEffect(() => {
    newGame();
    let cancelled=false;
    loadedRef.current=false;
    setCloudReady(false);
    fetch('/api/account/memory',{cache:'no-store'})
      .then(async response => {
        if(response.status===401){if(!cancelled)setCloudStatus('登录后自动保存游戏进度');return;}
        if(!response.ok)throw new Error();
        const data=await response.json();if(cancelled)return;
        cloudRef.current={identity:data.user.key,revision:data.revision,busy:false,pending:null,failed:false};
        const r=data.record,allowed=new Map(imagesRef.current.map(image=>[image.src,image]));
        if(r && r.cards?.length===16 && r.cards.every(card=>allowed.has(card.src))){
          const restored=r.cards.map(card=>({...allowed.get(card.src),id:card.id,pair:card.pair}));
          cardsRef.current=restored;setCards(restored);
          matchedRef.current=new Set(r.matched);setMatchedCards(r.matched);
          setMoves(r.moves);setSeconds(r.seconds);elapsedMsRef.current=r.seconds*1000;
          hasStartedRef.current=r.moves>0;hasWonRef.current=r.won;setWon(r.won);
          setCloudStatus('已恢复云端游戏进度');
        }else setCloudStatus('登录后，游戏进度会自动保存');
      }).catch(()=>{if(!cancelled){cloudRef.current.failed=true;setCloudStatus('云端记录暂时读不到，请刷新后重试');}})
      .finally(()=>{if(!cancelled){loadedRef.current=true;setCloudReady(true);}});
    return()=>{cancelled=true;};
  }, [imageSignature, newGame]);

  const saveCloud = useCallback(async () => {
    const cloud=cloudRef.current;
    if(!cloud.identity||cloud.failed||!loadedRef.current||!latestRef.current?.cards.length)return;
    cloud.pending=latestRef.current;
    if(cloud.busy)return;
    cloud.busy=true;
    try{
      while(cloud.pending&&!cloud.failed){
        const record=cloud.pending;cloud.pending=null;
        setCloudStatus('正在保存游戏进度…');
        let response, data;
        try {
          response=await fetch('/api/account/memory',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({record,revision:cloud.revision,identity:cloud.identity}),keepalive:true});
          data=await response.json();
        } catch(error) {
          const check=await fetch('/api/account/memory',{cache:'no-store'});
          const remote=check.ok?await check.json():null;
          if(remote?.user?.key===cloud.identity && JSON.stringify(remote.record)===JSON.stringify(record)){
            cloud.revision=remote.revision;setCloudStatus('游戏进度已保存');continue;
          }
          throw error;
        }
        if(!response.ok){if(response.status===401||response.status===409)cloud.failed=true;throw new Error(data.error||'保存暂时失败，下一步会重试');}
        cloud.revision=data.revision;setCloudStatus('游戏进度已保存');
      }
    }catch(error){setCloudStatus(error.message||'保存暂时失败，下一步会重试');}
    finally{cloud.busy=false;}
  },[]);
  latestRef.current={cards:cards.map(({id,pair,src})=>({id,pair,src})),matched:matchedCards,moves,seconds,won};
  useEffect(()=>{
    if(!cloudReady)return;
    void saveCloud();
  },[cards,matchedCards,moves,won,cloudReady,saveCloud]);
  useEffect(()=>{
    const persist=()=>{if(document.hidden)void saveCloud();};
    document.addEventListener('visibilitychange',persist);
    const flush=()=>void saveCloud();
    window.addEventListener('pagehide',flush);
    return()=>{document.removeEventListener('visibilitychange',persist);window.removeEventListener('pagehide',flush);};
  },[saveCloud]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) stopClock();
      else if (hasStartedRef.current && !hasWonRef.current) startClock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(intervalRef.current);
      clearTimeout(resetTimeoutRef.current);
    };
  }, [startClock, stopClock]);

  const flipCard = (card) => {
    if (!cloudReady || lockedRef.current || matchedRef.current.has(card.id) || openRef.current.includes(card.id)) {
      return;
    }
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
    }
    startClock();

    const nextOpen = [...openRef.current, card.id];
    openRef.current = nextOpen;
    setOpenCards(nextOpen);
    if (nextOpen.length < 2) return;

    lockedRef.current = true;
    setMoves((count) => count + 1);
    const firstCard = cardsRef.current.find((item) => item.id === nextOpen[0]);
    if (firstCard.pair === card.pair) {
      nextOpen.forEach((id) => matchedRef.current.add(id));
      setMatchedCards([...matchedRef.current]);
      openRef.current = [];
      setOpenCards([]);
      lockedRef.current = false;
      if (matchedRef.current.size === cardsRef.current.length) {
        hasWonRef.current = true;
        stopClock();
        setWon(true);
        setAnnouncement('全部配对成功！每幅画都找到了自己的另一半。');
      } else {
        setAnnouncement(`找到一对！已经完成 ${matchedRef.current.size / 2} 对。`);
      }
    } else {
      setAnnouncement('这两张不一样，记住它们的位置。');
      resetTimeoutRef.current = setTimeout(() => {
        openRef.current = [];
        setOpenCards([]);
        lockedRef.current = false;
        resetTimeoutRef.current = null;
      }, 950);
    }
  };

  const pairs = cards.length / 2;
  const found = matchedCards.length / 2;

  return (
    <section
      className="pmg-section"
      id="photo-memory-game"
      aria-labelledby="pmg-title"
      data-game-status={won ? 'won' : hasStartedRef.current ? 'playing' : 'ready'}
      data-moves={moves}
      data-matched-pairs={found}
    >
      <div className="pmg-heading">
        <div className="pmg-eyebrow"><span className="pmg-orange-dot" /> MEMORY MATCH</div>
        <h2 id="pmg-title">翻开两张，找到同一幅画。</h2>
        <p className="pmg-description">给眼睛一点挑战。记住画的位置，让相同的灵感重新相遇。</p>
      </div>

      <div className={`pmg-stage${won ? ' pmg-stage-won' : ''}`}>
        <div className="pmg-toolbar">
          <div className="pmg-stats" aria-label="游戏进度">
            <div className="pmg-stat"><span>配对</span><strong>{found}<small> / {pairs}</small></strong></div>
            <div className="pmg-stat"><span>步数</span><strong>{moves.toString().padStart(2, '0')}</strong></div>
            <div className="pmg-stat"><span>用时</span><strong>{formatTime(seconds)}</strong></div>
          </div>
          <button type="button" className="pmg-restart" onClick={newGame} disabled={!cloudReady || cards.length === 0}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M4 10a8 8 0 1 1 1.6 7.2M4 4v6h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            再来一局
          </button>
        </div>

        {cards.length > 0 ? (
          <div className="pmg-grid" aria-label="图片记忆配对卡片">
            {cards.map((card, index) => {
              const isMatched = matchedCards.includes(card.id);
              const isOpen = isMatched || openCards.includes(card.id);
              return (
                <button
                  className={`pmg-card${isOpen ? ' pmg-card-open' : ''}${isMatched ? ' pmg-card-matched' : ''}`}
                  key={card.id}
                  type="button"
                  disabled={!cloudReady}
                  data-card-index={index}
                  data-card-state={isMatched ? 'matched' : isOpen ? 'open' : 'hidden'}
                  onClick={() => flipCard(card)}
                  aria-label={`第 ${index + 1} 张卡片${isMatched ? '，已配对' : isOpen ? `，${card.label || '作品图片'}` : '，未翻开'}`}
                  aria-pressed={isOpen}
                  aria-disabled={isMatched || openCards.length === 2}
                >
                  <span className="pmg-card-inner">
                    <span className="pmg-card-back" aria-hidden="true">
                      <span className="pmg-card-number">{(index + 1).toString().padStart(2, '0')}</span>
                      <span className="pmg-card-symbol"><span /><span /><span /><span /></span>
                      <span className="pmg-card-wordmark">LOOK AGAIN</span>
                    </span>
                    <span className="pmg-card-front" aria-hidden="true">
                      <img src={card.src} alt="" draggable="false" loading="lazy" />
                      <span className="pmg-match-mark">✓</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : <p className="pmg-empty">准备至少两幅图片，就可以开始配对。</p>}

        <div className={`pmg-footer${won ? ' pmg-footer-won' : ''}`}>
          <span className="pmg-footer-dot" aria-hidden="true" />
          <p>{won ? `全都找到了。${moves} 步，${formatTime(seconds)}，漂亮的记忆力。` : '每次翻开两张，找到相同图片即可配对。'}</p>
          <span className="pmg-keyboard-hint" role="status">{cloudStatus}{!cloudRef.current.identity && cloudReady && <> · <a href="/account/#login">账号登录</a></>}</span>
        </div>
        <p className="pmg-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      </div>
    </section>
  );
}
