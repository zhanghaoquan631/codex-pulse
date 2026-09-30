import { useEffect, useRef, useState } from 'react'
import './MobileUploadLinks.css'

// One subscriber updates all connected studios; extra link controls do not poll.
export function useMobileUploadPreview({ enabled, onReceive, onClearTemporary, onLibraryRefresh }) {
  const seen = useRef('')

  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false; let timer; let controller; let expiryTimer
    const poll = async () => {
      if (document.visibilityState === 'visible') {
        controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 4000)
        try {
          const response = await fetch('/api/mobile-upload/desktop', { cache: 'no-store', signal: controller.signal })
          if (response.status===401) { stopped=true; return }
          if (!response.ok) return
          const { latest } = await response.json()
          if (stopped) return
          if (latest && latest.id !== seen.current) {
            seen.current = latest.id
            clearTimeout(expiryTimer)
            onReceive({ src: latest.src, label: latest.label, sessionOnly: true, persisted: latest.kind === 'owner', remoteKind: latest.kind, remoteId: latest.id, expiresAt: latest.expiresAt })
            if (latest.kind === 'guest' && latest.expiresAt) {
              expiryTimer = setTimeout(onClearTemporary, Math.max(0, latest.expiresAt - Date.now()))
            }
            if (latest.kind === 'owner') void onLibraryRefresh()
          } else if (!latest) {
            clearTimeout(expiryTimer)
            onClearTemporary()
          }
        } catch { /* Keep the current selection through a brief reconnect. */ }
        finally { clearTimeout(timeout) }
      }
    }
    const run = async () => { try { await poll() } finally { if (!stopped) timer = setTimeout(run, 2000) } }
    void run()
    return () => { stopped = true; clearTimeout(timer); clearTimeout(expiryTimer); controller?.abort() }
  }, [enabled, onReceive, onClearTemporary, onLibraryRefresh])
}

export default function MobileUploadLinks() {
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const create = async kind => {
    setBusy(true); setMessage(''); setCopied(false)
    try {
      const response = await fetch('/api/mobile-upload/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || data.error || '链接生成失败')
      setLink(data)
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(link.url)
      else {
        const input = document.createElement('textarea'); input.value = link.url; document.body.append(input); input.select()
        const ok = document.execCommand('copy'); input.remove()
        if (!ok) throw new Error('请长按下方链接复制')
      }
      setCopied(true)
    } catch (error) { setMessage(error.message || '请手动复制链接') }
  }
  const revoke = async () => {
    setBusy(true)
    try {
      const token = new URLSearchParams(new URL(link.url).hash.slice(1)).get('token')
      const response = await fetch(`/api/mobile-upload/links?token=${encodeURIComponent(token)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('撤销失败，请重试')
      setLink(null); setMessage('临时链接已撤销，临时图片已清除')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  return <div className="mobile-upload-links">
    <div className="mobile-upload-link-buttons">
      <button type="button" disabled={busy} onClick={() => create('owner')}>我的手机上传</button>
      <button type="button" disabled={busy} onClick={() => create('guest')}>临时分享上传</button>
    </div>
    {message && <p role="status">{message}</p>}
    {link && <section className="mobile-upload-link-panel" aria-label={link.kind === 'owner' ? '我的手机上传链接' : '临时上传链接'}>
      <div className="mobile-upload-link-heading"><strong>{link.kind === 'owner' ? '我的手机上传' : '临时分享上传'}</strong><button type="button" aria-label="收起手机链接" onClick={() => setLink(null)}>×</button></div>
      <img src={link.qr} alt="手机上传二维码" width="180" height="180" />
      <p>在手机上扫码或打开链接，即可上传。</p>
      {link.kind === 'owner' ? <><p>专属验证码：<strong className="mobile-upload-pin">{link.pin}</strong></p><p>验证码仅显示这一次。重新生成会替换旧入口；验证后照片会保存到你的账号图库。</p></> : <p>有效至 {new Date(link.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}。照片仅临时展示，到期或撤销后清除，不进入图库。</p>}
      <input aria-label="手机上传链接" readOnly value={link.url} onFocus={event => event.target.select()} />
      <div className="mobile-upload-link-buttons"><button type="button" onClick={copy}>{copied ? '已复制链接' : '复制链接'}</button>{link.kind === 'guest' && <button type="button" disabled={busy} onClick={revoke}>撤销临时链接</button>}</div>
    </section>}
  </div>
}
