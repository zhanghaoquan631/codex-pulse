import { useRef, useState } from 'react'
import { DEFAULT_FALLING_TEXT } from './FallingText'

const STORAGE_KEY = 'cortex.falling-text.content.v1'
export function loadFallingText() {
  try { return localStorage.getItem(STORAGE_KEY)?.trim().slice(0, 400) || DEFAULT_FALLING_TEXT }
  catch { return DEFAULT_FALLING_TEXT }
}

export default function FallingTextContent({ text, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [message, setMessage] = useState('')
  const fileRef = useRef(null)
  const editRef = useRef(null)
  const apply = value => {
    const next = value.trim()
    if (!next) { setMessage('请输入一些文字。'); return }
    if (next.length > 400) { setMessage('最多支持 400 个字符，请缩短后再试。'); return }
    onChange(next)
    setDraft(next)
    setEditing(false)
    try { localStorage.setItem(STORAGE_KEY, next); setMessage('文字已更新，并保存在此浏览器。') }
    catch { setMessage('文字已更新，本次浏览有效。') }
    editRef.current?.focus()
  }
  const importText = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.(txt|md)$/i.test(file.name)) { setMessage('请选择 TXT 或 Markdown 文本文件。'); return }
    if (file.size > 64 * 1024) { setMessage('文件过大，请选择不超过 64 KB 的文本文件。'); return }
    try { apply((await file.text()).replace(/^\uFEFF/, '')) }
    catch { setMessage('读取失败，请重新选择文本文件。') }
  }
  return <div className="text-scatter-upload-actions falling-text-content" role="group" aria-label="落差文字内容设置">
    <p className="text-scatter-upload-label">换一段文字，让它自由落下</p>
    <div className="falling-text-actions">
      <button ref={editRef} type="button" aria-expanded={editing} aria-controls="falling-text-editor" onClick={() => { setDraft(text); setEditing(value => !value); setMessage('') }}>编辑文字</button>
      <button type="button" onClick={() => fileRef.current?.click()}>导入文本</button>
      <button type="button" onClick={() => apply(DEFAULT_FALLING_TEXT)}>恢复示例</button>
    </div>
    <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" hidden aria-label="导入落差文字文本文件" onChange={importText} />
    {editing && <form id="falling-text-editor" className="falling-text-editor" onSubmit={event => { event.preventDefault(); apply(draft) }}>
      <label htmlFor="falling-text-input">展示文字（最多 400 个字符）</label>
      <textarea id="falling-text-input" autoFocus value={draft} maxLength={400} rows={5} onChange={event => setDraft(event.target.value)} />
      <div className="falling-text-actions"><button type="submit">应用文字</button><button type="button" onClick={() => { setEditing(false); editRef.current?.focus() }}>取消</button></div>
    </form>}
    <p className="falling-text-message" role="status">{message}</p>
  </div>
}
