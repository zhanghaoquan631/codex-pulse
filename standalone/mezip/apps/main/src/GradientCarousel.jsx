import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import './GradientCarousel.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const mod = (value, size) => size ? ((value % size) + size) % size : 0

const fallbackPalette = index => {
  const hue = mod(index * 47 + 28, 360)
  return [
    `hsl(${hue} 78% 58%)`,
    `hsl(${mod(hue + 46, 360)} 72% 42%)`,
  ]
}

const normalizeImages = images => (Array.isArray(images) ? images : [])
  .map((item, index) => {
    const src = typeof item === 'string' ? item : item?.src || item?.image || item?.url || ''
    const alt = typeof item === 'object' && item
      ? item.alt || item.label || item.title || `Carousel image ${index + 1}`
      : `Carousel image ${index + 1}`
    return { src: String(src), alt: String(alt), id: item?.id || src || index }
  })
  .filter(item => item.src)

const sampleImagePalette = (image, fallback) => {
  try {
    const canvas = document.createElement('canvas')
    const size = 48
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return fallback
    context.drawImage(image, 0, 0, size, size)
    const { data } = context.getImageData(0, 0, size, size)
    const buckets = new Map()
    for (let index = 0; index < data.length; index += 16) {
      const alpha = data[index + 3]
      if (alpha < 100) continue
      const red = Math.round(data[index] / 32) * 32
      const green = Math.round(data[index + 1] / 32) * 32
      const blue = Math.round(data[index + 2] / 32) * 32
      const key = `${red},${green},${blue}`
      buckets.set(key, (buckets.get(key) || 0) + 1)
    }
    const colors = [...buckets.entries()]
      .sort((first, second) => second[1] - first[1])
      .slice(0, 2)
      .map(([key]) => {
        const [red, green, blue] = key.split(',').map(Number)
        return `rgb(${red}, ${green}, ${blue})`
      })
    return colors.length === 2 ? colors : colors.length === 1 ? [colors[0], fallback[1]] : fallback
  } catch {
    // Remote images without CORS headers can taint the sampling canvas. The
    // visual carousel still works with a deterministic fallback palette.
    return fallback
  }
}

const readPalette = (item, index) => new Promise(resolve => {
  const fallback = fallbackPalette(index)
  const image = new Image()
  let settled = false
  const finish = palette => {
    if (settled) return
    settled = true
    resolve(palette)
  }
  image.crossOrigin = 'anonymous'
  image.onload = () => finish(sampleImagePalette(image, fallback))
  image.onerror = () => finish(fallback)
  image.src = item.src
  if (image.complete) {
    queueMicrotask(() => finish(image.naturalWidth ? sampleImagePalette(image, fallback) : fallback))
  }
})

const parseColor = color => {
  const probe = document.createElement('canvas')
  const context = probe.getContext('2d')
  if (!context) return [128, 128, 128]
  context.fillStyle = color
  const normalized = context.fillStyle
  const match = normalized.match(/rgba?\(([^)]+)\)/)
  if (!match) return [128, 128, 128]
  return match[1].split(',').slice(0, 3).map(value => Number.parseFloat(value.trim()) || 0)
}

const mix = (from, to, amount) => from.map((value, index) => value + (to[index] - value) * amount)

const drawGradient = (canvas, palette, progress, size, intensity, dpr) => {
  const width = canvas.clientWidth || 1
  const height = canvas.clientHeight || 1
  const targetWidth = Math.max(1, Math.round(width * dpr))
  const targetHeight = Math.max(1, Math.round(height * dpr))
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
  }
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#0a0a0a'
  context.fillRect(0, 0, width, height)

  const first = parseColor(palette[0])
  const second = parseColor(palette[1])
  const drift = Math.sin(progress * Math.PI * 2) * 0.08
  const radius = Math.max(width, height) * (0.42 + size * 0.62)
  const alpha = clamp(intensity, 0, 1) * 0.72
  const left = context.createRadialGradient(width * (0.22 + drift), height * 0.22, 0, width * (0.22 + drift), height * 0.22, radius)
  left.addColorStop(0, `rgba(${first.join(',')}, ${alpha})`)
  left.addColorStop(0.55, `rgba(${first.join(',')}, ${alpha * 0.28})`)
  left.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = left
  context.fillRect(0, 0, width, height)

  const right = context.createRadialGradient(width * (0.78 - drift), height * 0.76, 0, width * (0.78 - drift), height * 0.76, radius)
  right.addColorStop(0, `rgba(${second.join(',')}, ${alpha})`)
  right.addColorStop(0.58, `rgba(${second.join(',')}, ${alpha * 0.3})`)
  right.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = right
  context.fillRect(0, 0, width, height)

  const wash = context.createLinearGradient(0, 0, width, height)
  wash.addColorStop(0, 'rgba(255,255,255,.06)')
  wash.addColorStop(0.5, 'rgba(255,255,255,0)')
  wash.addColorStop(1, 'rgba(0,0,0,.2)')
  context.fillStyle = wash
  context.fillRect(0, 0, width, height)
}

