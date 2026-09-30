import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { galleryShots, photos } from './media'
import ScrollStack from './ScrollStack'
import { SessionImageUploadButton } from './SessionImageUpload'
import MobileUploadLinks from './MobileUploadLinks'
import './ScrollStackStudio.css'

const SCROLL_STACK_CARD_COUNT = 5
const CARD_COPY = [
  { eyebrow: '01 / OBSERVE', title: '先看见，再生成。', body: '把注意力放在真实的光、材质和人的动作上，让每一次创作都有可追溯的起点。', accent: '#f5b971' },
  { eyebrow: '02 / DIRECT', title: '给灵感一个方向。', body: '镜头、距离和情绪都可以被说清楚；好的提示词，是把脑海里的画面交给下一帧。', accent: '#9cc6ff' },
  { eyebrow: '03 / SHAPE', title: '让细节形成秩序。', body: '从纹理到留白，层层筛选那些真正值得留下的部分，画面因此更像一张作品。', accent: '#c2a7ff' },
  { eyebrow: '04 / KEEP', title: '只保留会发光的瞬间。', body: '一组影像不必全部相同。保留差异，才能让叙事从一个镜头自然走向下一个镜头。', accent: '#8ee0c0' },
  { eyebrow: '05 / RETURN', title: '把下一步交给自己。', body: '滚动回到开头，重新选择一张素材；每一次随机，都是一条新的视觉路径。', accent: '#f19bb5' },
]

