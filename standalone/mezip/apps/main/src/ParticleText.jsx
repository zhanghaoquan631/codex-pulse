import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

const FALLBACK_FONT = "'Manrope', 'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

const smoothstep = (value) => {
  const t = clamp(value)
  return t * t * (3 - 2 * t)
}

const random = (seed) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

const makeFallState = () => ({
  phase: 'idle',
  armed: true,
  dx: 0,
  dy: 0,
  vx: 0,
  vy: 0,
  rotation: 0,
  spin: 0,
  opacity: 0,
  cooldown: 0,
})

/**
 * A scoped version of the particle typography used by mezip-particle-fall-v2.
 * The transparent measurement text keeps the original layout accessible while
 * a small canvas samples each glyph and gathers its particles into place.
 */
export default function ParticleText({ text, ready, variant = 'title', className = '' }) {
  const hostRef = useRef(null)
  const measureRef = useRef(null)
  const canvasRef = useRef(null)
  const measureCharsRef = useRef([])
  const fallCharsRef = useRef([])
  const pointerRef = useRef({ x: -9999, y: -9999, active: false })
  const modelRef = useRef({
    width: 1,
    height: 1,
    dpr: 1,
    particles: [],
    origins: [],
    states: [],
    formed: false,
    layoutReady: false,
  })
  const layoutSignatureRef = useRef('')
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [canvasSupported, setCanvasSupported] = useState(true)
  const chars = useMemo(() => [...text], [text])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return undefined
    const sync = () => setReducedMotion(query.matches)
    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  const buildLayout = useCallback(() => {
    const host = hostRef.current
    const measure = measureRef.current
    const canvas = canvasRef.current
    if (!host || !measure || !canvas) return

    const context = canvas.getContext('2d', { alpha: true })
    if (!context) {
      setCanvasSupported(false)
      host.dataset.particleSupport = 'false'
      return
    }
    setCanvasSupported(true)
    host.dataset.particleSupport = 'true'

    const hostRect = host.getBoundingClientRect()
    const measureRect = measure.getBoundingClientRect()
    const width = Math.max(1, Math.round(hostRect.width || measureRect.width))
    const height = Math.max(1, Math.ceil(measureRect.height || hostRect.height))
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const glyphs = chars.map((char, index) => {
      const node = measureCharsRef.current[index]
      if (!node) return null
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      const left = rect.left - hostRect.left
      const top = rect.top - hostRect.top
      const charWidth = Math.max(1, rect.width)
      const charHeight = Math.max(1, rect.height)
      // Canvas does not accept CSS's `font-size / line-height` shorthand, so
      // assemble the sampler font from individual computed properties.
      const font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily || FALLBACK_FONT}`
      return { char, index, left, top, charWidth, charHeight, font }
    })
    // Round sub-pixel values before comparing layouts. Browser translation
    // overlays and compositing can move an inline glyph by a few hundredths of
    // a pixel without changing the real layout; treating that as a new layout
    // would keep restarting the scatter animation.
    const geometry = glyphs.map((glyph) => glyph
      ? `${glyph.left.toFixed(1)},${glyph.top.toFixed(1)},${glyph.charWidth.toFixed(1)},${glyph.charHeight.toFixed(1)},${glyph.font}`
      : 'missing').join('|')
    const signature = `${width}:${height}:${dpr}:${variant}:${geometry}`
    const existingModel = modelRef.current

    // Translation tools and font loading can emit ResizeObserver events even
    // when the actual text box has not changed. Do not restart the formation
    // for those no-op events; otherwise a slower browser gets stuck halfway
    // through the scatter-to-text transition.
    if (signature === layoutSignatureRef.current && existingModel.layoutReady) {
      host.dataset.particleState = ready && !reducedMotion
        ? (existingModel.formed ? 'formed' : 'forming')
        : 'static'
      return
    }

    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    const sampleCanvas = document.createElement('canvas')
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
    if (!sampleContext) {
      setCanvasSupported(false)
      return
    }

    const origins = []
    const rawParticles = []
    // Dense sampling keeps the smaller description readable while retaining
    // the airy dot texture of the reference particle lettering.
    const sampleStep = 1

    glyphs.forEach((glyph) => {
      if (!glyph) return
      const { char, index, left, top, charWidth, charHeight, font } = glyph
      origins[index] = {
        x: left + charWidth / 2,
        y: top + charHeight / 2,
        radius: variant === 'title' ? 88 : 58,
        left,
        top,
        width: charWidth,
        height: charHeight,
      }

      // Spaces keep their measured position but do not need sampled pixels.
      if (!char.trim()) return

      const sampleWidth = Math.max(12, Math.ceil(charWidth + 14))
      const sampleHeight = Math.max(18, Math.ceil(charHeight + 14))
      sampleCanvas.width = sampleWidth
      sampleCanvas.height = sampleHeight
      sampleContext.setTransform(1, 0, 0, 1, 0, 0)
      sampleContext.clearRect(0, 0, sampleWidth, sampleHeight)
      sampleContext.font = font
      sampleContext.textAlign = 'left'
      sampleContext.textBaseline = 'alphabetic'
      sampleContext.fillStyle = '#fff'
      const baseline = Math.max(10, Math.min(sampleHeight - 2, charHeight * 0.79))
      sampleContext.fillText(char, 5, baseline)
      const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data

      for (let y = 0; y < sampleHeight; y += sampleStep) {
        for (let x = 0; x < sampleWidth; x += sampleStep) {
          const alpha = pixels[(y * sampleWidth + x) * 4 + 3]
          if (alpha < 100) continue
          const tx = left + x - 5
          const ty = top + y
          if (tx < left - 2 || tx > left + charWidth + 2 || ty < top - 2 || ty > top + charHeight + 2) continue
          rawParticles.push({
            tx,
            ty,
            charIndex: index,
            size: variant === 'title' ? 1.0 + random(index * 37 + x * 3 + y) * 1.2 : 0.92 + random(index * 41 + x * 5 + y) * 1.05,
            phase: random(index * 17 + x * 11 + y * 7) * Math.PI * 2,
            speed: 0.55 + random(index * 13 + x + y * 3) * 1.1,
          })
        }
      }
    })

    const maxPoints = variant === 'title'
      ? (width < 560 ? 2100 : 3200)
      : (width < 560 ? 1000 : 1400)
    const stride = rawParticles.length > maxPoints ? rawParticles.length / maxPoints : 1
    const particles = rawParticles
      .filter((_, index) => stride === 1 || index % Math.ceil(stride) === 0)
      .map((point, index) => ({
        ...point,
        x: width * (0.08 + random(index + 901) * 0.84),
        y: height * (0.05 + random(index + 1701) * 1.55),
        vx: 0,
        vy: 0,
      }))

    const model = modelRef.current
    model.width = width
    model.height = height
    model.dpr = dpr
    model.particles = particles
    model.origins = origins
    model.states = chars.map(() => makeFallState())
    model.formed = false
    model.lastTime = 0
    model.layoutReady = true
    host.dataset.particleCount = String(particles.length)
    host.dataset.particleState = ready && !reducedMotion ? 'forming' : 'static'

    layoutSignatureRef.current = signature
    setLayoutVersion((value) => value + 1)
  }, [chars, ready, reducedMotion, variant])

  useLayoutEffect(() => {
    buildLayout()
    const host = hostRef.current
    if (!host) return undefined
    let disposed = false
    let resizeFrame = 0
    const scheduleLayout = () => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0
        buildLayout()
      })
    }
    const resizeObserver = new ResizeObserver(scheduleLayout)
    resizeObserver.observe(host)
    const onResize = scheduleLayout
    window.addEventListener('resize', onResize)
    document.fonts?.ready?.then(() => { if (!disposed) scheduleLayout() })
    return () => {
      disposed = true
      cancelAnimationFrame(resizeFrame)
      resizeObserver.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [buildLayout])

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    const model = modelRef.current
    if (!host || !canvas || !model.layoutReady) return undefined
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) return undefined

    let raf = 0
    let disposed = false
    const startedAt = performance.now()
    const pointer = pointerRef.current

    const resetDomLetters = () => {
      fallCharsRef.current.forEach((node) => {
        if (!node) return
        node.style.opacity = '0'
        node.style.transform = 'translate3d(0, 0, 0) rotateZ(0deg)'
      })
    }

    if (!ready || reducedMotion || !canvasSupported) {
      model.formed = reducedMotion || !ready
      host.dataset.particleState = reducedMotion ? 'static' : 'waiting'
      context.clearRect(0, 0, model.width, model.height)
      resetDomLetters()
      return undefined
    }

    model.states = chars.map(() => makeFallState())
    model.formed = false
    host.dataset.particleState = 'forming'

    const onPointerMove = (event) => {
      const rect = host.getBoundingClientRect()
      const margin = variant === 'title' ? 116 : 76
      const inside = event.clientX >= rect.left - margin && event.clientX <= rect.right + margin
        && event.clientY >= rect.top - margin && event.clientY <= rect.bottom + margin
      if (!inside) {
        pointer.active = false
        return
      }
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.active = true
    }
    const onPointerLeave = () => { pointer.active = false }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('blur', onPointerLeave)

    const tick = (now) => {
      if (disposed) return
      const dt = Math.min(2.2, Math.max(0.25, (now - (model.lastTime || now)) / 16.67))
      model.lastTime = now
      const intro = clamp((now - startedAt) / 2100)
      const introEase = smoothstep(intro)
      if (intro >= 1 && !model.formed) {
        model.formed = true
        host.dataset.particleState = 'formed'
      }

      context.clearRect(0, 0, model.width, model.height)
      const particleColor = variant === 'title' ? [250, 250, 250] : [238, 238, 238]
      const drift = variant === 'title' ? 1.2 + (1 - introEase) * 14 : 0.65 + (1 - introEase) * 8

      model.particles.forEach((particle, index) => {
        const targetX = particle.tx + Math.cos(particle.phase + now * 0.00016 * particle.speed) * drift
        const targetY = particle.ty + Math.sin(particle.phase * 0.8 + now * 0.0002 * particle.speed) * drift
        const spring = (variant === 'title' ? 0.024 : 0.03) * dt * (0.2 + introEase * 0.8)
        particle.vx += (targetX - particle.x) * spring
        particle.vy += (targetY - particle.y) * spring
        particle.vx *= 0.89
        particle.vy *= 0.89
        particle.x += particle.vx * dt
        particle.y += particle.vy * dt
        const shimmer = 0.82 + Math.sin(now * 0.0014 + particle.phase) * 0.14
        context.fillStyle = `rgba(${particleColor[0]}, ${particleColor[1]}, ${particleColor[2]}, ${shimmer})`
        context.beginPath()
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        context.fill()
      })

      if (pointer.active) {
        const glowRadius = variant === 'title' ? 118 : 78
        const glow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, glowRadius)
        glow.addColorStop(0, variant === 'title' ? 'rgba(255,255,255,.13)' : 'rgba(210,210,210,.09)')
        glow.addColorStop(1, 'rgba(255,255,255,0)')
        context.fillStyle = glow
        context.beginPath()
        context.arc(pointer.x, pointer.y, glowRadius, 0, Math.PI * 2)
        context.fill()
      }

      const viewportHeight = window.innerHeight || 800
      model.states.forEach((state, index) => {
        const origin = model.origins[index]
        const char = chars[index]
        const node = fallCharsRef.current[index]
        if (!origin || !state || !node || !char.trim()) return

        if (model.formed && pointer.active && state.phase === 'idle' && state.armed) {
          const distance = Math.hypot(pointer.x - origin.x, pointer.y - origin.y)
          if (distance < origin.radius && now > state.cooldown) {
            const awayX = origin.x - pointer.x
            state.phase = 'fall'
            state.armed = false
            state.dx = 0
            state.dy = 0
            state.vx = clamp(awayX * 0.055, -4.2, 4.2) + (index % 2 ? 0.45 : -0.45)
            state.vy = 1.15 + (index % 3) * 0.23
            state.rotation = 0
            state.spin = (index % 2 ? 1 : -1) * (0.8 + (index % 3) * 0.32)
            state.opacity = 1
          }
        }

        if (!pointer.active && !state.armed && state.phase === 'idle') state.armed = true
        if (state.phase === 'fall') {
          state.vy += 0.42 * dt
          state.vx *= Math.pow(0.994, dt)
          state.dx += state.vx * dt
          state.dy += state.vy * dt
          state.rotation += state.spin * dt
          state.opacity = Math.max(0, state.opacity - 0.007 * dt)
          if (state.dy > viewportHeight * 0.7 || state.opacity <= 0.02) {
            state.phase = 'return'
            state.cooldown = now + 440
          }
        } else if (state.phase === 'return') {
          state.dx *= Math.pow(0.8, dt)
          state.dy *= Math.pow(0.8, dt)
          state.rotation *= Math.pow(0.8, dt)
          state.opacity = Math.min(1, state.opacity + 0.08 * dt)
          if (Math.abs(state.dx) < 0.6 && Math.abs(state.dy) < 0.6 && state.opacity > 0.98) {
            state.phase = 'idle'
            state.dx = 0
            state.dy = 0
            state.rotation = 0
            state.opacity = 0
          }
        }
        node.style.opacity = String(state.opacity)
        node.style.transform = `translate3d(${state.dx}px, ${state.dy}px, 0) rotateZ(${state.rotation}deg)`
      })

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onPointerLeave)
      pointer.active = false
      context.clearRect(0, 0, model.width, model.height)
      resetDomLetters()
    }
  }, [canvasSupported, chars, layoutVersion, ready, reducedMotion, text, variant])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.dataset.motion = reducedMotion ? 'reduced' : 'full'
  }, [reducedMotion])

  return (
    <span
      ref={hostRef}
      className={`cortex-particle-text cortex-particle-text--${variant} notranslate ${className}`.trim()}
      data-particle-text="true"
      data-particle-state={ready ? 'forming' : 'waiting'}
      aria-hidden="true"
      translate="no"
    >
      <span ref={measureRef} className="cortex-particle-measure notranslate" translate="no">
        {chars.map((char, index) => (
          <span
            key={`${char}-${index}`}
            ref={(node) => { measureCharsRef.current[index] = node }}
            className="cortex-particle-measure-char notranslate"
            translate="no"
          >{char}</span>
        ))}
      </span>
      <canvas ref={canvasRef} className="cortex-particle-canvas" aria-hidden="true" />
      <span className="cortex-particle-fall-layer notranslate" aria-hidden="true" translate="no">
        {chars.map((char, index) => (
          <span
            key={`fall-${char}-${index}`}
            ref={(node) => { fallCharsRef.current[index] = node }}
            className="cortex-particle-fall-char notranslate"
            translate="no"
            style={{ opacity: 0 }}
          >{char === ' ' ? '\u00a0' : char}</span>
        ))}
      </span>
    </span>
  )
}
