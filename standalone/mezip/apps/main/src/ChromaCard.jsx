import { useEffect, useRef } from 'react'

import './ChromaCard.css'

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const cssSize = (value, fallback) => {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return fallback
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
uniform float uHover;
uniform float uTime;
uniform float uZoom;
uniform float uRgbShift;
uniform float uPixelDisplace;

varying vec2 vUv;

vec2 coverUv(vec2 uv) {
  vec2 textureSize = max(uTextureSize, vec2(1.0));
  vec2 scale = uResolution / textureSize;
  vec2 fitted = textureSize * max(scale.x, scale.y);
  vec2 offset = (uResolution - fitted) * 0.5;
  return (uv * uResolution - offset) / fitted;
}

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 345.45));
  point += dot(point, point + 34.345);
  return fract(point.x * point.y);
}

void main() {
  vec2 safeResolution = max(uResolution, vec2(1.0));
  vec2 aspect = vec2(safeResolution.x / safeResolution.y, 1.0);
  vec2 pointerDelta = (vUv - uPointer) * aspect;
  float pointerDistance = length(pointerDelta);
  float halo = 1.0 - smoothstep(0.0, 0.92, pointerDistance);
  float active = uHover * (0.35 + 0.65 * halo);

  // Zoom toward the pointer, then add a restrained block displacement. The
  // quantisation keeps the chroma motion graphic and readable at card scale.
  vec2 zoomedUv = uPointer + (vUv - uPointer) * (1.0 - uZoom * active);
  float cellSize = mix(170.0, 42.0, clamp(uPixelDisplace * 6.0, 0.0, 1.0));
  vec2 cell = floor(zoomedUv * cellSize);
  vec2 blockNoise = vec2(hash21(cell + floor(uTime * 1.4)), hash21(cell.yx + 17.0));
  vec2 displacement = (blockNoise - 0.5) * uPixelDisplace * active;
  displacement *= vec2(1.0 / max(aspect.x, 0.4), 1.0);
  zoomedUv += displacement;

  float shift = uRgbShift * (0.45 + 0.95 * halo) * active;
  vec2 redUv = zoomedUv + vec2(shift, 0.0);
  vec2 blueUv = zoomedUv - vec2(shift, 0.0);
  float red = texture2D(uTexture, coverUv(redUv)).r;
  float green = texture2D(uTexture, coverUv(zoomedUv)).g;
  float blue = texture2D(uTexture, coverUv(blueUv)).b;
  vec3 color = vec3(red, green, blue);

  float scan = sin((vUv.y + uTime * 0.035) * 140.0) * 0.008 * active;
  float sheen = pow(max(0.0, 1.0 - abs(dot(normalize(pointerDelta + vec2(0.001)), vec2(-0.76, 0.65)))), 7.0) * halo * active;
  color += color * scan;
  color += vec3(1.0, 0.95, 0.9) * sheen * 0.16;
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
 * Local clean-room implementation of the public Chroma Card contract.
 * The image is rendered through a small WebGL shader that separates RGB
 * channels and displaces image blocks around the pointer. A normal image is
 * kept underneath so the card remains useful when WebGL is unavailable.
 */
export default function ChromaCard({
  width = '100%',
  height = '100%',
  imageSrc = '',
  imageAspectRatio = 0.67,
  cardWidth = 5,
  cardHeight = 6,
  zoomLevel = 0.3,
  rgbShiftAmount = 0.02,
  pixelDisplaceAmount = 0.095,
  hoverDuration = 3,
  rotationIntensity = 0.2,
  scaleIntensity = 0.1,
  positionIntensity = 0.5,
  interactionDuration = 0.4,
  opacity = 1,
  cameraFov = 50,
  cameraZ = 7,
  borderRadius = 30,
  className = '',
  children,
  alt = '',
  style,
  ...rest
}) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const fallbackRef = useRef(null)
  const configRef = useRef({})

  configRef.current = {
    zoomLevel: clamp(finite(zoomLevel, 0.3), 0, 0.95),
    rgbShiftAmount: clamp(finite(rgbShiftAmount, 0.02), 0, 0.1),
    pixelDisplaceAmount: clamp(finite(pixelDisplaceAmount, 0.095), 0, 0.5),
    hoverDuration: Math.max(0.05, finite(hoverDuration, 3)),
    rotationIntensity: clamp(finite(rotationIntensity, 0.2), 0, 1),
    scaleIntensity: clamp(finite(scaleIntensity, 0.1), 0, 0.5),
    positionIntensity: clamp(finite(positionIntensity, 0.5), 0, 2),
    interactionDuration: Math.max(0.05, finite(interactionDuration, 0.4)),
  }

  const safeFov = clamp(finite(cameraFov, 50), 15, 120)
  const rootStyle = {
    width: cssSize(width, '100%'),
    height: cssSize(height, '100%'),
    '--chroma-card-width': `${Math.max(1, finite(cardWidth, 5))}`,
    '--chroma-card-height': `${Math.max(1, finite(cardHeight, 6))}`,
    '--chroma-aspect': String(Math.max(0.25, finite(imageAspectRatio, 0.67))),
    '--chroma-radius': cssSize(borderRadius, '30px'),
    '--chroma-opacity': String(clamp(finite(opacity, 1), 0, 1)),
    '--chroma-scale-intensity': String(configRef.current.scaleIntensity),
    '--chroma-perspective': `${Math.max(200, finite(cameraZ, 7) * 180 * (50 / safeFov))}px`,
    '--chroma-fov': `${safeFov}deg`,
    ...style,
  }

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const fallback = fallbackRef.current
    if (!root || !canvas) return undefined

    const source = typeof imageSrc === 'string' ? imageSrc : ''
    const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const reducedMotion = Boolean(reducedQuery?.matches)
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false })
    root.dataset.chromaReady = 'false'
    root.dataset.chromaHover = 'false'
    root.dataset.chromaFallback = 'false'

    if (!gl || !source) {
      root.dataset.chromaFallback = 'true'
      if (fallback) fallback.style.opacity = '1'
      return undefined
    }

    const program = createProgram(gl)
    if (!program) {
      root.dataset.chromaFallback = 'true'
      if (fallback) fallback.style.opacity = '1'
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([32, 32, 32, 255]))

    const positionLocation = gl.getAttribLocation(program, 'aPosition')
    const uniforms = {
      texture: gl.getUniformLocation(program, 'uTexture'),
      resolution: gl.getUniformLocation(program, 'uResolution'),
      textureSize: gl.getUniformLocation(program, 'uTextureSize'),
      pointer: gl.getUniformLocation(program, 'uPointer'),
      hover: gl.getUniformLocation(program, 'uHover'),
      time: gl.getUniformLocation(program, 'uTime'),
      zoom: gl.getUniformLocation(program, 'uZoom'),
      rgbShift: gl.getUniformLocation(program, 'uRgbShift'),
      pixelDisplace: gl.getUniformLocation(program, 'uPixelDisplace'),
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
      const follow = reducedMotion ? 1 : clamp(cfg.interactionDuration * 0.22, 0.035, 0.28)
      state.pointerX += (state.targetX - state.pointerX) * follow
      state.pointerY += (state.targetY - state.pointerY) * follow
      const hoverFollow = reducedMotion ? 1 : clamp(1 - Math.exp(-16 / (cfg.hoverDuration * 1000)), 0.015, 1)
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
        gl.uniform1f(uniforms.hover, state.hover)
        gl.uniform1f(uniforms.time, (timestamp - state.startedAt) / 1000)
        gl.uniform1f(uniforms.zoom, cfg.zoomLevel)
        gl.uniform1f(uniforms.rgbShift, cfg.rgbShiftAmount)
        gl.uniform1f(uniforms.pixelDisplace, cfg.pixelDisplaceAmount)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
      frameId = window.requestAnimationFrame(draw)
    }

    const updatePointer = event => {
      const rect = root.getBoundingClientRect()
      state.targetX = clamp((event.clientX - rect.left) / Math.max(rect.width, 1))
      state.targetY = clamp((event.clientY - rect.top) / Math.max(rect.height, 1))
      state.hoverTarget = 1
      root.dataset.chromaHover = 'true'
      root.style.setProperty('--chroma-pointer-x', `${(state.targetX * 100).toFixed(2)}%`)
      root.style.setProperty('--chroma-pointer-y', `${(state.targetY * 100).toFixed(2)}%`)
      root.style.setProperty('--chroma-rotate-x', `${((0.5 - state.targetY) * configRef.current.rotationIntensity * 14).toFixed(2)}deg`)
      root.style.setProperty('--chroma-rotate-y', `${((state.targetX - 0.5) * configRef.current.rotationIntensity * 16).toFixed(2)}deg`)
      root.style.setProperty('--chroma-shift-x', `${((state.targetX - 0.5) * configRef.current.positionIntensity * 8).toFixed(2)}px`)
      root.style.setProperty('--chroma-shift-y', `${((state.targetY - 0.5) * configRef.current.positionIntensity * 8).toFixed(2)}px`)
    }
    const pointerEnter = event => {
      state.hoverTarget = 1
      root.dataset.chromaHover = 'true'
      updatePointer(event)
    }
    const pointerLeave = () => {
      state.hoverTarget = 0
      state.targetX = 0.5
      state.targetY = 0.5
      root.dataset.chromaHover = 'false'
      root.style.setProperty('--chroma-rotate-x', '0deg')
      root.style.setProperty('--chroma-rotate-y', '0deg')
      root.style.setProperty('--chroma-shift-x', '0px')
      root.style.setProperty('--chroma-shift-y', '0px')
    }
    const image = new Image()
    image.decoding = 'async'
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (disposed) return
      state.imageReady = true
      state.textureWidth = image.naturalWidth || image.width || 1
      state.textureHeight = image.naturalHeight || image.height || 1
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
      } catch {
        state.imageReady = false
        root.dataset.chromaFallback = 'true'
        if (fallback) fallback.style.opacity = '1'
        return
      }
      root.dataset.chromaReady = 'true'
      if (fallback) fallback.style.opacity = '0'
    }
    image.onerror = () => {
      root.dataset.chromaFallback = 'true'
      if (fallback) fallback.style.opacity = '1'
    }
    image.src = source

    resize()
    root.addEventListener('pointerenter', pointerEnter)
    root.addEventListener('pointermove', updatePointer)
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
      root.removeEventListener('pointermove', updatePointer)
      root.removeEventListener('pointerleave', pointerLeave)
      image.onload = null
      image.onerror = null
      gl.deleteTexture(texture)
      gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(program)
      // Strict Mode reuses this DOM canvas during its effect cleanup probe.
      queueMicrotask(() => {
        if (!canvas.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext()
      })
    }
  }, [imageSrc])

  return <div
    {...rest}
    ref={rootRef}
    className={`chroma-card ${className}`.trim()}
    style={rootStyle}
    role="img"
    aria-label={alt || undefined}
    data-chroma-card
    data-chroma-image={imageSrc || ''}
  >
    <div className="chroma-card__surface">
      <img ref={fallbackRef} className="chroma-card__fallback" src={imageSrc} alt={alt} draggable="false" loading="lazy" decoding="async" />
      <canvas ref={canvasRef} className="chroma-card__canvas" aria-hidden="true" />
      <div className="chroma-card__glow" aria-hidden="true" />
      {children && <div className="chroma-card__content">{children}</div>}
    </div>
  </div>
}
