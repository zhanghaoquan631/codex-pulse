// Adapted from React Bits Falling Text by David Haz. See THIRD_PARTY_NOTICES.md.
import { useEffect, useMemo, useRef, useState } from 'react'
import Matter from 'matter-js'
import './FallingText.css'

export const DEFAULT_FALLING_TEXT = 'React Bits makes words come alive. Hover to let them fall, then grab, drag, and play.'

export default function FallingText({ text = DEFAULT_FALLING_TEXT, replayToken = 0 }) {
  const rootRef = useRef(null)
  const [started, setStarted] = useState(false)
  const words = useMemo(() => {
    const segments = typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].map(item => item.segment)
      : text.split(/(\s+)/)
    return segments.filter(word => word.trim())
  }, [text])

  useEffect(() => { setStarted(false) }, [text, replayToken])

  useEffect(() => {
    if (started) return undefined
    const root = rootRef.current
    const content = root.querySelector('.falling-text-words')
    let cancelled = false
    const fit = () => {
      if (cancelled) return
      content.style.fontSize = ''
      let size = parseFloat(getComputedStyle(content).fontSize)
      while (content.offsetHeight > root.clientHeight && size > 8) {
        size -= 1
        content.style.fontSize = `${size}px`
      }
    }
    fit()
    Promise.resolve(document.fonts?.ready).then(fit)
    const observer = new ResizeObserver(fit)
    observer.observe(root)
    return () => { cancelled = true; observer.disconnect() }
  }, [words, started, replayToken])

  useEffect(() => {
    const root = rootRef.current
    let lastWidth = root.clientWidth
    let lastHeight = root.clientHeight
    const observer = new ResizeObserver(() => {
      if (Math.abs(root.clientWidth - lastWidth) > 1 || Math.abs(root.clientHeight - lastHeight) > 1) {
        lastWidth = root.clientWidth
        lastHeight = root.clientHeight
        setStarted(false)
      }
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return undefined
    const root = rootRef.current
    const { Engine, Bodies, Body, Composite, Constraint, Query } = Matter
    let dispose = () => {}
    let cancelled = false
    const setup = () => {
      if (cancelled) return
      const width = root.clientWidth
      const height = root.clientHeight
      if (!width || !height) return
      const rootRect = root.getBoundingClientRect()
      const engine = Engine.create({ enableSleeping: true })
      engine.gravity.y = .56
      const elements = [...root.querySelectorAll('.falling-text-word')]
      const pairs = elements.map(element => {
        const rect = element.getBoundingClientRect()
        const body = Bodies.rectangle(rect.left - rootRect.left + rect.width / 2, rect.top - rootRect.top + rect.height / 2, rect.width, rect.height, {
          restitution: .65, friction: .2, frictionAir: .012,
        })
        Body.setVelocity(body, { x: (Math.random() - .5) * 3, y: 0 })
        Body.setAngularVelocity(body, (Math.random() - .5) * .04)
        return { element, body, width: rect.width, height: rect.height }
      })
      const bodies = pairs.map(pair => pair.body)
      const walls = [
        Bodies.rectangle(width / 2, height - 17, width, 50, { isStatic: true }),
        Bodies.rectangle(-25, height / 2, 50, height, { isStatic: true }),
        Bodies.rectangle(width + 25, height / 2, 50, height, { isStatic: true }),
        Bodies.rectangle(width / 2, -25, width, 50, { isStatic: true }),
      ]
      Composite.add(engine.world, [...walls, ...bodies])
      const draw = () => pairs.forEach(({ element, body }) => {
        element.style.transform = `translate(${body.position.x}px, ${body.position.y}px) translate(-50%, -50%) rotate(${body.angle}rad)`
      })
      pairs.forEach(({ element, width: wordWidth, height: wordHeight }) => {
        Object.assign(element.style, { position: 'absolute', left: '0', top: '0', margin: '0', width: `${wordWidth}px`, height: `${wordHeight}px` })
      })
      draw()

      let drag = null
      let pointerId = null
      const point = event => {
        const rect = root.getBoundingClientRect()
        return { x: event.clientX - rect.left, y: event.clientY - rect.top }
      }
      const release = () => {
        if (drag) Composite.remove(engine.world, drag)
        if (pointerId !== null && root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId)
        drag = null
        pointerId = null
      }
      const down = event => {
        if (event.button !== 0 || drag) return
        const position = point(event)
        const body = Query.point(bodies, position)[0]
        if (!body) return
        event.preventDefault()
        Matter.Sleeping.set(body, false)
        drag = Constraint.create({ pointA: position, bodyB: body, pointB: { x: position.x - body.position.x, y: position.y - body.position.y }, stiffness: .2, length: 0 })
        Composite.add(engine.world, drag)
        pointerId = event.pointerId
        root.setPointerCapture(pointerId)
      }
      const move = event => {
        if (!drag || event.pointerId !== pointerId) return
        drag.pointA = point(event)
        Matter.Sleeping.set(drag.bodyB, false)
      }
      root.addEventListener('pointerdown', down)
      root.addEventListener('pointermove', move)
      root.addEventListener('pointerup', release)
      root.addEventListener('pointercancel', release)
      root.addEventListener('lostpointercapture', release)
      let visible = true
      const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
      observer.observe(root)
      let frame = 0
      let last = performance.now()
      const tick = now => {
        const delta = Math.min(now - last, 33.33)
        last = now
        if (visible && !document.hidden) {
          const steps = Math.max(1, Math.ceil(delta / (1000 / 60)))
          for (let i = 0; i < steps; i += 1) Engine.update(engine, delta / steps)
          draw()
        }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
      dispose = () => {
        cancelAnimationFrame(frame)
        observer.disconnect()
        root.removeEventListener('pointerdown', down)
        root.removeEventListener('pointermove', move)
        root.removeEventListener('pointerup', release)
        root.removeEventListener('pointercancel', release)
        root.removeEventListener('lostpointercapture', release)
        release()
        Composite.clear(engine.world, false)
        Engine.clear(engine)
        elements.forEach(element => element.removeAttribute('style'))
      }
    }
    Promise.resolve(document.fonts?.ready).then(setup)
    return () => { cancelled = true; dispose() }
  }, [started, words, replayToken])

  return <div ref={rootRef} className="falling-text-container" data-falling-state={started ? 'falling' : 'ready'} tabIndex={0} role="group" aria-label={`落差文字互动：${text}。按回车开始，按 Escape 复位。`}
    onPointerEnter={event => { if (event.pointerType === 'mouse' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setStarted(true) }}
    onClick={() => setStarted(true)}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setStarted(true) }
      if (event.key === 'Escape') setStarted(false)
    }}>
    <div className="falling-text-words" aria-hidden="true">{words.map((word, index) => <span className={`falling-text-word${index % 4 === 1 ? ' is-highlighted' : ''}`} key={`${index}-${word}`}>{word}</span>)}</div>
    <p className="falling-text-note" aria-hidden="true">{started ? '拖动文字，自由堆叠 · ESC 复位' : '悬停或轻点，让文字落下'}</p>
  </div>
}
