import { useEffect, useMemo, useRef, useState } from 'react'
import './WireframeBall.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const PHI = (1 + Math.sqrt(5)) / 2

function pointKey(point) {
  return `${point.x.toFixed(6)}:${point.y.toFixed(6)}:${point.z.toFixed(6)}`
}

function normalizePoint(point) {
  const length = Math.hypot(point.x, point.y, point.z) || 1
  return { x: point.x / length, y: point.y / length, z: point.z / length }
}

function baseIcosahedron() {
  const vertices = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ].map(([x, y, z]) => normalizePoint({ x, y, z }))
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  return { vertices, faces }
}

function baseGeometry(shape) {
  const normalizedShape = String(shape || 'icosahedron').toLowerCase()
  if (normalizedShape === 'tetrahedron') {
    const vertices = [
      [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1],
    ].map(([x, y, z]) => normalizePoint({ x, y, z }))
    return { vertices, faces: [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]] }
  }
  if (normalizedShape === 'cube') {
    const vertices = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ].map(([x, y, z]) => normalizePoint({ x, y, z }))
    return {
      vertices,
      faces: [
        [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1],
        [1, 5, 6, 2], [2, 6, 7, 3], [4, 0, 3, 7],
      ],
    }
  }
  if (normalizedShape === 'octahedron') {
    const vertices = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0],
      [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ].map(([x, y, z]) => normalizePoint({ x, y, z }))
    return {
      vertices,
      faces: [
        [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
        [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
      ],
    }
  }
  if (normalizedShape === 'dodecahedron') {
    // The dodecahedron is built as the dual of the icosahedron. This keeps
    // face winding deterministic and avoids depending on a geometry package.
    const icosa = baseIcosahedron()
    const vertices = icosa.faces.map(face => {
      const center = face.reduce((sum, index) => ({
        x: sum.x + icosa.vertices[index].x,
        y: sum.y + icosa.vertices[index].y,
        z: sum.z + icosa.vertices[index].z,
      }), { x: 0, y: 0, z: 0 })
      return normalizePoint(center)
    })
    const faces = icosa.vertices.map((vertex, vertexIndex) => {
      const incident = icosa.faces
        .map((face, faceIndex) => ({ face, faceIndex }))
        .filter(({ face }) => face.includes(vertexIndex))
        .map(({ faceIndex }) => faceIndex)
      const axis = normalizePoint(vertex)
      const helper = Math.abs(axis.y) < 0.8 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }
      const tangent = normalizePoint({
        x: helper.y * axis.z - helper.z * axis.y,
        y: helper.z * axis.x - helper.x * axis.z,
        z: helper.x * axis.y - helper.y * axis.x,
      })
      const bitangent = {
        x: axis.y * tangent.z - axis.z * tangent.y,
        y: axis.z * tangent.x - axis.x * tangent.z,
        z: axis.x * tangent.y - axis.y * tangent.x,
      }
      return incident.sort((a, b) => {
        const pa = vertices[a]
        const pb = vertices[b]
        const aa = Math.atan2(pa.x * bitangent.x + pa.y * bitangent.y + pa.z * bitangent.z,
          pa.x * tangent.x + pa.y * tangent.y + pa.z * tangent.z)
        const ab = Math.atan2(pb.x * bitangent.x + pb.y * bitangent.y + pb.z * bitangent.z,
          pb.x * tangent.x + pb.y * tangent.y + pb.z * tangent.z)
        return aa - ab
      })
    })
    return { vertices, faces }
  }
  return baseIcosahedron()
}

function midpoint(a, b) {
  return normalizePoint({
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
    z: (a.z + b.z) * 0.5,
  })
}

