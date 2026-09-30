import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl'

import './LiquidSwap.css'

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
const mod = (value, size) => size ? ((value % size) + size) % size : 0

const number = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeImages = images => (Array.isArray(images) ? images : [])
  .map(item => typeof item === 'string' ? item : item?.src || item?.image || item?.url || '')
  .map(source => String(source || '').trim())
  .filter(Boolean)

const vertex = `
precision highp float;

attribute vec2 position;
attribute vec2 uv;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

// This shader is an independently-authored implementation of a circular,
// refractive image reveal. It is intentionally not based on React Bits Pro
// source code, which is not distributed on the public documentation page.
const fragment = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec2 uResolution;
uniform vec2 uFromSize;
uniform vec2 uToSize;
uniform vec2 uOrigin;
uniform float uProgress;
uniform float uTime;
uniform float uRefraction;
uniform float uChromatic;
uniform float uClarity;
uniform float uEdgeGlow;
uniform float uFlow;
uniform float uInvertTopHalf;

const float PI = 3.141592653589793;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int step = 0; step < 4; step++) {
    value += noise(p) * amplitude;
    p = p * 2.03 + vec2(17.2, 9.1);
    amplitude *= 0.5;
  }
  return value;
}

float easeInOut(float value) {
  return value < 0.5
    ? 4.0 * value * value * value
    : 1.0 - pow(-2.0 * value + 2.0, 3.0) * 0.5;
}

vec2 coverUv(vec2 uv, vec2 textureSize) {
  vec2 safeSize = max(textureSize, vec2(1.0));
  vec2 scale = uResolution / safeSize;
  vec2 rendered = safeSize * (uInvertTopHalf > 0.5 ? min(scale.x, scale.y) : max(scale.x, scale.y));
  vec2 offset = (uResolution - rendered) * 0.5;
  return (uv * uResolution - offset) / rendered;
}

vec3 refractedSample(sampler2D texture, vec2 size, vec2 uv, vec2 offset, float chromatic) {
  vec2 source = coverUv(uv, size);
  vec2 sampleMin = vec2(0.0);
  vec2 sampleMax = vec2(1.0);
  if (uInvertTopHalf > 0.5) {
    // Fit the entire source first, then rotate its upper half about its own
    // centre. The source divider stays at the stage centre at every aspect.
    if (source.x < 0.0 || source.x > 1.0 || source.y < 0.0 || source.y > 1.0) {
      return vec3(0.035, 0.035, 0.043);
    }
    if (source.y > 0.5) {
      source = vec2(1.0 - source.x, 1.5 - source.y);
      offset = -offset;
      sampleMin.y = 0.5;
    } else {
      sampleMax.y = 0.5;
    }
    // Refraction must not pull pixels across the source divider.
    vec2 halfTexel = 0.5 / max(size, vec2(1.0));
    sampleMin += halfTexel;
    sampleMax -= halfTexel;
  }
  vec2 split = offset * chromatic;
  float red = texture2D(texture, clamp(source + offset + split, sampleMin, sampleMax)).r;
  float green = texture2D(texture, clamp(source + offset, sampleMin, sampleMax)).g;
  float blue = texture2D(texture, clamp(source + offset - split, sampleMin, sampleMax)).b;
  return vec3(red, green, blue);
}

void main() {
  if (uProgress <= 0.0) {
    gl_FragColor = vec4(refractedSample(uFrom, uFromSize, vUv, vec2(0.0), 0.0), 1.0);
    return;
  }
  float ratio = uResolution.x / max(uResolution.y, 1.0);
  vec2 fromOrigin = vUv - uOrigin;
  vec2 metric = fromOrigin;
  metric.x *= ratio;

  float distanceFromOrigin = length(metric);
  float maximumRadius = sqrt(0.25 + 0.25 * ratio * ratio) + 0.14;
  float progress = clamp(uProgress, 0.0, 1.0);
  float eased = easeInOut(progress);
  float flowNoise = fbm(metric * (8.0 + uFlow * 8.0) + vec2(uTime * 0.00018 * uFlow, -uTime * 0.00012 * uFlow));
  float radius = mix(0.006, maximumRadius, eased);
  radius += (flowNoise - 0.5) * (0.022 + 0.024 * (1.0 - eased)) * uFlow;

  float thickness = mix(0.013, 0.034, uFlow) * (0.75 + 0.35 * (1.0 - eased));
  float reveal = 1.0 - smoothstep(radius - thickness, radius + thickness, distanceFromOrigin);
  float rim = exp(-pow(abs(distanceFromOrigin - radius) / max(thickness * 2.7, 0.001), 2.0));
  float inner = 1.0 - smoothstep(0.0, max(radius, 0.001), distanceFromOrigin);

  vec2 direction = normalize(metric + vec2(0.00001));
  direction.x /= ratio;
  float wave = sin(distanceFromOrigin * 105.0 - uTime * 0.007 * (0.7 + uFlow) + flowNoise * 9.0);
  float liquidBand = rim * (0.55 + 0.45 * wave) + inner * rim * 0.35;
  vec2 refraction = direction * liquidBand * (0.009 + 0.027 * uRefraction);
  refraction += vec2(
    sin(metric.y * 38.0 + uTime * 0.004) * 0.0018,
    cos(metric.x * 34.0 - uTime * 0.003) * 0.0018
  ) * uFlow * rim;

  float chromatic = uChromatic * 0.011 + rim * 0.003;
  vec3 before = refractedSample(uFrom, uFromSize, vUv, refraction, chromatic);
  vec3 after = refractedSample(uTo, uToSize, vUv, -refraction * 0.82, chromatic);
  vec3 color = mix(before, after, reveal);

  vec2 highlightDirection = normalize(vec2(-0.55, 0.82));
  float lighting = clamp(dot(direction, highlightDirection) * 0.5 + 0.5, 0.0, 1.0);
  float specular = pow(lighting, 10.0) * rim;
  float caustic = pow(max(0.0, 1.0 - distanceFromOrigin / max(radius, 0.001)), 2.8) * rim;
  float glow = rim * (0.22 + specular * 0.75 + caustic * 0.38) * uEdgeGlow;
  color += vec3(0.72, 0.86, 1.0) * glow;
  color += vec3(1.0) * specular * 0.28 * uEdgeGlow;

  float clarityWash = (1.0 - clamp(uClarity, 0.0, 1.5)) * inner * 0.16;
  color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), clarityWash);

  float completed = smoothstep(0.93, 1.0, progress);
  vec3 cleanAfter = refractedSample(uTo, uToSize, vUv, vec2(0.0), 0.0);
  color = mix(color, cleanAfter, completed);

  gl_FragColor = vec4(color, 1.0);
}
`

