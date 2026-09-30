import { useEffect, useState } from 'react';
import type { ExperienceTier } from './experienceSettings.js';
import type { CreatorLabClient } from './creatorLabClient.js';
import { SandboxRuntimePanel } from './SandboxRuntimePanel.js';
import { sandboxRuntimeClient } from './sandboxRuntimeClient.js';
import { DeploymentPanel } from './DeploymentPanel.js';
import { deploymentClient } from './deploymentClient.js';
import { GitHubWorkspaceDataPanel } from './GitHubWorkspaceDataPanel.js';
import type { CreatorAIChangeSet, CreatorProject, CreatorProjectPage, CreatorWorkspaceDiff, CreatorWorkspaceFile, CreatorWorkspaceFileView } from '@me-zip/shared-types';

export function CreatorLabPage({ client, tier }: { readonly client: CreatorLabClient; readonly tier: ExperienceTier }) {
  const [projects, setProjects] = useState<CreatorProjectPage | null>(null);
  const [project, setProject] = useState<CreatorProject | null>(null);
  const [files, setFiles] = useState<readonly CreatorWorkspaceFile[]>([]);
  const [selected, setSelected] = useState<CreatorWorkspaceFileView | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [diff, setDiff] = useState<CreatorWorkspaceDiff | null>(null);
  const [proposal, setProposal] = useState<CreatorAIChangeSet | null>(null);
  const [request, setRequest] = useState('');
  const [fileSearch, setFileSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const loadProjects = async () => {
    setLoading(true);
    const result = await client.listProjects();
    setLoading(false);
    if (result.ok) { setProjects(result.data); setProject(result.data.items[0] ?? null); setStatus(''); }
    else setStatus(result.error.message);
  };
  useEffect(() => { void loadProjects(); }, []);
  useEffect(() => {
    if (project === null) return;
    void client.listFiles(project.id).then((result) => result.ok ? setFiles(result.data) : setStatus(result.error.message));
  }, [project]);
  useEffect(() => {
    if (project === null || fileSearch.trim().length === 0) return;
    const timer = window.setTimeout(() => void client.searchFiles(project.id, fileSearch.trim()).then((result) => result.ok ? setFiles(result.data) : setStatus(result.error.message)), 180);
    return () => window.clearTimeout(timer);
  }, [fileSearch, project]);
  const openFile = async (file: CreatorWorkspaceFile) => {
    const result = await client.readFile(file.projectId, file.path);
    if (result.ok) { setSelected(result.data); setDraft(result.data.content ?? ''); setUndoStack([]); setRedoStack([]); setEditing(false); } else setStatus(result.error.message);
  };
  const changeDraft = (value: string) => { setUndoStack((stack) => [...stack.slice(-49), draft]); setRedoStack([]); setDraft(value); };
  const undo = () => { const previous = undoStack.at(-1); if (previous === undefined) return; setUndoStack((stack) => stack.slice(0, -1)); setRedoStack((stack) => [...stack, draft]); setDraft(previous); };
  const redo = () => { const next = redoStack.at(-1); if (next === undefined) return; setRedoStack((stack) => stack.slice(0, -1)); setUndoStack((stack) => [...stack, draft]); setDraft(next); };
  const replaceAll = () => { if (findText.length === 0) return; changeDraft(draft.split(findText).join(replaceText)); };
  const saveFile = async () => {
    if (project === null || selected === null) return;
    const result = await client.updateFile(project.id, { path: selected.path, content: draft, expectedChecksum: selected.checksum, expectedVersion: project.workspaceVersion });
    if (result.ok) { setStatus('文件已保存；版本冲突会要求重新读取。'); setEditing(false); await loadProjects(); await openFile(result.data); } else setStatus(result.error.message);
  };
  const propose = async () => {
    if (project === null || request.trim().length === 0) return;
    setLoading(true);
    const result = await client.proposeAIChange(project.id, { request: request.trim(), scopePaths: files.slice(0, 20).map((file) => file.path), expectedVersion: project.workspaceVersion });
    setLoading(false);
    if (result.ok) setProposal(result.data); else setStatus(result.error.message);
  };
  const apply = async () => {
    if (project === null || proposal === null) return;
    const result = await client.applyAIChange(project.id, proposal.id, project.workspaceVersion);
    if (result.ok) { setProposal(result.data); setStatus('变更已由服务端应用；未执行任何代码。'); await loadProjects(); } else setStatus(result.error.message);
  };
  return <div className="page-stack route-shell creator-lab-page" data-tier={tier}>
    <section className="route-heading">
      <div><p className="eyebrow">CREATOR LAB / SAFE WORKSPACE</p><h1>创作者实验室</h1><p className="lede">项目、文件、差异与 AI 变更提案都由服务端按所有权和版本检查。此页面不会执行代码或打开终端。</p></div>
      <span className="status-chip">{client.source === 'SERVER' ? 'SERVER' : '服务未连接'}</span>
    </section>
    {status.length > 0 ? <p className="inline-status" role="status">{status}</p> : null}
    <GitHubWorkspaceDataPanel compact />
    {projects === null && client.source === 'UNAVAILABLE' ? <section className="empty-state"><p className="eyebrow">CREATOR LAB / UNAVAILABLE</p><h2>等待服务端连接</h2><p>配置受控的 Creator API 地址后，项目会以服务器投影显示；本地不会填充演示项目。</p></section> : null}
    {projects !== null ? <div className="creator-lab-layout">
      <aside className="creator-project-panel"><div className="section-heading"><h2>项目</h2><button className="quiet-button" type="button" onClick={() => void loadProjects()} disabled={loading}>刷新</button></div>{projects.items.map((item) => <button className={`creator-project-item${item.id === project?.id ? ' is-selected' : ''}`} type="button" key={item.id} onClick={() => setProject(item)}><strong>{item.name}</strong><span>{item.type} · {item.visibility}</span></button>)}{projects.items.length === 0 ? <p className="muted-copy">暂无服务端项目。</p> : null}</aside>
      <section className="creator-workspace-panel">{project === null ? <p className="muted-copy">选择一个项目开始。</p> : <><div className="section-heading"><div><p className="eyebrow">WORKSPACE / v{project.workspaceVersion}</p><h2>{project.name}</h2></div><span className="status-chip">{project.status}</span></div><div className="creator-file-grid"><div className="creator-file-tree"><h3>文件</h3><input aria-label="搜索项目文件" value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} placeholder="搜索文件" />{files.map((file) => <button type="button" className="creator-file-item" key={file.id} onClick={() => void openFile(file)}>{file.path}</button>)}</div><article className="creator-code-viewer"><div className="section-heading"><h3>{selected?.path ?? '选择文件'}</h3>{selected ? <button className="quiet-button" type="button" onClick={() => setEditing((value) => !value)}>{editing ? '取消编辑' : '编辑'}</button> : null}</div>{editing ? <><div className="creator-editor-toolbar"><button className="quiet-button" type="button" onClick={undo} disabled={undoStack.length === 0}>撤销</button><button className="quiet-button" type="button" onClick={redo} disabled={redoStack.length === 0}>重做</button><span className={draft === (selected?.content ?? '') ? 'muted-copy' : 'creator-unsaved'}>{draft === (selected?.content ?? '') ? '已保存' : '本地草稿未保存'}</span></div><textarea className="creator-editor" value={draft} onChange={(event) => changeDraft(event.target.value)} rows={14} /><div className="creator-editor-search"><input aria-label="查找文本" value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="查找" /><input aria-label="替换文本" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="替换" /><button className="quiet-button" type="button" onClick={replaceAll}>替换全部</button></div><button className="glow-button" type="button" onClick={() => void saveFile()} disabled={draft === (selected?.content ?? '')}>保存文件</button></> : <pre>{selected?.content ?? '文件内容仅在选择后由 owner-scoped 服务端返回。'}</pre>}</article></div><div className="creator-ai-panel"><div><p className="eyebrow">VIBE CODING / PROPOSAL ONLY</p><h3>提出一个受限变更</h3></div><textarea value={request} onChange={(event) => setRequest(event.target.value)} placeholder="例如：为 README 增加安装说明" rows={3} /><div className="creator-action-row"><button className="glow-button" type="button" onClick={() => void propose()} disabled={loading || request.trim().length === 0}>生成提案</button>{proposal ? <><button className="quiet-button" type="button" onClick={() => void apply()} disabled={loading || proposal.status !== 'PROPOSED'}>审阅后应用</button><button className="quiet-button" type="button" onClick={() => setProposal(null)}>清除提案</button></> : null}</div>{proposal ? <p className="muted-copy">提案状态：{proposal.status}；应用前会检查 workspaceVersion，并创建可回滚快照。{proposal.files.length} 个文件。</p> : null}</div><div className="creator-secondary-row"><button className="quiet-button" type="button" onClick={() => void client.getGitDiff(project.id).then((result) => result.ok ? setDiff(result.data) : setStatus(result.error.message))}>查看差异</button>{diff ? <span>{diff.changes.length} 项差异，当前版本 v{diff.currentVersion}</span> : null}<button className="quiet-button" type="button" onClick={() => void client.exportProject(project.id).then((result) => setStatus(result.ok ? '导出任务已创建；下载由服务端授权。' : result.error.message))}>创建导出</button></div></>}</section>
    </div> : null}
    {project !== null ? <SandboxRuntimePanel client={sandboxRuntimeClient} projectId={project.id} tier={tier} /> : null}
    {project !== null ? <DeploymentPanel client={deploymentClient} projectId={project.id} tier={tier} /> : null}
  </div>;
}
