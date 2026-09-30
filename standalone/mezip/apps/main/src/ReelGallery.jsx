import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import './ReelGallery.css'

const MAX_ROWS = 12
const MIN_SEQUENCE_LENGTH = 10
const MAX_SEQUENCE_LENGTH = 22

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const mod = (value, size) => size ? ((value % size) + size) % size : 0

const normalizeImages = images => {
  const seen = new Set()
  return (Array.isArray(images) ? images : []).map((item, index) => {
    const source = typeof item === 'string' ? { src: item } : (item || {})
    const src = String(source.src || source.image || source.imageUrl || source.url || source.path || '').trim()
    if (!src || seen.has(src)) return null
    seen.add(src)
    return {
      src,
      alt: String(source.alt || source.label || source.title || `Reel image ${index + 1}`),
      id: String(source.id || src || index),
    }
  }).filter(Boolean)
}

// A deterministic aspect sequence keeps the three repeated strips perfectly
// seamless while still giving each plate the mixed proportions of a film reel.
const aspectFor = (index, minimum, maximum) => {
  const wave = (Math.sin(index * 2.37 + 0.8) + 1) / 2
  return minimum + (maximum - minimum) * (0.18 + wave * 0.72)
}

const rowVariance = index => 1 + Math.sin(index * 1.91 + 0.4) * 0.5

const buildRows = (images, rows, rowHeight, rowGap, itemGap, minAspect, maxAspect, speedVariance, alternate) => {
  if (!images.length) return []
  const sequenceLength = Math.max(MIN_SEQUENCE_LENGTH, Math.min(MAX_SEQUENCE_LENGTH, Math.max(images.length, 12)))
  return Array.from({ length: rows }, (_, rowIndex) => {
    const sequence = Array.from({ length: sequenceLength }, (_, itemIndex) => {
      const source = images[mod(itemIndex + rowIndex * 2, images.length)]
      const aspect = aspectFor(itemIndex + rowIndex * 1.7, minAspect, maxAspect)
      return {
        ...source,
        aspect,
        width: Math.max(34, rowHeight * aspect),
        itemIndex,
      }
    })
    const cycleWidth = sequence.reduce((total, item) => total + item.width, 0) + itemGap * Math.max(0, sequence.length - 1)
    const direction = alternate && rowIndex % 2 ? -1 : 1
    const variance = clamp(1 + (rowVariance(rowIndex) - 0.5) * 2 * speedVariance, 0.2, 2)
    return {
      rowIndex,
      sequence,
      cycleWidth,
      direction,
      variance,
    }
  })
}

/**
 * Clean-room implementation of the public Reel Gallery contract. The
 * component renders repeated, tilted image reels with inertial wheel/drag
 * input, keyboard controls, cursor colour focus, edge fading and optional
 * auto-scroll. It uses the documented props without copying protected source
 * or demo assets.
 */
