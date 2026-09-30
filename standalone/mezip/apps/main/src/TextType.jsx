'use client';

import { useEffect, useRef, useState, createElement, useMemo, useCallback } from 'react';
import { gsap } from 'gsap';
import './TextType.css';

// React Bits TextType, kept in the same prop/transition shape as the
// published component so the copy/delete cadence can be tuned without
// changing the surrounding hero layout.
const TextType = ({
  text,
  as: Component = 'div',
  typingSpeed = 50,
  initialDelay = 0,
  pauseDuration = 2000,
  deletingSpeed = 30,
  loop = true,
  className = '',
  showCursor = true,
  hideCursorWhileTyping = false,
  cursorCharacter = '|',
  cursorClassName = '',
  cursorBlinkDuration = 0.5,
  textColors = [],
  variableSpeed,
  onSentenceComplete,
  startOnVisible = false,
  reverseMode = false,
  ...props
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(!startOnVisible);
  const cursorRef = useRef(null);
  const containerRef = useRef(null);
  const animationStateRef = useRef({ displayedText: '', currentCharIndex: 0, currentTextIndex: 0, isDeleting: false });
  const hiddenAtRef = useRef(null);
  const textArray = useMemo(() => (Array.isArray(text) ? text : [text]), [text]);

  useEffect(() => {
    animationStateRef.current = { displayedText, currentCharIndex, currentTextIndex, isDeleting };
  }, [displayedText, currentCharIndex, currentTextIndex, isDeleting]);

  const getRandomSpeed = useCallback(() => {
    if (!variableSpeed) return typingSpeed;
    const { min, max } = variableSpeed;
    return Math.random() * (max - min) + min;
  }, [variableSpeed, typingSpeed]);

  const getCurrentTextColor = () => {
    if (textColors.length === 0) return 'inherit';
    return textColors[currentTextIndex % textColors.length];
  };

  useEffect(() => {
    if (!startOnVisible || !containerRef.current) return undefined;
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => { if (entry.isIntersecting) setIsVisible(true); }),
      { threshold: 0.1 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    if (!showCursor || !cursorRef.current) return undefined;
    gsap.set(cursorRef.current, { opacity: 1 });
    const tween = gsap.to(cursorRef.current, {
      opacity: 0,
      duration: cursorBlinkDuration,
      repeat: -1,
      yoyo: true,
      ease: 'power2.inOut'
    });
    return () => tween.kill();
  }, [showCursor, cursorBlinkDuration]);

  useEffect(() => {
    const markHidden = () => { hiddenAtRef.current = performance.now(); };
    const restoreAfterResume = event => {
      if (document.visibilityState !== 'visible') return;
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      // Short focus changes should keep the normal typing cadence. A long
      // background pause or BFCache restore should never leave hero copy
      // stranded on an empty/deleting frame.
      if (!event?.persisted && (hiddenAt === null || performance.now() - hiddenAt < 700)) return;
      const state = animationStateRef.current;
      const currentText = String(textArray[state.currentTextIndex] ?? '');
      const processedText = reverseMode ? [...currentText].reverse().join('') : currentText;
      if (!processedText) return;
      if (state.displayedText !== processedText || state.isDeleting || state.currentCharIndex < processedText.length) {
        setDisplayedText(processedText);
        setCurrentCharIndex(processedText.length);
        setIsDeleting(false);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') markHidden();
      else restoreAfterResume();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', markHidden);
    window.addEventListener('pageshow', restoreAfterResume);
    window.addEventListener('focus', restoreAfterResume);
    return () => {
      // Keep named handlers so the component never accumulates listeners as
      // the text prop changes during development hot reloads.
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', markHidden);
      window.removeEventListener('pageshow', restoreAfterResume);
      window.removeEventListener('focus', restoreAfterResume);
    };
  }, [textArray, reverseMode]);

  useEffect(() => {
    if (!isVisible || !textArray.length) return undefined;
    let timeout;
    const currentText = String(textArray[currentTextIndex] ?? '');
    const processedText = reverseMode ? [...currentText].reverse().join('') : currentText;

    const executeTypingAnimation = () => {
      if (isDeleting) {
        if (displayedText === '') {
          setIsDeleting(false);
          if (currentTextIndex === textArray.length - 1 && !loop) return;
          onSentenceComplete?.(textArray[currentTextIndex], currentTextIndex);
          setCurrentTextIndex(previous => (previous + 1) % textArray.length);
          setCurrentCharIndex(0);
          timeout = setTimeout(() => {}, pauseDuration);
        } else {
          timeout = setTimeout(() => setDisplayedText(previous => previous.slice(0, -1)), deletingSpeed);
        }
      } else if (currentCharIndex < processedText.length) {
        timeout = setTimeout(() => {
          setDisplayedText(previous => previous + processedText[currentCharIndex]);
          setCurrentCharIndex(previous => previous + 1);
        }, variableSpeed ? getRandomSpeed() : typingSpeed);
      } else if (textArray.length >= 1) {
        if (!loop && currentTextIndex === textArray.length - 1) return;
        timeout = setTimeout(() => setIsDeleting(true), pauseDuration);
      }
    };

    if (currentCharIndex === 0 && !isDeleting && displayedText === '') {
      timeout = setTimeout(executeTypingAnimation, initialDelay);
    } else {
      executeTypingAnimation();
    }
    return () => clearTimeout(timeout);
    // The published component intentionally advances one grapheme per state
    // update; keep the same cadence and dependency contract here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentCharIndex,
    displayedText,
    isDeleting,
    typingSpeed,
    deletingSpeed,
    pauseDuration,
    textArray,
    currentTextIndex,
    loop,
    initialDelay,
    isVisible,
    reverseMode,
    variableSpeed,
    onSentenceComplete,
    getRandomSpeed
  ]);

  const shouldHideCursor = hideCursorWhileTyping
    && (currentCharIndex < String(textArray[currentTextIndex] ?? '').length || isDeleting);

  return createElement(
    Component,
    { ref: containerRef, className: `text-type ${className}`.trim(), ...props },
    <span className="text-type__content" style={{ color: getCurrentTextColor() || 'inherit' }}>
      {displayedText}
    </span>,
    showCursor && (
      <span
        ref={cursorRef}
        className={`text-type__cursor ${cursorClassName} ${shouldHideCursor ? 'text-type__cursor--hidden' : ''}`.trim()}
      >
        {cursorCharacter}
      </span>
    )
  );
};

export default TextType;
