import { useEffect, useMemo, useRef, useState } from 'react'

import './MagicTransform.css'

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
const number = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const mod = (value, size) => size ? ((value % size) + size) % size : 0
const dimension = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? `${value}px` : value || fallback

const DEFAULT_DOCUMENTS = [
  { id: 'doc-01', title: 'CAPTURE / 01', kicker: 'INCOMING DOCUMENT', lines: ['Visual record', 'Ready for transform'] },
  { id: 'doc-02', title: 'CAPTURE / 02', kicker: 'INCOMING DOCUMENT', lines: ['Portrait index', 'Color mapped'] },
  { id: 'doc-03', title: 'CAPTURE / 03', kicker: 'INCOMING DOCUMENT', lines: ['Motion frame', 'Queued for output'] },
  { id: 'doc-04', title: 'CAPTURE / 04', kicker: 'INCOMING DOCUMENT', lines: ['Archive note', 'Signal received'] },
]

const DEFAULT_RESULTS = [
  { id: 'result-email', type: 'email', label: 'EMAIL', value: 'Visual brief ready', icon: '✉' },
  { id: 'result-total', type: 'total', label: 'TOTAL', value: '04 frames transformed', icon: '∑' },
  { id: 'result-address', type: 'address', label: 'ADDRESS', value: 'Local image archive', icon: '⌖' },
  { id: 'result-order', type: 'order', label: 'ORDER', value: 'MAGIC / 2026', icon: '◌' },
  { id: 'result-item', type: 'item', label: 'ITEM', value: 'New visual result', icon: '✦' },
]

const normalizeDocuments = documents => (Array.isArray(documents) && documents.length ? documents : DEFAULT_DOCUMENTS)
  .map((item, index) => {
    const source = typeof item === 'string' ? { image: item } : (item || {})
    const lines = Array.isArray(source.lines) ? source.lines : [source.meta, source.description]
    return {
      id: String(source.id || `document-${index + 1}`),
      image: String(source.image || source.src || source.url || '').trim(),
      title: String(source.title || source.label || `DOCUMENT / ${String(index + 1).padStart(2, '0')}`),
      kicker: String(source.kicker || source.category || 'INCOMING DOCUMENT'),
      lines: lines.filter(Boolean).map(line => String(line)).slice(0, 3),
      accent: String(source.accent || '#b9a1ff'),
    }
  })

const normalizeResults = results => (Array.isArray(results) && results.length ? results : DEFAULT_RESULTS)
  .map((item, index) => {
    const source = typeof item === 'string' ? { value: item } : (item || {})
    return {
      id: String(source.id || `result-${index + 1}`),
      type: String(source.type || 'item'),
      label: String(source.label || source.title || `RESULT ${String(index + 1).padStart(2, '0')}`),
      value: String(source.value || source.description || 'Transformed result'),
      icon: String(source.icon || '✦'),
      color: String(source.color || ''),
    }
  })

const buildParticles = count => Array.from({ length: count }, (_, index) => ({
  angle: (360 / Math.max(count, 1)) * index + ((index * 13) % 17) - 8,
  distance: 68 + ((index * 31) % 94),
  size: 3 + (index % 4),
  hue: 258 + ((index * 23) % 76),
  delay: (index % 6) * 18,
}))

/**
 * An independently authored DOM/CSS implementation of the public Magic
 * Transform interaction contract. The Pro implementation is not distributed
 * on the documentation page; this component keeps the documented props while
 * using local document cards, a transform axis, result chips, and particles.
 */