function makeGeometry(shape, detail, stretch) {
  const base = baseGeometry(shape)
  const level = clamp(Math.round(finite(detail, 0)), 0, 3)
  const scaleY = clamp(finite(stretch, 1.28), 0.1, 4)
  const vertices = []
  const vertexMap = new Map()
  const addVertex = point => {
    const stretched = normalizePoint({ x: point.x, y: point.y * scaleY, z: point.z })
    const key = pointKey(stretched)
    const existing = vertexMap.get(key)
    if (existing != null) return existing
    const index = vertices.length
    vertices.push(stretched)
    vertexMap.set(key, index)
    return index
  }
  const edges = new Map()
  const addEdge = (a, b) => {
    if (a === b) return
    const low = Math.min(a, b)
    const high = Math.max(a, b)
    edges.set(`${low}:${high}`, [low, high])
  }
  const addPolygonBoundary = polygon => {
    polygon.forEach((index, position) => addEdge(index, polygon[(position + 1) % polygon.length]))
  }
  const subdivideTriangle = (a, b, c, depth) => {
    if (depth <= 0) {
      const triangle = [addVertex(a), addVertex(b), addVertex(c)]
      addEdge(triangle[0], triangle[1])
      addEdge(triangle[1], triangle[2])
      addEdge(triangle[2], triangle[0])
      return
    }
    const ab = midpoint(a, b)
    const bc = midpoint(b, c)
    const ca = midpoint(c, a)
    subdivideTriangle(a, ab, ca, depth - 1)
    subdivideTriangle(ab, b, bc, depth - 1)
    subdivideTriangle(ca, bc, c, depth - 1)
    subdivideTriangle(ab, bc, ca, depth - 1)
  }

  base.faces.forEach(face => {
    if (level === 0) {
      const polygon = face.map(index => addVertex(base.vertices[index]))
      addPolygonBoundary(polygon)
      return
    }
    // Triangulate a polygon fan for higher detail. Interior diagonals become
    // part of the wireframe, matching the tessellated feel of a dense mesh.
    for (let index = 1; index < face.length - 1; index += 1) {
      subdivideTriangle(base.vertices[face[0]], base.vertices[face[index]], base.vertices[face[index + 1]], level)
    }
  })

  return {
    vertices,
    edges: Array.from(edges.values()),
    shape: String(shape || 'icosahedron').toLowerCase(),
    detail: level,
  }
}

function parseColor(value, fallback = [1, 1, 1, 1]) {
  if (Array.isArray(value)) {
    const channels = value.slice(0, 4).map(channel => clamp(finite(channel, 1), 0, 1))
    while (channels.length < 3) channels.push(1)
    if (channels.length === 3) channels.push(1)
    return channels
  }
  const source = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!source || source === 'transparent') return [0, 0, 0, 0]
  const hex = source.replace(/^#/, '')
  if (/^[0-9a-f]{3,8}$/i.test(hex)) {
    const expanded = hex.length <= 4 ? hex.split('').map(char => `${char}${char}`).join('') : hex
    const parsed = Number.parseInt(expanded.slice(0, 6), 16)
    const alpha = expanded.length >= 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
    return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255, alpha]
  }
  const rgb = source.match(/^rgba?\(([^)]+)\)$/)
  if (rgb) {
    const parts = rgb[1].split(',').map(part => part.trim())
    const values = parts.slice(0, 3).map(part => {
      if (part.endsWith('%')) return clamp(Number.parseFloat(part) / 100, 0, 1)
      return clamp(Number.parseFloat(part) / 255, 0, 1)
    })
    const alpha = parts[3] == null ? 1 : clamp(Number.parseFloat(parts[3]), 0, 1)
    if (values.every(Number.isFinite)) return [...values, Number.isFinite(alpha) ? alpha : 1]
  }
  // Let the browser resolve named/currentColor values when available.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = source
      const resolved = context.fillStyle
      if (resolved && resolved !== source) return parseColor(resolved, fallback)
    }
  }
  return fallback
}

function mixColor(a, b, amount, brightness = 1) {
  const t = clamp(amount, 0, 1)
  return [
    clamp((a[0] * (1 - t) + b[0] * t) * brightness, 0, 1),
    clamp((a[1] * (1 - t) + b[1] * t) * brightness, 0, 1),
    clamp((a[2] * (1 - t) + b[2] * t) * brightness, 0, 1),
    clamp(a[3] * (1 - t) + b[3] * t, 0, 1),
  ]
}

