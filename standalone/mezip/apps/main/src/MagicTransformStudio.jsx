import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { galleryShots, photos } from './media'
import MagicTransform from './MagicTransform'
import MobileUploadLinks from './MobileUploadLinks'
import './MagicTransformStudio.css'

const MAGIC_SET_SIZE = 6
const DOC_ACCENTS = ['#b79cff', '#7dd3fc', '#f9a8d4', '#fcd34d', '#86efac', '#fdba74']

const shuffle = items => {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

const sourceOf = item => typeof item === 'string' ? item : item?.src || item?.url || item?.image || ''

const imagePool = uploadedImages => {
  const seen = new Map()
  const sessionPreview = Array.isArray(uploadedImages) ? uploadedImages.find(item => item?.sessionOnly && item?.src) : null
  const sourceItems = sessionPreview ? [sessionPreview] : [...galleryShots, ...(Array.isArray(uploadedImages) ? uploadedImages : [])]
  sourceItems.forEach((item, index) => {
    const src = String(sourceOf(item) || '').trim()
    if (!src || seen.has(src)) return
    const sourceLabel = typeof item === 'object' && item
      ? item.prompt || item.label || item.title || item.alt
      : ''
    seen.set(src, {
      src,
      slot: index + 1,
      sourceLabel: String(sourceLabel || `站内影像 ${String(index + 1).padStart(2, '0')}`).replace(/\s+/g, ' ').trim(),
    })
  })
  if (!sessionPreview && seen.size < 2) {
    photos.forEach((src, index) => {
      if (!src || seen.has(src)) return
      seen.set(src, { src, slot: index + 1, sourceLabel: `备用影像 ${String(index + 1).padStart(2, '0')}` })
    })
  }
  return [...seen.values()]
}

const pickImages = candidates => {
  const picked = shuffle(candidates).slice(0, Math.min(MAGIC_SET_SIZE, candidates.length))
  return picked.map((image, index) => ({
    id: `${image.src}-${index}`,
    src: image.src,
    label: `DOCUMENT / ${String(index + 1).padStart(2, '0')}`,
    sourceLabel: image.sourceLabel,
    slot: image.slot,
  }))
}

const sameOrder = (first = [], second = []) => first.length === second.length && first.every((item, index) => item.src === second[index]?.src)

const makeDocuments = items => items.slice(0, 4).map((item, index) => ({
  id: item.id,
  image: item.src,
  title: item.label,
  kicker: item.sourceLabel || 'LOCAL IMAGE ARCHIVE',
  lines: [`ARCHIVE SLOT ${String(item.slot || index + 1).padStart(2, '0')}`, 'READY FOR TRANSFORM'],
  accent: DOC_ACCENTS[index % DOC_ACCENTS.length],
}))

const makeResults = items => {
  const first = items[0]?.sourceLabel || 'Local visual archive'
  const second = items[1]?.sourceLabel || 'New visual result'
  return [
    { id: 'magic-email', type: 'email', label: 'EMAIL', value: `${first} ready`, icon: '✉', color: '#93c5fd' },
    { id: 'magic-total', type: 'total', label: 'TOTAL', value: `${items.length || 0} frames transformed`, icon: '∑', color: '#c4b5fd' },
    { id: 'magic-address', type: 'address', label: 'ADDRESS', value: 'Local image archive', icon: '⌖', color: '#67e8f9' },
    { id: 'magic-order', type: 'order', label: 'ORDER', value: 'MAGIC / VISUAL SET', icon: '◌', color: '#f9a8d4' },
    { id: 'magic-item', type: 'item', label: 'ITEM', value: `${second} output`, icon: '✦', color: '#fcd34d' },
  ]
}

export default function MagicTransformStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => imagePool(uploadedImages), [uploadedImages])
  const candidateSignature = candidates.map(item => item.src).join('\u0001')
  const [items, setItems] = useState(() => pickImages(imagePool(uploadedImages)))
  const itemsRef = useRef(items)
  const [paused, setPaused] = useState(false)
  const [beat, setBeat] = useState(0)
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => { itemsRef.current = items }, [items])

  useEffect(() => {
    const current = itemsRef.current
    if (current.length >= 2 && current.every(item => candidates.some(candidate => candidate.src === item.src))) return
    setItems(pickImages(candidates))
    setBeat(0)
  }, [candidateSignature])

  const randomize = useCallback(() => {
    if (candidates.length < 2) return
    setItems(current => {
      let next = pickImages(candidates)
      let attempts = 0
      while (candidates.length > MAGIC_SET_SIZE && sameOrder(next, current) && attempts < 8) {
        next = pickImages(candidates)
        attempts += 1
      }
      return next
    })
    setBeat(0)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const handleBeat = useCallback(nextBeat => setBeat(nextBeat), [])
  const documents = useMemo(() => makeDocuments(items), [items])
  const results = useMemo(() => makeResults(items), [items])
  const activeDocument = documents.length ? documents[beat % documents.length] : null

  return <section
    className="magic-transform-studio section-wrap"
    id="magic-transform"
    aria-labelledby="magic-transform-studio-title"
    data-magic-transform-studio
    data-magic-transform-image-count={candidates.length}
    data-magic-transform-set-size={items.length}
    data-magic-transform-studio-beat={beat}
    data-magic-transform-studio-paused={paused}
    data-magic-transform-sources={items.map(item => item.src).join('|')}
  >
    <div className="magic-transform-studio-copy">
      <p className="eyebrow">MAGIC TRANSFORM</p>
      <h2 id="magic-transform-studio-title">让站内影像穿过一条魔法变形轴。</h2>
      <p>文档卡片从左侧飞入，在中央轴线上被拆解成彩色粒子，再从右侧输出结果。每一组都来自你已经加入网站的图片。</p>
      <div className="magic-transform-studio-actions">
        <button className="magic-transform-random-button" type="button" aria-label="随机生成一组魔法变形图片" onClick={randomize} disabled={candidates.length < 2} data-magic-transform-randomize>
          <span>随机生成一组</span><b aria-hidden="true">↻</b>
        </button>
        <button className="magic-transform-pause-button" type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)} data-magic-transform-pause>
          {paused ? '继续变形' : '暂停变形'}
        </button>
      </div>
      <p className="magic-transform-selection" aria-live="polite">当前文档：{activeDocument ? `${activeDocument.title} · ${activeDocument.kicker}` : '暂无可用图片'} · 素材池 {candidates.length} 张</p>
      <div className="magic-transform-upload-actions" role="group" aria-label="魔法变形轴上传">
        <p className="magic-transform-upload-label">把一张新图送进魔法变形轴</p>
        <div className="magic-transform-local-upload" data-session-upload-target="magic-transform" />
        <MobileUploadLinks />
      </div>
    </div>

    <div className="magic-transform-studio-visual">
      <div className="magic-transform-studio-stage" data-media-slot="magic-transform">
        <button className="magic-transform-refresh-button" type="button" aria-label="随机换一组魔法变形图片" onClick={randomize} disabled={candidates.length < 2} data-magic-transform-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <MagicTransform
          key={shuffleToken}
          documents={documents}
          results={results}
          height="100%"
          width="100%"
          documentDuration={4}
          documentWidth={220}
          documentHeight={320}
          documentGap={60}
          particleCount={18}
          centerSize={56}
          axisColor="#7C3AED"
          backgroundColor="transparent"
          paused={paused}
          className="magic-transform-studio-effect"
          onBeat={handleBeat}
        />
        <p className="magic-transform-stage-note">DOCUMENT → TRANSFORM → RESULT</p>
      </div>
      <p className="magic-transform-tip">每 4 秒完成一次文档变形；点击“随机生成一组”会从站内图片池重抽 6 张。</p>
    </div>
  </section>
}