export default function MagicTransform({
  documents = DEFAULT_DOCUMENTS,
  results = DEFAULT_RESULTS,
  height = 560,
  width = '100%',
  documentDuration = 4,
  documentWidth = 220,
  documentHeight = 320,
  documentGap = 60,
  particleCount = 18,
  centerSize = 56,
  axisColor = '#7C3AED',
  backgroundColor = 'transparent',
  centerContent,
  paused = false,
  classNames = {},
  className = '',
  style,
  onBeat,
}) {
  const rootRef = useRef(null)
  const onBeatRef = useRef(onBeat)
  const [beat, setBeat] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const normalizedDocuments = useMemo(() => normalizeDocuments(documents), [documents])
  const normalizedResults = useMemo(() => normalizeResults(results), [results])
  const safeDuration = Math.max(.5, number(documentDuration, 4))
  const safeDocumentWidth = clamp(number(documentWidth, 220), 160, 300)
  const safeDocumentHeight = clamp(number(documentHeight, 320), 220, 420)
  const safeGap = clamp(number(documentGap, 60), 0, 240)
  const safeParticles = clamp(Math.round(number(particleCount, 18)), 0, 48)
  const safeCenterSize = clamp(number(centerSize, 56), 40, 120)
  const streamDuration = safeDuration * Math.max(normalizedDocuments.length, 1)
  const particles = useMemo(() => buildParticles(safeParticles), [safeParticles])
  const activeResult = normalizedResults.length ? mod(beat, normalizedResults.length) : 0

  onBeatRef.current = onBeat

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(Boolean(query?.matches))
    update()
    query?.addEventListener?.('change', update)
    return () => query?.removeEventListener?.('change', update)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (root) {
      root.dataset.magicTransformPaused = paused ? 'true' : 'false'
      root.dataset.magicTransformReducedMotion = reducedMotion ? 'true' : 'false'
      root.dataset.magicTransformBeat = String(beat)
      root.dataset.magicTransformResultIndex = String(activeResult)
    }
  }, [activeResult, beat, paused, reducedMotion])

  useEffect(() => {
    if (beat > 0) onBeatRef.current?.(beat)
  }, [beat])

  useEffect(() => {
    if (paused || reducedMotion || !normalizedDocuments.length) return undefined
    const timer = window.setInterval(() => {
      setBeat(previous => {
        return previous + 1
      })
    }, safeDuration * 1000)
    return () => window.clearInterval(timer)
  }, [normalizedDocuments.length, paused, reducedMotion, safeDuration])

  const rootStyle = {
    width: dimension(width, '100%'),
    height: dimension(height, '560px'),
    background: backgroundColor || 'transparent',
    '--magic-axis-color': axisColor || '#7C3AED',
    '--magic-center-size': `${safeCenterSize}px`,
    '--magic-document-width': `${safeDocumentWidth}px`,
    '--magic-document-height': `${safeDocumentHeight}px`,
    '--magic-document-gap': `${safeGap}px`,
    '--magic-document-duration': `${safeDuration}s`,
    '--magic-stream-duration': `${streamDuration}s`,
    ...style,
  }

  const classFor = key => classNames?.[key] || ''

  return <div
    ref={rootRef}
    className={['magic-transform', className].filter(Boolean).join(' ')}
    style={rootStyle}
    aria-label="Magic Transform animated document stage"
    data-magic-transform-ready="true"
    data-magic-transform-paused={paused}
    data-magic-transform-reduced-motion={reducedMotion}
    data-magic-transform-beat={beat}
    data-magic-transform-result-index={activeResult}
  >
    <div className="magic-transform__ambient" aria-hidden="true" />
    <div className="magic-transform__stream" aria-hidden="true">
      {normalizedDocuments.map((document, index) => <article
        key={document.id}
        className={['magic-transform__document', classFor('document')].filter(Boolean).join(' ')}
        style={{
          '--magic-document-index': index,
          '--magic-document-delay': `${-index * safeDuration}s`,
          '--magic-document-accent': document.accent,
        }}
      >
        <div className="magic-transform__paper">
          <div className="magic-transform__paper-head">
            <span>{document.kicker}</span><i>{String(index + 1).padStart(2, '0')}</i>
          </div>
          {document.image ? <div className="magic-transform__document-image"><img src={document.image} alt="" draggable="false" loading="lazy" decoding="async" /></div> : <div className="magic-transform__document-art" />}
          <div className="magic-transform__paper-copy">
            <strong>{document.title}</strong>
            {document.lines.map((line, lineIndex) => <span key={`${document.id}-line-${lineIndex}`}>{line}</span>)}
          </div>
          <div className="magic-transform__paper-rule" />
        </div>
        <span className="magic-transform__shred" />
      </article>)}
    </div>

    <div className={['magic-transform__axis', classFor('axis')].filter(Boolean).join(' ')} aria-hidden="true">
      <span className="magic-transform__axis-glow" />
      <span className="magic-transform__axis-line" />
      <span className={['magic-transform__center', classFor('center')].filter(Boolean).join(' ')}>
        {centerContent || <span className="magic-transform__center-mark">✦</span>}
      </span>
    </div>

    <div className="magic-transform__results" aria-live="polite">
      {normalizedResults.map((result, index) => <div
        key={result.id}
        className={['magic-transform__result', classFor('result'), index === activeResult ? 'is-current' : ''].filter(Boolean).join(' ')}
        style={{
          '--magic-result-index': index,
          '--magic-result-delay': `${-index * safeDuration}s`,
          '--magic-result-color': result.color || 'var(--magic-axis-color)',
        }}
      >
        <span className="magic-transform__result-icon" aria-hidden="true">{result.icon}</span>
        <span className={['magic-transform__result-body', classFor('resultBody')].filter(Boolean).join(' ')}><b>{result.label}</b><small>{result.value}</small></span>
      </div>)}
    </div>

    {particles.length > 0 && !reducedMotion && beat > 0 && <div key={`magic-burst-${beat}`} className="magic-transform__particles" aria-hidden="true">
      {particles.map((particle, index) => <i
        key={`${beat}-${index}`}
        className={['magic-transform__particle', classFor('particle')].filter(Boolean).join(' ')}
        style={{
          '--magic-particle-angle': `${particle.angle}deg`,
          '--magic-particle-distance': `${particle.distance}px`,
          '--magic-particle-size': `${particle.size}px`,
          '--magic-particle-hue': particle.hue,
          '--magic-particle-delay': `${particle.delay}ms`,
        }}
      />)}
    </div>}

    <span className="magic-transform__caption" aria-hidden="true">DOCUMENT → TRANSFORM → RESULT</span>
  </div>
}
