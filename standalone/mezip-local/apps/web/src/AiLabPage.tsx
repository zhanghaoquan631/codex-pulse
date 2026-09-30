import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import type {
  AiGatewayCapabilityCode,
  AiGatewayByokProviderStatus,
  AiGatewayInvocation,
  AiGatewayInvocationStatus,
  AiGatewayModelRegistryEntry,
  AiGatewayProviderCode,
} from '@me-zip/shared-types';

import type { AppRoute } from './appModel.js';
import {
  createAiLabActionKey,
  type AiLabClient,
  type AiLabClientSource,
  type AiLabSnapshot,
} from './aiLabClient.js';
import type { ExperienceTier } from './experienceSettings.js';

type LoadState = 'LOADING' | 'READY' | 'UNAVAILABLE' | 'ERROR';
type ActionState = 'IDLE' | 'SUBMITTING' | 'STREAMING' | 'SUCCESS' | 'ERROR' | 'CANCELLED';

interface InvocationAttempt {
  readonly modelCode: string;
  readonly capabilityCode: AiGatewayCapabilityCode;
  readonly prompt: string;
}

function sourceCopy(source: AiLabClientSource): string {
  if (source === 'DEVELOPMENT_FIXTURE') {
    return '本地开发模拟已明确启用：只验证 UI 与契约，不代表真实 Provider、真实模型或生产调用。';
  }
  if (source === 'SERVER') return '模型、能力、配额与调用状态均以服务端投影为准。';
  return '服务端 AI Gateway 未配置；页面保持关闭，不会伪造成功调用。';
}

function formatDateTime(value: string | null): string {
  if (value === null) return '待服务端确认';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '待服务端确认';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatCnyFen(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return '待服务端确认';
  const yuan = Math.floor(value / 100);
  const fen = String(value % 100).padStart(2, '0');
  return `¥${yuan}.${fen}`;
}

function invocationStatusLabel(status: AiGatewayInvocationStatus): string {
  const labels: Readonly<Record<AiGatewayInvocationStatus, string>> = {
    QUEUED: '等待服务端处理',
    RUNNING: '正在生成',
    STREAMING: '正在流式生成',
    SUCCEEDED: '已完成',
    FAILED: '未完成',
    CANCELLED: '已取消',
    REJECTED: '已拒绝',
  };
  return labels[status];
}

function isTerminal(status: AiGatewayInvocationStatus): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED' || status === 'REJECTED';
}

function modelLabel(model: AiGatewayModelRegistryEntry | undefined): string {
  return model === undefined ? '未选择模型' : `${model.displayName} · ${model.providerCode}`;
}

function statusMessageFor(state: ActionState): string {
  if (state === 'SUBMITTING') return '正在将这次明确提交发送至服务端 AI Gateway…';
  if (state === 'STREAMING') return '正在读取服务端授权的输出事件…';
  if (state === 'SUCCESS') return '调用已由服务端完成。';
  if (state === 'CANCELLED') return '已请求服务端取消该调用。';
  return '';
}

function statusClass(state: ActionState): string {
  if (state === 'ERROR') return 'ai-lab-inline-status ai-lab-inline-status-error';
  if (state === 'SUCCESS') return 'ai-lab-inline-status ai-lab-inline-status-success';
  return 'ai-lab-inline-status';
}

function registryModels(
  snapshot: AiLabSnapshot,
  providerCode: AiGatewayProviderCode | '',
): readonly AiGatewayModelRegistryEntry[] {
  const activeProviders = new Set(
    snapshot.providers
      .filter((provider) => provider.status === 'ACTIVE')
      .map((provider) => provider.code),
  );
  return snapshot.models.filter(
    (model) =>
      model.status === 'ACTIVE' &&
      activeProviders.has(model.providerCode) &&
      (providerCode.length === 0 || model.providerCode === providerCode),
  );
}

function byokStatusLabel(status: AiGatewayByokProviderStatus['status']): string {
  const labels: Readonly<Record<AiGatewayByokProviderStatus['status'], string>> = {
    NOT_CONFIGURED: '未配置',
    CONFIGURED: '已由服务端配置',
    REVOKED: '已撤销',
  };
  return labels[status];
}

