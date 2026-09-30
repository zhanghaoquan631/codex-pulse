import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { galleryShots, photos } from './media'
import ModalCards from './ModalCards'
import MobileUploadLinks from './MobileUploadLinks'
import './ModalCardsStudio.css'

const MODAL_CARD_COUNT = 3
const CARD_GRADIENTS = ['#6366f1', '#06b6d4', '#f97316', '#22c55e', '#ec4899', '#a855f7']

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
  if (!sessionPreview && seen.size < MODAL_CARD_COUNT) {
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

const pickItems = candidates => shuffle(candidates).slice(0, Math.min(MODAL_CARD_COUNT, candidates.length))

const sameOrder = (first = [], second = []) => first.length === second.length && first.every((item, index) => item.src === second[index]?.src)

const makeCards = items => items.map((item, index) => ({
  id: `modal-local-${item.src}-${index}`,
  imageUrl: item.src,
  title: `FRAME / ${String(index + 1).padStart(2, '0')}`,
  description: item.label,
  gradientColor: CARD_GRADIENTS[index % CARD_GRADIENTS.length],
}))

export default function ModalCardsStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => buildImagePool(uploadedImages), [uploadedImages])
  const candidateSignature = candidates.map(item => item.src).join('\u0001')
  const [items, setItems] = useState(() => pickItems(buildImagePool(uploadedImages)))
  const itemsRef = useRef(items)
  const [shuffleToken, setShuffleToken] = useState(0)
  const [activeTitle, setActiveTitle] = useState('')

  useEffect(() => { itemsRef.current = items }, [items])

  useEffect(() => {
    const current = itemsRef.current
    if (current.length >= 1 && current.every(item => candidates.some(candidate => candidate.src === item.src))) return
    setItems(pickItems(candidates))
    setActiveTitle('')
  }, [candidateSignature])

  const randomize = useCallback(() => {
    if (candidates.length < 1) return
    setItems(current => {
      let next = pickItems(candidates)
      let attempts = 0
      while (candidates.length > MODAL_CARD_COUNT && sameOrder(next, current) && attempts < 8) {
        next = pickItems(candidates)
        attempts += 1
      }
      return next
    })
    setActiveTitle('')
    setShuffleToken(token => token + 1)
  }, [candidates])

  const cards = useMemo(() => makeCards(items), [items])
  const sourceSummary = items.map(item => item.label).join(' · ')

  return <section
    className="modal-cards-studio section-wrap"
    id="modal-cards"
    aria-labelledby="modal-cards-studio-title"
    data-modal-cards-studio
    data-modal-cards-image-count={candidates.length}
    data-modal-cards-set-size={cards.length}
    data-modal-cards-sources={items.map(item => item.src).join('|')}
    data-modal-cards-open-title={activeTitle}
  >
    <div className="modal-cards-studio-copy">
      <p className="eyebrow">MODAL CARDS</p>
      <h2 id="modal-cards-studio-title">让站内影像，展开成一张完整卡片。</h2>
      <p>点击任意卡片，它会从横向画面平滑放大成全屏详情；遮罩、右上角 × 或 Escape 都可以关闭。</p>
      <div className="modal-cards-studio-actions">
        <button className="modal-cards-random-button" type="button" aria-label="随机生成一组模态卡片图片" onClick={randomize} disabled={!candidates.length} data-modal-cards-randomize>
          <span>随机生成一组</span><b aria-hidden="true">↻</b>
        </button>
      </div>
      <p className="modal-cards-selection" aria-live="polite">{activeTitle ? `已展开：${activeTitle}` : '点击任意卡片展开详情'} · 素材池 {candidates.length} 张</p>
      <p className="modal-cards-source-summary">当前组：{sourceSummary || '暂无可用图片'}</p>
      <div className="modal-cards-upload-actions" role="group" aria-label="完整卡片上传">
        <p className="modal-cards-upload-label">把一张新图展开成完整卡片</p>
        <div className="modal-cards-local-upload" data-session-upload-target="modal-cards" />
        <MobileUploadLinks />
      </div>
    </div>

    <div className="modal-cards-studio-visual">
      <div className="modal-cards-studio-stage" data-media-slot="modal-cards">
        <button className="modal-cards-refresh-button" type="button" aria-label="随机换一组模态卡片图片" onClick={randomize} disabled={!candidates.length} data-modal-cards-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <ModalCards
          key={shuffleToken}
          cards={cards}
          gradientColor="#6366f1"
          animationSpeed="normal"
          animationVariant="scale"
          closeOnBackdropClick
          closeOnEscape
          showCloseButton
          ariaLabel="站内影像卡片详情"
          onOpen={card => setActiveTitle(card.title)}
          onClose={() => setActiveTitle('')}
        />
      </div>
      <p className="modal-cards-stage-note">CLICK TO EXPAND · BACKDROP / ESC TO CLOSE</p>
    </div>
  </section>
}
