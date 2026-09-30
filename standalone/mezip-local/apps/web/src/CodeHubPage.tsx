import { useEffect, useState } from 'react';
import type { AppRoute } from './appModel.js';
import type { ExperienceTier } from './experienceSettings.js';
import { GitHubWorkspaceDataPanel } from './GitHubWorkspaceDataPanel.js';

const LOCAL_ACCOUNT_LABELS_KEY = 'mezip.local-external-account-labels.v1';

type ExternalService = 'GITHUB' | 'DOUYIN' | 'CHATGPT' | 'HONOR_OF_KINGS';
type LocalAccountLabels = Readonly<Partial<Record<ExternalService, string>>>;

function readLabels(): LocalAccountLabels {
  try {
    const raw = window.localStorage.getItem(LOCAL_ACCOUNT_LABELS_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          ['GITHUB', 'DOUYIN', 'CHATGPT', 'HONOR_OF_KINGS'].includes(key) &&
          typeof value === 'string' &&
          value.trim().length <= 80,
      ),
    ) as LocalAccountLabels;
  } catch {
    return {};
  }
}

function writeLabels(labels: LocalAccountLabels): void {
  try {
    window.localStorage.setItem(LOCAL_ACCOUNT_LABELS_KEY, JSON.stringify(labels));
  } catch {
    // The caller displays a local error rather than claiming the label was kept.
    throw new Error('浏览器无法保存本机账号备注。');
  }
}

function ExternalAccountCard({
  service,
  title,
  description,
  label,
  onChangeLabel,
  onOpen,
  actionLabel,
  availability,
}: {
  readonly service: ExternalService;
  readonly title: string;
  readonly description: string;
  readonly label: string;
  readonly onChangeLabel: (service: ExternalService, value: string) => void;
  readonly onOpen?: () => void;
  readonly actionLabel?: string;
  readonly availability: string;
}) {
  return <article className="code-hub-account-card glass-layer-card">
    <div><p className="eyebrow">{service.replaceAll('_', ' ')}</p><h2>{title}</h2></div>
    <p className="muted">{description}</p>
    <label htmlFor={`local-account-${service}`}>本机账号备注（不保存密码）</label>
    <input id={`local-account-${service}`} value={label} onChange={(event) => onChangeLabel(service, event.target.value)} placeholder="例如：你的公开昵称" maxLength={80} autoComplete="off" />
    <div className="code-hub-account-card__footer"><span>{availability}</span>{onOpen !== undefined && actionLabel !== undefined ? <button className="quiet-button" type="button" onClick={onOpen}>{actionLabel}</button> : null}</div>
  </article>;
}

/** Offline account-launcher surface; it deliberately does not imitate a completed OAuth connection. */
export function CodeHubPage({
  onNavigate,
  tier,
}: {
  readonly onNavigate: (route: AppRoute) => void;
  readonly tier: ExperienceTier;
}) {
  const [labels, setLabels] = useState<LocalAccountLabels>(() => readLabels());
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      writeLabels(labels);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '本机账号备注没有保存。');
    }
  }, [labels]);

  const changeLabel = (service: ExternalService, value: string) => {
    setLabels((current) => ({ ...current, [service]: value }));
  };

  return <main className="page-stack route-shell code-hub-page" data-tier={tier}>
    <header className="route-heading">
      <div><p className="eyebrow">CODE HUB / ACCOUNT CONNECTIONS</p><h1>账号与创作入口</h1><p className="lede">这里保留连接后的功能入口与状态，不与 Creator Lab 的项目编辑界面重复。未配置服务时会明确显示未连接，绝不伪造成功。</p></div>
      <button className="quiet-button" type="button" onClick={() => onNavigate('/creator')}>打开 Creator Lab</button>
    </header>
    {message.length > 0 ? <p className="inline-status" role="status">{message}</p> : null}
    <GitHubWorkspaceDataPanel />
    <section className="code-hub-explain glass-layer-card"><p className="eyebrow">CONNECTION BOUNDARY</p><h2>授权只在官方页完成，功能回到 ME.zip</h2><p>GitHub 会在你点击后短暂打开官方授权窗口。连接完成后，账号状态、仓库导入和项目操作都留在 ME.zip；本页不会读取你的密码或令牌。</p></section>
    <section className="code-hub-account-grid" aria-label="外部账号入口">
      <article className="code-hub-account-card glass-layer-card">
        <div><p className="eyebrow">GITHUB</p><h2>GitHub</h2></div>
        <p className="muted">GitHub 工作台已使用真实只读数据；仓库、代码片段、Issues、任务和活动都按当前授权范围显示。</p>
        <div className="code-hub-account-card__footer"><span>使用同一 GitHub App 授权</span><a className="quiet-button" href="/github-workspace-v6/index.html#overview">打开工作台</a></div>
      </article>
      <ExternalAccountCard service="DOUYIN" title="抖音" description="可保留你的公开账号备注。动态、Cookie 与私信不会由 ME.zip 读取，直到平台提供并配置正式授权。" label={labels.DOUYIN ?? ''} onChangeLabel={changeLabel} availability="未连接 · 平台授权待配置" />
      <ExternalAccountCard service="CHATGPT" title="ChatGPT" description="可保留你的账号备注；ME.zip 不会读取聊天记录，也不会假装已经连接。" label={labels.CHATGPT ?? ''} onChangeLabel={changeLabel} availability="未连接 · 不读取聊天记录" />
      <ExternalAccountCard service="HONOR_OF_KINGS" title="王者荣耀动态" description="可先为你的游戏动态保存本机账号备注；战绩、角色和动态导入需要游戏官方开放授权。" label={labels.HONOR_OF_KINGS ?? ''} onChangeLabel={changeLabel} availability="未连接 · 官方授权未配置" />
    </section>
    <section className="code-hub-explain glass-layer-card"><p className="eyebrow">PUBLISHING BOUNDARY</p><h2>要发布王者荣耀相关动态</h2><p>可以在社区的公开发布区手动写下内容。账号备注不会公开，更不会自动代表你发布或读取任何第三方账号。</p><button className="quiet-button" type="button" onClick={() => onNavigate('/community')}>前往社区发布</button></section>
  </main>;
}
