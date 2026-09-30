import PhotoMemoryGame from './PhotoMemoryGame'
import CursorEffects from './CursorEffects'
import ViewportCanvas from './ViewportCanvas'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { avatars, galleryShots, heroPhotos, photos, showcasePoster, showcaseVideo, wechatVideos } from './media'
import TextType from './TextType'
import SoundToggle from './SoundToggle'
import ScrollExpand from './ScrollExpand'
import RippleDistortion from './RippleDistortion'
import ElasticMesh from './ElasticMesh'
import HalftoneReveal from './HalftoneReveal'
import OrbitImages from './OrbitImages'
import TumbleCarousel from './TumbleCarousel'
import WarpedCard from './WarpedCard'
import ChromaCard from './ChromaCard'
import CircleGallery from './CircleGallery'
import ComparisonSlider from './ComparisonSlider'
import GradualBlur from './GradualBlur'
import CompleteSplitImage from './CompleteSplitImage'
import ClickSpark from './ClickSpark'
import Magnet from './Magnet'
import StickerPeel from './StickerPeel'
import Crosshair from './Crosshair'
import MaskedHeading from './MaskedHeading'
import LetterSwap3D from './LetterSwap3D'
import BlurHighlight from './BlurHighlight'
import TextScatter from './TextScatter'
import FallingText from './FallingText'
import FallingTextContent, { loadFallingText } from './FallingTextContent'
import Watercolor from './Watercolor'
import WireframeBall from './WireframeBall'
import DepthCard from './DepthCard'
import LenticularCarousel from './LenticularCarousel'
import PageFlip from './PageFlip'
import ParallaxCarousel from './ParallaxCarousel'
import ParallaxCardsStudio from './ParallaxCardsStudio'
import ReelGalleryStudio from './ReelGalleryStudio'
import ScrollStackStudio from './ScrollStackStudio'
import GradientCarouselStudio from './GradientCarouselStudio'
import LiquidSwapStudio from './LiquidSwapStudio'
import PixelSwapStudio from './PixelSwapStudio'
import MagicTransformStudio from './MagicTransformStudio'
import ModalCardsStudio from './ModalCardsStudio'
import PixelReveal from './PixelReveal'
import PixelateHover from './PixelateHover'
import RotatingCards from './RotatingCards'
import ShaderCard from './ShaderCard'
import ShaderReveal from './ShaderReveal'
import CreditCard from './CreditCard'
import PersonalDriftWallStudio, { personalArchiveItems } from './PersonalDriftWallStudio'
import InfiniteGallerySection from './InfiniteGallerySection'
import LinkedGalleryPreview from './LinkedGalleryPreview'
import SimpleGraphStudio from './SimpleGraphStudio'
import BookingStudio from './BookingStudio'
import SessionImageUploadOverlays, { SessionImageUploadButton } from './SessionImageUpload'
import MobileUploadLinks, { useMobileUploadPreview } from './MobileUploadLinks'
import { postViewOnce } from './pageviewClient'

const memoryMatchImages = personalArchiveItems.map(item => ({ src: item.image, label: item.title }))

const heroTitleTexts = ['超写实照片与影片', 'HYPERREAL PHOTOS AND FILM']
const heroDescriptionTexts = [
  'Cortex 在你的手机上生成电影质感的照片与视频，\n每一个结果都经过细致审核。',
  'CORTEX GENERATES FILM-QUALITY PHOTOS AND VIDEO\nON YOUR PHONE. EVERY RESULT IS CAREFULLY REVIEWED.',
]
const alexTexts = [
  'ALEX IS A PRODUCT DESIGNER WHO\nTHINKS ABOUT HOW HUMANS THINK.',
  'ALEX 是一位产品设计师，\n思考着人类如何思考。',
]

const rippleDefaultSource = 'https://images.unsplash.com/photo-1782977389500-dd7adad33ebe?q=80&w=3416&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D'
const halftoneDefaultSource = 'https://picsum.photos/seed/halftone-reveal/1200/800'
const gradualBlurDefaultSource = photos[0]
const ORBIT_IMAGE_COUNT = 6
const TUMBLE_CAROUSEL_ITEM_COUNT = 10
const WARPED_CARD_COUNT = 3
const CHROMA_CARD_COUNT = 3
const CIRCLE_GALLERY_ITEM_COUNT = 12
const COMPARISON_SLIDER_IMAGE_COUNT = 2
const PIXEL_REVEAL_IMAGE_COUNT = 3
const PIXELATE_HOVER_IMAGE_COUNT = 3
const ROTATING_CARD_IMAGE_COUNT = 10
const ENTRY_PRELOAD_SOURCES = heroPhotos.slice(0, 6)

function getImageCandidates(uploadedImages = []) {
  const seen = new Map()
  const uploads = Array.isArray(uploadedImages) ? uploadedImages : []
  const sessionPreview = uploads.find(item => item && typeof item === 'object' && item.sessionOnly && item.src)
  if (sessionPreview) {
    return [{
      src: sessionPreview.src,
      label: `本次预览 · ${sessionPreview.label || '上传图片'}`,
      slot: 'session',
      sessionOnly: true,
    }]
  }
  ;[...galleryShots, ...uploads].forEach((item, index) => {
    const src = typeof item === 'string' ? item : item?.src
    if (!src || typeof src !== 'string' || seen.has(src)) return
    const prompt = typeof item === 'object' ? item.prompt || item.label : ''
    seen.set(src, {
      src,
      label: prompt || `已加入影像 ${String(index + 1).padStart(2, '0')}`,
      slot: index + 1,
    })
  })
  return [...seen.values()]
}

function imageSourcesForSlot(slot, uploadedImages, sessionImages) {
  const preview = sessionImages?.[slot]
  return preview ? [preview] : uploadedImages
}

function shuffleImages(images) {
  const next = [...images]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

function sameImageOrder(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item.src === second[index]?.src)
}

const featureCards = [
  ['01', 'Trained on light', 'Tuned for the physical stuff — skin, fabric, lens falloff, grain. Frames behave like they came out of a camera, not a model.'],
  ['02', 'Reviewed by people', 'Every render passes a human review before it reaches you. Warped hands and melted text never make it to your library.'],
  ['03', 'Photo and film', 'Stills up to 4K and motion clips up to sixty seconds, from the same prompt. One idea, every format you post in.'],
  ['04', 'Phone-first', 'Describe, generate, keep. The whole loop runs on your phone and lands straight in your camera roll at full resolution.'],
]

const featureImages = [photos[0], photos[2], photos[4], photos[8]]

const processCards = [
  ['01', 'Describe the shot', 'Type what you see in your head. Lens, light, mood — Cortex speaks photography, so direct it like a DP.'],
  ['02', 'Generate takes', 'Cortex renders a set of takes in seconds, each one a different read on your prompt. Pick a direction, push it further.'],
  ['03', 'The review pass', 'Every take is inspected at full zoom before it reaches you. If a frame would not survive a close look, you never see it.'],
  ['04', 'Straight to camera roll', 'Approved frames land in your library at full resolution. No exports, no watermarks on paid plans, nothing to clean up.'],
]

const testimonials = [
  ['“I stopped explaining that it is AI. People just ask what camera I shoot with, and honestly I let them wonder.”', 'Lena Ortiz', 'Portrait photographer', avatars[0]],
  ['“The review pass is the whole product for me. I post what Cortex approves and it has never once embarrassed me.”', 'Theo Marchetti', 'Creator', avatars[1]],
  ['“Storyboards used to take my team a week of pulls and sketches. Now I walk into the room with finished frames.”', 'Amara Diallo', 'Art director', avatars[5]],
  ['“It does light the way light actually behaves. Falloff, bounce, color temperature. That is the entire game.”', 'Jonas Lindqvist', 'Director of photography', avatars[2]],
  ['“I cut a full mood film for a client pitch on the train ride to the meeting. They asked who shot it.”', 'Priya Raman', 'Brand designer', avatars[4]],
  ['“My camera roll finally looks like the inside of my head. Fewer frames than other apps give you, but every one lands.”', 'Marcus Cole', 'Stylist', avatars[3]],
]

const plans = [
  { name: 'Free', copy: 'Try the engine, keep your first frames.', price: 0, yearly: 0, note: 'free forever', list: ['20 generations per month', '1080p stills', '10-second clips', 'Standard review queue', 'Cortex mark on exports'], action: 'Get the app', shaderColor: '#ff5a36' },
  { name: 'Pro', copy: 'For creators who post every day.', price: 14, yearly: 11, note: 'billed monthly', list: ['1,000 generations per month', '4K stills', '30-second clips', 'Priority review queue', 'Clean exports, no mark', 'Full prompt history'], action: 'Start with Pro', recommended: true, shaderColor: '#c56cff' },
  { name: 'Studio', copy: 'For teams and heavy production use.', price: 32, yearly: 24, note: 'billed monthly', list: ['Everything in Pro', '60-second clips', 'Batch generation', '5 linked devices', 'Early access to new looks'], action: 'Start with Studio', shaderColor: '#20d6e8' },
]

const faqs = [
  ['What is Cortex?', 'Cortex is a mobile app that generates hyperrealistic photos and video from a written description. It runs the full loop on your phone: describe a shot, get a set of takes, and keep the frames that pass review.'],
  ['What does the review pass actually do?', 'Every generation is checked before it reaches your library — geometry, hands, eyes, text, and texture are inspected at full zoom. Frames that would fall apart under a close look are rejected and rerun. You see fewer results than other apps show you, and that is the point.'],
  ['Do I own what I generate?', 'Yes. Every frame and clip you keep is yours to use anywhere — personal, client, or commercial work. Cortex never resells or trains on your private generations.'],
  ['Can it generate real people?', 'Only with consent. You can build a likeness from your own face or from someone who has approved it inside the app. Prompts that target public figures or unconsented likenesses are declined at review.'],
  ['Which phones does it run on?', 'Cortex runs on iOS 17 or later and Android 13 or later. Generation happens in the cloud, so older devices work fine — you just need a connection.'],
  ['How long can the videos be?', 'Free plans render clips up to 10 seconds, Pro up to 30, and Studio up to 60. Every clip is reviewed frame by frame, the same as stills.'],
  ['Can I cancel anytime?', 'Yes. Cancel from the app in two taps. Your plan stays active until the end of the billing period, and everything you generated stays in your camera roll.'],
]

function useInView(ref, threshold = 0.18) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setShown(true)
    }, { threshold })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, threshold])
  return shown
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function useSectionProgress(ref) {
  const [progress, setProgress] = useState(0)
  const lastProgressRef = useRef(-1)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const element = ref.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      // A viewport-sized section has no internal scroll range. Treat its
      // progress as the distance it has travelled through the viewport rather
      // than immediately marking it complete after a small anchor offset.
      const scrollRange = element.offsetHeight - window.innerHeight
      const range = scrollRange > 1 ? scrollRange : Math.max(1, window.innerHeight)
      const next = clamp(-rect.top / range)
      // Scroll can fire more often than React needs to paint. Avoid a state
      // update for sub-pixel changes while keeping the progress bar/animation
      // responsive enough to feel continuous.
      if (Math.abs(next - lastProgressRef.current) < 0.001 && next !== 0 && next !== 1) return
      lastProgressRef.current = next
      setProgress(next)
    }
    const requestUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const requestOnResume = () => {
      if (document.visibilityState === 'visible') requestUpdate()
    }
    update()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    window.addEventListener('pageshow', requestOnResume)
    window.addEventListener('focus', requestOnResume)
    document.addEventListener('visibilitychange', requestOnResume)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      window.removeEventListener('pageshow', requestOnResume)
      window.removeEventListener('focus', requestOnResume)
      document.removeEventListener('visibilitychange', requestOnResume)
    }
  }, [ref])
  return progress
}

function useTopProgress(ref, startViewport = .85, endViewport = .3) {
  const [progress, setProgress] = useState(0)
  const lastProgressRef = useRef(-1)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const element = ref.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const start = window.innerHeight * startViewport
      const end = window.innerHeight * endViewport
      const next = clamp((start - rect.top) / Math.max(1, start - end))
      if (Math.abs(next - lastProgressRef.current) < 0.001 && next !== 0 && next !== 1) return
      lastProgressRef.current = next
      setProgress(next)
    }
    const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
    }
  }, [ref, startViewport, endViewport])
  return progress
}

function useViewportPassProgress(ref) {
  const [progress, setProgress] = useState(0)
  const lastProgressRef = useRef(-1)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const element = ref.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const next = clamp((window.innerHeight - rect.top) / Math.max(1, window.innerHeight + rect.height))
      if (Math.abs(next - lastProgressRef.current) < 0.001 && next !== 0 && next !== 1) return
      lastProgressRef.current = next
      setProgress(next)
    }
    const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
    }
  }, [ref])
  return progress
}

// Progress used by the final call-to-action. The reference section scales in
// while its top edge travels from the viewport bottom to the viewport centre.
function useElementProgress(ref) {
  const [progress, setProgress] = useState(0)
  const lastProgressRef = useRef(-1)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const element = ref.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const startTop = window.innerHeight
      const endTop = (window.innerHeight - rect.height) / 2
      const next = clamp((startTop - rect.top) / Math.max(1, startTop - endTop))
      if (Math.abs(next - lastProgressRef.current) < 0.001 && next !== 0 && next !== 1) return
      lastProgressRef.current = next
      setProgress(next)
    }
    const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
    }
  }, [ref])
  return progress
}

function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  return reduced
}

function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null)
  const shown = useInView(ref)
  return <div ref={ref} className={`reveal ${shown ? 'is-in' : ''} ${className}`} style={{ '--delay': `${delay}ms` }}>{children}</div>
}

function Logo() {
  return <span className="logo-mark" aria-hidden="true">
    <svg viewBox="0 0 115 116" fill="none">
      <path d="M65.5223 1.01564C63.0826 -0.204227 60.212 1.56988 60.212 4.29759C60.212 5.68743 60.9972 6.95799 62.2403 7.57954L90.608 21.7634C97.2414 25.0801 97.2414 34.5463 90.608 37.8631L65.1871 50.5735C62.138 52.098 60.212 55.2144 60.212 58.6234V106.875C60.212 113.565 67.2528 117.917 73.2369 114.925L109.937 96.5744C112.987 95.0499 114.913 91.9335 114.913 88.5246V31.2731C114.913 27.8641 112.987 24.7478 109.937 23.2232L65.5223 1.01564Z" />
      <path d="M0 84.6134C0 88.0223 1.92602 91.1387 4.97508 92.6632L49.3903 114.871C51.83 116.091 54.7006 114.317 54.7006 111.589C54.7006 110.199 53.9153 108.928 52.6722 108.307L24.3046 94.1231C17.6711 90.8064 17.6711 81.3401 24.3046 78.0234L49.7255 65.3129C52.7746 63.7884 54.7006 60.672 54.7006 57.2631V9.01161C54.7006 2.32117 47.6598 -2.03029 41.6757 0.961767L4.97508 19.3121C1.92602 20.8366 0 23.953 0 27.3619V84.6134Z" />
    </svg>
  </span>
}

function Arrow() { return <span className="arrow" aria-hidden="true">↗</span> }

