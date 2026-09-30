import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './TextScatter.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const numeric = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const fallbackFont = "'Manrope', 'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"

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

function random(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

/**
 * Clean-room scatter typography inspired by the public React Bits Pro text
 * scatter contract. It keeps a static readable measurement layer, then moves
 * the visible characters with a per-glyph spring when the pointer enters or
 * moves across the text.
 */
export default function TextScatter({
  children,
  text,
  as: Tag = 'h1',
  className = '',
  scatterRadius = 96,
  velocity = 200,
  rotation = 90,
  scale = 1,
  returnAfter = 1,
  duration = 2,
  autoScatter = true,
  replayToken = 0,
  style,
  tabIndex,
  onFocus: userOnFocus,
  onKeyDown: userOnKeyDown,
  'aria-label': ariaLabel,
  ...rest
}) {
  const content = useMemo(() => {
    const value = typeof text === 'string' && text.length ? text : textFromChildren(children)
    return value || ''
  }, [children, text])
  const glyphs = useMemo(() => splitGraphemes(content), [content])
  const rootRef = useRef(null)
  const measureRef = useRef(null)
  const measureCharsRef = useRef([])
  const visualCharsRef = useRef([])
  const modelRef = useRef({
    ready: false,
    width: 1,
    height: 1,
    dpr: 1,
    origins: [],
    states: [],
    targets: [],
    pointer: {
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      inside: false,
      lastMoveAt: 0,
      scattering: false,
      waitingForLeave: false,
    },
    returnTimer: 0,
    introPlayed: false,
    lastTime: 0,
  })
  const layoutSignatureRef = useRef('')
  const replayTokenRef = useRef(replayToken)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return undefined
    const sync = () => setReducedMotion(query.matches)
    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  const resetTargets = useCallback((force = false) => {
    const model = modelRef.current
    if (!model.ready && !force) return
    if (model.returnTimer) window.clearTimeout(model.returnTimer)
    model.targets = model.origins.map(() => ({
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
    }))
    model.returnTimer = 0
  }, [])

  const scatterFromPoint = useCallback((x, y, dx = 0, dy = 0, scheduleReturn = true) => {
    const model = modelRef.current
    if (!model.ready) return
    if (reducedMotion) {
      resetTargets()
      return
    }
    const maxRotation = Math.abs(numeric(rotation, 90))
    const scaleLift = clamp(numeric(scale, 1), 0.2, 4)
    const moveStrength = clamp(numeric(velocity, 200) / 200, 0.4, 3.2)
    // Large, frame-to-frame pointer deltas make a scatter feel twitchy. Keep
    // the input responsive, but cap its contribution so the letters ease away
    // instead of snapping around when the cursor crosses the word quickly.
    const pointerSpeed = clamp(Math.hypot(dx, dy) / 72, 0, 1)
    const baseRadius = Math.max(1, numeric(scatterRadius, 96))

    model.targets = model.origins.map((origin, index) => {
      if (!origin || !origin.visible) {
        return { x: 0, y: 0, rotation: 0, scale: 1 }
      }
      const cx = origin.left + origin.width / 2
      const cy = origin.top + origin.height / 2
      const offsetX = cx - x
      const offsetY = cy - y
      const distance = Math.max(1, Math.hypot(offsetX, offsetY))
      const influence = clamp(1 - distance / (baseRadius * 1.35), 0, 1)
      if (!influence) {
        return { x: 0, y: 0, rotation: 0, scale: 1 }
      }
      const awayX = offsetX / distance
      const awayY = offsetY / distance
      const tangentX = -awayY
      const tangentY = awayX
      const seed = index * 37 + Math.round(cx) * 3 + Math.round(cy) * 7
      const jitter = (random(seed) - 0.5) * 0.9
      const spread = baseRadius * influence * moveStrength * (0.42 + pointerSpeed * 0.16)
      const wobble = baseRadius * influence * 0.07
      const scatterX = awayX * spread + tangentX * wobble * jitter + dx * 0.055 * influence
      const scatterY = awayY * spread + tangentY * wobble * jitter + dy * 0.055 * influence
      const spin = clamp((awayX * dx - awayY * dy) * 0.12 + jitter * maxRotation * 0.42, -maxRotation, maxRotation)
      const growth = 1 + (scaleLift - 1) * influence
      return {
        x: scatterX,
        y: scatterY,
        rotation: spin,
        scale: growth,
      }
    })
    if (scheduleReturn) {
      if (model.returnTimer) window.clearTimeout(model.returnTimer)
      model.returnTimer = window.setTimeout(() => {
        resetTargets()
        // A held cursor should not instantly scatter the word again as it
        // settles. The next leave/enter is a fresh, intentional interaction.
        model.pointer.scattering = false
        model.pointer.waitingForLeave = model.pointer.inside
      }, Math.max(0, numeric(returnAfter, 1)) * 1000)
    }

  }, [reducedMotion, resetTargets, returnAfter, rotation, scale, scatterRadius, velocity])

  const scatterAtCenter = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const model = modelRef.current
    model.pointer.scattering = true
    model.pointer.waitingForLeave = false
    scatterFromPoint(root.clientWidth / 2, root.clientHeight / 2, 0, 0, true)
  }, [scatterFromPoint])

  const handleFocus = useCallback((event) => {
    userOnFocus?.(event)
    if (!event.defaultPrevented) scatterAtCenter()
  }, [scatterAtCenter, userOnFocus])

  const handleKeyDown = useCallback((event) => {
    userOnKeyDown?.(event)
    if (event.defaultPrevented) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      scatterAtCenter()
    }
  }, [scatterAtCenter, userOnKeyDown])

  const buildLayout = useCallback(() => {
    const root = rootRef.current
    const measure = measureRef.current
    if (!root || !measure) return

    const hostRect = root.getBoundingClientRect()
    const measureRect = measure.getBoundingClientRect()
    const width = Math.max(1, Math.round(hostRect.width || measureRect.width))
    const height = Math.max(1, Math.round(hostRect.height || measureRect.height))
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const nodes = glyphs.map((glyph, index) => {
      const node = measureCharsRef.current[index]
      if (!node) return null
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      const left = rect.left - hostRect.left
      const top = rect.top - hostRect.top
      return {
        char: glyph,
        index,
        left,
        top,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
        visible: glyph.trim().length > 0,
        fontFamily: style.fontFamily || fallbackFont,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        letterSpacing: style.letterSpacing,
      }
    })

    const geometry = nodes.map(node => node
      ? `${node.left.toFixed(2)},${node.top.toFixed(2)},${node.width.toFixed(2)},${node.height.toFixed(2)},${node.fontFamily},${node.fontSize},${node.fontWeight},${node.fontStyle},${node.letterSpacing}`
      : 'missing').join('|')
    const signature = `${width}:${height}:${dpr}:${geometry}`
    if (signature === layoutSignatureRef.current && modelRef.current.ready) return

    const model = modelRef.current
    model.width = width
    model.height = height
    model.dpr = dpr
    model.origins = nodes
    model.states = nodes.map(() => ({
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
    }))
    model.targets = nodes.map(() => ({
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
    }))
    model.ready = true
    model.lastTime = 0
    layoutSignatureRef.current = signature

    resetTargets(true)

    setLayoutVersion(value => value + 1)
  }, [glyphs, resetTargets])

  useLayoutEffect(() => {
    buildLayout()
    const root = rootRef.current
    if (!root) return undefined

    let disposed = false
    let resizeFrame = 0

    const scheduleLayout = () => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0
        if (!disposed) buildLayout()
      })
    }

    const resizeObserver = new ResizeObserver(scheduleLayout)
    resizeObserver.observe(root)
    window.addEventListener('resize', scheduleLayout)
    document.fonts?.ready?.then(() => {
      if (!disposed) scheduleLayout()
    })

    return () => {
      disposed = true
      cancelAnimationFrame(resizeFrame)
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleLayout)
    }
  }, [buildLayout])

  useEffect(() => {
    const root = rootRef.current
    const model = modelRef.current
    if (!root || !model.ready) return undefined

    let raf = 0
    let disposed = false
    const pointer = model.pointer
    const durationSeconds = Math.max(0.05, numeric(duration, 2))

    const pointFromEvent = (event) => {
      const rect = root.getBoundingClientRect()
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    }

    const onPointerMove = (event) => {
      const { x, y } = pointFromEvent(event)
      const dx = clamp(x - pointer.x, -72, 72)
      const dy = clamp(y - pointer.y, -72, 72)
      pointer.x = x
      pointer.y = y
      pointer.dx = dx
      pointer.dy = dy
      pointer.inside = true
      pointer.lastMoveAt = performance.now()
      if (!pointer.scattering && !pointer.waitingForLeave) {
        pointer.scattering = true
        scatterFromPoint(x, y, dx, dy, true)
        return
      }
      if (pointer.scattering) scatterFromPoint(x, y, dx, dy, false)
    }

    const onPointerEnter = (event) => {
      const { x, y } = pointFromEvent(event)
      pointer.inside = true
      pointer.x = x
      pointer.y = y
      pointer.dx = 0
      pointer.dy = 0
      pointer.lastMoveAt = performance.now()
      if (!pointer.waitingForLeave) {
        pointer.scattering = true
        scatterFromPoint(x, y, 0, 0, true)
      }
    }

    const onPointerLeave = () => {
      pointer.inside = false
      pointer.waitingForLeave = false
    }

    const render = (now) => {
      if (disposed) return
      const elapsedMs = Math.min(80, Math.max(1, now - (model.lastTime || now)))
      model.lastTime = now
      // `duration` is expressed in seconds. The old calculation treated the
      // frame count as seconds, so each glyph reached its target in one frame.
      // A small response window makes the motion feel like a soft follow while
      // still letting it settle promptly after the three-second hold.
      const responseSeconds = Math.max(0.08, durationSeconds * 0.2)
      const ease = 1 - Math.exp(-(elapsedMs / 1000) / responseSeconds)

      model.states.forEach((state, index) => {
        const target = model.targets[index]
        const origin = model.origins[index]
        const node = visualCharsRef.current[index]
        if (!target || !origin || !node) return

        state.x += (target.x - state.x) * ease
        state.y += (target.y - state.y) * ease
        state.rotation += (target.rotation - state.rotation) * ease
        state.scale += (target.scale - state.scale) * ease

        // The visual layer is absolutely positioned. Do not rewrite layout
        // coordinates every animation frame: that can force needless style
        // work on slower browsers and make the interaction look choppy.
        if (state.left !== origin.left || state.top !== origin.top) {
          node.style.left = `${origin.left.toFixed(2)}px`
          node.style.top = `${origin.top.toFixed(2)}px`
          state.left = origin.left
          state.top = origin.top
        }

        if (!origin.visible) {
          node.style.opacity = '0'
          node.style.transform = 'translate3d(0, 0, 0) rotate(0deg) scale(1)'
          return
        }

        node.style.opacity = '1'
        node.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) rotate(${state.rotation.toFixed(2)}deg) scale(${state.scale.toFixed(4)})`
      })

      raf = requestAnimationFrame(render)
    }

    // Embedded browsers may expose CUA movement as mouse events without a
    // PointerEvent constructor; use one event family to avoid duplicate work.
    const eventPrefix = 'PointerEvent' in window ? 'pointer' : 'mouse'
    root.addEventListener(`${eventPrefix}move`, onPointerMove, { passive: true })
    root.addEventListener(`${eventPrefix}enter`, onPointerEnter, { passive: true })
    root.addEventListener(`${eventPrefix}leave`, onPointerLeave, { passive: true })
    raf = requestAnimationFrame(render)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      if (model.returnTimer) window.clearTimeout(model.returnTimer)
      root.removeEventListener(`${eventPrefix}move`, onPointerMove)
      root.removeEventListener(`${eventPrefix}enter`, onPointerEnter)
      root.removeEventListener(`${eventPrefix}leave`, onPointerLeave)
    }
  }, [duration, replayToken, resetTargets, returnAfter, scatterFromPoint, layoutVersion])

  useEffect(() => {
    if (!autoScatter || reducedMotion) return undefined
    const model = modelRef.current
    const root = rootRef.current
    if (!model.ready || !root) return undefined
    const replayChanged = replayTokenRef.current !== replayToken
    if (model.introPlayed && !replayChanged) return undefined
    replayTokenRef.current = replayToken

    let frame = requestAnimationFrame(() => {
      const currentRoot = rootRef.current
      if (!currentRoot || !modelRef.current.ready) return
      scatterFromPoint(currentRoot.clientWidth / 2, currentRoot.clientHeight / 2)
      modelRef.current.introPlayed = true
    })

    return () => cancelAnimationFrame(frame)
  }, [autoScatter, layoutVersion, reducedMotion, replayToken, scatterFromPoint])

  useEffect(() => {
    const host = rootRef.current
    if (!host) return
    host.dataset.textScatterMotion = reducedMotion ? 'reduced' : 'full'
  }, [reducedMotion])

  const TagComponent = Tag

  return (
    <TagComponent
      ref={rootRef}
      className={`text-scatter ${className}`.trim()}
      style={style}
      data-text-scatter
      aria-label={ariaLabel || content || undefined}
      tabIndex={tabIndex ?? 0}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <span ref={measureRef} className="text-scatter__measure" aria-hidden="true">
        {glyphs.map((glyph, index) => (
          <span
            key={`${glyph}-${index}`}
            ref={(node) => { measureCharsRef.current[index] = node }}
            className="text-scatter__measure-char"
          >
            {glyph === ' ' ? '\u00a0' : glyph}
          </span>
        ))}
      </span>
      <span className="text-scatter__visual" aria-hidden="true">
        {glyphs.map((glyph, index) => (
          <span
            key={`visual-${glyph}-${index}`}
            ref={(node) => { visualCharsRef.current[index] = node }}
            className="text-scatter__visual-char"
            style={{ opacity: 0 }}
          >
            {glyph === ' ' ? '\u00a0' : glyph}
          </span>
        ))}
      </span>
      <span className="text-scatter__sr-only">{content}</span>
    </TagComponent>
  )
}
