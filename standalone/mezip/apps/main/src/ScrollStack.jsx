import { Children, forwardRef, isValidElement, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import './ScrollStack.css'

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const imageSource = item => typeof item === 'string'
  ? item
  : item?.src || item?.image || item?.imageUrl || item?.url || item?.path || ''

const normalizeItems = items => (Array.isArray(items) ? items : []).map((item, index) => {
  const source = typeof item === 'string' ? { image: item } : (item || {})
  return {
    id: String(source.id || source.image || source.src || index),
    eyebrow: String(source.eyebrow || source.kicker || `FRAME / ${String(index + 1).padStart(2, '0')}`),
    title: String(source.title || `Scroll card ${index + 1}`),
    body: String(source.body || source.description || ''),
    image: String(imageSource(source)),
    accent: String(source.accent || '#a3a3a3'),
    alt: String(source.alt || source.title || `Scroll stack image ${index + 1}`),
  }
}).filter(item => item.image || item.title || item.body)

const variantTransform = (variant, distance, cardWidth, cardHeight, scaleStep, peek, perspective) => {
  const behind = Math.max(0, distance)
  const leaving = Math.min(0, distance)
  const depthY = behind * peek
  const exitY = leaving * cardHeight * 0.72
  const scale = clamp(1 - behind * scaleStep, 0.58, 1)
  if (variant === 'deck') {
    return `translate3d(-50%, calc(-50% + ${(distance >= 0 ? depthY : exitY).toFixed(2)}px), ${(-behind * 24).toFixed(2)}px) rotateZ(${(behind * 1.8 + leaving * 3).toFixed(2)}deg) scale(${scale.toFixed(4)})`
  }
  if (variant === 'fade') {
    return `translate3d(-50%, calc(-50% + ${(leaving * cardHeight * 0.18).toFixed(2)}px), ${(-behind * 8).toFixed(2)}px) scale(${clamp(1 - Math.abs(distance) * 0.02, .86, 1).toFixed(4)})`
  }
  if (variant === 'flip') {
    return `translate3d(-50%, -50%, ${(-behind * 24).toFixed(2)}px) rotateY(${(distance * -68).toFixed(2)}deg) rotateZ(${(leaving * 2).toFixed(2)}deg) scale(${scale.toFixed(4)})`
  }
  if (variant === 'zoom') {
    const zoom = distance < 0 ? 1 + clamp(Math.abs(distance) * .08, 0, .18) : scale
    return `translate3d(-50%, calc(-50% + ${(distance >= 0 ? depthY : exitY).toFixed(2)}px), ${(-behind * 32).toFixed(2)}px) scale(${zoom.toFixed(4)})`
  }
  if (variant === 'reveal') {
    return `translate3d(-50%, calc(-50% + ${(distance >= 0 ? depthY * .72 : exitY * .9).toFixed(2)}px), ${(-behind * 18).toFixed(2)}px) rotateX(${(distance * -7).toFixed(2)}deg) scale(${scale.toFixed(4)})`
  }
  // Default public "stack" variant: covered cards peek upward and shrink,
  // while the card that has passed the front dissolves toward the top.
  return `translate3d(-50%, calc(-50% + ${(distance >= 0 ? depthY : exitY).toFixed(2)}px), ${(-behind * 18).toFixed(2)}px) rotateZ(${(behind * .45 + leaving * 2.2).toFixed(2)}deg) scale(${scale.toFixed(4)})`
}

/**
 * Clean-room implementation of the public Scroll Stack contract. Cards are
 * pinned while the page scrolls, then stack, turn, blur and dissolve according
 * to the documented variant and tuning props. No protected source or demo
 * assets are used.
 */
const ScrollStack = forwardRef(function ScrollStack({
  items = [],
  children,
  variant = 'stack',
  scrollLength = 1,
  peek = 26,
  scaleStep = 0.07,
  blur = 4,
  dim = 0.28,
  smooth = 0.16,
  depth = 3,
  cardWidth = 880,
  cardHeight = 0.68,
  borderRadius = 22,
  perspective = 1400,
  showProgress = true,
  showCounter = true,
  onIndexChange,
  className = '',
}, ref) {
  const childItems = useMemo(() => Children.toArray(children), [children])
  const hasChildren = childItems.length > 0
  const normalizedItems = useMemo(() => normalizeItems(items), [items])
  const count = hasChildren ? childItems.length : normalizedItems.length
  const safeVariant = ['stack', 'deck', 'fade', 'flip', 'zoom', 'reveal'].includes(variant) ? variant : 'stack'
  const safeScrollLength = clamp(finite(scrollLength, 1), 0.2, 4)
  const safePeek = clamp(finite(peek, 26), 0, 180)
  const safeScaleStep = clamp(finite(scaleStep, 0.07), 0, 0.5)
  const safeBlur = clamp(finite(blur, 4), 0, 24)
  const safeDim = clamp(finite(dim, 0.28), 0, 0.9)
  const safeSmooth = clamp(finite(smooth, 0.16), 0, 1)
  const safeDepth = clamp(Math.round(finite(depth, 3)), 0, 12)
  const safeCardWidth = clamp(finite(cardWidth, 880), 240, 1600)
  const safeCardHeight = clamp(finite(cardHeight, 0.68), 0.3, 0.92)
  const safeRadius = clamp(finite(borderRadius, 22), 0, 80)
  const safePerspective = clamp(finite(perspective, 1400), 300, 5000)
  const safeCardPixels = Math.max(280, Math.min(900, (typeof window !== 'undefined' ? window.innerHeight : 900) * safeCardHeight))

  const rootRef = useRef(null)
  const pinRef = useRef(null)
  const cardsRef = useRef([])
  const progressRef = useRef(null)
  const counterRef = useRef(null)
  const frameRef = useRef(0)
  const currentProgressRef = useRef(0)
  const targetProgressRef = useRef(0)
  const lastIndexRef = useRef(-1)
  const reducedMotionRef = useRef(false)
  const onIndexChangeRef = useRef(onIndexChange)
  const [activeIndex, setActiveIndex] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => { onIndexChangeRef.current = onIndexChange }, [onIndexChange])

  const readProgress = useCallback(() => {
    const root = rootRef.current
    if (!root || count <= 1) return 0
    const span = Math.max(1, root.offsetHeight - window.innerHeight)
    return clamp(-root.getBoundingClientRect().top / span, 0, 1)
  }, [count])

  const applyProgress = useCallback(progress => {
    const root = rootRef.current
    if (!root || !count) return
    const virtualIndex = progress * Math.max(1, count - 1)
    const nextIndex = clamp(Math.round(virtualIndex), 0, Math.max(0, count - 1))
    root.dataset.scrollStackProgress = progress.toFixed(4)
    root.dataset.scrollStackVirtualIndex = virtualIndex.toFixed(3)
    root.dataset.scrollStackActiveIndex = String(nextIndex)
    if (progressRef.current) progressRef.current.style.width = `${(progress * 100).toFixed(2)}%`
    if (counterRef.current) counterRef.current.textContent = `${String(nextIndex + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`

    cardsRef.current.forEach((card, index) => {
      if (!card) return
      const distance = index - virtualIndex
      const absDistance = Math.abs(distance)
      const visible = absDistance <= safeDepth + 1.05
      const behind = Math.max(0, distance)
      const opacity = distance < 0
        ? clamp(1 + distance * 1.25, 0, 1)
        : clamp(1 - behind * safeDim, 0.08, 1)
      const cardBlur = clamp(behind * safeBlur, 0, safeBlur)
      card.style.transform = variantTransform(safeVariant, distance, safeCardWidth, safeCardPixels, safeScaleStep, safePeek, safePerspective)
      card.style.opacity = opacity.toFixed(3)
      card.style.filter = cardBlur ? `blur(${cardBlur.toFixed(2)}px)` : ''
      card.style.zIndex = String(100 - Math.round(absDistance * 10) - index)
      card.style.visibility = visible ? 'visible' : 'hidden'
      card.style.pointerEvents = absDistance < 0.52 ? 'auto' : 'none'
      card.dataset.scrollStackOffset = distance.toFixed(3)
      card.dataset.scrollStackActive = absDistance < 0.52 ? 'true' : 'false'
      card.setAttribute('aria-hidden', visible ? 'false' : 'true')
    })

    if (nextIndex !== lastIndexRef.current) {
      lastIndexRef.current = nextIndex
      setActiveIndex(nextIndex)
      onIndexChangeRef.current?.(nextIndex)
    }
  }, [count, safeCardPixels, safeCardWidth, safeDepth, safeDim, safePerspective, safePeek, safeScaleStep, safeBlur, safeVariant])

  const tick = useCallback(timestamp => {
    const target = targetProgressRef.current
    const current = currentProgressRef.current
    const easing = reducedMotionRef.current || safeSmooth <= 0 ? 1 : 1 - Math.exp(-1 / (60 * safeSmooth))
    const next = current + (target - current) * easing
    currentProgressRef.current = Math.abs(target - next) < 0.00035 ? target : next
    applyProgress(currentProgressRef.current)
    if (Math.abs(target - currentProgressRef.current) > 0.00035) {
      frameRef.current = window.requestAnimationFrame(tick)
    } else {
      frameRef.current = 0
    }
  }, [applyProgress, safeSmooth])

  const kick = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(tick)
  }, [tick])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const sync = () => {
      const matches = Boolean(query?.matches)
      reducedMotionRef.current = matches
      setReducedMotion(matches)
    }
    sync()
    query?.addEventListener?.('change', sync)
    return () => query?.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    if (!count) return undefined
    const onScroll = () => {
      targetProgressRef.current = readProgress()
      if (reducedMotionRef.current || safeSmooth <= 0) {
        currentProgressRef.current = targetProgressRef.current
        applyProgress(currentProgressRef.current)
        return
      }
      kick()
    }
    const onResize = () => {
      targetProgressRef.current = readProgress()
      currentProgressRef.current = targetProgressRef.current
      applyProgress(currentProgressRef.current)
    }
    targetProgressRef.current = readProgress()
    currentProgressRef.current = targetProgressRef.current
    applyProgress(currentProgressRef.current)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
  }, [applyProgress, count, kick, readProgress, safeSmooth])

  useImperativeHandle(ref, () => ({
    refresh: () => {
      targetProgressRef.current = readProgress()
      currentProgressRef.current = targetProgressRef.current
      applyProgress(currentProgressRef.current)
    },
    scrollToIndex: index => {
      if (!rootRef.current || count <= 1) return
      const target = clamp(Number(index) || 0, 0, count - 1) / (count - 1)
      window.scrollTo({ top: rootRef.current.offsetTop + target * (rootRef.current.offsetHeight - window.innerHeight), behavior: reducedMotionRef.current ? 'auto' : 'smooth' })
    },
    getProgress: () => currentProgressRef.current,
  }), [applyProgress, count, readProgress])

  const railHeight = `${Math.max(1, ((Math.max(1, count - 1) * safeScrollLength) + 1) * 100)}vh`
  const rootStyle = {
    '--ss-scroll-length': `${safeScrollLength}vh`,
    '--ss-peek': `${safePeek}px`,
    '--ss-scale-step': safeScaleStep,
    '--ss-blur': `${safeBlur}px`,
    '--ss-dim': safeDim,
    '--ss-card-width': `${safeCardWidth}px`,
    '--ss-card-height': `${safeCardHeight * 100}vh`,
    '--ss-card-radius': `${safeRadius}px`,
    '--ss-perspective': `${safePerspective}px`,
    '--ss-depth': safeDepth,
    height: railHeight,
  }

  const renderBuiltInCard = (item, index) => <article
    className="scroll-stack__card"
    ref={node => { cardsRef.current[index] = node }}
    data-scroll-stack-card
    data-scroll-stack-card-index={index}
    aria-label={item.title}
  >
    <div className="scroll-stack__card-media" style={{ '--ss-accent': item.accent }}>
      {item.image ? <img src={item.image} alt={item.alt} draggable="false" loading={index < 2 ? 'eager' : 'lazy'} /> : null}
      <span className="scroll-stack__card-wash" aria-hidden="true" />
    </div>
    <div className="scroll-stack__card-content">
      <p className="scroll-stack__card-eyebrow">{item.eyebrow}</p>
      <h3>{item.title}</h3>
      <p className="scroll-stack__card-body">{item.body}</p>
      <span className="scroll-stack__card-accent" style={{ backgroundColor: item.accent }} aria-hidden="true" />
    </div>
    <span className="scroll-stack__card-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
  </article>

  return <section
    ref={rootRef}
    className={['scroll-stack', `is-${safeVariant}`, className].filter(Boolean).join(' ')}
    style={rootStyle}
    aria-label="Scroll Stack"
    data-scroll-stack="true"
    data-scroll-stack-ready="true"
    data-scroll-stack-count={count}
    data-scroll-stack-variant={safeVariant}
    data-scroll-stack-scroll-length={safeScrollLength}
    data-scroll-stack-depth={safeDepth}
    data-scroll-stack-card-width={safeCardWidth}
    data-scroll-stack-card-height={safeCardHeight}
    data-scroll-stack-active-index={activeIndex}
    data-scroll-stack-reduced-motion={reducedMotion ? 'true' : 'false'}
  >
    <div ref={pinRef} className="scroll-stack__pin" data-scroll-stack-pin>
      <div className="scroll-stack__viewport" style={{ perspective: `${safePerspective}px` }}>
        <div className="scroll-stack__cards" data-scroll-stack-cards>
          {hasChildren
            ? childItems.map((child, index) => <article
              className="scroll-stack__card scroll-stack__custom-card"
              ref={node => { cardsRef.current[index] = node }}
              key={`custom-${index}`}
              data-scroll-stack-card
              data-scroll-stack-card-index={index}
            >{isValidElement(child) ? child : <span>{child}</span>}</article>)
            : normalizedItems.map(renderBuiltInCard)}
        </div>
      </div>
      <div className="scroll-stack__meta" aria-live="polite">
        {showProgress && <div className="scroll-stack__progress" role="progressbar" aria-label="Scroll stack progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round((activeIndex / Math.max(1, count - 1)) * 100)}><span ref={progressRef} /></div>}
        {showCounter && <span ref={counterRef} className="scroll-stack__counter">{String(Math.min(activeIndex + 1, Math.max(1, count))).padStart(2, '0')} / {String(Math.max(1, count)).padStart(2, '0')}</span>}
      </div>
    </div>
  </section>
})

export default ScrollStack
