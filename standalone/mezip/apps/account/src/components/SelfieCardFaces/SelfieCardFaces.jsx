import React, { useCallback, useRef } from 'react';
import ProfileCard from '../ProfileCard/ProfileCard.jsx';
import './SelfieCardFaces.css';

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
          className={`selfie-drag-corner selfie-drag-corner-${corner}`}
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

function SelfieBack({ asset }) {
  return (
    <article className="selfie-back-image-panel" aria-label="ME.zip 觉迹星空视觉背面">
      <img
        className="selfie-back-image-blur"
        src={asset('me-zip-aurora.png')}
        alt=""
        aria-hidden="true"
        draggable="false"
      />
      <img
        className="selfie-back-image"
        src={asset('me-zip-aurora.png')}
        alt="ME.zip 觉迹星空视觉"
        draggable="false"
      />
    </article>
  );
}

export default function SelfieCardFaces({ asset, dragApi, faceSide = 'front' }) {
  const showingBack = faceSide === 'back';
  const shellRef = useRef(null);
  const draggingRef = useRef(false);

  const resetHover = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.classList.remove('is-near');
    shell.style.setProperty('--selfie-rotate-x', '0deg');
    shell.style.setProperty('--selfie-rotate-y', '0deg');
    shell.style.setProperty('--selfie-light-x', '50%');
    shell.style.setProperty('--selfie-light-y', '50%');
  }, []);

  const updateHover = useCallback(event => {
    if (draggingRef.current || showingBack) return;
    const shell = shellRef.current;
    const rect = shell?.getBoundingClientRect();
    if (!shell || !rect?.width || !rect?.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    shell.classList.add('is-near');
    shell.style.setProperty('--selfie-rotate-x', `${(y - 0.5) * 5}deg`);
    shell.style.setProperty('--selfie-rotate-y', `${(x - 0.5) * 7}deg`);
    shell.style.setProperty('--selfie-light-x', `${x * 100}%`);
    shell.style.setProperty('--selfie-light-y', `${y * 100}%`);
  }, [showingBack]);

  const beginDrag = useCallback(() => {
    draggingRef.current = true;
    resetHover();
  }, [resetHover]);

  const endDrag = useCallback(() => {
    draggingRef.current = false;
    resetHover();
  }, [resetHover]);

  const handleShellPointerDown = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const inCorner = (x <= 0.18 || x >= 0.82) && (y <= 0.18 || y >= 0.82);
    if (!inCorner || !dragApi?.begin(event.clientX, event.clientY, event.pointerId ?? null)) return;
    beginDrag();
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={shellRef}
      className="selfie-face-shell"
      aria-label="弓弦影自拍资料卡"
      onPointerDown={handleShellPointerDown}
      onMouseDown={handleShellPointerDown}
      onPointerEnter={updateHover}
      onPointerMove={updateHover}
      onPointerLeave={resetHover}
    >
      <div className={`selfie-face selfie-face-front ${showingBack ? '' : 'is-active'}`} aria-label="自拍正面">
        <div className="selfie-card-frame">
          <ProfileCard
            avatarUrl={asset('tom-profile-cutout.png')}
            iconUrl={asset('iconpattern.png')}
            grainUrl={asset('grain.webp')}
            name="弓弦影"
            title="Alex · FDE产品经理"
            innerGradient="linear-gradient(145deg, #182b55 0%, #080f24 100%)"
            behindGlowColor="rgba(112, 187, 255, .72)"
            behindGlowSize="56%"
            showUserInfo={false}
            enableTilt
            enableMobileTilt={false}
          />
        </div>
        <DragCorners dragApi={dragApi} onDragStart={beginDrag} onDragEnd={endDrag} />
      </div>
      <div className={`selfie-face selfie-face-back ${showingBack ? 'is-active' : ''}`} aria-label="自拍资料背面">
        <SelfieBack asset={asset} />
        <DragCorners dragApi={dragApi} onDragStart={beginDrag} onDragEnd={endDrag} />
      </div>
    </div>
  );
}
