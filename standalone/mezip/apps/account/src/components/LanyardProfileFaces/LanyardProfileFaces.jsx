import React, { useCallback, useEffect, useRef, useState } from 'react';
import ProfileCard from '../ProfileCard/ProfileCard.jsx';
import './LanyardProfileFaces.css';

const EMAIL = 'owner@example.com';

function BackIntro() {
  const [copied, setCopied] = useState(false);
  const introRef = useRef(null);

  useEffect(() => {
    const container = introRef.current;
    if (!container) return undefined;

    const items = Array.from(container.querySelectorAll('.intro-block > *'));
    let previousTop = container.scrollTop;
    let direction = 'down';
    let lastDirection = direction;
    let directionTravel = 0;
    let pendingDirection = null;
    let frameId = 0;

    items.forEach((item, index) => {
      item.classList.add('intro-reveal-item');
      item.style.setProperty('--reveal-delay', `${(index % 4) * 55}ms`);
    });

    const isVisible = (item, bounds) => {
      const rect = item.getBoundingClientRect();
      return rect.bottom > bounds.top + 10 && rect.top < bounds.bottom - 10;
    };

    const playReveal = (item, revealDirection) => {
      item.classList.remove('is-revealed');
      item.dataset.revealDirection = revealDirection;
      // Force a tiny reflow so reversing direction reliably restarts the CSS animation.
      void item.offsetWidth;
      item.classList.add('is-revealed');
      item.dataset.revealShown = revealDirection;
    };

    const revealVisibleItems = () => {
      frameId = 0;
      const bounds = container.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      if (direction !== lastDirection) {
        items.forEach(item => {
          if (isVisible(item, bounds)) {
            item.classList.remove('is-revealed');
            delete item.dataset.revealShown;
          }
        });
        lastDirection = direction;
      }

      const revealDirection = direction === 'down' ? 'from-bottom' : 'from-top';
      items.forEach(item => {
        if (isVisible(item, bounds)) {
          if (item.dataset.revealShown !== revealDirection) playReveal(item, revealDirection);
        } else {
          item.classList.remove('is-revealed');
          delete item.dataset.revealShown;
        }
      });
    };

    const scheduleReveal = () => {
      if (!frameId) frameId = window.requestAnimationFrame(revealVisibleItems);
    };

    const handleScroll = () => {
      const nextTop = container.scrollTop;
      const delta = nextTop - previousTop;
      if (delta !== 0) {
        const nextDirection = delta > 0 ? 'down' : 'up';
        if (nextDirection === direction) {
          directionTravel = 0;
          pendingDirection = null;
        } else {
          // Ignore trackpad/pointer jitter until the new direction has a few
          // pixels of momentum. This keeps the reveal from visibly flickering.
          if (pendingDirection !== nextDirection) {
            pendingDirection = nextDirection;
            directionTravel = 0;
          }
          directionTravel += Math.abs(delta);
          if (directionTravel >= 4) {
            direction = nextDirection;
            directionTravel = 0;
            pendingDirection = null;
          }
        }
      }
      previousTop = nextTop;
      scheduleReveal();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    scheduleReveal();

    // The back face is mounted while hidden. A resize/visibility pass makes
    // the first reveal happen as soon as the card is flipped into view.
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(scheduleReveal)
      : null;
    resizeObserver?.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver?.disconnect();
      if (frameId) window.cancelAnimationFrame(frameId);
      items.forEach(item => {
        item.classList.remove('intro-reveal-item', 'is-revealed');
        item.style.removeProperty('--reveal-delay');
        delete item.dataset.revealDirection;
        delete item.dataset.revealShown;
      });
    };
  }, []);

  const copyEmail = useCallback(async () => {
    let copiedSuccessfully = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(EMAIL);
        copiedSuccessfully = true;
      }
    } catch {
      copiedSuccessfully = false;
    }

    // localhost is sometimes treated as an insecure context by desktop
    // browsers. Keep the button useful there with a short-lived textarea
    // fallback, while still copying the exact bound address.
    if (!copiedSuccessfully) {
      const textarea = document.createElement('textarea');
      textarea.value = EMAIL;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copiedSuccessfully = document.execCommand('copy');
      } catch {
        copiedSuccessfully = false;
      } finally {
        textarea.remove();
      }
    }

    if (copiedSuccessfully) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }, []);

  return (
    <article ref={introRef} className="lanyard-back-scroll" aria-label="弓弦影自我介绍">
      <header className="intro-block intro-identity">
        <p className="intro-eyebrow">IDENTITY / 01</p>
        <h2>弓弦影</h2>
        <p className="intro-name intro-english-name">Alex · FDE产品经理</p>
        <p className="intro-meta">FDE Product · Born 中国</p>
      </header>

      <section className="intro-block">
        <p className="intro-eyebrow">ABOUT / 02</p>
        <p>我对人为什么点击、停留、犹豫、喜欢和离开一件产品，通常比对按钮本身更感兴趣。</p>
        <p>我把人的行为、注意力和决策方式放在产品工作的中心。</p>
      </section>

      <section className="intro-block">
        <p className="intro-eyebrow">DESIGN × TECHNOLOGY / 03</p>
        <p>我喜欢探索产品与技术之间那块还没有名字的区域。</p>
        <p>有时候是一个界面，有时候是一段交互，有时候只是一个“这个应该能做出来吧”的想法。</p>
      </section>

      <section className="intro-block">
        <p className="intro-eyebrow">OFF HOURS / 04</p>
        <p>咖啡、写字、乱涂和小工具。近期：手绘小镇、极简摄影、AI 实验。</p>
      </section>

      <section className="intro-block intro-detail">
        <p className="intro-eyebrow">PERSONAL DETAIL / 05</p>
        <p>想得很多，做得更多，文件名偶尔还是：final-final-v7。</p>
      </section>

      <footer className="intro-block intro-contact">
        <p className="intro-eyebrow">CONTACT / 06</p>
        <div className="intro-email-row">
          <a href={`mailto:${EMAIL}`} aria-label={`发送邮件至 ${EMAIL}`}>{EMAIL}</a>
          <button type="button" onClick={copyEmail} aria-label="复制邮箱">
            {copied ? 'Copied' : 'Copy Email'}
          </button>
        </div>
      </footer>
    </article>
  );
}

