import { useEffect, useMemo, useRef } from 'react'

import './CircleGallery.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normaliseImages(images) {
  const seen = new Set()
  return (Array.isArray(images) ? images : []).map((item, index) => {
    const source = typeof item === 'string' ? item : item?.src || item?.image || item?.url || ''
    if (!source || seen.has(source)) return null
    seen.add(source)
    const label = typeof item === 'object' && item
      ? item.label || item.title || item.alt || `Image ${index + 1}`
      : `Image ${index + 1}`
    return {
      id: String(typeof item === 'object' && item ? item.id || source : source),
      src: String(source),
      label: String(label),
    }
  }).filter(Boolean)
}

/**
 * Local clean-room implementation of the public Circle Gallery contract.
 * Cards are placed around a flat circular track; the parent ring rotates while
 * each card counter-rotates so the artwork stays upright. Pointer releases
 * carry a damped velocity so the carousel keeps its inertia.
 */
export default function CircleGallery({
  images = [],
  radiusPercent = 38,
  itemWidth = 280,
  itemHeight = 400,
  itemScale = 0.85,
  borderRadius = 8,
  enableDrag = true,
  throwResistance = 0.35,
  animationDuration = 0.9,
  showNumbers = true,
  autoSpin = 0,
  className = '',
  itemClassName = '',
  onItemClick,
  ariaLabel = 'Circular image gallery',
  ...rest
}) {
  const rootRef = useRef(null)
  const ringRef = useRef(null)
  const itemRefs = useRef([])
  const angleRef = useRef(0)
  const velocityRef = useRef(0)
  const draggingRef = useRef(false)
  const ignoreClickRef = useRef(false)
  const pointerRef = useRef({ id: null, x: 0, y: 0, angle: 0, lastX: 0, lastY: 0, lastTime: 0, moved: false, captured: false })
  const radiusRef = useRef(120)
  const configRef = useRef({})
  const normalisedImages = useMemo(() => normaliseImages(images), [images])

  const config = {
    radiusPercent: clamp(finite(radiusPercent, 38), 10, 50),
    itemWidth: Math.max(72, finite(itemWidth, 280)),
    itemHeight: Math.max(88, finite(itemHeight, 400)),
    itemScale: clamp(finite(itemScale, 0.85), 0.5, 1.5),
    borderRadius: Math.max(0, finite(borderRadius, 8)),
    throwResistance: clamp(finite(throwResistance, 0.35), 0, 1),
    animationDuration: Math.max(0.05, finite(animationDuration, 0.9)),
    autoSpin: finite(autoSpin, 0),
  }
  configRef.current = config

  const rootStyle = {
    '--circle-item-width': `${config.itemWidth}px`,
    '--circle-item-height': `${config.itemHeight}px`,
    '--circle-item-scale': String(config.itemScale),
    '--circle-border-radius': `${config.borderRadius}px`,
    '--circle-intro-duration': `${config.animationDuration}s`,
    '--circle-radius': `${radiusRef.current}px`,
    ...rest.style,
  }

  useEffect(() => {
    const root = rootRef.current
    const ring = ringRef.current
    if (!root || !ring) return undefined

    const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
    let frameId = 0
    let lastFrame = performance.now()
    let disposed = false

    const applyItemLayout = (rotation = angleRef.current) => {
      const radius = radiusRef.current
      const count = Math.max(normalisedImages.length, 1)
      itemRefs.current.forEach((item, index) => {
        if (!item) return
        const itemAngle = (360 / count) * index
        const radians = itemAngle * Math.PI / 180
        const x = Math.cos(radians) * radius
        const y = Math.sin(radians) * radius
        item.style.transform = `translate(-50%, -50%) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${(-rotation).toFixed(3)}deg) scale(${configRef.current.itemScale})`
      })
    }

    const setAngle = value => {
      const normalised = ((value % 360) + 360) % 360
      angleRef.current = normalised
      ring.style.transform = `rotate(${normalised.toFixed(3)}deg)`
      applyItemLayout(normalised)
      root.dataset.circleAngle = normalised.toFixed(2)
    }

    const resize = () => {
      const rect = root.getBoundingClientRect()
      const minDimension = Math.min(Math.max(rect.width, 1), Math.max(rect.height, 1))
      // The public control is proportional to the available viewport height;
      // using the local stage keeps that behavior when the gallery is embedded
      // in a two-column studio panel.
      radiusRef.current = Math.max(24, rect.height * configRef.current.radiusPercent / 100)
      root.style.setProperty('--circle-radius', `${radiusRef.current.toFixed(2)}px`)
      applyItemLayout(angleRef.current)
    }

    const frame = now => {
      if (disposed) return
      const elapsed = Math.min(64, Math.max(0, now - lastFrame))
      lastFrame = now
      const cfg = configRef.current
      if (!draggingRef.current) {
        if (Math.abs(velocityRef.current) > 0.001) {
          setAngle(angleRef.current + velocityRef.current * elapsed)
          // The public contract describes lower resistance as more momentum:
          // lower values therefore keep a larger fraction of velocity per frame.
          const decay = clamp(0.98 - cfg.throwResistance * 0.12, 0.86, 0.98)
          velocityRef.current *= Math.pow(decay, elapsed / 16.67)
        } else if (!reducedMotion && cfg.autoSpin) {
          setAngle(angleRef.current + cfg.autoSpin * elapsed / 1000)
        }
      }
      frameId = window.requestAnimationFrame(frame)
    }

    const pointerDown = event => {
      if (!configRef.current || !enableDrag || event.button !== 0) return
      draggingRef.current = true
      ignoreClickRef.current = false
      velocityRef.current = 0
      pointerRef.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        angle: angleRef.current,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: performance.now(),
        moved: false,
        captured: false,
      }
      root.setPointerCapture?.(event.pointerId)
      pointerRef.current.captured = true
      root.dataset.circleDragging = 'true'
    }

    const pointerMove = event => {
      const pointer = pointerRef.current
      if (!enableDrag || !draggingRef.current || pointer.id !== event.pointerId) return
      const deltaX = event.clientX - pointer.x
      const deltaY = event.clientY - pointer.y
      const distance = Math.abs(deltaX) + Math.abs(deltaY)
      if (distance > 5) pointer.moved = true
      const nextAngle = pointer.angle + deltaX * 0.42 + deltaY * 0.16
      const now = performance.now()
      const dt = Math.max(8, now - pointer.lastTime)
      const frameDelta = (event.clientX - pointer.lastX) * 0.42 + (event.clientY - pointer.lastY) * 0.16
      velocityRef.current = frameDelta / dt
      pointer.lastX = event.clientX
      pointer.lastY = event.clientY
      pointer.lastTime = now
      setAngle(nextAngle)
      event.preventDefault()
    }

    const pointerUp = event => {
      const pointer = pointerRef.current
      if (!enableDrag || !draggingRef.current || pointer.id !== event.pointerId) return
      draggingRef.current = false
      ignoreClickRef.current = pointer.moved
      if (pointer.captured) root.releasePointerCapture?.(event.pointerId)
      root.dataset.circleDragging = 'false'
      root.dataset.circleMoved = pointer.moved ? 'true' : 'false'
      pointerRef.current = { id: null, x: 0, y: 0, angle: angleRef.current, lastX: 0, lastY: 0, lastTime: 0, moved: false, captured: false }
    }

    const keyDown = event => {
      if (!normalisedImages.length) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const direction = event.key === 'ArrowLeft' ? -1 : 1
        velocityRef.current = 0
        setAngle(angleRef.current + direction * (360 / normalisedImages.length))
      }
    }

    root.dataset.circleReady = 'false'
    root.dataset.circleDragging = 'false'
    root.dataset.circleCount = String(normalisedImages.length)
    resize()
    applyItemLayout(angleRef.current)
    setAngle(angleRef.current)
    root.addEventListener('pointerdown', pointerDown)
    root.addEventListener('pointermove', pointerMove)
    root.addEventListener('pointerup', pointerUp)
    root.addEventListener('pointercancel', pointerUp)
    root.addEventListener('keydown', keyDown)
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    resizeObserver?.observe(root)
    window.addEventListener('resize', resize)
    frameId = window.requestAnimationFrame(frame)
    const readyTimer = window.setTimeout(() => {
      if (!disposed) root.dataset.circleReady = 'true'
    }, reducedMotion ? 0 : configRef.current.animationDuration * 1000)

    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(readyTimer)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      root.removeEventListener('pointerdown', pointerDown)
      root.removeEventListener('pointermove', pointerMove)
      root.removeEventListener('pointerup', pointerUp)
      root.removeEventListener('pointercancel', pointerUp)
      root.removeEventListener('keydown', keyDown)
    }
  }, [
    enableDrag,
    normalisedImages,
    config.radiusPercent,
    config.itemScale,
    config.throwResistance,
    config.animationDuration,
    config.autoSpin,
  ])

  const handleCardClick = (event, item, index) => {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false
      event.preventDefault()
      return
    }
    onItemClick?.(index, item.src)
  }

  return <div
    {...rest}
    ref={rootRef}
    className={`circle-gallery ${className}`.trim()}
    style={rootStyle}
    tabIndex={enableDrag ? 0 : undefined}
    role="region"
    aria-roledescription="carousel"
    aria-label={ariaLabel}
    data-circle-gallery
  >
    <div className="circle-gallery__scene">
      <div ref={ringRef} className="circle-gallery__ring">
        {normalisedImages.map((item, index) => {
          return <button
            key={item.id}
            type="button"
            className={`circle-gallery__item ${itemClassName}`.trim()}
            ref={node => { itemRefs.current[index] = node }}
            style={{ '--circle-index': index }}
            aria-label={`${showNumbers ? `${String(index + 1).padStart(3, '0')} ` : ''}${item.label}`}
            data-circle-gallery-item
            data-circle-gallery-index={index}
            data-circle-gallery-image={item.src}
            onClick={event => handleCardClick(event, item, index)}
          >
            <img src={item.src} alt="" draggable="false" loading="lazy" decoding="async" />
            <span className="circle-gallery__shade" aria-hidden="true" />
            {showNumbers && <span className="circle-gallery__number" aria-hidden="true">{String(index + 1).padStart(3, '0')}</span>}
          </button>
        })}
      </div>
    </div>
  </div>
}
