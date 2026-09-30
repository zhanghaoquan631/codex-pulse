import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import './ModalCards.css'

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

const DEFAULT_GRADIENT = '#6366f1'

const DEFAULT_CARDS = [
  { id: 'modal-default-01', title: 'Mountain Vista', description: 'A quiet frame opens into a larger story.', gradientColor: '#6366f1' },
  { id: 'modal-default-02', title: 'Ocean Waves', description: 'A small card with room for the horizon.', gradientColor: '#06b6d4' },
  { id: 'modal-default-03', title: 'Forest Path', description: 'Follow the texture beyond the first glance.', gradientColor: '#22c55e' },
]

const SPEED_DURATION = {
  slow: 820,
  normal: 560,
  fast: 320,
  none: 0,
}

const normaliseCards = (cards, gradientColor) => {
  const sourceCards = Array.isArray(cards) && cards.length ? cards : DEFAULT_CARDS
  return sourceCards.map((item, index) => {
    const source = typeof item === 'string' ? { imageUrl: item } : (item || {})
    return {
      id: String(source.id || `modal-card-${index + 1}`),
      imageUrl: String(source.imageUrl || source.image || source.src || source.url || '').trim(),
      title: String(source.title || source.label || `CARD / ${String(index + 1).padStart(2, '0')}`),
      description: String(source.description || source.copy || source.meta || 'Open for the full frame.'),
      gradientColor: String(source.gradientColor || source.color || gradientColor || DEFAULT_GRADIENT),
    }
  })
}

const safeToken = value => String(value || 'card').replace(/[^a-zA-Z0-9_-]/g, '-')

/**
 * A local clean-room implementation of the public Modal Cards interaction:
 * cards expand into an accessible full-screen modal with scale/fade/slide
 * entry variants. No protected React Bits Pro source or demo assets are used.
 */
