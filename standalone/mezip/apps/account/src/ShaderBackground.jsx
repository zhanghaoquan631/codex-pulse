import { useEffect, useRef } from 'react'
import { Renderer, Program, Mesh, Geometry } from 'ogl'

// Original vertex body and fragment shader are copied byte for byte.
const vertexShader = `
varying vec2 vPlane;

void main() {
  vPlane = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;

varying vec2 vPlane;

uniform vec2 uCanvas;
uniform float uClock;
uniform float uPitch;
uniform float uFill;
uniform float uRound;
uniform float uFeather;
uniform float uWarp;
uniform float uWarpScale;
uniform float uDetailScale;
uniform float uWaveScale;
uniform float uFalloff;
uniform float uGain;
uniform float uAmbient;
uniform vec3 uInk;
uniform vec3 uHot;
uniform float uGamma;
uniform float uVignette;
uniform float uOpacity;
uniform vec3 uBackdrop;
uniform float uBackdropAlpha;
uniform vec3 uPointer;
uniform float uCursorPull;
uniform float uCursorGlow;
uniform float uCursorReach;

float chip(vec2 cell) {
  return fract(sin(dot(cell, vec2(12.543, 514.123))) * 4732.12);
}

float swell(vec2 spot) {
  vec2 cell = floor(spot);
  vec2 lean = fract(spot);
  lean = lean * lean * (3.0 - 2.0 * lean);

  float lo = mix(chip(cell), chip(cell + vec2(1.0, 0.0)), lean.x);
  float hi = mix(chip(cell + vec2(0.0, 1.0)), chip(cell + vec2(1.0, 1.0)), lean.x);
  return mix(lo, hi, lean.y);
}

void main() {
  vec2 pixel = vPlane * uCanvas;
  float pitch = max(uPitch, 2.0);

  vec2 grid = pixel / pitch;
  vec2 local = abs(fract(grid) - 0.5) * 2.0;
  float boxy = max(local.x, local.y);
  float orb = length(local);
  float bite = mix(boxy, orb, uRound);

  float aa = 2.0 / pitch;
  float soft = aa + uFeather * uFill;
  float tile = 1.0 - smoothstep(uFill - soft, uFill + soft, bite);

  vec2 field = pixel / max(uCanvas.y, 1.0);
  vec2 toward = uPointer.xy - field;
  float span = max(uCursorReach, 0.001);
  float near = exp(-dot(toward, toward) / (span * span)) * uPointer.z;
  field += toward * near * uCursorPull;

  float t = uClock;
  float inner = swell(field * uDetailScale - t * 0.66);
  vec2 folded = field + uWarp * swell(field * uWarpScale + t + inner * 0.5);
  float wave = swell(folded * uWaveScale - vec2(0.0, t));

  float ridge = pow(max(1.0 - wave, 0.0), uFalloff) * uGain;
  ridge += near * uCursorGlow;

  float level = clamp(uAmbient + ridge, 0.0, 1.0);
  level = pow(level, 1.0 / max(uGamma, 0.05));

  vec2 off = vPlane - 0.5;
  float edge = 1.0 - uVignette * smoothstep(0.2, 0.75, length(off));

  vec3 tint = mix(uInk, uHot, smoothstep(0.6, 1.0, level));
  float cover = clamp(level * tile * edge, 0.0, 1.0);
  float rest = uBackdropAlpha * (1.0 - cover);
  gl_FragColor = vec4(tint * cover + uBackdrop * rest, cover + rest) * uOpacity;
}
`

// THREE.Color(hex) stores sRGB inputs in Linear-sRGB; retain its exact constants.
const srgbToLinear = c => c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4)
const linearHex = hex => {
  const short = hex.replace('#', '')
  const value = parseInt(short.length === 3 ? short.split('').map(c => c + c).join('') : short, 16)
  return [srgbToLinear(((value >> 16) & 255) / 255), srgbToLinear(((value >> 8) & 255) / 255), srgbToLinear((value & 255) / 255)]
}

