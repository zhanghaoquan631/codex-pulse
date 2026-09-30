import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import './ShaderReveal.css'

const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const cssSize = (value, fallback) => {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

const hash = value => {
  let result = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0) / 4294967295
}

const drawCover = (context, image, width, height) => {
  if (!image || !image.naturalWidth || !image.naturalHeight) return false
  const imageRatio = image.naturalWidth / image.naturalHeight
  const boxRatio = width / Math.max(height, 1)
  let drawWidth = width
  let drawHeight = height
  let offsetX = 0
  let offsetY = 0
  if (imageRatio > boxRatio) {
    drawHeight = height
    drawWidth = height * imageRatio
    offsetX = (width - drawWidth) * 0.5
  } else {
    drawWidth = width
    drawHeight = width / imageRatio
    offsetY = (height - drawHeight) * 0.5
  }
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
  return true
}

const fallbackBackdrop = (context, width, height, seed = 0) => {
  const gradient = context.createLinearGradient(0, 0, width, height)
  const hue = Math.round((seed * 360) % 360)
  gradient.addColorStop(0, `hsla(${hue}, 36%, 18%, 1)`)
  gradient.addColorStop(0.5, 'rgba(20, 24, 34, 1)')
  gradient.addColorStop(1, `hsla(${(hue + 42) % 360}, 42%, 11%, 1)`)
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
}