export default function ModalCards({
  cards = DEFAULT_CARDS,
  className = '',
  gradientColor = DEFAULT_GRADIENT,
  animationSpeed = 'normal',
  springStiffness,
  springDamping,
  animationVariant = 'scale',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  ariaLabel = 'Card details modal',
  backdropGradientPosition = '50% 10%',
  modalClassName = '',
  backdropClassName = '',
  onOpen,
  onClose,
}) {
  const rootRef = useRef(null)
  const modalRef = useRef(null)
  const closeButtonRef = useRef(null)
  const previousFocusRef = useRef(null)
  const closeTimerRef = useRef(null)
  const [selectedId, setSelectedId] = useState(null)
  const [closing, setClosing] = useState(false)

  const normalizedCards = useMemo(() => normaliseCards(cards, gradientColor), [cards, gradientColor])
  const selectedCard = normalizedCards.find(card => card.id === selectedId) || null
  const variant = ['scale', 'fade', 'slide'].includes(animationVariant) ? animationVariant : 'scale'
  const speed = ['slow', 'normal', 'fast', 'none'].includes(animationSpeed) ? animationSpeed : 'normal'
  const duration = SPEED_DURATION[speed]
  const stiffness = clamp(Number.isFinite(Number(springStiffness)) ? Number(springStiffness) : 260, 80, 700)
  const damping = clamp(Number.isFinite(Number(springDamping)) ? Number(springDamping) : 24, 4, 80)
  const springScale = clamp(1 + (stiffness - 260) / 1700 - (damping - 24) / 900, .98, 1.08)

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (!selectedCard) return undefined
    const previousOverflow = document.body.style.overflow
    const previouslyFocused = previousFocusRef.current
    document.body.style.overflow = 'hidden'

    const focusTimer = window.setTimeout(() => {
      if (showCloseButton) closeButtonRef.current?.focus()
      else modalRef.current?.focus()
    }, duration ? 28 : 0)

    const handleKeyDown = event => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault()
        closeModal('escape')
        return
      }
      if (event.key !== 'Tab' || !modalRef.current) return
      const focusable = [...modalRef.current.querySelectorAll('button, a, [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
      if (!focusable.length) {
        event.preventDefault()
        modalRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        window.setTimeout(() => previouslyFocused.focus(), 0)
      }
    }
  }, [closeOnEscape, duration, selectedCard, showCloseButton])

  const openCard = useCallback((card, event) => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    previousFocusRef.current = event.currentTarget
    setClosing(false)
    setSelectedId(card.id)
    onOpen?.(card)
  }, [onOpen])

  const closeModal = useCallback((reason = 'close') => {
    if (!selectedId || closing) return
    onClose?.(reason)
    setClosing(true)
    if (!duration) {
      setSelectedId(null)
      setClosing(false)
      return
    }
    closeTimerRef.current = window.setTimeout(() => {
      setSelectedId(null)
      setClosing(false)
      closeTimerRef.current = null
    }, duration)
  }, [closing, duration, onClose, selectedId])

  const rootStyle = {
    '--modal-duration': `${duration}ms`,
    '--modal-spring-scale': springScale,
    '--modal-spring-stiffness': stiffness,
    '--modal-spring-damping': damping,
    '--modal-backdrop-position': backdropGradientPosition || '50% 10%',
  }

  const modalTitleId = selectedCard ? `modal-card-title-${safeToken(selectedCard.id)}` : undefined
  const modalDescriptionId = selectedCard ? `modal-card-description-${safeToken(selectedCard.id)}` : undefined

  return <div
    ref={rootRef}
    className={['modal-cards', className].filter(Boolean).join(' ')}
    style={rootStyle}
    data-modal-cards="true"
    data-modal-cards-ready="true"
    data-modal-card-count={normalizedCards.length}
    data-modal-open={selectedCard ? 'true' : 'false'}
    data-modal-selected-id={selectedCard?.id || ''}
    data-modal-closing={closing ? 'true' : 'false'}
    data-modal-animation-variant={variant}
    data-modal-animation-speed={speed}
    data-modal-close-on-backdrop={closeOnBackdropClick ? 'true' : 'false'}
    data-modal-close-on-escape={closeOnEscape ? 'true' : 'false'}
  >
    <div className="modal-cards__grid" role="list" aria-label="Expandable image cards">
      {normalizedCards.map((card, index) => <button
        key={card.id}
        type="button"
        className="modal-cards__card"
        style={{ '--modal-card-gradient': card.gradientColor, '--modal-card-index': index }}
        aria-label={`打开 ${card.title}`}
        onClick={event => openCard(card, event)}
        data-modal-card={card.id}
        data-modal-card-index={index}
      >
        <span className="modal-cards__card-image" aria-hidden="true">
          {card.imageUrl ? <img src={card.imageUrl} alt="" draggable="false" loading="lazy" decoding="async" /> : <span className="modal-cards__card-art" />}
        </span>
        <span className="modal-cards__card-wash" aria-hidden="true" />
        <span className="modal-cards__card-gridline" aria-hidden="true" />
        <span className="modal-cards__card-copy">
          <small>{String(index + 1).padStart(2, '0')} / OPEN FRAME</small>
          <strong>{card.title}</strong>
          <span>{card.description}</span>
          <i aria-hidden="true">↗</i>
        </span>
      </button>)}
    </div>

    {selectedCard && <div
      className={['modal-cards__backdrop', backdropClassName].filter(Boolean).join(' ')}
      role="presentation"
      onClick={event => {
        if (closeOnBackdropClick && event.target === event.currentTarget) closeModal('backdrop')
      }}
      data-modal-backdrop
    >
      <div
        ref={modalRef}
        className={['modal-cards__modal', modalClassName].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={modalTitleId}
        aria-describedby={modalDescriptionId}
        tabIndex={-1}
        data-modal-variant={variant}
        data-modal-state={closing ? 'closing' : 'open'}
        style={{ '--modal-card-gradient': selectedCard.gradientColor }}
      >
        <div className="modal-cards__modal-media">
          {selectedCard.imageUrl ? <img src={selectedCard.imageUrl} alt={selectedCard.title} draggable="false" loading="lazy" decoding="async" /> : <span className="modal-cards__modal-art" aria-hidden="true" />}
          <span className="modal-cards__modal-glow" aria-hidden="true" />
          <span className="modal-cards__modal-index" aria-hidden="true">FRAME / {String(normalizedCards.findIndex(card => card.id === selectedCard.id) + 1).padStart(2, '0')}</span>
        </div>
        <div className="modal-cards__modal-content">
          <small className="modal-cards__modal-kicker">EXPANDED CARD · LOCAL ARCHIVE</small>
          <h2 id={modalTitleId}>{selectedCard.title}</h2>
          <p id={modalDescriptionId}>{selectedCard.description}</p>
          <span className="modal-cards__modal-rule" aria-hidden="true" />
          <span className="modal-cards__modal-note">CLICK BACKDROP OR PRESS ESC TO CLOSE</span>
        </div>
        {showCloseButton && <button
          ref={closeButtonRef}
          type="button"
          className="modal-cards__close"
          aria-label="关闭卡片详情"
          onClick={() => closeModal('button')}
          data-modal-close
        >×</button>}
      </div>
    </div>}
  </div>
}
