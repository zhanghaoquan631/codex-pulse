import { useEffect, useMemo, useRef, useState } from 'react'
import './DepthCard.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const finite = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function cssSize(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`
  if (typeof value === 'string' && value.trim()) return value
  return fallback
}

function safeRadius(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.max(0, value)}px`
  if (typeof value === 'string' && value.trim()) return value
  return '10px'
}

function layerDepth(value, fallback = 1) {
  return clamp(finite(value, fallback), 0, 4)
}

/**
 * Clean-room perspective card based on the public Depth Card behavior.
 * The image layers, tilt math, spotlight, and reveal timing are authored
 * locally and do not depend on the protected React Bits Pro implementation.
 */
export default function DepthCard({
  image,
  title = '',
  description,
  width = 240,
  height = 320,
  maxRotation = 20,
  maxTranslation = 20,
  borderRadius = '10px',
  className = '',
  contentClassName = '',
  onClick,
  href,
  target = '_self',
  imageAlt,
  disableOnMobile = false,
  ariaLabel,
  layers,
  staggerDelay = 100,
  revealAnimation = 'slide',
  respectReducedMotion = true,
  spotlight = true,
  spotlightColor = 'rgba(255, 255, 255, 0.5)',
  children,
  style,
  ...rest
}) {
  const wrapperRef = useRef(null)
  const surfaceRef = useRef(null)
  const [active, setActive] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [mobilePointer, setMobilePointer] = useState(false)
  const radius = safeRadius(borderRadius)
  const rotationLimit = clamp(finite(maxRotation, 20), 0, 90)
  const translationLimit = clamp(finite(maxTranslation, 20), 0, 160)
  const delay = clamp(finite(staggerDelay, 100), 0, 2000)
  const motionDisabled = (respectReducedMotion && reducedMotion) || (disableOnMobile && mobilePointer)

  const normalizedReveal = ['slide', 'fade', 'scale', 'none'].includes(revealAnimation)
    ? revealAnimation
    : 'slide'
  const imageLayers = useMemo(() => {
    if (Array.isArray(layers) && layers.length) {
      const validLayers = layers.filter(layer => layer && typeof layer.image === 'string' && layer.image).map((layer, index) => ({
        image: layer.image,
        depth: layerDepth(layer.depth, index === 0 ? 1 : 0.55),
      }))
      if (validLayers.length) return validLayers
    }
    return image ? [{ image, depth: 1 }] : []
  }, [image, layers])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const coarse = window.matchMedia?.('(hover: none), (pointer: coarse)')
    const sync = () => {
      setReducedMotion(Boolean(query?.matches))
      setMobilePointer(Boolean(coarse?.matches))
    }
    sync()
    query?.addEventListener?.('change', sync)
    coarse?.addEventListener?.('change', sync)
    return () => {
      query?.removeEventListener?.('change', sync)
      coarse?.removeEventListener?.('change', sync)
    }
  }, [])

  useEffect(() => {
    const wrapper = wrapperRef.current
    const surface = surfaceRef.current
    if (!wrapper || !surface) return undefined

    const reset = () => {
      surface.style.setProperty('--depth-rotate-x', '0deg')
      surface.style.setProperty('--depth-rotate-y', '0deg')
      surface.style.setProperty('--depth-shift-x', '0px')
      surface.style.setProperty('--depth-shift-y', '0px')
      surface.style.setProperty('--depth-pointer-x', '50%')
      surface.style.setProperty('--depth-pointer-y', '50%')
    }
    reset()
    return () => reset()
  }, [])

  const updatePointer = event => {
    const wrapper = wrapperRef.current
    const surface = surfaceRef.current
    if (!wrapper || !surface || motionDisabled) return
    const rect = wrapper.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const px = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const py = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    const rotateX = (0.5 - py) * rotationLimit * 2
    const rotateY = (px - 0.5) * rotationLimit * 2
    const translateX = -(px - 0.5) * translationLimit * 2
    const translateY = (0.5 - py) * translationLimit * 2
    surface.style.setProperty('--depth-rotate-x', `${rotateX.toFixed(3)}deg`)
    surface.style.setProperty('--depth-rotate-y', `${rotateY.toFixed(3)}deg`)
    surface.style.setProperty('--depth-shift-x', `${translateX.toFixed(3)}px`)
    surface.style.setProperty('--depth-shift-y', `${translateY.toFixed(3)}px`)
    surface.style.setProperty('--depth-pointer-x', `${(px * 100).toFixed(2)}%`)
    surface.style.setProperty('--depth-pointer-y', `${(py * 100).toFixed(2)}%`)
  }

  const handleEnter = event => {
    setActive(true)
    updatePointer(event)
  }

  const handleLeave = () => {
    setActive(false)
    const surface = surfaceRef.current
    if (!surface) return
    surface.style.setProperty('--depth-rotate-x', '0deg')
    surface.style.setProperty('--depth-rotate-y', '0deg')
    surface.style.setProperty('--depth-shift-x', '0px')
    surface.style.setProperty('--depth-shift-y', '0px')
    surface.style.setProperty('--depth-pointer-x', '50%')
    surface.style.setProperty('--depth-pointer-y', '50%')
  }

  const wrapperTag = href ? 'a' : onClick ? 'button' : 'div'
  const Wrapper = wrapperTag

  const handleKeyDown = event => {
    if (!onClick || href || wrapperTag === 'button') return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onClick(event)
  }

  const wrapperProps = {
    ...rest,
    ref: wrapperRef,
    className: `depth-card ${className}`.trim(),
    style: {
      width: cssSize(width, '240px'),
      height: cssSize(height, '320px'),
      borderRadius: radius,
      overflow: 'hidden',
      ...style,
    },
    'data-depth-card': 'true',
    'data-depth-active': active ? 'true' : 'false',
    'data-depth-motion': motionDisabled ? 'reduced' : 'full',
    'data-depth-reveal': normalizedReveal,
    'aria-label': ariaLabel || (title ? `${title} card` : undefined),
    onPointerEnter: handleEnter,
    onPointerMove: updatePointer,
    onPointerLeave: handleLeave,
    onFocus: () => setActive(true),
    onBlur: () => setActive(false),
    onKeyDown: handleKeyDown,
    onClick: onClick || undefined,
  }
  if (wrapperTag === 'a') {
    wrapperProps.href = href
    wrapperProps.target = target
    if (target === '_blank') wrapperProps.rel = 'noreferrer'
  }
  if (wrapperTag === 'button') wrapperProps.type = 'button'
  if (wrapperTag === 'div' && onClick) {
    wrapperProps.role = 'button'
    wrapperProps.tabIndex = 0
  }

  return <Wrapper {...wrapperProps}>
    <div
      ref={surfaceRef}
      className="depth-card__surface"
      style={{
        borderRadius: radius,
        '--depth-radius': radius,
        '--depth-stagger': `${delay}ms`,
        '--depth-spotlight-color': spotlightColor,
      }}
    >
      <div className="depth-card__media" style={{ borderRadius: radius }} aria-hidden={imageLayers.length ? undefined : 'true'}>
        {imageLayers.map((layer, index) => <img
          key={`${layer.image}-${index}`}
          className="depth-card__image"
          src={layer.image}
          loading="lazy"
          decoding="async"
          alt={index === 0 ? (imageAlt || title || '') : ''}
          draggable="false"
          style={{
            '--depth-layer': layer.depth,
            zIndex: index,
          }}
        />)}
      </div>
      {spotlight && <div className="depth-card__spotlight" aria-hidden="true" />}
      <div className={`depth-card__content ${contentClassName}`.trim()}>
        {title && <h3>{title}</h3>}
        {description && <p>{description}</p>}
        {children}
      </div>
    </div>
  </Wrapper>
}