const ReelGallery = forwardRef(function ReelGallery({
  images = [],
  rows = 6,
  rowHeight = 92,
  rowGap = 20,
  itemGap = 16,
  maxAspect = 2,
  minAspect = 0.6,
  maxFps = 60,
  tilt = 7,
  arch = 48,
  speed = 1,
  speedVariance = 0.55,
  alternate = false,
  autoScroll = 26,
  inertia = 0.92,
  damping = 0.1,
  dragSensitivity = 1.6,
  wheelSensitivity = 1,
  radius = 10,
  grayscale = 0.55,
  focusRadius = 210,
  focusStrength = 0.85,
  brightness = 1,
  dpr = 1.25,
  fade = 0.12,
  dim = 0.35,
  taper = 0.12,
  backgroundColor = 'transparent',
  interactive = true,
  paused = false,
  className = '',
  children,
  onItemClick,
  ariaLabel = 'Reel Gallery',
}, ref) {
  const normalizedImages = useMemo(() => normalizeImages(images), [images])
  const safeRows = clamp(Math.round(finite(rows, 6)), 1, MAX_ROWS)
  const safeRowHeight = clamp(finite(rowHeight, 92), 42, 260)
  const safeRowGap = clamp(finite(rowGap, 20), 0, 160)
  const safeItemGap = clamp(finite(itemGap, 16), 0, 100)
  const safeMinAspect = clamp(finite(minAspect, 0.6), 0.25, 3)
  const safeMaxAspect = clamp(finite(maxAspect, 2), safeMinAspect, 4)
  const safeMaxFps = clamp(finite(maxFps, 60), 1, 120)
  const safeTilt = clamp(finite(tilt, 7), -30, 30)
  const safeArch = clamp(finite(arch, 48), 0, 260)
  const safeSpeed = clamp(finite(speed, 1), 0, 8)
  const safeVariance = clamp(finite(speedVariance, 0.55), 0, 1)
  const safeAutoScroll = clamp(finite(autoScroll, 26), 0, 500)
  const safeInertia = clamp(finite(inertia, 0.92), 0, 0.999)
  const safeDamping = clamp(finite(damping, 0.1), 0, 1)
  const safeDrag = clamp(finite(dragSensitivity, 1.6), 0, 8)
  const safeWheel = clamp(finite(wheelSensitivity, 1), 0, 8)
  const safeRadius = clamp(finite(radius, 10), 0, 80)
  const safeGrayscale = clamp(finite(grayscale, 0.55), 0, 1)
  const safeFocusRadius = clamp(finite(focusRadius, 210), 20, 900)
  const safeFocusStrength = clamp(finite(focusStrength, 0.85), 0, 1)
  const safeBrightness = clamp(finite(brightness, 1), 0.2, 2)
  const safeDpr = clamp(finite(dpr, 1.25), 0.5, 2)
  const safeFade = clamp(finite(fade, 0.12), 0, 0.5)
  const safeDim = clamp(finite(dim, 0.35), 0, 1)
  const safeTaper = clamp(finite(taper, 0.12), 0, 0.6)

  const rowsData = useMemo(() => buildRows(
    normalizedImages,
    safeRows,
    safeRowHeight,
    safeRowGap,
    safeItemGap,
    safeMinAspect,
    safeMaxAspect,
    safeVariance,
    alternate,
  ), [alternate, normalizedImages, safeItemGap, safeMaxAspect, safeMinAspect, safeRowGap, safeRowHeight, safeRows, safeVariance])

  const rootRef = useRef(null)
  const trackRefs = useRef([])
  const itemRefs = useRef([])
  const rowsRef = useRef(rowsData)
  const offsetsRef = useRef([])
  const frameRef = useRef(0)
  const lastFrameRef = useRef(0)
  const lastPaintRef = useRef(0)
  const reducedMotionRef = useRef(false)
  const pausedRef = useRef(paused)
  const dragGestureRef = useRef({ startX: 0, startY: 0, moved: false })
  const onItemClickRef = useRef(onItemClick)
  const motionRef = useRef({
    velocity: 0,
    targetVelocity: 0,
    dragging: false,
    lastX: 0,
    lastTime: 0,
  })
  const pointerRef = useRef({ x: 0, y: 0, clientX: 0, clientY: 0, active: false, dirty: true })
  const [dragging, setDragging] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => { rowsRef.current = rowsData }, [rowsData])
  useEffect(() => { pausedRef.current = Boolean(paused) }, [paused])
  useEffect(() => { onItemClickRef.current = onItemClick }, [onItemClick])

  useEffect(() => {
    offsetsRef.current = rowsData.map(row => -row.cycleWidth)
    trackRefs.current = trackRefs.current.slice(0, rowsData.length)
    itemRefs.current = itemRefs.current.slice(0, rowsData.length)
    rowsData.forEach((_, index) => { itemRefs.current[index] = itemRefs.current[index] || [] })
  }, [rowsData])

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

  const applyPointerState = useCallback(() => {
    const root = rootRef.current
    const pointer = pointerRef.current
    if (!root) return
    root.style.setProperty('--rg-pointer-x', `${pointer.x.toFixed(2)}px`)
    root.style.setProperty('--rg-pointer-y', `${pointer.y.toFixed(2)}px`)
    root.dataset.reelGalleryPointerX = pointer.x.toFixed(1)
    root.dataset.reelGalleryPointerY = pointer.y.toFixed(1)
    root.dataset.reelGalleryPointerActive = pointer.active ? 'true' : 'false'
    if (!pointer.active) {
      itemRefs.current.forEach(rowItems => rowItems?.forEach(item => {
        if (!item) return
        item.style.setProperty('--rg-item-focus', '0')
        item.style.setProperty('--rg-item-gray', safeGrayscale.toFixed(3))
        item.style.setProperty('--rg-item-brightness', safeBrightness.toFixed(3))
        item.style.setProperty('--rg-item-opacity', '1')
      }))
      root.style.setProperty('--rg-focus-opacity', '0')
      pointer.dirty = false
      return
    }
    root.style.setProperty('--rg-focus-opacity', String(safeFocusStrength))
    if (!pointer.dirty) return

    const radiusSafe = safeFocusRadius
    const strength = safeFocusStrength
    const itemRows = itemRefs.current
    itemRows.forEach(rowItems => rowItems?.forEach(item => {
      if (!item) return
      const rect = item.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const distance = Math.hypot(centerX - pointer.clientX, centerY - pointer.clientY)
      const focus = clamp(1 - distance / radiusSafe, 0, 1) * strength
      item.style.setProperty('--rg-item-focus', focus.toFixed(3))
      item.style.setProperty('--rg-item-gray', (safeGrayscale * (1 - focus)).toFixed(3))
      item.style.setProperty('--rg-item-brightness', (safeBrightness + focus * 0.24).toFixed(3))
      item.style.setProperty('--rg-item-opacity', (0.7 + focus * 0.3).toFixed(3))
      item.style.setProperty('--rg-item-distance', distance.toFixed(1))
    }))
    pointer.dirty = false
  }, [safeBrightness, safeFocusRadius, safeFocusStrength, safeGrayscale])

  const wrapOffset = useCallback((offset, cycleWidth) => {
    if (!cycleWidth) return 0
    let next = offset
    while (next <= -2 * cycleWidth) next += cycleWidth
    while (next >= 0) next -= cycleWidth
    return next
  }, [])

  const drawFrame = useCallback((timestamp) => {
    const rows = rowsRef.current
    const root = rootRef.current
    if (!root || !rows.length) return
    const previous = lastFrameRef.current || timestamp
    const delta = Math.min(0.1, Math.max(0, (timestamp - previous) / 1000))
    lastFrameRef.current = timestamp
    const frameInterval = 1000 / safeMaxFps
    if (timestamp - lastPaintRef.current >= frameInterval || !lastPaintRef.current) {
      lastPaintRef.current = timestamp
      const motion = motionRef.current
      const moving = !pausedRef.current && !reducedMotionRef.current
      if (!motion.dragging) {
        const blend = clamp(safeDamping * delta * 60, 0, 1)
        motion.velocity += (motion.targetVelocity - motion.velocity) * blend
        motion.targetVelocity *= Math.pow(safeInertia, delta * 60)
        if (Math.abs(motion.targetVelocity) < 0.001) motion.targetVelocity = 0
      }
      // Pausing stops the autonomous drift but keeps direct wheel/drag input
      // usable, matching the public "paused" contract.
      const inputTravel = interactive && (moving || motion.dragging || reducedMotionRef.current)
        ? motion.velocity * delta * 60
        : 0
      rows.forEach((row, rowIndex) => {
        const baseTravel = moving ? safeAutoScroll * safeSpeed * row.variance * delta : 0
        const travel = row.direction * (baseTravel + inputTravel)
        const next = wrapOffset((offsetsRef.current[rowIndex] ?? -row.cycleWidth) + travel, row.cycleWidth)
        offsetsRef.current[rowIndex] = next
        const track = trackRefs.current[rowIndex]
        if (track) track.style.transform = `translate3d(${next.toFixed(2)}px, 0, 0)`
      })
      applyPointerState()
    }
    frameRef.current = window.requestAnimationFrame(drawFrame)
  }, [applyPointerState, interactive, safeAutoScroll, safeDamping, safeInertia, safeMaxFps, safeSpeed, wrapOffset])

  useEffect(() => {
    if (!rowsData.length) return undefined
    frameRef.current = window.requestAnimationFrame(drawFrame)
    return () => {
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
      lastFrameRef.current = 0
      lastPaintRef.current = 0
    }
  }, [drawFrame, rowsData.length])

  const setPointer = useCallback((event, active = true) => {
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const pointer = pointerRef.current
    pointer.x = event.clientX - rect.left
    pointer.y = event.clientY - rect.top
    pointer.clientX = event.clientX
    pointer.clientY = event.clientY
    pointer.active = active
    pointer.dirty = true
    root.style.setProperty('--rg-pointer-x', `${pointer.x.toFixed(2)}px`)
    root.style.setProperty('--rg-pointer-y', `${pointer.y.toFixed(2)}px`)
    root.style.setProperty('--rg-focus-opacity', active ? String(safeFocusStrength) : '0')
  }, [safeFocusStrength])

  const handlePointerMove = useCallback(event => {
    if (!interactive) return
    setPointer(event, true)
    const motion = motionRef.current
    if (!motion.dragging) return
    const gesture = dragGestureRef.current
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 6) {
      gesture.moved = true
      try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* cancelled pointer */ }
    }
    const now = performance.now()
    const deltaX = event.clientX - motion.lastX
    const elapsed = Math.max(8, now - motion.lastTime)
    motion.velocity = (deltaX * safeDrag) / elapsed * 16
    motion.targetVelocity = motion.velocity
    motion.lastX = event.clientX
    motion.lastTime = now
  }, [interactive, safeDrag, setPointer])

  const handlePointerDown = useCallback(event => {
    if (!interactive || !rowsRef.current.length) return
    dragGestureRef.current = { startX: event.clientX, startY: event.clientY, moved: false }
    const motion = motionRef.current
    motion.dragging = true
    motion.lastX = event.clientX
    motion.lastTime = performance.now()
    motion.velocity = 0
    motion.targetVelocity = 0
    setDragging(true)
    setPointer(event, true)
  }, [interactive, setPointer])

  const finishPointer = useCallback(event => {
    const motion = motionRef.current
    if (!motion.dragging) return
    motion.dragging = false
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch { /* pointer may already be released */ }
    setDragging(false)
  }, [])

  const handlePointerLeave = useCallback(() => {
    if (motionRef.current.dragging) return
    pointerRef.current.active = false
    pointerRef.current.dirty = true
    const root = rootRef.current
    if (root) root.dataset.reelGalleryPointerActive = 'false'
  }, [])

  const nudge = useCallback(direction => {
    if (!rowsRef.current.length) return
    motionRef.current.targetVelocity += direction * 150 * safeWheel
    setPointer({ clientX: pointerRef.current.clientX, clientY: pointerRef.current.clientY }, pointerRef.current.active)
  }, [safeWheel, setPointer])

  const handleWheel = useCallback(event => {
    if (!interactive || !rowsRef.current.length) return
    event.preventDefault()
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    motionRef.current.targetVelocity += delta * safeWheel * -0.46
    setPointer(event, true)
  }, [interactive, safeWheel, setPointer])

  const handleKeyDown = useCallback(event => {
    if (!interactive || !rowsRef.current.length) return
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      nudge(1)
    } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault()
      nudge(-1)
    } else if (event.key === 'Home' || event.key === 'Escape') {
      event.preventDefault()
      motionRef.current.velocity = 0
      motionRef.current.targetVelocity = 0
      offsetsRef.current = rowsRef.current.map(row => -row.cycleWidth)
    }
  }, [interactive, nudge])

  useImperativeHandle(ref, () => ({
    next: () => nudge(-1),
    previous: () => nudge(1),
    reset: () => {
      motionRef.current.velocity = 0
      motionRef.current.targetVelocity = 0
      offsetsRef.current = rowsRef.current.map(row => -row.cycleWidth)
    },
    setPaused: value => { pausedRef.current = Boolean(value) },
  }), [nudge])

  const rootStyle = {
    '--rg-row-height': `${safeRowHeight}px`,
    '--rg-row-gap': `${safeRowGap}px`,
    '--rg-item-gap': `${safeItemGap}px`,
    '--rg-radius': `${safeRadius}px`,
    '--rg-tilt': `${safeTilt}deg`,
    '--rg-arch': `${safeArch}px`,
    '--rg-grayscale': safeGrayscale,
    '--rg-focus-radius': `${safeFocusRadius}px`,
    '--rg-focus-strength': safeFocusStrength,
    '--rg-brightness': safeBrightness,
    '--rg-fade': safeFade,
    '--rg-dim': safeDim,
    '--rg-taper': safeTaper,
    '--rg-dpr': safeDpr,
    '--rg-row-count': rowsData.length,
    '--rg-stage-height': `${Math.max(1, rowsData.length * safeRowHeight + Math.max(0, rowsData.length - 1) * safeRowGap + 72)}px`,
    '--rg-fade-percent': `${safeFade * 100}%`,
    '--rg-focus-opacity': 0,
    backgroundColor,
  }

  const rootClass = ['reel-gallery', dragging ? 'is-dragging' : '', !interactive ? 'is-static' : '', className].filter(Boolean).join(' ')

  return <div
    ref={rootRef}
    className={rootClass}
    style={rootStyle}
    role="region"
    aria-label={ariaLabel}
    tabIndex={interactive && normalizedImages.length ? 0 : -1}
    data-reel-gallery="true"
    data-reel-gallery-ready="true"
    data-reel-gallery-image-count={normalizedImages.length}
    data-reel-gallery-rows={rowsData.length}
    data-reel-gallery-row-height={safeRowHeight}
    data-reel-gallery-row-gap={safeRowGap}
    data-reel-gallery-item-gap={safeItemGap}
    data-reel-gallery-tilt={safeTilt}
    data-reel-gallery-arch={safeArch}
    data-reel-gallery-auto-scroll={safeAutoScroll}
    data-reel-gallery-interactive={interactive ? 'true' : 'false'}
    data-reel-gallery-paused={paused ? 'true' : 'false'}
    data-reel-gallery-reduced-motion={reducedMotion ? 'true' : 'false'}
    data-reel-gallery-active-index={activeIndex}
    onKeyDown={handleKeyDown}
    onPointerEnter={event => setPointer(event, true)}
    onPointerMove={handlePointerMove}
    onPointerLeave={handlePointerLeave}
    onPointerDown={handlePointerDown}
    onPointerUp={finishPointer}
    onPointerCancel={finishPointer}
    onWheel={handleWheel}
  >
    <div className="reel-gallery__wash" aria-hidden="true" />
    <div className="reel-gallery__rows" data-reel-gallery-rows-container>
      {rowsData.map(row => {
        const renderedItems = [...row.sequence, ...row.sequence, ...row.sequence]
        return <div
          className="reel-gallery__row"
          key={`reel-row-${row.rowIndex}`}
          data-reel-row
          data-reel-row-index={row.rowIndex}
          data-reel-row-direction={row.direction}
          style={{
            '--rg-row-index': row.rowIndex,
            '--rg-row-count': rowsData.length,
            '--rg-row-variance': row.variance,
            '--rg-row-edge': rowsData.length > 1
              ? Math.abs(row.rowIndex - (rowsData.length - 1) / 2) / ((rowsData.length - 1) / 2)
              : 0,
            '--rg-row-opacity': String(1 - (rowsData.length > 1
              ? Math.abs(row.rowIndex - (rowsData.length - 1) / 2) / ((rowsData.length - 1) / 2)
              : 0) * safeDim),
            '--rg-row-scale': String(1 - (rowsData.length > 1
              ? Math.abs(row.rowIndex - (rowsData.length - 1) / 2) / ((rowsData.length - 1) / 2)
              : 0) * safeTaper),
          }}
        >
          <div
            className="reel-gallery__track"
            ref={node => { trackRefs.current[row.rowIndex] = node }}
            data-reel-track
            data-reel-track-cycle-width={row.cycleWidth.toFixed(2)}
          >
            {renderedItems.map((item, itemIndex) => {
              const localIndex = itemIndex % row.sequence.length
              const curve = row.sequence.length > 1
                ? -Math.sin((localIndex / (row.sequence.length - 1)) * Math.PI) * safeArch
                : 0
              const itemGlobalIndex = row.rowIndex * renderedItems.length + itemIndex
              return <button
                className="reel-gallery__item"
                key={`${row.rowIndex}-${itemIndex}-${item.id}`}
                ref={node => {
                  itemRefs.current[row.rowIndex] = itemRefs.current[row.rowIndex] || []
                  itemRefs.current[row.rowIndex][itemGlobalIndex] = node
                }}
                type="button"
                aria-label={`查看 ${item.alt}`}
                data-reel-item
                data-reel-item-index={localIndex}
                data-reel-item-row={row.rowIndex}
                data-reel-item-src={item.src}
                style={{
                  width: `${item.width.toFixed(2)}px`,
                  '--rg-item-arch': `${curve.toFixed(2)}px`,
                  '--rg-item-focus': 0,
                  '--rg-item-gray': safeGrayscale,
                  '--rg-item-brightness': safeBrightness,
                  '--rg-item-opacity': 1,
                }}
                onClick={event => {
                  if (event.detail !== 0 && dragGestureRef.current.moved) return
                  setActiveIndex(localIndex)
                  onItemClickRef.current?.(item, localIndex, row.rowIndex)
                }}
              >
                <span className="reel-gallery__frame" aria-hidden="true" />
                <img src={item.src} alt={item.alt} draggable="false" loading={itemIndex < 8 ? 'eager' : 'lazy'} />
                <span className="reel-gallery__caption" aria-hidden="true">{String(localIndex + 1).padStart(2, '0')} / REEL</span>
              </button>
            })}
          </div>
        </div>
      })}
    </div>
    {!normalizedImages.length && <div className="reel-gallery__empty">暂无可用图片</div>}
    <div className="reel-gallery__focus" aria-hidden="true" />
    <div className="reel-gallery__perforations reel-gallery__perforations--top" aria-hidden="true" />
    <div className="reel-gallery__perforations reel-gallery__perforations--bottom" aria-hidden="true" />
    {children ? <div className="reel-gallery__children">{children}</div> : null}
    <span className="reel-gallery__hint" aria-hidden="true">DRAG / WHEEL · ARROW KEYS</span>
  </div>
})

export default ReelGallery
