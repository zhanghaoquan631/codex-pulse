import { useEffect, useRef } from 'react'

import './WarpedCard.css'

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

const toCssSize = (value, fallback) => {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

const toNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec2 uTextureSize;
uniform vec2 uPointer;
uniform float uRadius;
uniform float uStrength;
uniform float uHover;
uniform float uTime;

varying vec2 vUv;

const float PI = 3.14159265359;

vec2 coverUv(vec2 uv) {
  vec2 safeTextureSize = max(uTextureSize, vec2(1.0));
  vec2 scale = uResolution / safeTextureSize;
  vec2 scaledSize = safeTextureSize * max(scale.x, scale.y);
  vec2 offset = (uResolution - scaledSize) * 0.5;
  return (uv * uResolution - offset) / scaledSize;
}

void main() {
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 delta = (vUv - uPointer) * aspect;
  float distanceToPointer = length(delta);
  float radius = max(uRadius, 0.035);
  float falloff = 1.0 - smoothstep(0.0, radius, distanceToPointer);
  float bulge = pow(falloff, 1.75) * uStrength * uHover;

  // Compress samples toward the pointer to create the rounded, lens-like
  // bulge. A small travelling offset gives the edge a soft liquid shoulder.
  vec2 warpedUv = uPointer + (vUv - uPointer) * (1.0 - bulge * 0.42);
  vec2 direction = distanceToPointer > 0.0001 ? normalize(delta) / aspect : vec2(0.0);
  warpedUv += direction * sin(falloff * PI) * 0.024 * uStrength * uHover;

  vec3 color = texture2D(uTexture, coverUv(warpedUv)).rgb;
  float edge = smoothstep(0.02, 0.58, falloff) * uHover;
  float shimmer = sin((vUv.x + vUv.y) * 8.0 + uTime * 0.7) * 0.018 * edge;
  vec3 lightDirection = normalize(vec3(-0.38, 0.54, 0.76));
  vec3 pseudoNormal = normalize(vec3(delta * falloff * 1.8, 1.0));
  float specular = pow(max(dot(pseudoNormal, lightDirection), 0.0), 18.0) * edge;

  color += color * shimmer;
  color += vec3(1.0, 0.98, 0.94) * specular * 0.12;
  gl_FragColor = vec4(color, 1.0);
}
`

function compileShader(gl, type, source) {
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

function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    return null
  }
  const program = gl.createProgram()
  if (!program) return null
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

/**
 * Local clean-room implementation of the public Warped Card contract.
 * A small WebGL fragment shader bends the active image around a damped
 * pointer position; the DOM fallback keeps the card useful without WebGL.
 */
export default function WarpedCard({
  width = '100%',
  height = '100%',
  cardWidth = 360,
  aspectRatio = 1.3,
  imageSrc = '',
  radius = 0.95,
  strength = 1.1,
  dampening = 0.07,
  transitionDuration = 0.8,
  borderRadius = '16px',
  className = '',
  children,
  alt = '',
  style,
  ...rest
}) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const configRef = useRef({})
  configRef.current = {
    radius: clamp(toNumber(radius, 0.95), 0.05, 1.6),
    strength: clamp(toNumber(strength, 1.1), 0, 3),
    dampening: clamp(toNumber(dampening, 0.07), 0.01, 1),
    transitionDuration: Math.max(0.05, toNumber(transitionDuration, 0.8)),
  }

  const safeAspectRatio = Math.max(0.35, toNumber(aspectRatio, 1.3))
  const safeCardWidth = Math.max(120, toNumber(cardWidth, 360))
  const rootStyle = {
    width: toCssSize(width, '100%'),
    height: toCssSize(height, '100%'),
    '--warped-card-width': `${safeCardWidth}px`,
    '--warped-card-aspect': String(safeAspectRatio),
    '--warped-card-radius': toCssSize(borderRadius, '16px'),
    '--warped-transition': `${configRef.current.transitionDuration}s`,
    ...style,
  }

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return undefined

    const imageSource = imageSrc || ''
    const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const reducedMotion = Boolean(reducedMotionQuery?.matches)
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false })
    const fallbackImage = imageRef.current

    root.dataset.warpedReady = 'false'
    root.dataset.warpedHover = 'false'
    if (!gl || !imageSource) {
      root.dataset.warpedFallback = 'true'
      if (fallbackImage) fallbackImage.style.opacity = '1'
      return undefined
    }
    root.dataset.warpedFallback = 'false'

    const program = createProgram(gl)
    if (!program) {
      root.dataset.warpedFallback = 'true'
      if (fallbackImage) fallbackImage.style.opacity = '1'
      return undefined
    }

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)

    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([34, 34, 34, 255]))

    const positionLocation = gl.getAttribLocation(program, 'aPosition')
    const uniforms = {
      texture: gl.getUniformLocation(program, 'uTexture'),
      resolution: gl.getUniformLocation(program, 'uResolution'),
      textureSize: gl.getUniformLocation(program, 'uTextureSize'),
      pointer: gl.getUniformLocation(program, 'uPointer'),
      radius: gl.getUniformLocation(program, 'uRadius'),
      strength: gl.getUniformLocation(program, 'uStrength'),
      hover: gl.getUniformLocation(program, 'uHover'),
      time: gl.getUniformLocation(program, 'uTime'),
    }

    const state = {
      width: 1,
      height: 1,
      textureWidth: 1,
      textureHeight: 1,
      pointerX: 0.5,
      pointerY: 0.5,
      targetX: 0.5,
      targetY: 0.5,
      hover: 0,
      hoverTarget: 0,
      startedAt: performance.now(),
      imageReady: false,
    }
    let disposed = false
    let frameId = 0

    const resize = () => {
      const rect = root.getBoundingClientRect()
      state.width = Math.max(1, Math.round(rect.width))
      state.height = Math.max(1, Math.round(rect.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const pixelWidth = Math.max(1, Math.round(state.width * dpr))
      const pixelHeight = Math.max(1, Math.round(state.height * dpr))
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      canvas.style.width = `${state.width}px`
      canvas.style.height = `${state.height}px`
      gl.viewport(0, 0, pixelWidth, pixelHeight)
    }

    const draw = timestamp => {
      if (disposed) return
      const cfg = configRef.current
      const follow = reducedMotion ? 1 : cfg.dampening
      state.pointerX += (state.targetX - state.pointerX) * follow
      state.pointerY += (state.targetY - state.pointerY) * follow
      const hoverFollow = reducedMotion ? 1 : clamp(1 - Math.exp(-16 / (cfg.transitionDuration * 1000)), 0.02, 1)
      state.hover += (state.hoverTarget - state.hover) * hoverFollow

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (state.imageReady) {
        gl.useProgram(program)
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        gl.enableVertexAttribArray(positionLocation)
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.uniform1i(uniforms.texture, 0)
        gl.uniform2f(uniforms.resolution, state.width, state.height)
        gl.uniform2f(uniforms.textureSize, state.textureWidth, state.textureHeight)
        gl.uniform2f(uniforms.pointer, state.pointerX, 1 - state.pointerY)
        gl.uniform1f(uniforms.radius, cfg.radius)
        gl.uniform1f(uniforms.strength, cfg.strength)
        gl.uniform1f(uniforms.hover, state.hover)
        gl.uniform1f(uniforms.time, (timestamp - state.startedAt) / 1000)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
      frameId = window.requestAnimationFrame(draw)
    }

    const pointerMove = event => {
      const rect = root.getBoundingClientRect()
      state.targetX = clamp((event.clientX - rect.left) / Math.max(rect.width, 1))
      state.targetY = clamp((event.clientY - rect.top) / Math.max(rect.height, 1))
      state.hoverTarget = 1
      root.dataset.warpedHover = 'true'
    }
    const pointerEnter = event => {
      state.hoverTarget = 1
      root.dataset.warpedHover = 'true'
      pointerMove(event)
    }
    const pointerLeave = () => {
      state.hoverTarget = 0
      state.targetX = 0.5
      state.targetY = 0.5
      root.dataset.warpedHover = 'false'
    }
    const onImageLoad = () => {
      if (disposed) return
      state.imageReady = true
      state.textureWidth = image.naturalWidth || image.width || 1
      state.textureHeight = image.naturalHeight || image.height || 1
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      root.dataset.warpedReady = 'true'
      if (fallbackImage) fallbackImage.style.opacity = '0'
    }
    const onImageError = () => {
      root.dataset.warpedFallback = 'true'
      if (fallbackImage) fallbackImage.style.opacity = '1'
    }

    const image = new Image()
    image.decoding = 'async'
    image.crossOrigin = 'anonymous'
    image.onload = onImageLoad
    image.onerror = onImageError
    image.src = imageSource
    resize()
    root.addEventListener('pointerenter', pointerEnter)
    root.addEventListener('pointermove', pointerMove)
    root.addEventListener('pointerleave', pointerLeave)
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    resizeObserver?.observe(root)
    window.addEventListener('resize', resize)
    frameId = window.requestAnimationFrame(draw)

    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', resize)
      root.removeEventListener('pointerenter', pointerEnter)
      root.removeEventListener('pointermove', pointerMove)
      root.removeEventListener('pointerleave', pointerLeave)
      image.onload = null
      image.onerror = null
      gl.deleteTexture(texture)
      gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(program)
      // Release only after real unmount, not the Strict Mode effect probe.
      queueMicrotask(() => {
        if (!canvas.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext()
      })
    }
  }, [imageSrc])

  return <div
    {...rest}
    ref={rootRef}
    className={`warped-card ${className}`.trim()}
    style={rootStyle}
    role="img"
    aria-label={alt || undefined}
    data-warped-card
    data-warped-image={imageSrc || ''}
  >
    <div className="warped-card__surface">
      <img ref={imageRef} className="warped-card__fallback" src={imageSrc} alt={alt} draggable="false" loading="lazy" decoding="async" />
      <canvas ref={canvasRef} className="warped-card__canvas" aria-hidden="true" />
      <div className="warped-card__sheen" aria-hidden="true" />
      {children && <div className="warped-card__content">{children}</div>}
    </div>
  </div>
}