function PlusIcon({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
}

function CheckIcon({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5" /></svg>
}

function IntegrationIcon({ name }) {
  if (name === 'X') return <span className="integration-icon integration-icon-x" aria-hidden="true">𝕏</span>
  if (name === 'LinkedIn') return <span className="integration-icon integration-icon-in" aria-hidden="true">in</span>
  if (name === 'Dribbble') return <span className="integration-icon integration-icon-ball" aria-hidden="true">●</span>
  if (name === 'Figma') return <span className="integration-icon integration-icon-figma" aria-hidden="true"><i /><i /><i /><i /><i /></span>
  if (name === 'YouTube') return <svg className="integration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 17a24.1 24.1 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.6 49.6 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.1 24.1 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.6 49.6 0 0 1-16.2 0A2 2 0 0 1 2.5 17Z" /><path d="m10 15 5-3-5-3z" /></svg>
  if (name === 'Instagram') return <svg className="integration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.7" r=".7" fill="currentColor" stroke="none" /></svg>
  return <svg className="integration-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12h8M12 8v8" /></svg>
}

function FilmButton({ children, light = false, href = '#sign-up' }) {
  return <a href={href} className={`film-button ${light ? 'is-light' : ''}`}>{children}</a>
}

function LoadingOverlay({ progress, leaving }) {
  const cards = [photos[0], photos[3], photos[6], photos[9], photos[2], photos[5], photos[8], photos[1]]
  return <div className={`loading-overlay ${leaving ? 'is-leaving' : ''}`} aria-live="polite">
    <div className="loading-word">Loading...</div>
    <div className="loading-stack" aria-hidden="true">{cards.map((src, index) => <img className={progress >= (index + 1) * 12.5 ? 'is-visible' : ''} key={src + index} src={src} alt="" />)}</div>
    <div className="loading-progress">{Math.max(1, Math.round(Math.min(100, progress)))}</div>
  </div>
}

function EntryLoading({ onComplete }) {
  const [loadedCount, setLoadedCount] = useState(0)
  const [displayedProgress, setDisplayedProgress] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const completedRef = useRef(false)
  // Only warm a small first-screen subset here. The previous implementation
  // loaded all 60 hero cards before the page could continue, which pulled more
  // than 160 MB of local PNGs into memory during the entry transition.
  const preloadSources = ENTRY_PRELOAD_SOURCES

  useEffect(() => {
    let active = true
    let loaded = 0
    preloadSources.forEach((src) => {
      const image = new Image()
      image.decoding = 'async'
      image.onload = image.onerror = () => {
        loaded += 1
        if (active) setLoadedCount(loaded)
      }
      image.src = src
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const maximum = Math.floor((loadedCount / Math.max(1, preloadSources.length)) * 100)
    if (!maximum) return undefined
    const interval = window.setInterval(() => {
      setDisplayedProgress(previous => previous >= maximum ? previous : Math.min(maximum, previous + 2))
    }, 28)
    return () => window.clearInterval(interval)
  }, [loadedCount, preloadSources.length])

  useEffect(() => {
    if (displayedProgress < 100 || completedRef.current) return undefined
    completedRef.current = true
    const leaveTimer = window.setTimeout(() => setLeaving(true), 450)
    const completeTimer = window.setTimeout(() => onComplete?.(), 1110)
    return () => {
      window.clearTimeout(leaveTimer)
      window.clearTimeout(completeTimer)
    }
  }, [displayedProgress, onComplete])

  return <LoadingOverlay progress={displayedProgress} leaving={leaving} />
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}

function HeroOrbitCanvas({ opacity = 1, scale = 1 }) {
  const canvasRef = useRef(null)
  const imagesRef = useRef([])
  const velocityRef = useRef({ y: 0, t: performance.now(), boost: 0 })

  useEffect(() => {
    let active = true
    const loadedImages = new Array(heroPhotos.length)
    // Keep the canvas useful as soon as the first ring is ready, then load the
    // remaining cards in small idle-time batches. Starting all 60 decodes at
    // once competes with the first interactive paint and can make the home
    // page feel stuck on slower machines.
    imagesRef.current = loadedImages
    let nextIndex = 0
    let idleId = 0
    let timerId = 0
    const loadImage = (src, index) => {
      const image = new Image()
      image.decoding = 'async'
      image.onload = image.onerror = () => {
        if (!active) return
        loadedImages[index] = image
      }
      image.src = src
    }
    const loadBatch = () => {
      if (!active) return
      const batchSize = nextIndex < 12 ? 12 - nextIndex : 4
      const end = Math.min(heroPhotos.length, nextIndex + batchSize)
      for (; nextIndex < end; nextIndex += 1) loadImage(heroPhotos[nextIndex], nextIndex)
      if (nextIndex >= heroPhotos.length || !active) return
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(loadBatch, { timeout: 1200 })
      } else {
        timerId = window.setTimeout(loadBatch, 180)
      }
    }
    loadBatch()
    return () => {
      active = false
      if (idleId && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId)
      if (timerId) window.clearTimeout(timerId)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { alpha: true })
    if (!canvas || !context) return undefined
    let frame = 0
    let isVisible = true
    let dimensions = { width: 1, height: 1, dpr: 1 }
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      dimensions = { width: rect.width, height: rect.height, dpr }
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Keep the local card textures crisp when the canvas scales them down.
      // The quality hint is ignored by browsers that do not support it.
      context.imageSmoothingEnabled = true
      try { context.imageSmoothingQuality = 'high' } catch { /* noop */ }
    }
    const onScroll = () => {
      const now = performance.now()
      const current = window.scrollY
      const raw = Math.abs(current - velocityRef.current.y) / Math.max(1, now - velocityRef.current.t) * 1000
      velocityRef.current = { y: current, t: now, boost: Math.min(raw / 300, 14) }
    }
    resize(); onScroll()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    window.addEventListener('scroll', onScroll, { passive: true })
    const rings = [
      { count: 9, vmax: 20, max: 280, duration: 50, phase: 0 },
      { count: 13, vmax: 38.5, max: 580, duration: 85, phase: 24 },
      { count: 17, vmax: 57, max: 880, duration: 120, phase: 42 },
      { count: 21, vmax: 75.5, max: 1180, duration: 155, phase: 60 },
    ]
    const started = performance.now()
    const draw = () => {
      frame = 0
      if (!isVisible || document.visibilityState === 'hidden') return
      const { width, height } = dimensions
      const now = performance.now()
      const elapsed = (now - started) / 1000
      context.clearRect(0, 0, width, height)
      const tileWidth = Math.min(144, width * .14)
      const tileHeight = tileWidth * .75
      const imageSize = Math.min(236, width * .225)
      const fadeX = 1.2 * Math.min(width, 1800)
      const fadeY = 1.05 * height
      const bottomFadeHeight = Math.min(340, .28 * height)
      const boost = velocityRef.current.boost *= .93
      const scale = Math.max(width, height) / 100
      rings.forEach((ring, ringIndex) => {
        const baseRadius = Math.min(ring.vmax * scale, ring.max)
        const radius = baseRadius * (1 + boost * .006 * (1 + ringIndex * .6))
        const spin = elapsed * (Math.PI * 2 / ring.duration) * (1 + boost * (1 + ringIndex * .6) * .08)
        for (let i = 0; i < ring.count; i += 1) {
          const angle = spin + ring.phase * Math.PI / 180 + i / ring.count * Math.PI * 2
          const x = width / 2 + Math.sin(angle) * radius
          // Three.js uses a y-up orthographic plane. Canvas uses y-down, so
          // the world-space orbit is mirrored vertically while the rotation
          // remains positive in screen coordinates.
          const y = height / 2 - Math.cos(angle) * radius
          const worldX = x - width / 2
          const worldY = height / 2 - y
          const radialT = Math.hypot(worldX / fadeX, worldY / fadeY)
          const radialFade = radialT < .42
            ? .5 * clamp((radialT - .24) / .18)
            : radialT < .62
              ? .5 + .4 * clamp((radialT - .42) / .2)
              : .9 + .1 * clamp((radialT - .62) / .16)
          const bottomFade = clamp((worldY + height / 2) / bottomFadeHeight)
          const alpha = radialFade * bottomFade
          if (alpha <= .001) continue
          const image = imagesRef.current[(9 * ringIndex + i) % heroPhotos.length]
          const seed = 53 * ringIndex + 17 * i
          const panAngle = ((37 * seed) % 360) * Math.PI / 180
          const panX = 22 * Math.cos(panAngle)
          const panY = 22 * Math.sin(panAngle)
          context.save()
          context.translate(x, y)
          context.rotate(angle + Math.PI / 2)
          context.globalAlpha = alpha
          const rounded = 20 + ((53 * ringIndex + 17 * i) % 14)
          roundedRect(context, -tileWidth / 2, -tileHeight / 2, tileWidth, tileHeight, rounded)
          context.clip()
          if (image?.complete && image.naturalWidth) {
            // This is the canvas equivalent of the reference shader's
            // `uImgCenter`: every tile samples a shifted window from the
            // original texture rather than redrawing the same center crop.
            const sourceW = image.naturalWidth * tileWidth / imageSize
            const sourceH = image.naturalHeight * tileHeight / imageSize
            const sourceCenterX = image.naturalWidth * (.5 - panX / imageSize)
            const sourceCenterY = image.naturalHeight * (.5 + panY / imageSize)
            const sx = Math.max(0, Math.min(image.naturalWidth - sourceW, sourceCenterX - sourceW / 2))
            const sy = Math.max(0, Math.min(image.naturalHeight - sourceH, sourceCenterY - sourceH / 2))
            context.drawImage(image, sx, sy, sourceW, sourceH, -tileWidth / 2, -tileHeight / 2, tileWidth, tileHeight)
          } else {
            context.fillStyle = '#141414'
            context.fillRect(-tileWidth / 2, -tileHeight / 2, tileWidth, tileHeight)
          }
          context.restore()
          context.save()
          context.translate(x, y)
          context.rotate(angle + Math.PI / 2)
          context.globalAlpha = alpha * .15
          context.strokeStyle = '#262626'
          context.lineWidth = 1
          roundedRect(context, -tileWidth / 2 + .5, -tileHeight / 2 + .5, tileWidth - 1, tileHeight - 1, rounded)
          context.stroke()
          context.restore()
        }
      })
      frame = requestAnimationFrame(draw)
    }

    const refreshAfterResume = () => {
      if (document.visibilityState === 'hidden') return
      resize()
      const rect = canvas.getBoundingClientRect()
      isVisible = rect.bottom >= -120 && rect.top <= window.innerHeight + 120
      if (isVisible && !frame) frame = requestAnimationFrame(draw)
    }

    const visibilityObserver = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
        isVisible = Boolean(entry?.isIntersecting)
        if (isVisible && !frame && document.visibilityState !== 'hidden') frame = requestAnimationFrame(draw)
      }, { rootMargin: '120px' })
    visibilityObserver?.observe(canvas)
    const onDocumentVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (frame) cancelAnimationFrame(frame)
        frame = 0
        return
      }
      refreshAfterResume()
    }
    document.addEventListener('visibilitychange', onDocumentVisibility)
    window.addEventListener('pageshow', refreshAfterResume)
    window.addEventListener('focus', refreshAfterResume)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      visibilityObserver?.disconnect()
      document.removeEventListener('visibilitychange', onDocumentVisibility)
      window.removeEventListener('pageshow', refreshAfterResume)
      window.removeEventListener('focus', refreshAfterResume)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])
  return <canvas ref={canvasRef} className="hero-canvas" style={{ opacity, transform: `scale(${scale})` }} aria-hidden="true" />
}

function Hero({ progress }) {
  const heroRef = useRef(null)
  const heroProgress = useSectionProgress(heroRef)
  const canvasOpacity = 1 - clamp(heroProgress / .45)
  return <section ref={heroRef} className="hero is-ready" id="top"><span id="login" aria-hidden="true" />
    <HeroOrbitCanvas opacity={canvasOpacity} />
    <div className="hero-copy">
      <h1 className="hero-title notranslate" aria-label="超写实照片与影片 / HYPERREAL PHOTOS AND FILM" translate="no">
        <TextType
          as="span"
          text={heroTitleTexts}
          typingSpeed={72}
          pauseDuration={1650}
          deletingSpeed={42}
          cursorCharacter="|"
          textColors={['#fff', '#fff']}
          className="hero-text-type hero-title-type"
          translate="no"
        />
      </h1>
      <p className="hero-description notranslate" aria-label="中英文简介交替显示" translate="no">
        <TextType
          as="span"
          text={heroDescriptionTexts}
          typingSpeed={38}
          pauseDuration={1650}
          deletingSpeed={24}
          cursorCharacter="|"
          textColors={['#fff', '#fff']}
          className="hero-text-type hero-description-type"
          translate="no"
        />
      </p>
      <div className="hero-type-block notranslate" aria-label="ALEX 的中英文介绍" translate="no">
        <TextType
          as="span"
          text={alexTexts}
          typingSpeed={56}
          pauseDuration={1800}
          deletingSpeed={34}
          cursorCharacter="|"
          textColors={['#fff', '#fff']}
          className="hero-text-type alex-text-type"
          translate="no"
        />
      </div>
      <div className="action-row hero-actions">
        <FilmButton light>Get the app</FilmButton>
        <FilmButton href="#product">See how it works</FilmButton>
      </div>
    </div>
    <div className="hero-scroll">Scroll to explore <span>↓</span></div>
    <div className="progress-readout" aria-hidden="true">{progress}%</div>
  </section>
}

function Showcase() {
  const ref = useRef(null)
  const videoRef = useRef(null)
  const progress = useSectionProgress(ref)
  const [viewport, setViewport] = useState({ width: 1280, height: 820 })
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .05 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (inView && progress >= .35) video.play().catch(() => {})
    else video.pause()
  }, [inView, progress])
  const phase = clamp(progress / .55)
  const sidePadding = viewport.width >= 1024 ? 40 : viewport.width >= 640 ? 32 : 20
  const targetWidth = Math.max(280, Math.min(viewport.width, 1440) - sidePadding * 2)
  const targetHeight = Math.max(220, viewport.height - 120)
  const width = 400 + (targetWidth - 400) * phase
  const height = 260 + (targetHeight - 260) * phase
  const top = 96 + (1 - phase) * (viewport.height - 146)
  return <section id="product" className="showcase-section" ref={ref}>
    <div className="showcase-sticky">
      <p className="showcase-kicker" style={{ opacity: clamp(1 - progress * 10) }}>▶ &nbsp; Watch the film — generated with Cortex</p>
      <div className="showcase-video" style={{ width: `${width}px`, height: `${height}px`, top: `${top}px`, transform: 'translateX(-50%)', borderRadius: '24px' }}>
        <video ref={videoRef} src={showcaseVideo} poster={showcasePoster} muted loop playsInline preload="metadata" aria-label="Cortex showcase film" data-media-slot="showcase-video" />
        <div className="video-glass" />
        <p className="showcase-scroll" style={{ opacity: clamp((progress - .55) / .1) * clamp((.98 - progress) / .08) }}><span>Scroll down</span><b>↓</b></p>
      </div>
    </div>
  </section>
}

function HalftoneRevealStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [currentSource, setCurrentSource] = useState(() => candidates[0]?.src || halftoneDefaultSource)
  const [currentLabel, setCurrentLabel] = useState(() => candidates[0]?.label || 'React Bits 默认示例图')

  useEffect(() => {
    if (!candidates.length) {
      setCurrentSource(halftoneDefaultSource)
      setCurrentLabel('React Bits 默认示例图')
      return
    }
    if (!candidates.some(item => item.src === currentSource)) {
      setCurrentSource(candidates[0].src)
      setCurrentLabel(candidates[0].label)
    }
  }, [candidates, currentSource])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    const currentIndex = candidates.findIndex(item => item.src === currentSource)
    let nextIndex = Math.floor(Math.random() * candidates.length)
    if (candidates.length > 1 && nextIndex === currentIndex) nextIndex = (nextIndex + 1) % candidates.length
    const next = candidates[nextIndex]
    setCurrentSource(next.src)
    setCurrentLabel(next.label)
  }, [candidates, currentSource])

  return <section className="halftone-studio section-wrap" id="halftone-reveal" aria-labelledby="halftone-studio-title" data-halftone-image-count={candidates.length} data-halftone-current-src={currentSource}>
    <div className="halftone-studio-copy">
      <p className="eyebrow">HALFTONE REVEAL</p>
      <h2 id="halftone-studio-title">让图像在半色调中显影。</h2>
      <p>沿用 React Bits 的印刷网点结构；移动指针，局部会从半色调网点中显现清晰原图。</p>
      <button className="halftone-random-button" type="button" aria-label="随机换一张半色调图片" onClick={randomize} disabled={!candidates.length} data-halftone-randomize>
        <span>随机生成一张</span><b aria-hidden="true">↗</b>
      </button>
      <p className="halftone-selection" aria-live="polite">当前素材：{currentLabel} · 可随机 {candidates.length} 张</p>
      <div className="halftone-upload-actions" role="group" aria-label="半色调显影上传">
        <p className="halftone-upload-label">把一张新图放进半色调显影</p>
        <div className="halftone-local-upload" data-session-upload-target="halftone-reveal" />
        <MobileUploadLinks />
      </div>
    </div>
    <ViewportCanvas className="halftone-studio-canvas" aria-label="Halftone Reveal image preview" data-media-slot="halftone-reveal">
      <HalftoneReveal
        key={currentSource}
        src={currentSource}
        mode="mono"
        dotSize={1}
        dotDensity={71}
        angle={45}
        shape="circle"
        contrast={1.15}
        invert={false}
        revealRadius={0.4}
        edge={0.8}
        follow={0.37}
        idleReveal={0}
        trigger="hover"
        borderRadius="16px"
        className="halftone-studio-effect"
      />
    </ViewportCanvas>
  </section>
}

function OrbitImagesStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear, onLibraryRefresh }) {
  const baseCandidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const candidates = useMemo(() => preview
    ? [{ ...preview, label: `${preview.persisted ? '已入库' : '本次预览'} · ${preview.label}`, slot: 'session' }, ...baseCandidates.filter(item => item.src !== preview.src)]
    : baseCandidates, [baseCandidates, preview])
  const [orbitImages, setOrbitImages] = useState(() => baseCandidates.slice(0, ORBIT_IMAGE_COUNT))
  const [activeSource, setActiveSource] = useState(() => candidates[0]?.src || '')
  const [magnetEnabled, setMagnetEnabled] = useState(true)
  const orbitSectionRef = useRef(null)
  const originalSelectionRef = useRef(null)
  const previousPreviewRef = useRef(null)

  useEffect(() => {
    setOrbitImages(previous => {
      if (!candidates.length) return previous.length ? [] : previous
      const available = new Map(candidates.map(item => [item.src, item]))
      const retained = previous.filter(item => available.has(item.src))
      const additions = candidates.filter(item => !retained.some(current => current.src === item.src))
      const next = [...retained, ...additions].slice(0, ORBIT_IMAGE_COUNT)
      return sameImageOrder(previous, next) ? previous : next
    })
  }, [candidates])

  useEffect(() => {
    if (previousPreviewRef.current === preview?.src) return
    previousPreviewRef.current = preview?.src
    if (preview) {
      if (!originalSelectionRef.current) originalSelectionRef.current = { images: orbitImages, source: activeSource }
      const uploaded = candidates.find(item => item.src === preview.src)
      // Keep the five other cards and bind both previews to the same first slot.
      const remaining = orbitImages.some(item => item.sessionOnly)
        ? orbitImages.filter(item => !item.sessionOnly)
        : orbitImages.slice(1)
      const additions = baseCandidates.filter(item => !remaining.some(current => current.src === item.src))
      setOrbitImages([uploaded, ...remaining, ...additions].slice(0, ORBIT_IMAGE_COUNT))
      setActiveSource(preview.src)
    } else if (originalSelectionRef.current) {
      setOrbitImages(originalSelectionRef.current.images)
      setActiveSource(originalSelectionRef.current.source)
      originalSelectionRef.current = null
    }
  }, [preview, candidates, baseCandidates, orbitImages, activeSource])

  useEffect(() => {
    if (!orbitImages.length) {
      if (activeSource) setActiveSource('')
      return
    }
    if (!orbitImages.some(item => item.src === activeSource)) setActiveSource(orbitImages[0].src)
  }, [orbitImages, activeSource])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    let next = shuffleImages(candidates).slice(0, ORBIT_IMAGE_COUNT)
    if (candidates.length > ORBIT_IMAGE_COUNT && sameImageOrder(next, orbitImages)) {
      next = [...next.slice(1), next[0]]
    }
    setOrbitImages(next)
    setActiveSource(next[0]?.src || '')
  }, [candidates, orbitImages])

  const selectImage = useCallback((source) => {
    setActiveSource(source)
    setOrbitImages(previous => {
      const selectedIndex = previous.findIndex(item => item.src === source)
      if (selectedIndex <= 0) return previous
      return [previous[selectedIndex], ...previous.slice(0, selectedIndex), ...previous.slice(selectedIndex + 1)]
    })
  }, [])

  const orbitKey = orbitImages.map(item => item.src).join('|') || 'orbit-empty'
  const activeImage = orbitImages.find(item => item.src === activeSource) || orbitImages[0]

  return <section ref={orbitSectionRef} className="orbit-studio section-wrap" id="orbit-images" aria-labelledby="orbit-studio-title" data-orbit-image-count={candidates.length} data-orbit-set-size={orbitImages.length} data-orbit-active-src={activeImage?.src || ''} data-crosshair-scope>
    <Crosshair color="#ffffff" containerRef={orbitSectionRef} />
    <div className="orbit-studio-copy">
      <div className="orbit-sticker-heading" data-sticker-peel data-sticker-peel-source={activeImage?.src || photos[0] || ''}>
        <span className="orbit-sticker-label">STICKER PEEL / DRAG</span>
        <div className="orbit-sticker-stage" aria-label="可拖动的贴纸剥离预览">
          <StickerPeel
            key={activeImage?.src || 'sticker-default'}
            imageSrc={activeImage?.src || photos[0]}
            rotate={0}
            peelBackHoverPct={30}
            peelBackActivePct={40}
            width={156}
            shadowIntensity={0.46}
            lightingIntensity={0.08}
            peelDirection={0}
            className="orbit-sticker-peel"
          />
        </div>
      </div>
      <LetterSwap3D
        as="p"
        className="eyebrow orbit-letter-swap-eyebrow"
        staggerInterval={0.03}
        staggerOrigin="first"
        animation={{ type: 'spring', damping: 30, stiffness: 300 }}
        flipDirection="top"
        blur
        blurAmount={4}
        duration={0.6}
      >
        ORBIT IMAGES
      </LetterSwap3D>
      <MaskedHeading
        key={activeImage?.src || 'orbit-masked-heading'}
        id="orbit-studio-title"
        text="让六张图， 沿着同一条 轨道转动。"
        tag="h2"
        src={activeImage?.src || photos[0]}
        align="left"
        weight={500}
        tracking={-0.025}
        lineHeight={1.05}
        reveal="rise"
        trigger="view"
        className="orbit-masked-heading"
      />
      <BlurHighlight
        className="orbit-blur-highlight"
        highlightedBits={['SVG 路径轨道', '六张现有图片', '轨道的首位']}
        highlightColor="rgba(196, 181, 253, 0.34)"
        blurAmount={8}
        inactiveOpacity={0.3}
        blurDelay={0}
        blurDuration={0.8}
        highlightDelay={0.4}
        highlightDuration={1}
        highlightDirection="left"
        viewportOptions={{ once: false, amount: 0.5 }}
      >
        沿用 React Bits 的 SVG 路径轨道与 Motion 位移；六张现有图片会沿椭圆路径均匀运行，点选缩略图即可把它切到轨道的首位。
      </BlurHighlight>
      <div className="orbit-studio-actions">
        <SessionImageUploadButton slot="orbit-images" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
        <button className="orbit-random-button" type="button" aria-label="随机生成六张轨道图片" onClick={randomize} disabled={!candidates.length} data-orbit-randomize>
          <LetterSwap3D
            as="span"
            className="orbit-letter-swap-button-label"
            staggerInterval={0.025}
            staggerOrigin="first"
            animation={{ type: 'spring', damping: 30, stiffness: 300 }}
            flipDirection="top"
            blur
            blurAmount={3}
            duration={0.6}
            aria-hidden="true"
          >
            随机生成 6 张
          </LetterSwap3D>
          <b aria-hidden="true">✦</b>
        </button>
        <span className="orbit-count-badge" aria-label={`当前轨道有 ${orbitImages.length} 张图片`}>{String(orbitImages.length).padStart(2, '0')} / 06</span>
      </div>
      <div className="orbit-magnet-control" data-magnet-control data-magnet-enabled={magnetEnabled}>
        <Magnet
          padding={100}
          magnetStrength={2}
          disabled={!magnetEnabled}
          wrapperClassName="orbit-magnet-wrapper"
          innerClassName="orbit-magnet-inner"
          data-magnet-target="orbit-magnet-toggle"
          data-magnet-demo
        >
          <button
            className="orbit-magnet-button"
            type="button"
            aria-label={magnetEnabled ? '关闭磁铁吸附效果' : '开启磁铁吸附效果'}
            aria-pressed={magnetEnabled}
            onClick={() => setMagnetEnabled(previous => !previous)}
          >
            <span className="orbit-magnet-icon" aria-hidden="true">↯</span>
            <LetterSwap3D
              as="span"
              className="orbit-letter-swap-button-label"
              staggerInterval={0.025}
              staggerOrigin="first"
              animation={{ type: 'spring', damping: 30, stiffness: 300 }}
              flipDirection="top"
              blur
              blurAmount={3}
              duration={0.6}
              aria-hidden="true"
            >
              {`磁铁吸附 ${magnetEnabled ? '开' : '关'}`}
            </LetterSwap3D>
          </button>
        </Magnet>
        <span className="orbit-magnet-hint">靠近控件自动吸附</span>
      </div>
      <p className="orbit-selection" aria-live="polite">当前焦点：{activeImage?.label || '暂无可用图片'} · 素材池 {candidates.length} 张</p>
      <a className="orbit-credit-card-link" href="#credit-card">查看 ALEX 弓弦影信用卡 <span aria-hidden="true">↗</span></a>
      <a className="orbit-credit-card-link orbit-drift-wall-link" href="#personal-drift-wall">查看个人视觉档案墙 <span aria-hidden="true">↗</span></a>
      <a className="orbit-credit-card-link orbit-gradient-carousel-link" href="#gradient-carousel">查看渐变旋转木马 <span aria-hidden="true">↗</span></a>
      <a className="orbit-credit-card-link" href="#pixel-swap">查看像素交换 <span aria-hidden="true">↗</span></a>
      <a className="orbit-credit-card-link orbit-liquid-swap-link" href="#liquid-swap">查看液态玻璃换图 <span aria-hidden="true">↗</span></a>
      <a className="orbit-credit-card-link orbit-magic-transform-link" href="#magic-transform">查看魔法变形 <span aria-hidden="true">↗</span></a>
      <a className="orbit-credit-card-link orbit-modal-cards-link" href="#modal-cards">查看模态卡 <span aria-hidden="true">↗</span></a>
      <a className="orbit-credit-card-link orbit-parallax-cards-link" href="#parallax-cards">查看视差卡 <span aria-hidden="true">↗</span></a>
      <a className="orbit-credit-card-link orbit-reel-gallery-link" href="#reel-gallery">查看胶片画廊 <span aria-hidden="true">↗</span></a>
      <a className="orbit-credit-card-link orbit-scroll-stack-link" href="#scroll-stack">查看卷轴堆栈 <span aria-hidden="true">↗</span></a>
      <a className="orbit-credit-card-link orbit-simple-graph-link" href="#simple-graph">查看实时浏览量图 <span aria-hidden="true">↗</span></a>
    </div>
    <div className="orbit-studio-visual">
      <div className="orbit-studio-canvas" aria-label="Orbit Images image preview" data-media-slot="orbit-images">
        <div className="orbit-click-spark-region" data-click-spark-region>
          <ClickSpark
            sparkColor="#ffffff"
            sparkSize={10}
            sparkRadius={15}
            sparkCount={8}
            duration={400}
            easing="ease-out"
            extraScale={1}
          >
            <button className="orbit-refresh-button" type="button" aria-label="随机换一组轨道图片" onClick={randomize} disabled={!candidates.length} data-orbit-randomize-icon>
              <span aria-hidden="true">↻</span>
            </button>
            <div className="orbit-studio-orbit-frame">
              <OrbitImages
                key={orbitKey}
                images={orbitImages.map(item => item.src)}
                altPrefix="Cortex 轨道图片"
                shape="ellipse"
                baseWidth={520}
                radiusX={190}
                radiusY={86}
                radius={160}
                rotation={-8}
                duration={30}
                itemSize={82}
                direction="normal"
                fill
                showPath
                pathColor="rgba(255,255,255,0.16)"
                pathWidth={2}
                easing="linear"
                paused={false}
                responsive
                className="orbit-studio-effect"
              />
            </div>
          </ClickSpark>
        </div>
      </div>
      <div className="orbit-image-picker" role="group" aria-label="选择轨道图片" data-orbit-picker>
        {orbitImages.map((item, index) => {
          const selected = item.src === activeSource
          return <button
            className={`orbit-image-choice ${selected ? 'is-active' : ''}`}
            type="button"
            key={`${item.src}-${index}`}
            aria-label={`选择第 ${index + 1} 张：${item.label}`}
            aria-pressed={selected}
            title={item.label}
            onClick={() => selectImage(item.src)}
            data-orbit-image-choice={index}
            data-orbit-image-src={item.src}
          >
            <img src={item.src} alt="" draggable="false" loading="lazy" decoding="async" />
            <span>{String(index + 1).padStart(2, '0')}</span>
          </button>
        })}
      </div>
    </div>
  </section>
}

function CreditCardStudio() {
  return <section className="credit-card-studio section-wrap" id="credit-card" aria-labelledby="credit-card-studio-title" data-credit-card-studio>
    <div className="credit-card-studio-copy">
      <p className="eyebrow">CREDIT CARD / 3D PROFILE</p>
      <h2 id="credit-card-studio-title">让 ALEX 弓弦影，成为一张会倾斜的名片。</h2>
      <p>沿用公开信用卡组件的交互契约：移动鼠标产生实时倾斜与视差高光，点击卡面即可翻到背面查看演示 CVV。姓名已按你的要求固定为 ALEX 弓弦影。</p>
      <p className="credit-card-selection" aria-live="polite">持卡人：ALEX 弓弦影 · 仅演示占位卡号，不处理真实支付</p>
      <a className="credit-card-anchor-link" href="#login">返回登录入口 <span aria-hidden="true">↗</span></a>
    </div>
    <div className="credit-card-studio-visual">
      <div className="credit-card-studio-canvas" aria-label="Interactive 3D credit card preview" data-media-slot="credit-card">
        <CreditCard
          cardNumber="1234 5678 9012 3456"
          cardholderName="ALEX 弓弦影"
          expirationDate="12/25"
          cvv="123"
          background="linear-gradient(135deg, #2b2b2b 0%, #151515 54%, #050505 100%)"
          textColor="#ffffff"
          hasTextShadow
          scale={1}
          rotationIntensity={1}
          parallaxIntensity={1}
          scaleOnHover={1.05}
          showShine
          showShadow
          borderRadius={16}
          showActionButtons
          className="credit-card-studio-effect"
        />
        <p className="credit-card-stage-note">MOVE TO TILT · CLICK TO FLIP</p>
      </div>
    </div>
  </section>
}

function pickTumbleItems(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: Math.min(TUMBLE_CAROUSEL_ITEM_COUNT, Math.max(1, shuffled.length)) }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const slot = String(item?.slot || index + 1).padStart(2, '0')
    return {
      id: `${item.src}-${index}`,
      src: item.src,
      title: `影像 ${slot}`,
      label: `影像 ${slot}`,
      sourceLabel: String(item?.label || `影像 ${slot}`).replace(/\s+/g, ' ').trim(),
    }
  })
}

function sameTumbleOrder(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item.src === second[index]?.src)
}

function TumbleCarouselStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [items, setItems] = useState(() => pickTumbleItems(candidates))
  const [activeIndex, setActiveIndex] = useState(Math.min(3, Math.max(0, items.length - 1)))
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setItems(current => {
      if (current.length && current.every(item => candidates.some(candidate => candidate.src === item.src))) return current
      return pickTumbleItems(candidates)
    })
  }, [candidates])

  useEffect(() => {
    setActiveIndex(index => items.length ? Math.min(index, items.length - 1) : 0)
  }, [items.length])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setItems(current => {
      let next = pickTumbleItems(candidates)
      let attempts = 0
      while (candidates.length > TUMBLE_CAROUSEL_ITEM_COUNT && sameTumbleOrder(next, current) && attempts < 6) {
        next = pickTumbleItems(candidates)
        attempts += 1
      }
      return next
    })
    setActiveIndex(3)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const activeItem = items[activeIndex] || items[0]
  const sourceSummary = activeItem?.sourceLabel || '暂无可用图片'

  return <section className="tumble-carousel-studio section-wrap" id="tumble-carousel" aria-labelledby="tumble-carousel-studio-title" data-tumble-carousel-studio data-tumble-image-count={candidates.length} data-tumble-set-size={items.length} data-tumble-active-index={activeIndex} data-tumble-sources={items.map(item => item.src).join('|')}>
    <div className="tumble-carousel-studio-copy">
      <p className="eyebrow">TUMBLE CAROUSEL</p>
      <h2 id="tumble-carousel-studio-title">让影像沿着端到端的翻滚前进。</h2>
      <p>十张站内影像组成一组翻滚旋转木马。点击控制按钮、拖动卡片或使用方向键，聚焦卡片会沿 X 轴翻滚换位；标题、淡出范围和节奏对应公开 Tumble Carousel 的参数。</p>
      <button className="tumble-random-button" type="button" aria-label="随机生成一组翻滚旋转木马图片" onClick={randomize} disabled={!candidates.length} data-tumble-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="tumble-selection" aria-live="polite">当前焦点：{activeItem ? `${activeItem.title} · ${sourceSummary}` : '暂无可用图片'} · 素材池 {candidates.length} 张</p>
      <div className="tumble-upload-actions" role="group" aria-label="翻滚影像上传">
        <p className="tumble-upload-label">把一张新图放进翻滚轨道</p>
        <SessionImageUploadButton slot="tumble-carousel" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="tumble-carousel-studio-visual">
      <div className="tumble-carousel-studio-canvas" aria-label="Tumble Carousel image preview" data-media-slot="tumble-carousel">
        <button className="tumble-refresh-button" type="button" aria-label="随机换一组翻滚图片" onClick={randomize} disabled={!candidates.length} data-tumble-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <TumbleCarousel
          key={shuffleToken}
          items={items}
          initialIndex={Math.min(3, Math.max(0, items.length - 1))}
          cardWidth={210}
          aspectRatio="1 / 1"
          frameHeight={520}
          rotation={30}
          verticalOffset={50}
          inactiveScale={0.6}
          visibleRange={2.4}
          borderRadius={16}
          titleBlur={2}
          speed={1}
          showTitles
          showControls
          showCounter
          loop={false}
          autoplay={false}
          autoplayDelay={3000}
          enableDrag
          enableKeyboard
          onIndexChange={setActiveIndex}
          className="tumble-carousel-studio-effect"
        />
        <p className="tumble-stage-note">DRAG / ARROWS TO TUMBLE</p>
      </div>
    </div>
  </section>
}

function pickWarpedCards(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: Math.min(WARPED_CARD_COUNT, Math.max(1, shuffled.length)) }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const slot = String(item?.slot || index + 1).padStart(2, '0')
    return {
      id: `${item.src}-${index}`,
      src: item.src,
      label: `影像 ${slot}`,
      sourceLabel: String(item?.label || `影像 ${slot}`).replace(/\s+/g, ' ').trim(),
    }
  })
}

function WarpedCardStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [cards, setCards] = useState(() => pickWarpedCards(candidates))
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setCards(current => {
      if (current.length && current.every(card => candidates.some(candidate => candidate.src === card.src))) return current
      return pickWarpedCards(candidates)
    })
  }, [candidates])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setCards(current => {
      let next = pickWarpedCards(candidates)
      let attempts = 0
      while (candidates.length > WARPED_CARD_COUNT && sameImageOrder(next, current) && attempts < 6) {
        next = pickWarpedCards(candidates)
        attempts += 1
      }
      return next
    })
    setShuffleToken(token => token + 1)
  }, [candidates])

  const sourceSummary = cards.map(card => card.sourceLabel).join(' · ') || '暂无可用图片'

  return <section className="warped-card-studio section-wrap" id="warped-card" aria-labelledby="warped-card-studio-title" data-warped-card-studio data-warped-image-count={candidates.length} data-warped-set-size={cards.length} data-warped-sources={cards.map(card => card.src).join('|')}>
    <div className="warped-card-studio-copy">
      <p className="eyebrow">WARPED CARD</p>
      <h2 id="warped-card-studio-title">让影像在指针下鼓起。</h2>
      <p>三张来自站内影像库的扭曲卡片，按公开 Warped Card 的 bulge distortion 交互重建。移动鼠标，图片会围绕指针产生柔和的镜面凸起；离开后平滑回到原位。</p>
      <button className="warped-random-button" type="button" aria-label="随机生成一组扭曲卡片图片" onClick={randomize} disabled={!candidates.length} data-warped-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="warped-card-selection" aria-live="polite">当前素材：{sourceSummary} · 素材池 {candidates.length} 张</p>
      <div className="warped-upload-actions" role="group" aria-label="扭曲卡片上传">
        <p className="warped-upload-label">把一张新图放进指针下的镜面</p>
        <SessionImageUploadButton slot="warped-card" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="warped-card-studio-visual">
      <ViewportCanvas className="warped-card-studio-canvas" aria-label="Warped Card interactive preview" data-media-slot="warped-card">
        <button className="warped-refresh-button" type="button" aria-label="随机换一组扭曲卡片" onClick={randomize} disabled={!candidates.length} data-warped-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <div className="warped-card-grid" data-warped-card-grid>
          {cards.map((card, index) => <WarpedCard
            key={`${card.id}-${shuffleToken}`}
            width="100%"
            height="100%"
            cardWidth={220}
            aspectRatio={1.3}
            imageSrc={card.src}
            radius={0.95}
            strength={1.1}
            dampening={0.07}
            transitionDuration={0.8}
            borderRadius={16}
            alt={card.sourceLabel}
            className="warped-card-studio-card"
            data-warped-card-index={index}
          >
            <div className="warped-card-studio-card-copy">
              <span>WARPED {String(index + 1).padStart(2, '0')}</span>
              <strong>{card.label}</strong>
            </div>
          </WarpedCard>)}
        </div>
        <p className="warped-stage-note">MOVE TO BEND · LEAVE TO RESET</p>
      </ViewportCanvas>
    </div>
  </section>
}

function pickChromaCards(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: Math.min(CHROMA_CARD_COUNT, Math.max(1, shuffled.length)) }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const slot = String(item?.slot || index + 1).padStart(2, '0')
    return {
      id: `${item.src}-${index}`,
      src: item.src,
      label: `影像 ${slot}`,
      sourceLabel: String(item?.label || `影像 ${slot}`).replace(/\s+/g, ' ').trim(),
    }
  })
}

function ChromaCardStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [cards, setCards] = useState(() => pickChromaCards(candidates))
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setCards(current => {
      if (current.length && current.every(card => candidates.some(candidate => candidate.src === card.src))) return current
      return pickChromaCards(candidates)
    })
  }, [candidates])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setCards(current => {
      let next = pickChromaCards(candidates)
      let attempts = 0
      while (candidates.length > CHROMA_CARD_COUNT && sameImageOrder(next, current) && attempts < 6) {
        next = pickChromaCards(candidates)
        attempts += 1
      }
      return next
    })
    setShuffleToken(token => token + 1)
  }, [candidates])

  const sourceSummary = cards.map(card => card.sourceLabel).join(' · ') || '暂无可用图片'

  return <section className="chroma-card-studio section-wrap" id="chroma-card" aria-labelledby="chroma-card-studio-title" data-chroma-card-studio data-chroma-image-count={candidates.length} data-chroma-set-size={cards.length} data-chroma-sources={cards.map(card => card.src).join('|')}>
    <div className="chroma-card-studio-copy">
      <p className="eyebrow">CHROMA CARD</p>
      <h2 id="chroma-card-studio-title">让颜色在卡片边缘流动。</h2>
      <p>三张来自站内影像库的色度卡，按公开 Chroma Card 的 RGB 分离、像素位移与悬停缩放交互重建。移动鼠标，色彩会在指针周围产生细微的光谱偏移。</p>
      <button className="chroma-random-button" type="button" aria-label="随机生成一组色度卡片图片" onClick={randomize} disabled={!candidates.length} data-chroma-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="chroma-card-selection" aria-live="polite">当前素材：{sourceSummary} · 素材池 {candidates.length} 张</p>
      <div className="chroma-upload-actions" role="group" aria-label="色度卡片上传">
        <p className="chroma-upload-label">把一张新图放进流动的色彩边缘</p>
        <SessionImageUploadButton slot="chroma-card" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="chroma-card-studio-visual">
      <ViewportCanvas className="chroma-card-studio-canvas" aria-label="Chroma Card interactive preview" data-media-slot="chroma-card">
        <button className="chroma-refresh-button" type="button" aria-label="随机换一组色度卡片" onClick={randomize} disabled={!candidates.length} data-chroma-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <div className="chroma-card-grid" data-chroma-card-grid>
          {cards.map((card, index) => <ChromaCard
            key={`${card.id}-${shuffleToken}`}
            width={220}
            height={300}
            imageSrc={card.src}
            imageAspectRatio={0.67}
            cardWidth={5}
            cardHeight={6}
            zoomLevel={0.3}
            rgbShiftAmount={0.02}
            pixelDisplaceAmount={0.095}
            hoverDuration={3}
            rotationIntensity={0.2}
            scaleIntensity={0.1}
            positionIntensity={0.5}
            interactionDuration={0.4}
            opacity={1}
            cameraFov={50}
            cameraZ={7}
            borderRadius={30}
            alt={card.sourceLabel}
            className="chroma-card-studio-card"
            data-chroma-card-index={index}
          >
            <div className="chroma-card-studio-card-copy">
              <span>CHROMA {String(index + 1).padStart(2, '0')}</span>
              <strong>{card.label}</strong>
            </div>
          </ChromaCard>)}
        </div>
        <p className="chroma-stage-note">MOVE TO SHIFT · RGB SPECTRUM</p>
      </ViewportCanvas>
    </div>
  </section>
}

