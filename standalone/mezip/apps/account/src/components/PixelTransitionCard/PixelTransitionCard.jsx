import React, { useEffect, useRef, useState } from 'react';
import './PixelTransitionCard.css';

const clampGridSize = value => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(64, Math.max(1, parsed));
};

const shuffle = values => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

/**
 * A click-driven version of React Bits' Pixel Transition card.
 *
 * The two faces are covered by a 7x7 (by default) grid of solid pixels. The
 * pixels appear in a random order, the requested face is swapped at the
 * midpoint, and the same pixels disappear in that order. No animation
 * dependency is required; timers are kept in a ref so an interrupted card
 * cannot leave stale callbacks behind.
 *
 * @param {object} props
 * @param {React.ReactNode} props.firstContent Content shown before activation.
 * @param {React.ReactNode} props.secondContent Content shown after activation.
 * @param {number} [props.gridSize=7] Number of rows and columns in the mask.
 * @param {string} [props.pixelColor='currentColor'] Pixel mask color.
 * @param {number} [props.animationStepDuration=0.3] One mask pass in seconds.
 * @param {boolean} [props.once=false] Keep the second face after activation.
 * @param {string|number} [props.aspectRatio='100%'] Spacer padding-top value.
 * @param {string} [props.className=''] Additional root class names.
 * @param {object} [props.style] Additional root inline styles.
 * @param {boolean} [props.initialActive=false] Face to show on first render.
 * @param {(active: boolean) => void} [props.onTransitionComplete] Called after
 *   the mask has fully disappeared. The argument is the newly visible face.
 */
export default function PixelTransitionCard({
  firstContent,
  secondContent,
  gridSize = 7,
  pixelColor = 'currentColor',
  animationStepDuration = 0.3,
  once = false,
  aspectRatio = '100%',
  className = '',
  style,
  initialActive = false,
  onTransitionComplete
}) {
  const normalizedGridSize = clampGridSize(gridSize);
  const durationSeconds = Number.isFinite(Number(animationStepDuration))
    ? Math.max(0, Number(animationStepDuration))
    : 0.3;

  const defaultRef = useRef(null);
  const activeRef = useRef(null);
  const pixelGridRef = useRef(null);
  const timersRef = useRef(new Set());
  const activeStateRef = useRef(Boolean(initialActive));
  const transitioningRef = useRef(false);
  const callbackRef = useRef(onTransitionComplete);
  const [isActive, setIsActive] = useState(Boolean(initialActive));
  const [isTransitioning, setIsTransitioning] = useState(false);

  callbackRef.current = onTransitionComplete;

  const clearTimers = () => {
    timersRef.current.forEach(timerId => window.clearTimeout(timerId));
    timersRef.current.clear();
  };

  const schedule = (callback, delay) => {
    const timerId = window.setTimeout(() => {
      timersRef.current.delete(timerId);
      callback();
    }, Math.max(0, delay));
    timersRef.current.add(timerId);
  };

  useEffect(() => {
    const showActive = Boolean(initialActive);
    if (defaultRef.current) defaultRef.current.style.display = showActive ? 'none' : 'block';
    if (activeRef.current) activeRef.current.style.display = showActive ? 'block' : 'none';
    if (pixelGridRef.current) {
      Array.from(pixelGridRef.current.children).forEach(pixel => {
        pixel.style.display = 'none';
      });
    }

    return clearTimers;
    // initialActive is intentionally read once: changing it later should not
    // unexpectedly reverse a card the user has already interacted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animateTo = targetActive => {
    if (transitioningRef.current || targetActive === activeStateRef.current) return;
    if (targetActive && once && activeStateRef.current) return;

    const pixelGrid = pixelGridRef.current;
    const defaultFace = defaultRef.current;
    const activeFace = activeRef.current;
    if (!pixelGrid || !defaultFace || !activeFace) return;

    const pixels = Array.from(pixelGrid.children);
    if (!pixels.length) {
      activeStateRef.current = targetActive;
      setIsActive(targetActive);
      callbackRef.current?.(targetActive);
      return;
    }

    clearTimers();
    transitioningRef.current = true;
    setIsTransitioning(true);
    const passDuration = durationSeconds * 1000;
    const stagger = pixels.length ? passDuration / pixels.length : 0;
    const order = shuffle(pixels);

    pixels.forEach(pixel => {
      pixel.style.display = 'none';
      pixel.style.backgroundColor = pixelColor;
    });

    // Reveal a random pixel mask, matching the source component's staggered
    // zero-duration GSAP display toggles.
    order.forEach((pixel, index) => {
      schedule(() => {
        pixel.style.display = 'block';
      }, index * stagger);
    });

    // Swap faces when the mask is complete.
    schedule(() => {
      defaultFace.style.display = targetActive ? 'none' : 'block';
      activeFace.style.display = targetActive ? 'block' : 'none';
    }, passDuration);

    // Clear the mask in the same random sequence for the second pass.
    order.forEach((pixel, index) => {
      schedule(() => {
        pixel.style.display = 'none';
      }, passDuration + index * stagger);
    });

    schedule(() => {
      activeStateRef.current = targetActive;
      transitioningRef.current = false;
      setIsActive(targetActive);
      setIsTransitioning(false);
      callbackRef.current?.(targetActive);
    }, passDuration * 2 + 1);
  };

  const handleClick = event => {
    event.preventDefault();
    const nextActive = !activeStateRef.current;
    if (nextActive || !once) animateTo(nextActive);
  };

  const handleKeyDown = event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleClick(event);
  };

  const pixels = Array.from({ length: normalizedGridSize ** 2 }, (_, index) => {
    const row = Math.floor(index / normalizedGridSize);
    const column = index % normalizedGridSize;
    const size = 100 / normalizedGridSize;
    return (
      <div
        key={`${normalizedGridSize}-${index}`}
        className="pixelated-image-card__pixel"
        style={{
          backgroundColor: pixelColor,
          width: `${size}%`,
          height: `${size}%`,
          left: `${column * size}%`,
          top: `${row * size}%`
        }}
        aria-hidden="true"
      />
    );
  });

  return (
    <div
      className={`pixelated-image-card${className ? ` ${className}` : ''}`}
      style={style}
      role="button"
      tabIndex={0}
      aria-label="像素转换卡片"
      aria-pressed={isActive}
      data-pixel-transition-card="true"
      data-state={isTransitioning ? 'transitioning' : isActive ? 'active' : 'idle'}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div style={{ paddingTop: aspectRatio }} aria-hidden="true" />
      <div className="pixelated-image-card__default" ref={defaultRef} aria-hidden={isActive}>
        {firstContent}
      </div>
      <div className="pixelated-image-card__active" ref={activeRef} aria-hidden={!isActive}>
        {secondContent}
      </div>
      <div className="pixelated-image-card__pixels" ref={pixelGridRef} aria-hidden="true">
        {pixels}
      </div>
    </div>
  );
}

