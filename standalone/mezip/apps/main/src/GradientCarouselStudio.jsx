import ViewportCanvas from './ViewportCanvas'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { galleryShots, photos } from './media'
import GradientCarousel from './GradientCarousel'
import MobileUploadLinks from './MobileUploadLinks'
import './GradientCarouselStudio.css'

const GRADIENT_CAROUSEL_ITEM_COUNT = 8

const shuffle = items => {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

const normalizePool = uploadedImages => {
  const seen = new Map()
  const sessionPreview = Array.isArray(uploadedImages) ? uploadedImages.find(item => item?.sessionOnly && item?.src) : null
  const sourceItems = sessionPreview ? [sessionPreview] : [...galleryShots, ...(Array.isArray(uploadedImages) ? uploadedImages : [])]
  sourceItems.forEach((item, index) => {
    const src = typeof item === 'string' ? item : item?.src
    if (!src || seen.has(src)) return
    const label = typeof item === 'object' && item ? item.prompt || item.label || item.title : ''
    seen.set(src, { src, label: label || `已加入影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 })
  })
  if (!sessionPreview && !seen.size) photos.forEach((src, index) => seen.set(src, { src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  return [...seen.values()]
}

const pickGradientImages = candidates => {
  if (!candidates.length) return []
  const shuffled = shuffle(candidates)
  return Array.from({ length: Math.min(GRADIENT_CAROUSEL_ITEM_COUNT, shuffled.length) }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const slot = String(item.slot || index + 1).padStart(2, '0')
    return {
      id: `${item.src}-${index}`,
      src: item.src,
      alt: `渐变旋转木马影像 ${slot}`,
      label: `影像 ${slot}`,
      sourceLabel: String(item.label || `影像 ${slot}`).replace(/\s+/g, ' ').trim(),
    }
  })
}

const sameOrder = (first = [], second = []) => first.length === second.length && first.every((item, index) => item.src === second[index]?.src)

export default function GradientCarouselStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => normalizePool(uploadedImages), [uploadedImages])
  const [items, setItems] = useState(() => pickGradientImages(normalizePool(uploadedImages)))
  const [activeIndex, setActiveIndex] = useState(0)
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setItems(current => {
      if (current.length && current.every(item => candidates.some(candidate => candidate.src === item.src))) return current
      return pickGradientImages(candidates)
    })
    setActiveIndex(0)
  }, [candidates])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setItems(current => {
      let next = pickGradientImages(candidates)
      let attempts = 0
      while (candidates.length > GRADIENT_CAROUSEL_ITEM_COUNT && sameOrder(next, current) && attempts < 8) {
        next = pickGradientImages(candidates)
        attempts += 1
      }
      return next
    })
    setActiveIndex(0)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const activeItem = items[activeIndex]
  const sourceSummary = activeItem?.sourceLabel || '暂无可用图片'

  return <section className="gradient-carousel-studio section-wrap" id="gradient-carousel" aria-labelledby="gradient-carousel-studio-title" data-gradient-carousel-studio data-gradient-image-count={candidates.length} data-gradient-set-size={items.length} data-gradient-index={activeIndex} data-gradient-sources={items.map(item => item.src).join('|')}>
    <div className="gradient-carousel-studio-copy">
      <p className="eyebrow">GRADIENT CAROUSEL</p>
      <h2 id="gradient-carousel-studio-title">让颜色从每一张影像里长出来。</h2>
      <p>每张卡片都会提取自己的主色，并在旋转木马的背景里形成动态渐变。拖动、滚轮或方向键可以沿着 3D 轨道移动，中心卡片会在惯性结束后自动对齐。</p>
      <button className="gradient-carousel-random-button" type="button" aria-label="随机生成一组渐变旋转木马图片" onClick={randomize} disabled={!candidates.length} data-gradient-carousel-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="gradient-carousel-selection" aria-live="polite">当前焦点：{activeItem ? `${activeItem.label} · ${sourceSummary}` : '暂无可用图片'} · 素材池 {candidates.length} 张</p>
      <div className="gradient-carousel-upload-actions" role="group" aria-label="渐变旋转木马上传">
        <p className="gradient-carousel-upload-label">把一张新图放进颜色流场</p>
        <div className="gradient-carousel-local-upload" data-session-upload-target="gradient-carousel" />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="gradient-carousel-studio-visual">
      <ViewportCanvas className="gradient-carousel-studio-canvas" aria-label="Gradient Carousel interactive preview" data-media-slot="gradient-carousel">
        <button className="gradient-carousel-refresh-button" type="button" aria-label="随机换一组渐变旋转木马图片" onClick={randomize} disabled={!candidates.length} data-gradient-carousel-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <GradientCarousel
          key={shuffleToken}
          images={items}
          maxRotationDegrees={28}
          maxDepthPx={200}
          minScale={0.85}
          cardGap={15}
          frictionFactor={0.95}
          wheelSensitivity={0.8}
          dragSensitivity={1}
          backgroundBlur={24}
          gradientSize={1}
          gradientIntensity={0.25}
          cardAspectRatio={1}
          initialIndex={0}
          enableKeyboard
          onCardChange={setActiveIndex}
          className="gradient-carousel-studio-effect"
        />
        <p className="gradient-carousel-stage-note">DRAG / WHEEL TO MOVE · ARROW KEYS</p>
      </ViewportCanvas>
    </div>
  </section>
}