function pickCircleGalleryImages(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: Math.min(CIRCLE_GALLERY_ITEM_COUNT, Math.max(1, shuffled.length)) }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const slot = String(item?.slot || index + 1).padStart(2, '0')
    return {
      id: `${item.src}-${index}`,
      src: item.src,
      label: `影像 ${slot}`,
      sourceLabel: String(item?.label || `影像 ${slot}`).replace(/\s+/g, ' ').trim(),
    }
  })
}

function sameCircleGalleryOrder(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item.src === second[index]?.src)
}

function CircleGalleryStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [items, setItems] = useState(() => pickCircleGalleryImages(candidates))
  const [activeIndex, setActiveIndex] = useState(null)
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setItems(current => {
      if (current.length && current.every(item => candidates.some(candidate => candidate.src === item.src))) return current
      return pickCircleGalleryImages(candidates)
    })
  }, [candidates])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setItems(current => {
      let next = pickCircleGalleryImages(candidates)
      let attempts = 0
      while (candidates.length > 1 && sameCircleGalleryOrder(next, current) && attempts < 6) {
        next = pickCircleGalleryImages(candidates)
        attempts += 1
      }
      return next
    })
    setActiveIndex(null)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const handleItemClick = useCallback(index => setActiveIndex(index), [])
  const activeItem = activeIndex == null ? null : items[activeIndex]
  const sourceSummary = activeItem?.sourceLabel || '拖动圆环旋转 · 点击卡片聚焦'

  return <section className="circle-gallery-studio section-wrap" id="circle-gallery" aria-labelledby="circle-gallery-studio-title" data-circle-gallery-studio data-circle-gallery-image-count={candidates.length} data-circle-gallery-set-size={items.length} data-circle-gallery-active-index={activeIndex == null ? '' : activeIndex} data-circle-gallery-sources={items.map(item => item.src).join('|')}>
    <div className="circle-gallery-studio-copy">
      <p className="eyebrow">CIRCLE GALLERY</p>
      <h2 id="circle-gallery-studio-title">把影像放进一枚会转动的圆环。</h2>
      <p>十二张站内影像沿平面圆环排列，并用 3D 变换保持卡片正面。拖动圆环会带出惯性；点击任意卡片即可聚焦当前影像。</p>
      <button className="circle-gallery-random-button" type="button" aria-label="随机生成一组圆环画廊图片" onClick={randomize} disabled={!candidates.length} data-circle-gallery-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="circle-gallery-selection" aria-live="polite">{sourceSummary} · 素材池 {candidates.length} 张</p>
      <div className="circle-gallery-upload-actions" role="group" aria-label="圆环画廊上传">
        <p className="circle-gallery-upload-label">把一张新图放进会转动的圆环</p>
        <SessionImageUploadButton slot="circle-gallery" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="circle-gallery-studio-visual">
      <div className="circle-gallery-studio-canvas" aria-label="Circle Gallery interactive preview" data-media-slot="circle-gallery">
        <button className="circle-gallery-refresh-button" type="button" aria-label="随机换一组圆环画廊图片" onClick={randomize} disabled={!candidates.length} data-circle-gallery-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <CircleGallery
          key={shuffleToken}
          images={items}
          radiusPercent={15}
          itemWidth={200}
          itemHeight={250}
          itemScale={0.85}
          borderRadius={16}
          enableDrag
          throwResistance={0.35}
          animationDuration={0.9}
          showNumbers
          autoSpin={5}
          onItemClick={handleItemClick}
          className="circle-gallery-studio-effect"
          itemClassName="circle-gallery-studio-item"
        />
        <p className="circle-gallery-stage-note">DRAG TO ROTATE · CLICK TO FOCUS</p>
      </div>
    </div>
  </section>
}

function pickComparisonSliderImages(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  const before = shuffled[0]
  const after = shuffled.find(item => item.src !== before?.src) || shuffled[1] || before
  return [before, after].filter(Boolean).map((item, index) => {
    const slot = String(item?.slot || index + 1).padStart(2, '0')
    return {
      id: `${item.src}-${index}`,
      src: item.src,
      side: index === 0 ? 'before' : 'after',
      label: `影像 ${slot}`,
      sourceLabel: String(item?.label || `影像 ${slot}`).replace(/\s+/g, ' ').trim(),
    }
  })
}

function sameComparisonSliderPair(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item.src === second[index]?.src)
}

function ComparisonSliderStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [pair, setPair] = useState(() => pickComparisonSliderImages(candidates))
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setPair(current => {
      if (current.length === COMPARISON_SLIDER_IMAGE_COUNT && current.every(item => candidates.some(candidate => candidate.src === item.src))) return current
      return pickComparisonSliderImages(candidates)
    })
  }, [candidates])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setPair(current => {
      let next = pickComparisonSliderImages(candidates)
      let attempts = 0
      while (candidates.length > 1 && sameComparisonSliderPair(next, current) && attempts < 8) {
        next = pickComparisonSliderImages(candidates)
        attempts += 1
      }
      return next
    })
    setShuffleToken(token => token + 1)
  }, [candidates])

  const before = pair[0]
  const after = pair[1]
  const sourceSummary = pair.map(item => item.sourceLabel).join(' · ') || '暂无可用图片'
  const pairSources = pair.map(item => item.src).join('|')

  return <section className="comparison-slider-studio section-wrap" id="comparison-slider" aria-labelledby="comparison-slider-studio-title" data-comparison-slider-studio data-comparison-slider-image-count={candidates.length} data-comparison-slider-set-size={pair.length} data-comparison-slider-before-src={before?.src || ''} data-comparison-slider-after-src={after?.src || ''} data-comparison-slider-sources={pairSources}>
    <div className="comparison-slider-studio-copy">
      <p className="eyebrow">COMPARISON SLIDER</p>
      <h2 id="comparison-slider-studio-title">把两张影像，放在同一条分割线上。</h2>
      <p>左右拖动中间的白色手柄，在同一张画布里比较两张站内影像。每次点击随机按钮都会从已有影像库抽取一组新的前后画面。</p>
      <button className="comparison-random-button" type="button" aria-label="随机生成一组比较滑块图片" onClick={randomize} disabled={!candidates.length} data-comparison-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="comparison-selection" aria-live="polite">当前素材：{sourceSummary} · 素材池 {candidates.length} 张</p>
      <div className="comparison-upload-actions" role="group" aria-label="比较滑块上传">
        <p className="comparison-upload-label">把一张新图放进同一条分割线</p>
        <SessionImageUploadButton slot="comparison-slider" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="comparison-slider-studio-visual">
      <div className="comparison-slider-studio-canvas" aria-label="Comparison Slider interactive preview" data-media-slot="comparison-slider">
        <button className="comparison-refresh-button" type="button" aria-label="随机换一组比较图片" onClick={randomize} disabled={!candidates.length} data-comparison-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <ComparisonSlider
          key={shuffleToken}
          beforeImage={before?.src || ''}
          afterImage={after?.src || before?.src || ''}
          beforeAlt={before?.sourceLabel || 'Before image'}
          afterAlt={after?.sourceLabel || 'After image'}
          initialPosition={50}
          orientation="horizontal"
          enableInertia
          dragOnHover={false}
          autoAnimate={false}
          dividerWidth={3}
          showHandle
          handleSize={36}
          dividerColor="#fff"
          handleColor="#fff"
          ariaLabel="Image comparison slider"
          className="comparison-slider-studio-effect"
        />
        <p className="comparison-stage-note">DRAG THE DIVIDER · COMPARE THE FRAME</p>
      </div>
    </div>
  </section>
}

function TextScatterStudio() {
  const [replayToken, setReplayToken] = useState(0)
  const [fallingText, setFallingText] = useState(loadFallingText)

  return <section className="text-scatter-studio section-wrap" id="text-scatter" aria-labelledby="text-scatter-title" data-text-scatter-studio>
    <div className="text-scatter-studio-copy">
      <p className="eyebrow">TEXT SCATTER</p>
      <p className="text-scatter-kicker">Interactive letter scatter effect</p>
      <TextScatter
        id="text-scatter-title"
        as="h2"
        text="Bounce Back."
        className="text-scatter-headline"
        scatterRadius={102}
        velocity={138}
        rotation={22}
        scale={1.035}
        returnAfter={3}
        duration={1.65}
        replayToken={replayToken}
      />
      <p className="text-scatter-copy">光标靠近时，字母会柔和散开；散开后会停留约 3 秒，再自动归位。下面的小按钮可以重新触发同一套散开动作。</p>
      <button className="text-scatter-random-button" type="button" aria-label="重新散开文本" onClick={() => setReplayToken(value => value + 1)} data-text-scatter-replay>
        <span>重新散开</span><b aria-hidden="true">↻</b>
      </button>
      <p className="text-scatter-selection" aria-live="polite">当前文案：Bounce Back. · 散开后约 3 秒自动归位</p>
      <FallingTextContent text={fallingText} onChange={value => { setFallingText(value); setReplayToken(token => token + 1) }} />
    </div>
    <div className="text-scatter-studio-canvas" aria-label="Falling Text 落差文字预览">
      <FallingText text={fallingText} replayToken={replayToken} />
    </div>
  </section>
}

function WatercolorStudio() {
  return <section className="watercolor-studio section-wrap" id="watercolor" aria-labelledby="watercolor-studio-title" data-watercolor-studio>
    <div className="watercolor-studio-copy">
      <p className="eyebrow">WATERCOLOR</p>
      <h2 id="watercolor-studio-title">让噪声像水彩一样流动。</h2>
      <p>Animated watercolor noise shader with two-color blend。移动光标，柔和的双色纹理会在指针附近产生细微的扭曲和聚散。</p>
      <p className="watercolor-studio-selection" aria-live="polite">公开默认值 · speed 0.60 · scale 0.60 · 6 层噪声 · 鼠标交互开启</p>
    </div>
    <ViewportCanvas className="watercolor-studio-canvas" aria-label="Watercolor animated noise preview" data-media-slot="watercolor">
      <Watercolor
        width="100%"
        height="100%"
        speed={0.6}
        scale={0.6}
        octaves={6}
        persistence={0.6}
        lacunarity={2.4}
        driftSpeed={0.04}
        warpSpeed={0.08}
        color1="#0a0a0a"
        color2="#e0e0e0"
        colorGain={1}
        saturation={0}
        brightness={0.15}
        opacity={1}
        cursorInteraction
        cursorIntensity={1}
        className="watercolor-studio-effect"
      >
        <div className="watercolor-studio-overlay" aria-hidden="true">
          <span>WATERCOLOR</span>
          <small>MOVE TO DISTORT</small>
        </div>
      </Watercolor>
    </ViewportCanvas>
  </section>
}

const wireframeBallTargets = [
  { label: '轨道图像', href: '#login' },
  { label: '文本散射', href: '#text-scatter' },
  { label: '水彩', href: '#watercolor' },
  { label: '渐变模糊', href: '#gradual-blur' },
  { label: '半色调揭示', href: '#halftone-reveal' },
  { label: '波动失真', href: '#ripple-distortion' },
  { label: '弹性网格', href: '#elastic-mesh' },
  { label: '总览', href: '#overview' },
  { label: '工作流', href: '#how-it-works' },
  { label: '图库', href: '#gallery' },
  { label: '上传', href: '#upload' },
  { label: '方案', href: '#pricing' },
]

function WireframeBallStudio() {
  const [activeTarget, setActiveTarget] = useState(null)

  const jumpToTarget = useCallback((index) => {
    const target = wireframeBallTargets[index % wireframeBallTargets.length]
    if (!target) return
    setActiveTarget(target)
    const id = target.href.slice(1)
    const section = document.getElementById(id)
    if (section) {
      window.history.pushState({}, '', target.href)
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.location.hash = target.href
    }
  }, [])

  return <section className="wireframe-ball-studio section-wrap" id="wireframe-ball" aria-labelledby="wireframe-ball-studio-title" data-wireframe-ball-studio>
    <div className="wireframe-ball-studio-copy">
      <p className="eyebrow">WIREFRAME BALL</p>
      <h2 id="wireframe-ball-studio-title">每个顶点，都通向一个功能。</h2>
      <p>一个持续旋转的线框多面体：边缘与顶点带着微光，光标会让它轻轻倾斜，拖拽后还会保留惯性。点击任意发光顶点，直接跳到站内对应功能区。</p>
      <p className="wireframe-ball-selection" aria-live="polite">
        {activeTarget ? `已定位：${activeTarget.label} · ${activeTarget.href}` : '12 个顶点 · 12 个站内入口 · 悬停倾斜 / 拖拽惯性开启'}
      </p>
      <div className="wireframe-ball-links" aria-label="线框球顶点对应的功能区">
        {wireframeBallTargets.map((target, index) => <a className={`wireframe-ball-link ${activeTarget?.href === target.href ? 'is-active' : ''}`} href={target.href} key={target.href} onClick={() => setActiveTarget(target)} data-wireframe-target={index}>
          <span>{String(index + 1).padStart(2, '0')}</span>{target.label}
        </a>)}
      </div>
    </div>
    <div className="wireframe-ball-studio-canvas" aria-label="Wireframe Ball interactive preview">
      <WireframeBall
        shape="icosahedron"
        detail={0}
        stretch={1.28}
        zoom={1}
        speed={1}
        wobble={0}
        showEdges
        edgeColor="#ffffff"
        edgeGlow={1}
        edgeThickness={0.02}
        showVertices
        vertexColor="#ffffff"
        vertexSize={0.032}
        vertexGlow={0.148}
        depthColor="#7aa2ff"
        depthTint={0}
        depthFade={0}
        backgroundColor="transparent"
        brightness={1}
        opacity={1}
        cursorInteraction
        cursorTilt={0.35}
        dragToSpin
        spinFriction={0.94}
        adaptiveQuality
        targetFps={60}
        dpr={2}
        onVertexClick={jumpToTarget}
        vertexTargets={wireframeBallTargets}
        className="wireframe-ball-studio-effect"
      >
        <div className="wireframe-ball-overlay" aria-hidden="true">
          <span>WIRE / FRAME</span>
          <small>CLICK A VERTEX TO NAVIGATE</small>
        </div>
      </WireframeBall>
    </div>
  </section>
}

const DEPTH_CARD_COUNT = 3

