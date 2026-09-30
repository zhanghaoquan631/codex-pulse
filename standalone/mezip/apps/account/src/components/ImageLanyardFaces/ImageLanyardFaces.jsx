import React, { useCallback, useEffect, useRef } from 'react';
import './ImageLanyardFaces.css';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const MOTION_TAU = 0.12;
const REST_DISTANCE = 0.075;

function ImageCard({ src, alt, variant }) {
  return (
    <div className={`image-card-interaction ${variant}`} aria-label={`${alt} 交互区域`}>
      <div className={`image-card-surface ${variant}`}>
        <img src={src} alt={alt} draggable="false" />
      </div>
    </div>
  );
}

export default function ImageLanyardFaces({ asset, dragApi, faceSide = 'front', isDragging = false }) {
  const shellRef = useRef(null);
  const motionRef = useRef({
    currentX: 50,
    currentY: 50,
    targetX: 50,
    targetY: 50,
    inside: false,
    lastTime: 0,
    frame: 0
  });
  const tickRef = useRef(null);
  const backIsVisible = faceSide === 'back';

  // The shell is always present even while the card turns over. Keeping the
  // pointer listener here prevents the rotated face from intermittently losing
  // hover ownership to the 3D Html layer.
  const writePointer = useCallback((x, y) => {
    const shell = shellRef.current;
    if (!shell) return;

    const properties = {
      '--pointer-x': `${x.toFixed(2)}%`,
      '--pointer-y': `${y.toFixed(2)}%`,
      '--background-x': `${(35 + x * 0.3).toFixed(2)}%`,
      '--background-y': `${(35 + y * 0.3).toFixed(2)}%`,
      '--pointer-from-left': `${(x / 100).toFixed(4)}`,
      '--pointer-from-top': `${(y / 100).toFixed(4)}`,
      '--pointer-from-center': `${clamp(Math.hypot(x - 50, y - 50) / 50, 0, 1).toFixed(4)}`,
      // The physical card already swings on the rope. This is deliberately
      // only a small, close-range tilt.
      '--tilt-x': `${((x - 50) / 9).toFixed(2)}deg`,
      '--tilt-y': `${((y - 50) / 11).toFixed(2)}deg`
    };

    Object.entries(properties).forEach(([name, value]) => shell.style.setProperty(name, value));
  }, []);

  tickRef.current = now => {
    const motion = motionRef.current;
    const delta = motion.lastTime ? Math.min((now - motion.lastTime) / 1000, 0.05) : 0;
    motion.lastTime = now;
    const ease = delta ? 1 - Math.exp(-delta / MOTION_TAU) : 0;
    motion.currentX += (motion.targetX - motion.currentX) * ease;
    motion.currentY += (motion.targetY - motion.currentY) * ease;
    writePointer(motion.currentX, motion.currentY);

    const atRest = Math.hypot(motion.targetX - motion.currentX, motion.targetY - motion.currentY) < REST_DISTANCE;
    if (!motion.inside && atRest) {
      motion.currentX = 50;
      motion.currentY = 50;
      motion.targetX = 50;
      motion.targetY = 50;
      motion.lastTime = 0;
      motion.frame = 0;
      writePointer(50, 50);
      shellRef.current?.classList.remove('is-hovering');
      return;
    }

    motion.frame = requestAnimationFrame(tickRef.current);
  };

  const startMotion = useCallback(() => {
    const motion = motionRef.current;
    if (motion.frame) return;
    motion.lastTime = 0;
    motion.frame = requestAnimationFrame(tickRef.current);
  }, []);

  const updateTarget = useCallback((event) => {
    if (isDragging) return;
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const motion = motionRef.current;
    motion.targetX = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    motion.targetY = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    startMotion();
  }, [isDragging, startMotion]);

  const activatePointer = useCallback((event) => {
    if (isDragging) return;
    motionRef.current.inside = true;
    shellRef.current?.classList.add('is-hovering');
    updateTarget(event);
  }, [isDragging, updateTarget]);

  const deactivatePointer = useCallback(() => {
    const motion = motionRef.current;
    motion.inside = false;
    motion.targetX = 50;
    motion.targetY = 50;
    startMotion();
  }, [startMotion]);

  useEffect(() => {
    if (isDragging) deactivatePointer();
  }, [isDragging, deactivatePointer]);

  useEffect(() => () => {
    const motion = motionRef.current;
    if (motion.frame) cancelAnimationFrame(motion.frame);
  }, []);

  const handleShellPointerDown = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const inCorner = (x <= 0.18 || x >= 0.82) && (y <= 0.18 || y >= 0.82);
    if (!inCorner || !dragApi?.begin(event.clientX, event.clientY, event.pointerId ?? null)) return;
    deactivatePointer();
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={shellRef}
      className={`image-face-shell ${isDragging ? 'is-dragging' : ''}`.trim()}
      aria-label="Portfolio 与 ME.zip 双面吊卡"
      onPointerEnter={activatePointer}
      onPointerMove={updateTarget}
      onPointerLeave={deactivatePointer}
      onPointerCancel={deactivatePointer}
      onPointerDown={handleShellPointerDown}
    >
      <div
        className={`image-face image-face-front ${backIsVisible ? 'is-active' : ''}`}
        data-face="back"
        aria-label="ME.zip 背面"
      >
        <div className="image-card-orientation">
          <ImageCard src={asset('me-zip-aurora.png')} alt="ME.zip 觉迹星空视觉" variant="me-zip-card" />
        </div>
      </div>

      <div
        className={`image-face image-face-back ${!backIsVisible ? 'is-active' : ''}`}
        data-face="front"
        aria-label="Portfolio in 4 days 正面"
      >
        <ImageCard src={asset('portfolio-in-4-days.jpg')} alt="Portfolio in 4 days 手写计划板" variant="portfolio-card" />
      </div>
    </div>
  );
}
