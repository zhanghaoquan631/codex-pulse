import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import './ShaderCard.css'

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

const normalizeHex = value => {
  if (typeof value !== 'string') return null
  const raw = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return raw.split('').map(part => `${part}${part}`).join('')
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase()
  return null
}

const parseColor = value => {
  const hex = normalizeHex(value)
  if (hex) return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ]

  if (typeof value === 'string') {
    const rgb = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
    if (rgb) return [
      clamp(Number(rgb[1]) / 255, 0, 1),
      clamp(Number(rgb[2]) / 255, 0, 1),
      clamp(Number(rgb[3]) / 255, 0, 1),
    ]
  }

  if (Array.isArray(value) && value.length >= 3) {
    const values = value.slice(0, 3).map(Number)
    if (values.every(Number.isFinite)) {
      const scale = values.some(part => Math.abs(part) > 1) ? 255 : 1
      return values.map(part => clamp(part / scale, 0, 1))
    }
  }

  return [0.98, 0.33, 0.16]
}

const colorToHex = color => color.map(channel => Math.round(clamp(channel, 0, 1) * 255).toString(16).padStart(2, '0')).join('')

const mixColor = (color, target, amount) => color.map((channel, index) => channel + (target[index] - channel) * amount)

const resolvePalette = value => {
  const values = Array.isArray(value) ? value : [value]
  const base = parseColor(values[0])
  const second = values.length > 1 ? parseColor(values[1]) : mixColor(base, [1, 1, 1], 0.28)
  const third = values.length > 2 ? parseColor(values[2]) : mixColor(base, [1, 0.66, 0.2], 0.42)
  return [base, second, third]
}

const paletteLabel = palette => `#${colorToHex(palette[0])},#${colorToHex(palette[1])},#${colorToHex(palette[2])}`

const vertexShaderSource = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// This small procedural field is authored locally. It intentionally uses only
// WebGL 1 features so the card can run without external shader/runtime assets.
const fragmentShaderSource = `
precision mediump float;

varying vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;
uniform float u_positionY;
uniform float u_scale;
uniform float u_effectRadius;
uniform float u_effectBoost;
uniform float u_edgeMin;
uniform float u_edgeMax;
uniform float u_falloffPower;
uniform float u_noiseScale;
uniform float u_widthFactor;
uniform float u_waveAmount;
uniform float u_branchIntensity;
uniform float u_verticalExtent;
uniform float u_horizontalExtent;
uniform float u_blur;
uniform float u_opacity;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i += 1) {
    value += amplitude * noise2(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = v_uv;
  float aspect = max(u_resolution.x / max(u_resolution.y, 1.0), 0.35);
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  float time = u_time * max(u_speed, 0.0);
  float scale = max(u_scale, 0.1);
  // The public positionY contract is top-to-bottom (0 = top, 1 = bottom),
  // while this full-screen triangle's UV origin is at the bottom.
  float base = clamp(1.0 - u_positionY, 0.05, 0.95);
  float rise = (uv.y - base) / max(u_verticalExtent, 0.12);
  float noiseValue = fbm(vec2(p.x * max(u_noiseScale, 0.1) * scale + time * 0.18, rise * max(u_noiseScale, 0.1) - time * 0.1));
  float riseForMask = max(rise, 0.0);
  // A soft base plus a long upward falloff keeps the flame attached to the
  // lower edge without introducing a visible horizontal cutoff.
  float baseFade = smoothstep(-0.12, 0.04, rise);
  float envelope = baseFade * (1.0 - smoothstep(0.0, 1.14, riseForMask));
  float flame = 0.0;

  for (int i = 0; i < 4; i += 1) {
    float index = float(i);
    float wave = sin(time * (0.75 + index * 0.17) + rise * (3.0 + index * 1.35) + noiseValue * 3.2 + index * 1.9);
    float center = wave * (0.06 + u_waveAmount * 0.24) * (0.65 + rise * 0.3) * max(u_horizontalExtent, 0.12);
    center += sin(time * 0.37 + index * 2.7) * u_branchIntensity * 0.035 * (1.0 - rise);
    center += (index - 1.5) * 0.13 * u_branchIntensity;
    float width = (0.12 - rise * 0.06) * max(u_widthFactor, 0.15) * (1.0 + 0.12 * sin(time + index));
    float tongue = 1.0 - smoothstep(width, width + 0.11 + u_blur * 0.08, abs(p.x - center));
    float wisps = 0.55 + 0.45 * sin(time * 1.2 + rise * 8.0 + index * 1.6 + p.x * 4.0);
    flame += tongue * envelope * wisps * (0.72 - index * 0.09);
  }

  float branch = sin((p.x + noiseValue * 0.16) * (8.0 + u_branchIntensity * 8.0) + time * 1.7) * 0.5 + 0.5;
  flame += branch * envelope * u_branchIntensity * 0.16;
  flame = clamp(flame * max(u_effectBoost, 0.0), 0.0, 1.0);

  float radius = max(u_effectRadius, 0.12);
  float radial = length(vec2(p.x / (radius * 0.85), (uv.y - base) / radius));
  float aura = pow(clamp(1.0 - radial, 0.0, 1.0), max(u_falloffPower, 0.2)) * 0.36;
  float edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float edge = 1.0 - smoothstep(max(u_edgeMin, 0.0), max(u_edgeMax, u_edgeMin + 0.001), edgeDistance);
  edge *= 0.22 + u_effectBoost * 0.12;

  float colorMix = clamp(rise * 0.9 + noiseValue * 0.28, 0.0, 1.0);
  vec3 flameColor = mix(u_colorA, u_colorB, colorMix);
  flameColor = mix(flameColor, u_colorC, clamp(rise * 0.55 + branch * 0.24, 0.0, 1.0));
  vec3 baseColor = mix(vec3(0.012, 0.016, 0.028), u_colorA * 0.14, 0.25 + aura * 0.4);
  vec3 color = baseColor + flameColor * (flame * 0.92 + aura * 0.65 + edge * 0.25);
  float alpha = clamp((0.06 + flame * 0.84 + aura * 0.34 + edge * 0.2) * max(u_opacity, 0.0), 0.0, 0.94);
  gl_FragColor = vec4(color, alpha);
}
`