const LiquidSwap = forwardRef(function LiquidSwap({
  images = [],
  transitionDuration = 2.5,
  glassRefractionStrength = 1,
  glassChromaticAberration = 0,
  glassBubbleClarity = 1,
  glassEdgeGlow = 1,
  glassLiquidFlow = 1,
  startAtCursor = false,
  autoCycle = false,
  autoCycleDelay = 3000,
  initialIndex = 0,
  invertTopHalf = false,
  className = '',
  onIndexChange,
  onTransitionChange,
  style,
}, forwardedRef) {
  const rootRef = useRef(null)
  const transitionRef = useRef(() => {})
  const onIndexChangeRef = useRef(onIndexChange)
  const onTransitionChangeRef = useRef(onTransitionChange)
  const configRef = useRef({})
  const [activeIndex, setActiveIndex] = useState(0)
  const [ready, setReady] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [rendererMode, setRendererMode] = useState('loading')
  const [fallbackSize, setFallbackSize] = useState([1, 1])

  const imageSources = useMemo(() => normalizeImages(images), [images])
  const imageSignature = imageSources.join('\u0001')
  const safeDuration = Math.max(0, number(transitionDuration, 2.5))

  configRef.current = {
    transitionDuration: safeDuration,
    refraction: clamp(number(glassRefractionStrength, 1), 0, 2.5),
    chromatic: clamp(number(glassChromaticAberration, 0), 0, 2.5),
    clarity: clamp(number(glassBubbleClarity, 1), 0, 1.5),
    edgeGlow: clamp(number(glassEdgeGlow, 1), 0, 2.5),
    flow: clamp(number(glassLiquidFlow, 1), 0, 2.5),
    startAtCursor: Boolean(startAtCursor),
    autoCycle: Boolean(autoCycle),
    autoCycleDelay: Math.max(900, number(autoCycleDelay, 3000)),
  }
  onIndexChangeRef.current = onIndexChange
  onTransitionChangeRef.current = onTransitionChange

  const triggerSwap = useCallback(event => transitionRef.current(event), [])

  useImperativeHandle(forwardedRef, () => ({
    next: () => triggerSwap(),
    swap: () => triggerSwap(),
  }), [triggerSwap])

  useEffect(() => {
    const root = rootRef.current
    const sources = normalizeImages(imageSources)
    if (!root) return undefined

    const count = sources.length
    let disposed = false
    let raf = 0
    let autoTimer = 0
    let resizeObserver = null
    let renderer = null
    let canvas = null
    let currentTexture = null
    let nextTexture = null
    let program = null
    let current = count ? mod(Math.round(number(initialIndex, 0)), count) : 0
    let pending = current
    let transition = null
    let loadedImages = new Map()
    const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)

    setReady(false)
    setTransitioning(false)
    setRendererMode('loading')
    setActiveIndex(current)
    root.dataset.liquidSwapReady = 'false'
    root.dataset.liquidSwapTransitioning = 'false'
    root.dataset.liquidSwapReducedMotion = reducedMotion ? 'true' : 'false'
    root.dataset.liquidSwapIndex = String(current)

    const setIndex = index => {
      current = mod(index, count)
      pending = current
      root.dataset.liquidSwapIndex = String(current)
      setActiveIndex(current)
      onIndexChangeRef.current?.(current)
    }

    const setTransitionState = value => {
      root.dataset.liquidSwapTransitioning = value ? 'true' : 'false'
      setTransitioning(value)
      onTransitionChangeRef.current?.(value)
    }

    const fallback = () => {
      if (disposed) return
      root.dataset.liquidSwapRenderer = 'fallback'
      setRendererMode('fallback')
      setReady(count > 0)
      root.dataset.liquidSwapReady = count > 0 ? 'true' : 'false'
    }

    if (count < 2) {
      fallback()
      transitionRef.current = () => {}
      return () => { transitionRef.current = () => {} }
    }

    const loadImage = source => {
      if (loadedImages.has(source)) return Promise.resolve(loadedImages.get(source))
      return new Promise(resolve => {
        const image = new Image()
        image.decoding = 'async'
        if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous'
        image.onload = () => {
          loadedImages.set(source, image)
          resolve(image)
        }
        image.onerror = () => resolve(null)
        image.src = source
        if (image.complete) window.queueMicrotask(() => resolve(image.naturalWidth ? image : null))
      })
    }

    const getOrigin = event => {
      if (!configRef.current.startAtCursor || !event || typeof event.clientX !== 'number') return [0.5, 0.5]
      const rect = root.getBoundingClientRect()
      return [
        clamp((event.clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
        clamp((event.clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
      ]
    }

    const finishTransition = () => {
      if (!transition || !currentTexture || !nextTexture || !program) return
      currentTexture.image = nextTexture.image
      program.uniforms.uFromSize.value = [...program.uniforms.uToSize.value]
      transition = null
      setIndex(pending)
      setTransitionState(false)
    }

    const beginSwap = async event => {
      if (disposed || transition || !program || !nextTexture) return
      const nextIndex = mod(current + 1, count)
      const nextImage = await loadImage(sources[nextIndex])
      if (disposed || transition || !nextImage) return
      pending = nextIndex
      nextTexture.image = nextImage
      program.uniforms.uToSize.value = [nextImage.naturalWidth || 1, nextImage.naturalHeight || 1]
      program.uniforms.uOrigin.value = getOrigin(event)
      if (reducedMotion || configRef.current.transitionDuration === 0) {
        transition = { start: 0, duration: 0 }
        program.uniforms.uProgress.value = 1
        finishTransition()
        return
      }
      transition = {
        start: performance.now(),
        duration: configRef.current.transitionDuration * 1000,
      }
      program.uniforms.uProgress.value = 0
      setTransitionState(true)
    }

    transitionRef.current = beginSwap

    const start = async () => {
      const decoded = await Promise.all(sources.map(loadImage))
      if (disposed) return
      const starting = decoded[current]
      const following = decoded[mod(current + 1, count)]
      if (!starting || !following) {
        fallback()
        return
      }
      try {
        renderer = new Renderer({ alpha: false, antialias: true, dpr: Math.min(window.devicePixelRatio || 1, 2) })
        const gl = renderer.gl
        gl.clearColor(0.03, 0.03, 0.04, 1)
        canvas = gl.canvas
        canvas.className = 'liquid-swap__canvas'
        canvas.setAttribute('aria-hidden', 'true')
        root.appendChild(canvas)

        currentTexture = new Texture(gl, { generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR, flipY: true })
        nextTexture = new Texture(gl, { generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR, flipY: true })
        currentTexture.image = starting
        nextTexture.image = following

        program = new Program(gl, {
          vertex,
          fragment,
          uniforms: {
            uFrom: { value: currentTexture },
            uTo: { value: nextTexture },
            uResolution: { value: [1, 1] },
            uFromSize: { value: [starting.naturalWidth || 1, starting.naturalHeight || 1] },
            uToSize: { value: [following.naturalWidth || 1, following.naturalHeight || 1] },
            uOrigin: { value: [0.5, 0.5] },
            uProgress: { value: 0 },
            uTime: { value: 0 },
            uRefraction: { value: configRef.current.refraction },
            uChromatic: { value: configRef.current.chromatic },
            uClarity: { value: configRef.current.clarity },
            uEdgeGlow: { value: configRef.current.edgeGlow },
            uFlow: { value: configRef.current.flow },
            uInvertTopHalf: { value: invertTopHalf ? 1 : 0 },
          },
        })
        const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

        const resize = () => {
          if (!renderer || !program) return
          const rect = root.getBoundingClientRect()
          const width = Math.max(1, Math.round(rect.width))
          const height = Math.max(1, Math.round(rect.height))
          renderer.setSize(width, height)
          program.uniforms.uResolution.value = [width, height]
        }
        resize()
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(root)

        const draw = now => {
          if (disposed || !renderer || !program) return
          const config = configRef.current
          program.uniforms.uTime.value = now
          program.uniforms.uRefraction.value = config.refraction
          program.uniforms.uChromatic.value = config.chromatic
          program.uniforms.uClarity.value = config.clarity
          program.uniforms.uEdgeGlow.value = config.edgeGlow
          program.uniforms.uFlow.value = config.flow
          if (transition) {
            const elapsed = Math.max(0, now - transition.start)
            program.uniforms.uProgress.value = clamp(elapsed / Math.max(transition.duration, 1), 0, 1)
            if (program.uniforms.uProgress.value >= 1) finishTransition()
          } else {
            program.uniforms.uProgress.value = 0
          }
          renderer.render({ scene: mesh })
          raf = window.requestAnimationFrame(draw)
        }
        raf = window.requestAnimationFrame(draw)

        root.dataset.liquidSwapRenderer = 'webgl'
        root.dataset.liquidSwapReady = 'true'
        setRendererMode('webgl')
        setReady(true)
        onIndexChangeRef.current?.(current)

        if (configRef.current.autoCycle) {
          autoTimer = window.setInterval(() => { beginSwap() }, configRef.current.autoCycleDelay)
        }
      } catch {
        fallback()
      }
    }

    start()

    return () => {
      disposed = true
      transitionRef.current = () => {}
      if (raf) window.cancelAnimationFrame(raf)
      if (autoTimer) window.clearInterval(autoTimer)
      resizeObserver?.disconnect()
      if (canvas?.parentNode === root) root.removeChild(canvas)
      loadedImages = new Map()
    }
  }, [imageSignature, initialIndex, invertTopHalf])

  const handleKeyDown = event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    triggerSwap(event)
  }

  return <div
    ref={rootRef}
    className={['liquid-swap', className].filter(Boolean).join(' ')}
    role="button"
    tabIndex={0}
    aria-label="点击切换下一张液态影像"
    aria-busy={!ready}
    data-liquid-swap-ready={ready}
    data-liquid-swap-transitioning={transitioning}
    data-liquid-swap-index={activeIndex}
    data-liquid-swap-renderer={rendererMode}
    data-liquid-swap-invert-top={invertTopHalf}
    style={style}
    onPointerUp={triggerSwap}
    onKeyDown={handleKeyDown}
  >
    <img className="liquid-swap__fallback-image" src={imageSources[activeIndex] || ''} alt="" aria-hidden="true" draggable="false" loading="lazy" decoding="async" onLoad={event => setFallbackSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} />
    {invertTopHalf && <>
      <svg className="liquid-swap__fallback-panel liquid-swap__fallback-panel--top" viewBox={`0 0 ${fallbackSize[0]} ${fallbackSize[1] / 2}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <g transform={`rotate(180 ${fallbackSize[0] / 2} ${fallbackSize[1] / 4})`}>
          <image href={imageSources[activeIndex] || ''} width={fallbackSize[0]} height={fallbackSize[1]} />
        </g>
      </svg>
      <svg className="liquid-swap__fallback-panel liquid-swap__fallback-panel--bottom" viewBox={`0 ${fallbackSize[1] / 2} ${fallbackSize[0]} ${fallbackSize[1] / 2}`} preserveAspectRatio="xMidYMin meet" aria-hidden="true">
        <image href={imageSources[activeIndex] || ''} width={fallbackSize[0]} height={fallbackSize[1]} />
      </svg>
    </>}
    {!ready && <span className="liquid-swap__loading" aria-live="polite">加载液态影像…</span>}
    <span className="liquid-swap__glass-mark" aria-hidden="true" />
  </div>
})

export default LiquidSwap
