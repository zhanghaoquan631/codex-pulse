import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { galleryShots, photos } from './media'
import ReelGallery from './ReelGallery'
import { SessionImageUploadButton } from './SessionImageUpload'
import MobileUploadLinks from './MobileUploadLinks'
import './ReelGalleryStudio.css'

const REEL_IMAGE_COUNT = 18

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
  if (!sessionPreview && seen.size < REEL_IMAGE_COUNT) {
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

const pickItems = candidates => shuffle(candidates)
  .slice(0, Math.min(REEL_IMAGE_COUNT, candidates.length))
  .map((item, index) => ({
    ...item,
    id: `${item.src}-${index}`,
    alt: `胶片影像 ${String(item.slot || index + 1).padStart(2, '0')}`,
  }))

const sameOrder = (first = [], second = []) => first.length === second.length && first.every((item, index) => item.src === second[index]?.src)

export default function ReelGalleryStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => buildImagePool(uploadedImages), [uploadedImages])
  const candidateSignature = candidates.map(item => item.src).join('\u0001')
  const [items, setItems] = useState(() => pickItems(buildImagePool(uploadedImages)))
  const itemsRef = useRef(items)
  const [shuffleToken, setShuffleToken] = useState(0)
  const [activeLabel, setActiveLabel] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!selectedImage) return undefined
    const dialog = dialogRef.current
    dialog?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [selectedImage])

  useEffect(() => { itemsRef.current = items }, [items])

  useEffect(() => {
    const current = itemsRef.current
    if (current.length >= 1 && current.every(item => candidates.some(candidate => candidate.src === item.src))) return
    setItems(pickItems(candidates))
    setActiveLabel('')
  }, [candidateSignature])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setItems(current => {
      let next = pickItems(candidates)
      let attempts = 0
      while (candidates.length > REEL_IMAGE_COUNT && sameOrder(next, current) && attempts < 8) {
        next = pickItems(candidates)
        attempts += 1
      }
      return next
    })
    setActiveLabel('')
    setShuffleToken(token => token + 1)
  }, [candidates])

  const sourceSummary = items.map(item => item.label).join(' · ')
  const sources = items.map(item => item.src).join('|')

  return <section
    className="reel-gallery-studio section-wrap"
    id="reel-gallery"
    aria-labelledby="reel-gallery-studio-title"
    data-reel-gallery-studio
    data-reel-gallery-image-count={candidates.length}
    data-reel-gallery-set-size={items.length}
    data-reel-gallery-sources={sources}
    data-reel-gallery-active-label={activeLabel}
  >
    <div className="reel-gallery-studio-copy">
      <p className="eyebrow">REEL GALLERY</p>
      <h2 id="reel-gallery-studio-title">让影像像胶片一样，沿着视线滑过。</h2>
      <p>三层倾斜的胶片轨道会持续缓慢移动，每一格都保留完整图片。滚轮、拖动和方向键可以改变滑动；点击任意影像，即可放大查看整张图。</p>
      <div className="reel-gallery-studio-actions">
        <button className="reel-gallery-random-button" type="button" aria-label="随机生成一组胶片画廊图片" onClick={randomize} disabled={!candidates.length} data-reel-gallery-randomize>
          <span>随机生成一组</span><b aria-hidden="true">↻</b>
        </button>
      </div>
      <p className="reel-gallery-selection" aria-live="polite">
        {activeLabel ? `已聚焦：${activeLabel}` : '拖动或滚动胶片，靠近影像查看聚光'} · 素材池 {candidates.length} 张
      </p>
      <p className="reel-gallery-source-summary">当前组：{sourceSummary || '暂无可用图片'}</p>
      <div className="reel-gallery-upload-actions" role="group" aria-label="胶片画廊上传">
        <p className="reel-gallery-upload-label">把一张新图放进胶片轨道</p>
        <SessionImageUploadButton slot="reel-gallery" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>

    <div className="reel-gallery-studio-visual">
      <div className="reel-gallery-studio-stage" data-media-slot="reel-gallery">
        <button className="reel-gallery-refresh-button" type="button" aria-label="随机换一组胶片画廊图片" onClick={randomize} disabled={!candidates.length} data-reel-gallery-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <ReelGallery
          key={shuffleToken}
          images={items}
          rows={3}
          rowHeight={148}
          rowGap={20}
          itemGap={16}
          maxAspect={1}
          minAspect={1}
          maxFps={60}
          tilt={4}
          arch={12}
          speed={1}
          speedVariance={0.55}
          alternate={false}
          autoScroll={26}
          inertia={0.92}
          damping={0.1}
          dragSensitivity={1.6}
          wheelSensitivity={1}
          radius={10}
          grayscale={0.15}
          focusRadius={210}
          focusStrength={0.85}
          brightness={1}
          dpr={1.25}
          fade={0.12}
          dim={0}
          taper={0}
          backgroundColor="transparent"
          interactive
          paused={Boolean(selectedImage)}
          onItemClick={item => { setActiveLabel(item.alt); setSelectedImage(item) }}
          ariaLabel="站内影像胶片画廊"
          className="reel-gallery-studio-effect"
        />
      </div>
      <p className="reel-gallery-stage-note">拖动 / 滚轮滑动 · 点击查看完整大图</p>
    </div>
    {selectedImage && <dialog
      ref={dialogRef}
      className="reel-gallery-image-dialog"
      aria-label={`完整图片：${selectedImage.alt}`}
      onCancel={() => setSelectedImage(null)}
      onClose={() => setSelectedImage(null)}
      onClick={event => { if (event.target === event.currentTarget) setSelectedImage(null) }}
    >
      <button className="reel-gallery-image-close" type="button" autoFocus onClick={() => setSelectedImage(null)} aria-label="关闭完整图片">关闭 ×</button>
      <img src={selectedImage.src} alt={selectedImage.alt} />
    </dialog>}
  </section>
}
