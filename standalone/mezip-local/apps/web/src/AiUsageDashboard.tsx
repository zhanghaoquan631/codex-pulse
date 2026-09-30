import { type FormEvent, useEffect, useMemo, useState } from 'react';

import type { AppRoute } from './appModel.js';
import {
  createAiUsageActionKey,
  type AiUsageDashboardClient,
  type AiUsageDashboardSnapshot,
} from './aiUsageClient.js';
import {
  aiUsagePeriods,
  aiUsageRangeForPeriod,
  createAiUsageDashboardView,
  formatAiUsageDuration,
  type AiUsagePeriod,
} from './aiUsagePresentation.js';
import type { ExperienceTier } from './experienceSettings.js';

type LoadState = 'LOADING' | 'READY' | 'UNAVAILABLE';
type ActionState = 'IDLE' | 'SAVING' | 'SUCCESS' | 'ERROR';

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '时间待服务端确认';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function periodLabel(period: AiUsagePeriod): string {
  return period === 'TODAY' ? '今天' : period === 'WEEK' ? '本周' : '本月';
}

function preferenceStatus(snapshot: AiUsageDashboardSnapshot): string {
  if (!snapshot.preferences.enabled) return 'TRACKING PAUSED';
  if (!snapshot.preferences.windowsAgentEnabled && !snapshot.preferences.browserExtensionEnabled) {
    return 'COLLECTORS PAUSED';
  }
  return 'TRACKING ENABLED';
}

