import { useEffect, useMemo, useState } from 'react'

import DriftWall from './DriftWall'
import MobileUploadLinks from './MobileUploadLinks'
import PersonalCardMarket from './PersonalCardMarket'
import { SessionImageUploadButton } from './SessionImageUpload'
import './PersonalDriftWallStudio.css'

const ORIGINAL_COUNT = 75
const WECHAT_0051_COUNT = 89
const WECHAT_0327_COUNT = 56
const EXTRA_PUBLIC_COUNT = 5
const PERSONAL_DRIFT_IMAGE_COUNT = ORIGINAL_COUNT + WECHAT_0051_COUNT + WECHAT_0327_COUNT + EXTRA_PUBLIC_COUNT
const WALL_IMAGE_LIMIT = 60
const ORIGINAL_DEMO_IMAGE_COUNT = 16

// Exact DEFAULT_PROPS from the official DriftWallDemo.jsx (2026-09-11).
// Only the image content is replaced with the user's existing archive.
const ORIGINAL_DEMO_PROPS = {
  columns: 5, tileWidth: 200, tileHeight: 132, gap: 18, radius: 14,
  tilt: 16, turn: -14, roll: 0, perspective: 1200, depth: 120,
  speed: 42, direction: 'up', variance: 0.45, parallax: 0.6,
  pauseOnHover: false, pauseColumnOnHover: true, lift: 64, fade: 0.6,
  dim: 0.55, grayscale: false, overlayColor: '#060010',
}

const PERSONAL_LAYOUT_PROPS = {
  columns: 5, tileWidth: 156, tileHeight: 222, gap: 4, radius: 5,
  tilt: 12, turn: -12, perspective: 1400, depth: 150, speed: 27,
  variance: 0.28, parallax: 0.35, pauseColumnOnHover: false,
  lift: 54, fade: 0.08, dim: 0.64, overlayColor: '#17120d',
}

const pickOriginalDemoItems = items => {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]]
  }
  return shuffled.slice(0, ORIGINAL_DEMO_IMAGE_COUNT)
}

const makeArchiveItem = (number, image, rewardUrl) => ({ image, rewardUrl, title: `公开视觉档案 ${String(number).padStart(3, '0')}`, number })

export const personalArchiveItems = [
  ...Array.from({ length: ORIGINAL_COUNT }, (_, index) => {
    const item = index + 1
    const file = `card-${String(item).padStart(3, '0')}.png`
    return makeArchiveItem(item, `/media/wechat-cards-20260827/${file}`, `/original-image-library/${file}`)
  }),
  ...Array.from({ length: WECHAT_0051_COUNT }, (_, index) => {
    const item = index + 1
    const file = `wechat-0051-${String(item).padStart(3, '0')}.jpg`
    return makeArchiveItem(ORIGINAL_COUNT + item, `/media/gallery-rewards/wechat-0051/${file}`, `/wechat-0051/${file}`)
  }),
  ...Array.from({ length: WECHAT_0327_COUNT }, (_, index) => {
    const item = index + 1
    const file = `wechat-0327-${String(item).padStart(3, '0')}.jpg`
    return makeArchiveItem(ORIGINAL_COUNT + WECHAT_0051_COUNT + item, `/media/gallery-rewards/wechat-0327/${file}`, `/wechat-0327/${file}`)
  }),
  ...Array.from({ length: EXTRA_PUBLIC_COUNT }, (_, index) => {
    const item = index + 1
    const file = `${String(item).padStart(3, '0')}.webp`
    return makeArchiveItem(ORIGINAL_COUNT + WECHAT_0051_COUNT + WECHAT_0327_COUNT + item, `/media/personal-drift-wall/${file}`, `/archive-extra/${file}`)
  }),
]

/**
 * Integrated presentation of the user-provided Personal Drift Wall site.
 * The image wall and archive remain self-contained so the existing homepage
 * sections, upload records, and anchors continue to work unchanged.
 */