const autoCopyFor = (item, index) => {
  const template = CARD_COPY[index % CARD_COPY.length]
  const source = String(item.sourceLabel || `影像 ${String(index + 1).padStart(2, '0')}`).replace(/\s+/g, ' ').trim().slice(0, 48)
  return {
    eyebrow: template.eyebrow,
    title: template.title,
    body: `${template.body} 画面线索：${source}。`,
    accent: template.accent,
  }
}

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
  if (!sessionPreview && seen.size < SCROLL_STACK_CARD_COUNT) {
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
  .slice(0, Math.min(SCROLL_STACK_CARD_COUNT, candidates.length))
  .map((item, index) => ({
    ...CARD_COPY[index % CARD_COPY.length],
    id: `${item.src}-${index}`,
    image: item.src,
    alt: `滚动堆栈影像 ${String(item.slot || index + 1).padStart(2, '0')}`,
    sourceLabel: item.label,
  }))

const sameOrder = (first = [], second = []) => first.length === second.length && first.every((item, index) => item.image === second[index]?.image)

export default function ScrollStackStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => buildImagePool(uploadedImages), [uploadedImages])
  const candidateSignature = candidates.map(item => item.src).join('\u0001')
  const [items, setItems] = useState(() => pickItems(buildImagePool(uploadedImages)))
  const itemsRef = useRef(items)
  const [shuffleToken, setShuffleToken] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const activeCardIndex = Math.min(Math.max(activeIndex, 0), Math.max(items.length - 1, 0))
  const activeItem = items[activeCardIndex]

  useEffect(() => { itemsRef.current = items }, [items])

  useEffect(() => {
    const current = itemsRef.current
    if (current.length >= 1 && current.every(item => candidates.some(candidate => candidate.src === item.image))) return
    setItems(pickItems(candidates))
    setActiveIndex(0)
  }, [candidateSignature])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setItems(current => {
      let next = pickItems(candidates)
      let attempts = 0
      while (candidates.length > SCROLL_STACK_CARD_COUNT && sameOrder(next, current) && attempts < 8) {
        next = pickItems(candidates)
        attempts += 1
      }
      return next
    })
    setActiveIndex(0)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const updateActiveCopy = useCallback((field, value) => {
    setItems(current => current.map((item, index) => index === activeCardIndex ? { ...item, [field]: value } : item))
  }, [activeCardIndex])

  const generateCopy = useCallback(() => {
    setItems(current => current.map((item, index) => ({ ...item, ...autoCopyFor(item, index) })))
  }, [])

  const sourceSummary = items.map(item => item.sourceLabel).join(' · ')
  const sources = items.map(item => item.image).join('|')

  return <section
    className="scroll-stack-studio section-wrap"
    id="scroll-stack"
    aria-labelledby="scroll-stack-studio-title"
    data-scroll-stack-studio
    data-scroll-stack-image-count={candidates.length}
    data-scroll-stack-set-size={items.length}
    data-scroll-stack-sources={sources}
    data-scroll-stack-active-index={activeIndex}
  >
    <div className="scroll-stack-studio-copy">
      <p className="eyebrow">SCROLL STACK</p>
      <h2 id="scroll-stack-studio-title">让每张卡片，在滚动里接住下一帧。</h2>
      <p>五张站内影像被固定在同一个视线里。继续向下滚动，前一张会转身、变暗并淡出，下一张从堆栈后面露出来；标题和文案也随卡片一起进入。</p>
      <div className="scroll-stack-studio-actions">
        <button className="scroll-stack-random-button" type="button" aria-label="随机生成一组滚动堆栈卡片" onClick={randomize} disabled={!candidates.length} data-scroll-stack-randomize>
          <span>随机生成一组</span><b aria-hidden="true">↻</b>
        </button>
      </div>
      <p className="scroll-stack-selection" aria-live="polite">
        当前卡片：{String(Math.min(activeIndex + 1, Math.max(1, items.length))).padStart(2, '0')} / {String(Math.max(1, items.length)).padStart(2, '0')} · 素材池 {candidates.length} 张
      </p>
      <p className="scroll-stack-source-summary">当前组：{sourceSummary || '暂无可用图片'}</p>
      <div className="scroll-stack-copy-tools" role="group" aria-label="滚动堆栈文案与图片">
        <div className="scroll-stack-copy-editor">
          <div className="scroll-stack-copy-editor-heading">
            <span>当前卡片文案</span>
            <span>{String(activeCardIndex + 1).padStart(2, '0')} / {String(Math.max(1, items.length)).padStart(2, '0')}</span>
          </div>
          <label className="scroll-stack-copy-field">
            <span>标题</span>
            <input type="text" maxLength={80} value={activeItem?.title || ''} onChange={event => updateActiveCopy('title', event.target.value)} aria-label="当前卡片标题" disabled={!activeItem} />
          </label>
          <label className="scroll-stack-copy-field">
            <span>正文</span>
            <textarea rows="3" maxLength={220} value={activeItem?.body || ''} onChange={event => updateActiveCopy('body', event.target.value)} aria-label="当前卡片正文" disabled={!activeItem} />
          </label>
          <button className="scroll-stack-auto-copy-button" type="button" onClick={generateCopy} disabled={!items.length} data-scroll-stack-auto-copy>
            <span>自动生成全部文案</span><b aria-hidden="true">✦</b>
          </button>
        </div>
        <div className="scroll-stack-upload-actions" role="group" aria-label="滚动堆栈上传">
          <p className="scroll-stack-upload-label">把一张新图放进滚动堆栈</p>
          <SessionImageUploadButton slot="scroll-stack" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
          <MobileUploadLinks />
        </div>
      </div>
    </div>

    <div className="scroll-stack-studio-visual">
      <div className="scroll-stack-studio-stage" data-media-slot="scroll-stack">
        <button className="scroll-stack-refresh-button" type="button" aria-label="随机换一组滚动堆栈卡片" onClick={randomize} disabled={!candidates.length} data-scroll-stack-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <ScrollStack
          key={shuffleToken}
          items={items}
          variant="stack"
          scrollLength={1}
          peek={26}
          scaleStep={0.07}
          blur={4}
          dim={0.28}
          smooth={0.16}
          depth={3}
          cardWidth={880}
          cardHeight={0.68}
          borderRadius={22}
          perspective={1400}
          showProgress
          showCounter
          onIndexChange={setActiveIndex}
          className="scroll-stack-studio-effect"
        />
      </div>
      <p className="scroll-stack-stage-note">SCROLL TO STACK · TURN · DISSOLVE</p>
    </div>
  </section>
}
