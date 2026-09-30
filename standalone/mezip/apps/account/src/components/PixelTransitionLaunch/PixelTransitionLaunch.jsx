import React, { useEffect, useRef, useState } from 'react';
import PixelTransitionCard from '../PixelTransitionCard/PixelTransitionCard.jsx';
import './PixelTransitionLaunch.css';

const WORKSPACE_URL = '/playground/';

function ImageFace({ src, alt, className, children }) {
  return (
    <div className={`pixel-launch-face ${className}`}>
      <img src={src} alt={alt} draggable="false" />
      {children}
    </div>
  );
}

/**
 * A small, self-contained launch tile placed beneath the middle lanyard.
 * The transition stays local to the authenticated lanyard workspace.
 */
export default function PixelTransitionLaunch({ asset }) {
  const [transitionComplete, setTransitionComplete] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const countdownTimerRef = useRef(null);
  const redirectTimerRef = useRef(null);
  const hasStartedRef = useRef(false);

  const handleTransitionComplete = active => {
    if (!active || hasStartedRef.current) return;
    hasStartedRef.current = true;
    setTransitionComplete(true);
    let remaining = 3;
    setCountdown(remaining);

    countdownTimerRef.current = window.setInterval(() => {
      if (remaining > 1) {
        remaining -= 1;
        setCountdown(remaining);
        return;
      }

      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setCountdown('meow');
      redirectTimerRef.current = window.setTimeout(() => {
        window.location.replace(WORKSPACE_URL);
      }, 650);
    }, 1000);
  };

  useEffect(() => () => {
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current);
    if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);
  }, []);

  const statusLabel = countdown === 'meow'
    ? '喵'
    : countdown != null
    ? String(countdown)
    : transitionComplete
    ? '喵'
    : '点击卡片';

  return (
    <section
      className="pixel-transition-launch"
      aria-label="像素转换入口"
      data-pixel-launch="true"
      data-transition-complete={transitionComplete ? 'true' : 'false'}
    >
      <PixelTransitionCard
        firstContent={(
          <ImageFace
            src={asset('pixel-transition-reference.jpg')}
            alt="Pixel Transition 参考猫咪图"
            className="pixel-launch-face-first"
          />
        )}
        secondContent={(
          <div className="pixel-launch-meow" aria-label="喵">
            <span>喵</span>
          </div>
        )}
        gridSize={7}
        pixelColor="#ffffff"
        animationStepDuration={0.3}
        once
        aspectRatio="56%"
        className="pixel-launch-card"
        onTransitionComplete={handleTransitionComplete}
      />
      <p
        className={`pixel-launch-status${countdown != null ? ' is-counting' : ''}`}
        aria-live="polite"
      >
        {statusLabel}
      </p>
    </section>
  );
}