const ShaderReveal = forwardRef(function ShaderReveal({
  frontImage = '',
  backImage = '',
  mouseForce = 50,
  cursorSize = 250,
  resolution = 0.5,
  isViscous = true,
  viscous = 30,
  iterationsViscous = 24,
  iterationsPoisson = 28,
  dt = 0.014,
  BFECC = true,
  isBounce = false,
  autoDemo = true,
  autoSpeed = 0.55,
  autoIntensity = 2.2,
  takeoverDuration = 0.25,
  autoResumeDelay = 1200,
  autoRampDuration = 0.6,
  revealStrength = 0.75,
  revealSoftness = 1,
  style,
  className = '',
  as = 'div',
  children,
  ...rest
}, forwardedRef) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const configRef = useRef(null)
  const controlsRef = useRef({ play: () => {}, pause: () => {}, reset: () => {}, reveal: () => {} })
  const config = {
    frontImage: typeof frontImage === 'string' ? frontImage : '',
    backImage: typeof backImage === 'string' ? backImage : '',
    mouseForce: Math.max(0, finite(mouseForce, 50)),
    cursorSize: Math.max(20, finite(cursorSize, 250)),
    resolution: clamp(finite(resolution, 0.5), 0.25, 1),
    isViscous: Boolean(isViscous),
    viscous: Math.max(0, finite(viscous, 30)),
    iterationsViscous: Math.max(1, Math.round(finite(iterationsViscous, 24))),
    iterationsPoisson: Math.max(1, Math.round(finite(iterationsPoisson, 28))),
    dt: Math.max(0.001, finite(dt, 0.014)),
    BFECC: Boolean(BFECC),
    isBounce: Boolean(isBounce),
    autoDemo: Boolean(autoDemo),
    autoSpeed: Math.max(0, finite(autoSpeed, 0.55)),
    autoIntensity: Math.max(0, finite(autoIntensity, 2.2)),
    takeoverDuration: Math.max(0, finite(takeoverDuration, 0.25)),
    autoResumeDelay: Math.max(0, finite(autoResumeDelay, 1200)),
    autoRampDuration: Math.max(0, finite(autoRampDuration, 0.6)),
    revealStrength: clamp(finite(revealStrength, 0.75), 0, 2),
    revealSoftness: Math.max(0.05, finite(revealSoftness, 1)),
  }
  configRef.current = config

  useImperativeHandle(forwardedRef, () => ({
    play: () => controlsRef.current.play(),
    pause: () => controlsRef.current.pause(),
    reset: () => controlsRef.current.reset(),
    reveal: point => controlsRef.current.reveal(point),
  }), [])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return undefined

    const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
    root.dataset.shaderRevealReducedMotion = reducedMotion ? 'true' : 'false'
    root.dataset.shaderRevealFront = configRef.current.frontImage
    root.dataset.shaderRevealBack = configRef.current.backImage

    let context = null
    try {
      context = canvas.getContext('2d', { alpha: true, desynchronized: true })
    } catch {
      context = null
    }

    let width = 1
    let height = 1
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let disposed = false
    let raf = 0
    let frame = 0
    let playing = !reducedMotion
    let pointerInside = false
    let userActiveUntil = 0
    let lastPointer = null
    let startedAt = performance.now()
    let lastFrameAt = startedAt
    let autoCursor = { x: 0.5, y: 0.5 }
    let imagesReady = false
    let front = null
    let back = null
    const particles = []
    const seed = hash(`${configRef.current.frontImage}|${configRef.current.backImage}`)

    root.dataset.shaderRevealMode = context ? 'canvas-2d' : 'css'
    root.dataset.shaderRevealFallback = context ? 'false' : 'true'
    root.dataset.shaderRevealReady = 'false'
    root.dataset.shaderRevealPlaying = playing ? 'true' : 'false'
    root.dataset.shaderRevealFrame = '0'

    const loadImage = source => new Promise(resolve => {
      if (!source) {
        resolve(null)
        return
      }
      const image = new window.Image()
      image.decoding = 'async'
      image.loading = 'eager'
      image.onload = () => resolve(image)
      image.onerror = () => resolve(null)
      image.src = source
    })

    const setSize = () => {
      const rect = root.getBoundingClientRect()
      width = Math.max(1, Math.round(rect.width || 1))
      height = Math.max(1, Math.round(rect.height || 1))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const scale = configRef.current.resolution
      canvas.width = Math.max(1, Math.round(width * dpr * scale))
      canvas.height = Math.max(1, Math.round(height * dpr * scale))
      canvas.style.width = '100%'
      canvas.style.height = '100%'
    }

    const addParticle = (x, y, force = 1, vx = 0, vy = 0) => {
      const current = configRef.current
      const radius = clamp((current.cursorSize / Math.max(width, height)) * (0.34 + force * 0.22), 0.035, 0.44)
      particles.push({
        x: clamp(x, -0.15, 1.15),
        y: clamp(y, -0.15, 1.15),
        vx,
        vy,
        radius,
        life: 1,
        strength: clamp(force, 0.12, 3.5),
        phase: Math.random() * Math.PI * 2,
        seed: Math.random(),
      })
      if (particles.length > 44) particles.splice(0, particles.length - 44)
    }

    const pointerPosition = event => {
      const rect = root.getBoundingClientRect()
      return {
        x: clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
        y: clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
      }
    }

    const onPointerMove = event => {
      const point = pointerPosition(event)
      const previous = lastPointer || point
      const dx = point.x - previous.x
      const dy = point.y - previous.y
      const distance = Math.hypot(dx, dy)
      lastPointer = point
      pointerInside = true
      userActiveUntil = performance.now() + configRef.current.autoResumeDelay
      root.dataset.shaderRevealActive = 'true'
      if (distance > 0.001) {
        const force = clamp(distance * 18 + configRef.current.mouseForce / 70, 0.35, 3.2)
        addParticle(point.x, point.y, force, dx * 0.9, dy * 0.9)
        if (distance > 0.035) addParticle(point.x - dx * 0.4, point.y - dy * 0.4, force * 0.62, dx * 0.5, dy * 0.5)
      }
    }

    const onPointerEnter = event => {
      pointerInside = true
      lastPointer = pointerPosition(event)
      userActiveUntil = performance.now() + configRef.current.autoResumeDelay
      root.dataset.shaderRevealActive = 'true'
    }

    const onPointerLeave = () => {
      pointerInside = false
      lastPointer = null
      userActiveUntil = performance.now() + configRef.current.autoResumeDelay
      root.dataset.shaderRevealActive = 'false'
    }

    const onPointerDown = event => {
      const point = pointerPosition(event)
      addParticle(point.x, point.y, 2.8)
      userActiveUntil = performance.now() + configRef.current.autoResumeDelay
    }

    const drawImages = () => {
      if (!context) return
      const pixelWidth = canvas.width
      const pixelHeight = canvas.height
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, pixelWidth, pixelHeight)
      const hasBack = drawCover(context, back, pixelWidth, pixelHeight)
      if (!hasBack) fallbackBackdrop(context, pixelWidth, pixelHeight, seed)
      const hasFront = drawCover(context, front, pixelWidth, pixelHeight)
      if (!hasFront) {
        context.fillStyle = 'rgba(8, 10, 18, .88)'
        context.fillRect(0, 0, pixelWidth, pixelHeight)
      }
    }

    const eraseParticle = particle => {
      const current = configRef.current
      const px = particle.x * canvas.width
      const py = particle.y * canvas.height
      const radius = particle.radius * Math.min(canvas.width, canvas.height) * (0.75 + particle.life * 0.6) * current.revealSoftness
      const alpha = clamp(particle.life * particle.strength * current.revealStrength * 0.78, 0, 1)
      const wobble = 1 + Math.sin(particle.phase + particle.life * 8) * 0.1
      context.save()
      context.translate(px, py)
      context.rotate(Math.atan2(particle.vy, particle.vx) + Math.sin(particle.phase) * 0.35)
      context.scale(wobble, 0.7 + Math.min(1.7, Math.abs(particle.vx + particle.vy) * 5))
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius)
      gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`)
      gradient.addColorStop(0.25, `rgba(0, 0, 0, ${alpha * 0.9})`)
      gradient.addColorStop(0.62, `rgba(0, 0, 0, ${alpha * 0.42})`)
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.fillStyle = gradient
      context.fillRect(-radius, -radius, radius * 2, radius * 2)
      context.restore()
    }

    const drawHighlight = particle => {
      const current = configRef.current
      const px = particle.x * canvas.width
      const py = particle.y * canvas.height
      const radius = particle.radius * Math.min(canvas.width, canvas.height) * 0.86
      const alpha = clamp(particle.life * current.revealStrength * 0.2, 0, 0.22)
      context.save()
      context.globalCompositeOperation = 'source-over'
      context.strokeStyle = `rgba(255, 255, 255, ${alpha})`
      context.lineWidth = Math.max(1, canvas.width / 500)
      context.beginPath()
      context.arc(px, py, radius * (1.02 + (1 - particle.life) * 0.22), 0, Math.PI * 2)
      context.stroke()
      context.restore()
    }

    const updateParticle = (particle, delta, now) => {
      const current = configRef.current
      const viscousDamping = current.isViscous ? clamp(1 - current.viscous * 0.0008, 0.86, 0.995) : 0.992
      particle.life -= delta * (0.33 + (current.isViscous ? 0.05 : 0.14))
      particle.vx *= Math.pow(viscousDamping, delta * 60)
      particle.vy *= Math.pow(viscousDamping, delta * 60)
      particle.x += particle.vx * delta * (1.1 + current.dt * 12)
      particle.y += particle.vy * delta * (1.1 + current.dt * 12)
      particle.x += Math.sin(now * 0.001 * (0.6 + particle.seed) + particle.phase) * delta * 0.006
      particle.y += Math.cos(now * 0.001 * (0.5 + particle.seed) + particle.phase) * delta * 0.004
      if (current.isBounce) {
        if (particle.x < 0 || particle.x > 1) particle.vx *= -0.8
        if (particle.y < 0 || particle.y > 1) particle.vy *= -0.8
        particle.x = clamp(particle.x, 0, 1)
        particle.y = clamp(particle.y, 0, 1)
      }
    }

    const autoStep = now => {
      const current = configRef.current
      if (!current.autoDemo || pointerInside || now < userActiveUntil) return
      const elapsed = (now - startedAt) / 1000
      const x = 0.5 + Math.sin(elapsed * current.autoSpeed * 1.25 + seed * 5) * 0.25
      const y = 0.5 + Math.cos(elapsed * current.autoSpeed * 0.93 + seed * 3) * 0.22
      autoCursor = { x, y }
      if (Math.floor(elapsed * 10) % 4 === 0) {
        const force = clamp(current.autoIntensity * 0.55, 0.35, 2.2)
        addParticle(x, y, force, Math.cos(elapsed) * 0.02, Math.sin(elapsed * 1.2) * 0.02)
      }
    }

    const render = now => {
      if (disposed) return
      const delta = clamp((now - lastFrameAt) / 1000, 0.001, 0.05)
      lastFrameAt = now
      if (context) {
        autoStep(now)
        drawImages()
        context.globalCompositeOperation = 'destination-out'
        particles.forEach(particle => {
          updateParticle(particle, delta, now)
          if (particle.life > 0) eraseParticle(particle)
        })
        context.globalCompositeOperation = 'source-over'
        particles.forEach(particle => {
          if (particle.life > 0) drawHighlight(particle)
        })
        for (let index = particles.length - 1; index >= 0; index -= 1) {
          if (particles[index].life <= 0) particles.splice(index, 1)
        }
      }
      frame += 1
      if (frame % 6 === 0) root.dataset.shaderRevealFrame = String(frame)
      root.dataset.shaderRevealPlaying = playing ? 'true' : 'false'
      root.dataset.shaderRevealElapsed = ((now - startedAt) / 1000).toFixed(3)
      if (playing) raf = window.requestAnimationFrame(render)
      else raf = 0
    }

    const play = () => {
      if (reducedMotion) return
      if (playing) return
      playing = true
      lastFrameAt = performance.now()
      root.dataset.shaderRevealPlaying = 'true'
      raf = window.requestAnimationFrame(render)
    }

    const pause = () => {
      playing = false
      root.dataset.shaderRevealPlaying = 'false'
      if (raf) window.cancelAnimationFrame(raf)
      raf = 0
    }

    const reset = () => {
      particles.splice(0, particles.length)
      startedAt = performance.now()
      lastFrameAt = startedAt
      root.dataset.shaderRevealActive = 'false'
      if (!playing && !reducedMotion) play()
      else if (context) render(performance.now())
    }

    const reveal = point => {
      const next = point && typeof point === 'object' ? point : autoCursor
      addParticle(clamp(finite(next.x, 0.5), 0, 1), clamp(finite(next.y, 0.5), 0, 1), 2.5)
      if (!playing && !reducedMotion) play()
    }

    controlsRef.current = { play, pause, reset, reveal }
    root.addEventListener('pointermove', onPointerMove, { passive: true })
    root.addEventListener('pointerenter', onPointerEnter, { passive: true })
    root.addEventListener('pointerleave', onPointerLeave, { passive: true })
    root.addEventListener('pointerdown', onPointerDown, { passive: true })
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(setSize) : null
    resizeObserver?.observe(root)
    window.addEventListener('resize', setSize)
    setSize()

    Promise.all([loadImage(configRef.current.frontImage), loadImage(configRef.current.backImage)]).then(([nextFront, nextBack]) => {
      if (disposed) return
      front = nextFront
      back = nextBack
      imagesReady = true
      root.dataset.shaderRevealReady = 'true'
      if (context) render(performance.now())
    })

    if (context) render(performance.now())
    else root.dataset.shaderRevealReady = 'true'

    return () => {
      disposed = true
      if (raf) window.cancelAnimationFrame(raf)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', setSize)
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerenter', onPointerEnter)
      root.removeEventListener('pointerleave', onPointerLeave)
      root.removeEventListener('pointerdown', onPointerDown)
      controlsRef.current = { play: () => {}, pause: () => {}, reset: () => {}, reveal: () => {} }
      particles.splice(0, particles.length)
      front = null
      back = null
    }
  }, [])

  const rootStyle = {
    width: '100%',
    height: '100%',
    '--shader-reveal-strength': String(config.revealStrength),
    '--shader-reveal-softness': String(config.revealSoftness),
    ...style,
  }
  const rootProps = {
    ...rest,
    ref: rootRef,
    className: `shader-reveal${className ? ` ${className}` : ''}`.trim(),
    style: rootStyle,
    'data-shader-reveal': 'true',
    'data-shader-reveal-auto-demo': config.autoDemo ? 'true' : 'false',
  }

  return createElement(
    as || 'div',
    rootProps,
    <canvas ref={canvasRef} className="shader-reveal__canvas" aria-hidden="true" />,
    <span className="shader-reveal__sr-status" aria-live="polite" aria-atomic="true" />,
    children,
  )
})

export default ShaderReveal
