import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import './ParallaxCards.css'

const MAX_CARDS = 12

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normaliseImages = images => {
  const seen = new Set()
  return (Array.isArray(images) ? images : []).map((item, index) => {
    const source = typeof item === 'string' ? { src: item } : (item || {})
    const src = String(source.src || source.image || source.imageUrl || source.url || '').trim()
    if (!src || seen.has(src)) return null
    seen.add(src)
    return {
      src,
      alt: String(source.alt || source.label || source.title || `Parallax card ${index + 1}`),
      id: String(source.id || src || index),
    }
  }).filter(Boolean).slice(0, MAX_CARDS)
}

/**
 * Clean-room implementation of the public Parallax Cards contract. The
 * component keeps the interaction contract (layered 3D cards, mouse-driven
 * depth, optional fog and magnetic attraction) independent of the reference
 * site's protected source and demo assets.
 */
const ParallaxCards = forwardRef(function ParallaxCards({
  images = [],
  cardCount,
  perspective = 2500,
  mouseSensitivity = 3,
  cardWidth,
  cardHeight,
  animationDuration = 1.2,
  enableDepthFog = false,
  fogIntensity = 1,
  enableMagneticAttraction = false,
  magneticStrength = 50,
  onCardClick,
  className = '',
  ariaLabel = 'Interactive parallax cards',
}, ref) {
  const normalizedImages = useMemo(() => normaliseImages(images), [images])
  const count = Math.min(MAX_CARDS, Math.max(0, Math.round(finite(cardCount, normalizedImages.length))))
  const visibleImages = normalizedImages.slice(0, count)
  const rootRef = useRef(null)
  const sceneRef = useRef(null)
  const cardRefs = useRef([])
  const pointerRef = useRef({ targetX: 0, targetY: 0, currentX: 0, currentY: 0, frame: 0 })
  const reducedMotionRef = useRef(false)
  const layoutRef = useRef([])
  const [hovered, setHovered] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [reducedMotion, setReducedMotion] = useState(false)

  const safePerspective = clamp(finite(perspective, 2500), 400, 6000)
  const safeSensitivity = clamp(finite(mouseSensitivity, 3), 0, 10)
  const safeDuration = clamp(finite(animationDuration, 1.2), 0, 4)
  const safeFog = clamp(finite(fogIntensity, 1), 0, 2)
  const safeMagneticStrength = clamp(finite(magneticStrength, 50), 0, 180)

  const buildLayout = useCallback(() => {
    const cardCountSafe = visibleImages.length
    if (!cardCountSafe) return []
    const columns = cardCountSafe <= 3 ? cardCountSafe : cardCountSafe <= 8 ? 3 : 4
    const rows = Math.ceil(cardCountSafe / columns)
    const centerColumn = (columns - 1) / 2
    const centerRow = (rows - 1) / 2
    return visibleImages.map((_, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const radial = index - (cardCountSafe - 1) / 2
      return {
        gridX: column - centerColumn,
        gridY: row - centerRow,
        z: radial * 16,
        depth: 0.75 + ((index * 13) % 7) / 8,
        rotation: ((index * 19) % 11) - 5,
        index,
      }
    })
  }, [visibleImages])

  const applyPointer = useCallback((x, y) => {
    const root = rootRef.current
    const scene = sceneRef.current
    if (!root || !scene) return
    const layouts = layoutRef.current
    const magneticFactor = enableMagneticAttraction ? safeMagneticStrength : 0
    const pointerX = clamp(x, -1, 1)
    const pointerY = clamp(y, -1, 1)
    root.style.setProperty('--pc-pointer-x', pointerX.toFixed(4))
    root.style.setProperty('--pc-pointer-y', pointerY.toFixed(4))
    root.dataset.parallaxCardsPointerX = pointerX.toFixed(3)
    root.dataset.parallaxCardsPointerY = pointerY.toFixed(3)
    root.dataset.parallaxCardsPointerActive = Math.abs(pointerX) + Math.abs(pointerY) > 0.01 ? 'true' : 'false'

    const sceneTiltX = pointerY * -5.5 * safeSensitivity
    const sceneTiltY = pointerX * 7 * safeSensitivity
    scene.style.transform = `rotateX(${sceneTiltX.toFixed(3)}deg) rotateY(${sceneTiltY.toFixed(3)}deg)`
    layouts.forEach((item, index) => {
      const card = cardRefs.current[index]
      if (!card) return
      const width = card.offsetWidth || 176
      const height = card.offsetHeight || 246
      const xStep = width * 0.62
      const yStep = height * 0.42
      // Every layer receives a baseline parallax translation. Magnetic
      // attraction adds extra pull when that optional prop is enabled.
      const depthShift = item.depth * (16 + magneticFactor * 0.36)
      const translateX = item.gridX * xStep + pointerX * depthShift * safeSensitivity
      const translateY = item.gridY * yStep + pointerY * depthShift * safeSensitivity
      const rotateX = pointerY * -8 * safeSensitivity + item.gridY * 1.5
      const rotateY = pointerX * 10 * safeSensitivity + item.gridX * -1.5
      const scale = 1 - Math.min(.075, Math.abs(item.gridX) * .012 + Math.abs(item.gridY) * .014)
      const fogDistance = Math.abs(item.gridX) + Math.abs(item.gridY) + Math.max(0, -item.z / 80)
      const fogBlur = enableDepthFog ? Math.min(7, fogDistance * safeFog * 1.15) : 0
      const fogOpacity = enableDepthFog ? clamp(1 - fogDistance * safeFog * .055, .42, 1) : 1
      card.style.transform = `translate3d(calc(-50% + ${translateX.toFixed(2)}px), calc(-50% + ${translateY.toFixed(2)}px), ${item.z.toFixed(2)}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) rotateZ(${(item.rotation + pointerX * item.depth * 1.5).toFixed(2)}deg) scale(${scale.toFixed(4)})`
      card.style.opacity = fogOpacity.toFixed(3)
      // Leave the property unset when fog is disabled so the CSS hover/focus
      // brightness treatment can still apply.
      card.style.filter = fogBlur ? `blur(${fogBlur.toFixed(2)}px)` : ''
      card.style.zIndex = String(10 + index)
    })
  }, [enableDepthFog, enableMagneticAttraction, safeFog, safeMagneticStrength, safeSensitivity])

  const stopPointerAnimation = useCallback(() => {
    const frame = pointerRef.current.frame
    if (frame) window.cancelAnimationFrame(frame)
    pointerRef.current.frame = 0
  }, [])

  const animatePointer = useCallback(() => {
    const pointer = pointerRef.current
    const dx = pointer.targetX - pointer.currentX
    const dy = pointer.targetY - pointer.currentY
    const easing = reducedMotionRef.current ? 1 : .14
    pointer.currentX += dx * easing
    pointer.currentY += dy * easing
    if (Math.abs(dx) < .001 && Math.abs(dy) < .001) {
      pointer.currentX = pointer.targetX
      pointer.currentY = pointer.targetY
    }
    applyPointer(pointer.currentX, pointer.currentY)
    if (Math.abs(pointer.targetX - pointer.currentX) > .001 || Math.abs(pointer.targetY - pointer.currentY) > .001) {
      pointer.frame = window.requestAnimationFrame(animatePointer)
    } else {
      pointer.frame = 0
    }
  }, [applyPointer])

  const setPointerTarget = useCallback((x, y) => {
    pointerRef.current.targetX = clamp(x, -1, 1)
    pointerRef.current.targetY = clamp(y, -1, 1)
    if (reducedMotionRef.current) {
      pointerRef.current.currentX = pointerRef.current.targetX
      pointerRef.current.currentY = pointerRef.current.targetY
      stopPointerAnimation()
      applyPointer(pointerRef.current.currentX, pointerRef.current.currentY)
      return
    }
    // Paint the target immediately so pointer feedback remains available even
    // when the browser throttles animation frames for a background tab.
    applyPointer(pointerRef.current.targetX, pointerRef.current.targetY)
    if (!pointerRef.current.frame) pointerRef.current.frame = window.requestAnimationFrame(animatePointer)
  }, [animatePointer, applyPointer, stopPointerAnimation])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const sync = () => {
      const matches = Boolean(query?.matches)
      reducedMotionRef.current = matches
      setReducedMotion(matches)
      if (matches) setPointerTarget(0, 0)
    }
    sync()
    query?.addEventListener?.('change', sync)
    return () => query?.removeEventListener?.('change', sync)
  }, [setPointerTarget])

  useEffect(() => {
    layoutRef.current = buildLayout()
    cardRefs.current = cardRefs.current.slice(0, visibleImages.length)
    // Apply the first frame synchronously as well as on the next animation
    // frame. This keeps the layered stack visible while a background tab is
    // throttling requestAnimationFrame.
    applyPointer(pointerRef.current.currentX, pointerRef.current.currentY)
    const frame = window.requestAnimationFrame(() => applyPointer(pointerRef.current.currentX, pointerRef.current.currentY))
    return () => window.cancelAnimationFrame(frame)
  }, [applyPointer, buildLayout, visibleImages.length])

  useEffect(() => () => stopPointerAnimation(), [stopPointerAnimation])

  useImperativeHandle(ref, () => ({
    reset: () => setPointerTarget(0, 0),
    setPointer: (x, y) => setPointerTarget(x, y),
  }), [setPointerTarget])

  const handlePointerMove = useCallback(event => {
    if (!rootRef.current || event.pointerType === 'touch') return
    const rect = rootRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    setPointerTarget(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1)
  }, [setPointerTarget])

  const handlePointerLeave = useCallback(() => {
    setHovered(false)
    setPointerTarget(0, 0)
  }, [setPointerTarget])

  const handleKeyDown = useCallback(event => {
    const step = .18
    const pointer = pointerRef.current
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const nextX = pointer.targetX + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0)
      const nextY = pointer.targetY + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)
      setPointerTarget(nextX, nextY)
    } else if (event.key === 'Home' || event.key === 'Escape') {
      event.preventDefault()
      setPointerTarget(0, 0)
    }
  }, [setPointerTarget])

  const rootStyle = {
    '--pc-perspective': `${safePerspective}px`,
    '--pc-card-width': cardWidth ? `${Math.max(90, finite(cardWidth, 176))}px` : 'clamp(112px, 14vw, 176px)',
    '--pc-card-height': cardHeight ? `${Math.max(140, finite(cardHeight, 246))}px` : 'clamp(158px, 20vw, 246px)',
    '--pc-animation-duration': `${safeDuration}s`,
    '--pc-mouse-sensitivity': safeSensitivity,
    '--pc-fog-intensity': safeFog,
    '--pc-magnetic-strength': `${safeMagneticStrength}px`,
  }

  return <div
    ref={rootRef}
    className={['parallax-cards', className].filter(Boolean).join(' ')}
    style={rootStyle}
    role="region"
    aria-label={ariaLabel}
    tabIndex={visibleImages.length ? 0 : -1}
    data-parallax-cards="true"
    data-parallax-cards-ready="true"
    data-parallax-cards-count={visibleImages.length}
    data-parallax-cards-perspective={safePerspective}
    data-parallax-cards-mouse-sensitivity={safeSensitivity}
    data-parallax-cards-animation-duration={safeDuration}
    data-parallax-cards-depth-fog={enableDepthFog ? 'true' : 'false'}
    data-parallax-cards-magnetic={enableMagneticAttraction ? 'true' : 'false'}
    data-parallax-cards-active-index={activeIndex}
    data-parallax-cards-reduced-motion={reducedMotion ? 'true' : 'false'}
    onPointerEnter={() => setHovered(true)}
    onPointerMove={handlePointerMove}
    onPointerLeave={handlePointerLeave}
    onFocus={() => setHovered(true)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) handlePointerLeave() }}
    onKeyDown={handleKeyDown}
  >
    <div ref={sceneRef} className="parallax-cards__scene" data-parallax-cards-scene data-hovered={hovered ? 'true' : 'false'}>
      {visibleImages.map((image, index) => <button
        key={`${image.id}-${index}`}
        ref={element => { cardRefs.current[index] = element }}
        type="button"
        className="parallax-cards__card"
        aria-label={`查看 ${image.alt}`}
        aria-pressed={activeIndex === index}
        data-parallax-card
        data-parallax-card-index={index}
        data-parallax-card-src={image.src}
        onClick={() => {
          setActiveIndex(index)
          onCardClick?.(index, image.src)
        }}
      >
        <span className="parallax-cards__media" aria-hidden="true">
          <img src={image.src} alt="" draggable="false" loading={index < 4 ? 'eager' : 'lazy'} />
        </span>
        <span className="parallax-cards__shade" aria-hidden="true" />
        <span className="parallax-cards__edge" aria-hidden="true" />
        <span className="parallax-cards__label" aria-hidden="true">{String(index + 1).padStart(2, '0')} / PARALLAX</span>
      </button>)}
      {!visibleImages.length && <div className="parallax-cards__empty">暂无可用图片</div>}
    </div>
    <span className="parallax-cards__light" aria-hidden="true" />
    <span className="parallax-cards__hint" aria-hidden="true">MOVE POINTER · FOCUS A CARD</span>
  </div>
})

export default ParallaxCards