function downloadExport(data: unknown): boolean {
  if (typeof window === 'undefined' || typeof URL === 'undefined') return false;
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `mezip-ai-usage-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 0);
    return true;
  } catch {
    return false;
  }
}

function StatusNotice({
  state,
  message,
}: {
  readonly state: ActionState;
  readonly message: string;
}) {
  if (state === 'IDLE' || message.length === 0) return null;
  return (
    <p
      aria-live={state === 'ERROR' ? 'assertive' : 'polite'}
      className={`ai-usage-inline-status ai-usage-inline-status-${state.toLowerCase()}`}
    >
      {message}
    </p>
  );
}

function BreakdownList({
  title,
  eyebrow,
  entries,
}: {
  readonly title: string;
  readonly eyebrow: string;
  readonly entries: ReturnType<typeof createAiUsageDashboardView>['appBreakdown'];
}) {
  return (
    <section className="ai-usage-breakdown-card" aria-label={title}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <p className="ai-usage-empty-copy">当前范围内还没有可展示的聚合记录。</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.code}>
              <span>
                <strong>{entry.label}</strong>
                <small>{entry.sessionCount} 个 Session</small>
              </span>
              <b>{entry.durationLabel}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TrackingControls({
  snapshot,
  client,
  onChanged,
}: {
  readonly snapshot: AiUsageDashboardSnapshot;
  readonly client: AiUsageDashboardClient;
  readonly onChanged: () => void;
}) {
  const [state, setState] = useState<ActionState>('IDLE');
  const [message, setMessage] = useState('');
  const update = (input: Parameters<AiUsageDashboardClient['updatePreferences']>[0]) => {
    setState('SAVING');
    setMessage('正在请求服务端更新追踪设置…');
    void client.updatePreferences(input).then((result) => {
      if (!result.ok) {
        setState('ERROR');
        setMessage(result.error.message);
        return;
      }
      setState('SUCCESS');
      setMessage('追踪设置已由服务端确认。设备会在下一次同步时读取此状态。');
      onChanged();
    });
  };
  const preferences = snapshot.preferences;
  return (
    <section className="ai-usage-controls" aria-labelledby="tracking-controls-title">
      <div>
        <p className="eyebrow">TRACKING CONTROLS / SERVER CONFIRMED</p>
        <h2 id="tracking-controls-title">暂停与来源控制</h2>
        <p>
          关闭后，已配对设备不得继续上传自动追踪数据。ME.zip 不会在后台绕过此设置继续采集。
        </p>
      </div>
      <div className="ai-usage-toggle-grid">
        <button
          aria-pressed={preferences.enabled}
          className={preferences.enabled ? 'selected' : undefined}
          disabled={state === 'SAVING'}
          type="button"
          onClick={() => update({ enabled: !preferences.enabled })}
        >
          {preferences.enabled ? '暂停全部追踪' : '恢复全部追踪'}
        </button>
        <button
          aria-pressed={preferences.windowsAgentEnabled}
          disabled={state === 'SAVING'}
          type="button"
          onClick={() => update({ windowsAgentEnabled: !preferences.windowsAgentEnabled })}
        >
          Windows Agent：{preferences.windowsAgentEnabled ? '开启' : '暂停'}
        </button>
        <button
          aria-pressed={preferences.browserExtensionEnabled}
          disabled={state === 'SAVING'}
          type="button"
          onClick={() => update({ browserExtensionEnabled: !preferences.browserExtensionEnabled })}
        >
          浏览器扩展：{preferences.browserExtensionEnabled ? '开启' : '暂停'}
        </button>
      </div>
      <dl className="ai-usage-control-facts">
        <div>
          <dt>闲置阈值</dt>
          <dd>{formatAiUsageDuration(preferences.idleThresholdSeconds)} 后停止计入活跃时长</dd>
        </div>
        <div>
          <dt>本地日界线</dt>
          <dd>{preferences.timezone} 的午夜</dd>
        </div>
      </dl>
      <StatusNotice message={message} state={state} />
    </section>
  );
}

function PairingAndDevices({
  snapshot,
  client,
  onChanged,
}: {
  readonly snapshot: AiUsageDashboardSnapshot;
  readonly client: AiUsageDashboardClient;
  readonly onChanged: () => void;
}) {
  const [pairingState, setPairingState] = useState<ActionState>('IDLE');
  const [pairingMessage, setPairingMessage] = useState('');
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpiry, setPairingExpiry] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revokeState, setRevokeState] = useState<ActionState>('IDLE');
  const [revokeMessage, setRevokeMessage] = useState('');
  const createPairing = (deviceType: 'WINDOWS_AGENT' | 'BROWSER_EXTENSION') => {
    setPairingState('SAVING');
    setPairingMessage('正在生成一次性绑定码…');
    setPairingId(null);
    setPairingCode(null);
    setPairingExpiry(null);
    void client
      .createPairing({
        deviceType,
        idempotencyKey: createAiUsageActionKey(`pair-${deviceType.toLowerCase()}`),
      })
      .then((result) => {
        if (!result.ok) {
          setPairingState('ERROR');
          setPairingMessage(result.error.message);
          return;
        }
        setPairingState('SUCCESS');
        setPairingId(result.data.pairingId);
        setPairingCode(result.data.pairingCode);
        setPairingExpiry(result.data.expiresAt);
        setPairingMessage('一次性绑定码已生成；请只在你正在绑定的本地客户端输入。');
      });
  };
  const revoke = (deviceId: string) => {
    setRevokeState('SAVING');
    setRevokeMessage('正在请求服务端解除设备…');
    void client
      .revokeDevice({ deviceId, idempotencyKey: createAiUsageActionKey('revoke-device') })
      .then((result) => {
        if (!result.ok) {
          setRevokeState('ERROR');
          setRevokeMessage(result.error.message);
          return;
        }
        setConfirmRevoke(null);
        setRevokeState('SUCCESS');
        setRevokeMessage('设备已解除连接；旧设备凭据不得继续同步。');
        onChanged();
      });
  };
  return (
    <section className="ai-usage-device-panel" aria-labelledby="ai-usage-devices-title">
      <div className="ai-usage-section-heading">
        <div>
          <p className="eyebrow">DEVICES / OWNER CONTROL</p>
          <h2 id="ai-usage-devices-title">已连接设备</h2>
        </div>
        <p>设备身份由 ME.zip 生成；不使用 MAC 地址或硬盘序列号。</p>
      </div>
      <div className="ai-usage-pair-actions">
        <button disabled={pairingState === 'SAVING'} type="button" onClick={() => createPairing('WINDOWS_AGENT')}>
          绑定 Windows Agent
        </button>
        <button disabled={pairingState === 'SAVING'} type="button" onClick={() => createPairing('BROWSER_EXTENSION')}>
          绑定浏览器扩展
        </button>
      </div>
      {pairingCode === null || pairingId === null ? null : (
        <section className="ai-usage-pairing-code" aria-live="polite">
          <p>一次性绑定码</p>
          <output>{pairingCode}</output>
          <small>配对 ID：{pairingId}</small>
          <small>本地客户端需要同时输入配对 ID 与一次性绑定码；两者均不会由本页面持久化。</small>
          <small>到期：{pairingExpiry === null ? '待服务端确认' : formatDateTime(pairingExpiry)}</small>
        </section>
      )}
      <StatusNotice message={pairingMessage} state={pairingState} />
      {snapshot.devices.length === 0 ? (
        <p className="ai-usage-empty-copy">尚未连接自动追踪设备。你可以保持手动/导入记录，或选择绑定自己的设备。</p>
      ) : (
        <ul className="ai-usage-device-list">
          {snapshot.devices.map((device) => (
            <li key={device.id}>
              <div>
                <strong>{device.label?.trim() || (device.deviceType === 'WINDOWS_AGENT' ? 'Windows 设备' : '浏览器扩展')}</strong>
                <p>
                  {device.deviceType === 'WINDOWS_AGENT' ? 'Windows Agent' : 'Chromium 浏览器扩展'} · {device.status === 'ACTIVE' ? '已连接' : '已撤销'}
                </p>
                <small>最近同步：{device.lastSeenAt === null ? '尚未同步' : formatDateTime(device.lastSeenAt)}</small>
              </div>
              {device.status === 'ACTIVE' ? (
                confirmRevoke === device.id ? (
                  <div className="ai-usage-inline-confirm">
                    <p>解除后，此设备不能再上传使用记录。</p>
                    <button disabled={revokeState === 'SAVING'} type="button" onClick={() => revoke(device.id)}>
                      确认解除
                    </button>
                    <button disabled={revokeState === 'SAVING'} type="button" onClick={() => setConfirmRevoke(null)}>
                      取消
                    </button>
                  </div>
                ) : (
                  <button className="quiet-button-danger" type="button" onClick={() => setConfirmRevoke(device.id)}>
                    解除设备
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <StatusNotice message={revokeMessage} state={revokeState} />
    </section>
  );
}

function ManualUsageEntry({
  snapshot,
  client,
  onChanged,
}: {
  readonly snapshot: AiUsageDashboardSnapshot;
  readonly client: AiUsageDashboardClient;
  readonly onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [appCode, setAppCode] = useState(snapshot.apps[0]?.code ?? 'CHATGPT');
  const [minutes, setMinutes] = useState('');
  const [state, setState] = useState<ActionState>('IDLE');
  const [message, setMessage] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const activeMinutes = Number(minutes);
    if (!Number.isInteger(activeMinutes) || activeMinutes <= 0 || activeMinutes > 1_440) {
      setState('ERROR');
      setMessage('请填写 1 到 1440 之间的整数分钟数。');
      return;
    }
    const startedAt = new Date();
    startedAt.setSeconds(0, 0);
    const endedAt = new Date(startedAt.getTime() + activeMinutes * 60_000);
    setState('SAVING');
    setMessage('正在提交手动使用时长…');
    void client.createManualSession({
      appCode,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      activeSeconds: activeMinutes * 60,
      idleSeconds: 0,
      idempotencyKey: createAiUsageActionKey('manual-session'),
    }).then((result) => {
      if (!result.ok) {
        setState('ERROR');
        setMessage(result.error.message);
        return;
      }
      setState('SUCCESS');
      setMinutes('');
      setMessage('手动记录已由服务端写入；来源会标记为 MANUAL。');
      onChanged();
    });
  };
  return (
    <section className="ai-usage-manual" aria-labelledby="ai-usage-manual-title">
      <div className="ai-usage-section-heading">
        <div>
          <p className="eyebrow">MANUAL / OWNER INITIATED</p>
          <h2 id="ai-usage-manual-title">主动记录 AI 使用时长</h2>
        </div>
        <button className="quiet-button" type="button" onClick={() => setOpen((value) => !value)}>
          {open ? '收起' : '新增手动记录'}
        </button>
      </div>
      <p>手动记录只会写入你主动提供的应用和时长；不会把浏览历史或对话内容转换为记录。</p>
      {open ? (
        <form className="ai-usage-inline-form" onSubmit={submit}>
          <label>
            已注册应用
            <select value={appCode} onChange={(event) => setAppCode(event.target.value as typeof appCode)}>
              {snapshot.apps.filter((app) => app.status === 'ACTIVE').map((app) => (
                <option key={app.code} value={app.code}>{app.displayName}</option>
              ))}
            </select>
          </label>
          <label>
            活跃分钟
            <input inputMode="numeric" min="1" max="1440" step="1" type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} />
          </label>
          <button disabled={state === 'SAVING'} type="submit">{state === 'SAVING' ? '正在提交' : '提交记录'}</button>
          <button disabled={state === 'SAVING'} type="button" onClick={() => setOpen(false)}>取消</button>
        </form>
      ) : null}
      <StatusNotice message={message} state={state} />
    </section>
  );
}

function UsageSessions({
  snapshot,
  client,
  range,
  onChanged,
}: {
  readonly snapshot: AiUsageDashboardSnapshot;
  readonly client: AiUsageDashboardClient;
  readonly range: { readonly from: string; readonly to: string };
  readonly onChanged: () => void;
}) {
  const dashboard = useMemo(
    () =>
      createAiUsageDashboardView({
        overview: snapshot.overview,
        apps: snapshot.apps,
        providers: snapshot.providers,
        devices: snapshot.devices,
        sessions: snapshot.sessions,
      }),
    [snapshot],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeMinutes, setActiveMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [rangeDeleteOpen, setRangeDeleteOpen] = useState(false);
  const [state, setState] = useState<ActionState>('IDLE');
  const [message, setMessage] = useState('');
  const startCorrection = (sessionId: string, secondsLabel: number) => {
    setEditingId(sessionId);
    setDeletingId(null);
    setActiveMinutes(String(Math.floor(secondsLabel / 60)));
    setReason('');
    setMessage('');
  };
  const submitCorrection = (sessionId: string) => {
    const parsedMinutes = Number(activeMinutes);
    if (!Number.isInteger(parsedMinutes) || parsedMinutes < 0 || reason.trim().length === 0) {
      setState('ERROR');
      setMessage('请填写非负整数分钟数与更正原因。');
      return;
    }
    setState('SAVING');
    setMessage('正在请求服务端更正该 Session…');
    void client
      .correctSession({
        sessionId,
        activeSeconds: parsedMinutes * 60,
        reason: reason.trim(),
        idempotencyKey: createAiUsageActionKey('correct-session'),
      })
      .then((result) => {
        if (!result.ok) {
          setState('ERROR');
          setMessage(result.error.message);
          return;
        }
        setEditingId(null);
        setState('SUCCESS');
        setMessage('Session 已标记为用户更正，并以服务端结果为准。');
        onChanged();
      });
  };
  const submitDelete = (sessionId: string) => {
    if (reason.trim().length === 0) {
      setState('ERROR');
      setMessage('请填写删除原因后再确认。');
      return;
    }
    setState('SAVING');
    setMessage('正在请求服务端删除该 Session…');
    void client
      .deleteSession({
        sessionId,
        reason: reason.trim(),
        idempotencyKey: createAiUsageActionKey('delete-session'),
      })
      .then((result) => {
        if (!result.ok) {
          setState('ERROR');
          setMessage(result.error.message);
          return;
        }
        setDeletingId(null);
        setState('SUCCESS');
        setMessage('Session 已由服务端标记删除，聚合会从来源记录重新计算。');
        onChanged();
      });
  };
  const submitRangeDelete = () => {
    if (reason.trim().length === 0) {
      setState('ERROR');
      setMessage('请填写删除原因后再确认。');
      return;
    }
    setState('SAVING');
    setMessage('正在请求服务端删除当前范围的使用记录…');
    void client.deleteUsageRange({
      from: range.from,
      to: range.to,
      reason: reason.trim(),
      idempotencyKey: createAiUsageActionKey('delete-ai-usage-range'),
    }).then((result) => {
      if (!result.ok) {
        setState('ERROR');
        setMessage(result.error.message);
        return;
      }
      setRangeDeleteOpen(false);
      setReason('');
      setState('SUCCESS');
      setMessage(`已请求删除当前范围的 ${result.data.deletedCount} 条记录；统计将从来源数据重新计算。`);
      onChanged();
    });
  };
  return (
    <section className="ai-usage-sessions" aria-labelledby="ai-usage-sessions-title">
      <div className="ai-usage-section-heading">
        <div>
          <p className="eyebrow">SESSIONS / PRIVATE METADATA</p>
          <h2 id="ai-usage-sessions-title">使用记录</h2>
        </div>
        <div className="ai-usage-session-heading-actions">
          <p>仅显示应用、Provider、设备、时间、活跃/闲置时长和来源；不包含 AI 对话内容。</p>
          <button className="quiet-button-danger" type="button" onClick={() => { setRangeDeleteOpen((value) => !value); setReason(''); }}>
            删除当前范围
          </button>
        </div>
      </div>
      {rangeDeleteOpen ? (
        <div className="ai-usage-range-delete ai-usage-inline-form">
          <p>这会请求服务端删除当前筛选范围内属于你的使用记录；不会解除设备绑定。</p>
          <label>
            删除原因
            <input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button className="quiet-button-danger" disabled={state === 'SAVING'} type="button" onClick={submitRangeDelete}>确认删除范围</button>
          <button disabled={state === 'SAVING'} type="button" onClick={() => setRangeDeleteOpen(false)}>取消</button>
        </div>
      ) : null}
      {dashboard.sessions.length === 0 ? (
        <p className="ai-usage-empty-copy">当前范围没有 AI 使用 Session。连接设备、手动记录或导入后才会出现。</p>
      ) : (
        <ul className="ai-usage-session-list">
          {dashboard.sessions.map((session) => {
            const raw = snapshot.sessions.find((candidate) => candidate.id === session.id);
            return (
              <li key={session.id}>
                <div className="ai-usage-session-summary">
                  <div>
                    <strong>{session.appLabel}</strong>
                    <p>{session.providerLabel} · {session.deviceLabel}</p>
                    <small>{formatDateTime(session.startedAt)} → {formatDateTime(session.endedAt)}</small>
                  </div>
                  <div>
                    <b>{session.durationLabel}</b>
                    <small>{session.sourceLabel} · 闲置 {session.idleLabel} · {session.stateLabel}</small>
                  </div>
                </div>
                {session.canCorrect && raw !== undefined ? (
                  <div className="ai-usage-session-actions">
                    <button type="button" onClick={() => startCorrection(session.id, raw.activeSeconds)}>更正时长</button>
                    <button className="quiet-button-danger" type="button" onClick={() => { setDeletingId(session.id); setEditingId(null); setReason(''); setMessage(''); }}>删除记录</button>
                  </div>
                ) : null}
                {editingId === session.id ? (
                  <form className="ai-usage-inline-form" onSubmit={(event) => { event.preventDefault(); submitCorrection(session.id); }}>
                    <label>
                      活跃分钟
                      <input inputMode="numeric" min="0" step="1" type="number" value={activeMinutes} onChange={(event) => setActiveMinutes(event.target.value)} />
                    </label>
                    <label>
                      更正原因
                      <input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
                    </label>
                    <button disabled={state === 'SAVING'} type="submit">确认更正</button>
                    <button disabled={state === 'SAVING'} type="button" onClick={() => setEditingId(null)}>取消</button>
                  </form>
                ) : null}
                {deletingId === session.id ? (
                  <form className="ai-usage-inline-form" onSubmit={(event) => { event.preventDefault(); submitDelete(session.id); }}>
                    <label>
                      删除原因
                      <input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
                    </label>
                    <p>删除后将从你的可见聚合中移除；这不是撤销设备绑定。</p>
                    <button className="quiet-button-danger" disabled={state === 'SAVING'} type="submit">确认删除</button>
                    <button disabled={state === 'SAVING'} type="button" onClick={() => setDeletingId(null)}>取消</button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <StatusNotice message={message} state={state} />
    </section>
  );
}

export function AiUsageDashboardPage({
  client,
  onNavigate,
  tier,
}: {
  readonly client: AiUsageDashboardClient;
  readonly onNavigate: (route: AppRoute) => void;
  readonly tier: ExperienceTier;
}) {
  const [period, setPeriod] = useState<AiUsagePeriod>('TODAY');
  const [snapshot, setSnapshot] = useState<AiUsageDashboardSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('LOADING');
  const [loadMessage, setLoadMessage] = useState('正在读取服务端 AI 使用记录…');
  const [exportState, setExportState] = useState<ActionState>('IDLE');
  const [exportMessage, setExportMessage] = useState('');
  const range = useMemo(() => aiUsageRangeForPeriod(period), [period]);
  const reload = () => {
    setLoadState('LOADING');
    setLoadMessage('正在读取服务端 AI 使用记录…');
    void client.readSnapshot({ ...range, limit: 100 }).then((result) => {
      if (!result.ok) {
        setSnapshot(null);
        setLoadState('UNAVAILABLE');
        setLoadMessage(result.error.message);
        return;
      }
      setSnapshot(result.data);
      setLoadState('READY');
      setLoadMessage('');
    });
  };
  useEffect(() => {
    reload();
  }, [period, client]);

  const requestExport = () => {
    setExportState('SAVING');
    setExportMessage('正在请求你的 AI 使用记录导出…');
    void client.exportUsage({ ...range, limit: 500 }).then((result) => {
      if (!result.ok) {
        setExportState('ERROR');
        setExportMessage(result.error.message);
        return;
      }
      if (!downloadExport(result.data)) {
        setExportState('ERROR');
        setExportMessage('浏览器无法创建导出文件；你的服务端数据没有改变。');
        return;
      }
      setExportState('SUCCESS');
      setExportMessage('已生成当前范围的自有 AI 使用记录导出。文件不含 Prompt、Response、URL 或凭据。');
    });
  };

  if (loadState === 'LOADING') {
    return (
      <div className="page-stack route-shell ai-usage-page" aria-live="polite" data-tier={tier}>
        <section className="state-panel state-panel-loading"><p>正在读取 AI 使用记录…</p></section>
      </div>
    );
  }
  if (loadState === 'UNAVAILABLE' || snapshot === null) {
    return (
      <div className="page-stack route-shell ai-usage-page" data-tier={tier}>
        <section className="route-heading">
          <div>
            <p className="eyebrow">AI USAGE / PRIVATE BY DEFAULT</p>
            <h1>AI 使用记录</h1>
            <p className="lede">ME.zip 只记录 AI 使用时长，不读取你的 AI 对话内容。</p>
          </div>
        </section>
        <section className="state-panel empty-panel" aria-live="polite">
          <p className="eyebrow">TRACKING / UNAVAILABLE</p>
          <h2>暂时无法读取你的 AI 使用记录。</h2>
          <p>{loadMessage}</p>
          <button className="inline-action" type="button" onClick={reload}>重新读取</button>
        </section>
        <AiUsagePrivacyBoundary onNavigate={onNavigate} />
      </div>
    );
  }
  const dashboard = createAiUsageDashboardView({
    overview: snapshot.overview,
    apps: snapshot.apps,
    providers: snapshot.providers,
    devices: snapshot.devices,
    sessions: snapshot.sessions,
  });
  return (
    <div className="page-stack route-shell ai-usage-page" data-tier={tier}>
      <section className="ai-usage-hero">
        <div>
          <p className="eyebrow">AI USAGE / PRIVATE BY DEFAULT</p>
          <h1>AI 使用记录</h1>
          <p className="lede">ME.zip 记录 AI 使用时长，不读取你的 AI 对话内容。</p>
        </div>
        <div className="ai-usage-hero-status">
          <span data-state={snapshot.preferences.enabled ? 'ACTIVE' : 'PAUSED'}>{preferenceStatus(snapshot)}</span>
          <small>本地日界线：{dashboard.timezone}</small>
        </div>
      </section>
      <section className="ai-usage-periods" aria-label="AI 使用记录范围">
        {aiUsagePeriods.map((candidate) => (
          <button aria-pressed={period === candidate} className={period === candidate ? 'selected' : undefined} key={candidate} type="button" onClick={() => setPeriod(candidate)}>
            {periodLabel(candidate)}
          </button>
        ))}
        <button className="quiet-button" type="button" onClick={reload}>刷新</button>
        <button className="quiet-button" disabled={exportState === 'SAVING'} type="button" onClick={requestExport}>导出我的记录</button>
      </section>
      <StatusNotice message={exportMessage} state={exportState} />
      <section className="ai-usage-metric-grid" aria-label={`${periodLabel(period)} AI 使用指标`}>
        <article><p>活跃时长</p><strong>{dashboard.totalActiveLabel}</strong><small>SUM ACTIVE DEVICE TIME</small></article>
        <article><p>应用</p><strong>{dashboard.appBreakdown.length}</strong><small>当前范围内有记录的应用</small></article>
        <article><p>Provider</p><strong>{dashboard.providerBreakdown.length}</strong><small>依据应用注册表聚合</small></article>
        <article><p>设备</p><strong>{dashboard.deviceBreakdown.length}</strong><small>设备总时长可同时累计</small></article>
        <article><p>Sessions</p><strong>{dashboard.sessionCount}</strong><small>闲置时长：{dashboard.totalIdleLabel}</small></article>
      </section>
      <section className="ai-usage-summary-note">
        <p>多设备指标为「各设备活跃时长之和」，不等同于唯一的个人墙钟时间。系统仅统计已授权的应用/域名活跃时长。</p>
      </section>
      <div className="ai-usage-breakdown-grid">
        <BreakdownList eyebrow="APPS / ACTIVE TIME" entries={dashboard.appBreakdown} title="应用分布" />
        <BreakdownList eyebrow="PROVIDERS / REGISTRY" entries={dashboard.providerBreakdown} title="Provider 分布" />
        <BreakdownList eyebrow="DEVICES / SUM ACTIVE TIME" entries={dashboard.deviceBreakdown} title="设备分布" />
      </div>
      <TrackingControls client={client} onChanged={reload} snapshot={snapshot} />
      <ManualUsageEntry client={client} onChanged={reload} snapshot={snapshot} />
      <PairingAndDevices client={client} onChanged={reload} snapshot={snapshot} />
      <UsageSessions client={client} onChanged={reload} range={range} snapshot={snapshot} />
      <AiUsagePrivacyBoundary onNavigate={onNavigate} />
      <p className="ai-usage-generated-at">服务端生成时间：{formatDateTime(dashboard.generatedAt)}</p>
    </div>
  );
}

export function AiUsagePrivacyBoundary({
  onNavigate,
}: {
  readonly onNavigate: (route: AppRoute) => void;
}) {
  return (
    <section className="ai-usage-privacy-boundary" aria-labelledby="ai-usage-privacy-title">
      <div>
        <p className="eyebrow">PRIVACY BOUNDARY</p>
        <h2 id="ai-usage-privacy-title">记录什么，不记录什么</h2>
        <p>记录：应用、Provider、设备、开始/结束时间、活跃/闲置时长和来源。</p>
        <p>不记录：Prompt、Response、聊天内容、窗口标题、完整网址/路径/查询、网页正文、键盘输入、剪贴板、截图、Cookie、Token、API Key 或密码。</p>
      </div>
      <div>
        <p>浏览器扩展只统计当前活动 AI 标签页；Windows Agent 只统计已注册 AI 应用的前台活跃时段。你可以随时暂停、解除设备、删除或导出自己的记录。</p>
        <button className="quiet-button" type="button" onClick={() => onNavigate('/privacy')}>打开隐私中心</button>
      </div>
    </section>
  );
}