function InvocationOutput({
  invocation,
  output,
}: {
  readonly invocation: AiGatewayInvocation | null;
  readonly output: string;
}) {
  if (invocation === null) return null;
  return (
    <section
      aria-busy={!isTerminal(invocation.status)}
      aria-labelledby="ai-lab-output-title"
      className="ai-lab-output"
    >
      <div className="ai-lab-section-heading">
        <div>
          <p className="eyebrow">SERVER OUTPUT / OWNER SESSION</p>
          <h2 id="ai-lab-output-title">调用输出</h2>
        </div>
        <span className="ai-lab-status-chip" data-status={invocation.status}>
          {invocationStatusLabel(invocation.status)}
        </span>
      </div>
      <p className="ai-lab-output-meta">
        {invocation.modelCode} · {invocation.capabilityCode} · {formatDateTime(invocation.createdAt)}
      </p>
      <output aria-live="polite" className="ai-lab-output-text">
        {output.length > 0
          ? output
          : isTerminal(invocation.status)
            ? '服务端没有返回可展示的文本输出。'
            : '正在等待服务端的已授权输出事件…'}
      </output>
      {invocation.metering === null ? null : (
        <dl className="ai-lab-metering" aria-label="服务端计量">
          <div>
            <dt>Token</dt>
            <dd>{invocation.metering.totalTokens}</dd>
          </div>
          <div>
            <dt>服务端计量</dt>
            <dd>{formatCnyFen(invocation.metering.costFen)}</dd>
          </div>
          <div>
            <dt>计量时间</dt>
            <dd>{formatDateTime(invocation.metering.meteredAt)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

export function AiLabPage({
  client,
  onNavigate,
  tier,
}: {
  readonly client: AiLabClient;
  readonly onNavigate: (route: AppRoute) => void;
  readonly tier: ExperienceTier;
}) {
  const [loadState, setLoadState] = useState<LoadState>('LOADING');
  const [snapshot, setSnapshot] = useState<AiLabSnapshot | null>(null);
  const [loadMessage, setLoadMessage] = useState('正在读取服务端模型与能力注册表…');
  const [providerCode, setProviderCode] = useState<AiGatewayProviderCode | ''>('');
  const [modelCode, setModelCode] = useState('');
  const [capabilityCode, setCapabilityCode] = useState<AiGatewayCapabilityCode | ''>('');
  const [prompt, setPrompt] = useState('');
  const [invocation, setInvocation] = useState<AiGatewayInvocation | null>(null);
  const [output, setOutput] = useState('');
  const [actionState, setActionState] = useState<ActionState>('IDLE');
  const [actionMessage, setActionMessage] = useState('');
  const [lastAttempt, setLastAttempt] = useState<InvocationAttempt | null>(null);
  const [byokMessage, setByokMessage] = useState('');
  const [byokState, setByokState] = useState<ActionState>('IDLE');
  const [preferenceMessage, setPreferenceMessage] = useState('');
  const pollTimer = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined);
  const activeInvocationId = useRef<string | null>(null);
  const seenSequences = useRef(new Set<number>());

  const stopPolling = () => {
    if (pollTimer.current !== undefined) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = undefined;
    }
  };

  const refreshSnapshot = () => {
    setLoadState('LOADING');
    setLoadMessage('正在读取服务端模型、能力与配额…');
    void client.readSnapshot().then((result) => {
      if (!result.ok) {
        setLoadState(result.source === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR');
        setLoadMessage(result.error.message);
        return;
      }
      setSnapshot(result.data);
      setLoadState('READY');
      setLoadMessage(sourceCopy(result.source));
    });
  };

  useEffect(() => {
    refreshSnapshot();
    return () => stopPolling();
  }, [client]);

  const availableModels = useMemo(
    () => (snapshot === null ? [] : registryModels(snapshot, providerCode)),
    [providerCode, snapshot],
  );
  const selectedModel = useMemo(
    () => availableModels.find((model) => model.code === modelCode),
    [availableModels, modelCode],
  );
  const availableCapabilities = useMemo(() => {
    if (snapshot === null || selectedModel === undefined) return [];
    return snapshot.capabilities.filter(
      (capability) =>
        capability.status === 'ACTIVE' && selectedModel.capabilityCodes.includes(capability.code),
    );
  }, [selectedModel, snapshot]);

  useEffect(() => {
    if (snapshot === null) return;
    const firstProvider = snapshot.providers.find((provider) => provider.status === 'ACTIVE');
    if (firstProvider === undefined) {
      if (providerCode.length > 0) setProviderCode('');
      return;
    }
    if (!snapshot.providers.some((provider) => provider.status === 'ACTIVE' && provider.code === providerCode)) {
      const preferred = snapshot.providers.find(
        (provider) => provider.status === 'ACTIVE' && provider.code === snapshot.preferences.defaultProviderCode,
      );
      setProviderCode(preferred?.code ?? firstProvider.code);
    }
  }, [providerCode, snapshot]);

  useEffect(() => {
    const firstModel = availableModels[0];
    if (firstModel === undefined) {
      if (modelCode.length > 0) setModelCode('');
      return;
    }
    if (!availableModels.some((model) => model.code === modelCode)) {
      const preferred = availableModels.find((model) => model.code === snapshot?.preferences.defaultModelCode);
      setModelCode(preferred?.code ?? firstModel.code);
    }
  }, [availableModels, modelCode, snapshot?.preferences.defaultModelCode]);

  useEffect(() => {
    const firstCapability = availableCapabilities[0];
    if (firstCapability === undefined) {
      if (capabilityCode.length > 0) setCapabilityCode('');
      return;
    }
    if (!availableCapabilities.some((capability) => capability.code === capabilityCode)) {
      setCapabilityCode(firstCapability.code);
    }
  }, [availableCapabilities, capabilityCode]);

  const completeWithLatestInvocation = (invocationId: string) => {
    void client.getInvocation(invocationId).then((result) => {
      if (!result.ok || activeInvocationId.current !== invocationId) return;
      setInvocation(result.data);
      setOutput((current) => result.data.outputText ?? current);
    });
    void client.readSnapshot().then((result) => {
      if (!result.ok) return;
      setSnapshot(result.data);
      setLoadState('READY');
      setLoadMessage(sourceCopy(result.source));
    });
  };

  const poll = (invocationId: string, afterSequence: number) => {
    if (activeInvocationId.current !== invocationId) return;
    void client.readStream({ invocationId, afterSequence }).then((result) => {
      if (activeInvocationId.current !== invocationId) return;
      if (!result.ok) {
        setActionState('ERROR');
        setActionMessage(result.error.message);
        stopPolling();
        return;
      }
      let latestStatus = invocation?.status ?? 'STREAMING';
      let latestMetering = invocation?.metering ?? null;
      for (const event of result.data.page.events) {
        if (event.invocationId !== invocationId || seenSequences.current.has(event.sequence)) continue;
        seenSequences.current.add(event.sequence);
        if (event.textDelta !== null) setOutput((current) => current + event.textDelta);
        latestStatus = event.status;
        if (event.metering !== null) latestMetering = event.metering;
      }
      setInvocation((current) =>
        current === null || current.id !== invocationId
          ? current
          : { ...current, status: latestStatus, metering: latestMetering },
      );
      const nextSequence = Math.max(afterSequence, result.data.page.nextAfterSequence);
      if (isTerminal(latestStatus)) {
        stopPolling();
        setActionState(latestStatus === 'CANCELLED' ? 'CANCELLED' : 'SUCCESS');
        setActionMessage(
          latestStatus === 'CANCELLED'
            ? '调用已由服务端取消。'
            : latestStatus === 'SUCCEEDED'
              ? '服务端已完成本次调用。'
              : `服务端将本次调用标记为：${invocationStatusLabel(latestStatus)}。`,
        );
        completeWithLatestInvocation(invocationId);
        return;
      }
      pollTimer.current = window.setTimeout(() => poll(invocationId, nextSequence), 650);
    });
  };

  const startStreamIfNeeded = (result: AiGatewayInvocation) => {
    activeInvocationId.current = result.id;
    seenSequences.current = new Set<number>();
    if (isTerminal(result.status)) {
      setActionState(result.status === 'CANCELLED' ? 'CANCELLED' : 'SUCCESS');
      setActionMessage(statusMessageFor(result.status === 'CANCELLED' ? 'CANCELLED' : 'SUCCESS'));
      completeWithLatestInvocation(result.id);
      return;
    }
    setActionState('STREAMING');
    setActionMessage(statusMessageFor('STREAMING'));
    poll(result.id, 0);
  };

  const submitAttempt = (retry = false) => {
    const attempt = retry ? lastAttempt : null;
    const requestedModel = attempt?.modelCode ?? modelCode;
    const requestedCapability = attempt?.capabilityCode ?? capabilityCode;
    const requestedPrompt = attempt?.prompt ?? prompt;
    const model = availableModels.find((candidate) => candidate.code === requestedModel);
    if (
      model === undefined ||
      requestedCapability === '' ||
      !model.capabilityCodes.includes(requestedCapability) ||
      requestedPrompt.trim().length === 0
    ) {
      setActionState('ERROR');
      setActionMessage('请先选择服务端可用模型与能力，并填写内容后再提交。');
      return;
    }
    stopPolling();
    activeInvocationId.current = null;
    seenSequences.current = new Set<number>();
    setInvocation(null);
    setOutput('');
    setActionState('SUBMITTING');
    setActionMessage(statusMessageFor('SUBMITTING'));
    const nextAttempt: InvocationAttempt = {
      modelCode: requestedModel,
      capabilityCode: requestedCapability,
      prompt: requestedPrompt.trim(),
    };
    setLastAttempt(nextAttempt);
    void client
      .createInvocation({
        ...nextAttempt,
        stream: model.supportsStreaming,
        idempotencyKey: createAiLabActionKey(retry ? 'retry-invocation' : 'create-invocation'),
      })
      .then((result) => {
        if (!result.ok) {
          setActionState('ERROR');
          setActionMessage(result.error.message);
          return;
        }
        setInvocation(result.data);
        setOutput(result.data.outputText ?? '');
        startStreamIfNeeded(result.data);
      });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitAttempt();
  };

  const persistDefaults = (
    defaultProviderCode: AiGatewayProviderCode | null,
    defaultModelCode: string | null,
  ) => {
    void client.updatePreferences({ defaultProviderCode, defaultModelCode }).then((result) => {
      if (!result.ok) {
        setPreferenceMessage(`默认模型未保存：${result.error.message}`);
        return;
      }
      setSnapshot((current) => current === null ? current : { ...current, preferences: result.data });
      setPreferenceMessage('默认 Provider 与模型已由服务端保存。');
    });
  };

  const cancel = () => {
    if (invocation === null || isTerminal(invocation.status)) return;
    setActionState('SUBMITTING');
    setActionMessage('正在请求服务端取消该调用…');
    stopPolling();
    void client
      .cancelInvocation({
        invocationId: invocation.id,
        idempotencyKey: createAiLabActionKey('cancel-invocation'),
      })
      .then((result) => {
        if (!result.ok) {
          setActionState('ERROR');
          setActionMessage(result.error.message);
          return;
        }
        activeInvocationId.current = result.data.id;
        setInvocation(result.data);
        setActionState(result.data.status === 'CANCELLED' ? 'CANCELLED' : 'STREAMING');
        setActionMessage(
          result.data.status === 'CANCELLED'
            ? '调用已由服务端取消。'
            : '服务端正在处理取消请求。',
        );
        if (!isTerminal(result.data.status)) poll(result.data.id, 0);
      });
  };

  const revokeByok = (status: AiGatewayByokProviderStatus) => {
    if (status.status !== 'CONFIGURED' || byokState === 'SUBMITTING') return;
    setByokState('SUBMITTING');
    setByokMessage('正在请求服务端撤销该 BYOK 配置…');
    void client
      .revokeByok({
        providerCode: status.providerCode,
        idempotencyKey: createAiLabActionKey('revoke-byok'),
      })
      .then((result) => {
        if (!result.ok) {
          setByokState('ERROR');
          setByokMessage(result.error.message);
          return;
        }
        setByokState('SUCCESS');
        setByokMessage(`${result.data.providerCode} 的 BYOK 配置已由服务端撤销。`);
        refreshSnapshot();
      });
  };

  const canSubmit =
    loadState === 'READY' &&
    actionState !== 'SUBMITTING' &&
    actionState !== 'STREAMING' &&
    selectedModel !== undefined &&
    capabilityCode.length > 0 &&
    prompt.trim().length > 0;
  const hasLiveInvocation = invocation !== null && !isTerminal(invocation.status);

  return (
    <div className="ai-lab-page" data-tier={tier}>
      <section className="ai-lab-hero" aria-labelledby="ai-lab-title">
        <div>
          <p className="eyebrow">AI LAB / SERVER-AUTHORIZED GATEWAY</p>
          <h1 id="ai-lab-title">AI 实验室</h1>
          <p className="lede">
            只在你明确提交后调用服务端网关。模型、能力、配额、权限和 Provider 凭据均由服务端决定。
          </p>
        </div>
        <div className="ai-lab-hero-status" aria-live="polite">
          <span data-source={client.source}>{client.source === 'DEVELOPMENT_FIXTURE' ? 'LOCAL FIXTURE' : client.source}</span>
          <small>{sourceCopy(client.source)}</small>
        </div>
      </section>

      <section className="ai-lab-boundary" aria-label="AI 实验室安全边界">
        <p className="eyebrow">CREDENTIAL &amp; PRIVACY BOUNDARY</p>
        <p>
          本页面不会保存或显示 Provider API Key、BYOK 明文、Provider 响应对象、用户 ID 或客户端权益判断。
          你的 Prompt 只会在点击“提交调用”后发送到服务端 AI Gateway。
        </p>
      </section>

      {loadState === 'LOADING' ? (
        <section className="ai-lab-loading" aria-busy="true" aria-live="polite">
          <span className="inline-spinner" aria-hidden="true" />
          <p>{loadMessage}</p>
        </section>
      ) : null}

      {loadState === 'UNAVAILABLE' || loadState === 'ERROR' ? (
        <section className="ai-lab-unavailable" aria-live="assertive">
          <p className="eyebrow">GATEWAY NOT READY</p>
          <h2>{loadState === 'UNAVAILABLE' ? 'AI Gateway 尚未连接' : '暂时无法读取 AI Gateway'}</h2>
          <p>{loadMessage}</p>
          <button className="quiet-button" type="button" onClick={refreshSnapshot}>
            重新读取服务端状态
          </button>
        </section>
      ) : null}

      {snapshot === null || loadState !== 'READY' ? null : (
        <>
          <section className="ai-lab-registry" aria-labelledby="ai-lab-registry-title">
            <div className="ai-lab-section-heading">
              <div>
                <p className="eyebrow">REGISTRY / SERVER PROJECTION</p>
                <h2 id="ai-lab-registry-title">可用模型与能力</h2>
              </div>
              <button className="quiet-button" type="button" onClick={refreshSnapshot}>
                刷新注册表
              </button>
            </div>
            <p className="ai-lab-section-copy">只显示服务端已经投影的 Provider、模型与能力；不会从客户端推测真实可用性。</p>
            <div className="ai-lab-registry-grid">
              <article>
                <h3>Provider</h3>
                <ul>
                  {snapshot.providers.map((provider) => (
                    <li key={provider.code}>
                      <strong>{provider.displayName}</strong>
                      <span>{provider.status} · {provider.localOnly ? 'LOCAL ONLY' : 'SERVER MANAGED'}</span>
                    </li>
                  ))}
                </ul>
              </article>
              <article>
                <h3>模型</h3>
                <ul>
                  {snapshot.models.map((model) => (
                    <li key={model.code}>
                      <strong>{model.displayName}</strong>
                      <span>{model.providerCode} · {model.status} · {model.supportsStreaming ? 'STREAM' : 'NO STREAM'}</span>
                    </li>
                  ))}
                </ul>
              </article>
              <article>
                <h3>能力</h3>
                <ul>
                  {snapshot.capabilities.map((capability) => (
                    <li key={capability.code}>
                      <strong>{capability.displayName}</strong>
                      <span>{capability.status}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </section>

          <section className="ai-lab-quota" aria-labelledby="ai-lab-quota-title">
            <div>
              <p className="eyebrow">QUOTA / SERVER CONFIRMED</p>
              <h2 id="ai-lab-quota-title">我的安全使用状态</h2>
            </div>
            <dl>
              <div><dt>本周期额度</dt><dd>{snapshot.quota.limit.toLocaleString()} Tokens</dd></div>
              <div><dt>已使用</dt><dd>{snapshot.quota.used.toLocaleString()} Tokens</dd></div>
              <div><dt>剩余</dt><dd>{snapshot.quota.remaining.toLocaleString()} Tokens</dd></div>
              <div><dt>重置时间</dt><dd>{formatDateTime(snapshot.quota.resetsAt)}</dd></div>
            </dl>
          </section>

          <section className="ai-lab-byok" aria-labelledby="ai-lab-byok-title">
            <div className="ai-lab-section-heading">
              <div>
                <p className="eyebrow">BYOK / SERVER-HELD STATUS</p>
                <h2 id="ai-lab-byok-title">BYOK 设置状态</h2>
              </div>
              <p>此页面不接收、保存或显示 API Key 明文。配置仅可通过服务端批准的加密交接流程完成。</p>
            </div>
            {snapshot.byok.length === 0 ? (
              <p className="ai-lab-section-copy">服务端当前没有可展示的第三方 Provider BYOK 状态。</p>
            ) : (
              <ul className="ai-lab-byok-list">
                {snapshot.byok.map((status) => (
                  <li key={status.providerCode}>
                    <div>
                      <strong>{status.providerCode}</strong>
                      <span>{byokStatusLabel(status.status)}</span>
                      <small>
                        配置时间：{formatDateTime(status.configuredAt)} · 撤销时间：{formatDateTime(status.revokedAt)}
                        {' · '}密钥掩码：{status.maskedFingerprint ?? '服务端未提供可展示掩码'}
                      </small>
                    </div>
                    {status.status === 'CONFIGURED' ? (
                      <button
                        className="quiet-button-danger"
                        disabled={byokState === 'SUBMITTING'}
                        type="button"
                        onClick={() => revokeByok(status)}
                      >
                        撤销服务端配置
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {byokMessage.length > 0 ? (
              <p aria-live={byokState === 'ERROR' ? 'assertive' : 'polite'} className={statusClass(byokState)}>
                {byokMessage}
              </p>
            ) : null}
          </section>

          <section className="ai-lab-composer" aria-labelledby="ai-lab-composer-title">
            <div className="ai-lab-section-heading">
              <div>
                <p className="eyebrow">EXPLICIT INVOCATION / NO AUTO-SEND</p>
                <h2 id="ai-lab-composer-title">发起一次 AI 调用</h2>
              </div>
              <p>{modelLabel(selectedModel)}</p>
            </div>
            <form onSubmit={submit}>
              <div className="ai-lab-form-grid">
                <label>
                  Provider
                  <select
                    disabled={hasLiveInvocation}
                    value={providerCode}
                    onChange={(event) => {
                      const nextProviderCode = event.target.value as AiGatewayProviderCode;
                      const nextModel = registryModels(snapshot, nextProviderCode)[0];
                      setProviderCode(nextProviderCode);
                      setModelCode(nextModel?.code ?? '');
                      persistDefaults(nextProviderCode, nextModel?.code ?? null);
                    }}
                  >
                    {snapshot.providers.filter((provider) => provider.status === 'ACTIVE').length === 0 ? <option value="">没有服务端可用 Provider</option> : null}
                    {snapshot.providers.filter((provider) => provider.status === 'ACTIVE').map((provider) => (
                      <option key={provider.code} value={provider.code}>
                        {provider.displayName} · {provider.localOnly ? 'LOCAL ONLY' : 'SERVER MANAGED'}
                      </option>
                    ))}
                  </select>
                  <small>Provider 只来自服务端注册表；选择不提供或暴露 Provider 凭据。</small>
                </label>
                <label>
                  模型
                  <select
                    aria-describedby="ai-lab-model-help"
                    disabled={hasLiveInvocation}
                    value={modelCode}
                    onChange={(event) => {
                      const nextModelCode = event.target.value;
                      setModelCode(nextModelCode);
                      persistDefaults(providerCode || null, nextModelCode || null);
                    }}
                  >
                    {availableModels.length === 0 ? <option value="">没有服务端可用模型</option> : null}
                    {availableModels.map((model) => (
                      <option key={model.code} value={model.code}>
                        {model.displayName} · {model.providerCode}
                      </option>
                    ))}
                  </select>
                  <small id="ai-lab-model-help">明确选择服务端当前可用的模型；选择不等于授权。</small>
                </label>
                <label>
                  能力
                  <select
                    disabled={hasLiveInvocation || selectedModel === undefined}
                    value={capabilityCode}
                    onChange={(event) => setCapabilityCode(event.target.value as AiGatewayCapabilityCode)}
                  >
                    {availableCapabilities.length === 0 ? <option value="">该模型没有可用能力</option> : null}
                    {availableCapabilities.map((capability) => (
                      <option key={capability.code} value={capability.code}>
                        {capability.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {snapshot.preferences.defaultModelCode !== null && !snapshot.models.some(
                (model) => model.code === snapshot.preferences.defaultModelCode && model.status === 'ACTIVE',
              ) ? (
                <p className="ai-lab-inline-status ai-lab-inline-status-error" role="status">
                  你保存的默认模型当前不可用，请重新选择；本次不会使用它。
                </p>
              ) : null}
              {preferenceMessage.length > 0 ? (
                <p className="ai-lab-inline-status" role="status">{preferenceMessage}</p>
              ) : null}
              <label className="ai-lab-prompt-field">
                输入内容
                <textarea
                  aria-describedby="ai-lab-prompt-help"
                  disabled={hasLiveInvocation}
                  maxLength={20_000}
                  placeholder="只有点击提交后，这段内容才会发送给服务端 AI Gateway。"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
                <small id="ai-lab-prompt-help">{prompt.length}/20000 · 不要在这里输入 API Key、密码或其他凭据。</small>
              </label>
              <div className="ai-lab-form-actions">
                <button className="async-button" disabled={!canSubmit} type="submit">
                  {actionState === 'SUBMITTING' ? <span className="inline-spinner" aria-hidden="true" /> : null}
                  {actionState === 'SUBMITTING' ? '正在提交' : '提交调用'}
                </button>
                {hasLiveInvocation ? (
                  <button className="quiet-button-danger" type="button" onClick={cancel}>
                    请求取消
                  </button>
                ) : null}
                {lastAttempt !== null && !hasLiveInvocation ? (
                  <button className="quiet-button" type="button" onClick={() => submitAttempt(true)}>
                    再次提交相同内容
                  </button>
                ) : null}
              </div>
            </form>
            {actionMessage.length > 0 ? (
              <p aria-live={actionState === 'ERROR' ? 'assertive' : 'polite'} className={statusClass(actionState)}>
                {actionMessage}
              </p>
            ) : null}
          </section>

          <InvocationOutput invocation={invocation} output={output} />
        </>
      )}

      <section className="ai-lab-footer-boundary">
        <div>
          <p className="eyebrow">SEPARATE FROM AI USAGE</p>
          <h2>AI 使用记录与 AI 实验室保持分离</h2>
          <p>AI 使用记录只包含自己的时长与来源元数据；它不会自动导入这里的 Prompt 或输出。</p>
        </div>
        <button className="quiet-button" type="button" onClick={() => onNavigate('/ai')}>
          打开 AI 使用记录
        </button>
      </section>
    </div>
  );
}
