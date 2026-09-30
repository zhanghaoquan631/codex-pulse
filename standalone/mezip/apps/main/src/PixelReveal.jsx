import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

import './PixelReveal.css'

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

const smoothstep = (start, end, value) => {
  const amount = clamp((value - start) / Math.max(end - start, 0.0001))
  return amount * amount * (3 - 2 * amount)
}

const easingFunctions = {
  linear: value => value,
  easeIn: value => value * value,
  easeOut: value => 1 - (1 - value) * (1 - value),
  easeInOut: value => (value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2),
}

const normaliseDirection = value => {
  const direction = String(value || 'down').toLowerCase()
  return ['up', 'down', 'left', 'right'].includes(direction) ? direction : 'down'
}

const hashCell = (column, row) => {
  const value = Math.sin(column * 127.1 + row * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

/**
 * A canvas-based, clean-room implementation of the public Pixel Reveal
 * interaction: a noisy grid sweeps away to reveal the image below it.
 */
const PixelReveal = forwardRef(function PixelReveal({
  imageSrc,
  src,
  width = '100%',
  height = '100%',
  gridSize = 20,
  transitionColor = '#242424',
  edgeHeight = 0.2,
  duration = 1.6,
  easing = 'linear',
  direction = 'down',
  autoTrigger = true,
  triggerOnce = false,
  triggerThreshold = 0.1,
  paused = false,
  borderRadius = 16,
  className = '',
  children,
  alt = '',
  style,
  onRevealComplete,
}, forwardedRef) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const animationFrameRef = useRef(0)
  const drawRef = useRef(() => {})
  const controlsRef = useRef({ trigger: () => {}, play: () => {}, reset: () => {}, setPaused: () => {} })
  const completionRef = useRef(onRevealComplete)
  const pausedRef = useRef(paused)
  const stateRef = useRef({ raw: 0, progress: 0, playing: false, started: false, shouldResume: false, completed: false, startTime: 0 })
  const [status, setStatus] = useState({ progress: 0, playing: false, completed: false })
  const resolvedImageSrc = imageSrc || src || ''

  useEffect(() => {
    completionRef.current = onRevealComplete
  }, [onRevealComplete])

  useImperativeHandle(forwardedRef, () => ({
    trigger: () => controlsRef.current.trigger(),
    play: () => controlsRef.current.play(),
    reset: () => controlsRef.current.reset(),
  }), [])

  useEffect(() => {
    pausedRef.current = paused
    controlsRef.current.setPaused(paused)
  }, [paused])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return undefined

    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const reducedMotion = Boolean(mediaQuery?.matches)
    const context = canvas.getContext('2d')
    const grid = clamp(Number(gridSize) || 20, 4, 80)
    const edge = clamp(Number(edgeHeight) || 0.2, 0.05, 0.6)
    const durationMs = Math.max(200, Number(duration) * 1000 || 1600)
    const easingFunction = easingFunctions[easing] || easingFunctions.linear
    const resolvedDirection = normaliseDirection(direction)
    const threshold = clamp(Number(triggerThreshold) || 0, 0, 1)
    const state = { raw: 0, progress: 0, playing: false, started: false, shouldResume: false, completed: false, startTime: 0 }
    stateRef.current = state
    let disposed = false

    const syncStatus = () => {
      if (disposed) return
      setStatus(current => {
        const next = { progress: state.progress, playing: state.playing, completed: state.completed }
        return current.progress === next.progress && current.playing === next.playing && current.completed === next.completed ? current : next
      })
    }

    const stopFrame = () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = 0
      }
    }

    const draw = progress => {
      if (!context || disposed) return
      const rect = root.getBoundingClientRect()
      const cssWidth = Math.max(1, Math.round(rect.width))
      const cssHeight = Math.max(1, Math.round(rect.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const pixelWidth = Math.max(1, Math.round(cssWidth * dpr))
      const pixelHeight = Math.max(1, Math.round(cssHeight * dpr))

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
        canvas.style.width = `${cssWidth}px`
        canvas.style.height = `${cssHeight}px`
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, cssWidth, cssHeight)
      if (progress >= 0.999) return

      const columns = Math.ceil(cssWidth / grid)
      const rows = Math.ceil(cssHeight / grid)
      const horizontal = resolvedDirection === 'left' || resolvedDirection === 'right'
      const axisLength = horizontal ? columns : rows
      const edgeSpan = Math.max(edge, 1 / axisLength)
      context.fillStyle = transitionColor

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const primary = horizontal ? column : row
          const forward = resolvedDirection === 'down' || resolvedDirection === 'right'
          const coordinate = forward
            ? (primary + 0.5) / axisLength
            : 1 - (primary + 0.5) / axisLength
          const noise = (hashCell(column, row) - 0.5) * edgeSpan * 1.35
          const boundary = clamp(progress + noise, -edgeSpan, 1 + edgeSpan)
          const opacity = smoothstep(boundary - edgeSpan * 0.45, boundary + edgeSpan * 0.45, coordinate)
          if (opacity <= 0.002) continue

          context.globalAlpha = opacity
          context.fillRect(column * grid, row * grid, grid + 0.7, grid + 0.7)
        }
      }
      context.globalAlpha = 1
    }
    drawRef.current = draw

    const finish = () => {
      stopFrame()
      state.raw = 1
      state.progress = 1
      state.playing = false
      state.shouldResume = false
      state.completed = true
      draw(1)
      syncStatus()
      if (!state.completionFired) {
        state.completionFired = true
        completionRef.current?.()
      }
    }

    const tick = timestamp => {
      if (disposed || pausedRef.current) return
      const raw = clamp((timestamp - state.startTime) / durationMs)
      state.raw = raw
      state.progress = easingFunction(raw)
      draw(state.progress)
      syncStatus()
      if (raw >= 1) {
        finish()
        return
      }
      animationFrameRef.current = window.requestAnimationFrame(tick)
    }

    const start = ({ reset = false } = {}) => {
      if (triggerOnce && state.started && state.completed && !reset) return
      stopFrame()
      if (reset || state.completed) {
        state.raw = 0
        state.progress = 0
        state.completed = false
        state.completionFired = false
        draw(0)
      }
      state.started = true
      if (reducedMotion) {
        finish()
        return
      }
      if (pausedRef.current) {
        state.playing = false
        state.shouldResume = true
        syncStatus()
        return
      }
      state.shouldResume = false
      state.playing = true
      state.startTime = performance.now() - state.raw * durationMs
      syncStatus()
      animationFrameRef.current = window.requestAnimationFrame(tick)
    }

    const reset = () => {
      stopFrame()
      state.raw = 0
      state.progress = 0
      state.playing = false
      state.started = false
      state.shouldResume = false
      state.completed = false
      state.completionFired = false
      draw(0)
      syncStatus()
    }

    const setPaused = nextPaused => {
      pausedRef.current = Boolean(nextPaused)
      if (pausedRef.current) {
        if (state.playing) {
          stopFrame()
          state.playing = false
          state.shouldResume = true
          syncStatus()
        }
        return
      }
      if (state.shouldResume && state.raw < 1) start()
    }

    controlsRef.current = {
      trigger: () => start({ reset: true }),
      play: () => start(),
      reset,
      setPaused,
    }

    const handleWindowResize = () => draw(state.progress)
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => draw(state.progress)) : null
    resizeObserver?.observe(root)
    window.addEventListener('resize', handleWindowResize)
    draw(0)

    let intersectionObserver
    if (autoTrigger) {
      if (typeof IntersectionObserver === 'undefined') {
        start({ reset: true })
      } else {
        intersectionObserver = new IntersectionObserver(entries => {
          const entry = entries[0]
          if (!entry?.isIntersecting || entry.intersectionRatio < threshold) return
          start({ reset: true })
          if (triggerOnce) intersectionObserver.disconnect()
        }, { threshold: [threshold] })
        intersectionObserver.observe(root)
      }
    }

    return () => {
      disposed = true
      stopFrame()
      intersectionObserver?.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', handleWindowResize)
      controlsRef.current = { trigger: () => {}, play: () => {}, reset: () => {}, setPaused: () => {} }
    }
  }, [autoTrigger, direction, duration, easing, edgeHeight, gridSize, imageSrc, resolvedImageSrc, transitionColor, triggerOnce, triggerThreshold])

  const rootStyle = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
    '--pixel-transition-color': transitionColor,
    ...style,
  }

  return <div
    ref={rootRef}
    className={`pixel-reveal${className ? ` ${className}` : ''}`}
    style={rootStyle}
    data-pixel-reveal
    data-pixel-progress={status.progress.toFixed(3)}
    data-pixel-playing={status.playing ? 'true' : 'false'}
    data-pixel-complete={status.completed ? 'true' : 'false'}
  >
    {resolvedImageSrc ? <img className="pixel-reveal__image" src={resolvedImageSrc} alt={alt} draggable="false" loading="lazy" decoding="async" onLoad={() => drawRef.current(stateRef.current.progress)} /> : null}
    <canvas ref={canvasRef} className="pixel-reveal__canvas" aria-hidden="true" />
    {children ? <div className="pixel-reveal__content">{children}</div> : null}
  </div>
})

export default PixelReveal