function rgba(color, alpha = color[3] ?? 1) {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${clamp(alpha, 0, 1)})`
}

function rotatePoint(point, rotation) {
  const cx = Math.cos(rotation.x)
  const sx = Math.sin(rotation.x)
  const cy = Math.cos(rotation.y)
  const sy = Math.sin(rotation.y)
  const cz = Math.cos(rotation.z)
  const sz = Math.sin(rotation.z)

  let x = point.x
  let y = point.y * cx - point.z * sx
  let z = point.y * sx + point.z * cx
  const rx = x * cy + z * sy
  const rz = -x * sy + z * cy
  x = rx
  z = rz
  return {
    x: x * cz - y * sz,
    y: x * sz + y * cz,
    z,
  }
}

function projectPoint(point, width, height, zoom) {
  const minDimension = Math.min(width, height)
  const camera = 3.6
  const depth = camera - point.z
  const perspective = camera / Math.max(0.3, depth)
  // The public preview keeps the polyhedron comfortably inside its panel;
  // this scale leaves generous breathing room for the subtle edge bloom.
  const radius = minDimension * 0.33 * clamp(zoom, 0.15, 5) * perspective
  return {
    x: width * 0.5 + point.x * radius,
    y: height * 0.5 - point.y * radius,
    z: point.z,
    scale: perspective,
  }
}

function cssSize(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

/**
 * Clean-room Canvas 2D wireframe polyhedron based on the public Wireframe Ball
 * contract. It intentionally uses local geometry and browser primitives, not
 * the protected React Bits Pro implementation.
 */
export default function WireframeBall({
  shape = 'icosahedron',
  detail = 0,
  stretch = 1.28,
  zoom = 1,
  speed = 1,
  wobble = 0,
  showEdges = true,
  edgeColor = 'currentColor',
  edgeGlow = 1,
  edgeThickness = 0.02,
  showVertices = true,
  vertexColor = 'currentColor',
  vertexSize = 0.032,
  vertexGlow = 0.148,
  depthColor = '#7aa2ff',
  depthTint = 0,
  depthFade = 0,
  backgroundColor = 'transparent',
  brightness = 1,
  opacity = 1,
  cursorInteraction = true,
  cursorTilt = 0.35,
  dragToSpin = true,
  spinFriction = 0.94,
  adaptiveQuality = true,
  targetFps = 60,
  dpr = 2,
  paused = false,
  width = '100%',
  height = '100%',
  className = '',
  style,
  children,
  onVertexClick,
  vertexTargets = [],
  ...rest
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const hitRefs = useRef([])
  const modelRef = useRef(null)
  const propsRef = useRef({})
  const [vertexCount, setVertexCount] = useState(0)
  const geometry = useMemo(() => makeGeometry(shape, detail, stretch), [shape, detail, stretch])

  propsRef.current = {
    shape,
    detail,
    stretch,
    zoom: clamp(finite(zoom, 1), 0.15, 5),
    speed: clamp(finite(speed, 1), -8, 8),
    wobble: clamp(finite(wobble, 0), 0, 5),
    showEdges: Boolean(showEdges),
    edgeColor,
    edgeGlow: clamp(finite(edgeGlow, 1), 0, 5),
    edgeThickness: clamp(finite(edgeThickness, 0.02), 0.001, 0.2),
    showVertices: Boolean(showVertices),
    vertexColor,
    vertexSize: clamp(finite(vertexSize, 0.032), 0.004, 0.25),
    vertexGlow: clamp(finite(vertexGlow, 0.148), 0, 5),
    depthColor,
    depthTint: clamp(finite(depthTint, 0), 0, 1),
    depthFade: clamp(finite(depthFade, 0), 0, 1),
    backgroundColor,
    brightness: clamp(finite(brightness, 1), 0, 4),
    opacity: clamp(finite(opacity, 1), 0, 1),
    cursorInteraction: Boolean(cursorInteraction),
    cursorTilt: clamp(finite(cursorTilt, 0.35), 0, 2),
    dragToSpin: Boolean(dragToSpin),
    spinFriction: clamp(finite(spinFriction, 0.94), 0.75, 0.999),
    adaptiveQuality: Boolean(adaptiveQuality),
    targetFps: clamp(finite(targetFps, 60), 12, 120),
    dpr: clamp(finite(dpr, 2), 0.5, 3),
    paused: Boolean(paused),
    geometry,
    vertexTargets: Array.isArray(vertexTargets) ? vertexTargets : [],
    onVertexClick,
  }

  useEffect(() => {
    setVertexCount(geometry.vertices.length)
  }, [geometry])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return undefined
    const context = canvas.getContext('2d')
    if (!context) {
      container.dataset.wireframeFallback = 'true'
      return undefined
    }
    container.dataset.wireframeFallback = 'false'
    container.dataset.wireframePointer = 'idle'
    container.dataset.wireframeDragging = 'false'

    const model = {
      width: 1,
      height: 1,
      dpr: 1,
      rotation: { x: -0.18, y: 0.42, z: 0 },
      velocity: { x: 0, y: 0 },
      pointer: { x: 0.5, y: 0.5, active: false },
      dragging: false,
      dragDistance: 0,
      lastPointer: { x: 0, y: 0 },
      suppressClickUntil: 0,
      lastFrame: 0,
      elapsed: 0,
      projected: [],
      reducedMotion: false,
      raf: 0,
      resizeObserver: null,
      visibilityObserver: null,
      pageVisible: document.visibilityState !== 'hidden',
    }
    modelRef.current = model

    const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const syncReducedMotion = () => { model.reducedMotion = Boolean(reducedQuery?.matches) }
    syncReducedMotion()
    reducedQuery?.addEventListener?.('change', syncReducedMotion)

    const resize = () => {
      const rect = container.getBoundingClientRect()
      model.width = Math.max(1, rect.width || container.clientWidth || 1)
      model.height = Math.max(1, rect.height || container.clientHeight || 1)
      const requestedDpr = propsRef.current.dpr
      const deviceDpr = window.devicePixelRatio || 1
      const qualityDpr = propsRef.current.adaptiveQuality ? Math.min(requestedDpr, 2) : requestedDpr
      model.dpr = clamp(Math.min(deviceDpr, qualityDpr), 0.5, 3)
      canvas.width = Math.max(1, Math.round(model.width * model.dpr))
      canvas.height = Math.max(1, Math.round(model.height * model.dpr))
      canvas.style.width = `${model.width}px`
      canvas.style.height = `${model.height}px`
      context.setTransform(model.dpr, 0, 0, model.dpr, 0, 0)
    }
    resize()
    if (typeof ResizeObserver !== 'undefined') {
      model.resizeObserver = new ResizeObserver(resize)
      model.resizeObserver.observe(container)
    } else {
      window.addEventListener('resize', resize)
    }

    const localPoint = event => {
      const rect = container.getBoundingClientRect()
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        nx: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
        ny: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
      }
    }
    const pointerDown = event => {
      const point = localPoint(event)
      model.pointer = { x: point.nx, y: point.ny, active: true }
      model.lastPointer = { x: point.x, y: point.y }
      model.dragDistance = 0
      if (propsRef.current.dragToSpin) {
        model.dragging = true
        container.dataset.wireframePointer = 'dragging'
        container.dataset.wireframeDragging = 'true'
        container.classList.add('is-dragging')
        event.currentTarget?.setPointerCapture?.(event.pointerId)
      }
    }
    const pointerMove = event => {
      const point = localPoint(event)
      model.pointer = { x: point.nx, y: point.ny, active: true }
      if (!model.dragging || !propsRef.current.dragToSpin) return
      const dx = point.x - model.lastPointer.x
      const dy = point.y - model.lastPointer.y
      model.lastPointer = { x: point.x, y: point.y }
      model.dragDistance += Math.hypot(dx, dy)
      model.rotation.y += dx * 0.012
      model.rotation.x += dy * 0.012
      model.velocity.y = clamp(model.velocity.y + dx * 0.0009, -0.08, 0.08)
      model.velocity.x = clamp(model.velocity.x + dy * 0.0009, -0.08, 0.08)
    }
    const pointerUp = event => {
      model.pointer.active = false
      if (model.dragging && model.dragDistance > 5) model.suppressClickUntil = performance.now() + 120
      model.dragging = false
      container.dataset.wireframePointer = 'idle'
      container.dataset.wireframeDragging = 'false'
      container.classList.remove('is-dragging')
      event.currentTarget?.releasePointerCapture?.(event.pointerId)
    }
    const pointerEnter = event => {
      const point = localPoint(event)
      model.pointer = { x: point.nx, y: point.ny, active: true }
      container.dataset.wireframePointer = 'active'
    }
    const pointerLeave = () => {
      if (!model.dragging) {
        model.pointer.active = false
        container.dataset.wireframePointer = 'idle'
      }
    }

    // Canvas clicks are resolved against the latest projected vertices as a
    // second hit path. The transparent buttons above the canvas provide
    // keyboard semantics, while this coordinate hit test keeps a moving point
    // clickable even when cursor tilt shifts it between pointerdown/up.
    const vertexClick = event => {
      if (event.target?.closest?.('[data-wireframe-vertex-index]')) return
      if (performance.now() < model.suppressClickUntil) return
      const point = localPoint(event)
      let nearestIndex = -1
      let nearestDistance = Infinity
      model.projected.forEach((projectedPoint, index) => {
        if (!projectedPoint) return
        const distance = Math.hypot(projectedPoint.x - point.x, projectedPoint.y - point.y)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = index
        }
      })
      const hitRadius = Math.max(34, Math.min(model.width, model.height) * 0.12)
      if (nearestIndex < 0 || nearestDistance > hitRadius) return
      const targetList = propsRef.current.vertexTargets
      const target = targetList.length ? targetList[nearestIndex % targetList.length] : undefined
      const vertex = propsRef.current.geometry.vertices[nearestIndex]
      propsRef.current.onVertexClick?.(nearestIndex, vertex, target, {
        index: nearestIndex,
        point: vertex,
        target,
        projected: model.projected[nearestIndex],
        event,
      })
    }

    const supportsPointer = typeof window.PointerEvent !== 'undefined'
    const prefix = supportsPointer ? 'pointer' : 'mouse'
    container.addEventListener(`${prefix}down`, pointerDown)
    container.addEventListener(`${prefix}move`, pointerMove)
    container.addEventListener(`${prefix}up`, pointerUp)
    container.addEventListener(`${prefix}cancel`, pointerUp)
    window.addEventListener(`${prefix}up`, pointerUp)
    window.addEventListener(`${prefix}cancel`, pointerUp)
    container.addEventListener(`${prefix}enter`, pointerEnter)
    container.addEventListener(`${prefix}leave`, pointerLeave)
    container.addEventListener('click', vertexClick)

    const render = timestamp => {
      model.raf = 0
      if (!model.pageVisible || document.visibilityState === 'hidden') return
      const props = propsRef.current
      const frameInterval = 1000 / Math.max(12, props.targetFps)
      if (!model.lastFrame) model.lastFrame = timestamp
      const elapsedFrame = timestamp - model.lastFrame
      if (elapsedFrame < frameInterval * 0.65) {
        model.raf = window.requestAnimationFrame(render)
        return
      }
      model.lastFrame = timestamp
      const dt = Math.min(64, Math.max(1, elapsedFrame))
      model.elapsed += dt / 1000
      const reduced = model.reducedMotion
      if (!props.paused && !reduced) {
        const direction = props.speed
        model.rotation.y += dt * direction * 0.00042
        model.rotation.z += dt * direction * 0.00008
        if (props.wobble > 0) model.rotation.x += Math.sin(model.elapsed * 1.7) * props.wobble * 0.000012 * dt
        if (props.dragToSpin) {
          model.rotation.y += model.velocity.y * dt
          model.rotation.x += model.velocity.x * dt
          model.velocity.x *= props.spinFriction
          model.velocity.y *= props.spinFriction
        }
      }

      const widthValue = model.width
      const heightValue = model.height
      context.setTransform(model.dpr, 0, 0, model.dpr, 0, 0)
      context.clearRect(0, 0, widthValue, heightValue)
      const bg = parseColor(props.backgroundColor, [0, 0, 0, 0])
      if (bg[3] > 0) {
        context.fillStyle = rgba(bg, bg[3] * props.opacity)
        context.fillRect(0, 0, widthValue, heightValue)
      }

      const cursorTiltX = props.cursorInteraction && model.pointer.active && !reduced
        ? (model.pointer.x - 0.5) * props.cursorTilt
        : 0
      const cursorTiltY = props.cursorInteraction && model.pointer.active && !reduced
        ? (model.pointer.y - 0.5) * props.cursorTilt
        : 0
      const rotation = {
        x: model.rotation.x + cursorTiltY,
        y: model.rotation.y + cursorTiltX,
        z: model.rotation.z,
      }
      const projected = props.geometry.vertices.map(point => projectPoint(rotatePoint(point, rotation), widthValue, heightValue, props.zoom))
      model.projected = projected
      const depthColorValue = parseColor(props.depthColor, [0.48, 0.63, 1, 1])
      const edgeBase = parseColor(String(props.edgeColor).toLowerCase() === 'currentcolor' ? getComputedStyle(container).color : props.edgeColor, [1, 1, 1, 1])
      const vertexBase = parseColor(String(props.vertexColor).toLowerCase() === 'currentcolor' ? getComputedStyle(container).color : props.vertexColor, [1, 1, 1, 1])

      // Keep the hit targets in sync with the projected vertices without a React
      // state update on every frame.
      hitRefs.current.forEach((button, index) => {
        if (!button) return
        const point = projected[index]
        if (!point) {
          button.style.display = 'none'
          return
        }
        // Keep an invisible, forgiving hit area around each glowing point. The
        // visual dot stays faithful to the small shader-like vertex while the
        // larger target makes a moving vertex practical to click with a mouse
        // or touch pointer.
        const hitSize = clamp(Math.max(42, widthValue * props.vertexSize * 0.8 * point.scale), 42, 72)
        button.style.display = 'block'
        button.style.left = `${point.x}px`
        button.style.top = `${point.y}px`
        button.style.width = `${hitSize}px`
        button.style.height = `${hitSize}px`
      })

      if (props.showEdges) {
        const sortedEdges = props.geometry.edges.slice().sort((first, second) => {
          const firstDepth = (projected[first[0]]?.z || 0) + (projected[first[1]]?.z || 0)
          const secondDepth = (projected[second[0]]?.z || 0) + (projected[second[1]]?.z || 0)
          return firstDepth - secondDepth
        })
        const thickness = clamp(widthValue < heightValue ? widthValue : heightValue, 80, 1200) * props.edgeThickness * 0.16
        sortedEdges.forEach(([from, to]) => {
          const a = projected[from]
          const b = projected[to]
          if (!a || !b) return
          const depth = clamp((a.z + b.z) * 0.5 * 0.5 + 0.5, 0, 1)
          const color = mixColor(edgeBase, depthColorValue, props.depthTint * depth, props.brightness)
          const alpha = color[3] * props.opacity * (1 - props.depthFade * (1 - depth) * 0.75)
          context.save()
          context.globalCompositeOperation = 'lighter'
          context.lineCap = 'round'
          context.strokeStyle = rgba(color, alpha * 0.2)
          context.lineWidth = Math.max(1, thickness * (1 + props.edgeGlow * 0.65))
          context.shadowColor = rgba(color, alpha * 0.42)
          context.shadowBlur = Math.max(0, props.edgeGlow * 5)
          context.beginPath()
          context.moveTo(a.x, a.y)
          context.lineTo(b.x, b.y)
          context.stroke()
          context.globalCompositeOperation = 'source-over'
          context.shadowBlur = 0
          context.strokeStyle = rgba(color, alpha * 0.62)
          context.lineWidth = Math.max(0.65, thickness)
          context.beginPath()
          context.moveTo(a.x, a.y)
          context.lineTo(b.x, b.y)
          context.stroke()
          context.restore()
        })
      }

      if (props.showVertices) {
        projected.forEach((point, index) => {
          const depth = clamp(point.z * 0.5 + 0.5, 0, 1)
          const color = mixColor(vertexBase, depthColorValue, props.depthTint * depth, props.brightness)
          const alpha = color[3] * props.opacity * (1 - props.depthFade * (1 - depth) * 0.65)
          const radius = clamp(Math.min(widthValue, heightValue) * props.vertexSize * 0.22 * point.scale, 1.1, 18)
          context.save()
          context.globalCompositeOperation = 'lighter'
          context.fillStyle = rgba(color, alpha * 0.32)
          context.shadowColor = rgba(color, alpha)
          context.shadowBlur = Math.max(0, props.vertexGlow * 24)
          context.beginPath()
          context.arc(point.x, point.y, radius * (1.7 + props.vertexGlow * 0.6), 0, Math.PI * 2)
          context.fill()
          context.globalCompositeOperation = 'source-over'
          context.shadowBlur = 0
          context.fillStyle = rgba(color, alpha)
          context.beginPath()
          context.arc(point.x, point.y, radius, 0, Math.PI * 2)
          context.fill()
          context.restore()
        })
      }

      model.raf = window.requestAnimationFrame(render)
    }
    model.visibilityObserver = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => {
        model.pageVisible = Boolean(entry?.isIntersecting)
        if (model.pageVisible && document.visibilityState !== 'hidden' && !model.raf) model.raf = window.requestAnimationFrame(render)
      }, { rootMargin: '160px' })
      : null
    model.visibilityObserver?.observe(container)
    const onDocumentVisibility = () => {
      model.pageVisible = document.visibilityState !== 'hidden'
      if (model.pageVisible && !model.raf) model.raf = window.requestAnimationFrame(render)
    }
    document.addEventListener('visibilitychange', onDocumentVisibility)
    model.raf = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(model.raf)
      model.resizeObserver?.disconnect()
      model.visibilityObserver?.disconnect()
      document.removeEventListener('visibilitychange', onDocumentVisibility)
      if (!model.resizeObserver) window.removeEventListener('resize', resize)
      reducedQuery?.removeEventListener?.('change', syncReducedMotion)
      container.removeEventListener(`${prefix}down`, pointerDown)
      container.removeEventListener(`${prefix}move`, pointerMove)
      container.removeEventListener(`${prefix}up`, pointerUp)
      container.removeEventListener(`${prefix}cancel`, pointerUp)
      window.removeEventListener(`${prefix}up`, pointerUp)
      window.removeEventListener(`${prefix}cancel`, pointerUp)
      container.removeEventListener(`${prefix}enter`, pointerEnter)
      container.removeEventListener(`${prefix}leave`, pointerLeave)
      container.removeEventListener('click', vertexClick)
      modelRef.current = null
    }
  }, [])

  const handleVertexClick = (index, event) => {
    const model = modelRef.current
    if (model && performance.now() < model.suppressClickUntil) {
      event.preventDefault()
      return
    }
    const targetList = propsRef.current.vertexTargets
    const target = targetList.length ? targetList[index % targetList.length] : undefined
    const point = propsRef.current.geometry.vertices[index]
    onVertexClick?.(index, point, target, { index, point, target, projected: model?.projected?.[index], event })
  }

  const rootStyle = {
    width: cssSize(width, '100%'),
    height: cssSize(height, '100%'),
    ...style,
  }

  return (
    <div
      {...rest}
      ref={containerRef}
      className={`wireframe-ball ${className}`.trim()}
      style={rootStyle}
      data-wireframe-ball
      data-wireframe-shape={geometry.shape}
      data-wireframe-detail={geometry.detail}
      data-wireframe-vertex-count={geometry.vertices.length}
    >
      <canvas ref={canvasRef} className="wireframe-ball__canvas" aria-hidden="true" />
      <div className="wireframe-ball__fallback" aria-hidden="true" />
      <div className="wireframe-ball__hits" aria-label="Wireframe Ball vertices">
        {Array.from({ length: vertexCount }, (_, index) => {
          const target = vertexTargets.length ? vertexTargets[index % vertexTargets.length] : undefined
          const label = target?.label || `Wireframe vertex ${index + 1}`
          return (
            <button
              key={`${geometry.shape}-${geometry.detail}-${index}`}
              ref={node => { hitRefs.current[index] = node }}
              type="button"
              className="wireframe-ball__vertex-hit"
              data-wireframe-vertex-index={index}
              data-wireframe-target-href={target?.href || ''}
              aria-label={label}
              onClick={event => handleVertexClick(index, event)}
            />
          )
        })}
      </div>
      <div className="wireframe-ball__content">{children}</div>
    </div>
  )
}
