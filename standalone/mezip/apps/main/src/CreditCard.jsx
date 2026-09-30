import { useCallback, useEffect, useRef, useState } from 'react'

import './CreditCard.css'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function formatCardNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 19)
  if (!digits) return '•••• •••• •••• ••••'
  return digits.match(/.{1,4}/g)?.join(' ') || digits
}

/**
 * Local clean-room implementation of the public Credit Card interaction
 * contract: a 3D tilt/parallax card that flips to a CVV back face.
 */
export default function CreditCard({
  cardNumber = '1234 5678 9012 3456',
  cardholderName = 'JOHN DOE',
  expirationDate = '12/25',
  cvv = '123',
  cardLogo,
  chipImage,
  background = 'linear-gradient(135deg, #272727 0%, #111111 55%, #050505 100%)',
  textColor = '#ffffff',
  hasTextShadow = true,
  scale = 1,
  rotationIntensity = 1,
  parallaxIntensity = 1,
  scaleOnHover = 1.05,
  showShine = true,
  showShadow = true,
  borderRadius = 16,
  showActionButtons = false,
  className = '',
  cardClassName = '',
  buttonsClassName = '',
  onFlip,
  reducedMotion = false,
}) {
  const sceneRef = useRef(null)
  const [flipped, setFlipped] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [motionReduced, setMotionReduced] = useState(false)
  const transformRef = useRef({ x: 0, y: 0, px: 0, py: 0 })

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const sync = () => setMotionReduced(Boolean(query?.matches))
    sync()
    query?.addEventListener?.('change', sync)
    return () => query?.removeEventListener?.('change', sync)
  }, [])

  const motionIsReduced = Boolean(reducedMotion || motionReduced)
  const safeRotation = clamp(Number(rotationIntensity) || 0, 0, 2)
  const safeParallax = clamp(Number(parallaxIntensity) || 0, 0, 2)
  const safeScale = clamp(Number(scale) || 1, 0.6, 2)
  const safeHoverScale = clamp(Number(scaleOnHover) || 1, 0.8, 1.25)
  const safeRadius = clamp(Number(borderRadius) || 16, 0, 40)

  const setCardMotion = useCallback((next) => {
    transformRef.current = next
    const scene = sceneRef.current
    if (!scene) return
    scene.style.setProperty('--credit-rotate-x', `${next.x}deg`)
    scene.style.setProperty('--credit-rotate-y', `${next.y}deg`)
    scene.style.setProperty('--credit-parallax-x', `${next.px}px`)
    scene.style.setProperty('--credit-parallax-y', `${next.py}px`)
    scene.style.setProperty('--credit-shine-x', `${50 + next.px * 2}%`)
    scene.style.setProperty('--credit-shine-y', `${50 + next.py * 2}%`)
  }, [])

  const handlePointerMove = useCallback((event) => {
    if (motionIsReduced) return
    const scene = sceneRef.current
    if (!scene) return
    const rect = scene.getBoundingClientRect()
    const nx = clamp((event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1, -1, 1)
    const ny = clamp((event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1, -1, 1)
    setCardMotion({
      x: -ny * 11 * safeRotation,
      y: nx * 13 * safeRotation,
      px: nx * 9 * safeParallax,
      py: ny * 7 * safeParallax,
    })
  }, [motionIsReduced, safeParallax, safeRotation, setCardMotion])

  const handlePointerEnter = useCallback(() => {
    setHovered(true)
  }, [])

  const resetMotion = useCallback(() => {
    setHovered(false)
    setCardMotion({ x: 0, y: 0, px: 0, py: 0 })
  }, [setCardMotion])

  const toggleFlip = useCallback(() => {
    setFlipped(previous => {
      const next = !previous
      onFlip?.(next)
      return next
    })
  }, [onFlip])

  const handleKeyDown = useCallback((event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggleFlip()
  }, [toggleFlip])

  const rootStyle = {
    '--credit-background': background,
    '--credit-text': textColor,
    '--credit-radius': `${safeRadius}px`,
    '--credit-base-scale': safeScale,
    '--credit-hover-scale': safeScale * safeHoverScale,
    '--credit-text-shadow': hasTextShadow ? '0 1px 2px rgba(0,0,0,.42)' : 'none',
  }

  return <div
    className={`credit-card ${className}`.trim()}
    style={rootStyle}
    data-credit-card
    data-credit-card-flipped={flipped ? 'true' : 'false'}
    data-credit-card-holder={cardholderName}
    data-credit-card-number={formatCardNumber(cardNumber)}
    data-credit-card-expiration={expirationDate}
    data-credit-card-motion={motionIsReduced ? 'reduced' : 'interactive'}
  >
    <div
      ref={sceneRef}
      className={`credit-card__scene ${hovered ? 'is-hovered' : ''} ${flipped ? 'is-flipped' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={flipped ? '信用卡背面，点击翻回正面' : `信用卡正面，持卡人 ${cardholderName}，点击翻面`}
      aria-pressed={flipped}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetMotion}
      onClick={toggleFlip}
      onKeyDown={handleKeyDown}
    >
      <div className={`credit-card__tilt ${cardClassName}`.trim()} data-credit-card-tilt>
        {showShadow && <div className="credit-card__shadow" aria-hidden="true" />}
        <div className="credit-card__inner">
          <div className="credit-card__face credit-card__face--front" aria-hidden={flipped}>
            <div className="credit-card__shine" aria-hidden="true" data-visible={showShine ? 'true' : 'false'} />
            <div className="credit-card__topline">
              <span className="credit-card__brand">CORTEX</span>
              {cardLogo
                ? <img className="credit-card__logo" src={cardLogo} alt="" />
                : <span className="credit-card__contactless" aria-hidden="true">)))</span>}
            </div>
            <div className="credit-card__chip-row">
              {chipImage
                ? <img className="credit-card__chip" src={chipImage} alt="" />
                : <span className="credit-card__chip" aria-hidden="true"><i /><i /><i /><i /></span>}
            </div>
            <p className="credit-card__number">{formatCardNumber(cardNumber)}</p>
            <div className="credit-card__meta">
              <div>
                <span>CARDHOLDER</span>
                <strong>{cardholderName}</strong>
              </div>
              <div>
                <span>EXPIRES</span>
                <strong>{expirationDate}</strong>
              </div>
            </div>
          </div>

          <div className="credit-card__face credit-card__face--back" aria-hidden={!flipped}>
            <div className="credit-card__back-copy">CORTEX MEMBER CARD</div>
            <div className="credit-card__mag-stripe" aria-hidden="true" />
            <div className="credit-card__signature-row">
              <div className="credit-card__signature">AUTHORIZED SIGNATURE</div>
              <div className="credit-card__cvv"><span>CVV</span><strong>{cvv}</strong></div>
            </div>
            <p className="credit-card__back-note">This is a demonstration card. No payment data is processed.</p>
          </div>
        </div>
      </div>
    </div>
    {showActionButtons && <div className={`credit-card__actions ${buttonsClassName}`.trim()}>
      <button type="button" onClick={toggleFlip} aria-pressed={flipped} data-credit-card-flip>
        <span>{flipped ? '显示正面' : '翻转卡片'}</span><b aria-hidden="true">↻</b>
      </button>
      <span className="credit-card__action-hint">点击卡面或按钮翻转</span>
    </div>}
  </div>
}
