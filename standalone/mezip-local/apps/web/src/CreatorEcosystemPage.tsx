import { useEffect, useMemo, useState } from 'react';
import type { CreatorHome, CreatorProjectDetail, CreatorProjectSourceFile } from '@me-zip/shared-types';
import type { AppRoute } from './appModel.js';
import type { ExperienceTier } from './experienceSettings.js';
import type { CreatorEcosystemClient } from './creatorEcosystemClient.js';

function operationKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `creator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CreatorEcosystemPage({ client, onNavigate, tier }: { readonly client: CreatorEcosystemClient; readonly onNavigate: (route: AppRoute) => void; readonly tier: ExperienceTier }) {
  const [home, setHome] = useState<CreatorHome | null>(null);
  const [selected, setSelected] = useState<CreatorProjectDetail | null>(null);
  const [source, setSource] = useState<CreatorProjectSourceFile | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const load = async () => {
    setBusy(true);
    const result = await client.getHome();
    if (result.ok) {
      setHome(result.data);
      setStatus('');
      const first = result.data.projects[0];
      if (first !== undefined) await openProject(first.id);
    } else setStatus(result.message);
    setBusy(false);
  };

  const openProject = async (projectId: string) => {
    const result = await client.getProject(projectId);
    if (result.ok) { setSelected(result.data); setSource(null); setStatus(''); }
    else setStatus(result.message);
  };

  useEffect(() => { void load(); }, []);

  const projects = useMemo(() => {
    if (home === null || query.trim() === '') return home?.projects ?? [];
    const needle = query.trim().toLocaleLowerCase();
    return home.projects.filter((project) => `${project.name} ${project.description}`.toLocaleLowerCase().includes(needle));
  }, [home, query]);

  const updateVisibility = async (field: 'projectVisibility' | 'sourceVisibility' | 'downloadVisibility' | 'demoVisibility', value: string) => {
    if (selected === null) return;
    setBusy(true);
    const result = await client.updateProjectMetadata(selected.project.id, { [field]: value } as Parameters<CreatorEcosystemClient['updateProjectMetadata']>[1]);
    if (result.ok) {
      setSelected({ ...selected, metadata: result.data });
      setStatus('可见性已由服务端保存；项目、源码、下载与演示仍分别控制。');
    } else setStatus(result.message);
    setBusy(false);
  };

  const publish = async () => {
    if (selected === null) return;
    setBusy(true);
    const result = await client.publishProject(selected.project.id, { idempotencyKey: operationKey() });
    if (result.ok) {
      setSelected({ ...selected, metadata: { ...selected.metadata, lifecycle: 'PUBLISHED' }, latestSnapshot: result.data });
      setStatus('项目快照已发布。源码、下载与演示不会因项目公开而自动开放。');
    } else setStatus(result.message);
    setBusy(false);
  };

  const unpublish = async () => {
    if (selected === null) return;
    setBusy(true);
    const result = await client.unpublishProject(selected.project.id);
    if (result.ok) { setSelected({ ...selected, metadata: result.data }); setStatus('项目公开入口已关闭；历史发布快照不会被静默改写。'); }
    else setStatus(result.message);
    setBusy(false);
  };

  const openSource = async () => {
    if (selected === null) return;
    setBusy(true);
    const result = await client.readSource(selected.project.id, 'README.md');
    if (result.ok) { setSource(result.data); setStatus(result.data.state === 'TEXT' ? '' : '该文件不能作为文本查看。'); }
    else setStatus(result.message);
    setBusy(false);
  };

  const loadStats = async () => {
    if (selected === null) return;
    const result = await client.getStats(selected.project.id);
    setStatus(result.ok ? `真实聚合：${result.data.projectViews} 浏览 · ${result.data.projectSaves} 收藏 · ${result.data.downloads} 下载。` : result.message);
  };

  return <div className="page-stack route-shell creator-ecosystem-page" data-tier={tier}>
    <section className="creator-ecosystem-hero">
      <div><p className="eyebrow">CREATOR / HOME</p><h1>创作者中心</h1><p>项目、发布、源码与下载分别由服务端控制；这里不会用本地演示数据替代你的真实项目。</p></div>
      <div className="creator-ecosystem-hero__actions"><button type="button" className="quiet-button" onClick={() => onNavigate('/creator')}>打开 Creator Lab</button><button type="button" className="quiet-button" onClick={() => onNavigate('/connected-apps')}>Connected Apps</button><button type="button" className="glow-button" onClick={() => void load()} disabled={busy}>重新检查</button></div>
    </section>
    {client.source === 'UNAVAILABLE' ? <section className="empty-state"><p className="eyebrow">CREATOR ECOSYSTEM / UNAVAILABLE</p><h2>等待服务端连接</h2><p>配置受控的 Creator Ecosystem API 后，才会显示服务端项目与发布状态。本地不会制造已发布、已连接或可下载的成功状态。</p></section> : null}
    {status ? <p className="inline-status" role="status">{status}</p> : null}
    {home !== null ? <div className="creator-ecosystem-layout">
      <aside className="creator-ecosystem-sidebar"><div className="creator-profile-summary"><p className="eyebrow">{home.profile.founderBadge ? 'FOUNDER · CREATOR' : 'CREATOR PROFILE'}</p><h2>{home.profile.displayName}</h2><p>@{home.profile.username}</p><span>{home.profile.profileVisibility === 'PUBLIC' ? '公开资料' : '资料私密'}</span></div><label>筛选我的项目<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目" /></label><div className="creator-project-list">{projects.map((project) => <button key={project.id} type="button" className={selected?.project.id === project.id ? 'is-selected' : ''} onClick={() => void openProject(project.id)}><strong>{project.name}</strong><span>{project.type} · {project.status}</span></button>)}{projects.length === 0 ? <p className="muted-copy">暂无可显示的服务端项目。</p> : null}</div></aside>
      <main className="creator-ecosystem-detail">{selected === null ? <section className="empty-state"><h2>选择一个项目</h2><p>项目工作区在 Creator Lab；这里管理发布、可见性和访问边界。</p></section> : <>
        <header className="creator-project-detail-heading"><div><p className="eyebrow">PROJECT / {selected.metadata.lifecycle}</p><h2>{selected.project.name}</h2><p>{selected.project.description || '尚未填写项目描述。'}</p></div><span className="status-chip">{selected.metadata.visibility.projectVisibility}</span></header>
        <div className="creator-project-facts"><span>标签：{selected.metadata.tags.length === 0 ? '未设置' : selected.metadata.tags.join(' · ')}</span><span>技术：{selected.metadata.technologies.length === 0 ? '未设置' : selected.metadata.technologies.join(' · ')}</span><span>发布快照：{selected.latestSnapshot === null ? '尚未发布' : selected.latestSnapshot.publishedAt}</span></div>
        <section className="creator-visibility-grid"><label>项目可见性<select value={selected.metadata.visibility.projectVisibility} disabled={busy} onChange={(event) => void updateVisibility('projectVisibility', event.target.value)}><option value="PRIVATE">私密</option><option value="UNLISTED">仅链接</option><option value="PUBLIC">公开</option></select></label><label>源码可见性<select value={selected.metadata.visibility.sourceVisibility} disabled={busy} onChange={(event) => void updateVisibility('sourceVisibility', event.target.value)}><option value="PRIVATE">私密</option><option value="OWNER_ONLY">仅所有者</option><option value="ENTITLEMENT_GATED">权益解锁</option><option value="PUBLIC">公开</option></select></label><label>下载可见性<select value={selected.metadata.visibility.downloadVisibility} disabled={busy} onChange={(event) => void updateVisibility('downloadVisibility', event.target.value)}><option value="DISABLED">关闭</option><option value="OWNER_ONLY">仅所有者</option><option value="ENTITLEMENT_GATED">权益解锁</option><option value="PUBLIC">公开</option></select></label><label>演示可见性<select value={selected.metadata.visibility.demoVisibility} disabled={busy} onChange={(event) => void updateVisibility('demoVisibility', event.target.value)}><option value="DISABLED">关闭</option><option value="PRIVATE">私密</option><option value="ENTITLEMENT_GATED">权益解锁</option><option value="PUBLIC">公开</option></select></label></section>
        <section className="creator-ecosystem-actions"><button type="button" className="glow-button" disabled={busy || selected.metadata.visibility.projectVisibility === 'PRIVATE'} onClick={() => void publish()}>发布不可变快照</button><button type="button" className="quiet-button" disabled={busy || selected.metadata.lifecycle !== 'PUBLISHED'} onClick={() => void unpublish()}>停止公开</button><button type="button" className="quiet-button" disabled={busy || !selected.viewer.canViewSource} onClick={() => void openSource()}>查看 README 源码</button><button type="button" className="quiet-button" onClick={() => void loadStats()}>查看聚合统计</button></section>
        <section className="creator-release-list"><p className="eyebrow">RELEASES</p>{selected.releases.length === 0 ? <p className="muted-copy">暂无可见 Release。</p> : selected.releases.map((release) => <article key={release.id}><strong>{release.version} · {release.title}</strong><span>{release.status} · {release.publishedAt ?? '尚未发布'}</span><p>{release.notes}</p></article>)}</section>
        {source !== null ? <section className="creator-public-source"><p className="eyebrow">READ ONLY SOURCE / {source.state}</p><h3>{source.path}</h3><pre>{source.content ?? '该文件是二进制、过大或不可用，不能作为文本显示。'}</pre></section> : null}
      </>}</main>
    </div> : null}
  </div>;
}