const createShader = (gl, type, source) => {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

const createProgram = (gl, customFragmentShader) => {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const source = typeof customFragmentShader === 'string' && customFragmentShader.trim()
    ? customFragmentShader
    : fragmentShaderSource
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, source)
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    return null
  }
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    return null
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

const drawFallback = (context, width, height, time, config) => {
  const { palette } = config
  const baseY = clamp(config.positionY, 0.05, 1) * height
  context.clearRect(0, 0, width, height)
  const background = context.createLinearGradient(0, 0, 0, height)
  background.addColorStop(0, 'rgba(5, 8, 18, .12)')
  background.addColorStop(1, `rgba(${Math.round(palette[0][0] * 28)}, ${Math.round(palette[0][1] * 28)}, ${Math.round(palette[0][2] * 28)}, .34)`)
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  const aura = context.createRadialGradient(width * 0.5, baseY, 0, width * 0.5, baseY, width * config.effectRadius)
  aura.addColorStop(0, `rgba(${Math.round(palette[1][0] * 255)}, ${Math.round(palette[1][1] * 255)}, ${Math.round(palette[1][2] * 255)}, .22)`)
  aura.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = aura
  context.fillRect(0, 0, width, height)

  const tongues = 4
  for (let index = 0; index < tongues; index += 1) {
    const phase = time * config.speed * (0.72 + index * 0.16) + index * 1.8
    const center = width * (0.5 + Math.sin(phase) * (0.08 + config.waveAmount * 0.1) + (index - 1.5) * 0.08 * config.branchIntensity)
    const tongueWidth = width * (0.16 + config.widthFactor * 0.04) * (1 - index * 0.08)
    const top = Math.max(0, baseY - height * config.verticalExtent * (0.32 + index * 0.1))
    const gradient = context.createLinearGradient(center, top, center, baseY)
    const c1 = palette[index % palette.length].map(channel => Math.round(channel * 255)).join(', ')
    const c2 = palette[(index + 1) % palette.length].map(channel => Math.round(channel * 255)).join(', ')
    gradient.addColorStop(0, `rgba(${c1}, 0)`)
    gradient.addColorStop(0.35, `rgba(${c2}, .48)`)
    gradient.addColorStop(1, `rgba(${c1}, .72)`)
    context.fillStyle = gradient
    context.beginPath()
    context.moveTo(center - tongueWidth, baseY + 2)
    for (let step = 0; step <= 12; step += 1) {
      const progress = step / 12
      const y = baseY - (baseY - top) * progress
      const wobble = Math.sin(progress * 8 + phase) * width * config.waveAmount * 0.035
      const edge = tongueWidth * (1 - progress * 0.75) + Math.sin(progress * 5 + phase) * width * 0.015
      context.lineTo(center - edge + wobble, y)
    }
    for (let step = 12; step >= 0; step -= 1) {
      const progress = step / 12
      const y = baseY - (baseY - top) * progress
      const wobble = Math.sin(progress * 8 + phase + 0.8) * width * config.waveAmount * 0.035
      const edge = tongueWidth * (1 - progress * 0.75) + Math.sin(progress * 5 + phase + 0.7) * width * 0.015
      context.lineTo(center + edge + wobble, y)
    }
    context.closePath()
    context.fill()
  }

  const edge = Math.max(0, Math.min(width, Math.min(width, height) * config.edgeMax))
  if (edge > 0) {
    context.strokeStyle = `rgba(${Math.round(palette[1][0] * 255)}, ${Math.round(palette[1][1] * 255)}, ${Math.round(palette[1][2] * 255)}, .25)`
    context.lineWidth = Math.max(1, edge * 0.18)
    context.strokeRect(context.lineWidth, context.lineWidth, width - context.lineWidth * 2, height - context.lineWidth * 2)
  }
}

