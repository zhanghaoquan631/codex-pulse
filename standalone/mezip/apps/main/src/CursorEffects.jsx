import { useEffect, useRef, useState } from 'react'
import GlowCursor from './GlowCursor'
import SwarmCursor from './SwarmCursor'
import TargetCursor from './TargetCursor'
import SplashCursor from './SplashCursor'
import './CursorEffects.css'

const STORAGE_KEY = 'cortex.cursor-effects.v1'
const effects = [
  ['glow', '发光拖尾'],
  ['swarm', '粒子跟随'],
  ['target', '图片聚焦'],
  ['splash', '淡紫流体'],
]

export default function CursorEffects() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const toggleRef = useRef(null)
  const [enabled, setEnabled] = useState(() => {
    let saved = {}
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {} } catch { /* use defaults */ }
    return Object.fromEntries(effects.map(([id]) => [id, typeof saved[id] === 'boolean' ? saved[id] : true]))
  })
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled)) } catch { /* still works for this visit */ }
  }, [enabled])
  useEffect(() => {
    if (!open) return undefined
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    const closeOnEscape = event => {
      if (event.key === 'Escape') { setOpen(false); toggleRef.current?.focus() }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  return <>
    {enabled.glow && <GlowCursor color="#ffffff" secondaryColor="#A78BFA" viewport enabled aria-hidden="true" />}
    {enabled.swarm && <SwarmCursor color="#94a3b8" accentColor="#94a3b8" count={8} size={5} viewport enabled aria-hidden="true" />}
    {enabled.target && <TargetCursor targetSelector="img, .gradual-studio-image" spinDuration={2} hideDefaultCursor hoverDuration={0.2} parallaxOn cursorColor="#ffffff" />}
    {enabled.splash && <SplashCursor DENSITY_DISSIPATION={3.5} VELOCITY_DISSIPATION={2} PRESSURE={0.1} CURL={3} SPLAT_RADIUS={0.2} SPLAT_FORCE={6000} COLOR_UPDATE_SPEED={10} SHADING RAINBOW_MODE={false} COLOR="#A855F7" />}
    <div className="cursor-effects-controls" ref={rootRef}>
      {open && <div id="cursor-effects-panel" className="cursor-effects-panel" role="group" aria-label="鼠标特效开关">
        <p>鼠标特效</p>
        {effects.map(([id, label]) => <button key={id} type="button" role="switch" aria-checked={enabled[id]} aria-label={label} onClick={() => setEnabled(current => ({...current, [id]: !current[id]}))}>
          <span>{label}</span><span className="cursor-effects-status" aria-hidden="true">{enabled[id] ? '开' : '关'}<i /></span>
        </button>)}
      </div>}
      <button className="cursor-effects-toggle" ref={toggleRef} type="button" aria-expanded={open} aria-controls="cursor-effects-panel" onClick={() => setOpen(value => !value)}>✧ 鼠标特效</button>
    </div>
  </>
}
