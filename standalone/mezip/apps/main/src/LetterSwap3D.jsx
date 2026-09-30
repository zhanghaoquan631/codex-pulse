import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAnimate } from 'motion/react'
import './LetterSwap3D.css'

const defaultAnimation = { type: 'spring', damping: 30, stiffness: 300 }

function textFromChildren(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textFromChildren).join('')
  if (node?.props) return textFromChildren(node.props.children)
  return ''
}

function splitGraphemes(value) {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    return Array.from(segmenter.segment(value), ({ segment }) => segment)
  }
  return Array.from(value)
}

function getSegments(value) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  return words.map((word, index) => ({
    characters: splitGraphemes(word),
    needsSpace: index < words.length - 1,
  }))
}

function getDelay(index, total, origin, interval) {
  if (origin === 'first') return index * interval
  if (origin === 'last') return (total - 1 - index) * interval
  if (origin === 'center') return Math.abs(Math.floor(total / 2) - index) * interval
  if (origin === 'random') return Math.abs(Math.floor(Math.random() * total) - index) * interval
  if (typeof origin === 'number') return Math.abs(origin - index) * interval
  return index * interval
}

/**
 * Clean-room 3D letter swap inspired by the public React Bits Pro behavior.
 * The two faces of each grapheme rotate around the center of a small 3D box.
 */
export default function LetterSwap3D({
  children,
  as: Tag = 'p',
  className = '',
  frontFaceClassName = '',
  backFaceClassName = '',
  staggerInterval = 0.05,
  staggerOrigin = 'first',
  animation = defaultAnimation,
  flipDirection = 'top',
  playOnScroll = false,
  scrollThreshold = 0.1,
  blur = false,
  blurAmount = 4,
  duration = 0.6,
  onAnimationStart,
  onAnimationComplete,
  respectReducedMotion = true,
  style,
  ...rest
}) {
  const text = useMemo(() => textFromChildren(children), [children])
  const segments = useMemo(() => getSegments(text), [text])
  const [scope, animate] = useAnimate()
  const [isAnimating, setIsAnimating] = useState(false)
  const hasPlayedRef = useRef(false)
  const animationIdRef = useRef(0)
  const reduceMotionRef = useRef(false)

  useEffect(() => {
    reduceMotionRef.current = respectReducedMotion
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  }, [respectReducedMotion])

  useEffect(() => {
    hasPlayedRef.current = false
  }, [text])

  const play = useCallback(async () => {
    if (hasPlayedRef.current || isAnimating || !scope.current || !segments.length) return
    hasPlayedRef.current = true

    const currentAnimationId = animationIdRef.current + 1
    animationIdRef.current = currentAnimationId
    const chars = [...scope.current.querySelectorAll('[data-letter-swap-char]')]
    const frontFaces = [...scope.current.querySelectorAll('[data-letter-swap-front]')]
    const backFaces = [...scope.current.querySelectorAll('[data-letter-swap-back]')]
    const total = chars.length
    if (!total || reduceMotionRef.current) return

    setIsAnimating(true)
    onAnimationStart?.()

    const delays = chars.map((_, index) => getDelay(index, total, staggerOrigin, staggerInterval))
    const rotation = flipDirection === 'bottom'
      ? 'translateZ(-0.5lh) rotateX(-90deg)'
      : 'translateZ(-0.5lh) rotateX(90deg)'
    const transition = animation && typeof animation === 'object'
      ? animation
      : { duration }
    const frontBlurTransition = { duration: 0.2, ease: 'easeOut' }
    const backBlurTransition = { duration: 0.1, ease: 'easeIn' }
    const backBlurDelay = Math.min(0.1 * duration, 0.15)

    try {
      const turns = chars.map((element, index) => animate(
        element,
        { transform: rotation },
        { ...transition, delay: delays[index] },
      ))
      const blurTurns = blur
        ? [
            animate(frontFaces, { filter: `blur(${blurAmount}px)`, opacity: 0 }, { ...frontBlurTransition, delay: index => delays[index] }),
            animate(backFaces, { filter: 'blur(0px)', opacity: 1 }, { ...backBlurTransition, delay: index => delays[index] + backBlurDelay }),
          ]
        : []
      await Promise.all([...turns, ...blurTurns])
      if (animationIdRef.current !== currentAnimationId) return
      await animate(chars, { transform: 'translateZ(-0.5lh) rotateX(0deg)' }, { duration: 0 })
      if (blur) {
        await Promise.all([
          animate(frontFaces, { filter: 'blur(0px)', opacity: 1 }, { duration: 0 }),
          animate(backFaces, { filter: 'blur(0px)', opacity: 0 }, { duration: 0 }),
        ])
      }
      onAnimationComplete?.()
    } finally {
      if (animationIdRef.current === currentAnimationId) setIsAnimating(false)
    }
  }, [animate, animation, blur, blurAmount, duration, flipDirection, isAnimating, onAnimationComplete, onAnimationStart, scope, segments.length, staggerInterval, staggerOrigin])

  const reset = useCallback(() => {
    hasPlayedRef.current = false
  }, [])

  useEffect(() => {
    if (!playOnScroll || !scope.current || reduceMotionRef.current) return undefined
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        play()
        observer.disconnect()
      }
    }, { threshold: scrollThreshold })
    observer.observe(scope.current)
    return () => observer.disconnect()
  }, [play, playOnScroll, scrollThreshold, scope, text])

  return (
    <Tag
      ref={scope}
      className={`letter-swap-3d ${className}`.trim()}
      style={{ perspective: '1000px', ...style }}
      onMouseEnter={play}
      onMouseLeave={reset}
      onFocus={play}
      onBlur={reset}
      data-letter-swap-3d
      {...rest}
    >
      <span className="letter-swap-3d__sr-only">{text}</span>
      <span className="letter-swap-3d__visual" aria-hidden="true">
        {segments.map((segment, wordIndex) => (
          <span className="letter-swap-3d__word" key={`${wordIndex}-${segment.characters.join('')}`}>
            {segment.characters.map((character, charIndex) => (
              <span
                className="letter-swap-3d__char"
                data-letter-swap-char
                key={`${wordIndex}-${charIndex}-${character}`}
                style={{ transform: 'translateZ(-0.5lh)' }}
              >
                <span className={`letter-swap-3d__face letter-swap-3d__front ${frontFaceClassName}`.trim()} data-letter-swap-front>
                  {character}
                </span>
                <span
                  className={`letter-swap-3d__face letter-swap-3d__back ${backFaceClassName}`.trim()}
                  data-letter-swap-back
                  style={blur ? { opacity: 0 } : undefined}
                >
                  {character}
                </span>
              </span>
            ))}
            {segment.needsSpace ? <span className="letter-swap-3d__space">{' '}</span> : null}
          </span>
        ))}
      </span>
    </Tag>
  )
}
