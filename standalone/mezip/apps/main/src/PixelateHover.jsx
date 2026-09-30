import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import './PixelateHover.css'

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

const coverImage = (context, image, width, height) => {
  const imageRatio = image.width / Math.max(image.height, 1)
  const canvasRatio = width / Math.max(height, 1)
  const scale = canvasRatio > imageRatio ? width / image.width : height / image.height
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

const normaliseMode = mode => (String(mode || 'reveal').toLowerCase() === 'pixelate' ? 'pixelate' : 'reveal')

/**
 * A local, clean-room Canvas 2D implementation of the public Pixelate Hover
 * interaction. The image is rendered as a mosaic and a damped cursor reveals
 * (or pixelates) a soft circular area around its position.
 */
const PixelateHover = forwardRef(function PixelateHover({
  image = '',
  src,
  pixelSize = 20,
  cursorRadius = 200,
  falloff = 0.5,
  mode = 'reveal',
  smoothing = 0.15,
  autoDemo = true,
  autoSpeed = 0.5,
  autoResumeDelay = 1500,
  width = '100%',
  height = '100%',
  borderRadius = 16,
  className = '',
  style,
  alt = '',
  children,
}, forwardedRef) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const controlsRef = useRef({ reset: () => {}, play: () => {}, pause: () => {} })

  useImperativeHandle(forwardedRef, () => ({
    reset: () => controlsRef.current.reset(),
    play: () => controlsRef.current.play(),
    pause: () => controlsRef.current.pause(),
  }), [])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return undefined

    const context = canvas.getContext('2d')
    if (!context) return undefined

    const source = image || src || ''
    const resolvedMode = normaliseMode(mode)
    const blockSizeValue = Number(pixelSize)
    const radiusValue = Number(cursorRadius)
    const falloffValue = Number(falloff)
    const smoothingValue = Number(smoothing)
    const speedValue = Number(autoSpeed)
    const resumeDelayValue = Number(autoResumeDelay)
    const blockSize = Math.max(4, Number.isFinite(blockSizeValue) ? blockSizeValue : 20)
    const radius = Math.max(20, Number.isFinite(radiusValue) ? radiusValue : 200)
    const softness = Number.isFinite(falloffValue) ? clamp(falloffValue) : 0.5
    const damp = Number.isFinite(smoothingValue) ? clamp(smoothingValue, 0.01, 1) : 0.15
    const speed = Math.max(0.05, Number.isFinite(speedValue) ? speedValue : 0.5)
    const resumeDelay = Math.max(0, Number.isFinite(resumeDelayValue) ? resumeDelayValue : 1500)
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const state = {
      width: 1,
      height: 1,
      dpr: 1,
      cursor: { x: 0.5, y: 0.5 },
      target: { x: 0.5, y: 0.5 },
      autoActive: Boolean(autoDemo),
      paused: false,
      autoStartedAt: performance.now(),
      lastFrame: 0,
    }
    let disposed = false
    let frameId = 0
    let resumeTimer = 0
    let imageReady = false

    const clearSurface = document.createElement('canvas')
    const pixelSurface = document.createElement('canvas')
    const lowSurface = document.createElement('canvas')
    const overlaySurface = document.createElement('canvas')
    const maskSurface = document.createElement('canvas')
    const clearContext = clearSurface.getContext('2d')
    const pixelContext = pixelSurface.getContext('2d')
    const lowContext = lowSurface.getContext('2d')
    const overlayContext = overlaySurface.getContext('2d')
    const maskContext = maskSurface.getContext('2d')

    const setSurfaceSize = (surface, width, height) => {
      surface.width = Math.max(1, Math.round(width))
      surface.height = Math.max(1, Math.round(height))
    }

    const rebuildSurfaces = () => {
      if (!imageReady) return
      const width = state.width
      const height = state.height
      setSurfaceSize(clearSurface, width, height)
      setSurfaceSize(pixelSurface, width, height)
      setSurfaceSize(overlaySurface, width, height)
      setSurfaceSize(maskSurface, width, height)
      const lowWidth = Math.max(1, Math.ceil(width / blockSize))
      const lowHeight = Math.max(1, Math.ceil(height / blockSize))
      setSurfaceSize(lowSurface, lowWidth, lowHeight)

      clearContext.clearRect(0, 0, width, height)
      clearContext.imageSmoothingEnabled = true
      coverImage(clearContext, imageElement, width, height)

      lowContext.clearRect(0, 0, lowWidth, lowHeight)
      lowContext.imageSmoothingEnabled = true
      coverImage(lowContext, imageElement, lowWidth, lowHeight)
      pixelContext.clearRect(0, 0, width, height)
      pixelContext.imageSmoothingEnabled = false
      pixelContext.drawImage(lowSurface, 0, 0, lowWidth, lowHeight, 0, 0, width, height)
    }

    const resize = () => {
      const rect = container.getBoundingClientRect()
      state.width = Math.max(1, Math.round(rect.width))
      state.height = Math.max(1, Math.round(rect.height))
      state.dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(state.width * state.dpr))
      canvas.height = Math.max(1, Math.round(state.height * state.dpr))
      canvas.style.width = `${state.width}px`
      canvas.style.height = `${state.height}px`
      rebuildSurfaces()
    }

    const drawMask = (x, y) => {
      maskContext.clearRect(0, 0, state.width, state.height)
      const innerRadius = radius * (1 - softness)
      const gradient = maskContext.createRadialGradient(x, y, Math.max(0, innerRadius), x, y, radius)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(Math.max(0.001, 1 - softness), 'rgba(255,255,255,1)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      maskContext.fillStyle = gradient
      maskContext.fillRect(0, 0, state.width, state.height)
    }

    const draw = () => {
      if (disposed || !imageReady) return
      const x = state.cursor.x * state.width
      const y = state.cursor.y * state.height
      context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0)
      context.clearRect(0, 0, state.width, state.height)
      drawMask(x, y)

      const baseSurface = resolvedMode === 'reveal' ? pixelSurface : clearSurface
      const effectSurface = resolvedMode === 'reveal' ? clearSurface : pixelSurface
      context.drawImage(baseSurface, 0, 0, state.width, state.height)
      overlayContext.clearRect(0, 0, state.width, state.height)
      overlayContext.drawImage(effectSurface, 0, 0, state.width, state.height)
      overlayContext.globalCompositeOperation = 'destination-in'
      overlayContext.drawImage(maskSurface, 0, 0, state.width, state.height)
      overlayContext.globalCompositeOperation = 'source-over'
      context.drawImage(overlaySurface, 0, 0, state.width, state.height)
    }

    const scheduleAutoResume = () => {
      if (!autoDemo) return
      window.clearTimeout(resumeTimer)
      resumeTimer = window.setTimeout(() => {
        if (disposed || state.paused) return
        state.autoActive = true
        state.autoStartedAt = performance.now()
        container.dataset.pixelateAuto = 'true'
      }, resumeDelay)
    }

    const pointerMove = event => {
      const rect = container.getBoundingClientRect()
      state.target.x = clamp((event.clientX - rect.left) / Math.max(rect.width, 1))
      state.target.y = clamp((event.clientY - rect.top) / Math.max(rect.height, 1))
      state.autoActive = false
      container.dataset.pixelateAuto = 'false'
      scheduleAutoResume()
    }

    const pointerLeave = () => scheduleAutoResume()

    const animate = timestamp => {
      if (disposed) return
      if (!state.paused && imageReady) {
        if (state.autoActive && autoDemo) {
          const elapsed = ((timestamp - state.autoStartedAt) / 1000) * speed
          state.target.x = 0.5 + Math.sin(elapsed * 1.35) * 0.31
          state.target.y = 0.5 + Math.cos(elapsed * 0.93) * 0.27
        }
        const follow = reducedMotion ? 1 : damp
        state.cursor.x += (state.target.x - state.cursor.x) * follow
        state.cursor.y += (state.target.y - state.cursor.y) * follow
        draw()
      }
      state.lastFrame = timestamp
      frameId = window.requestAnimationFrame(animate)
    }

    const reset = () => {
      state.cursor.x = 0.5
      state.cursor.y = 0.5
      state.target.x = 0.5
      state.target.y = 0.5
      state.autoActive = Boolean(autoDemo)
      state.autoStartedAt = performance.now()
      container.dataset.pixelateAuto = state.autoActive ? 'true' : 'false'
      draw()
    }

    const play = () => {
      state.paused = false
      container.dataset.pixelatePaused = 'false'
    }

    const pause = () => {
      state.paused = true
      container.dataset.pixelatePaused = 'true'
    }

    controlsRef.current = { reset, play, pause }
    container.dataset.pixelateAuto = state.autoActive ? 'true' : 'false'
    container.dataset.pixelatePaused = 'false'
    container.dataset.pixelateMode = resolvedMode

    const imageElement = new Image()
    imageElement.decoding = 'async'
    imageElement.crossOrigin = 'anonymous'
    imageElement.onload = () => {
      imageReady = true
      resize()
      draw()
    }
    imageElement.onerror = () => {
      imageReady = false
      context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0)
      context.clearRect(0, 0, state.width, state.height)
    }
    if (source) imageElement.src = source
    else {
      resize()
      draw()
    }

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    resizeObserver?.observe(container)
    const handleResize = () => resize()
    window.addEventListener('resize', handleResize)
    container.addEventListener('pointermove', pointerMove, { passive: true })
    container.addEventListener('pointerleave', pointerLeave, { passive: true })
    resize()
    frameId = window.requestAnimationFrame(animate)

    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(resumeTimer)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', handleResize)
      container.removeEventListener('pointermove', pointerMove)
      container.removeEventListener('pointerleave', pointerLeave)
      controlsRef.current = { reset: () => {}, play: () => {}, pause: () => {} }
    }
  }, [autoDemo, autoResumeDelay, autoSpeed, cursorRadius, falloff, image, mode, pixelSize, smoothing, src])

  const rootStyle = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
    ...style,
  }

  return <div
    ref={containerRef}
    className={`pixelate-hover${className ? ` ${className}` : ''}`}
    style={rootStyle}
    role="img"
    aria-label={alt || 'Pixelate hover image'}
    data-pixelate-hover
    data-pixelate-image={image || src || ''}
    data-pixelate-mode={normaliseMode(mode)}
  >
    <canvas ref={canvasRef} className="pixelate-hover__canvas" aria-hidden="true" />
    {children ? <div className="pixelate-hover__content">{children}</div> : null}
  </div>
})

export default PixelateHover
