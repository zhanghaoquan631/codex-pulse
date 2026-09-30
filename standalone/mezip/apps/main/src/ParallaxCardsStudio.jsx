import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { galleryShots, photos } from './media'
import ParallaxCards from './ParallaxCards'
import { SessionImageUploadButton } from './SessionImageUpload'
import MobileUploadLinks from './MobileUploadLinks'
import './ParallaxCardsStudio.css'

const PARALLAX_CARD_COUNT = 12

const sourceOf = item => typeof item === 'string'
  ? item
  : item?.src || item?.url || item?.image || item?.imageUrl || item?.path || item?.fileUrl || item?.file_url || ''

const buildImagePool = uploadedImages => {
  const seen = new Map()
  const sessionPreview = Array.isArray(uploadedImages) ? uploadedImages.find(item => item?.sessionOnly && item?.src) : null
  const sourceItems = sessionPreview ? [sessionPreview] : [...galleryShots, ...(Array.isArray(uploadedImages) ? uploadedImages : [])]
  sourceItems.forEach((item, index) => {
    const src = String(sourceOf(item) || '').trim()
    if (!src || seen.has(src)) return
    const label = typeof item === 'object' && item
      ? item.prompt || item.label || item.title || item.alt || item.quote || item.source
      : ''
    seen.set(src, {
      src,
      slot: index + 1,
      label: String(label || `站内影像 ${String(index + 1).padStart(2, '0')}`).replace(/\s+/g, ' ').trim(),
    })
  })
  if (!sessionPreview && seen.size < PARALLAX_CARD_COUNT) {
    photos.forEach((src, index) => {
      if (!src || seen.has(src)) return
      seen.set(src, { src, slot: index + 1, label: `备用影像 ${String(index + 1).padStart(2, '0')}` })
    })
  }
  return [...seen.values()]
}

const shuffle = items => {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

const pickItems = candidates => shuffle(candidates).slice(0, Math.min(PARALLAX_CARD_COUNT, candidates.length))
const sameOrder = (first = [], second = []) => first.length === second.length && first.every((item, index) => item.src === second[index]?.src)

export default function ParallaxCardsStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => buildImagePool(uploadedImages), [uploadedImages])
  const candidateSignature = candidates.map(item => item.src).join('\u0001')
  const [items, setItems] = useState(() => pickItems(buildImagePool(uploadedImages)))
  const itemsRef = useRef(items)
  const [shuffleToken, setShuffleToken] = useState(0)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => { itemsRef.current = items }, [items])

  useEffect(() => {
    const current = itemsRef.current
    if (current.length >= 1 && current.every(item => candidates.some(candidate => candidate.src === item.src))) return
    setItems(pickItems(candidates))
    setActiveIndex(-1)
  }, [candidateSignature])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setItems(current => {
      let next = pickItems(candidates)
      let attempts = 0
      while (candidates.length > PARALLAX_CARD_COUNT && sameOrder(next, current) && attempts < 8) {
        next = pickItems(candidates)
        attempts += 1
      }
      return next
    })
    setActiveIndex(-1)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const sourceSummary = items.map(item => item.label).join(' · ')
  const cardSources = items.map(item => item.src).join('|')

  return <section
    className="parallax-cards-studio section-wrap"
    id="parallax-cards"
    aria-labelledby="parallax-cards-studio-title"
    data-parallax-cards-studio
    data-parallax-cards-image-count={candidates.length}
    data-parallax-cards-set-size={items.length}
    data-parallax-cards-sources={cardSources}
    data-parallax-cards-active-index={activeIndex}
  >
    <div className="parallax-cards-studio-copy">
      <p className="eyebrow">PARALLAX CARDS</p>
      <h2 id="parallax-cards-studio-title">让影像在空间里，随鼠标产生层次。</h2>
      <p>十二张站内影像被放进同一个三维层叠空间。移动鼠标可以看到不同深度的卡片产生视差，点击卡片即可聚焦；随机按钮会从你已经加入的网站图片中换一组。</p>
      <div className="parallax-cards-studio-actions">
        <button className="parallax-cards-random-button" type="button" aria-label="随机生成一组视差卡片图片" onClick={randomize} disabled={!candidates.length} data-parallax-cards-randomize>
          <span>随机生成一组</span><b aria-hidden="true">↻</b>
        </button>
      </div>
      <p className="parallax-cards-selection" aria-live="polite">
        {activeIndex >= 0 ? `已聚焦：卡片 ${String(activeIndex + 1).padStart(2, '0')}` : '移动鼠标查看空间视差，点击卡片聚焦'} · 素材池 {candidates.length} 张
      </p>
      <p className="parallax-cards-source-summary">当前组：{sourceSummary || '暂无可用图片'}</p>
      <div className="parallax-cards-upload-actions" role="group" aria-label="视差卡片上传">
        <p className="parallax-cards-upload-label">把一张新图放进空间层次卡片</p>
        <SessionImageUploadButton slot="parallax-cards" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>

    <div className="parallax-cards-studio-visual">
      <div className="parallax-cards-studio-stage" data-media-slot="parallax-cards">
        <button className="parallax-cards-refresh-button" type="button" aria-label="随机换一组视差卡片图片" onClick={randomize} disabled={!candidates.length} data-parallax-cards-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <ParallaxCards
          key={shuffleToken}
          images={items}
          cardCount={PARALLAX_CARD_COUNT}
          perspective={2500}
          mouseSensitivity={3}
          animationDuration={1.2}
          enableDepthFog={false}
          enableMagneticAttraction={false}
          onCardClick={index => setActiveIndex(index)}
          ariaLabel="站内影像视差卡片"
          className="parallax-cards-studio-effect"
        />
      </div>
      <p className="parallax-cards-stage-note">MOVE POINTER · CLICK TO FOCUS · ARROW KEYS</p>
    </div>
  </section>
}