function pickDepthCards(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}` }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: DEPTH_CARD_COUNT }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const rawLabel = item?.label || `影像 ${String(index + 1).padStart(2, '0')}`
    const sourceLabel = String(rawLabel).replace(/\s+/g, ' ').trim()
    const label = `影像 ${String(item?.slot || index + 1).padStart(2, '0')}`
    return {
      src: item.src,
      label,
      sourceLabel,
    }
  })
}

function DepthCardStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [cards, setCards] = useState(() => pickDepthCards(candidates))
  const [activeIndex, setActiveIndex] = useState(null)
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setCards(current => {
      if (current.length === DEPTH_CARD_COUNT && current.every(card => candidates.some(item => item.src === card.src))) return current
      return pickDepthCards(candidates)
    })
  }, [candidates])

  const randomize = useCallback(() => {
    setCards(current => {
      let next = pickDepthCards(candidates)
      let attempts = 0
      while (candidates.length > DEPTH_CARD_COUNT && sameImageOrder(next, current) && attempts < 5) {
        next = pickDepthCards(candidates)
        attempts += 1
      }
      return next
    })
    setActiveIndex(null)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const selectCard = useCallback(index => setActiveIndex(index), [])
  const selection = activeIndex == null ? '悬停倾斜 · 聚光跟随 · 点击卡片可选中' : `已选第 ${activeIndex + 1} 张 · ${cards[activeIndex]?.sourceLabel || ''}`

  return <section className="depth-card-studio section-wrap" id="depth-card" aria-labelledby="depth-card-studio-title" data-depth-card-studio data-depth-card-count={cards.length} data-depth-card-sources={cards.map(card => card.src).join('|')}>
    <div className="depth-card-studio-copy">
      <p className="eyebrow">DEPTH CARD</p>
      <h2 id="depth-card-studio-title">让三张图拥有真实深度。</h2>
      <p>三张来自站内影像库的卡片，沿用公开 Depth Card 的透视倾斜、背景视差、聚光和内容显现。移动光标即可感受深度，点击可以选中当前卡片。</p>
      <button className="depth-random-button" type="button" aria-label="随机生成三张深度卡片" onClick={randomize} data-depth-randomize>
        <span>随机三张图片</span><b aria-hidden="true">↻</b>
      </button>
      <p className="depth-card-selection" aria-live="polite">{selection}</p>
      <div className="depth-upload-actions" role="group" aria-label="深度卡片上传">
        <p className="depth-upload-label">把一张新图放进三层深度卡片</p>
        <SessionImageUploadButton slot="depth-card" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="depth-card-studio-canvas" aria-label="Depth Card interactive preview" data-media-slot="depth-card">
      <div className="depth-card-grid">
        {cards.map((card, index) => <DepthCard
          key={`${card.src}-${shuffleToken}-${index}`}
          image={card.src}
          title={card.label}
          description="站内影像 · 深度预览"
          width={220}
          height={300}
          maxRotation={20}
          maxTranslation={20}
          borderRadius="16px"
          imageAlt={card.sourceLabel}
          spotlight
          spotlightColor="rgba(255, 255, 255, 0.5)"
          staggerDelay={100}
          revealAnimation="slide"
          respectReducedMotion
          onClick={() => selectCard(index)}
          className={`depth-card-studio-card ${activeIndex === index ? 'is-selected' : ''}`}
          data-depth-card-index={index}
        />)}
      </div>
      <p className="depth-card-stage-note">MOVE TO TILT · CLICK TO SELECT</p>
    </div>
  </section>
}

const LENTICULAR_ITEM_COUNT = 8

function pickLenticularItems(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: Math.min(LENTICULAR_ITEM_COUNT, Math.max(1, shuffled.length)) }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const slot = String(item?.slot || index + 1).padStart(2, '0')
    const rawSourceLabel = item?.label || `影像 ${slot}`
    return {
      id: `${item.src}-${index}`,
      src: item.src,
      label: `影像 ${slot}`,
      category: 'CORTEX ARCHIVE',
      sourceLabel: String(rawSourceLabel).replace(/\s+/g, ' ').trim(),
    }
  })
}

function LenticularCarouselStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [items, setItems] = useState(() => pickLenticularItems(candidates))
  const [activeIndex, setActiveIndex] = useState(2)
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setItems(current => {
      if (current.length && current.every(item => candidates.some(candidate => candidate.src === item.src))) return current
      return pickLenticularItems(candidates)
    })
  }, [candidates])

  useEffect(() => {
    setActiveIndex(index => items.length ? Math.min(index, items.length - 1) : 0)
  }, [items.length])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setItems(current => {
      let next = pickLenticularItems(candidates)
      let attempts = 0
      while (candidates.length > LENTICULAR_ITEM_COUNT && sameImageOrder(next, current) && attempts < 6) {
        next = pickLenticularItems(candidates)
        attempts += 1
      }
      return next
    })
    setActiveIndex(2)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const activeItem = items[activeIndex]
  const sourceSummary = activeItem?.sourceLabel || '暂无可用图片'

  return <section className="lenticular-studio section-wrap" id="lenticular-carousel" aria-labelledby="lenticular-studio-title" data-lenticular-studio data-lenticular-image-count={candidates.length} data-lenticular-set-size={items.length} data-lenticular-sources={items.map(item => item.src).join('|')} data-lenticular-active-index={activeIndex}>
    <div className="lenticular-studio-copy">
      <p className="eyebrow">LENTICULAR CAROUSEL</p>
      <h2 id="lenticular-studio-title">让卡片像透镜印刷一样翻转。</h2>
      <p>沿用公开 Lenticular Carousel 的透镜肋条、折射视差、彩色 foil 和聚焦轨道。悬停或聚焦卡片即可扫过镜面，拖动、键盘方向键和下方分段轨道都能切换。</p>
      <button className="lenticular-random-button" type="button" aria-label="随机生成一组透镜卡片" onClick={randomize} disabled={!candidates.length} data-lenticular-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="lenticular-selection" aria-live="polite">当前焦点：{sourceSummary} · {items.length} 张卡片 · 素材池 {candidates.length} 张</p>
      <div className="lenticular-upload-actions" role="group" aria-label="透镜卡片上传">
        <p className="lenticular-upload-label">把一张新图放进透镜翻转轨道</p>
        <SessionImageUploadButton slot="lenticular-carousel" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="lenticular-studio-visual">
      <div className="lenticular-studio-canvas" aria-label="Lenticular Carousel interactive preview" data-media-slot="lenticular-carousel">
        <button className="lenticular-refresh-button" type="button" aria-label="随机换一组透镜卡片" onClick={randomize} disabled={!candidates.length} data-lenticular-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <LenticularCarousel
          key={shuffleToken}
          items={items}
          initialIndex={Math.min(2, Math.max(0, items.length - 1))}
          cardWidth={250}
          aspectRatio="3 / 4"
          gap={24}
          borderRadius={14}
          strips={56}
          sweep={0.6}
          refraction={0.32}
          ridge={0.5}
          foil={0.5}
          foilScale={8}
          scrim={0.85}
          tilt={14}
          travel={0.64}
          lift={40}
          perspective={1200}
          inactiveScale={0.9}
          inactiveDim={0.55}
          speed={1}
          trigger="hover"
          showLabels
          labelColor="#ffffff"
          showControls
          showDots
          loop={false}
          autoplay={false}
          enableDrag
          enableKeyboard
          dpr={2}
          onIndexChange={setActiveIndex}
          className="lenticular-studio-effect"
        />
        <p className="lenticular-stage-note">SWEEP TO TURN · DRAG TO NAVIGATE</p>
      </div>
    </div>
  </section>
}

const PAGE_FLIP_LEAF_COUNT = 5

function pickPageFlipPages(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: PAGE_FLIP_LEAF_COUNT }, (_, index) => {
    const frontItem = shuffled[(index * 2) % shuffled.length]
    const backItem = shuffled[(index * 2 + 1) % shuffled.length]
    const frontSlot = String(frontItem?.slot || (index * 2) + 1).padStart(2, '0')
    const backSlot = String(backItem?.slot || (index * 2) + 2).padStart(2, '0')
    return {
      id: `${frontItem.src}-${backItem.src}-${index}`,
      front: frontItem.src,
      back: backItem.src,
      frontAlt: `影像 ${frontSlot}`,
      backAlt: `影像 ${backSlot}`,
      sourceLabel: `${frontItem.label || `影像 ${frontSlot}`} / ${backItem.label || `影像 ${backSlot}`}`,
    }
  })
}

function samePageFlipOrder(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item.front === second[index]?.front && item.back === second[index]?.back)
}

function PageFlipStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [pages, setPages] = useState(() => pickPageFlipPages(candidates))
  const [pageIndex, setPageIndex] = useState(0)
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setPages(current => {
      if (current.length === PAGE_FLIP_LEAF_COUNT && current.every(page => candidates.some(item => item.src === page.front) && candidates.some(item => item.src === page.back))) return current
      return pickPageFlipPages(candidates)
    })
  }, [candidates])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setPages(current => {
      let next = pickPageFlipPages(candidates)
      let attempts = 0
      while (candidates.length > PAGE_FLIP_LEAF_COUNT * 2 && samePageFlipOrder(next, current) && attempts < 6) {
        next = pickPageFlipPages(candidates)
        attempts += 1
      }
      return next
    })
    setPageIndex(0)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const activeLeaf = pages[Math.min(pageIndex, Math.max(0, pages.length - 1))]
  const sourceSummary = activeLeaf?.sourceLabel || '暂无可用图片'

  return <section className="page-flip-studio section-wrap" id="page-flip" aria-labelledby="page-flip-studio-title" data-page-flip-studio data-page-flip-image-count={candidates.length} data-page-flip-set-size={pages.length} data-page-flip-sources={pages.map(page => `${page.front}|${page.back}`).join('||')} data-page-flip-index={pageIndex}>
    <div className="page-flip-studio-copy">
      <p className="eyebrow">PAGE FLIP</p>
      <h2 id="page-flip-studio-title">让影像像一本书一样翻页。</h2>
      <p>五张双面影像组成一册可拖动的视觉书。点击或从右向左拖动翻页，左向拖动返回；每一页都沿着书脊旋转，保留公开 Page Flip 的透视、窥视角和纸张阴影。</p>
      <button className="page-flip-random-button" type="button" aria-label="随机生成一组翻页图片" onClick={randomize} disabled={!candidates.length} data-page-flip-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="page-flip-selection" aria-live="polite">当前页：{Math.min(pageIndex + 1, pages.length + 1)} / {pages.length + 1} · {sourceSummary} · 素材池 {candidates.length} 张</p>
      <div className="page-flip-upload-actions" role="group" aria-label="翻页影像上传">
        <p className="page-flip-upload-label">把一张新图放进书页翻转场景</p>
        <SessionImageUploadButton slot="page-flip" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="page-flip-studio-visual">
      <div className="page-flip-studio-canvas" aria-label="Page Flip interactive preview" data-media-slot="page-flip">
        <button className="page-flip-refresh-button" type="button" aria-label="随机换一组翻页图片" onClick={randomize} disabled={!candidates.length} data-page-flip-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <PageFlip
          key={shuffleToken}
          pages={pages}
          pageWidth={220}
          pageHeight={320}
          pageRadius={4}
          pageColor="#171717"
          perspective={1200}
          spineShift={110}
          turnAngle={180}
          peekAngle={10}
          duration={0.55}
          stagger={0.08}
          ease="easeInOut"
          shadow={0.3}
          trigger="click"
          closeOnLeave
          interactive
          initialIndex={0}
          onPageChange={setPageIndex}
          className="page-flip-studio-effect"
        />
        <p className="page-flip-stage-note">DRAG TO TURN · ARROW KEYS</p>
      </div>
    </div>
  </section>
}

const PARALLAX_IMAGE_COUNT = 7

function pickParallaxImages(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: Math.min(PARALLAX_IMAGE_COUNT, Math.max(1, shuffled.length)) }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const slot = String(item?.slot || index + 1).padStart(2, '0')
    return {
      id: `${item.src}-${index}`,
      src: item.src,
      label: `影像 ${slot}`,
      sourceLabel: String(item?.label || `影像 ${slot}`).replace(/\s+/g, ' ').trim(),
    }
  })
}

function sameParallaxOrder(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item.src === second[index]?.src)
}

function ParallaxCarouselStudio({ uploadedImages = [], preview, onPreviewChange, onPreviewClear }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [carouselImages, setCarouselImages] = useState(() => pickParallaxImages(candidates))
  const [activeIndex, setActiveIndex] = useState(0)
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setCarouselImages(current => {
      if (current.length && current.every(image => candidates.some(candidate => candidate.src === image.src))) return current
      return pickParallaxImages(candidates)
    })
  }, [candidates])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setCarouselImages(current => {
      let next = pickParallaxImages(candidates)
      let attempts = 0
      while (candidates.length > PARALLAX_IMAGE_COUNT && sameParallaxOrder(next, current) && attempts < 6) {
        next = pickParallaxImages(candidates)
        attempts += 1
      }
      return next
    })
    setActiveIndex(0)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const activeImage = carouselImages[activeIndex] || carouselImages[0]
  const sourceSummary = activeImage?.sourceLabel || '暂无可用图片'

  return <section className="parallax-studio section-wrap" id="parallax-carousel" aria-labelledby="parallax-studio-title" data-parallax-studio data-parallax-image-count={candidates.length} data-parallax-set-size={carouselImages.length} data-parallax-index={activeIndex} data-parallax-sources={carouselImages.map(image => image.src).join('|')}>
    <div className="parallax-studio-copy">
      <p className="eyebrow">PARALLAX CAROUSEL</p>
      <h2 id="parallax-studio-title">让每一张影像都带着视差移动。</h2>
      <p>横向拖动或滚轮滑过站内影像，卡片会以平滑的惯性移动，画面纹理则反向偏移，形成公开 Parallax Carousel 的空间感。点击缩略卡片可直接聚焦。</p>
      <button className="parallax-random-button" type="button" aria-label="随机生成一组视差图片" onClick={randomize} disabled={!candidates.length} data-parallax-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="parallax-selection" aria-live="polite">当前焦点：影像 {String(activeIndex + 1).padStart(2, '0')} · {sourceSummary} · 素材池 {candidates.length} 张</p>
      <div className="parallax-upload-actions" role="group" aria-label="视差影像上传">
        <p className="parallax-upload-label">把一张新图放进视差移动轨道</p>
        <SessionImageUploadButton slot="parallax-carousel" preview={preview} onChange={onPreviewChange} onClear={onPreviewClear} inline />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="parallax-studio-visual">
      <div className="parallax-studio-canvas" aria-label="Parallax Carousel interactive preview" data-media-slot="parallax-carousel">
        <button className="parallax-refresh-button" type="button" aria-label="随机换一组视差图片" onClick={randomize} disabled={!candidates.length} data-parallax-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <ParallaxCarousel
          key={shuffleToken}
          images={carouselImages}
          imageWidth={360}
          imageHeight={480}
          gap={32}
          parallaxIntensity={0.4}
          uvScale={0.85}
          lerp={0.08}
          wheelSensitivity={1}
          dragSensitivity={1.4}
          loop={false}
          borderRadius={16}
          autoplaySpeed={0}
          pauseOnHover
          showProgress
          onIndexChange={setActiveIndex}
          className="parallax-studio-effect"
        />
        <p className="parallax-stage-note">DRAG / WHEEL TO MOVE · CLICK TO FOCUS</p>
      </div>
    </div>
  </section>
}

function pickPixelRevealImages(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: Math.min(PIXEL_REVEAL_IMAGE_COUNT, Math.max(1, shuffled.length)) }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const slot = String(item?.slot || index + 1).padStart(2, '0')
    return {
      id: `${item.src}-${index}`,
      src: item.src,
      label: `影像 ${slot}`,
      sourceLabel: String(item?.label || `影像 ${slot}`).replace(/\s+/g, ' ').trim(),
    }
  })
}

function samePixelRevealOrder(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item.src === second[index]?.src)
}

function PixelRevealStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [revealImages, setRevealImages] = useState(() => pickPixelRevealImages(candidates))
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setRevealImages(current => {
      if (current.length && current.every(image => candidates.some(candidate => candidate.src === image.src))) return current
      return pickPixelRevealImages(candidates)
    })
  }, [candidates])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setRevealImages(current => {
      let next = pickPixelRevealImages(candidates)
      let attempts = 0
      while (candidates.length > PIXEL_REVEAL_IMAGE_COUNT && samePixelRevealOrder(next, current) && attempts < 6) {
        next = pickPixelRevealImages(candidates)
        attempts += 1
      }
      return next
    })
    setShuffleToken(token => token + 1)
  }, [candidates])

  const sourceSummary = revealImages.map(image => image.label).join(' · ') || '暂无可用图片'

  return <section className="pixel-reveal-studio section-wrap" id="pixel-reveal" aria-labelledby="pixel-reveal-studio-title" data-pixel-reveal-studio data-pixel-reveal-image-count={candidates.length} data-pixel-reveal-set-size={revealImages.length} data-pixel-reveal-sources={revealImages.map(image => image.src).join('|')}>
    <div className="pixel-reveal-studio-copy">
      <p className="eyebrow">PIXEL REVEAL</p>
      <h2 id="pixel-reveal-studio-title">一组影像，从像素中显现。</h2>
      <p>进入视口后，遮罩会以 20px 像素网格沿着画面向下扫开；网格边缘保留轻微噪声，因此每张影像都有自然的显现节奏。</p>
      <button className="pixel-reveal-random-button" type="button" aria-label="随机生成一组像素揭示图片" onClick={randomize} disabled={!candidates.length} data-pixel-reveal-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="pixel-reveal-selection" aria-live="polite">当前组：{sourceSummary} · 素材池 {candidates.length} 张</p>
      <div className="pixel-reveal-upload-actions" role="group" aria-label="像素显现上传">
        <p className="pixel-reveal-upload-label">把一组新图放进像素显现</p>
        <div className="pixel-reveal-local-upload" data-session-upload-target="pixel-reveal" />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="pixel-reveal-studio-visual">
      <ViewportCanvas className="pixel-reveal-studio-canvas" aria-label="Pixel Reveal image preview" data-media-slot="pixel-reveal">
        <button className="pixel-reveal-refresh-button" type="button" aria-label="随机换一组像素揭示图片" onClick={randomize} disabled={!candidates.length} data-pixel-reveal-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <div className="pixel-reveal-grid">
          {revealImages.map((image, index) => <div className={`pixel-reveal-card pixel-reveal-card--${index + 1}`} key={`${shuffleToken}-${image.id}`}>
            <PixelReveal
              imageSrc={image.src}
              width="100%"
              height="100%"
              gridSize={20}
              transitionColor="#242424"
              edgeHeight={0.2}
              duration={1.6}
              easing="linear"
              direction="down"
              autoTrigger
              triggerOnce
              triggerThreshold={0.12}
              borderRadius={index === 0 ? 18 : 14}
              className="pixel-reveal-studio-effect"
              alt={image.sourceLabel}
            />
          </div>)}
        </div>
        <p className="pixel-reveal-stage-note">PIXELS / AUTO REVEAL</p>
      </ViewportCanvas>
    </div>
  </section>
}

function pickPixelateHoverImages(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: Math.min(PIXELATE_HOVER_IMAGE_COUNT, Math.max(1, shuffled.length)) }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const slot = String(item?.slot || index + 1).padStart(2, '0')
    return {
      id: `${item.src}-${index}`,
      src: item.src,
      label: `影像 ${slot}`,
      sourceLabel: String(item?.label || `影像 ${slot}`).replace(/\s+/g, ' ').trim(),
    }
  })
}

function samePixelateHoverOrder(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item.src === second[index]?.src)
}

function PixelateHoverStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [hoverImages, setHoverImages] = useState(() => pickPixelateHoverImages(candidates))
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setHoverImages(current => {
      if (current.length && current.every(image => candidates.some(candidate => candidate.src === image.src))) return current
      return pickPixelateHoverImages(candidates)
    })
  }, [candidates])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setHoverImages(current => {
      let next = pickPixelateHoverImages(candidates)
      let attempts = 0
      while (candidates.length > PIXELATE_HOVER_IMAGE_COUNT && samePixelateHoverOrder(next, current) && attempts < 6) {
        next = pickPixelateHoverImages(candidates)
        attempts += 1
      }
      return next
    })
    setShuffleToken(token => token + 1)
  }, [candidates])

  const sourceSummary = hoverImages.map(image => image.label).join(' · ') || '暂无可用图片'

  return <section className="pixelate-hover-studio section-wrap" id="pixelate-hover" aria-labelledby="pixelate-hover-studio-title" data-pixelate-hover-studio data-pixelate-hover-image-count={candidates.length} data-pixelate-hover-set-size={hoverImages.length} data-pixelate-hover-sources={hoverImages.map(image => image.src).join('|')}>
    <div className="pixelate-hover-studio-copy">
      <p className="eyebrow">PIXELATE HOVER</p>
      <h2 id="pixelate-hover-studio-title">让影像在光标下浮现。</h2>
      <p>每张图片先保持细密的像素化质感；移动光标时，圆形区域会以柔和边缘还原清晰画面。停下操作后，自动光标会继续在画面中游走。</p>
      <button className="pixelate-hover-random-button" type="button" aria-label="随机生成一组像素漂浮图片" onClick={randomize} disabled={!candidates.length} data-pixelate-hover-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="pixelate-hover-selection" aria-live="polite">当前组：{sourceSummary} · 素材池 {candidates.length} 张</p>
      <div className="pixelate-hover-upload-actions" role="group" aria-label="光标显现上传">
        <p className="pixelate-hover-upload-label">把一组新图放进光标显现</p>
        <div className="pixelate-hover-local-upload" data-session-upload-target="pixelate-hover" />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="pixelate-hover-studio-visual">
      <ViewportCanvas className="pixelate-hover-studio-canvas" aria-label="Pixelate Hover image preview" data-media-slot="pixelate-hover">
        <button className="pixelate-hover-refresh-button" type="button" aria-label="随机换一组像素漂浮图片" onClick={randomize} disabled={!candidates.length} data-pixelate-hover-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <div className="pixelate-hover-grid">
          {hoverImages.map((image, index) => <div className={`pixelate-hover-card pixelate-hover-card--${index + 1}`} key={`${shuffleToken}-${image.id}`}>
            <PixelateHover
              image={image.src}
              pixelSize={30}
              cursorRadius={350}
              falloff={1}
              smoothing={0.05}
              autoDemo
              autoSpeed={0.5}
              autoResumeDelay={1500}
              width="100%"
              height="100%"
              borderRadius={index === 0 ? 18 : 14}
              className="pixelate-hover-studio-effect"
              alt={image.sourceLabel}
            />
          </div>)}
        </div>
        <p className="pixelate-hover-stage-note">MOVE / REVEAL / AUTO DEMO</p>
      </ViewportCanvas>
    </div>
  </section>
}

function pickRotatingCardImages(candidates = []) {
  const sourcePool = candidates.length
    ? candidates
    : photos.map((src, index) => ({ src, label: `备用影像 ${String(index + 1).padStart(2, '0')}`, slot: index + 1 }))
  if (!sourcePool.length) return []
  const shuffled = shuffleImages(sourcePool)
  return Array.from({ length: Math.min(ROTATING_CARD_IMAGE_COUNT, Math.max(1, shuffled.length)) }, (_, index) => {
    const item = shuffled[index % shuffled.length]
    const slot = String(item?.slot || index + 1).padStart(2, '0')
    return {
      id: `${item.src}-${index}`,
      image: item.src,
      label: `影像 ${slot}`,
      sourceLabel: String(item?.label || `影像 ${slot}`).replace(/\s+/g, ' ').trim(),
    }
  })
}

function sameRotatingCardOrder(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item.image === second[index]?.image)
}

function RotatingCardsStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [rotatingCards, setRotatingCards] = useState(() => pickRotatingCardImages(candidates))
  const [activeIndex, setActiveIndex] = useState(0)
  const [shuffleToken, setShuffleToken] = useState(0)

  useEffect(() => {
    setRotatingCards(current => {
      if (current.length && current.every(card => candidates.some(candidate => candidate.src === card.image))) return current
      return pickRotatingCardImages(candidates)
    })
  }, [candidates])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    setRotatingCards(current => {
      let next = pickRotatingCardImages(candidates)
      let attempts = 0
      while (candidates.length > ROTATING_CARD_IMAGE_COUNT && sameRotatingCardOrder(next, current) && attempts < 6) {
        next = pickRotatingCardImages(candidates)
        attempts += 1
      }
      return next
    })
    setActiveIndex(0)
    setShuffleToken(token => token + 1)
  }, [candidates])

  const activeCard = rotatingCards[activeIndex] || rotatingCards[0]

  return <section className="rotating-cards-studio section-wrap" id="rotating-cards" aria-labelledby="rotating-cards-studio-title" data-rotating-cards-studio data-rotating-image-count={candidates.length} data-rotating-set-size={rotatingCards.length} data-rotating-active-index={activeIndex} data-rotating-sources={rotatingCards.map(card => card.image).join('|')}>
    <div className="rotating-cards-studio-copy">
      <p className="eyebrow">ROTATING CARDS</p>
      <h2 id="rotating-cards-studio-title">让影像围绕视线旋转。</h2>
      <p>十张站内影像组成一个旋转圆环。你可以拖动、滚轮旋转或点击任意卡片聚焦；停在卡片上时，自动旋转会暂时停下。</p>
      <button className="rotating-cards-random-button" type="button" aria-label="随机生成一组旋转卡片图片" onClick={randomize} disabled={!candidates.length} data-rotating-cards-randomize>
        <span>随机生成一组</span><b aria-hidden="true">↻</b>
      </button>
      <p className="rotating-cards-selection" aria-live="polite">当前焦点：{activeCard ? `${activeCard.label} · ${activeCard.sourceLabel}` : '暂无可用图片'} · 素材池 {candidates.length} 张</p>
      <div className="rotating-cards-upload-actions" role="group" aria-label="围绕视线旋转上传">
        <p className="rotating-cards-upload-label">把一组新图放进旋转圆环</p>
        <div className="rotating-cards-local-upload" data-session-upload-target="rotating-cards" />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="rotating-cards-studio-visual">
      <div className="rotating-cards-studio-canvas" aria-label="Rotating Cards image preview" data-media-slot="rotating-cards">
        <button className="rotating-cards-refresh-button" type="button" aria-label="随机换一组旋转卡片图片" onClick={randomize} disabled={!candidates.length} data-rotating-cards-randomize-icon>
          <span aria-hidden="true">↻</span>
        </button>
        <RotatingCards
          key={shuffleToken}
          cards={rotatingCards}
          radius={360}
          duration={20}
          cardWidth={160}
          cardHeight={190}
          pauseOnHover
          reverse={false}
          draggable
          autoPlay
          mouseWheel
          initialRotation={0}
          onCardClick={(_, index) => setActiveIndex(index)}
          className="rotating-cards-studio-effect"
        />
        <p className="rotating-cards-stage-note">DRAG / WHEEL / CLICK TO FOCUS</p>
      </div>
    </div>
  </section>
}

function GradualBlurStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [currentSource, setCurrentSource] = useState(() => candidates[0]?.src || gradualBlurDefaultSource)

  useEffect(() => {
    if (!candidates.length) {
      if (currentSource !== gradualBlurDefaultSource) setCurrentSource(gradualBlurDefaultSource)
      return
    }
    if (!candidates.some(item => item.src === currentSource)) setCurrentSource(candidates[0].src)
  }, [candidates, currentSource])

  const currentItem = candidates.find(item => item.src === currentSource) || {
    src: currentSource || gradualBlurDefaultSource,
    label: candidates.length ? '加载中…' : 'React Bits 官方示例图'
  }

  const randomize = useCallback(() => {
    if (!candidates.length) return
    const currentIndex = candidates.findIndex(item => item.src === currentSource)
    let nextIndex = Math.floor(Math.random() * candidates.length)
    if (candidates.length > 1 && nextIndex === currentIndex) nextIndex = (nextIndex + 1) % candidates.length
    setCurrentSource(candidates[nextIndex].src)
  }, [candidates, currentSource])

  return <section className="gradual-studio section-wrap" id="gradual-blur" aria-labelledby="gradual-studio-title" data-gradual-image-count={candidates.length} data-gradual-current-src={currentItem.src}>
    <div className="gradual-studio-copy">
      <p className="eyebrow">GRADUAL BLUR</p>
      <h2 id="gradual-studio-title">让图像在渐变模糊中显影。</h2>
      <p>沿用 React Bits 的多层 backdrop-filter 遮罩；在预览框内向下滚动，画面会从清晰逐级过渡到柔和模糊。</p>
      <button className="gradual-random-button" type="button" aria-label="随机生成一张渐变模糊图片" onClick={randomize} disabled={!candidates.length} data-gradual-randomize>
        <span>随机生成一张</span><b aria-hidden="true">↻</b>
      </button>
      <p className="gradual-selection" aria-live="polite">当前素材：{currentItem.label} · 可随机 {candidates.length} 张</p>
      <div className="gradual-upload-actions" role="group" aria-label="渐变模糊上传">
        <p className="gradual-upload-label">把一张新图放进渐变模糊</p>
        <div className="gradual-local-upload" data-session-upload-target="gradual-blur" />
        <MobileUploadLinks />
      </div>
    </div>
    <div className="gradual-studio-canvas" aria-label="Gradual Blur image preview" data-media-slot="gradual-blur">
      <div className="gradual-studio-scroll" data-gradual-scroll>
        <p className="gradual-studio-instruction">Scroll Down.</p>
        <CompleteSplitImage key={currentItem.src} className="gradual-studio-image" src={currentItem.src} alt={currentItem.label} />
        <p className="gradual-studio-word">Gradual Blur</p>
      </div>
      <GradualBlur
        position="bottom"
        strength={2}
        height="7rem"
        divCount={5}
        curve="bezier"
        target="parent"
        exponential
        opacity={1}
        zIndex={10}
        width="100%"
        className="gradual-studio-effect"
      />
      <button className="gradual-refresh-button" type="button" aria-label="随机换一张渐变模糊图片" onClick={randomize} disabled={!candidates.length} data-gradual-randomize-icon>
        <span aria-hidden="true">↻</span>
      </button>
    </div>
  </section>
}

function RippleDistortionStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [currentSource, setCurrentSource] = useState(rippleDefaultSource)
  const [currentLabel, setCurrentLabel] = useState('React Bits 官方示例图')

  useEffect(() => {
    if (!candidates.length) {
      setCurrentSource(rippleDefaultSource)
      setCurrentLabel('React Bits 官方示例图')
      return
    }
    if (!candidates.some(item => item.src === currentSource)) {
      setCurrentSource(candidates[0].src)
      setCurrentLabel(candidates[0].label)
    }
  }, [candidates, currentSource])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    const currentIndex = candidates.findIndex(item => item.src === currentSource)
    let nextIndex = Math.floor(Math.random() * candidates.length)
    if (candidates.length > 1 && nextIndex === currentIndex) nextIndex = (nextIndex + 1) % candidates.length
    const next = candidates[nextIndex]
    setCurrentSource(next.src)
    setCurrentLabel(next.label)
  }, [candidates, currentSource])

  return <section className="ripple-studio section-wrap" id="ripple-distortion" aria-labelledby="ripple-studio-title" data-ripple-image-count={candidates.length} data-ripple-current-src={currentSource}>
    <div className="ripple-studio-copy">
      <p className="eyebrow">RIPPLE DISTORTION</p>
      <h2 id="ripple-studio-title">让每一张图，留下波动。</h2>
      <p>沿用 React Bits 的 OGL 波纹失真结构；移动指针时，画面会留下逐渐消散的水波。</p>
      <button className="ripple-random-button" type="button" aria-label="随机换一张图片" onClick={randomize} disabled={!candidates.length} data-ripple-randomize>
        <span>随机生成一张</span><b aria-hidden="true">↗</b>
      </button>
      <p className="ripple-selection" aria-live="polite">当前素材：{currentLabel} · 可随机 {candidates.length} 张</p>
      <div className="ripple-upload-actions" role="group" aria-label="波动影像上传">
        <p className="ripple-upload-label">把一张新图放进波动失真</p>
        <div className="ripple-local-upload" data-session-upload-target="ripple-distortion" />
        <MobileUploadLinks />
      </div>
    </div>
    <ViewportCanvas className="ripple-studio-canvas" aria-label="Ripple Distortion image preview" data-media-slot="ripple-distortion">
      <RippleDistortion
        key={currentSource}
        src={currentSource}
        trigger="hover"
        quality="low"
        className="ripple-studio-effect"
      />
    </ViewportCanvas>
  </section>
}

function ElasticMeshStudio({ uploadedImages = [] }) {
  const candidates = useMemo(() => getImageCandidates(uploadedImages), [uploadedImages])
  const [currentSource, setCurrentSource] = useState(() => candidates[0]?.src || '')
  const [currentLabel, setCurrentLabel] = useState(() => candidates[0]?.label || '暂无可用图片')

  useEffect(() => {
    if (!candidates.length) {
      setCurrentSource('')
      setCurrentLabel('暂无可用图片')
      return
    }
    if (!candidates.some(item => item.src === currentSource)) {
      setCurrentSource(candidates[0].src)
      setCurrentLabel(candidates[0].label)
    }
  }, [candidates, currentSource])

  const randomize = useCallback(() => {
    if (!candidates.length) return
    const currentIndex = candidates.findIndex(item => item.src === currentSource)
    let nextIndex = Math.floor(Math.random() * candidates.length)
    if (candidates.length > 1 && nextIndex === currentIndex) nextIndex = (nextIndex + 1) % candidates.length
    const next = candidates[nextIndex]
    setCurrentSource(next.src)
    setCurrentLabel(next.label)
  }, [candidates, currentSource])

  return <section className="elastic-studio section-wrap" id="elastic-mesh" aria-labelledby="elastic-studio-title" data-elastic-image-count={candidates.length} data-elastic-current-src={currentSource}>
    <div className="elastic-studio-copy">
      <p className="eyebrow">ELASTIC MESH</p>
      <h2 id="elastic-studio-title">把画面拉成有弹性的网格。</h2>
      <p>沿用 React Bits 的 OGL 弹簧网格；移动指针，图片会像一张有张力的薄膜一样回弹。</p>
      <button className="elastic-random-button" type="button" aria-label="随机换一张弹性网格图片" onClick={randomize} disabled={!candidates.length} data-elastic-randomize>
        <span>随机换图</span><b aria-hidden="true">↗</b>
      </button>
      <p className="elastic-selection" aria-live="polite">当前素材：{currentLabel} · 可随机 {candidates.length} 张</p>
      <div className="elastic-upload-actions" role="group" aria-label="弹性网格上传">
        <p className="elastic-upload-label">把一张新图放进弹性网格</p>
        <div className="elastic-local-upload" data-session-upload-target="elastic-mesh" />
        <MobileUploadLinks />
      </div>
    </div>
    <ViewportCanvas className="elastic-studio-canvas" aria-label="Elastic Mesh image preview" data-media-slot="elastic-mesh">
      <ElasticMesh
        key={currentSource}
        image={currentSource}
        interaction="hover"
        className="elastic-studio-effect"
      />
    </ViewportCanvas>
  </section>
}

function ScrollExpandIntro({ onComplete }) {
  const introRef = useRef(null)
  const [leaving, setLeaving] = useState(false)
  const completionStartedRef = useRef(false)
  const completionTimerRef = useRef(0)

  useEffect(() => {
    const root = introRef.current?.querySelector('.scroll-expand')
    if (!root) return undefined

    const complete = () => {
      if (completionStartedRef.current) return
      completionStartedRef.current = true
      setLeaving(true)
      completionTimerRef.current = window.setTimeout(() => onComplete?.(), 720)
    }
    const onScroll = () => {
      const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight)
      if (maxScroll > 0 && root.scrollTop >= maxScroll - Math.max(2, root.clientHeight * 0.012)) complete()
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (completionTimerRef.current) window.clearTimeout(completionTimerRef.current)
    }
  }, [onComplete])

  return <section ref={introRef} className={`entry-scroll-expand ${leaving ? 'is-leaving' : ''}`} aria-label="Scroll expand introduction">
    <ScrollExpand
      src={`${import.meta.env.BASE_URL}media/scroll-expand-demo.jpg`}
      alt="Mountain range at sunrise"
      title="Built to scale"
      scrollHint="Scroll inside the frame"
      startWidth={42}
      startHeight={58}
      startRadius={24}
      endRadius={0}
      mediaZoom={1.35}
      scrollDistance={1.2}
      holdDistance={0.35}
      smoothing={0.1}
      overlayScrim={0.45}
      enabled
      tabIndex={0}
      aria-label="Scroll inside the frame to expand the image"
    >
      <h2 style={{ margin: 0, color: '#fff', fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        Every pixel, everywhere
      </h2>
      <p style={{ maxWidth: '30rem', margin: '0.75rem 0 0', color: 'rgba(255,255,255,0.72)', fontSize: '1rem', lineHeight: 1.5 }}>
        The frame opens up as you scroll and hands the whole stage to your media.
      </p>
    </ScrollExpand>
  </section>
}

function WeChatVideoArchive({ videos = wechatVideos }) {
  const uploadedVideoCount = Math.max(0, videos.length - wechatVideos.length)
  return <section className="wechat-video-archive section-wrap" id="wechat-videos" aria-labelledby="wechat-videos-title">
    <div className="wechat-video-archive-intro">
      <div>
        <p className="eyebrow">FROM YOUR CAMERA ROLL</p>
        <h2 id="wechat-videos-title">Two new moments,<br />kept in full.</h2>
      </div>
      <p className="wechat-video-archive-note">{uploadedVideoCount ? `已归档 ${uploadedVideoCount} 个手机上传视频 · 保留原文件` : 'Received at 09:08 · stored locally in this site'}</p>
    </div>
    <div className="wechat-video-list" data-video-archive-count={videos.length} data-uploaded-video-count={uploadedVideoCount}>
      {videos.map((video, index) => <Reveal key={`${video.id || video.src}-${index}`} delay={index * 100}>
        <article className={`wechat-video-card ${index === 1 ? 'is-portrait' : ''}`}>
          <div className="wechat-video-card-meta"><span>{String(index + 1).padStart(2, '0')}</span><span>{video.label}</span></div>
          <video
            className="wechat-video-media"
            style={{ aspectRatio: video.aspectRatio }}
            src={video.src}
            poster={video.poster}
            controls
            playsInline
            preload="metadata"
            aria-label={video.label}
            data-media-slot={`wechat-video-${index + 1}`}
          />
        </article>
      </Reveal>)}
    </div>
  </section>
}

function Standard() {
  const ref = useRef(null)
  const progress = useTopProgress(ref)
  const words = ['Almost', 'real', 'is', 'not', 'real.', 'Cortex', 'was', 'built', 'for', 'the', 'last', 'one', 'percent', '—', 'pores,', 'grain,', 'the', 'way', 'light', 'falls', 'off', 'a', 'face.', 'It', 'renders', 'thousands', 'of', 'frames', 'and', 'reviews', 'every', 'single', 'one.', 'You', 'only', 'ever', 'see', 'the', 'keepers.']
  return <section aria-label="The Cortex standard" className="standard section-wrap">
    <p className="standard-copy" ref={ref}>{words.map((word, index) => {
      const start = index / words.length
      const end = (index + 1) / words.length
      const opacity = .12 + .88 * clamp((progress - start) / Math.max(.0001, end - start))
      return <span style={{ opacity }} key={index}>{word} </span>
    })}</p>
  </section>
}

function Features() {
  const [active, setActive] = useState(-1)
  const [previewImages, setPreviewImages] = useState(() => shuffleImages(personalArchiveItems.map(item => item.image)))
  const [hoverImageIndex, setHoverImageIndex] = useState(0)
  const [pointer, setPointer] = useState({ x: 0, y: 0, rotate: 0 })
  const velocityRef = useRef({ x: 0, time: performance.now() })
  const imageIndexRef = useRef(0)
  const lastImageChangeRef = useRef(0)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const pointerFrameRef = useRef(0)
  const pendingPointerRef = useRef(null)

  useEffect(() => () => {
    if (pointerFrameRef.current) cancelAnimationFrame(pointerFrameRef.current)
  }, [])

  const trackPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const now = performance.now()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const velocity = (x - velocityRef.current.x) / Math.max(1, now - velocityRef.current.time) * 16
    velocityRef.current = { x, time: now }
    pendingPointerRef.current = { x, y, rotate: Math.max(-8, Math.min(8, velocity)) }
    if (!pointerFrameRef.current) {
      pointerFrameRef.current = requestAnimationFrame(() => {
        pointerFrameRef.current = 0
        if (pendingPointerRef.current) setPointer(pendingPointerRef.current)
      })
    }

    // One preview slot advances through the shuffled full archive as the pointer
    // travels. The distance/time gate keeps high-frequency pointer events from
    // creating a burst of state updates or duplicate preview elements.
    const distance = Math.hypot(x - lastPointerRef.current.x, y - lastPointerRef.current.y)
    if (distance >= 7 && now - lastImageChangeRef.current >= 42) {
      imageIndexRef.current = (imageIndexRef.current + 1) % previewImages.length
      if (imageIndexRef.current === 0) {
        const next = shuffleImages(previewImages)
        // Avoid repeating the last card at the boundary between two rounds.
        if (next[0] === previewImages[previewImages.length - 1] && next.length > 1) {
          ;[next[0], next[1]] = [next[1], next[0]]
        }
        setPreviewImages(next)
      }
      setHoverImageIndex(imageIndexRef.current)
      lastImageChangeRef.current = now
      lastPointerRef.current = { x, y }
    }
    if (active < 0) setActive(0)
  }

  const hoverImage = previewImages[hoverImageIndex] || previewImages[0]
  return <section className="section product-section" id="overview">
    <Reveal className="intro-block"><MaskedHeading text="Built for the last one percent" tag="h2" src={featureImages[0]} fillScale={1.25} parallax={26} drift={18} align="left" weight={500} tracking={-0.025} lineHeight={1.05} textScale={0.065} reveal="rise" trigger="view" className="overview-masked-heading" style={{ maxWidth: '800px' }} /><p>Most generators get you close. Cortex is engineered for the part that makes people stop scrolling and ask what camera you used.</p></Reveal>
    <div className="feature-grid" onPointerMove={trackPointer} onPointerLeave={() => setActive(-1)} data-feature-frame-count={previewImages.length}>
      <div className={`feature-hover-media ${active > -1 ? 'is-visible' : ''}`} style={{ transform: `translate(${pointer.x - 18}px, ${pointer.y - 178}px) rotate(${pointer.rotate}deg)` }} aria-hidden="true" data-feature-frame={hoverImageIndex + 1}>
        <img src={hoverImage} alt="" loading="lazy" decoding="async" />
      </div>
      {featureCards.map(([number, title, copy], index) => <Reveal key={title} delay={index * 80}><article className="feature-card" onPointerEnter={() => setActive(index)}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div><img className="feature-mobile-image" src={previewImages[index]} alt="" loading="lazy" decoding="async" /><Arrow /></article></Reveal>)}
    </div>
  </section>
}

function PhoneFlow() {
  const ref = useRef(null)
  const progress = useSectionProgress(ref)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 590px)')
    const update = () => setCompact(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const active = compact ? 2 : Math.min(processCards.length - 1, Math.floor(progress * processCards.length))
  const [number, title, copy] = processCards[active]
  return <section id="how-it-works" className="flow-section" ref={ref}>
    <div className="flow-sticky">
      <div className="flow-grid section-wrap">
        <div className="flow-lead">
          <h2>From sentence to keeper</h2>
          <p>The whole pipeline lives in one app. No desktop, no exports, no editing suite — just the loop below, on repeat.</p>
          <div className="flow-current" aria-live="polite"><span>{number} / 04</span><h3>{title}</h3><p>{copy}</p></div>
        </div>
        <div className="phone-shell" data-media-slot="app-preview">
          <div className="phone-island" />
          <FlowPhoneScreen key={active} active={active} />
        </div>
        <div className="flow-details" aria-label="Workflow steps">
          {processCards.map(([step, stepTitle, stepCopy], index) => <article className={`flow-step ${active === index ? 'is-active' : ''}`} key={stepTitle}><span>{step}</span><div><h3>{stepTitle}</h3><p>{stepCopy}</p></div><i>{active === index ? '●' : '○'}</i></article>)}
        </div>
      </div>
    </div>
  </section>
}

function FlowPhoneScreen({ active }) {
  const screens = [
    <><p className="small-label">NEW SHOT</p><h3>What do you see?</h3><div className="prompt-bubble">35mm portrait at golden hour, wind in her hair, faint film grain</div><div className="prompt-tags"><span>Portrait</span><span>35mm</span><span>Golden hour</span><span>Grain</span></div><button className="generate-button" type="button"><i /> Generate <span>↗</span></button><div className="phone-divider" /><div className="take-row"><div><p>READY</p><strong>Describe it like a director</strong></div><span>01</span></div></>,
    <><p className="small-label">GENERATING</p><h3>Reading the light</h3><div className="render-grid"><img src={photos[1]} alt="" loading="lazy" decoding="async" /><img src={photos[3]} alt="" loading="lazy" decoding="async" /><img src={photos[5]} alt="" loading="lazy" decoding="async" /><img src={photos[7]} alt="" loading="lazy" decoding="async" /></div><div className="render-progress"><span /><b>Four takes, two more seconds</b></div><div className="phone-divider" /><div className="take-row"><div><p>ENGINE</p><strong>4 takes · 4 interpretations</strong></div><span className="ring" /></div></>,
    <><p className="small-label">REVIEW PASS</p><h3>Close enough<br />to keep?</h3><div className="review-frame"><img src={photos[2]} alt="Temporary review frame" loading="lazy" decoding="async" /><span>100%</span></div><div className="review-checks"><p><i>✓</i> Anatomy holds up</p><p><i>✓</i> Light reads true</p><p><i>✓</i> No broken details</p></div></>,
    <><p className="small-label">CAMERA ROLL</p><h3>Keep the take</h3><div className="library-frame"><img src={photos[4]} alt="Temporary saved frame" loading="lazy" decoding="async" /><div><p>TAKE 3 OF 4</p><strong>Passed review</strong><small>4K still · no artifacts</small></div></div><button className="generate-button is-saved" type="button"><i /> Saved to camera roll <span>✓</span></button><div className="library-dots"><i /><i /><i /><i /></div></>,
  ]
  return <div className={`phone-screen phone-screen-${active}`}>{screens[active]}</div>
}

function GalleryTrack({ shots, direction, row }) {
  const reduced = useReducedMotionPreference()
  const trackRef = useRef(null)
  const positionRef = useRef(direction === 1 ? -10 : 0)
  const directionRef = useRef(direction)
  useEffect(() => {
    const track = trackRef.current
    if (!track || reduced) {
      if (track) track.style.transform = 'translate3d(0, 0, 0)'
      return undefined
    }
    let frame = 0
    let lastTime = performance.now()
    let lastScroll = window.scrollY
    let lastScrollTime = lastTime
    let velocity = 0
    const onScroll = () => {
      const now = performance.now()
      const elapsed = Math.max(1, now - lastScrollTime)
      const instantaneous = (window.scrollY - lastScroll) / elapsed * 1000
      // A short spring-like low-pass filter mirrors the reference useVelocity
      // + useSpring pair while keeping the track animation compositor-only.
      velocity = velocity * 0.78 + instantaneous * 0.22
      lastScroll = window.scrollY
      lastScrollTime = now
    }
    const tick = (timestamp) => {
      const delta = Math.min(50, Math.max(0, timestamp - lastTime))
      lastTime = timestamp
      if (velocity < -1) directionRef.current = -direction
      else if (velocity > 1) directionRef.current = direction
      const boost = Math.min(4, Math.abs(velocity) / 300)
      const movement = -(directionRef.current * (delta / 1000 * 0.55) * (1 + boost))
      positionRef.current += movement
      // Two copies are rendered, so one copy is exactly half of the track.
      const loopSize = 100 / 2
      positionRef.current = ((positionRef.current + loopSize) % loopSize + loopSize) % loopSize - loopSize
      track.style.transform = `translate3d(${positionRef.current}%, 0, 0)`
      velocity *= 0.965
      frame = requestAnimationFrame(tick)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [direction, reduced])
  const copies = reduced ? [shots] : Array.from({ length: 2 }, () => shots)
  return <div className={`marquee marquee-${row} ${reduced ? 'is-reduced' : ''}`}>
    <div ref={trackRef} className="marquee-run">
      {copies.flatMap((copy, copyIndex) => copy.map((shot, index) => <figure key={`${copyIndex}-${shot.src}`}>
        <div className="gallery-image-wrap"><img src={shot.src} alt={shot.prompt} loading="lazy" decoding="async" data-media-slot={`gallery-${row}-${index}`} /></div>
        <figcaption>
          {shot.quote && <span className="gallery-quote">“{shot.quote}”</span>}
          <span className="gallery-attribution">{shot.source}{shot.kind && shot.kind !== '原创' && !shot.source.includes(shot.kind) ? ` · ${shot.kind}` : ''}</span>
          <span className="gallery-context">{shot.prompt}</span>
        </figcaption>
      </figure>))}
    </div>
  </div>
}

function Gallery({ shots = galleryShots }) {
  const split = Math.ceil(shots.length / 2)
  const tracks = [shots.slice(0, split), shots.slice(split)]
  const uploadedImageCount = Math.max(0, shots.length - galleryShots.length)
  return <section id="gallery" className="section gallery-section" data-gallery-card-count={shots.length} data-uploaded-image-count={uploadedImageCount}>
    <Reveal className="intro-block"><h2>Made with Cortex</h2><p>Every frame below came out of the app, prompt included. Nothing retouched, nothing staged.</p><p className="gallery-editorial-note">每张图下的主描述都按卡面标签与画面主体重新撰写；短引来自公开经典，天涯与 X 部分为明确标注的意译灵感，不冒充原帖。</p></Reveal>
    <div className="gallery-marquees">
      {tracks.map((track, row) => <GalleryTrack key={row} shots={track} direction={row === 0 ? 1 : -1} row={row} />)}
    </div>
  </section>
}

function UploadSection({ count, status }) {
  return <section id="upload" className="upload-section section-wrap" aria-labelledby="upload-title" data-uploaded-count={count}>
    <div className="upload-panel">
      <div className="upload-copy intro-block">
        <p className="eyebrow">FROM YOUR PHONE</p>
        <h2 id="upload-title">把新的影像，送回它应在的位置。</h2>
        <p>图片会追加到作品画廊，视频会进入上方的影像档案。手机上传完成后，当前页面会自动同步，不会覆盖原有素材。</p>
      </div>
      <div className="upload-actions">
        <a className="film-button is-light" href="#orbit-images">打开手机上传入口 <Arrow /></a>
        <div className="mobile-link-card">
          <span>受保护的手机上传</span>
          <code>个人上传与临时分享上传均由电脑端生成专属链接</code>
          <a href="#orbit-images">前往生成手机链接</a>
        </div>
        <p className="upload-sync-state" aria-live="polite">{count ? `已同步 ${count} 个新素材 · ${status}` : `尚无新素材 · ${status}`}</p>
      </div>
    </div>
  </section>
}

function Integrations() {
  const ref = useRef(null)
  const progress = useViewportPassProgress(ref)
  const reduced = useReducedMotionPreference()
  const rows = [
    [['Instagram', 'Reels-ready'], ['YouTube', 'Straight to Shorts'], ['X', 'Auto-post'], ['Figma', 'Into your frames'], ['Slack', 'Share to channels'], ['Dribbble', 'Portfolio shots']],
    [['Lightroom', 'Edit roundtrip'], ['Premiere', 'Timeline-ready'], ['Final Cut', 'XML export'], ['Framer', 'Embed live'], ['LinkedIn', 'Native posts'], ['Webhooks', 'Anything custom']],
  ]
  return <section id="integrations" className="section integrations" ref={ref}>
    <Reveal className="intro-block centered integrations-intro"><h2>Lands where you publish</h2><p>Keepers route straight from your camera roll into the apps you post, pitch, and cut in. No export dance.</p></Reveal>
    <div className="integration-tickers">{rows.map((apps, row) => {
      const offset = reduced ? 0 : row === 0 ? -160 + progress * 320 : 160 - progress * 320
      return <div className={`logo-ticker logo-ticker-${row}`} key={row}><div className="logo-ticker-track" style={{ transform: `translate3d(${offset}px, 0, 0)` }}>{[...apps, ...apps].map(([app, label], index) => <div className="integration-pill" key={`${app}-${index}`}><IntegrationIcon name={app} /><b>{app}</b><span>{label}</span></div>)}</div></div>
    })}</div>
  </section>
}

function Receipts() {
  const ref = useRef(null)
  const progress = useViewportPassProgress(ref)
  const [characterCards, setCharacterCards] = useState(() => testimonials)
  const [characterShuffleToken, setCharacterShuffleToken] = useState(0)
  const columns = useMemo(() => [[characterCards[0], characterCards[3]], [characterCards[1], characterCards[4]], [characterCards[2], characterCards[5]]], [characterCards])
  const yOffsets = [[40, -64], [128, -24], [72, -104]]
  const randomize = useCallback(() => {
    let next = shuffleImages(characterCards)
    if (next.length > 1 && next.every((item, index) => item[1] === characterCards[index]?.[1])) next = [...next.slice(1), next[0]]
    setCharacterCards(next)
    setCharacterShuffleToken(token => token + 1)
  }, [characterCards])
  const renderCard = ([quote, name, title, image], index) => {
    const firstAlternate = characterCards[(index + 1) % characterCards.length]
    const secondAlternate = characterCards[(index + 2) % characterCards.length]
    const backImage = (firstAlternate?.[3] && firstAlternate[3] !== image ? firstAlternate[3] : secondAlternate?.[3]) || image
    return <figure key={`${name}-${characterShuffleToken}`} className="receipt" data-character-card data-character-index={index} data-character-name={name}>
      <div className="receipt-character-preview" aria-label={`${name} 人物卡片着色揭晓`}>
        <ShaderReveal
          key={`${image}-${backImage}-${characterShuffleToken}`}
          frontImage={image}
          backImage={backImage}
          mouseForce={50}
          cursorSize={180}
          resolution={0.5}
          isViscous
          viscous={30}
          autoDemo
          autoSpeed={0.55}
          autoIntensity={2.2}
          revealStrength={0.9}
          revealSoftness={1}
          className="receipt-character-shader"
          aria-hidden="true"
        />
        <span className="receipt-character-label" aria-hidden="true">SHADER REVEAL</span>
      </div>
      <blockquote>{quote}</blockquote>
      <figcaption><img src={image} alt={name} loading="lazy" decoding="async" /><div><b>{name}</b><small>{title}</small></div></figcaption>
    </figure>
  }
  return <section id="reviews" className="section receipts" ref={ref}>
    <Reveal className="intro-block"><h2>Creators keep the receipts</h2><p>Photographers, directors, and designers use Cortex where the work has to hold up to a close look.</p><button className="character-random-button" type="button" onClick={randomize} aria-label="随机生成一组人物卡片" data-character-randomize><span>随机生成角色卡</span><b aria-hidden="true">↻</b></button></Reveal>
    <div className="receipt-grid-mobile">{characterCards.map(renderCard)}</div>
    <div className="receipt-grid">{columns.map((column, columnIndex) => {
      const [from, to] = yOffsets[columnIndex]
      const y = from + (to - from) * progress
      return <div className="receipt-column" key={columnIndex} style={{ '--receipt-y': `${y}px` }}>{column.map((card, index) => renderCard(card, columnIndex * 2 + index))}</div>
    })}</div>
  </section>
}

function Pricing() {
  const [yearly, setYearly] = useState(false)
  return <section id="pricing" className="section pricing-section">
    <div className="pricing-head"><Reveal className="intro-block"><h2>Pay for keepers, not noise</h2><p>Every plan runs the full engine and the full review pass. Upgrade when you need more frames, longer film, or cleaner exports.</p></Reveal><div className="pricing-toggle" aria-label="Billing period"><span className={`toggle-pill ${yearly ? 'is-yearly' : ''}`} aria-hidden="true" /><button type="button" className={!yearly ? 'is-selected' : ''} aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button><button type="button" className={yearly ? 'is-selected' : ''} aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly</button></div></div>
    <div className="plans">{plans.map((plan, index) => <ShaderCard as="article" key={plan.name} className={`plan ${plan.recommended ? 'is-featured' : ''}`} width="100%" color={plan.shaderColor} speed={0.62 + index * 0.1} positionY={0.88} scale={3.2} effectRadius={0.9} effectBoost={1.05} branchIntensity={1.05} verticalExtent={1.7} horizontalExtent={1.2} widthFactor={0.86} waveAmount={0.28} opacity={0.88} blur={0.35} aria-label={`${plan.name} pricing plan`} data-plan-name={plan.name}><div className="plan-header"><h3>{plan.name}</h3>{plan.recommended && <span className="popular">Most popular</span>}</div><p>{plan.copy}</p><div className="price"><sup>$</sup><strong className="price-value" key={`${plan.name}-${yearly}`}>{yearly ? plan.yearly : plan.price}</strong><span>/ month</span></div><small>{yearly && plan.price ? 'billed yearly' : plan.note}</small><ul>{plan.list.map(item => <li key={item}><CheckIcon className="plan-check" /><span>{item}</span></li>)}</ul><FilmButton light={plan.recommended}>{plan.action}</FilmButton></ShaderCard>)}</div>
    <p className="pricing-note">Prices in USD. Cancel anytime in the app — your plan runs to the end of the period.</p>
  </section>
}

function FAQ() {
  const [open, setOpen] = useState(0)
  return <section id="faq" className="section faq-section"><Reveal className="intro-block"><h2>Fair questions, straight answers</h2><p>Anything else, write to <a href="mailto:hello@example.com">hello@example.com</a>. A person reads every single message.</p></Reveal><div className="faq-list">{faqs.map(([question, answer], index) => <article className={open === index ? 'is-open' : ''} key={question}><h3><button type="button" id={`faq-button-${index}`} aria-expanded={open === index} aria-controls={`faq-panel-${index}`} onClick={() => setOpen(open === index ? -1 : index)}><span>{question}</span><span className="faq-plus"><PlusIcon /></span></button></h3><div className="faq-answer" id={`faq-panel-${index}`} role="region" aria-labelledby={`faq-button-${index}`}><p>{answer}</p></div></article>)}</div></section>
}

const ctaCards = [
  { src: photos[0], x: -224, y: 30, r: -13 },
  { src: photos[2], x: -112, y: 8, r: -6 },
  { src: photos[3], x: 0, y: 0, r: 0 },
  { src: photos[6], x: 112, y: 8, r: 6 },
  { src: photos[8], x: 224, y: 30, r: 13 },
]

function FinalCta() {
  const ref = useRef(null)
  const progress = useElementProgress(ref)
  const reduced = useReducedMotionPreference()
  const title = 'Your next shot is a sentence away'
  const panelStyle = reduced ? undefined : {
    '--cta-scale': 0.93 + progress * 0.07,
    '--cta-shift': `${40 - progress * 40}px`,
  }
  return <section ref={ref} id="sign-up" className="cta-section">
    <div className={`cta-panel ${progress > 0.005 ? 'is-in' : ''} ${reduced ? 'is-reduced' : ''}`} style={panelStyle}>
      <div className="cta-orbits" aria-hidden="true">
        {ctaCards.map((card, index) => <div className="cta-orbit-card" key={card.src} style={{ '--cta-x': `${card.x}px`, '--cta-y': `${card.y}px`, '--cta-r': `${card.r}deg`, '--cta-hover-r': `${card.r * .4}deg`, '--cta-index': index }}>
          <img src={card.src} alt="" loading="lazy" decoding="async" />
        </div>)}
      </div>
      <div className="cta-inner">
        <h2 className="cta-title">
          <span className="sr-only">{title}</span>
          <span className="cta-title-visual" aria-hidden="true">{title.split(' ').map((word, index) => <span className="cta-title-word" style={{ '--cta-word-index': index }} key={`${word}-${index}`}><span>{word}</span></span>)}</span>
        </h2>
        <p>Free to try on iOS and Android. Describe the frame, keep only what survives review.</p>
        <div className="action-row"><FilmButton light>Get the app</FilmButton><FilmButton href="#pricing">See pricing</FilmButton></div>
      </div>
    </div>
  </section>
}

function Footer() {
  return <><FinalCta /><footer id="footer">
    <div className="footer-inner">
      <div className="footer-main">
        <div className="footer-brand">
          <a className="footer-logo" href="#top" aria-label="Cortex home"><Logo /></a>
          <p>Hyperreal photos and film, generated and reviewed on your phone.</p>
          <FilmButton light>Get the app</FilmButton>
        </div>
        <nav className="footer-nav-grid" aria-label="Footer navigation">
          <div><h3>Product</h3><ul><li><a href="#overview">Overview</a></li><li><a href="#how-it-works">How it works</a></li><li><a href="#gallery">Gallery</a></li><li><a href="#pricing">Pricing</a></li><li><a href="#faq">FAQ</a></li><li><a href="#booking">Book a call</a></li></ul></div>
          <div><h3>Company</h3><ul><li><a href="#top">About</a></li><li><a href="#top">Careers</a></li><li><a href="#top">Press</a></li></ul></div>
          <div><h3>Legal</h3><ul><li><a href="#privacy">Privacy Policy</a></li><li><a href="#terms">Terms of Service</a></li><li><a href="#cookies">Cookie Policy</a></li></ul></div>
          <div><h3>Social</h3><ul><li><a href="#instagram">Instagram</a></li><li><a href="#x">X</a></li><li><a href="#linkedin">LinkedIn</a></li></ul></div>
        </nav>
      </div>
      <div className="footer-bottom"><span>© 2026 Cortex. All rights reserved.</span><span>Every frame on this page was generated.</span></div>
      <div className="footer-wordmark" aria-hidden="true"><p>Cortex</p></div>
    </div>
  </footer></>
}

function normalizeUploads(payload) {
  const grouped = payload?.uploads && !Array.isArray(payload.uploads) ? payload.uploads : null
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.uploads)
      ? payload.uploads
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.data)
          ? payload.data
          : grouped
            ? [...(Array.isArray(grouped.images) ? grouped.images : []), ...(Array.isArray(grouped.videos) ? grouped.videos : [])]
            : []
  const images = []
  const videos = []
  const seen = new Set()
  records.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const src = item.url || item.src || item.path || item.fileUrl || item.file_url
    if (!src || typeof src !== 'string') return
    const type = String(item.type || item.mediaType || item.mimeType || item.mime || item.contentType || '').toLowerCase()
    const name = item.name || item.originalFilename || item.filename || item.fileName || item.title || `Mobile upload ${index + 1}`
    const id = String(item.id || item.key || src)
    if (seen.has(id)) return
    seen.add(id)
    const isVideo = type.includes('video') || /\.(mp4|webm|mov|m4v|ogv)(?:$|\?)/i.test(src)
    if (isVideo) {
      videos.push({
        id,
        src,
        poster: item.poster || item.thumbnail || item.thumbnailUrl || undefined,
        label: item.label || name,
        aspectRatio: item.aspectRatio || item.aspect_ratio || '16 / 9',
      })
    } else {
      images.push({
        id,
        src,
        prompt: item.prompt || item.caption || item.description || name,
        quote: item.quote || '',
        source: item.source || '手机上传',
        kind: item.kind || '上传',
      })
    }
  })
  return { images, videos }
}

export default function App() {
  const [entryPhase, setEntryPhase] = useState('countdown')
  const initialHashRef = useRef(typeof window === 'undefined' ? '' : window.location.hash)
  const beginScrollExpand = useCallback(() => setEntryPhase('intro'), [])
  const finishEntry = useCallback(() => setEntryPhase('home'), [])
  useEffect(() => {
    void postViewOnce().catch(() => {})
  }, [])
  const [progress, setProgress] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [uploads, setUploads] = useState({ images: [], videos: [] })
  const [sessionImages, setSessionImages] = useState({})
  const sessionImagesRef = useRef(sessionImages)
  const previousSessionImagesRef = useRef({})
  const [uploadStatus, setUploadStatus] = useState('等待同步')
  const uploadsSignatureRef = useRef('')
  useEffect(() => {
    const previous = previousSessionImagesRef.current
    Object.keys(previous).forEach(slot => {
      const oldSrc = previous[slot]?.src
      const nextSrc = sessionImages[slot]?.src
      if (oldSrc?.startsWith('blob:') && oldSrc !== nextSrc) URL.revokeObjectURL(oldSrc)
    })
    previousSessionImagesRef.current = sessionImages
    sessionImagesRef.current = sessionImages
  }, [sessionImages])
  useEffect(() => () => {
    Object.values(sessionImagesRef.current).forEach(item => {
      if (item?.src?.startsWith('blob:')) URL.revokeObjectURL(item.src)
    })
  }, [])
  const handleSessionImageChange = useCallback((slot, item) => {
    setSessionImages(current => ({ ...current, [slot]: item }))
  }, [])
  const clearSessionImage = useCallback(slot => {
    setSessionImages(current => {
      const next = { ...current }
      delete next[slot]
      return next
    })
  }, [])
  const hasUploadAccount = useRef(null)
  const refreshUploads = useCallback(async (signal, { silent = false } = {}) => {
    if (!silent) setUploadStatus(previous => previous === '正在同步…' ? previous : '正在同步…')
    try {
      if(hasUploadAccount.current===null){const session=await fetch('/api/auth/session',{cache:'no-store',signal});hasUploadAccount.current=!!(await session.json()).authenticated}
      if(!hasUploadAccount.current){if(!silent)setUploadStatus('账号登录后可保存上传照片');return}
      const response = await fetch('/api/uploads', { cache: 'no-store', signal })
      if (!response.ok) throw new Error(`uploads request failed (${response.status})`)
      const next = normalizeUploads(await response.json())
      // The upload endpoint is polled for phone uploads. Keep the poll, but
      // avoid re-rendering every interactive studio when the payload is
      // unchanged (the old behaviour rebuilt all 30+ demos every 5 seconds).
      const signature = [
        ...next.images.map(item => `${item.id}:${item.src}`),
        ...next.videos.map(item => `${item.id}:${item.src}:${item.poster || ''}`),
      ].join('|')
      if (signature !== uploadsSignatureRef.current) {
        uploadsSignatureRef.current = signature
        setUploads(next)
      }
      if (!silent) setUploadStatus(`已同步 ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
    } catch (error) {
      if (error?.name === 'AbortError') return
      if (!silent) setUploadStatus('上传通道暂不可用，正在重试')
    }
  }, [])
  const receiveMobilePreview = useCallback(item => {
    setSessionImages(current => ({
      ...current,
      'infinite-gallery': item,
      'orbit-images': item,
      'personal-drift-wall': item,
      'tumble-carousel': item,
      'warped-card': item,
      'chroma-card': item,
      'circle-gallery': item,
      'comparison-slider': item,
      'depth-card': item,
      'lenticular-carousel': item,
      'page-flip': item,
      'parallax-carousel': item,
      'parallax-cards': item,
      'reel-gallery': item,
      'scroll-stack': item,
      'gradient-carousel': item,
      'liquid-swap': item,
      'pixel-swap': item,
      'magic-transform': item,
      'modal-cards': item,
      'pixel-reveal': item,
      'pixelate-hover': item,
      'rotating-cards': item,
      'gradual-blur': item,
      'halftone-reveal': item,
      'ripple-distortion': item,
      'elastic-mesh': item,
    }))
  }, [])
  const clearTemporaryMobilePreviews = useCallback(() => {
    setSessionImages(current => {
      const temporarySlots = Object.keys(current).filter(slot => current[slot]?.remoteKind === 'guest')
      if (!temporarySlots.length) return current
      const next = { ...current }
      temporarySlots.forEach(slot => { delete next[slot] })
      return next
    })
  }, [])
  useMobileUploadPreview({
    enabled: entryPhase === 'home',
    onReceive: receiveMobilePreview,
    onClearTemporary: clearTemporaryMobilePreviews,
    onLibraryRefresh: refreshUploads,
  })
  useEffect(() => {
    const controller = new AbortController()
    refreshUploads(controller.signal)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshUploads(undefined, { silent: true })
    }, 5000)
    const refreshOnFocus = () => { hasUploadAccount.current=null; refreshUploads() }
    const refreshOnVisibility = () => { if (document.visibilityState === 'visible') { hasUploadAccount.current=null; refreshUploads() } }
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnVisibility)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnVisibility)
    }
  }, [refreshUploads])
  useEffect(() => {
    let frame = 0
    const updateProgress = () => {
      frame = 0
      setProgress(Math.round((window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)) * 100))
    }
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress)
    }
    const requestOnResume = () => {
      if (document.visibilityState === 'visible') requestUpdate()
    }
    updateProgress()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    window.addEventListener('pageshow', requestOnResume)
    window.addEventListener('focus', requestOnResume)
    document.addEventListener('visibilitychange', requestOnResume)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      window.removeEventListener('pageshow', requestOnResume)
      window.removeEventListener('focus', requestOnResume)
      document.removeEventListener('visibilitychange', requestOnResume)
    }
  }, [])
  useEffect(() => {
    if (!menuOpen) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])
  const headerLinks = useMemo(() => [['Product', '#product'], ['Upload', '#upload'], ['预约', '#booking'], ['Pricing', '#pricing']], [])
  const menuLinks = useMemo(() => [
    ['登录', '/account/#login'],
    ['上传', '#upload'],
    ['无限影像墙', '#infinite-gallery'],
    ['Drift Wall', '#personal-drift-wall'],
    ['记忆配对', '#photo-memory-game'],
    ['Overview', '#overview'],
    ['How it works', '#how-it-works'],
    ['Gallery', '#gallery'],
    ['Reviews', '#reviews'],
    ['Live views', '#simple-graph'],
    ['预约', '#booking'],
  ], [])
  const otherLinks = useMemo(() => [
    ['Privacy Policy', '#privacy'],
    ['Terms of Service', '#terms'],
    ['Cookie Policy', '#cookies'],
  ], [])
  const socialLinks = useMemo(() => [
    ['Instagram', '#instagram'],
    ['X', '#x'],
    ['LinkedIn', '#linkedin'],
  ], [])
  useEffect(() => {
    const locked = entryPhase !== 'home'
    const html = document.documentElement
    const body = document.body
    const previousHtmlOverflow = html.style.overflow
    const previousBodyOverflow = body.style.overflow
    if (locked) {
      html.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
    } else {
      html.style.overflow = previousHtmlOverflow
      body.style.overflow = previousBodyOverflow
    }
    return () => {
      html.style.overflow = previousHtmlOverflow
      body.style.overflow = previousBodyOverflow
    }
  }, [entryPhase])
  useEffect(() => {
    if (entryPhase !== 'home') return undefined
    const timer = window.setTimeout(() => {
      const hash = initialHashRef.current
      // #login is an invisible marker inside the hero. Scrolling that zero-
      // height grid item into view used to leave the page at a 168px offset,
      // which made the one-screen hero look like it had already disappeared.
      if (hash === '#login') {
        window.scrollTo(0, 0)
        return
      }
      const target = hash && hash.length > 1 ? document.getElementById(hash.slice(1)) : null
      if (target) target.scrollIntoView({ block: 'start' })
      else window.scrollTo(0, 0)
    }, 40)
    return () => window.clearTimeout(timer)
  }, [entryPhase])
  useEffect(() => {
    if (entryPhase !== 'home' || typeof IntersectionObserver === 'undefined') return undefined
    const main = document.getElementById('main-content')
    if (!main) return undefined
    const sections = Array.from(main.children)
    let refreshFrame = 0
    const refreshSectionVisibility = () => {
      refreshFrame = 0
      if (document.visibilityState === 'hidden') return
      const viewportBottom = window.innerHeight + 180
      sections.forEach(section => {
        const rect = section.getBoundingClientRect()
        section.dataset.pageVisibility = rect.bottom >= -180 && rect.top <= viewportBottom ? 'visible' : 'offscreen'
      })
    }
    const requestSectionRefresh = () => {
      if (document.visibilityState === 'hidden' || refreshFrame) return
      refreshFrame = window.requestAnimationFrame(refreshSectionVisibility)
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.dataset.pageVisibility = entry.isIntersecting ? 'visible' : 'offscreen'
      })
    }, { rootMargin: '180px 0px' })
    sections.forEach(section => observer.observe(section))
    refreshSectionVisibility()
    window.addEventListener('pageshow', requestSectionRefresh)
    window.addEventListener('focus', requestSectionRefresh)
    window.addEventListener('resize', requestSectionRefresh)
    document.addEventListener('visibilitychange', requestSectionRefresh)
    return () => {
      if (refreshFrame) window.cancelAnimationFrame(refreshFrame)
      observer.disconnect()
      window.removeEventListener('pageshow', requestSectionRefresh)
      window.removeEventListener('focus', requestSectionRefresh)
      window.removeEventListener('resize', requestSectionRefresh)
      document.removeEventListener('visibilitychange', requestSectionRefresh)
      sections.forEach(section => delete section.dataset.pageVisibility)
    }
  }, [entryPhase])
  if (entryPhase === 'intro') {
    return <div className="entry-sequence" data-entry-phase="intro"><ScrollExpandIntro onComplete={finishEntry} /></div>
  }
  if (entryPhase === 'countdown') {
    return <div className="entry-sequence" data-entry-phase="countdown"><EntryLoading onComplete={beginScrollExpand} /></div>
  }
  return <div className="app" data-entry-phase="home">
     <CursorEffects />
     <a className="skip-link" href="#main-content">Skip to main content</a>
    <SoundToggle />
    <header><a className="brand" href="#top" aria-label="Cortex home"><Logo /></a><nav>{headerLinks.map(([name, href]) => <a href={href} key={name}>{name}</a>)}</nav><div className={`header-center ${menuOpen ? 'is-open' : ''}`}><button type="button" className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}><span className="menu-icon" aria-hidden="true"><i /><i /></span><span className="menu-label">{menuOpen ? 'Close' : 'Menu'}</span></button><span className="header-progress">{progress}%</span></div><div className="header-actions"><a href="/account/#login">登录</a><FilmButton light href="#booking">预约</FilmButton></div></header>
    {menuOpen && <><button className="menu-backdrop" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} /><div className="mobile-menu" role="dialog" aria-label="Site menu"><section><p>Menu</p>{menuLinks.map(([name, href]) => <a className="menu-primary" key={name} href={href} onClick={() => setMenuOpen(false)}>{name}</a>)}</section><section><p>Other</p>{otherLinks.map(([name, href]) => <a key={name} href={href} onClick={() => setMenuOpen(false)}>{name}</a>)}</section><section><p>Social media</p><div className="menu-social">{socialLinks.map(([name, href]) => <a key={name} href={href} onClick={() => setMenuOpen(false)}>{name}</a>)}</div></section></div></>}
        <main id="main-content"><Hero progress={progress} /><Showcase /><LinkedGalleryPreview /><InfiniteGallerySection uploadedImages={uploads.images} preview={sessionImages['infinite-gallery']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><OrbitImagesStudio uploadedImages={uploads.images} preview={sessionImages['orbit-images']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} onLibraryRefresh={refreshUploads} /><SimpleGraphStudio /><CreditCardStudio /><PersonalDriftWallStudio uploadedImages={uploads.images} preview={sessionImages['personal-drift-wall']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><TumbleCarouselStudio uploadedImages={imageSourcesForSlot('tumble-carousel', uploads.images, sessionImages)} preview={sessionImages['tumble-carousel']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><WarpedCardStudio uploadedImages={imageSourcesForSlot('warped-card', uploads.images, sessionImages)} preview={sessionImages['warped-card']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><ChromaCardStudio uploadedImages={imageSourcesForSlot('chroma-card', uploads.images, sessionImages)} preview={sessionImages['chroma-card']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><CircleGalleryStudio uploadedImages={imageSourcesForSlot('circle-gallery', uploads.images, sessionImages)} preview={sessionImages['circle-gallery']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><ComparisonSliderStudio uploadedImages={imageSourcesForSlot('comparison-slider', uploads.images, sessionImages)} preview={sessionImages['comparison-slider']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><TextScatterStudio /><WatercolorStudio /><WireframeBallStudio /><DepthCardStudio uploadedImages={imageSourcesForSlot('depth-card', uploads.images, sessionImages)} preview={sessionImages['depth-card']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><LenticularCarouselStudio uploadedImages={imageSourcesForSlot('lenticular-carousel', uploads.images, sessionImages)} preview={sessionImages['lenticular-carousel']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><PageFlipStudio uploadedImages={imageSourcesForSlot('page-flip', uploads.images, sessionImages)} preview={sessionImages['page-flip']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><ParallaxCarouselStudio uploadedImages={imageSourcesForSlot('parallax-carousel', uploads.images, sessionImages)} preview={sessionImages['parallax-carousel']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><ParallaxCardsStudio uploadedImages={imageSourcesForSlot('parallax-cards', uploads.images, sessionImages)} preview={sessionImages['parallax-cards']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><ReelGalleryStudio uploadedImages={imageSourcesForSlot('reel-gallery', uploads.images, sessionImages)} preview={sessionImages['reel-gallery']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><ScrollStackStudio uploadedImages={imageSourcesForSlot('scroll-stack', uploads.images, sessionImages)} preview={sessionImages['scroll-stack']} onPreviewChange={handleSessionImageChange} onPreviewClear={clearSessionImage} /><GradientCarouselStudio uploadedImages={imageSourcesForSlot('gradient-carousel', uploads.images, sessionImages)} /><LiquidSwapStudio uploadedImages={imageSourcesForSlot('liquid-swap', uploads.images, sessionImages)} /><PixelSwapStudio uploadedImages={uploads.images} preview={sessionImages['pixel-swap']} /><MagicTransformStudio uploadedImages={imageSourcesForSlot('magic-transform', uploads.images, sessionImages)} /><ModalCardsStudio uploadedImages={imageSourcesForSlot('modal-cards', uploads.images, sessionImages)} /><PixelRevealStudio uploadedImages={imageSourcesForSlot('pixel-reveal', uploads.images, sessionImages)} /><PixelateHoverStudio uploadedImages={imageSourcesForSlot('pixelate-hover', uploads.images, sessionImages)} /><RotatingCardsStudio uploadedImages={imageSourcesForSlot('rotating-cards', uploads.images, sessionImages)} /><GradualBlurStudio uploadedImages={imageSourcesForSlot('gradual-blur', uploads.images, sessionImages)} /><HalftoneRevealStudio uploadedImages={imageSourcesForSlot('halftone-reveal', uploads.images, sessionImages)} /><RippleDistortionStudio uploadedImages={imageSourcesForSlot('ripple-distortion', uploads.images, sessionImages)} /><ElasticMeshStudio uploadedImages={imageSourcesForSlot('elastic-mesh', uploads.images, sessionImages)} /><PhotoMemoryGame images={memoryMatchImages} /><WeChatVideoArchive videos={[...wechatVideos, ...uploads.videos]} /><UploadSection count={uploads.images.length + uploads.videos.length} status={uploadStatus} /><Standard /><Features /><PhoneFlow /><Gallery shots={[...galleryShots, ...uploads.images]} /><Integrations /><Receipts /><Pricing /><FAQ /><BookingStudio /><Footer /></main>
      <SessionImageUploadOverlays previews={sessionImages} onChange={handleSessionImageChange} onClear={clearSessionImage} />
  </div>
}
