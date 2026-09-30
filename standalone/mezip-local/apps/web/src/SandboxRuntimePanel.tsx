import { useEffect, useState } from 'react';
import type {
  SandboxPreview,
  SandboxRuntime,
  SandboxRuntimeArtifact,
  SandboxRuntimeLogPage,
  SandboxRuntimeProblemPage,
  SandboxRuntimeTaskPage,
  SandboxRuntimeUsage,
  SandboxRuntimeTaskType,
  SandboxTerminalSessionPage,
  SandboxWorkspaceChange,
} from '@me-zip/shared-types';
import type { ExperienceTier } from './experienceSettings.js';
import type {
  SandboxRuntimeClient,
  SandboxRuntimeResult,
} from './sandboxRuntimeClient.js';

function renderResult<T>(
  result: SandboxRuntimeResult<T>,
  setStatus: (message: string) => void,
): T | null {
  if (result.ok) return result.data;
  setStatus(result.error.message);
  return null;
}

export function SandboxRuntimePanel({
  client,
  projectId,
  tier,
}: {
  readonly client: SandboxRuntimeClient;
  readonly projectId: string;
  readonly tier: ExperienceTier;
}) {
  const [runtime, setRuntime] = useState<SandboxRuntime | null>(null);
  const [tasks, setTasks] = useState<SandboxRuntimeTaskPage | null>(null);
  const [logs, setLogs] = useState<SandboxRuntimeLogPage | null>(null);
  const [usage, setUsage] = useState<SandboxRuntimeUsage | null>(null);
  const [problems, setProblems] = useState<SandboxRuntimeProblemPage | null>(null);
  const [artifacts, setArtifacts] = useState<readonly SandboxRuntimeArtifact[]>([]);
  const [changes, setChanges] = useState<readonly SandboxWorkspaceChange[]>([]);
  const [terminals, setTerminals] = useState<SandboxTerminalSessionPage | null>(null);
  const [preview, setPreview] = useState<SandboxPreview | null>(null);
  const [terminalInput, setTerminalInput] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = async (runtimeId?: string) => {
    setLoading(true);
    const listed = await client.listRuntimes(projectId);
    const page = renderResult(listed, setStatus);
    const current = page?.items[0] ?? null;
    setRuntime(current);
    const id = runtimeId ?? current?.id;
    if (id !== undefined) {
      const [
        nextTasks,
        nextLogs,
        nextUsage,
        nextProblems,
        nextArtifacts,
        nextChanges,
        nextTerminals,
      ] = await Promise.all([
        client.listTasks(id),
        client.listLogs(id),
        client.getUsage(id),
        client.listProblems(id),
        client.listArtifacts(id),
        client.listWorkspaceChanges(id),
        client.listTerminals(id),
      ]);
      setTasks(renderResult(nextTasks, setStatus));
      setLogs(renderResult(nextLogs, setStatus));
      setUsage(renderResult(nextUsage, setStatus));
      setProblems(renderResult(nextProblems, setStatus));
      setArtifacts(renderResult(nextArtifacts, setStatus) ?? []);
      setChanges(renderResult(nextChanges, setStatus) ?? []);
      setTerminals(renderResult(nextTerminals, setStatus));
    }
    setLoading(false);
  };
  useEffect(() => {
    void refresh();
  }, [projectId]);
  const mutate = async (
    operation: () => Promise<SandboxRuntimeResult<SandboxRuntime>>,
  ) => {
    setLoading(true);
    const next = renderResult(await operation(), setStatus);
    if (next) setRuntime(next);
    setLoading(false);
  };
  const runTask = async (type: SandboxRuntimeTaskType) => {
    if (runtime === null) return;
    setLoading(true);
    const result = await client.runTask(runtime.id, type);
    const task = renderResult(result, setStatus);
    if (task)
      setStatus(
        `任务 ${type} 已由服务端返回 ${task.status}；当前 Provider 不在浏览器执行代码。`,
      );
    await refresh(runtime.id);
  };
  const openTerminal = async () => {
    if (runtime === null) return;
    const session = renderResult(await client.openTerminal(runtime.id), setStatus);
    if (session) {
      setStatus('已连接到 Project Sandbox Terminal；输入不在浏览器保存。');
      await refresh(runtime.id);
    }
  };
  const submitTerminal = async () => {
    const session = terminals?.items.find((item) => item.status === 'OPEN');
    if (runtime === null || session === undefined || terminalInput.trim().length === 0)
      return;
    const result = renderResult(
      await client.writeTerminal(runtime.id, session.id, terminalInput),
      setStatus,
    );
    if (result) {
      setTerminalInput('');
      await refresh(runtime.id);
    }
  };
  const closeTerminal = async () => {
    const session = terminals?.items.find((item) => item.status === 'OPEN');
    if (runtime === null || session === undefined) return;
    const closed = renderResult(
      await client.closeTerminal(runtime.id, session.id),
      setStatus,
    );
    if (closed) {
      setStatus('Project Sandbox Terminal 已关闭。');
      await refresh(runtime.id);
    }
  };
  const detectChanges = async () => {
    if (runtime === null) return;
    const found = renderResult(
      await client.detectWorkspaceChanges(runtime.id),
      setStatus,
    );
    if (found) {
      setChanges(found);
      setStatus(
        found.length === 0
          ? '未检测到 Runtime 修改。'
          : `检测到 ${found.length} 项修改；请先审阅。`,
      );
    }
  };
  const createPreview = async () => {
    if (runtime === null) return;
    const internalPort = runtime.policy.allowedPorts[0];
    if (internalPort === undefined) {
      setStatus('当前 Runtime 没有服务端批准的 Preview 端口。');
      return;
    }
    setLoading(true);
    const exposed = renderResult(await client.exposePort(runtime.id, { internalPort, protocol: 'HTTP' }), setStatus);
    if (exposed === null) { setLoading(false); return; }
    const next = renderResult(await client.createPreview(runtime.id, exposed.id), setStatus);
    if (next !== null) { setPreview(next); setStatus('已创建短时 PRIVATE Preview；它与主站使用不同 Origin。'); }
    setLoading(false);
  };
  return (
    <section
      className="sandbox-runtime-panel layered-card"
      data-tier={tier}
      aria-label="Sandbox Runtime"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">PHASE 11 / ISOLATED RUNTIME</p>
          <h3>安全运行时</h3>
        </div>
        <span className="status-chip">
          {client.source === 'SERVER' ? 'SERVER' : '服务未连接'}
        </span>
      </div>
      <p className="muted-copy">
        运行时只允许服务端 Provider 在隔离环境处理；浏览器不会调用宿主终端、Docker
        或本地 Shell。
      </p>
      {status ? (
        <p className="inline-status" role="status">
          {status}
        </p>
      ) : null}
      {runtime === null ? (
        <div className="empty-state">
          <p>
            尚未连接到服务端 Runtime。配置受控 Sandbox API
            地址后，这里才会显示真实状态。
          </p>
          <button
            className="quiet-button"
            type="button"
            onClick={() =>
              void client.createRuntime(projectId).then((result) => {
                const next = renderResult(result, setStatus);
                if (next) setRuntime(next);
              })
            }
            disabled={loading || client.source !== 'SERVER'}
          >
            创建隔离运行时
          </button>
        </div>
      ) : (
        <>
          <div className="creator-secondary-row">
            <span className="status-chip">{runtime.status}</span>
            <span className="muted-copy">
              Provider: {runtime.provider} · 网络: {runtime.policy.networkMode} ·
              文件根: {runtime.policy.filesystemRoot}
            </span>
            <button
              className="quiet-button"
              type="button"
              onClick={() => void refresh(runtime.id)}
              disabled={loading}
            >
              刷新
            </button>
          </div>
          <div className="creator-action-row">
            <button
              className="quiet-button"
              type="button"
              onClick={() => void mutate(() => client.startRuntime(runtime.id))}
              disabled={loading || runtime.status === 'RUNNING'}
            >
              启动
            </button>
            <button
              className="quiet-button"
              type="button"
              onClick={() => void mutate(() => client.stopRuntime(runtime.id))}
              disabled={loading || runtime.status !== 'RUNNING'}
            >
              停止
            </button>
            <button
              className="quiet-button"
              type="button"
              onClick={() => void mutate(() => client.restartRuntime(runtime.id))}
              disabled={loading}
            >
              重启
            </button>
          </div>
          <div className="creator-action-row">
            {(
              ['INSTALL', 'BUILD', 'TEST', 'LINT', 'TYPECHECK', 'DEV_SERVER'] as const
            ).map((type) => (
              <button
                className="quiet-button"
                type="button"
                key={type}
                onClick={() => void runTask(type)}
                disabled={loading || runtime.status !== 'RUNNING'}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="creator-file-grid">
            <article className="creator-code-viewer">
              <h4>Project Sandbox Terminal</h4>
              <p className="muted-copy">
                仅连接隔离 Provider；不会连接 ME.zip Host
                Shell。输入不被页面或普通日志保留。
              </p>
              <div className="creator-action-row">
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => void openTerminal()}
                  disabled={
                    loading ||
                    runtime.status !== 'RUNNING' ||
                    terminals?.items.some((item) => item.status === 'OPEN')
                  }
                >
                  打开终端
                </button>
                <input
                  aria-label="Project Sandbox Terminal 命令"
                  value={terminalInput}
                  onChange={(event) => setTerminalInput(event.target.value)}
                  placeholder="在隔离 Sandbox 中执行命令"
                  disabled={
                    terminals?.items.some((item) => item.status === 'OPEN') !== true
                  }
                />
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => void submitTerminal()}
                  disabled={
                    terminalInput.trim().length === 0 ||
                    terminals?.items.some((item) => item.status === 'OPEN') !== true
                  }
                >
                  运行
                </button>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => void closeTerminal()}
                  disabled={
                    terminals?.items.some((item) => item.status === 'OPEN') !== true
                  }
                >
                  关闭
                </button>
              </div>
              {logs?.items.length ? (
                logs.items.map((log) => <pre key={log.id}>{log.text}</pre>)
              ) : (
                <p className="muted-copy">暂无日志；敏感值由服务端脱敏。</p>
              )}
            </article>
            <article className="creator-code-viewer">
              <h4>任务与问题</h4>
              {tasks?.items.length ? (
                tasks.items.map((task) => (
                  <div key={task.id}>
                    <p className="muted-copy">
                      {task.type} · {task.status} · exit {task.exitCode ?? '—'} ·{' '}
                      {task.problemCount ?? 0} 个问题
                    </p>
                    {task.status === 'RUNNING' ? (
                      <button
                        className="quiet-button"
                        type="button"
                        onClick={() =>
                          void client
                            .cancelTask(runtime.id, task.id)
                            .then(() => refresh(runtime.id))
                        }
                      >
                        取消任务
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="muted-copy">暂无服务端任务。</p>
              )}
              {problems?.items.length ? (
                problems.items.map((problem) => (
                  <p key={problem.id} className="creator-unsaved">
                    {problem.severity} · {problem.path ?? 'Runtime'}{' '}
                    {problem.line ?? ''}: {problem.message}
                  </p>
                ))
              ) : (
                <p className="muted-copy">暂无服务端问题。</p>
              )}
            </article>
          </div>
          <div className="creator-file-grid">
            <article className="creator-code-viewer">
              <h4>Runtime 修改审阅</h4>
              <button
                className="quiet-button"
                type="button"
                onClick={() => void detectChanges()}
                disabled={loading}
              >
                检测修改
              </button>
              {changes.length ? (
                changes.map((change) => (
                  <div key={change.id}>
                    <p className="muted-copy">
                      {change.operation} {change.path} · {change.status}
                    </p>
                    {change.status === 'DETECTED' ? (
                      <button
                        className="quiet-button"
                        type="button"
                        onClick={() =>
                          void client
                            .reviewWorkspaceChange(runtime.id, change.id, 'REVIEW')
                            .then(() => refresh(runtime.id))
                        }
                      >
                        标记已审阅
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="muted-copy">运行时不能无声覆盖项目源代码。</p>
              )}
            </article>
            <article className="creator-code-viewer">
              <h4>资源与产物</h4>
              <p className="muted-copy">
                CPU {usage?.cpuMillis ?? 0} ms · Memory {usage?.memoryBytes ?? 0} bytes
                · Disk {usage?.diskBytes ?? 0} bytes
              </p>
              {artifacts.length ? (
                artifacts.map((artifact) => (
                  <p key={artifact.id} className="muted-copy">
                    {artifact.name} · {artifact.sizeBytes} bytes · {artifact.status}
                  </p>
                ))
              ) : (
                <p className="muted-copy">
                  暂无服务端构建产物。Preview 仅在服务端端口授权后产生 PRIVATE URL。
                </p>
              )}
            </article>
          </div>
          <article className="creator-code-viewer">
            <h4>Private Preview</h4>
            <p className="muted-copy">Preview 只使用服务端批准的端口、HTTPS 私有 Origin、短期 nonce 与 restrictive CSP；不会携带 ME.zip 主站 Cookie。</p>
            <button className="quiet-button" type="button" onClick={() => void createPreview()} disabled={loading || runtime.status !== 'RUNNING' || runtime.policy.allowedPorts.length === 0}>创建 PRIVATE Preview</button>
            {preview?.status === 'READY' ? <iframe title="Project Sandbox Preview" src={preview.origin} sandbox="allow-scripts" referrerPolicy="no-referrer" loading="lazy" className="sandbox-preview-frame" /> : <p className="muted-copy">暂无 Preview；未配置端口或服务端 Preview Gateway 不可用时保持不可用。</p>}
          </article>
        </>
      )}
    </section>
  );
}
