import { useEffect, useMemo, useState } from 'react';
import type { ExternalIdentity, ExternalIdentityProviderCode, ExternalIdentityProviderInfo } from '@me-zip/shared-types';
import type { ExperienceTier } from './experienceSettings.js';
import {
  executeExternalAppLaunch,
  openOfficialOAuthAuthorization,
  type ExternalIdentityClient,
} from './externalIdentityClient.js';

const providerOrder: readonly ExternalIdentityProviderCode[] = ['X', 'CHATGPT', 'WECHAT', 'HONOR_OF_KINGS', 'GITHUB'];

function actionKey(provider: ExternalIdentityProviderCode): string {
  return `external-${provider.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function draftFor(provider: ExternalIdentityProviderCode): {
  displayName: string;
  handle: string;
  publicUrl: string;
  identifier: string;
} {
  if (provider === 'CHATGPT') return { displayName: 'My GPT', handle: '', publicUrl: 'https://chatgpt.com/g/', identifier: '' };
  if (provider === 'WECHAT') return { displayName: '我的微信联系资料', handle: '', publicUrl: '', identifier: '' };
  if (provider === 'HONOR_OF_KINGS') return { displayName: '我的王者荣耀资料', handle: '', publicUrl: '', identifier: '' };
  return { displayName: provider, handle: '', publicUrl: provider === 'X' ? 'https://x.com/' : 'https://github.com/', identifier: '' };
}

export function ConnectedAppsPage({ client, tier }: { readonly client: ExternalIdentityClient; readonly tier: ExperienceTier }) {
  const [providers, setProviders] = useState<readonly ExternalIdentityProviderInfo[]>([]);
  const [identities, setIdentities] = useState<readonly ExternalIdentity[]>([]);
  const [openProvider, setOpenProvider] = useState<ExternalIdentityProviderCode | null>(null);
  const [draft, setDraft] = useState(() => draftFor('X'));
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<ExternalIdentityProviderCode | null>(null);

  const identityByProvider = useMemo(() => new Map(identities.map((identity) => [identity.provider, identity])), [identities]);
  const providerByCode = useMemo(() => new Map(providers.map((provider) => [provider.provider, provider])), [providers]);

  const refresh = async () => {
    const [nextProviders, nextIdentities] = await Promise.all([client.listProviders(), client.listIdentities()]);
    if (!nextProviders.ok) { setStatus(nextProviders.error.message); return; }
    if (!nextIdentities.ok) { setStatus(nextIdentities.error.message); return; }
    setProviders(nextProviders.data);
    setIdentities(nextIdentities.data);
    setStatus('');
  };

  useEffect(() => { void refresh(); }, []);

  const edit = (provider: ExternalIdentityProviderCode) => {
    const identity = identityByProvider.get(provider);
    setOpenProvider(provider);
    setDraft(identity === undefined ? draftFor(provider) : {
      displayName: identity.displayName,
      handle: identity.handle ?? '',
      publicUrl: identity.publicUrl ?? '',
      identifier: typeof identity.metadataSafe.wechatId === 'string'
        ? identity.metadataSafe.wechatId
        : typeof identity.metadataSafe.gameId === 'string' ? identity.metadataSafe.gameId : '',
    });
    setStatus('');
  };

  const save = async (provider: ExternalIdentityProviderCode) => {
    const existing = identityByProvider.get(provider);
    setBusy(provider);
    const common = {
      provider,
      displayName: draft.displayName,
      ...(draft.handle.trim() ? { handle: draft.handle.trim() } : {}),
      ...(draft.publicUrl.trim() ? { publicUrl: draft.publicUrl.trim() } : {}),
      ...(provider === 'WECHAT' && draft.identifier.trim() ? { wechatId: draft.identifier.trim() } : {}),
      ...(provider === 'HONOR_OF_KINGS' && draft.identifier.trim() ? { gameId: draft.identifier.trim() } : {}),
      idempotencyKey: actionKey(provider),
    } as const;
    const result = existing === undefined
      ? await client.createManualIdentity(common)
      : await client.updateIdentity({ identityId: existing.id, ...common });
    setBusy(null);
    if (!result.ok) { setStatus(result.error.message); return; }
    setIdentities((current) => existing === undefined
      ? [...current, result.data]
      : current.map((identity) => identity.id === result.data.id ? result.data : identity));
    setOpenProvider(null);
    setStatus(`${result.data.provider} 资料已保存为 ${result.data.connectionStatus}；默认仅自己可见。`);
  };

  const connect = async (provider: 'X' | 'GITHUB') => {
    setBusy(provider);
    const result = await client.startOAuth({ provider, redirectUri: `${window.location.origin}/connected-apps/oauth/callback` });
    setBusy(null);
    if (!result.ok) { setStatus(result.error.message); return; }
    setStatus(openOfficialOAuthAuthorization(result.data.authorizationUrl));
  };

  const move = async (identity: ExternalIdentity, direction: -1 | 1) => {
    const currentIndex = identities.findIndex((candidate) => candidate.id === identity.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= identities.length) return;
    const next = [...identities];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex]!, next[currentIndex]!];
    setBusy(identity.provider);
    const result = await client.reorder(next.map((candidate) => candidate.id));
    setBusy(null);
    if (!result.ok) { setStatus(result.error.message); return; }
    setIdentities(result.data);
    setStatus('公开资料顺序已由服务端确认。');
  };

  const changeVisibility = async (identity: ExternalIdentity) => {
    setBusy(identity.provider);
    const result = await client.setVisibility(identity.id, identity.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC');
    setBusy(null);
    if (!result.ok) { setStatus(result.error.message); return; }
    setIdentities((current) => current.map((item) => item.id === result.data.id ? result.data : item));
    setStatus(result.data.visibility === 'PUBLIC' ? '已公开安全资料字段；二维码和凭据仍不会公开。' : '已从公开 Profile 隐藏；连接状态保持不变。');
  };

  const launch = async (identity: ExternalIdentity, action: 'OPEN' | 'COPY' | 'QR') => {
    setBusy(identity.provider);
    const result = await client.launch(identity.id, action);
    setBusy(null);
    setStatus(result.ok ? await executeExternalAppLaunch(result.data) : result.error.message);
  };

  const disconnect = async (identity: ExternalIdentity) => {
    setBusy(identity.provider);
    const result = await client.disconnect(identity.id);
    setBusy(null);
    if (!result.ok) { setStatus(result.error.message); return; }
    setIdentities((current) => current.map((item) => item.id === identity.id ? result.data : item));
    setStatus('OAuth 授权已断开；如保留公开链接，仍需单独选择是否公开。');
  };

  return (
    <main className="connected-apps-page page-stack route-shell" data-tier={tier}>
      <header className="route-heading">
        <div>
          <p className="eyebrow">CONNECTED APPS / PRIVATE BY DEFAULT</p>
          <h1>连接的应用与公开身份</h1>
          <p className="lede">这里管理公开链接、手动资料和已授权连接。不会读取 ChatGPT 私人聊天、微信聊天记录、游戏 Session、浏览器 Cookie 或未公开的 GitHub 仓库。</p>
        </div>
        <button className="quiet-button" type="button" onClick={() => void refresh()} disabled={busy !== null}>重新检查服务连接</button>
      </header>
      {status ? <p className="inline-status" role="status">{status}</p> : null}
      {client.source === 'UNAVAILABLE' ? <section className="empty-state"><p className="eyebrow">CONNECTED APPS / UNAVAILABLE</p><h2>等待服务端连接</h2><p>未配置 External Identity API 时不会展示本地伪造的“已连接”账号。配置受控服务端地址后，才能创建或管理资料。</p></section> : null}
      <section className="connected-apps-grid" aria-label="External identity providers">
        {providerOrder.map((provider) => {
          const info = providerByCode.get(provider);
          const identity = identityByProvider.get(provider);
          const isBusy = busy === provider;
          return <article className="connected-app-card glass-layer-card" key={provider}>
            <div className="connected-app-card__head"><div><p className="eyebrow">{info?.category ?? 'PROVIDER'}</p><h2>{info?.displayName ?? provider}</h2></div><span className={`status-chip ${identity?.visibility === 'PUBLIC' ? 'is-public' : ''}`}>{identity?.connectionStatus ?? info?.connectionStatus ?? 'UNAVAILABLE'}</span></div>
            <p className="muted">{identity ? `${identity.visibility === 'PUBLIC' ? '公开安全字段' : '仅自己可见'} · ${identity.description ?? '尚未添加公开说明。'}` : info?.unsupportedCapabilities[0] ?? '尚未连接。'}</p>
            {identity ? <div className="connected-app-card__identity"><strong>{identity.displayName}</strong>{identity.handle ? <span>@{identity.handle}</span> : null}{identity.publicUrl ? <span>{identity.publicUrl}</span> : null}</div> : null}
            <div className="connected-app-card__actions">
              {identity === undefined ? <button className="quiet-button" type="button" onClick={() => edit(provider)} disabled={isBusy || client.source === 'UNAVAILABLE'}>添加资料</button> : <><button className="quiet-button" type="button" onClick={() => edit(provider)} disabled={isBusy}>编辑资料</button><button className="quiet-button" type="button" onClick={() => void changeVisibility(identity)} disabled={isBusy}>{identity.visibility === 'PUBLIC' ? '隐藏资料' : '显示在 Profile'}</button>{identity.publicUrl ? <button className="quiet-button" type="button" onClick={() => void launch(identity, 'OPEN')} disabled={isBusy}>打开</button> : null}{provider === 'WECHAT' || provider === 'HONOR_OF_KINGS' ? <button className="quiet-button" type="button" onClick={() => void launch(identity, 'COPY')} disabled={isBusy}>复制 ID</button> : null}{provider === 'WECHAT' && identity.qrMediaId ? <button className="quiet-button" type="button" onClick={() => void launch(identity, 'QR')} disabled={isBusy}>显示二维码</button> : null}{identity.connectionStatus === 'CONNECTED' ? <button className="quiet-button quiet-button-danger" type="button" onClick={() => void disconnect(identity)} disabled={isBusy}>断开授权</button> : null}</>}
              {(provider === 'X' || provider === 'GITHUB') && identity?.connectionStatus !== 'CONNECTED' ? <button className="glow-button" type="button" onClick={() => void connect(provider)} disabled={isBusy || client.source === 'UNAVAILABLE'}>{isBusy ? '处理中…' : '官方 OAuth 连接'}</button> : null}
            </div>
          </article>;
        })}
      </section>
      {openProvider ? <section className="connected-app-editor glass-layer-card" aria-labelledby="external-identity-editor-title"><div><p className="eyebrow">MANUAL PROFILE / PRIVATE FIRST</p><h2 id="external-identity-editor-title">添加 {providerByCode.get(openProvider)?.displayName ?? openProvider} 资料</h2><p className="muted">保存后默认私密。只有你点击“显示在 Profile”才会显示安全字段；不会保存任何密码、Token、Cookie 或私人聊天内容。</p></div><label>显示名称<input value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>{openProvider === 'X' || openProvider === 'GITHUB' ? <label>用户名（选填）<input value={draft.handle} onChange={(event) => setDraft((current) => ({ ...current, handle: event.target.value }))} /></label> : null}{openProvider === 'X' || openProvider === 'CHATGPT' || openProvider === 'GITHUB' ? <label>官方公开链接<input value={draft.publicUrl} onChange={(event) => setDraft((current) => ({ ...current, publicUrl: event.target.value }))} /></label> : null}{openProvider === 'WECHAT' ? <label>微信 ID（选填）<input value={draft.identifier} onChange={(event) => setDraft((current) => ({ ...current, identifier: event.target.value }))} /></label> : null}{openProvider === 'HONOR_OF_KINGS' ? <label>游戏 ID（选填）<input value={draft.identifier} onChange={(event) => setDraft((current) => ({ ...current, identifier: event.target.value }))} /></label> : null}<div className="connected-app-card__actions"><button className="glow-button" type="button" onClick={() => void save(openProvider)} disabled={busy !== null || draft.displayName.trim().length === 0}>保存私密资料</button><button className="quiet-button" type="button" onClick={() => setOpenProvider(null)} disabled={busy !== null}>取消</button></div></section> : null}
      {identities.length > 1 ? <section className="connected-apps-boundary glass-layer-card"><p className="eyebrow">PROFILE ORDER / SERVER CONFIRMED</p><h2>公开资料排列</h2><p className="muted">排序只影响你选择公开的安全资料，不会公开隐藏字段。</p><div className="connected-app-order">{identities.map((identity, index) => <div key={identity.id}><span>{index + 1}. {identity.displayName}</span><button className="quiet-button" type="button" onClick={() => void move(identity, -1)} disabled={busy !== null || index === 0}>上移</button><button className="quiet-button" type="button" onClick={() => void move(identity, 1)} disabled={busy !== null || index === identities.length - 1}>下移</button></div>)}</div></section> : null}
      <section className="connected-apps-boundary glass-layer-card"><p className="eyebrow">SECURITY BOUNDARY</p><h2>公开身份不等于账户授权</h2><p className="muted">仅安全公开字段可进入 Creator / Social Profile。OAuth Token、Refresh Token、二维码原图、私有仓库、ChatGPT 私人历史、微信私密数据与游戏 Session 从不进入公开页面或客户端缓存。</p></section>
    </main>
  );
}
