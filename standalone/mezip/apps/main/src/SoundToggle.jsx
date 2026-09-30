import { useEffect, useRef, useState } from 'react'

const TRACK_URL = 'https://soundcloud.com/bangtan/thankyouarmy2020'
const PLAYER_URL = `https://w.soundcloud.com/player/?url=${encodeURIComponent(TRACK_URL)}&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`
const STORE_KEY = 'cortex-sound-state'
const RESUME_MAX = 5 * 60 * 1000
const COLUMN_COUNT = 8
const ROW_COUNT = 3
const DOT_COUNT = COLUMN_COUNT * ROW_COUNT

function readSavedState() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const state = JSON.parse(raw)
    if (!state || !Number.isFinite(Number(state.ts)) || (Date.now() - Number(state.ts)) > RESUME_MAX) return null
    return state
  } catch {
    return null
  }
}

function SoundToggle() {
  const iframeRef = useRef(null)
  const dotRefs = useRef([])
  const widgetRef = useRef(null)
  const widgetReadyRef = useRef(false)
  const initializedRef = useRef(false)
  const onRef = useRef(false)
  const resumePositionRef = useRef(0)
  const lastPositionRef = useRef(0)
  const relativePositionRef = useRef(0)
  const playStartRef = useRef(null)
  const waveformRef = useRef([])
  const animationFrameRef = useRef(null)
  const playCheckTimerRef = useRef(null)
  const [isOn, setIsOn] = useState(false)

  const setUiState = (next) => {
    onRef.current = next
    setIsOn(next)
  }

  const saveState = () => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        on: onRef.current,
        pos: lastPositionRef.current,
        ts: Date.now(),
      }))
    } catch {
      // Private browsing can disable localStorage; playback still works.
    }
  }

  const resetDots = () => {
    dotRefs.current.forEach((dot) => {
      if (dot) dot.style.opacity = '0.2'
    })
  }

  const amplitudes = () => {
    const samples = waveformRef.current
    if (samples.length) {
      const center = Math.floor(relativePositionRef.current * samples.length)
      return Array.from({ length: COLUMN_COUNT }, (_, column) => {
        const index = Math.max(0, Math.min(samples.length - 1, center + column - Math.floor(COLUMN_COUNT / 2)))
        return samples[index] / 100
      })
    }

    const elapsed = playStartRef.current == null ? 0 : (performance.now() - playStartRef.current) / 1000
    const base = 78 / 60 * 2 * Math.PI
    const rates = [1, 2, 0.5, 1.5, 0.75, 2.5, 1.25, 0.5]
    return rates.map((rate, column) => {
      const value = Math.sin(elapsed * base * rate + column * 0.9)
      return Math.pow(Math.max(0, value), 3)
    })
  }

  const renderDots = (values) => {
    for (let column = 0; column < COLUMN_COUNT; column += 1) {
      const lit = Math.round(values[column] * ROW_COUNT)
      for (let row = 0; row < ROW_COUNT; row += 1) {
        const dot = dotRefs.current[row * COLUMN_COUNT + column]
        if (dot) dot.style.opacity = ((ROW_COUNT - 1 - row) < lit) ? '1' : '0.15'
      }
    }
  }

  const stopAnimation = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    resetDots()
  }

  const startAnimation = () => {
    if (animationFrameRef.current || !dotRefs.current.length) return
    const tick = () => {
      renderDots(amplitudes())
      animationFrameRef.current = requestAnimationFrame(tick)
    }
    animationFrameRef.current = requestAnimationFrame(tick)
  }

  const clearPlayCheck = () => {
    if (playCheckTimerRef.current) {
      window.clearTimeout(playCheckTimerRef.current)
      playCheckTimerRef.current = null
    }
  }

  const armPlayCheck = () => {
    clearPlayCheck()
    playCheckTimerRef.current = window.setTimeout(() => {
      playCheckTimerRef.current = null
      const widget = widgetRef.current
      if (!widget || !onRef.current) return
      try {
        widget.isPaused((paused) => {
          if (paused && onRef.current) {
            setUiState(false)
            stopAnimation()
            saveState()
          }
        })
      } catch {
        // The widget can disappear while navigating; leave the switch usable.
      }
    }, 700)
  }

  const toggle = () => {
    const next = !onRef.current
    setUiState(next)
    saveState()

    const widget = widgetRef.current
    if (next) {
      playStartRef.current = performance.now()
      startAnimation()
      if (widgetReadyRef.current && widget) {
        try {
          widget.play()
          armPlayCheck()
        } catch {
          setUiState(false)
          stopAnimation()
          saveState()
        }
      }
      return
    }

    clearPlayCheck()
    if (widgetReadyRef.current && widget) {
      try { widget.pause() } catch { /* widget may still be unloading */ }
    }
    stopAnimation()
  }

  useEffect(() => {
    const saved = readSavedState()
    if (saved?.on) {
      resumePositionRef.current = Number(saved.pos) || 0
      setUiState(true)
      playStartRef.current = performance.now()
      startAnimation()
    }

    // React StrictMode runs effects twice in development. Keep one widget
    // binding on the single iframe so a second effect cannot double-play it.
    if (initializedRef.current) return undefined
    initializedRef.current = true

    const iframe = iframeRef.current
    if (!iframe) return undefined

    let pollTimer = null
    let attempts = 0
    const ensureApiScript = () => {
      let script = document.querySelector('script[data-cortex-soundcloud-widget]')
      if (!script) {
        script = document.createElement('script')
        script.src = 'https://w.soundcloud.com/player/api.js'
        script.async = true
        script.dataset.cortexSoundcloudWidget = 'true'
        document.head.appendChild(script)
      }
      return script
    }

    const initWidget = () => {
      if (widgetRef.current || !window.SC?.Widget) return Boolean(widgetRef.current)
      let widget
      try {
        widget = window.SC.Widget(iframe)
      } catch {
        return false
      }
      widgetRef.current = widget
      const events = window.SC.Widget.Events

      if (!events) {
        widgetRef.current = null
        return false
      }

      widget.bind(events.READY, () => {
        widgetReadyRef.current = true
        const mobile = ('ontouchstart' in window) || window.matchMedia('(max-width: 1024px)').matches
        try { widget.setVolume(mobile ? 8 : 20) } catch { /* optional API method */ }

        try {
          widget.getCurrentSound((sound) => {
            if (!sound?.waveform_url) return
            const waveformUrl = sound.waveform_url
              .replace('wave.sndcdn.com', 'w1.sndcdn.com')
              .replace(/\.png(\?.*)?$/, '.js')
            fetch(waveformUrl, { mode: 'cors' })
              .then((response) => response.json())
              .then((data) => {
                if (Array.isArray(data?.samples)) waveformRef.current = data.samples
              })
              .catch(() => {})
          })
        } catch { /* waveform is decorative and may be unavailable */ }

        if (resumePositionRef.current > 0) {
          try { widget.seekTo(resumePositionRef.current) } catch { /* best effort */ }
          lastPositionRef.current = resumePositionRef.current
          resumePositionRef.current = 0
        }

        if (onRef.current) {
          try {
            widget.play()
            playStartRef.current = performance.now()
            armPlayCheck()
          } catch {
            setUiState(false)
            stopAnimation()
          }
        }
      })
      widget.bind(events.PLAY, () => {
        clearPlayCheck()
        // A delayed PLAY event can arrive after a quick on→off tap. Keep the
        // requested off state authoritative instead of turning the switch
        // back on behind the user's finger.
        if (!onRef.current) {
          try { widget.pause() } catch { /* widget may already be paused */ }
          return
        }
        startAnimation()
      })
      widget.bind(events.PAUSE, () => {
        if (onRef.current) {
          setUiState(false)
          stopAnimation()
          saveState()
        }
      })
      widget.bind(events.PLAY_PROGRESS, (event) => {
        relativePositionRef.current = Number(event?.relativePosition) || 0
        lastPositionRef.current = Number(event?.currentPosition) || 0
      })
      widget.bind(events.FINISH, () => {
        if (!onRef.current) return
        try {
          widget.seekTo(0)
          widget.play()
        } catch { /* widget may be unavailable during navigation */ }
      })
      return true
    }

    const tryInit = () => {
      if (initWidget()) {
        if (pollTimer) window.clearInterval(pollTimer)
        pollTimer = null
      }
    }

    const script = ensureApiScript()
    script.addEventListener('load', tryInit, { once: true })
    iframe.addEventListener('load', tryInit)
    pollTimer = window.setInterval(() => {
      attempts += 1
      tryInit()
      if (attempts > 200 && pollTimer) {
        window.clearInterval(pollTimer)
        pollTimer = null
      }
    }, 100)
    tryInit()
    window.addEventListener('pagehide', saveState)

    return () => {
      if (pollTimer) window.clearInterval(pollTimer)
      clearPlayCheck()
      // Keep the API listeners alive for StrictMode's simulated cleanup and
      // for the lifetime of this single-page app.
    }
  }, [])

  return (
    <>
      <div className="sound-toggle-shell top-actions">
        <button
          type="button"
          className="sound-btn"
          id="sound-btn"
          aria-label="Toggle background music"
          aria-pressed={isOn}
          onClick={toggle}
        >
          <svg className="sound-waveform" id="sound-waveform" width="23" height="8" viewBox="0 0 23 8" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {Array.from({ length: DOT_COUNT }, (_, index) => {
              const column = index % COLUMN_COUNT
              const row = Math.floor(index / COLUMN_COUNT)
              return <circle key={`${column}-${row}`} ref={(element) => { dotRefs.current[index] = element }} cx={1 + column * 3} cy={1 + row * 3} r="1" className="sound-dot sd" />
            })}
          </svg>
          <span id="sound-label">SOUND [{isOn ? 'ON' : 'OFF'}]</span>
        </button>
      </div>
      <iframe
        ref={iframeRef}
        id="sc-player"
        src={PLAYER_URL}
        allow="autoplay"
        style={{ position: 'fixed', width: '1px', height: '1px', left: '-9999px', top: '-9999px', border: 0, opacity: 0, pointerEvents: 'none' }}
        scrolling="no"
        title="background music player"
      />
    </>
  )
}

export default SoundToggle