function DragCorners({ dragApi, onDragStart, onDragEnd }) {
  const handlePointerDown = event => {
    if (!dragApi?.begin(event.clientX, event.clientY, event.pointerId)) return;
    onDragStart?.();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = event => {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    dragApi?.move(event.clientX, event.clientY);
  };

  const handlePointerEnd = event => {
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    dragApi?.end();
    onDragEnd?.();
  };

  const handleMouseDown = event => {
    if (!dragApi?.begin(event.clientX, event.clientY, null)) return;
    onDragStart?.();
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => (
        <span
          key={corner}
          className={`lanyard-drag-corner lanyard-drag-corner-${corner}`}
          aria-hidden="true"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onMouseDown={handleMouseDown}
          onMouseUp={event => {
            event.stopPropagation();
            dragApi?.end();
            onDragEnd?.();
          }}
        />
      ))}
    </>
  );
}

export default function LanyardProfileFaces({ asset, dragApi, faceSide = 'front' }) {
  const backIsVisible = faceSide === 'back';
  const shellRef = useRef(null);
  const draggingRef = useRef(false);

  const resetShellHover = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.classList.remove('is-near');
    shell.style.setProperty('--hover-rotate-x', '0deg');
    shell.style.setProperty('--hover-rotate-y', '0deg');
    shell.style.setProperty('--hover-light-x', '50%');
    shell.style.setProperty('--hover-light-y', '50%');
  }, []);

  const updateShellHover = useCallback(
    event => {
      // The ProfileCard face already owns its close-range tilt. The intro face
      // needs the same response because it is an HTML surface over the canvas.
      if (backIsVisible || draggingRef.current) return;
      const shell = shellRef.current;
      const rect = shell?.getBoundingClientRect();
      if (!shell || !rect?.width || !rect?.height) return;

      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      shell.classList.add('is-near');
      shell.style.setProperty('--hover-rotate-x', `${(y - 0.5) * 6}deg`);
      shell.style.setProperty('--hover-rotate-y', `${(x - 0.5) * 8}deg`);
      shell.style.setProperty('--hover-light-x', `${x * 100}%`);
      shell.style.setProperty('--hover-light-y', `${y * 100}%`);
    },
    [backIsVisible]
  );

  useEffect(() => {
    if (backIsVisible) resetShellHover();
  }, [backIsVisible, resetShellHover]);

  const beginShellDrag = useCallback(() => {
    draggingRef.current = true;
    resetShellHover();
  }, [resetShellHover]);

  const endShellDrag = useCallback(() => {
    draggingRef.current = false;
    resetShellHover();
  }, [resetShellHover]);

  const handleShellPointerDown = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const inCorner = (x <= 0.18 || x >= 0.82) && (y <= 0.18 || y >= 0.82);
    if (!inCorner || !dragApi?.begin(event.clientX, event.clientY, event.pointerId ?? null)) return;
    beginShellDrag();
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={shellRef}
      className="lanyard-face-shell"
      aria-label="Alex 的资料卡正反面"
      onPointerDown={handleShellPointerDown}
      onMouseDown={handleShellPointerDown}
      onPointerEnter={updateShellHover}
      onPointerMove={updateShellHover}
      onPointerLeave={resetShellHover}
    >
      <div
        className={`lanyard-face lanyard-face-front ${backIsVisible ? 'is-active' : ''}`}
        data-face="back"
        aria-label="资料卡背面"
      >
        <div className="original-card-frame">
          <ProfileCard
            avatarUrl={asset('mezip-identity.png')}
            iconUrl={asset('iconpattern.png')}
            grainUrl={asset('grain.webp')}
            name="弓弦影"
            title="Alex · FDE产品经理"
            innerGradient="linear-gradient(145deg, #1c5a3a 0%, #092219 100%)"
            behindGlowColor="rgba(114, 239, 157, .72)"
            behindGlowSize="56%"
            showUserInfo={false}
            enableTilt
            enableMobileTilt={false}
          />
        </div>
        <DragCorners dragApi={dragApi} onDragStart={beginShellDrag} onDragEnd={endShellDrag} />
      </div>
      <div
        className={`lanyard-face lanyard-face-back ${!backIsVisible ? 'is-active' : ''}`}
        data-face="front"
        aria-label="资料卡正面"
      >
        <BackIntro />
        <DragCorners dragApi={dragApi} onDragStart={beginShellDrag} onDragEnd={endShellDrag} />
      </div>
    </div>
  );
}
