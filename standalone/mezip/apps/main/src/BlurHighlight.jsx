import { useEffect, useMemo, useRef, useState } from 'react'
import './BlurHighlight.css'

function textFromChildren(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textFromChildren).join('')
  if (node?.props) return textFromChildren(node.props.children)
  return ''
}

function normalizeBit(bit) {
  if (typeof bit === 'string') return { text: bit, occurrence: null }
  if (bit && typeof bit.text === 'string') {
    return { text: bit.text, occurrence: Number.isFinite(bit.occurrence) ? bit.occurrence : null }
  }
  return null
}

function findRanges(text, highlightedBits) {
  const ranges = []
  for (const rawBit of highlightedBits) {
    const bit = normalizeBit(rawBit)
    if (!bit?.text) continue
    const matches = []
    let from = 0
    while (from < text.length) {
      const index = text.indexOf(bit.text, from)
      if (index < 0) break
      matches.push({ start: index, end: index + bit.text.length })
      from = index + Math.max(bit.text.length, 1)
    }
    const selected = bit.occurrence == null
      ? matches
      : [matches[Math.max(0, Math.floor(bit.occurrence) - 1)]].filter(Boolean)
    ranges.push(...selected)
  }

  return ranges
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .reduce((result, range) => {
      const previous = result[result.length - 1]
      if (previous && range.start < previous.end) return result
      result.push(range)
      return result
    }, [])
}

function splitIntoParts(text, ranges) {
  const parts = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) parts.push({ text: text.slice(cursor, range.start), highlighted: false })
    parts.push({ text: text.slice(range.start, range.end), highlighted: true })
    cursor = range.end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlighted: false })
  return parts
}

function directionStyles(direction) {
  switch (direction) {
    case 'right':
      return { axis: 'x', origin: 'right center' }
    case 'top':
      return { axis: 'y', origin: 'center top' }
    case 'bottom':
      return { axis: 'y', origin: 'center bottom' }
    case 'left':
    default:
      return { axis: 'x', origin: 'left center' }
  }
}

/**
 * Clean-room blur-in paragraph with directional marker highlights.
 * It follows the public Blur Highlight interaction contract without bundling
 * the protected React Bits Pro implementation.
 */
export default function BlurHighlight({
  children,
  highlightedBits = [],
  highlightColor = 'hsl(80, 100%, 50%)',
  highlightClassName = '',
  blurAmount = 8,
  inactiveOpacity = 0.3,
  blurDelay = 0,
  blurDuration = 0.8,
  highlightDelay = 0.4,
  highlightDuration = 1,
  highlightDirection = 'left',
  viewportOptions = { once: false, amount: 0.5 },
  className = '',
  style,
  ...rest
}) {
  const rootRef = useRef(null)
  const [active, setActive] = useState(false)
  const text = useMemo(() => textFromChildren(children), [children])
  const ranges = useMemo(() => findRanges(text, highlightedBits), [text, highlightedBits])
  const parts = useMemo(() => splitIntoParts(text, ranges), [text, ranges])
  const direction = useMemo(() => directionStyles(highlightDirection), [highlightDirection])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const options = viewportOptions || {}
    const once = options.once ?? false
    const amount = typeof options.amount === 'number' ? Math.min(1, Math.max(0, options.amount)) : 0.5
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setActive(true)
      return undefined
    }

    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting)
      if (visible) {
        setActive(true)
        if (once) observer.disconnect()
      } else if (!once) {
        setActive(false)
      }
    }, {
      threshold: amount,
      rootMargin: '-20% 0px -20% 0px',
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [text, viewportOptions])

  return (
    <p
      ref={rootRef}
      className={`blur-highlight ${className}`.trim()}
      style={{
        '--blur-highlight-amount': `${blurAmount}px`,
        '--blur-highlight-opacity': inactiveOpacity,
        '--blur-highlight-delay': `${blurDelay}s`,
        '--blur-highlight-duration': `${blurDuration}s`,
        '--blur-highlight-color': highlightColor,
        '--blur-highlight-axis': direction.axis,
        '--blur-highlight-origin': direction.origin,
        '--blur-highlight-marker-delay': `${highlightDelay}s`,
        '--blur-highlight-marker-duration': `${highlightDuration}s`,
        '--blur-highlight-marker-scale': active ? 1 : 0,
        ...style,
      }}
      data-blur-highlight
      data-blur-highlight-active={active ? 'true' : 'false'}
      data-blur-highlight-direction={highlightDirection}
      {...rest}
    >
      {parts.map((part, index) => (
        <span
          className={`blur-highlight__part ${part.highlighted ? `blur-highlight__marked ${highlightClassName}` : ''}`.trim()}
          key={`${index}-${part.text}`}
          style={{ '--blur-highlight-part-delay': `${index * 0.035}s` }}
        >
          {part.text}
        </span>
      ))}
    </p>
  )
}