/**
 * Clean-room implementation of the public Gradient Carousel interaction
 * contract: a looping 3D card plane, inertial wheel/drag input, keyboard
 * navigation, and a canvas gradient derived from the active image palette.
 */
const GradientCarousel = forwardRef(function GradientCarousel({
  images,
  className = '',
  maxRotationDegrees = 28,
  maxDepthPx = 140,
  minScale = 0.92,
  cardGap = 28,
  frictionFactor = 0.9,
  wheelSensitivity = 0.6,
  dragSensitivity = 1,
  backgroundBlur = 24,
  gradientSize = 0.65,
  gradientIntensity = 0.7,
  enableKeyboard = true,
  cardAspectRatio = 0.8,
  initialIndex = 0,
  onCardChange,
}, ref) {
  const normalizedImages = useMemo(() => normalizeImages(images), [images])
  const count = normalizedImages.length
  const safeRotation = Math.max(0, Number(maxRotationDegrees) || 28)
  const safeDepth = Math.max(0, Number(maxDepthPx) || 140)
  const safeScale = clamp(Number(minScale) || 0.92, 0.5, 1)
  const safeGap = Math.max(0, Number(cardGap) || 28)
  const safeFriction = clamp(Number(frictionFactor) || 0.9, 0.5, 0.99)
  const safeWheel = clamp(Number(wheelSensitivity) || 0.6, 0.1, 2)
  const safeDrag = clamp(Number(dragSensitivity) || 1, 0.5, 2)
  const safeBlur = Math.max(0, Number(backgroundBlur) || 24)
  const safeSize = clamp(Number(gradientSize) || 0.65, 0.3, 1)
  const safeIntensity = clamp(Number(gradientIntensity) || 0.7, 0, 1)
  const safeRatio = Math.max(0.35, Number(cardAspectRatio) || 0.8)

  const viewportRef = useRef(null)
  const canvasRef = useRef(null)
  const cardRefs = useRef([])
  const frameRef = useRef(0)
  const lastTimeRef = useRef(0)
  const metricsRef = useRef({ width: 320, step: 348, dpr: 1 })
  const motionRef = useRef({
    position: 0,
    velocity: 0,
    targetPosition: null,
    dragging: false,
    startX: 0,
    startPosition: 0,
    lastX: 0,
    lastTime: 0,
  })
  const paletteRef = useRef([])
  const currentGradientRef = useRef(null)
  const targetGradientRef = useRef(null)
  const onCardChangeRef = useRef(onCardChange)
  const [activeIndex, setActiveIndex] = useState(() => count ? mod(Math.round(Number(initialIndex) || 0), count) : 0)
  const [dragging, setDragging] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => { onCardChangeRef.current = onCardChange }, [onCardChange])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(Boolean(query?.matches))
    sync()
    query?.addEventListener?.('change', sync)
    return () => query?.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoaded(!count)
    if (!count) {
      paletteRef.current = []
      return undefined
    }
    Promise.all(normalizedImages.map((item, index) => readPalette(item, index))).then(next => {
      if (cancelled) return
      paletteRef.current = next
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [count, normalizedImages])

  useEffect(() => {
    const next = count ? mod(Math.round(Number(initialIndex) || 0), count) : 0
    motionRef.current.position = next
    motionRef.current.velocity = 0
    motionRef.current.targetPosition = null
    setActiveIndex(next)
  }, [count, initialIndex])

  const measure = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const card = cardRefs.current[0]
    const width = card?.offsetWidth || Math.min(viewport.clientWidth * 0.26, 360) || 320
    metricsRef.current = {
      width,
      step: Math.max(1, width + safeGap),
      dpr: Math.min(2, window.devicePixelRatio || 1),
    }
  }, [safeGap])

  const updateActive = useCallback((position) => {
    if (!count) return
    const next = mod(Math.round(position / metricsRef.current.step), count)
    setActiveIndex(current => current === next ? current : next)
  }, [count])

  const applyCards = useCallback((position) => {
    if (!count) return
    const step = metricsRef.current.step
    const spread = Math.max(1, count / 2)
    cardRefs.current.forEach((card, index) => {
      if (!card) return
      let distance = index * step - position
      while (distance > count * step / 2) distance -= count * step
      while (distance < -count * step / 2) distance += count * step
      const normalized = clamp(distance / (spread * step), -1, 1)
      const proximity = 1 - Math.min(1, Math.abs(normalized))
      const rotation = -normalized * safeRotation
      const depth = proximity * safeDepth
      const scale = safeScale + (1 - safeScale) * proximity
      const blur = Math.pow(Math.abs(normalized), 1.1) * 2
      card.style.transform = `translate3d(calc(-50% + ${distance.toFixed(2)}px), -50%, ${depth.toFixed(2)}px) rotateY(${rotation.toFixed(2)}deg) scale(${scale.toFixed(4)})`
      card.style.filter = `blur(${blur.toFixed(2)}px)`
      card.style.opacity = String(0.64 + proximity * 0.36)
      card.style.zIndex = String(Math.round(proximity * 100))
      card.dataset.active = proximity > 0.96 ? 'true' : 'false'
    })
  }, [count, safeDepth, safeRotation, safeScale])

  const drawFrame = useCallback((timestamp) => {
    if (!viewportRef.current || !count) return
    const previous = lastTimeRef.current || timestamp
    const delta = Math.min(0.08, Math.max(0, (timestamp - previous) / 1000))
    lastTimeRef.current = timestamp
    measure()
    const state = motionRef.current
    if (!state.dragging) {
      if (state.targetPosition !== null) {
        const distance = state.targetPosition - state.position
        const blend = reducedMotion ? 1 : clamp(delta * 12, 0, 1)
        state.position += distance * blend
        state.velocity = 0
        if (Math.abs(distance) < 0.35) {
          state.position = state.targetPosition
          state.targetPosition = null
        }
      } else if (!reducedMotion) {
        state.position += state.velocity * delta * 60
        state.velocity *= Math.pow(safeFriction, delta * 60)
        if (Math.abs(state.velocity) < 0.005) state.velocity = 0
        if (state.velocity === 0) {
          const nearest = Math.round(state.position / metricsRef.current.step)
          const snap = nearest * metricsRef.current.step
          if (Math.abs(snap - state.position) > 0.35) state.targetPosition = snap
        }
      } else {
        state.velocity = 0
        state.position = Math.round(state.position / metricsRef.current.step) * metricsRef.current.step
      }
    }
    applyCards(state.position)
    updateActive(state.position)

    const activePalette = paletteRef.current[activeIndex] || fallbackPalette(activeIndex)
    const desired = activePalette.map(parseColor)
    if (!currentGradientRef.current) currentGradientRef.current = desired
    if (!targetGradientRef.current) targetGradientRef.current = desired
    targetGradientRef.current = desired
    const blend = reducedMotion ? 1 : Math.min(1, delta * 4.8)
    currentGradientRef.current = currentGradientRef.current.map((color, index) => mix(color, desired[index], blend))
    const palette = currentGradientRef.current.map(color => `rgb(${color.map(value => Math.round(value)).join(',')})`)
    if (canvasRef.current) {
      drawGradient(canvasRef.current, palette, timestamp / 12000, safeSize, safeIntensity, metricsRef.current.dpr)
    }
    frameRef.current = requestAnimationFrame(drawFrame)
  }, [activeIndex, applyCards, count, measure, reducedMotion, safeFriction, safeIntensity, safeSize, updateActive])

  useEffect(() => {
    if (!count) return undefined
    measure()
    frameRef.current = requestAnimationFrame(drawFrame)
    const resizeObserver = typeof ResizeObserver === 'function' && viewportRef.current
      ? new ResizeObserver(measure)
      : null
    if (resizeObserver) resizeObserver.observe(viewportRef.current)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
      resizeObserver?.disconnect()
      lastTimeRef.current = 0
    }
  }, [count, drawFrame, measure])

  useEffect(() => {
    onCardChangeRef.current?.(activeIndex)
  }, [activeIndex])

  const focusIndex = useCallback((index) => {
    if (!count) return
    const current = Math.round(motionRef.current.position / metricsRef.current.step)
    const raw = mod(index, count) - mod(current, count)
    const shortest = ((raw + count / 2) % count) - count / 2
    motionRef.current.targetPosition = (current + shortest) * metricsRef.current.step
    motionRef.current.velocity = 0
  }, [count])

  const handleWheel = useCallback(event => {
    if (!count) return
    event.preventDefault()
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    motionRef.current.targetPosition = null
    motionRef.current.velocity += delta * safeWheel * 0.42
  }, [count, safeWheel])

  const handlePointerDown = useCallback(event => {
    if (!count) return
    const state = motionRef.current
    state.dragging = true
    state.startX = event.clientX
    state.lastX = event.clientX
    state.startPosition = state.position
    state.lastTime = performance.now()
    state.velocity = 0
    state.targetPosition = null
    setDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [count])

  const handlePointerMove = useCallback(event => {
    const state = motionRef.current
    if (!state.dragging || !count) return
    const now = performance.now()
    const deltaX = event.clientX - state.startX
    const frameDelta = event.clientX - state.lastX
    const elapsed = Math.max(8, now - state.lastTime)
    state.position = state.startPosition - deltaX * safeDrag
    state.velocity = -(frameDelta * safeDrag) / elapsed * 16
    state.lastX = event.clientX
    state.lastTime = now
  }, [count, safeDrag])

  const finishPointer = useCallback(event => {
    const state = motionRef.current
    if (!state.dragging) return
    state.dragging = false
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      // The browser may have released the pointer during a cancellation.
    }
    setDragging(false)
  }, [])

  const handleKeyDown = useCallback(event => {
    if (!enableKeyboard || !count) return
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault()
      const current = Math.round(motionRef.current.position / metricsRef.current.step)
      motionRef.current.targetPosition = (current + 1) * metricsRef.current.step
      motionRef.current.velocity = 0
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      const current = Math.round(motionRef.current.position / metricsRef.current.step)
      motionRef.current.targetPosition = (current - 1) * metricsRef.current.step
      motionRef.current.velocity = 0
    }
  }, [count, enableKeyboard])

  useImperativeHandle(ref, () => ({
    next: () => focusIndex(Math.round(motionRef.current.position / metricsRef.current.step) + 1),
    previous: () => focusIndex(Math.round(motionRef.current.position / metricsRef.current.step) - 1),
    scrollToIndex: focusIndex,
    reset: () => {
      motionRef.current.position = 0
      motionRef.current.velocity = 0
      motionRef.current.targetPosition = null
      setActiveIndex(0)
    },
  }), [focusIndex])

  const rootClass = ['gradient-carousel', dragging ? 'is-dragging' : '', className].filter(Boolean).join(' ')

  return <div
    ref={viewportRef}
    className={rootClass}
    style={{
      '--gc-card-gap': `${safeGap}px`,
      '--gc-card-ratio': safeRatio,
      '--gc-blur': `${safeBlur}px`,
    }}
    role="region"
    aria-label="Gradient Carousel"
    tabIndex={enableKeyboard ? 0 : undefined}
    data-loaded={loaded}
    data-active-index={activeIndex}
    onKeyDown={handleKeyDown}
    onWheel={handleWheel}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={finishPointer}
    onPointerCancel={finishPointer}
  >
    <canvas ref={canvasRef} className="gradient-carousel__background" aria-hidden="true" />
    {!loaded && <div className="gradient-carousel__loader" aria-live="polite"><span />加载影像色彩…</div>}
    <div className="gradient-carousel__cards" aria-live="polite">
      {normalizedImages.map((item, index) => <button
        ref={element => { cardRefs.current[index] = element }}
        className="gradient-carousel__card"
        type="button"
        key={`${item.id}-${index}`}
        aria-label={`聚焦${item.alt}`}
        data-gradient-card-index={index}
        data-active="false"
      >
        <img src={item.src} alt={item.alt} draggable={false} loading="lazy" decoding="async" />
      </button>)}
    </div>
    <div className="gradient-carousel__hint" aria-hidden="true">DRAG / WHEEL · ARROW KEYS</div>
  </div>
})

export default GradientCarousel
