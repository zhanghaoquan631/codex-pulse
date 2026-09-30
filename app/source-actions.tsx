"use client";

import { useState } from 'react';
import { Check, Code2, Copy, Download, GitBranch, LoaderCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { sourceProjects, sourceRepository, type SourceProjectId } from '@/lib/source-library';

const sourceCache = new Map<string, Promise<string>>();
function loadSource(id: SourceProjectId) {
  let request = sourceCache.get(id);
  if (!request) {
    request = fetch(`/source-library/${id}.txt`, { signal: AbortSignal.timeout(30000) }).then(async response => {
      if (!response.ok) throw new Error('源码暂时无法读取，请重试或打开 GitHub。');
      const text = await response.text();
      if (!text.startsWith('# Codex Pulse source bundle')) throw new Error('源码文件暂未就绪，请重试或打开 GitHub。');
      return text;
    }).catch(error => { sourceCache.delete(id); throw error; });
    sourceCache.set(id, request);
  }
  return request;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* Keep a selectable fallback for denied clipboard access. */ }
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');
  field.value = text; field.readOnly = true;
  field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(field); field.select();
  let success = false;
  try { success = document.execCommand('copy'); } catch { /* Manual copy remains available. */ }
  field.remove(); previous?.focus({ preventScroll: true });
  return success;
}

export default function SourceActions({ project, heading = false }: { project: SourceProjectId; heading?: boolean }) {
  const item = sourceProjects[project];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState<'prompt' | 'source' | null>(null);
  const [fallback, setFallback] = useState<{ title: string; text: string } | null>(null);

  async function copy(kind: 'prompt' | 'source') {
    if (busy) return;
    setBusy(true); setCopied(null); setMessage('');
    try {
      const text = kind === 'prompt'
        ? `# ${item.title} · 复现提示词\n\n以下根据现有功能整理，并非原始对话逐字记录。\n\n${item.prompt}`
        : await loadSource(project);
      if (await writeClipboard(text)) {
        setCopied(kind);
        setMessage(kind === 'prompt' ? '已复制复现提示词' : '已复制源码文本，含文件路径与内容');
      } else {
        setFallback({ title: `${item.title} · ${kind === 'prompt' ? '复现提示词' : '源码'}`, text });
        setMessage('浏览器未允许自动复制，请在弹窗中手动复制。');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '复制失败，请重试。'); }
    finally { setBusy(false); }
  }

  return <div className="source-actions" data-source-project={project} aria-label={`${item.title}提示词与源码`}>
    {heading && <h2>{item.title}</h2>}
    <div className="source-actions-buttons">
      <button type="button" disabled={busy} onClick={() => void copy('prompt')}>{copied === 'prompt' ? <Check size={16}/> : <Copy size={16}/>}复制提示词</button>
      <button type="button" disabled={busy} onClick={() => void copy('source')} onPointerEnter={() => void loadSource(project).catch(() => {})} onFocus={() => void loadSource(project).catch(() => {})}>{busy ? <LoaderCircle size={16} className="source-spinner"/> : copied === 'source' ? <Check size={16}/> : <Code2 size={16}/>}复制源码</button>
      <a href={`${sourceRepository}/releases/download/source-v1.0.0/${project}.zip`}><Download size={16}/>下载源码包</a>
      <a href={`${sourceRepository}/tree/main/${item.path}`} target="_blank" rel="noopener noreferrer"><GitBranch size={16}/>GitHub</a>
    </div>
    <p className="source-actions-note">提示词按现有功能整理；源码按文件分段，运行时请下载源码包。</p>
    {message && <p className="source-actions-status" role="status">{message}</p>}
    <Dialog open={!!fallback} onOpenChange={open => { if (!open) setFallback(null); }}>
      <DialogContent className="source-copy-dialog">
        <DialogHeader><DialogTitle>{fallback?.title}</DialogTitle><DialogDescription>选中文本后复制；源码也可以下载为文件。</DialogDescription></DialogHeader>
        <textarea readOnly aria-label="可手动复制的内容" value={fallback?.text ?? ''} onFocus={event => event.currentTarget.select()} />
        <div className="source-actions-buttons"><button type="button" onClick={() => { document.querySelector<HTMLTextAreaElement>('.source-copy-dialog textarea')?.select(); }}>全选文本</button><a href={`/source-library/${project}.txt`} download>下载源码文本</a></div>
      </DialogContent>
    </Dialog>
  </div>;
}
