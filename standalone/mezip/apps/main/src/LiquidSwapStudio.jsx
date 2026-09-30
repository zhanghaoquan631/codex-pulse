import ViewportCanvas from './ViewportCanvas'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { galleryShots, photos } from './media'
import LiquidSwap from './LiquidSwap'
import MobileUploadLinks from './MobileUploadLinks'
import './LiquidSwapStudio.css'

const LIQUID_SWAP_SET_SIZE = 6

const shuffle = items => {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
  }
  return next
}

const imagePool = uploadedImages => {
  const seen = new Map()
  const sessionPreview = Array.isArray(uploadedImages) ? uploadedImages.find(item => item?.sessionOnly && item?.src) : null
  const sourceItems = sessionPreview ? [sessionPreview] : [...galleryShots, ...(Array.isArray(uploadedImages) ? uploadedImages : [])]
  sourceItems.forEach((item, index) => {
    const src = typeof item === 'string' ? item : item?.src
    if (!src || seen.has(src)) return
    const sourceLabel = typeof item === 'object' && item ? item.prompt || item.label || item.title : ''
    seen.set(src, {
      src,
      slot: index + 1,
      sourceLabel: String(sourceLabel || `已加入影像 ${String(index + 1).padStart(2, '0')}`).replace(/\s+/g, ' ').trim(),
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

const pickLiquidImages = candidates => {
  if (!candidates.length) return []
  const shuffled = shuffle(candidates)
  const setSize = Math.min(LIQUID_SWAP_SET_SIZE, shuffled.length)
  return Array.from({ length: setSize }, (_, index) => {
    const image = shuffled[index]
    const slot = String(image.slot || index + 1).padStart(2, '0')
    return {
      id: `${image.src}-${index}`,
      src: image.src,
      label: `影像 ${slot}`,
      sourceLabel: image.sourceLabel || `影像 ${slot}`,
    }
  })
}

const sameOrder = (first = [], second = []) => first.length === second.length && first.every((item, index) => item.src === second[index]?.src)

export default function LiquidSwapStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => imagePool(uploadedImages), [uploadedImages])
  const candidateSignature = candidates.map(item => item.src).join('\u0001')
  const [items, setItems] = useState(() => pickLiquidImages(imagePool(uploadedImages)))
  const itemsRef = useRef(items)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => { itemsRef.current = items }, [items])

  useEffect(() => {
    const current = itemsRef.current
    if (current.length >= 2 && current.every(item => candidates.some(candidate => candidate.src === item.src))) return
    setItems(pickLiquidImages(candidates))
    setActiveIndex(0)
  }, [candidateSignature])

  const randomize = useCallback(() => {
    if (candidates.length < 2) return
    setItems(current => {
      let next = pickLiquidImages(candidates)
      let attempts = 0
      while (candidates.length > LIQUID_SWAP_SET_SIZE && sameOrder(next, current) && attempts < 8) {
        next = pickLiquidImages(candidates)
        attempts += 1
      }
      return next
    })
    setActiveIndex(0)
    setIsTransitioning(false)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const activeItem = items[activeIndex] || items[0]
  const canSwap = items.length >= 2

  return <section
    className="liquid-swap-studio section-wrap"
    id="liquid-swap"
    aria-labelledby="liquid-swap-studio-title"
    data-liquid-swap-studio
    data-liquid-swap-image-count={candidates.length}
    data-liquid-swap-set-size={items.length}
    data-liquid-swap-studio-index={activeIndex}
    data-liquid-swap-sources={items.map(item => item.src).join('|')}
    data-liquid-swap-studio-transitioning={isTransitioning}
  >
    <div className="liquid-swap-studio-copy">
      <p className="eyebrow">LIQUID SWAP</p>
      <h2 id="liquid-swap-studio-title">让下一张影像，从一颗液态玻璃球里浮现。</h2>
      <p>点击画面，液态球会从中心向外展开：边缘保留折射、流体纹理与玻璃高光，直到下一张站内影像完全接管画面。</p>
      <button className="liquid-swap-random-button" type="button" aria-label="随机生成一组液体掉期图片" onClick={randomize} disabled={candidates.length < 2} data-liquid-swap-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="liquid-swap-selection" aria-live="polite">当前影像：{activeItem ? `${activeItem.label} · ${activeItem.sourceLabel}` : '暂无可用图片'} · 素材池 {candidates.length} 张</p>
      <div className="liquid-swap-upload-actions" role="group" aria-label="液态玻璃球上传">
        <p className="liquid-swap-upload-label">把一张新图放进液态玻璃球</p>
        <div className="liquid-swap-local-upload" data-session-upload-target="liquid-swap" />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="liquid-swap-studio-visual">
      <ViewportCanvas className="liquid-swap-studio-canvas" aria-label="Liquid Swap interactive preview" data-media-slot="liquid-swap">
        <button className="liquid-swap-refresh-button" type="button" aria-label="随机换一组液体掉期图片" onClick={randomize} disabled={candidates.length < 2} data-liquid-swap-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <LiquidSwap
          key={shuffleToken}
          images={items.map(item => item.src)}
          transitionDuration={2.5}
          glassRefractionStrength={1}
          glassChromaticAberration={0}
          glassBubbleClarity={1}
          glassEdgeGlow={1}
          glassLiquidFlow={1}
          startAtCursor={false}
          autoCycle={false}
          autoCycleDelay={3000}
          initialIndex={0}
          invertTopHalf
          onIndexChange={setActiveIndex}
          onTransitionChange={setIsTransitioning}
          className="liquid-swap-studio-effect"
        />
        <div className="liquid-swap-indicators" aria-hidden="true">
          {items.map((item, index) => <span key={item.id} className={index === activeIndex ? 'is-active' : ''} />)}
        </div>
        <p className="liquid-swap-stage-note">CLICK / ENTER · LIQUID GLASS SWAP</p>
        {isTransitioning && <span className="liquid-swap-transition-state" aria-live="polite">SWAPPING</span>}
      </ViewportCanvas>
      <p className="liquid-swap-tip">每次点击切到同组下一张；“随机生成一组”会从现有图片里重抽 6 张。</p>
    </div>
  </section>
}
