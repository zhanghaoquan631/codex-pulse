"use client";

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';

const storageKey = 'pulse:shop-password:v1';

export default function ShopPassword() {
  const [password, setPassword] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function restore() {
    // The optional setup fragment stays in this browser and is removed immediately.
    const params = new URLSearchParams(window.location.hash.startsWith('#shop?') ? window.location.hash.slice(6) : '');
    const imported = params.get('local-shop-password');
    if (imported !== null) window.history.replaceState(null, '', window.location.pathname + window.location.search + '#shop');
    let saved = '';
    try {
      saved = localStorage.getItem(storageKey) || '';
      if (imported) {
        localStorage.setItem(storageKey, imported);
        saved = imported;
        setMessage('密码已保存在本机');
      }
    } catch {
      if (imported) saved = imported;
      setMessage('浏览器未允许保存，密码仅在本次打开时可用');
    }
    setPassword(saved);
    setDraft(saved);
    }
    restore();
    window.addEventListener('hashchange', restore);
    return () => window.removeEventListener('hashchange', restore);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function save() {
    if (!draft) return;
    try {
      localStorage.setItem(storageKey, draft);
      setPassword(draft);
      setEditing(false);
      setMessage('密码已保存在本机');
      setCopied(false);
    } catch {
      setMessage('浏览器未允许保存，请允许此网站存储后重试');
    }
  }

  async function copy() {
    if (!password) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(password);
    } catch {
      const input = document.createElement('textarea');
      input.value = password;
      input.readOnly = true;
      input.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(input);
      input.select();
      let success = false;
      try { success = document.execCommand('copy'); } catch { /* Use manual selection below. */ }
      input.remove();
      if (!success) {
        setDraft(password);
        setEditing(true);
        setMessage('自动复制未成功，请选中密码后按 Ctrl+C');
        window.setTimeout(() => { if (field.current) { field.current.type = 'text'; field.current.focus(); field.current.select(); } }, 0);
        return;
      }
    }
    setCopied(true);
    setMessage('密码已复制');
  }

  return <div className="shop-password">
    <div className="shop-password-label"><KeyRound size={19}/><div><strong>店铺密码</strong><small>仅保存在当前浏览器</small></div></div>
    <div className="shop-password-actions">
      {password && !editing && <><span className="shop-password-mask" aria-label="已保存密码">••••••••••••</span><button type="button" className="shop-password-copy" onClick={copy}>{copied ? <Check size={17}/> : <Copy size={17}/>}<span>{copied ? '已复制' : '复制密码'}</span></button><button type="button" className="shop-password-edit" onClick={() => { setDraft(password); setEditing(true); setMessage(''); }}>修改本机记录</button></>}
      {(!password || editing) && <form onSubmit={event => { event.preventDefault(); save(); }}><input ref={field} type="password" aria-label="店铺密码" placeholder="输入要保存的店铺密码" value={draft} onChange={event => setDraft(event.target.value)} autoComplete="off" spellCheck={false}/><button type="submit" className="shop-password-copy" disabled={!draft}>保存到本机</button>{password && <button type="button" className="shop-password-edit" onClick={() => setEditing(false)}>取消</button>}</form>}
    </div>
    <span className="shop-password-status" role="status" aria-live="polite">{message}</span>
  </div>;
}