const ShaderCard = forwardRef(function ShaderCard({
  width = 400,
  height = 500,
  borderRadius = '12px',
  speed = 1.0,
  color = '#FF9FFC',
  positionY = 0.1,
  scale = 3,
  effectRadius = 0.9,
  effectBoost = 0.5,
  edgeMin = 0.0,
  edgeMax = 0.5,
  falloffPower = 2.0,
  noiseScale = 1.5,
  widthFactor = 0.5,
  waveAmount = 0.5,
  branchIntensity = 0.5,
  verticalExtent = 1.5,
  horizontalExtent = 1.5,
  blur = 0,
  opacity = 1,
  autoPlay = true,
  fragmentShader,
  className = '',
  style,
  as = 'div',
  children,
  ...rest
}, forwardedRef) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const controlsRef = useRef({ play: () => {}, pause: () => {}, toggle: () => {} })
  const configRef = useRef(null)
  const palette = resolvePalette(color)
  const config = {
    speed: Math.max(0, finite(speed, 1.0)),
    positionY: finite(positionY, 0.1),
    scale: Math.max(0.1, finite(scale, 3)),
    effectRadius: Math.max(0.05, finite(effectRadius, 0.9)),
    effectBoost: Math.max(0, finite(effectBoost, 0.5)),
    edgeMin: Math.max(0, finite(edgeMin, 0.0)),
    edgeMax: Math.max(0.001, finite(edgeMax, 0.5)),
    falloffPower: Math.max(0.1, finite(falloffPower, 2.0)),
    noiseScale: Math.max(0.1, finite(noiseScale, 1.5)),
    widthFactor: Math.max(0.1, finite(widthFactor, 0.5)),
    waveAmount: Math.max(0, finite(waveAmount, 0.5)),
    branchIntensity: Math.max(0, finite(branchIntensity, 0.5)),
    verticalExtent: Math.max(0.12, finite(verticalExtent, 1.5)),
    horizontalExtent: Math.max(0.12, finite(horizontalExtent, 1.5)),
    blur: Math.max(0, finite(blur, 0)),
    opacity: clamp(finite(opacity, 1), 0, 1),
    autoPlay: Boolean(autoPlay),
    palette,
  }
  configRef.current = config

  useImperativeHandle(forwardedRef, () => ({
    play: () => controlsRef.current.play(),
    pause: () => controlsRef.current.pause(),
    toggle: () => controlsRef.current.toggle(),
  }), [])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return undefined

    const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
    root.dataset.shaderReducedMotion = reducedMotion ? 'true' : 'false'
    let disposed = false
    let raf = 0
    let frame = 0
    let playing = configRef.current.autoPlay && !reducedMotion
    let startedAt = performance.now()
    let widthPx = 1
    let heightPx = 1
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Ask for WebGL first. A canvas cannot switch context types after the
    // first successful getContext call, so the 2D fallback is acquired only
    // when WebGL is unavailable.
    let context2d = null
    let gl = null
    let program = null
    let positionBuffer = null
    let uniforms = null
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false })
      if (gl) {
        program = createProgram(gl, fragmentShader)
        if (program) {
          positionBuffer = gl.createBuffer()
          gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
          uniforms = {
            position: gl.getAttribLocation(program, 'a_position'),
            resolution: gl.getUniformLocation(program, 'u_resolution'),
            time: gl.getUniformLocation(program, 'u_time'),
            speed: gl.getUniformLocation(program, 'u_speed'),
            positionY: gl.getUniformLocation(program, 'u_positionY'),
            scale: gl.getUniformLocation(program, 'u_scale'),
            effectRadius: gl.getUniformLocation(program, 'u_effectRadius'),
            effectBoost: gl.getUniformLocation(program, 'u_effectBoost'),
            edgeMin: gl.getUniformLocation(program, 'u_edgeMin'),
            edgeMax: gl.getUniformLocation(program, 'u_edgeMax'),
            falloffPower: gl.getUniformLocation(program, 'u_falloffPower'),
            noiseScale: gl.getUniformLocation(program, 'u_noiseScale'),
            widthFactor: gl.getUniformLocation(program, 'u_widthFactor'),
            waveAmount: gl.getUniformLocation(program, 'u_waveAmount'),
            branchIntensity: gl.getUniformLocation(program, 'u_branchIntensity'),
            verticalExtent: gl.getUniformLocation(program, 'u_verticalExtent'),
            horizontalExtent: gl.getUniformLocation(program, 'u_horizontalExtent'),
            blur: gl.getUniformLocation(program, 'u_blur'),
            opacity: gl.getUniformLocation(program, 'u_opacity'),
            colorA: gl.getUniformLocation(program, 'u_colorA'),
            colorB: gl.getUniformLocation(program, 'u_colorB'),
            colorC: gl.getUniformLocation(program, 'u_colorC'),
          }
          root.dataset.shaderMode = 'webgl'
        }
      }
    } catch {
      gl = null
      program = null
    }

    if (!gl) {
      try {
        context2d = canvas.getContext('2d')
      } catch {
        context2d = null
      }
    }

    if (!program) {
      root.dataset.shaderMode = context2d ? 'canvas-2d' : 'css'
      root.dataset.shaderFallback = 'true'
      if (gl) {
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
      }
    } else {
      root.dataset.shaderFallback = 'false'
    }
    if (context2d) context2d.imageSmoothingEnabled = true

    const setSize = () => {
      const rect = root.getBoundingClientRect()
      widthPx = Math.max(1, Math.round(rect.width || 1))
      heightPx = Math.max(1, Math.round(rect.height || 1))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(widthPx * dpr))
      canvas.height = Math.max(1, Math.round(heightPx * dpr))
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      if (gl) gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const setUniform = (location, value) => {
      if (!gl || location === null || location === undefined) return
      if (Array.isArray(value)) {
        if (value.length === 2) gl.uniform2fv(location, value)
        else if (value.length === 3) gl.uniform3fv(location, value)
        else if (value.length === 4) gl.uniform4fv(location, value)
      } else gl.uniform1f(location, value)
    }

    const render = now => {
      if (disposed) return
      const current = configRef.current
      const elapsed = Math.max(0, (now - startedAt) / 1000)
      if (gl && program && uniforms) {
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(program)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        gl.enableVertexAttribArray(uniforms.position)
        gl.vertexAttribPointer(uniforms.position, 2, gl.FLOAT, false, 0, 0)
        setUniform(uniforms.resolution, [canvas.width, canvas.height])
        setUniform(uniforms.time, elapsed)
        setUniform(uniforms.speed, current.speed)
        setUniform(uniforms.positionY, current.positionY)
        setUniform(uniforms.scale, current.scale)
        setUniform(uniforms.effectRadius, current.effectRadius)
        setUniform(uniforms.effectBoost, current.effectBoost)
        setUniform(uniforms.edgeMin, current.edgeMin)
        setUniform(uniforms.edgeMax, current.edgeMax)
        setUniform(uniforms.falloffPower, current.falloffPower)
        setUniform(uniforms.noiseScale, current.noiseScale)
        setUniform(uniforms.widthFactor, current.widthFactor)
        setUniform(uniforms.waveAmount, current.waveAmount)
        setUniform(uniforms.branchIntensity, current.branchIntensity)
        setUniform(uniforms.verticalExtent, current.verticalExtent)
        setUniform(uniforms.horizontalExtent, current.horizontalExtent)
        setUniform(uniforms.blur, current.blur)
        setUniform(uniforms.opacity, current.opacity)
        setUniform(uniforms.colorA, current.palette[0])
        setUniform(uniforms.colorB, current.palette[1])
        setUniform(uniforms.colorC, current.palette[2])
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      } else if (context2d) {
        context2d.save()
        context2d.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawFallback(context2d, widthPx, heightPx, elapsed, current)
        context2d.restore()
      }
      frame += 1
      if (frame % 8 === 0) root.dataset.shaderFrame = String(frame)
      root.dataset.shaderElapsed = elapsed.toFixed(3)
      root.dataset.shaderPlaying = playing ? 'true' : 'false'
      if (playing) raf = window.requestAnimationFrame(render)
    }

    const play = () => {
      if (reducedMotion) return
      playing = true
      startedAt = performance.now() - Number(root.dataset.shaderElapsed || 0) * 1000
      root.dataset.shaderPlaying = 'true'
      if (!raf) raf = window.requestAnimationFrame(render)
    }
    const pause = () => {
      playing = false
      root.dataset.shaderPlaying = 'false'
      if (raf) {
        window.cancelAnimationFrame(raf)
        raf = 0
      }
    }
    const toggle = () => (playing ? pause() : play())
    controlsRef.current = { play, pause, toggle }

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(setSize) : null
    resizeObserver?.observe(root)
    const onResize = () => setSize()
    window.addEventListener('resize', onResize)
    setSize()
    root.dataset.shaderPlaying = playing ? 'true' : 'false'
    root.dataset.shaderFrame = '0'
    root.dataset.shaderReady = 'false'
    render(performance.now())
    root.dataset.shaderReady = 'true'

    return () => {
      disposed = true
      if (raf) window.cancelAnimationFrame(raf)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', onResize)
      controlsRef.current = { play: () => {}, pause: () => {}, toggle: () => {} }
      if (gl && positionBuffer) gl.deleteBuffer(positionBuffer)
      if (gl && program) gl.deleteProgram(program)
      // Keep the canvas' context alive across React StrictMode's development
      // mount/unmount probe. The DOM node owns the context and is discarded
      // naturally when the card unmounts.
    }
  }, [])

  const rootStyle = {
    width: cssSize(width, '400px'),
    height: cssSize(height, '500px'),
    borderRadius: cssSize(borderRadius, '12px'),
    '--shader-card-radius': cssSize(borderRadius, '12px'),
    '--shader-card-color': `#${colorToHex(palette[0])}`,
    '--shader-card-blur': `${Math.max(0, finite(blur, 0))}px`,
    ...style,
  }
  const rootProps = {
    ...rest,
    ref: rootRef,
    className: `shader-card${className ? ` ${className}` : ''}`.trim(),
    style: rootStyle,
    'data-shader-card': 'true',
    'data-shader-base-color': `#${colorToHex(palette[0])}`,
    'data-shader-color': paletteLabel(palette),
    'data-shader-autoplay': autoPlay ? 'true' : 'false',
  }

  return createElement(
    as || 'div',
    rootProps,
    <canvas ref={canvasRef} className="shader-card__canvas" aria-hidden="true" />,
    children,
  )
})

export default ShaderCard