export default function ShaderBackground({ pointerRef = null, className = '', backdrop = '#0b0410', opacity = 1 }) {
  const mountRef = useRef(null)
  const localPointer = useRef({ x: 0.5, y: 0.5, active: false })
  const pointer = pointerRef || localPointer

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const dpr = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    const renderer = new Renderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance', dpr: dpr() })
    const gl = renderer.gl
    const canvas = gl.canvas
    gl.clearColor(0, 0, 0, 0)
    mount.appendChild(canvas)

    const uniforms = {
      uCanvas: { value: [1, 1] },
      uClock: { value: 0 },
      uPitch: { value: 4 },
      uFill: { value: 1 },
      uRound: { value: 0 },
      uFeather: { value: 1 },
      uWarp: { value: 0.85 },
      uWarpScale: { value: 4 },
      uDetailScale: { value: 2 },
      uWaveScale: { value: 2 },
      uFalloff: { value: 5.5 },
      uGain: { value: 5 },
      uAmbient: { value: 0 },
      uInk: { value: linearHex('#b487f0') },
      uHot: { value: linearHex('#0b0410') },
      uGamma: { value: 3 },
      uVignette: { value: 1 },
      uOpacity: { value: opacity },
      uBackdrop: { value: linearHex(backdrop) },
      uBackdropAlpha: { value: 1 },
      uPointer: { value: [0.5, 0.5, 0] },
      uCursorPull: { value: 0.1 },
      uCursorGlow: { value: 0.06 },
      uCursorReach: { value: 0.25 }
    }
    // Match THREE.PlaneGeometry(2, 2), including its UVs and triangle diagonal.
    const geometry = new Geometry(gl, {
      position: { size: 3, data: new Float32Array([-1, 1, 0, 1, 1, 0, -1, -1, 0, 1, -1, 0]) },
      uv: { size: 2, data: new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]) },
      index: { data: new Uint16Array([0, 2, 1, 2, 3, 1]) }
    })
    const program = new Program(gl, {
      // Three previously supplied these standard attribute declarations.
      vertex: 'precision highp float;\nattribute vec3 position;\nattribute vec2 uv;\n' + vertexShader,
      fragment: fragmentShader,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false
    })
    program.setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    const mesh = new Mesh(gl, { geometry, program, frustumCulled: false })
    let disposed = false
    let frame = 0
    let previousTime = 0
    let width = 0
    let height = 0

    const resize = () => {
      const bounds = mount.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      if (width <= 0 || height <= 0) return
      renderer.dpr = dpr()
      renderer.setSize(width, height)
      uniforms.uCanvas.value[0] = gl.drawingBufferWidth
      uniforms.uCanvas.value[1] = gl.drawingBufferHeight
      uniforms.uPitch.value = 4 * renderer.dpr
    }
    const loop = now => {
      frame = 0
      if (disposed || document.hidden) return
      if (renderer.dpr !== dpr()) resize()
      const delta = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 0
      previousTime = now
      uniforms.uClock.value += delta * 0.2 * 0.5
      if (width > 0 && height > 0) {
        const aspect = gl.drawingBufferWidth / Math.max(gl.drawingBufferHeight, 1)
        uniforms.uPointer.value[0] = pointer.current.x * aspect
        uniforms.uPointer.value[1] = 1 - pointer.current.y
        uniforms.uPointer.value[2] = pointer.current.active ? 1 : 0
        renderer.render({ scene: mesh })
      }
      frame = requestAnimationFrame(loop)
    }
    const schedule = () => {
      if (disposed || document.hidden || frame) return
      frame = requestAnimationFrame(loop)
    }
    const visibilityChanged = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
      } else {
        // Retain previousTime: the original 50 ms clamp bounds the resume step.
        resize()
        schedule()
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', visibilityChanged)
    resize()
    schedule()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', visibilityChanged)
      geometry.remove()
      program.remove()
      if (canvas.parentNode === mount) mount.removeChild(canvas)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [backdrop, opacity, pointer])

  const onPointerMove = event => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    pointer.current.x = (event.clientX - bounds.left) / bounds.width
    pointer.current.y = (event.clientY - bounds.top) / bounds.height
    pointer.current.active = true
  }
  const onPointerLeave = () => { pointer.current.active = false }
  return <div ref={mountRef} className={['login-shader', className].filter(Boolean).join(' ')} onPointerMove={pointerRef ? undefined : onPointerMove} onPointerLeave={pointerRef ? undefined : onPointerLeave} aria-hidden="true" />
}
