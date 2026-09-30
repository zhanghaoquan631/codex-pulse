import { useEffect, useRef } from 'react'
import './glass-cursor.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function drawCover(context, image, width, height, offsetX = 0, offsetY = 0) {
  const imageWidth = image.naturalWidth || image.width
  const imageHeight = image.naturalHeight || image.height
  if (!imageWidth || !imageHeight) return

  const scale = Math.max(width / imageWidth, height / imageHeight)
  const drawWidth = imageWidth * scale
  const drawHeight = imageHeight * scale
  const left = (width - drawWidth) * 0.5 + offsetX
  const top = (height - drawHeight) * 0.5 + offsetY
  context.drawImage(image, left, top, drawWidth, drawHeight)
}

function blobPath(context, centerX, centerY, radius, time, seed, warpAmount, warpScale) {
  const segments = 30
  context.beginPath()
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2
    const waveA = Math.sin(angle * (2.1 * warpScale) + seed * 4.3 + time * 0.0011)
    const waveB = Math.sin(angle * (4.7 * warpScale) - seed * 2.7 - time * 0.0007)
    const radiusScale = 0.83 + waveA * warpAmount * 0.16 + waveB * warpAmount * 0.08
    const distance = radius * radiusScale
    const x = centerX + Math.cos(angle) * distance
    const y = centerY + Math.sin(angle) * distance
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
}

