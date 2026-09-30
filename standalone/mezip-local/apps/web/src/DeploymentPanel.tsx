import { useEffect, useMemo, useState } from 'react';
import type { Deployment, DeploymentLogPage, DeploymentPage, DeploymentUsage, PreviewShare, ProjectPublishSettings } from '@me-zip/shared-types';
import type { ExperienceTier } from './experienceSettings.js';
import type { DeploymentClient } from './deploymentClient.js';

export function DeploymentPanel({ client, projectId, tier }: { readonly client: DeploymentClient; readonly projectId: string; readonly tier: ExperienceTier }) {
  const [page, setPage] = useState<DeploymentPage | null>(null);
  const [usage, setUsage] = useState<DeploymentUsage | null>(null);
  const [publish, setPublish] = useState<ProjectPublishSettings | null>(null);
  const [logs, setLogs] = useState<Record<string, DeploymentLogPage>>({});
  const [status, setStatus] = useState('');
  const [sourceRevision, setSourceRevision] = useState('');
  const [environment, setEnvironment] = useState<'PREVIEW' | 'PRODUCTION'>('PREVIEW');
  const [sourceType, setSourceType] = useState<'COMMIT' | 'RELEASE' | 'SNAPSHOT'>('COMMIT');
  const [productionConfirmed, setProductionConfirmed] = useState(false);
  const [activeShare, setActiveShare] = useState<PreviewShare | null>(null);
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const unavailable = client.source === 'UNAVAILABLE';
  const sorted = useMemo(() => [...(page?.items ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [page]);
  const load = async () => {
    const [deployments, usageResult, publishResult] = await Promise.all([client.listDeployments(projectId), client.getUsage(projectId), client.getPublishSettings(projectId)]);
    if (deployments.ok) setPage(deployments.data); else setStatus(deployments.error.message);
    if (usageResult.ok) setUsage(usageResult.data);
    if (publishResult.ok) setPublish(publishResult.data);
  };
  useEffect(() => { void load(); }, [projectId]);
  const deploy = async () => {
    if (sourceRevision.trim().length === 0 || (environment === 'PRODUCTION' && !productionConfirmed)) { setStatus('请输入明确的 commit/release/snapshot，并确认生产部署。'); return; }
    setBusy(true);
    const result = await client.createDeployment({ projectId, environment, sourceType, sourceRevision: sourceRevision.trim(), ...(environment === 'PRODUCTION' ? { confirmProduction: true } : {}) });
    setBusy(false);
    setStatus(result.ok ? '部署完成；状态和健康检查以服务端结果为准。' : result.error.message);
    if (result.ok) await load();
  };
  const showLogs = async (deploymentId: string) => { const result = await client.getLogs(deploymentId); if (result.ok) setLogs((current) => ({ ...current, [deploymentId]: result.data })); else setStatus(result.error.message); };
  const rollback = async (current: Deployment, target: Deployment) => {
    if (!productionConfirmed) { setStatus('生产回滚前请先勾选确认。'); return; }
    setBusy(true); const result = await client.rollbackDeployment(current.id, target.id, true); setBusy(false); setStatus(result.ok ? `已请求回滚到 ${target.sourceRevision}。` : result.error.message); if (result.ok) await load();
  };
  const share = async (deploymentId: string) => { const result = await client.createPreviewShare(deploymentId); if (result.ok) setActiveShare(result.data); setStatus(result.ok ? `预览链接已生成：${result.data.shareUrl ?? '仅限私有预览'}` : result.error.message); };
  const revokeShare = async () => { if (!activeShare) return; const result = await client.revokePreviewShare(activeShare.id); setStatus(result.ok ? '预览分享已撤销。' : result.error.message); if (result.ok) setActiveShare(null); };
  const addDomain = async () => { if (domain.trim().length === 0) return; setBusy(true); const result = await client.addDomain({ projectId, deploymentId: sorted.find((item) => item.environment === 'PRODUCTION' && item.status === 'LIVE')?.id ?? 'none', hostname: domain.trim() }); setBusy(false); setStatus(result.ok ? '域名已登记；请按服务端 DNS 指引验证。' : result.error.message); if (result.ok) setDomain(''); };
  const publishProject = async () => { setBusy(true); const result = await client.publishProject(projectId, { projectVisibility: 'PUBLISHED', sourceVisibility: 'PRIVATE', downloadVisibility: 'PRIVATE' }); setBusy(false); setStatus(result.ok ? '公开项目元数据已更新；源码和下载仍保持私有。' : result.error.message); if (result.ok) setPublish({ projectId, projectVisibility: 'PUBLISHED', sourceVisibility: 'PRIVATE', downloadVisibility: 'PRIVATE', updatedAt: result.data.updatedAt }); };
  if (unavailable) return <section className="deployment-panel glass-layer-card" data-tier={tier}><div className="section-heading"><div><p className="eyebrow">DEPLOYMENT / UNAVAILABLE</p><h2>发布服务未连接</h2></div><span className="status-chip">LOCAL FOUNDATION</span></div><p className="muted-copy">配置受控的 Deployment API 地址后，这里才会显示服务端部署、日志、预览和域名状态；不会填充演示部署。</p></section>;
  return <section className="deployment-panel glass-layer-card" data-tier={tier} aria-labelledby="deployment-panel-title">
    <div className="section-heading"><div><p className="eyebrow">DEPLOYMENT / SAFE PUBLISHING</p><h2 id="deployment-panel-title">部署与发布</h2><p className="muted-copy">来源必须是明确的 commit、release 或 snapshot；当前 provider、健康检查和 URL 均由服务端返回。</p></div><button className="quiet-button" type="button" onClick={() => void load()} disabled={busy}>刷新</button></div>
    {status ? <p className="inline-status" role="status">{status}</p> : null}
    {activeShare ? <div className="inline-status" role="status"><span>预览分享有效期至 {activeShare.expiresAt}。</span><button className="quiet-button" type="button" onClick={() => void revokeShare()}>撤销预览分享</button></div> : null}
    <div className="deployment-controls"><label>环境<select value={environment} onChange={(event) => setEnvironment(event.target.value as 'PREVIEW' | 'PRODUCTION')}><option value="PREVIEW">预览</option><option value="PRODUCTION">生产</option></select></label><label>来源<select value={sourceType} onChange={(event) => setSourceType(event.target.value as 'COMMIT' | 'RELEASE' | 'SNAPSHOT')}><option value="COMMIT">Commit</option><option value="RELEASE">Release</option><option value="SNAPSHOT">Snapshot</option></select></label><label className="deployment-source-field">来源版本<input value={sourceRevision} onChange={(event) => setSourceRevision(event.target.value)} placeholder="commit / release / snapshot id" /></label><button className="glow-button" type="button" onClick={() => void deploy()} disabled={busy}>开始部署</button></div>
    {environment === 'PRODUCTION' ? <label className="deployment-confirm"><input type="checkbox" checked={productionConfirmed} onChange={(event) => setProductionConfirmed(event.target.checked)} />我确认这是一次生产部署/回滚操作</label> : null}
    <div className="deployment-history"><div className="section-heading"><h3>部署历史</h3><span className="status-chip">{sorted.length} 条</span></div>{sorted.length === 0 ? <p className="muted-copy">暂无服务端部署记录。</p> : sorted.map((item) => { const target = sorted.find((candidate) => candidate.environment === 'PRODUCTION' && candidate.id !== item.id && candidate.buildArtifactId !== null); return <article className="deployment-row" key={item.id}><div><strong>{item.environment} · {item.status}</strong><span>{item.sourceType}:{item.sourceRevision} · {item.provider}</span>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">打开部署</a> : null}</div><div className="deployment-row-actions"><button className="quiet-button" type="button" onClick={() => void showLogs(item.id)}>日志</button><button className="quiet-button" type="button" onClick={() => void client.getHealth(item.id).then((result) => setStatus(result.ok ? `健康检查：${result.data.status}` : result.error.message))}>健康</button>{item.environment === 'PREVIEW' && item.status === 'LIVE' ? <button className="quiet-button" type="button" onClick={() => void share(item.id)}>分享预览</button> : null}{item.environment === 'PRODUCTION' && item.status === 'LIVE' && target ? <button className="quiet-button" type="button" onClick={() => void rollback(item, target)} disabled={busy}>回滚</button> : null}</div>{logs[item.id] ? <pre className="deployment-log-summary">{logs[item.id]!.items.map((log) => `[${log.level}] ${log.message}`).join('\n')}</pre> : null}</article>; })}</div>
    <div className="deployment-secondary-grid"><section><div className="section-heading"><h3>项目发布</h3><span className="status-chip">{publish?.projectVisibility ?? 'PRIVATE'}</span></div><p className="muted-copy">源码：{publish?.sourceVisibility ?? 'PRIVATE'} · 下载：{publish?.downloadVisibility ?? 'PRIVATE'}</p><div className="creator-action-row"><button className="quiet-button" type="button" onClick={() => void publishProject()} disabled={busy}>发布项目元数据</button>{publish?.projectVisibility === 'PUBLISHED' ? <button className="quiet-button" type="button" onClick={() => void client.unpublishProject(projectId).then((result) => setStatus(result.ok ? '项目已取消发布。' : result.error.message))}>取消发布</button> : null}</div></section><section><div className="section-heading"><h3>自定义域名</h3><span className="status-chip">TLS 由服务端配置</span></div><div className="creator-action-row"><input aria-label="自定义域名" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="app.example.com" /><button className="quiet-button" type="button" onClick={() => void addDomain()} disabled={busy}>登记域名</button></div></section></div>
    {usage ? <p className="muted-copy deployment-usage">用量：构建 {usage.buildSeconds}s · 制品 {usage.artifactBytes} bytes · 部署 {usage.deploymentCount} 次 · 预览 {usage.previewMinutes} min</p> : null}
  </section>;
}
