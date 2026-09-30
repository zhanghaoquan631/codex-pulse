import { useEffect, useMemo, useState } from 'react'
import PixelSwap from './PixelSwap'
import { personalArchiveItems } from './PersonalDriftWallStudio'
import MobileUploadLinks from './MobileUploadLinks'
import ViewportCanvas from './ViewportCanvas'
import './PixelSwapStudio.css'

function SplitImage({ item }) {
  const [size, setSize] = useState(null)
  const [error, setError] = useState(false)
  const [active, setActive] = useState(false)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    let disposed = false
    const image = new Image()
    image.onload = () => { if (!disposed) setSize({ width: image.naturalWidth, height: image.naturalHeight }) }
    image.onerror = () => { if (!disposed) setError(true) }
    image.src = item.src
    return () => { disposed = true; image.onload = null; image.onerror = null }
  }, [item.src])
  const half = bottom => <div className={`pixel-swap-photo-half${bottom ? ' is-bottom' : ''}`}>
    <img src={item.src} alt={`${item.label} · ${bottom ? '下' : '上'}半部分`} draggable="false" />
  </div>
  return <>
    <div className="pixel-swap-photo-control" role="button" tabIndex={0}
      aria-label="像素交换图片：鼠标移入查看下半部分，移出恢复；点击或按回车切换"
      aria-pressed={active} aria-disabled={!size || error}
      onPointerEnter={event => { if (event.pointerType === 'mouse' && size) setActive(true) }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(false) }}
      onClick={() => { if (size) setActive(value => !value) }}
      onBlur={() => setActive(false)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (size) setActive(value => !value) }
      }}>
      {size ? <PixelSwap firstContent={half(false)} secondContent={half(true)}
        trigger="manual" active={active} onComplete={setShown}
        aspectRatio={`${size.width} / ${size.height / 2}`} />
        : <div className="pixel-swap-photo-placeholder" role="status">{error ? '图片加载失败，请随机换一张或重新上传。' : '正在读取图片…'}</div>}
    </div>
    <div className="pixel-swap-photo-caption"><span aria-live="polite">{shown ? '02 / 下半部分' : '01 / 上半部分'}</span><span>移入切换 · 移出还原</span></div>
  </>
}

export default function PixelSwapStudio({ uploadedImages = [], preview }) {
  const candidates = useMemo(() => {
    const items = personalArchiveItems.map(item => ({ src: item.image, label: `影像 ${String(item.number).padStart(3, '0')}` }))
    const seen = new Set(items.map(item => item.src))
    for (const item of uploadedImages) {
      if (!item?.src || item.sessionOnly || seen.has(item.src)) continue
      seen.add(item.src)
      items.push({ src: item.src, label: item.label || item.prompt || '上传图片' })
    }
    return items
  }, [uploadedImages])
  const [selected, setSelected] = useState(() => candidates[0])
  const [overridePreview, setOverridePreview] = useState(false)
  useEffect(() => setOverridePreview(false), [preview?.src])
  const current = preview?.src && !overridePreview ? { src: preview.src, label: preview.label || '上传图片' } : selected
  const randomize = () => {
    const choices = candidates.filter(item => item.src !== current?.src)
    if (!choices.length) return
    setSelected(choices[Math.floor(Math.random() * choices.length)])
    setOverridePreview(true)
  }
  return <section id="pixel-swap" className="pixel-swap-studio section-wrap" aria-labelledby="pixel-swap-studio-title"
    data-pixel-swap-count={candidates.length} data-pixel-swap-src={current?.src || ''}>
    <div className="pixel-swap-studio-copy">
      <p className="eyebrow">PIXEL SWAP</p>
      <h2 id="pixel-swap-studio-title">轻轻掠过，<br />看见影像的另一面。</h2>
      <p>一张图片，两种画面。先看上半部分，鼠标移入，像素逐格展开下半部分；移开，再回到最初的画面。</p>
      <button className="pixel-swap-random-button" type="button" onClick={randomize} disabled={candidates.length < 2}>
        <span>随机生成一张</span><b aria-hidden="true">↻</b>
      </button>
      <p className="pixel-swap-selection" aria-live="polite">{current?.label} · 素材池 {candidates.length} 张</p>
      <div className="pixel-swap-upload-actions" role="group" aria-label="像素交换上传">
        <p>上传一张上下拼接图，自动分成两面</p>
        <div data-session-upload-target="pixel-swap" />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="pixel-swap-studio-visual">
      <ViewportCanvas className="pixel-swap-studio-stage" data-media-slot="pixel-swap">
        {current && <SplitImage key={current.src} item={current} />}
      </ViewportCanvas>
      <p className="pixel-swap-tip">手机轻点切换 · 键盘 Enter / 空格切换 · 随机生成从图库抽取图片</p>
    </div>
  </section>
}
