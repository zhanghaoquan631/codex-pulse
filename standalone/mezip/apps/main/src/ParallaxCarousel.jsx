import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import './ParallaxCarousel.css'

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeImages(images) {
  return (Array.isArray(images) ? images : []).map((item, index) => {
    const source = typeof item === 'string' ? item : item?.src || item?.image || item?.url || ''
    const alt = typeof item === 'object' && item ? item.alt || item.label || item.title || `Carousel image ${index + 1}` : `Carousel image ${index + 1}`
    return { src: String(source), alt: String(alt), id: typeof item === 'object' && item ? item.id || source || index : source || index }
  }).filter(item => item.src)
}

/**
 * Clean-room DOM implementation of the public Parallax Carousel contract.
 * A smoothed horizontal plane track is paired with counter-shifted textures,
 * wheel/drag input, optional looping/autoplay, and an accessible progress rail.
 */
const ParallaxCarousel = forwardRef(function ParallaxCarousel({
  images,
  imageWidth = 420,
  imageHeight = 560,
  gap = 32,
  parallaxIntensity = 0.4,
  uvScale = 0.85,
  lerp = 0.08,
  wheelSensitivity = 1,
  dragSensitivity = 1.4,
  loop = false,
  borderRadius = 16,
  autoplaySpeed = 0,
  pauseOnHover = true,
  showProgress = true,
  className = '',
  onIndexChange,
}, ref) {
  const normalizedImages = useMemo(() => normalizeImages(images), [images])
  const safeWidth = Math.max(140, finite(imageWidth, 420))
  const safeHeight = Math.max(180, finite(imageHeight, 560))
  const safeGap = Math.max(0, finite(gap, 32))
  const safeParallax = clamp(finite(parallaxIntensity, 0.4), 0, 1)
  const safeUvScale = clamp(finite(uvScale, 0.85), 0.6, 1)
  const safeLerp = clamp(finite(lerp, 0.08), 0.01, 1)
  const safeWheel = Math.max(0, finite(wheelSensitivity, 1))
  const safeDrag = Math.max(0, finite(dragSensitivity, 1.4))
  const safeRadius = Math.max(0, finite(borderRadius, 16))
  const safeAutoplay = finite(autoplaySpeed, 0)

  const viewportRef = useRef(null)
  const trackRef = useRef(null)
  const cardRefs = useRef([])
  const imageRefs = useRef([])
  const metricsRef = useRef({ step: safeWidth + safeGap, sidePad: 0, viewportWidth: 0 })
  const positionRef = useRef({ target: 0, current: 0 })
  const interactionRef = useRef({ dragging: false, hovered: false, startX: 0, startTarget: 0, moved: false })
  const captureRef = useRef(null)
  const suppressClickRef = useRef(false)
  const frameRef = useRef(0)
  const lastTimeRef = useRef(0)
  const mountedRef = useRef(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  const count = normalizedImages.length

  const normalizeTarget = useCallback((value) => {
    if (!count) return 0
    if (loop) {
      let next = value % count
      if (next < 0) next += count
      return next
    }
    return clamp(value, 0, Math.max(0, count - 1))
  }, [count, loop])

  const setTarget = useCallback((value) => {
    positionRef.current.target = normalizeTarget(value)
  }, [normalizeTarget])

  const scrollToIndex = useCallback((index) => {
    setTarget(Math.round(finite(index, 0)))
  }, [setTarget])

  const reset = useCallback(() => {
    positionRef.current.target = 0
    positionRef.current.current = 0
    setActiveIndex(0)
  }, [])

  useImperativeHandle(ref, () => ({ scrollToIndex, reset }), [reset, scrollToIndex])

  useEffect(() => {
    positionRef.current.target = count ? normalizeTarget(positionRef.current.target) : 0
    positionRef.current.current = count ? normalizeTarget(positionRef.current.current) : 0
    setActiveIndex(count ? Math.round(normalizeTarget(positionRef.current.current)) : 0)
  }, [count, normalizeTarget])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(Boolean(query?.matches))
    sync()
    query?.addEventListener?.('change', sync)
    return () => query?.removeEventListener?.('change', sync)
  }, [])

  const measure = useCallback(() => {
    const viewport = viewportRef.current
    const firstCard = cardRefs.current[0]
    if (!viewport) return
    const viewportWidth = viewport.clientWidth || 0
    // offsetWidth is not affected by the card's live scale/rotation. Using
    // bounding boxes here would make the step shrink as cards move away from
    // centre and gradually pull the active image off-axis.
    const actualWidth = firstCard?.offsetWidth || safeWidth
    const actualGap = safeGap
    metricsRef.current = {
      step: Math.max(1, actualWidth + actualGap),
      sidePad: Math.max(0, (viewportWidth - actualWidth) / 2),
      viewportWidth,
    }
  }, [normalizedImages.length, safeGap, safeWidth])

  const applyFrame = useCallback((timestamp) => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track || !count) return
    const previousTime = lastTimeRef.current || timestamp
    const deltaSeconds = Math.min(0.08, Math.max(0, (timestamp - previousTime) / 1000))
    lastTimeRef.current = timestamp
    measure()
    const metrics = metricsRef.current
    const interaction = interactionRef.current
    // Keep the visual track position under the component's lerp control;
    // browser auto-scroll can otherwise nudge the hidden overflow container
    // when an off-centre card receives keyboard focus.
    if (viewport.scrollLeft) viewport.scrollLeft = 0
    if (safeAutoplay && !interaction.dragging && !(pauseOnHover && interaction.hovered)) {
      positionRef.current.target = normalizeTarget(positionRef.current.target + (safeAutoplay * deltaSeconds) / metrics.step)
    }
    const position = positionRef.current
    if (reducedMotion) position.current = position.target
    else position.current += (position.target - position.current) * safeLerp
    if (Math.abs(position.target - position.current) < 0.0005) position.current = position.target

    track.style.transform = `translate3d(${(metrics.sidePad - position.current * metrics.step).toFixed(3)}px, 0, 0)`
    const progressRatio = count > 1 ? clamp(position.current / (count - 1), 0, 1) : 0
    viewport.style.setProperty('--parallax-progress', String(progressRatio))
    viewport.style.setProperty('--parallax-position', String(position.current))
    imageRefs.current.forEach((image, index) => {
      const card = cardRefs.current[index]
      if (!image || !card) return
      const distance = index - position.current
      const normalizedDistance = clamp(distance / 2.4, -1, 1)
      const textureShift = -distance * safeParallax * (metrics.step * 0.18)
      const imageScale = 1 / safeUvScale
      const cardScale = 1 - Math.min(0.12, Math.abs(distance) * 0.035)
      const cardLift = Math.min(12, Math.abs(distance) * 3.2)
      card.style.setProperty('--parallax-distance', distance.toFixed(4))
      card.style.setProperty('--parallax-card-scale', cardScale.toFixed(4))
      card.style.setProperty('--parallax-card-lift', `${cardLift.toFixed(2)}px`)
      card.style.setProperty('--parallax-card-rotate', `${(-normalizedDistance * 4.2).toFixed(3)}deg`)
      // Keep the CSS top:50% vertical centering while shifting the texture
      // horizontally to create the parallax counter-motion.
      image.style.transform = `translate3d(calc(-50% + ${textureShift.toFixed(2)}px), -50%, 0) scale(${imageScale.toFixed(4)})`
    })
    const nextActive = normalizeTarget(Math.round(position.current))
    setActiveIndex(current => current === nextActive ? current : nextActive)
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(applyFrame)
  }, [count, measure, normalizeTarget, pauseOnHover, reducedMotion, safeAutoplay, safeLerp, safeParallax, safeUvScale])

  useEffect(() => {
    if (!count) return undefined
    measure()
    frameRef.current = requestAnimationFrame(applyFrame)
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    if (resizeObserver && viewportRef.current) resizeObserver.observe(viewportRef.current)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
      resizeObserver?.disconnect()
    }
  }, [applyFrame, count, measure])

  useEffect(() => {
    if (mountedRef.current) onIndexChange?.(activeIndex)
    else mountedRef.current = true
  }, [activeIndex, onIndexChange])

  const handleWheel = useCallback((event) => {
    if (!count) return
    event.preventDefault()
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!delta) return
    const step = metricsRef.current.step || safeWidth + safeGap
    setTarget(positionRef.current.target + (delta * safeWheel) / step)
  }, [count, safeGap, safeWheel, safeWidth, setTarget])

  const handlePointerDown = useCallback((event) => {
    if (!count) return
    const interaction = interactionRef.current
    interaction.dragging = true
    interaction.startX = event.clientX
    interaction.startTarget = positionRef.current.target
    interaction.moved = false
    suppressClickRef.current = false
    setDragging(true)
    const captureTarget = event.target && typeof event.target.setPointerCapture === 'function' ? event.target : event.currentTarget
    captureTarget.setPointerCapture?.(event.pointerId)
    captureRef.current = captureTarget
  }, [count])

  const handlePointerMove = useCallback((event) => {
    const interaction = interactionRef.current
    if (!interaction.dragging || !count) return
    const delta = event.clientX - interaction.startX
    const step = metricsRef.current.step || safeWidth + safeGap
    interaction.moved = interaction.moved || Math.abs(delta) > 5
    setTarget(interaction.startTarget - (delta * safeDrag) / step)
  }, [count, safeDrag, safeGap, safeWidth, setTarget])

  const finishPointer = useCallback((event, cancelled = false) => {
    const interaction = interactionRef.current
    if (!interaction.dragging) return
    captureRef.current?.releasePointerCapture?.(event.pointerId)
    captureRef.current = null
    suppressClickRef.current = Boolean(interaction.moved)
    interaction.dragging = false
    setDragging(false)
    if (cancelled) setTarget(interaction.startTarget)
  }, [setTarget])

  const handlePointerEnter = useCallback(() => {
    interactionRef.current.hovered = true
  }, [])

  const handlePointerLeave = useCallback(() => {
    interactionRef.current.hovered = false
  }, [])

  const handleCardClick = useCallback((index, event) => {
    if (suppressClickRef.current || interactionRef.current.moved) {
      event.preventDefault()
      suppressClickRef.current = false
      interactionRef.current.moved = false
      return
    }
    scrollToIndex(index)
  }, [scrollToIndex])

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault()
      setTarget(positionRef.current.target + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      setTarget(positionRef.current.target - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      reset()
    } else if (event.key === 'End') {
      event.preventDefault()
      setTarget(count - 1)
    }
  }, [count, reset, setTarget])

  const rootStyle = {
    '--parallax-image-width': `${safeWidth}px`,
    '--parallax-image-height': `${safeHeight}px`,
    '--parallax-gap': `${safeGap}px`,
    '--parallax-radius': `${safeRadius}px`,
    '--parallax-lerp': String(safeLerp),
    '--parallax-uv-scale': String(safeUvScale),
  }

  return <div
    className={`parallax-carousel ${dragging ? 'is-dragging' : ''} ${className}`.trim()}
    style={rootStyle}
    role="region"
    aria-roledescription="carousel"
    aria-label="Parallax image carousel"
    tabIndex={0}
    onKeyDown={handleKeyDown}
  >
    <div
      ref={viewportRef}
      className="parallax-carousel__viewport"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={event => finishPointer(event)}
      onPointerCancel={event => finishPointer(event, true)}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      data-parallax-viewport
    >
      <div ref={trackRef} className="parallax-carousel__track">
        {normalizedImages.map((image, index) => <button
          key={image.id || `${image.src}-${index}`}
          ref={node => { cardRefs.current[index] = node }}
          type="button"
          className={`parallax-carousel__card ${activeIndex === index ? 'is-active' : ''}`}
          aria-label={image.alt}
          onClick={event => handleCardClick(index, event)}
          data-parallax-card={index}
        >
          <img
            ref={node => { imageRefs.current[index] = node }}
            src={image.src}
            alt={image.alt}
            draggable="false"
            loading={index < 2 ? 'eager' : 'lazy'}
          />
          <span className="parallax-carousel__shade" aria-hidden="true" />
        </button>)}
      </div>
      {showProgress && !loop && count > 1 && <div className="parallax-carousel__progress" role="progressbar" aria-label="Carousel progress" aria-valuemin={0} aria-valuemax={count - 1} aria-valuenow={activeIndex}>
        <span style={{ transform: `scaleX(${count > 1 ? activeIndex / (count - 1) : 0})` }} />
      </div>}
    </div>
  </div>
})

export default ParallaxCarousel