export default function PersonalDriftWallStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const [selected, setSelected] = useState(null)
  const [marketSelection, setMarketSelection] = useState(null)
  const [layout, setLayout] = useState('original')
  const [originalItems, setOriginalItems] = useState(() => pickOriginalDemoItems(personalArchiveItems))
  const isOriginal = layout === 'original'
  const archiveItems = useMemo(() => {
    const seen = new Set(personalArchiveItems.map(item => item.image))
    const additions = []
    uploadedImages.forEach(item => {
      if (!item?.src || item.sessionOnly || seen.has(item.src)) return
      seen.add(item.src)
      additions.push({
        image: item.src,
        title: item.prompt || item.label || '上传照片',
        number: PERSONAL_DRIFT_IMAGE_COUNT + additions.length + 1,
      })
    })
    return [...additions.reverse(), ...personalArchiveItems]
  }, [uploadedImages])
  // The moving wall only needs enough items to cover its five columns. Keeping
  // the full archive here duplicates hundreds of decoded images and makes the
  // browser's compositor unstable during a long browsing session.
  const wallItems = useMemo(() => {
    const baseItems = isOriginal ? originalItems : archiveItems
    const source = preview?.src
      ? [{ image: preview.src, title: preview.label || '本次预览' }, ...baseItems.filter(item => item.image !== preview.src)]
      : baseItems
    return source.slice(0, isOriginal ? ORIGINAL_DEMO_IMAGE_COUNT : WALL_IMAGE_LIMIT)
  }, [archiveItems, originalItems, isOriginal, preview])

  useEffect(() => {
    if (!selected) return undefined
    const onKeyDown = event => {
      if (event.key === 'Escape') setSelected(null)
    }
    document.body.classList.add('personal-drift-modal-open')
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('personal-drift-modal-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selected])

  return <section className={`personal-drift-wall-studio section-wrap is-${layout}`} id="personal-drift-wall" aria-labelledby="personal-drift-wall-title" data-personal-drift-wall data-drift-layout={layout} data-drift-image-count={wallItems.length} data-archive-count={archiveItems.length} data-preview-src={preview?.src || ''}>
    <div className="personal-drift-wall-hero">
      <div className="personal-drift-wall-copy">
        <p className="eyebrow">PERSONAL ARCHIVE · 2026</p>
        <h2 id="personal-drift-wall-title">把被保存下来的画面，<em>重新放回流动里。</em></h2>
        <p className="personal-drift-wall-lede">这是一个公开浏览的图像空间。225 张图片都可以点击预览，并且可以免费保存到本地。</p>
        <div className="personal-drift-wall-actions">
          <a className="personal-drift-wall-button" href="#personal-drift-archive">浏览档案 <span aria-hidden="true">↘</span></a>
          <span className="personal-drift-wall-count"><strong>{archiveItems.length}</strong> 张图像 · 一组持续更新的收藏</span>
        </div>
        <div className="personal-drift-upload-actions" role="group" aria-label="个人影像墙上传">
          <SessionImageUploadButton slot="personal-drift-wall" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
          <MobileUploadLinks />
        </div>
        <div className="personal-drift-mode-controls">
          <div className="personal-drift-mode-switch" role="group" aria-label="漂移墙显示方式">
            <button type="button" aria-pressed={isOriginal} onClick={() => setLayout('original')}>原版效果</button>
            <button type="button" aria-pressed={!isOriginal} onClick={() => setLayout('personal')}>个人布局</button>
          </div>
          {isOriginal && <button className="personal-drift-shuffle" type="button" onClick={() => setOriginalItems(pickOriginalDemoItems(archiveItems))}>换一组 16 张 <span aria-hidden="true">↻</span></button>}
        </div>
        <p className="personal-drift-wall-caption">{isOriginal ? '移动指针，抬起一张图并暂停所在列。按 Tab 也可以浏览。' : '移动指针，抬起一张图。按 Tab 也可以浏览。'}</p>
      </div>

      <div className="personal-drift-wall-stage" aria-label="漂移中的个人图像墙">
        <DriftWall
          key={layout}
          items={wallItems}
          {...(isOriginal ? ORIGINAL_DEMO_PROPS : PERSONAL_LAYOUT_PROPS)}
          className={isOriginal ? 'personal-drift-wall-original-effect' : 'personal-drift-wall-effect'}
        />
        {!isOriginal && <div className="personal-drift-wall-edge-note">DRIFT WALL / 01—{archiveItems.length}</div>}
      </div>
    </div>

    <div className="personal-drift-archive" id="personal-drift-archive">
      <div className="personal-drift-archive-heading">
        <div>
          <p className="personal-drift-eyebrow">THE ARCHIVE</p>
          <h3>慢慢看，每一张都有自己的停顿。</h3>
        </div>
        <p>图片墙是入口，下面的档案才是可以逐张靠近的地方。点击任意一张查看大图，按 Esc 返回。</p>
      </div>
      <div className="personal-drift-archive-grid">
        {archiveItems.map(item => <button
          className="personal-drift-archive-card"
          type="button"
          key={item.image}
          onClick={() => setSelected(item)}
          aria-label={`查看${item.title}`}
        >
          <span className="personal-drift-archive-card-image">
            <img src={item.image} alt="" loading="lazy" decoding="async" />
          </span>
          <span className="personal-drift-archive-card-meta">
            <span>{String(item.number).padStart(3, '0')}</span>
            <span>OPEN ↗</span>
          </span>
        </button>)}
      </div>
      <PersonalCardMarket cards={archiveItems.filter(item => item.rewardUrl)} initialCard={marketSelection} />
    </div>

    {selected && <div className="personal-drift-modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
      <div className="personal-drift-image-modal" role="dialog" aria-modal="true" aria-label={selected.title} onClick={event => event.stopPropagation()}>
        <button className="personal-drift-modal-close" type="button" onClick={() => setSelected(null)} aria-label="关闭大图">×</button>
        <img src={selected.image} alt={selected.title} loading="lazy" decoding="async" />
        <div className="personal-drift-modal-label">
          <span>{selected.title}</span>
          {selected.rewardUrl ? <button type="button" onClick={() => {
            setMarketSelection(selected)
            setSelected(null)
            window.setTimeout(() => document.querySelector('#card-market')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
          }}>前往免费保存 ↘</button> : <span>仅供公开预览</span>}
        </div>
      </div>
    </div>}
  </section>
}
