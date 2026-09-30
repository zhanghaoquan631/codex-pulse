import { useEffect, useRef } from 'react'
import { Renderer, Program, Mesh, Triangle } from 'ogl'
import './Watercolor.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const numberInRange = (value, fallback, min, max) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback
}

function hexToRgb(value) {
  const source = typeof value === 'string' ? value.trim().replace(/^#/, '') : ''
  const expanded = source.length === 3
    ? source.split('').map(character => `${character}${character}`).join('')
    : source
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return [1, 1, 1]
  const parsed = Number.parseInt(expanded, 16)
  return [
    ((parsed >> 16) & 255) / 255,
    ((parsed >> 8) & 255) / 255,
    (parsed & 255) / 255,
  ]
}

function cssSize(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

const vertexShader = `
precision highp float;

attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uMouseActive;
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uOctaves;
uniform float uPersistence;
uniform float uLacunarity;
uniform float uDriftSpeed;
uniform float uWarpSpeed;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uColorGain;
uniform float uSaturation;
uniform float uBrightness;
uniform float uOpacity;
uniform float uCursorInteraction;
uniform float uCursorIntensity;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float normalizer = 0.0;
  float frequency = 1.0;
  for (int octave = 0; octave < 8; octave += 1) {
    float enabled = step(float(octave), uOctaves - 0.5);
    value += noise(p * frequency) * amplitude * enabled;
    normalizer += amplitude * enabled;
    frequency *= uLacunarity;
    amplitude *= uPersistence;
  }
  return value / max(normalizer, 0.0001);
}

vec3 saturateColor(vec3 color, float amount) {
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(luminance), color, 1.0 + amount);
}

void main() {
  vec2 safeResolution = max(uResolution, vec2(1.0));
  float aspect = safeResolution.x / safeResolution.y;
  vec2 centered = (vUv - 0.5) * vec2(aspect, 1.0);
  float time = uTime * uSpeed;

  vec2 drift = vec2(time * uDriftSpeed * 0.42, -time * uDriftSpeed * 0.31);
  vec2 samplePoint = centered * (2.8 * uScale) + drift;
  vec2 cursorPoint = (uMouse - 0.5) * vec2(aspect, 1.0);
  vec2 cursorDelta = centered - cursorPoint;
  float cursorDistance = length(cursorDelta);
  float cursorFalloff = exp(-cursorDistance * 3.7) * uMouseActive * uCursorInteraction * uCursorIntensity;
  vec2 cursorDirection = cursorDistance > 0.001 ? cursorDelta / cursorDistance : vec2(0.0);
  samplePoint += cursorDirection * cursorFalloff * 0.24;

  float warpA = fbm(samplePoint * 0.82 + vec2(time * uWarpSpeed * 0.23, -time * uWarpSpeed * 0.17));
  float warpB = fbm(samplePoint * 0.82 + vec2(4.7, -2.3) - vec2(time * uWarpSpeed * 0.19, time * uWarpSpeed * 0.27));
  vec2 warpedPoint = samplePoint + (vec2(warpA, warpB) - 0.5) * (0.42 + cursorFalloff * 0.65);

  float broad = fbm(warpedPoint);
  float detail = fbm(warpedPoint * 1.85 + vec2(8.2, 1.7));
  float pools = smoothstep(0.28, 0.82, abs(broad - 0.5) + detail * 0.18);
  float blend = clamp((broad * 0.76 + detail * 0.24 - 0.5) * uColorGain + 0.5 + uBrightness, 0.0, 1.0);
  blend = mix(blend, smoothstep(0.12, 0.92, blend), 0.24 + pools * 0.12);
  blend = clamp(blend + cursorFalloff * 0.08, 0.0, 1.0);

  vec3 color = mix(uColor1, uColor2, blend);
  color = saturateColor(color, uSaturation);
  color *= 1.0 + cursorFalloff * 0.22;

  float edge = 1.0 - smoothstep(0.18, 1.05, length(centered / vec2(max(aspect, 1.0), 1.0)));
  color *= 0.93 + edge * 0.07;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), uOpacity);
}
`

/**
 * Clean-room Watercolor shader based on the public React Bits Pro contract.
 * It intentionally uses browser WebGL primitives rather than protected source.
 */
export default function Watercolor({
  width = '100%',
  height = '100%',
  className = '',
  children,
  speed = 0.6,
  scale = 0.6,
  octaves = 6,
  persistence = 0.6,
  lacunarity = 2.4,
  driftSpeed = 0.04,
  warpSpeed = 0.08,
  color1 = '#0a0a0a',
  color2 = '#e0e0e0',
  colorGain = 1,
  saturation = 0,
  brightness = 0.15,
  opacity = 1,
  cursorInteraction = false,
  cursorIntensity = 1,
  style,
  ...rest
}) {
  const containerRef = useRef(null)
  const propsRef = useRef(null)

  propsRef.current = {
    speed: numberInRange(speed, 0.6, 0.01, 3),
    scale: numberInRange(scale, 0.6, 0.5, 5),
    octaves: Math.round(numberInRange(octaves, 6, 1, 8)),
    persistence: numberInRange(persistence, 0.6, 0.1, 1),
    lacunarity: numberInRange(lacunarity, 2.4, 1, 4),
    driftSpeed: numberInRange(driftSpeed, 0.04, 0, 0.5),
    warpSpeed: numberInRange(warpSpeed, 0.08, 0, 0.5),
    color1: hexToRgb(color1),
    color2: hexToRgb(color2),
    colorGain: numberInRange(colorGain, 1, 0.1, 3),
    saturation: numberInRange(saturation, 0, 0, 2),
    brightness: numberInRange(brightness, 0.15, -0.5, 0.5),
    opacity: numberInRange(opacity, 1, 0, 1),
    cursorInteraction: Boolean(cursorInteraction),
    cursorIntensity: numberInRange(cursorIntensity, 1, 0, 3),
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    container.dataset.watercolorPointer = 'idle'

    let renderer
    try {
      renderer = new Renderer({
        alpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      })
    } catch {
      container.dataset.watercolorFallback = 'true'
      return undefined
    }

    if (!renderer?.gl) {
      container.dataset.watercolorFallback = 'true'
      return undefined
    }
    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const canvas = gl.canvas
    canvas.className = 'watercolor__canvas'
    canvas.setAttribute('aria-hidden', 'true')
    container.appendChild(canvas)

    const uniforms = {
      uResolution: { value: [1, 1] },
      uMouse: { value: [0.5, 0.5] },
      uMouseActive: { value: 0 },
      uTime: { value: 0 },
      uSpeed: { value: 0.6 },
      uScale: { value: 0.6 },
      uOctaves: { value: 6 },
      uPersistence: { value: 0.6 },
      uLacunarity: { value: 2.4 },
      uDriftSpeed: { value: 0.04 },
      uWarpSpeed: { value: 0.08 },
      uColor1: { value: [0, 0, 0] },
      uColor2: { value: [1, 1, 1] },
      uColorGain: { value: 1 },
      uSaturation: { value: 0 },
      uBrightness: { value: 0.15 },
      uOpacity: { value: 1 },
      uCursorInteraction: { value: 0 },
      uCursorIntensity: { value: 1 },
    }

    let program
    let mesh
    try {
      program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        cullFace: false,
      })
      mesh = new Mesh(gl, { geometry: new Triangle(gl), program })
    } catch {
      container.dataset.watercolorFallback = 'true'
      if (canvas.parentNode === container) container.removeChild(canvas)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      return undefined
    }
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, targetActive: 0 }
    const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let reducedMotion = Boolean(reducedQuery?.matches)
    const onReducedMotion = () => { reducedMotion = Boolean(reducedQuery?.matches) }
    reducedQuery?.addEventListener?.('change', onReducedMotion)

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const widthPx = Math.max(1, rect.width || container.clientWidth || 1)
      const heightPx = Math.max(1, rect.height || container.clientHeight || 1)
      renderer.setSize(widthPx, heightPx)
      uniforms.uResolution.value[0] = widthPx
      uniforms.uResolution.value[1] = heightPx
    }

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    resizeObserver?.observe(container)
    window.addEventListener('resize', resize)
    resize()

    const localPoint = (clientX, clientY) => {
      const rect = container.getBoundingClientRect()
      if (!rect.width || !rect.height) return null
      return {
        x: clamp((clientX - rect.left) / rect.width, 0, 1),
        y: clamp(1 - (clientY - rect.top) / rect.height, 0, 1),
      }
    }
    const onMove = event => {
      const point = localPoint(event.clientX, event.clientY)
      if (!point) return
      pointer.tx = point.x
      pointer.ty = point.y
      pointer.targetActive = 1
      container.dataset.watercolorPointer = 'active'
    }
    const onEnter = event => {
      pointer.targetActive = 1
      onMove(event)
    }
    const onLeave = () => {
      pointer.targetActive = 0
      container.dataset.watercolorPointer = 'idle'
    }
    const onTouch = event => {
      const touch = event.touches?.[0]
      if (touch) onMove(touch)
    }

    const eventPrefix = 'PointerEvent' in window ? 'pointer' : 'mouse'
    container.addEventListener(`${eventPrefix}move`, onMove, { passive: true })
    container.addEventListener(`${eventPrefix}enter`, onEnter, { passive: true })
    container.addEventListener(`${eventPrefix}leave`, onLeave, { passive: true })
    container.addEventListener('touchstart', onTouch, { passive: true })
    container.addEventListener('touchmove', onTouch, { passive: true })
    container.addEventListener('touchend', onLeave, { passive: true })

    let raf = 0
    let isVisible = true
    const visibilityObserver = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => {
        isVisible = Boolean(entry?.isIntersecting)
        if (isVisible && !raf && document.visibilityState !== 'hidden') raf = requestAnimationFrame(render)
      }, { rootMargin: '160px' })
      : null
    visibilityObserver?.observe(container)
    const onDocumentVisibility = () => {
      if (document.visibilityState === 'visible' && isVisible && !raf) raf = requestAnimationFrame(render)
    }
    document.addEventListener('visibilitychange', onDocumentVisibility)
    let last = performance.now()
    let elapsed = 0
    const render = now => {
      raf = 0
      if (!isVisible || document.visibilityState === 'hidden') return
      const delta = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      const config = propsRef.current
      const easing = 1 - Math.exp(-delta * 8)
      pointer.x += (pointer.tx - pointer.x) * easing
      pointer.y += (pointer.ty - pointer.y) * easing
      pointer.active += (pointer.targetActive - pointer.active) * easing
      if (!reducedMotion) elapsed += delta

      uniforms.uResolution.value[0] = Math.max(1, uniforms.uResolution.value[0])
      uniforms.uResolution.value[1] = Math.max(1, uniforms.uResolution.value[1])
      uniforms.uMouse.value[0] = pointer.x
      uniforms.uMouse.value[1] = pointer.y
      uniforms.uMouseActive.value = pointer.active
      uniforms.uTime.value = elapsed
      uniforms.uSpeed.value = config.speed
      uniforms.uScale.value = config.scale
      uniforms.uOctaves.value = config.octaves
      uniforms.uPersistence.value = config.persistence
      uniforms.uLacunarity.value = config.lacunarity
      uniforms.uDriftSpeed.value = config.driftSpeed
      uniforms.uWarpSpeed.value = config.warpSpeed
      uniforms.uColor1.value = config.color1
      uniforms.uColor2.value = config.color2
      uniforms.uColorGain.value = config.colorGain
      uniforms.uSaturation.value = config.saturation
      uniforms.uBrightness.value = config.brightness
      uniforms.uOpacity.value = config.opacity
      uniforms.uCursorInteraction.value = config.cursorInteraction ? 1 : 0
      uniforms.uCursorIntensity.value = config.cursorIntensity
      renderer.render({ scene: mesh })
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)

    container.dataset.watercolorFallback = 'false'

    return () => {
      cancelAnimationFrame(raf)
      visibilityObserver?.disconnect()
      document.removeEventListener('visibilitychange', onDocumentVisibility)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      reducedQuery?.removeEventListener?.('change', onReducedMotion)
      container.removeEventListener(`${eventPrefix}move`, onMove)
      container.removeEventListener(`${eventPrefix}enter`, onEnter)
      container.removeEventListener(`${eventPrefix}leave`, onLeave)
      container.removeEventListener('touchstart', onTouch)
      container.removeEventListener('touchmove', onTouch)
      container.removeEventListener('touchend', onLeave)
      if (canvas.parentNode === container) container.removeChild(canvas)
      const loseContext = gl.getExtension('WEBGL_lose_context')
      loseContext?.loseContext()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`watercolor ${className}`.trim()}
      style={{ width: cssSize(width, '100%'), height: cssSize(height, '100%'), ...style }}
      data-watercolor
      {...rest}
    >
      <div className="watercolor__fallback" aria-hidden="true" />
      <div className="watercolor__content">{children}</div>
    </div>
  )
}