export default function GlassCursor({
  src = '',
  imageUrl = '',
  className = '',
  dampening = 0.16,
  blobSize = 220,
  trailLength = 8,
  refraction = 0.16,
  blurSpread = 11,
  borderGlow = 0.82,
  blobWarpAmount = 0.6,
  blobWarpScale = 1.2,
  imageOpacity = 0.9,
  backgroundColor = '#111018',
  grayscale = true,
  dpr = 2,
  paused = false,
}) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const pointerRef = useRef({ x: 0, y: 0, active: false })
  const blobRef = useRef({ x: 0, y: 0, ready: false })
  const trailRef = useRef([])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return undefined

    const context = canvas.getContext('2d', { alpha: true })
    if (!context) return undefined

    const imageSource = src || imageUrl
    const sourceImage = new Image()
    sourceImage.decoding = 'async'
    if (/^https?:/i.test(imageSource || '')) sourceImage.crossOrigin = 'anonymous'

    let disposed = false
    let imageReady = false
    let animationFrame = 0
    let width = 1
    let height = 1
    let pixelRatio = 1
    let lastTime = performance.now()

    const resize = () => {
      const bounds = root.getBoundingClientRect()
      width = Math.max(1, Math.floor(bounds.width))
      height = Math.max(1, Math.floor(bounds.height))
      const requestedDpr = Number(dpr) > 0 ? Number(dpr) : 2
      pixelRatio = clamp((window.devicePixelRatio || 1) * 0.9, 1, requestedDpr)
      canvas.width = Math.max(1, Math.round(width * pixelRatio))
      canvas.height = Math.max(1, Math.round(height * pixelRatio))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      if (!blobRef.current.ready) {
        blobRef.current.x = width * 0.5
        blobRef.current.y = height * 0.5
      }
    }

    const drawBlob = (point, radius, alpha, now, isCurrent = false) => {
      if (alpha <= 0.01) return
      const seed = point.seed || 0.5

      context.save()
      blobPath(context, point.x, point.y, radius, now, seed, Number(blobWarpAmount) || 0.6, Number(blobWarpScale) || 1.2)
      context.filter = `blur(${Math.max(2, Number(blurSpread) || 11)}px)`
      context.fillStyle = `rgba(167, 139, 250, ${alpha * (isCurrent ? 0.22 : 0.12)})`
      context.fill()
      context.restore()

      context.save()
      blobPath(context, point.x, point.y, radius, now, seed, Number(blobWarpAmount) || 0.6, Number(blobWarpScale) || 1.2)
      context.fillStyle = `rgba(196, 181, 253, ${alpha * (isCurrent ? 0.12 : 0.06)})`
      context.fill()
      context.strokeStyle = `rgba(206, 195, 255, ${alpha * (Number(borderGlow) || 0.82)})`
      context.lineWidth = isCurrent ? 1.55 : 1.05
      context.stroke()
      context.restore()
    }

    const render = now => {
      const delta = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000))
      lastTime = now
      const pointer = pointerRef.current
      const blob = blobRef.current
      const smoothing = 1 - Math.pow(1 - clamp(Number(dampening) || 0.16, 0.02, 0.8), delta * 60)
      if (pointer.active) {
        if (!blob.ready) {
          blob.x = pointer.x
          blob.y = pointer.y
          blob.ready = true
        } else {
          blob.x += (pointer.x - blob.x) * smoothing
          blob.y += (pointer.y - blob.y) * smoothing
        }
      }

      context.save()
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      context.clearRect(0, 0, width, height)
      if (backgroundColor && backgroundColor !== 'transparent') {
        context.fillStyle = backgroundColor
        context.fillRect(0, 0, width, height)
      }

      if (imageReady) {
        context.globalAlpha = clamp(Number(imageOpacity) || 0, 0, 1)
        context.filter = grayscale ? 'grayscale(1) contrast(1.08) brightness(1.08)' : 'contrast(1.04)'
        drawCover(context, sourceImage, width, height)
        context.filter = 'none'
        context.globalAlpha = 1
      }

      const trail = trailRef.current
      for (let index = 0; index < trail.length; index += 1) {
        const point = trail[index]
        const age = (now - point.time) / 1000
        const fade = clamp(1 - age / 1.35, 0, 1) * (index + 1) / Math.max(1, trail.length)
        drawBlob(point, Math.max(38, Number(blobSize) || 220) * (0.28 + (index / Math.max(1, trail.length)) * 0.22), fade, now)
      }

      if (pointer.active && blob.ready) {
        const radius = Math.max(42, Number(blobSize) || 220) * 0.5

        // A clipped, slightly displaced copy of the artwork creates the
        // refracted “glass” pocket seen in the reference interaction.
        context.save()
        blobPath(context, blob.x, blob.y, radius, now, 0.37, Number(blobWarpAmount) || 0.6, Number(blobWarpScale) || 1.2)
        context.clip()
        context.globalAlpha = 0.24 * clamp(Number(refraction) || 0.16, 0, 1) * 4
        context.filter = `blur(${Math.max(1, Number(blurSpread) || 11) * 0.42}px) saturate(1.35)`
        if (imageReady) drawCover(context, sourceImage, width, height, (pointer.x - blob.x) * 0.16, (pointer.y - blob.y) * 0.16)
        context.restore()

        drawBlob(blob, radius, 1, now, true)
        context.save()
        context.strokeStyle = 'rgba(167, 139, 250, 0.42)'
        context.lineWidth = 0.8
        blobPath(context, blob.x, blob.y, radius * 0.88, now + 420, 0.83, Number(blobWarpAmount) || 0.6, Number(blobWarpScale) || 1.2)
        context.stroke()
        context.restore()
      }

      context.restore()
      trailRef.current = trail.filter(point => now - point.time < 1500)
    }

    const tick = now => {
      if (disposed) return
      if (!paused) render(now)
      animationFrame = window.requestAnimationFrame(tick)
    }

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(root)
    window.addEventListener('resize', resize)
    resize()
    sourceImage.onload = () => {
      if (disposed) return
      imageReady = true
    }
    sourceImage.onerror = () => {
      imageReady = false
    }
    sourceImage.src = imageSource || ''
    animationFrame = window.requestAnimationFrame(tick)

    return () => {
      disposed = true
      window.cancelAnimationFrame(animationFrame)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      sourceImage.onload = null
      sourceImage.onerror = null
    }
  }, [backgroundColor, blobSize, blobWarpAmount, blobWarpScale, borderGlow, dampening, dpr, grayscale, imageOpacity, imageUrl, paused, refraction, src, blurSpread])

  const handlePointerMove = event => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const x = clamp(event.clientX - bounds.left, 0, bounds.width)
    const y = clamp(event.clientY - bounds.top, 0, bounds.height)
    pointerRef.current = { x, y, active: true }
    const trail = trailRef.current
    const previous = trail[trail.length - 1]
    if (!previous || Math.hypot(previous.x - x, previous.y - y) > 4) {
      trail.push({ x, y, time: performance.now(), seed: Math.random() })
      const maxTrail = clamp(Math.round(Number(trailLength) || 8), 2, 18)
      if (trail.length > maxTrail) trail.splice(0, trail.length - maxTrail)
    }
  }

  const handlePointerLeave = () => {
    pointerRef.current.active = false
  }

  const cursorClassName = ['glass-cursor', className].filter(Boolean).join(' ')

  return (
    <div
      ref={rootRef}
      className={cursorClassName}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-glass-cursor="true"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  )
}
