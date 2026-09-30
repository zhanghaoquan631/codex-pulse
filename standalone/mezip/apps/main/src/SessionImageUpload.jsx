import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import './SessionImageUpload.css'

const SLOT_LABELS = {
  'infinite-gallery': '无限画廊',
  'halftone-reveal': '半色调显影',
  'orbit-images': '轨道图片',
  'personal-drift-wall': '个人影像墙',
  'tumble-carousel': '翻滚旋转木马',
  'warped-card': '扭曲卡片',
  'chroma-card': '色度卡片',
  'circle-gallery': '圆环画廊',
  'comparison-slider': '比较滑块',
  'depth-card': '深度卡片',
  'lenticular-carousel': '透镜旋转木马',
  'page-flip': '翻页卡片',
  'parallax-carousel': '视差旋转木马',
  'parallax-cards': '视差卡片',
  'reel-gallery': '胶片画廊',
  'scroll-stack': '滚动堆栈',
  'gradient-carousel': '渐变旋转木马',
  'liquid-swap': '液态换图',
  'pixel-swap': '像素交换',
  'magic-transform': '魔法变形',
  'modal-cards': '模态卡片',
  'pixel-reveal': '像素显影',
  'pixelate-hover': '像素悬停',
  'rotating-cards': '旋转卡片',
  'gradual-blur': '渐变模糊',
  'ripple-distortion': '波纹失真',
  'elastic-mesh': '弹性网格',
}

const isUploadableSlot = slot => Boolean(SLOT_LABELS[slot])

function sameSlots(first, second) {
  return first.length === second.length && first.every((item, index) => item.slot === second[index]?.slot && item.node === second[index]?.node && item.inline === second[index]?.inline)
}

export function SessionImageUploadButton({ slot, preview, onChange, onClear, inline = false }) {
  const inputRef = useRef(null)
  const label = SLOT_LABELS[slot] || '图片模板'
  const inputId = `session-image-upload-${slot}`

  const handleChange = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const isImage = file && (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.name))
    if (!isImage) return
    onChange(slot, {
      src: URL.createObjectURL(file),
      label: file.name,
      sessionOnly: true,
    })
  }

  return (
    <div className={`session-image-upload-control${inline ? ' is-inline' : ''}`} data-session-image-upload={slot}>
      <button type="button" className="session-image-upload-button" onClick={() => inputRef.current?.click()} title={`仅在本次浏览中预览到${label}`}>
        <span aria-hidden="true">＋</span>
        {preview ? '更换照片' : '上传照片'}
      </button>
      <input ref={inputRef} id={inputId} aria-label={`选择${label}照片`} className="session-image-upload-input" type="file" accept="image/*" onChange={handleChange} />
      {preview ? (
        <button className="session-image-clear-button" type="button" onClick={() => onClear(slot)} aria-label={`恢复${label}原始图片`}>
          恢复原图
        </button>
      ) : null}
      {preview ? <span className="session-image-upload-status" aria-live="polite">{preview.persisted ? '已保存到网站图片库' : preview.remoteKind === 'guest' ? '临时分享 · 到期自动清除' : '本次预览 · 不会上传保存'}</span> : null}
    </div>
  )
}

/**
 * Adds a small uploader beside every image-driven studio without changing
 * the template layouts. Files are represented by object URLs in React state;
 * no request is made and the URL is revoked by App when it is replaced or
 * the page is unloaded.
 */
export default function SessionImageUploadOverlays({ previews = {}, onChange, onClear }) {
  const [slots, setSlots] = useState([])

  useEffect(() => {
    const collect = () => {
      const directSlots = Array.from(document.querySelectorAll('[data-session-upload-target]'))
        .map(node => ({ node, slot: node.dataset.sessionUploadTarget || '', inline: true }))
        .filter(item => isUploadableSlot(item.slot))
      const directSlotNames = new Set(directSlots.map(item => item.slot))
      const next = [
        ...Array.from(document.querySelectorAll('[data-media-slot]'))
        .map(node => ({ node, slot: node.dataset.mediaSlot || '', inline: false }))
        // Tumble Carousel renders the same local uploader beside its two phone
        // upload entries so all three ways of adding an image stay together.
        .filter(item => isUploadableSlot(item.slot) && !directSlotNames.has(item.slot) && item.slot !== 'orbit-images' && item.slot !== 'tumble-carousel' && item.slot !== 'warped-card' && item.slot !== 'chroma-card' && item.slot !== 'circle-gallery' && item.slot !== 'comparison-slider' && item.slot !== 'depth-card' && item.slot !== 'lenticular-carousel' && item.slot !== 'page-flip' && item.slot !== 'parallax-carousel' && item.slot !== 'parallax-cards' && item.slot !== 'reel-gallery' && item.slot !== 'scroll-stack'),
        ...directSlots,
      ]
      setSlots(current => sameSlots(current, next) ? current : next)
    }
    collect()
    const root = document.getElementById('main-content') || document.body
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(collect)
    observer?.observe(root, { childList: true, subtree: true })
    window.addEventListener('resize', collect)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', collect)
    }
  }, [])

  const portals = useMemo(() => slots.map(({ node, slot, inline }) => createPortal(
    <SessionImageUploadButton
      key={slot}
      slot={slot}
      preview={previews[slot]}
      onChange={onChange}
      onClear={onClear}
      inline={inline}
    />,
    node,
    `session-upload-${slot}`
  )), [onChange, onClear, previews, slots])

  return portals
}
