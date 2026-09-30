import { createHash, randomUUID } from 'node:crypto';
import type {
  AuthenticatedPrincipal,
  CapabilityCode,
  SandboxPreview,
  SandboxRuntime,
  SandboxRuntimeArtifact,
  SandboxRuntimeCleanupResult,
  SandboxRuntimeConfig,
  SandboxRuntimeEnvironmentVariable,
  SandboxRuntimeLog,
  SandboxRuntimeLogPage,
  SandboxRuntimeNetworkMode,
  SandboxRuntimePage,
  SandboxRuntimePolicy,
  SandboxRuntimePort,
  SandboxRuntimeProcess,
  SandboxRuntimeProblem,
  SandboxRuntimeProblemPage,
  SandboxRuntimeResourceLimits,
  SandboxRuntimeTask,
  SandboxRuntimeTaskPage,
  SandboxRuntimeTaskType,
  SandboxRuntimeUsage,
  SandboxRuntimeTokenMetadata,
  SandboxTerminalSession,
  SandboxTerminalSessionPage,
  SandboxWorkspaceChange,
} from '@me-zip/shared-types';

export type SandboxRuntimeErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'ENTITLEMENT_REQUIRED'
  | 'VALIDATION'
  | 'RUNTIME_CONFLICT'
  | 'RUNTIME_EXPIRED'
  | 'COMMAND_BLOCKED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PREVIEW_UNAVAILABLE'
  | 'TASK_UNAVAILABLE'
  | 'TERMINAL_UNAVAILABLE'
  | 'CHANGE_REVIEW_REQUIRED'
  | 'QUOTA_EXCEEDED'
  | 'SECRET_UNAVAILABLE'
  | 'RUNTIME_RECOVERY_REQUIRED';

export class SandboxRuntimeError extends Error {
  public constructor(
    public readonly code: SandboxRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SandboxRuntimeError';
  }
}

export const SANDBOX_CAPABILITY = 'SANDBOX_RUNTIME_ACCESS' as CapabilityCode;
export const SANDBOX_RUNTIME_IMAGE = 'mezip/sandbox-node:reviewed';

export interface SandboxProjectReader {
  getProjectOwner(projectId: string): Promise<string | null>;
  getWorkspaceVersion(projectId: string): Promise<number | null>;
  /** Trusted server projection of repository metadata; never client supplied. */
  getRuntimeConfig?(projectId: string): Promise<SandboxRuntimeConfig | null>;
}

export interface SandboxEntitlementResolver {
  has(
    principal: AuthenticatedPrincipal,
    capability: CapabilityCode,
  ): Promise<boolean> | boolean;
}

export interface SandboxAuditSink {
  append(event: {
    readonly action: string;
    readonly actorUserId: string;
    readonly runtimeId?: string;
    readonly projectId?: string;
    readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
  }): void;
}

export interface SandboxProviderRuntimeInput {
  readonly runtimeId: string;
  readonly projectId: string;
  readonly limits: SandboxRuntimeResourceLimits;
  readonly policy: SandboxRuntimePolicy;
  readonly runtimeImage: string;
}

export interface SandboxProviderExecResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  /** The provider, not the client, reports an enforced execution deadline. */
  readonly timedOut?: boolean;
  readonly artifacts?: readonly {
    readonly name: string;
    readonly relativePath: string;
    readonly sizeBytes: number;
    readonly checksum: string;
    readonly contentType: string;
  }[];
  readonly problems?: readonly {
    readonly severity: 'ERROR' | 'WARNING' | 'INFO';
    readonly message: string;
    readonly path?: string;
    readonly line?: number;
    readonly column?: number;
    readonly code?: string;
    readonly source: SandboxRuntimeProblem['source'];
  }[];
}

export interface SandboxRuntimeProvider {
  readonly code:
    'MOCK' | 'LOCAL_CONTAINER' | 'REMOTE_CONTAINER' | 'MICROVM' | 'MANAGED';
  createRuntime(
    input: SandboxProviderRuntimeInput,
  ): Promise<{ readonly providerRuntimeId: string }>;
  startRuntime(providerRuntimeId: string): Promise<void>;
  stopRuntime(providerRuntimeId: string): Promise<void>;
  destroyRuntime(providerRuntimeId: string): Promise<void>;
  exec(
    providerRuntimeId: string,
    input: {
      readonly command: string;
      readonly cwd: '/workspace';
      readonly timeoutMs: number;
    },
  ): Promise<SandboxProviderExecResult>;
  cancelExecution(
    providerRuntimeId: string,
    input: { readonly taskId: string },
  ): Promise<void>;
  spawnProcess(
    providerRuntimeId: string,
    input: {
      readonly label: string;
      readonly command: string;
      readonly cwd: '/workspace';
    },
  ): Promise<{ readonly providerProcessId: string }>;
  killProcess(providerRuntimeId: string, providerProcessId: string): Promise<void>;
  mountWorkspace(
    providerRuntimeId: string,
    input: { readonly projectId: string; readonly workspaceId: string },
  ): Promise<void>;
  getWorkspaceChanges(
    providerRuntimeId: string,
    input: { readonly projectId: string; readonly workspaceId: string },
  ): Promise<readonly SandboxWorkspaceChange[]>;
  syncWorkspace(
    providerRuntimeId: string,
    input: {
      readonly projectId: string;
      readonly workspaceId: string;
      readonly changeIds: readonly string[];
    },
  ): Promise<readonly SandboxWorkspaceChange[]>;
  exposePort(
    providerRuntimeId: string,
    input: {
      readonly internalPort: number;
      readonly protocol: 'HTTP' | 'HTTPS' | 'WS';
    },
  ): Promise<{ readonly providerPortId: string }>;
  installDependencies(
    providerRuntimeId: string,
    input: {
      readonly packageManager: 'NPM' | 'PNPM' | 'YARN';
      readonly frozen: boolean;
      readonly timeoutMs: number;
    },
  ): Promise<SandboxProviderExecResult>;
  openTerminal(
    providerRuntimeId: string,
    input: {
      readonly columns: number;
      readonly rows: number;
      readonly cwd: '/workspace';
    },
  ): Promise<{ readonly providerTerminalId: string }>;
  writeTerminal(
    providerRuntimeId: string,
    input: { readonly providerTerminalId: string; readonly input: string },
  ): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode?: number | null }>;
  resizeTerminal(
    providerRuntimeId: string,
    input: {
      readonly providerTerminalId: string;
      readonly columns: number;
      readonly rows: number;
    },
  ): Promise<void>;
  closeTerminal(providerRuntimeId: string, providerTerminalId: string): Promise<void>;
  injectSecretReferences(
    providerRuntimeId: string,
    input: { readonly references: readonly string[]; readonly expiresAt: string },
  ): Promise<void>;
  revokeInjectedSecrets(providerRuntimeId: string): Promise<void>;
  createScopedRuntimeToken(
    providerRuntimeId: string,
    input: {
      readonly runtimeId: string;
      readonly projectId: string;
      readonly expiresAt: string;
    },
  ): Promise<{ readonly tokenReferenceHash: string }>;
  revokeScopedRuntimeToken(providerRuntimeId: string): Promise<void>;
  cleanupRuntime(providerRuntimeId: string): Promise<void>;
  recoverRuntime(providerRuntimeId: string): Promise<'READY' | 'RUNNING' | 'LOST'>;
  getLogs(
    providerRuntimeId: string,
    cursor: string | null,
    limit: number,
  ): Promise<readonly SandboxRuntimeLog[]>;
  getResourceUsage(providerRuntimeId: string): Promise<SandboxRuntimeUsage>;
}

/** Separate preview-gateway boundary. A real gateway authenticates the owner,
 * maps one private preview to one sandbox port and never forwards main-app
 * cookies to the preview origin. */
export interface SandboxPreviewGateway {
  readonly code: 'MOCK' | 'ISOLATED_PROXY';
  createPrivatePreview(input: {
    readonly previewId: string;
    readonly runtimeId: string;
    readonly projectId: string;
    readonly userId: string;
    readonly portId: string;
    readonly nonce: string;
    readonly expiresAt: string;
  }): Promise<{ readonly origin: string; readonly csp: string }>;
  revokePreview(previewId: string): Promise<void>;
}

export class MockSandboxPreviewGateway implements SandboxPreviewGateway {
  public readonly code = 'MOCK' as const;
  async createPrivatePreview(input: {
    readonly previewId: string;
    readonly runtimeId: string;
    readonly projectId: string;
    readonly userId: string;
    readonly portId: string;
    readonly nonce: string;
    readonly expiresAt: string;
  }) {
    void input;
    return {
      origin: `https://preview.invalid/sandbox/${input.nonce}`,
      csp: "default-src 'self'; frame-ancestors 'none'; object-src 'none'; connect-src 'none'; base-uri 'none'",
    };
  }
  async revokePreview(previewId: string): Promise<void> {
    void previewId;
  }
}

interface MockProviderState {
  readonly id: string;
  readonly runtimeId: string;
  readonly logs: SandboxRuntimeLog[];
  started: boolean;
}

/**
 * Development-only provider. It deliberately never invokes a shell, process,
 * container runtime or network. It validates the provider boundary while
 * returning deterministic simulated task output.
 */
export class MockSandboxProvider implements SandboxRuntimeProvider {
  public readonly code = 'MOCK' as const;
  private readonly runtimes = new Map<string, MockProviderState>();
  private readonly id = () => randomUUID();
  private readonly now = () => new Date().toISOString();
  async createRuntime(input: SandboxProviderRuntimeInput) {
    const providerRuntimeId = `mock-${this.id()}`;
    this.runtimes.set(providerRuntimeId, {
      id: providerRuntimeId,
      runtimeId: input.runtimeId,
      logs: [],
      started: false,
    });
    return { providerRuntimeId };
  }
  async startRuntime(providerRuntimeId: string) {
    this.require(providerRuntimeId).started = true;
  }
  async stopRuntime(providerRuntimeId: string) {
    this.require(providerRuntimeId).started = false;
  }
  async destroyRuntime(providerRuntimeId: string) {
    this.runtimes.delete(providerRuntimeId);
  }
  async exec(
    providerRuntimeId: string,
    input: {
      readonly command: string;
      readonly cwd: '/workspace';
      readonly timeoutMs: number;
    },
  ) {
    const state = this.require(providerRuntimeId);
    if (!state.started) throw new Error('runtime is not started');
    const safe = digest(input.command).slice(0, 12);
    return {
      exitCode: 0,
      stdout: `[mock-sandbox] command ${safe} accepted; execution disabled\n`,
      stderr: '',
      durationMs: Math.min(10, input.timeoutMs),
    };
  }
  async cancelExecution(providerRuntimeId: string, input: { readonly taskId: string }) {
    this.require(providerRuntimeId);
    void input;
  }
  async spawnProcess(
    providerRuntimeId: string,
    input: {
      readonly label: string;
      readonly command: string;
      readonly cwd: '/workspace';
    },
  ) {
    this.require(providerRuntimeId);
    return {
      providerProcessId: `mock-process-${digest(`${input.label}:${input.command}`).slice(0, 16)}`,
    };
  }
  async killProcess(providerRuntimeId: string, providerProcessId: string) {
    this.require(providerRuntimeId);
    void providerProcessId;
  }
  async mountWorkspace(
    providerRuntimeId: string,
    input: { readonly projectId: string; readonly workspaceId: string },
  ) {
    this.require(providerRuntimeId);
    void input;
  }
  async getWorkspaceChanges(
    providerRuntimeId: string,
    input: { readonly projectId: string; readonly workspaceId: string },
  ): Promise<readonly SandboxWorkspaceChange[]> {
    this.require(providerRuntimeId);
    void input;
    return [];
  }
  async syncWorkspace(
    providerRuntimeId: string,
    input: {
      readonly projectId: string;
      readonly workspaceId: string;
      readonly changeIds: readonly string[];
    },
  ): Promise<readonly SandboxWorkspaceChange[]> {
    this.require(providerRuntimeId);
    void input;
    return [];
  }
  async exposePort(
    providerRuntimeId: string,
    input: {
      readonly internalPort: number;
      readonly protocol: 'HTTP' | 'HTTPS' | 'WS';
    },
  ) {
    this.require(providerRuntimeId);
    return {
      providerPortId: `mock-port-${input.internalPort}-${input.protocol.toLowerCase()}`,
    };
  }
  async installDependencies(
    providerRuntimeId: string,
    input: {
      readonly packageManager: 'NPM' | 'PNPM' | 'YARN';
      readonly frozen: boolean;
      readonly timeoutMs: number;
    },
  ) {
    return this.exec(providerRuntimeId, {
      command:
        `${input.packageManager.toLowerCase()} install ${input.frozen ? '--frozen-lockfile' : ''}`.trim(),
      cwd: '/workspace',
      timeoutMs: input.timeoutMs,
    });
  }
  async openTerminal(
    providerRuntimeId: string,
    input: {
      readonly columns: number;
      readonly rows: number;
      readonly cwd: '/workspace';
    },
  ) {
    this.require(providerRuntimeId);
    return {
      providerTerminalId: `mock-terminal-${digest(`${input.columns}:${input.rows}:${input.cwd}`).slice(0, 16)}`,
    };
  }
  async writeTerminal(
    providerRuntimeId: string,
    input: { readonly providerTerminalId: string; readonly input: string },
  ) {
    this.require(providerRuntimeId);
    void input;
    return {
      stdout: '[mock-sandbox] terminal input accepted; execution disabled\n',
      stderr: '',
      exitCode: null,
    };
  }
  async resizeTerminal(
    providerRuntimeId: string,
    input: {
      readonly providerTerminalId: string;
      readonly columns: number;
      readonly rows: number;
    },
  ) {
    this.require(providerRuntimeId);
    void input;
  }
  async closeTerminal(providerRuntimeId: string, providerTerminalId: string) {
    this.require(providerRuntimeId);
    void providerTerminalId;
  }
  async injectSecretReferences(
    providerRuntimeId: string,
    input: { readonly references: readonly string[]; readonly expiresAt: string },
  ) {
    this.require(providerRuntimeId);
    void input;
  }
  async revokeInjectedSecrets(providerRuntimeId: string) {
    this.require(providerRuntimeId);
  }
  async createScopedRuntimeToken(
    providerRuntimeId: string,
    input: {
      readonly runtimeId: string;
      readonly projectId: string;
      readonly expiresAt: string;
    },
  ) {
    this.require(providerRuntimeId);
    return {
      tokenReferenceHash: digest(
        `${input.runtimeId}:${input.projectId}:${input.expiresAt}`,
      ),
    };
  }
  async revokeScopedRuntimeToken(providerRuntimeId: string) {
    this.require(providerRuntimeId);
  }
  async cleanupRuntime(providerRuntimeId: string) {
    this.require(providerRuntimeId).started = false;
  }
  async recoverRuntime(providerRuntimeId: string) {
    return this.require(providerRuntimeId).started ? 'RUNNING' : 'READY';
  }
  async getLogs(providerRuntimeId: string, cursor: string | null, limit: number) {
    const state = this.require(providerRuntimeId);
    const start =
      cursor === null
        ? 0
        : Math.max(0, state.logs.findIndex((item) => item.id === cursor) + 1);
    return state.logs.slice(start, start + limit).map((item) => ({ ...item }));
  }
  async getResourceUsage(providerRuntimeId: string) {
    this.require(providerRuntimeId);
    return {
      runtimeId: providerRuntimeId,
      cpuMillis: 0,
      memoryBytes: 0,
      diskBytes: 0,
      runtimeSeconds: 0,
      buildSeconds: 0,
    };
  }
  private require(providerRuntimeId: string): MockProviderState {
    const state = this.runtimes.get(providerRuntimeId);
    if (state === undefined) throw new Error('provider runtime unavailable');
    return state;
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function clone<T>(value: T): T {
  return structuredClone(value);
}
function isRoot(principal: AuthenticatedPrincipal): boolean {
  return principal.roles.includes('ORIGINAL_DEVELOPER_ROOT');
}
function defaultLimits(): SandboxRuntimeResourceLimits {
  return {
    cpuMillis: 500,
    memoryBytes: 512 * 1024 * 1024,
    diskBytes: 2 * 1024 * 1024 * 1024,
    processLimit: 64,
    commandTimeoutMs: 120_000,
    idleTimeoutMs: 30 * 60_000,
    maxLifetimeMs: 4 * 60 * 60_000,
    maxLogBytes: 256 * 1024,
  };
}
function isPrivateOrLocalHost(host: string): boolean {
  const value = host.toLowerCase();
  if (
    ['localhost', 'metadata.google.internal'].includes(value) ||
    value.endsWith('.localhost')
  )
    return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(value);
  if (ipv4 === null)
    return value === '::1' || value.startsWith('fc') || value.startsWith('fd');
  const [a, b] = ipv4.slice(1).map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
function policy(
  networkMode: SandboxRuntimeNetworkMode,
  allowedHosts: readonly string[],
  allowedPorts: readonly number[],
): SandboxRuntimePolicy {
  const hosts = [...new Set(allowedHosts.map((host) => host.toLowerCase()))];
  if (hosts.some(isPrivateOrLocalHost))
    throw new SandboxRuntimeError(
      'VALIDATION',
      'Internal, loopback and metadata hosts are not permitted in sandbox policy.',
    );
  if (networkMode === 'DENY_ALL' && hosts.length > 0)
    throw new SandboxRuntimeError(
      'VALIDATION',
      'DENY_ALL runtime policy cannot include egress hosts.',
    );
  const registryHosts = new Set([
    'registry.npmjs.org',
    'registry.yarnpkg.com',
    'registry.npmmirror.com',
  ]);
  if (networkMode === 'REGISTRY_ONLY' && hosts.some((host) => !registryHosts.has(host)))
    throw new SandboxRuntimeError(
      'VALIDATION',
      'REGISTRY_ONLY policy permits configured package registries only.',
    );
  return {
    networkMode,
    allowedHosts: hosts,
    allowedPorts: [...new Set(allowedPorts)],
    filesystemRoot: '/workspace',
    hostMounts: [],
    privileged: false,
    hostNetwork: false,
    hostPid: false,
    hostIpc: false,
    dockerSocket: false,
    runtimeUser: 'sandbox',
    securityProfile: 'PLATFORM_DEFAULT',
    linuxCapabilities: [],
  };
}
function safeCommand(command: string): void {
  if (
    command.includes('\0') ||
    /(?:\/var\/run\/docker\.sock|--privileged|host\s+(?:network|pid|ipc)|(?:^|\s)(?:mount|nsenter|unshare)\b|169\.254\.169\.254)/iu.test(
      command,
    )
  )
    throw new SandboxRuntimeError(
      'COMMAND_BLOCKED',
      'Command is blocked by sandbox policy.',
    );
}
function redactText(text: string): string {
  return text.replace(
    /(?:bearer\s+|api[_-]?key\s*[=:]\s*|token\s*[=:]\s*)[^\s]+/giu,
    '[REDACTED]',
  );
}
export interface SandboxSecretFinding {
  readonly kind: 'BEARER' | 'API_KEY' | 'TOKEN' | 'PRIVATE_KEY' | 'ASSIGNMENT';
  readonly fingerprint: string;
}
/** Lightweight metadata-only scanner. It returns fingerprints, never matched values. */
export function scanSecretText(text: string): readonly SandboxSecretFinding[] {
  const patterns: readonly [SandboxSecretFinding['kind'], RegExp][] = [
    ['BEARER', /bearer\s+([^\s]+)/giu],
    ['API_KEY', /api[_-]?key\s*[=:]\s*([^\s]+)/giu],
    ['TOKEN', /token\s*[=:]\s*([^\s]+)/giu],
    ['PRIVATE_KEY', /-----BEGIN [A-Z ]*PRIVATE KEY-----/gu],
    ['ASSIGNMENT', /\b(?:SECRET|PASSWORD|ACCESS_KEY)\s*=\s*([^\s]+)/giu],
  ];
  const findings: SandboxSecretFinding[] = [];
  for (const [kind, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      findings.push({ kind, fingerprint: digest(`${kind}:${match[0]}`).slice(0, 16) });
    }
  }
  return findings;
}
function parseProblems(
  text: string,
  source: SandboxRuntimeProblem['source'],
): readonly NonNullable<SandboxProviderExecResult['problems']>[number][] {
  const problems: NonNullable<SandboxProviderExecResult['problems']>[number][] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^([^:\n]+):(\d+):(\d+):\s*(error|warning)\s*:?[\s]*(.+)$/iu.exec(
      line.trim(),
    );
    if (match === null) continue;
    problems.push({
      path: match[1]!,
      line: Number(match[2]),
      column: Number(match[3]),
      severity: match[4]!.toUpperCase() as 'ERROR' | 'WARNING',
      message: redactText(match[5]!),
      source,
    });
  }
  return problems;
}
export interface SandboxRuntimeServiceOptions {
  readonly projectReader: SandboxProjectReader;
  readonly entitlementResolver: SandboxEntitlementResolver;
  readonly provider?: SandboxRuntimeProvider;
  readonly audit?: SandboxAuditSink;
  readonly id?: () => string;
  readonly now?: () => string;
  readonly limits?: Partial<SandboxRuntimeResourceLimits>;
  readonly maxConcurrentRuntimes?: number;
  readonly runtimeTokenLifetimeMs?: number;
  readonly previewOriginFactory?: (input: {
    readonly runtimeId: string;
    readonly userId: string;
    readonly projectId: string;
    readonly nonce: string;
  }) => string;
  readonly previewGateway?: SandboxPreviewGateway;
  readonly usageGuard?: SandboxUsageGuard;
}

/** Server-owned usage/quota seam. The client cannot supply cost or credit values. */
export interface SandboxUsageGuard {
  reserveRuntime(input: { readonly userId: string; readonly projectId: string; readonly limits: SandboxRuntimeResourceLimits }): Promise<void> | void;
  releaseRuntime?(input: { readonly userId: string; readonly projectId: string; readonly runtimeId: string }): Promise<void> | void;
  recordTask(input: { readonly userId: string; readonly projectId: string; readonly runtimeId: string; readonly type: SandboxRuntimeTaskType; readonly durationMs: number; readonly status: SandboxRuntimeTask['status']; readonly usage: SandboxRuntimeUsage }): Promise<void> | void;
}

/** Internal server seam for the Phase 10 proposal -> apply -> build -> inspect loop.
 * It never accepts an AI prompt, owner, source content or host command from a consumer. */
export interface SandboxAIBuildLoopHooks {
  proposeFix(input: { readonly runtimeId: string; readonly taskId: string; readonly problems: readonly SandboxRuntimeProblem[] }): Promise<{ readonly approved: boolean }>;
  applyReviewedChange(input: { readonly runtimeId: string; readonly taskId: string }): Promise<void>;
}

export class SandboxRuntimeService {
  private readonly runtimes = new Map<string, SandboxRuntime>();
  private readonly providerIds = new Map<string, string>();
  private readonly tasks = new Map<string, SandboxRuntimeTask>();
  private readonly logs = new Map<string, SandboxRuntimeLog[]>();
  private readonly processes = new Map<string, SandboxRuntimeProcess>();
  private readonly processProviderIds = new Map<string, string>();
  private readonly ports = new Map<string, SandboxRuntimePort>();
  private readonly previews = new Map<string, SandboxPreview>();
  private readonly changes = new Map<string, SandboxWorkspaceChange>();
  private readonly terminals = new Map<string, SandboxTerminalSession>();
  private readonly terminalProviderIds = new Map<string, string>();
  private readonly environment = new Map<string, SandboxRuntimeEnvironmentVariable>();
  private readonly tokens = new Map<string, SandboxRuntimeTokenMetadata>();
  private readonly artifacts = new Map<string, SandboxRuntimeArtifact>();
  private readonly problems = new Map<string, SandboxRuntimeProblem>();
  private readonly cleanup = new Map<string, SandboxRuntimeCleanupResult>();
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly provider: SandboxRuntimeProvider;
  private readonly limits: SandboxRuntimeResourceLimits;
  private readonly previewGateway: SandboxPreviewGateway;
  public constructor(private readonly options: SandboxRuntimeServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? randomUUID;
    this.provider = options.provider ?? new MockSandboxProvider();
    this.previewGateway = options.previewGateway ?? new MockSandboxPreviewGateway();
    this.limits = { ...defaultLimits(), ...options.limits };
  }
  private async access(
    principal: AuthenticatedPrincipal,
    projectId: string,
    write = false,
  ): Promise<string> {
    const owner = await this.options.projectReader.getProjectOwner(projectId);
    if (owner === null)
      throw new SandboxRuntimeError('NOT_FOUND', 'Project was not found.');
    if (owner !== principal.userId && !isRoot(principal))
      throw new SandboxRuntimeError('NOT_FOUND', 'Project was not found.');
    if (write && owner !== principal.userId)
      throw new SandboxRuntimeError(
        'FORBIDDEN',
        'Root inspection cannot mutate a user runtime.',
      );
    if (
      !isRoot(principal) &&
      !(await this.options.entitlementResolver.has(principal, SANDBOX_CAPABILITY))
    )
      throw new SandboxRuntimeError(
        'ENTITLEMENT_REQUIRED',
        'Sandbox runtime entitlement is required.',
      );
    return owner;
  }
  private touch(runtime: SandboxRuntime): SandboxRuntime {
    const lastActivityAt = this.now();
    return {
      ...runtime,
      lastActivityAt,
      idleExpiresAt: new Date(
        Date.parse(lastActivityAt) + runtime.limits.idleTimeoutMs,
      ).toISOString(),
    };
  }
  private runtime(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    write = false,
  ): SandboxRuntime {
    const runtime = this.runtimes.get(runtimeId);
    if (
      runtime === undefined ||
      (runtime.userId !== principal.userId && !isRoot(principal))
    )
      throw new SandboxRuntimeError('NOT_FOUND', 'Runtime was not found.');
    if (write && runtime.userId !== principal.userId)
      throw new SandboxRuntimeError(
        'FORBIDDEN',
        'Root inspection cannot mutate a user runtime.',
      );
    const now = Date.parse(this.now());
    if (
      (Date.parse(runtime.expiresAt) <= now ||
        (runtime.idleExpiresAt !== undefined &&
          Date.parse(runtime.idleExpiresAt) <= now)) &&
      !['EXPIRED', 'DESTROYED'].includes(runtime.status)
    )
      throw new SandboxRuntimeError(
        'RUNTIME_EXPIRED',
        'Runtime has expired or become idle.',
      );
    return runtime;
  }
  async createRuntime(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: {
      readonly runtimeImage?: string;
      readonly networkMode: SandboxRuntimeNetworkMode;
      readonly allowedHosts: readonly string[];
      readonly allowedPorts: readonly number[];
    },
  ): Promise<SandboxRuntime> {
    const owner = await this.access(principal, projectId, true);
    const maxConcurrent = this.options.maxConcurrentRuntimes ?? 1;
    const active = [...this.runtimes.values()].filter(
      (item) =>
        item.userId === owner &&
        !['DESTROYED', 'EXPIRED', 'FAILED'].includes(item.status),
    );
    if (active.length >= maxConcurrent)
      throw new SandboxRuntimeError(
        'QUOTA_EXCEEDED',
        'Concurrent sandbox runtime limit reached.',
      );
    const id = this.id();
    const createdAt = this.now();
    const expiresAt = new Date(
      Date.parse(createdAt) + this.limits.maxLifetimeMs,
    ).toISOString();
    const runtime: SandboxRuntime = {
      id,
      userId: owner,
      projectId,
      workspaceId: projectId,
      provider: this.provider.code,
      status: 'CREATING',
      runtimeImage: input.runtimeImage ?? SANDBOX_RUNTIME_IMAGE,
      limits: clone(this.limits),
      policy: policy(input.networkMode, input.allowedHosts, input.allowedPorts),
      createdAt,
      startedAt: null,
      expiresAt,
      stoppedAt: null,
      currentTaskId: null,
      previewId: null,
      ephemeral: true,
      cleanupAt: expiresAt,
      lastActivityAt: createdAt,
      idleExpiresAt: new Date(
        Date.parse(createdAt) + this.limits.idleTimeoutMs,
      ).toISOString(),
      recoveryState: 'HEALTHY',
    };
    await this.options.usageGuard?.reserveRuntime({ userId: owner, projectId, limits: runtime.limits });
    let providerRuntimeId: string | null = null;
    try {
      const created = await this.provider.createRuntime({
        runtimeId: id,
        projectId,
        limits: runtime.limits,
        policy: runtime.policy,
        runtimeImage: runtime.runtimeImage,
      });
      providerRuntimeId = created.providerRuntimeId;
      this.providerIds.set(id, created.providerRuntimeId);
      await this.provider.mountWorkspace(created.providerRuntimeId, {
        projectId,
        workspaceId: projectId,
      });
    const tokenExpiresAt = new Date(
      Date.parse(createdAt) +
        (this.options.runtimeTokenLifetimeMs ??
          Math.min(this.limits.idleTimeoutMs, 30 * 60_000)),
    ).toISOString();
      const token = await this.provider.createScopedRuntimeToken(
        created.providerRuntimeId,
        { runtimeId: id, projectId, expiresAt: tokenExpiresAt },
      );
      this.tokens.set(id, {
        id: this.id(),
        runtimeId: id,
        scope: ['WORKSPACE_READ', 'WORKSPACE_SYNC'],
        expiresAt: tokenExpiresAt,
        status: 'ACTIVE',
        tokenReferenceHash: token.tokenReferenceHash,
      });
      this.runtimes.set(id, { ...runtime, status: 'READY' });
      this.logs.set(id, []);
      this.audit(principal, 'RUNTIME_CREATE', id, projectId, {
        provider: runtime.provider,
        networkMode: input.networkMode,
        ephemeral: true,
      });
      return clone(this.runtimes.get(id)!);
    } catch (error) {
      if (providerRuntimeId !== null) {
        try { await this.provider.cleanupRuntime(providerRuntimeId); } catch { /* cleanup is best effort before surfacing the provider error */ }
        try { await this.provider.destroyRuntime(providerRuntimeId); } catch { /* cleanup is best effort before surfacing the provider error */ }
      }
      this.providerIds.delete(id);
      await this.options.usageGuard?.releaseRuntime?.({ userId: owner, projectId, runtimeId: id });
      throw error;
    }
  }
  async listRuntimes(
    principal: AuthenticatedPrincipal,
    projectId?: string,
  ): Promise<SandboxRuntimePage> {
    if (projectId !== undefined) await this.access(principal, projectId);
    const items = [...this.runtimes.values()].filter(
      (item) =>
        item.userId === principal.userId &&
        (projectId === undefined || item.projectId === projectId),
    );
    return { items: clone(items), nextCursor: null };
  }
  async getRuntime(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntime> {
    return clone(this.runtime(principal, runtimeId));
  }
  async startRuntime(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntime> {
    const runtime = this.runtime(principal, runtimeId, true);
    if (!['READY', 'STOPPED'].includes(runtime.status))
      throw new SandboxRuntimeError(
        'RUNTIME_CONFLICT',
        'Runtime cannot be started from its current state.',
      );
    await this.provider.startRuntime(this.providerIds.get(runtimeId)!);
    const updated = {
      ...this.touch(runtime),
      status: 'RUNNING' as const,
      startedAt: runtime.startedAt ?? this.now(),
      stoppedAt: null,
    };
    this.runtimes.set(runtimeId, updated);
    this.audit(principal, 'RUNTIME_START', runtimeId, runtime.projectId);
    return clone(updated);
  }
  async stopRuntime(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntime> {
    const runtime = this.runtime(principal, runtimeId, true);
    if (!['RUNNING', 'READY'].includes(runtime.status))
      throw new SandboxRuntimeError('RUNTIME_CONFLICT', 'Runtime is not running.');
    this.runtimes.set(runtimeId, { ...runtime, status: 'STOPPING' });
    const providerId = this.providerId(runtimeId);
    for (const process of [...this.processes.values()].filter(
      (item) => item.runtimeId === runtimeId && item.status === 'RUNNING',
    )) {
      await this.provider.killProcess(
        providerId,
        this.processProviderIds.get(process.id) ?? process.id,
      );
      this.processProviderIds.delete(process.id);
      this.processes.set(process.id, {
        ...process,
        status: 'EXITED',
        stoppedAt: this.now(),
      });
    }
    for (const session of [...this.terminals.values()].filter(
      (item) => item.runtimeId === runtimeId && item.status === 'OPEN',
    )) {
      await this.provider.closeTerminal(
        providerId,
        this.terminalProviderIds.get(session.id)!,
      );
      this.terminalProviderIds.delete(session.id);
      this.terminals.set(session.id, {
        ...session,
        status: 'CLOSED',
        stoppedAt: this.now(),
      });
    }
    for (const preview of [...this.previews.values()].filter(
      (item) => item.runtimeId === runtimeId && item.status === 'READY',
    )) {
      await this.previewGateway.revokePreview(preview.id);
      this.previews.set(preview.id, { ...preview, status: 'STOPPED' });
    }
    await this.provider.stopRuntime(providerId);
    const updated = {
      ...this.runtimes.get(runtimeId)!,
      status: 'STOPPED' as const,
      stoppedAt: this.now(),
      currentTaskId: null,
      previewId: null,
    };
    this.runtimes.set(runtimeId, updated);
    this.audit(principal, 'RUNTIME_STOP', runtimeId, runtime.projectId);
    return clone(updated);
  }
  async restartRuntime(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntime> {
    const runtime = this.runtime(principal, runtimeId, true);
    if (runtime.status === 'RUNNING') await this.stopRuntime(principal, runtimeId);
    return this.startRuntime(principal, runtimeId);
  }
  async destroyRuntime(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntime> {
    const runtime = this.runtime(principal, runtimeId, true);
    await this.cleanupRuntime(principal, runtime, 'USER_DESTROY');
    await this.provider.destroyRuntime(this.providerIds.get(runtimeId)!);
    const updated = {
      ...runtime,
      status: 'DESTROYED' as const,
      stoppedAt: this.now(),
      currentTaskId: null,
      previewId: null,
      recoveryState: 'HEALTHY' as const,
    };
    this.runtimes.set(runtimeId, updated);
    this.audit(principal, 'RUNTIME_DESTROY', runtimeId, runtime.projectId);
    return clone(updated);
  }
  async runCommand(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    input: { readonly command: string; readonly timeoutMs?: number },
  ): Promise<SandboxRuntimeTask> {
    safeCommand(input.command);
    const runtime = this.runtime(principal, runtimeId, true);
    if (runtime.status !== 'RUNNING')
      throw new SandboxRuntimeError(
        'RUNTIME_CONFLICT',
        'Start the runtime before running a command.',
      );
    const timeoutMs = Math.min(
      input.timeoutMs ?? runtime.limits.commandTimeoutMs,
      runtime.limits.commandTimeoutMs,
    );
    return this.runTask(
      principal,
      runtime,
      'COMMAND',
      digest(input.command).slice(0, 16),
      async (providerId) =>
        this.provider.exec(providerId, {
          command: input.command,
          cwd: '/workspace',
          timeoutMs,
        }),
      timeoutMs,
    );
  }
  async runTask(
    principal: AuthenticatedPrincipal,
    runtime: SandboxRuntime,
    type: SandboxRuntimeTaskType,
    metadata: string,
    operation: (providerRuntimeId: string) => Promise<SandboxProviderExecResult>,
    timeoutMs = runtime.limits.commandTimeoutMs,
  ): Promise<SandboxRuntimeTask> {
    const taskId = this.id();
    const startedAt = this.now();
    const task: SandboxRuntimeTask = {
      id: taskId,
      runtimeId: runtime.id,
      projectId: runtime.projectId,
      userId: runtime.userId,
      type,
      commandSafeMetadata: metadata,
      status: 'RUNNING',
      startedAt,
      completedAt: null,
      exitCode: null,
      durationMs: null,
      timeoutMs,
      logBytes: 0,
    };
    this.tasks.set(taskId, task);
    this.runtimes.set(runtime.id, { ...this.touch(runtime), currentTaskId: taskId });
    const providerId = this.providerIds.get(runtime.id);
    if (providerId === undefined)
      throw new SandboxRuntimeError(
        'PROVIDER_UNAVAILABLE',
        'Sandbox provider runtime is unavailable.',
      );
    try {
      const result = await operation(providerId);
      const artifactIds = this.recordArtifacts(runtime, taskId, result.artifacts ?? []);
      const source: SandboxRuntimeProblem['source'] =
        type === 'BUILD'
          ? 'BUILD'
          : type === 'TEST'
            ? 'TEST'
            : type === 'LINT'
              ? 'LINT'
              : type === 'TYPECHECK'
                ? 'TYPECHECK'
                : 'RUNTIME';
      const problemCount = this.recordProblems(
        runtime,
        taskId,
        result.problems ?? parseProblems(`${result.stdout}\n${result.stderr}`, source),
      );
      const completedAt = this.now();
      const existing = this.tasks.get(taskId);
      const status =
        existing?.status === 'CANCELLED'
          ? ('CANCELLED' as const)
          : result.timedOut === true || result.durationMs > timeoutMs
            ? ('TIMED_OUT' as const)
            : result.exitCode === 0
              ? ('SUCCESS' as const)
              : ('FAILED' as const);
      const final: SandboxRuntimeTask = {
        ...task,
        status,
        completedAt,
        exitCode: status === 'CANCELLED' ? null : result.exitCode,
        durationMs: result.durationMs,
        logBytes: Math.min(
          runtime.limits.maxLogBytes,
          Buffer.byteLength(result.stdout + result.stderr, 'utf8'),
        ),
        ...(artifactIds.length === 0 ? {} : { artifactIds }),
        ...(problemCount === 0 ? {} : { problemCount }),
      };
      this.tasks.set(taskId, final);
      this.appendLog(
        runtime.id,
        taskId,
        'STDOUT',
        result.stdout,
        runtime.limits.maxLogBytes,
      );
      this.appendLog(
        runtime.id,
        taskId,
        'STDERR',
        result.stderr,
        runtime.limits.maxLogBytes,
      );
      this.runtimes.set(runtime.id, {
        ...this.runtimes.get(runtime.id)!,
        currentTaskId: null,
      });
      this.audit(principal, 'RUNTIME_TASK', runtime.id, runtime.projectId, {
        taskType: type,
        status: final.status,
        problemCount,
      });
      if (this.options.usageGuard !== undefined) {
        try {
          await this.options.usageGuard.recordTask({
            userId: runtime.userId,
            projectId: runtime.projectId,
            runtimeId: runtime.id,
            type,
            durationMs: result.durationMs,
            status: final.status,
            usage: await this.provider.getResourceUsage(providerId),
          });
        } catch {
          this.appendLog(runtime.id, taskId, 'SYSTEM', 'Usage recording was unavailable; task result is retained.\n', runtime.limits.maxLogBytes);
        }
      }
      return clone(final);
    } catch {
      const existing = this.tasks.get(taskId);
      const failed: SandboxRuntimeTask =
        existing?.status === 'CANCELLED'
          ? existing
          : {
              ...task,
              status: 'FAILED',
              completedAt: this.now(),
              exitCode: null,
              durationMs: null,
            };
      this.tasks.set(taskId, failed);
      this.appendLog(
        runtime.id,
        taskId,
        'SYSTEM',
        'Sandbox task failed; provider details are redacted.\n',
        runtime.limits.maxLogBytes,
      );
      this.runtimes.set(runtime.id, {
        ...this.runtimes.get(runtime.id)!,
        currentTaskId: null,
      });
      return clone(failed);
    }
  }
  async cancelTask(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    taskId: string,
  ): Promise<SandboxRuntimeTask> {
    const runtime = this.runtime(principal, runtimeId, true);
    const task = this.tasks.get(taskId);
    if (task === undefined || task.runtimeId !== runtime.id)
      throw new SandboxRuntimeError('NOT_FOUND', 'Sandbox task was not found.');
    if (!['QUEUED', 'RUNNING'].includes(task.status)) return clone(task);
    await this.provider.cancelExecution(this.providerId(runtime.id), {
      taskId: task.id,
    });
    const cancelled: SandboxRuntimeTask = {
      ...task,
      status: 'CANCELLED',
      completedAt: this.now(),
      exitCode: null,
    };
    this.tasks.set(task.id, cancelled);
    this.runtimes.set(runtime.id, {
      ...this.runtimes.get(runtime.id)!,
      currentTaskId: null,
    });
    this.appendLog(
      runtime.id,
      task.id,
      'SYSTEM',
      'Sandbox task cancelled by owner.\n',
      runtime.limits.maxLogBytes,
    );
    this.audit(principal, 'RUNTIME_TASK_CANCEL', runtime.id, runtime.projectId, {
      taskType: task.type,
    });
    return clone(cancelled);
  }
  async installDependencies(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    timeoutMs?: number,
  ): Promise<SandboxRuntimeTask> {
    const runtime = this.runtime(principal, runtimeId, true);
    if (runtime.status !== 'RUNNING')
      throw new SandboxRuntimeError(
        'RUNTIME_CONFLICT',
        'Start the runtime before installing dependencies.',
      );
    const config = await this.runtimeConfig(runtime.projectId);
    const manager =
      config?.packageManager ?? this.managerForLockfile(config?.lockfile ?? null);
    if (manager === null)
      throw new SandboxRuntimeError(
        'TASK_UNAVAILABLE',
        'No trusted package manager or lockfile was found for this project.',
      );
    const effectiveTimeout = Math.min(
      timeoutMs ?? runtime.limits.commandTimeoutMs,
      runtime.limits.commandTimeoutMs,
    );
    return this.runTask(
      principal,
      runtime,
      'INSTALL',
      `${manager.toLowerCase()}-install`,
      (providerId) =>
        this.provider.installDependencies(providerId, {
          packageManager: manager,
          frozen: config?.lockfile !== null,
          timeoutMs: effectiveTimeout,
        }),
      effectiveTimeout,
    );
  }

  async runNamedTask(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    type: SandboxRuntimeTaskType,
    timeoutMs?: number,
  ): Promise<SandboxRuntimeTask> {
    if (type === 'INSTALL')
      return this.installDependencies(principal, runtimeId, timeoutMs);
    if (type === 'COMMAND')
      throw new SandboxRuntimeError(
        'VALIDATION',
        'Use the explicit command route for a terminal command.',
      );
    if (type === 'PREVIEW')
      throw new SandboxRuntimeError(
        'TASK_UNAVAILABLE',
        'Expose an approved port before creating a private preview.',
      );
    const runtime = this.runtime(principal, runtimeId, true);
    if (runtime.status !== 'RUNNING')
      throw new SandboxRuntimeError(
        'RUNTIME_CONFLICT',
        'Start the runtime before running a task.',
      );
    const config = await this.runtimeConfig(runtime.projectId);
    const script = config?.scripts[type === 'DEV_SERVER' ? 'DEV_SERVER' : type];
    if (script === null || script === undefined)
      throw new SandboxRuntimeError(
        'TASK_UNAVAILABLE',
        `No trusted ${type.toLowerCase()} script is configured for this project.`,
      );
    const manager =
      config?.packageManager ?? this.managerForLockfile(config?.lockfile ?? null);
    if (manager === null)
      throw new SandboxRuntimeError(
        'TASK_UNAVAILABLE',
        'No trusted package manager is configured for this project.',
      );
    const effectiveTimeout = Math.min(
      timeoutMs ?? runtime.limits.commandTimeoutMs,
      runtime.limits.commandTimeoutMs,
    );
    const command = `${manager.toLowerCase()} run ${script}`;
    const task = await this.runTask(
      principal,
      runtime,
      type,
      `script:${type.toLowerCase()}`,
      (providerId) =>
        this.provider.exec(providerId, {
          command,
          cwd: '/workspace',
          timeoutMs: effectiveTimeout,
        }),
      effectiveTimeout,
    );
    if (type !== 'DEV_SERVER' || task.status !== 'SUCCESS') return task;
    const providerId = this.providerIds.get(runtime.id);
    if (providerId === undefined)
      throw new SandboxRuntimeError(
        'PROVIDER_UNAVAILABLE',
        'Sandbox provider runtime is unavailable.',
      );
    const spawned = await this.provider.spawnProcess(providerId, {
      label: 'development-server',
      command,
      cwd: '/workspace',
    });
    const process: SandboxRuntimeProcess = {
      id: this.id(),
      runtimeId: runtime.id,
      taskId: task.id,
      label: 'development-server',
      status: 'RUNNING',
      exitCode: null,
      startedAt: this.now(),
      stoppedAt: null,
    };
    this.processes.set(process.id, process);
    this.processProviderIds.set(process.id, spawned.providerProcessId);
    const withProcess: SandboxRuntimeTask = { ...task, processId: process.id };
    this.tasks.set(task.id, withProcess);
    return clone(withProcess);
  }
  async runAIBuildLoop(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    hooks: SandboxAIBuildLoopHooks,
  ): Promise<{ readonly initial: SandboxRuntimeTask; readonly final: SandboxRuntimeTask; readonly fixApplied: boolean }> {
    const initial = await this.runNamedTask(principal, runtimeId, 'BUILD');
    if (initial.status === 'SUCCESS') return { initial, final: initial, fixApplied: false };
    const problems = (await this.listProblems(principal, runtimeId)).items.filter((problem) => problem.taskId === initial.id);
    const proposal = await hooks.proposeFix({ runtimeId, taskId: initial.id, problems });
    if (!proposal.approved) throw new SandboxRuntimeError('CHANGE_REVIEW_REQUIRED', 'AI fix requires explicit review before applying.');
    await hooks.applyReviewedChange({ runtimeId, taskId: initial.id });
    const final = await this.runNamedTask(principal, runtimeId, 'BUILD');
    this.audit(principal, 'AI_BUILD_LOOP', runtimeId, this.runtime(principal, runtimeId).projectId, { initialStatus: initial.status, finalStatus: final.status, fixApplied: true });
    return { initial, final, fixApplied: true };
  }
  async listTasks(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntimeTaskPage> {
    this.runtime(principal, runtimeId);
    return {
      items: clone(
        [...this.tasks.values()].filter((item) => item.runtimeId === runtimeId),
      ),
      nextCursor: null,
    };
  }
  async listLogs(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    cursor: string | null = null,
  ): Promise<SandboxRuntimeLogPage> {
    const runtime = this.runtime(principal, runtimeId);
    const logs = this.logs.get(runtime.id) ?? [];
    const start =
      cursor === null
        ? 0
        : Math.max(0, logs.findIndex((item) => item.id === cursor) + 1);
    const items = logs.slice(start, start + 100);
    return { items: clone(items), nextCursor: items.at(-1)?.id ?? null };
  }
  async detectWorkspaceChanges(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<readonly SandboxWorkspaceChange[]> {
    const runtime = this.runtime(principal, runtimeId, true);
    const providerId = this.providerId(runtime.id);
    const detected = await this.provider.getWorkspaceChanges(providerId, {
      projectId: runtime.projectId,
      workspaceId: runtime.workspaceId,
    });
    const result = detected.map((change) => {
      const item: SandboxWorkspaceChange = {
        ...change,
        id: this.id(),
        runtimeId: runtime.id,
        projectId: runtime.projectId,
        status: 'DETECTED',
      };
      this.changes.set(item.id, item);
      return item;
    });
    this.audit(principal, 'WORKSPACE_CHANGE_DETECT', runtime.id, runtime.projectId, {
      count: result.length,
    });
    return clone(result);
  }
  async listWorkspaceChanges(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<readonly SandboxWorkspaceChange[]> {
    this.runtime(principal, runtimeId);
    return clone(
      [...this.changes.values()].filter((item) => item.runtimeId === runtimeId),
    );
  }
  async reviewWorkspaceChange(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    changeId: string,
    action: 'REVIEW' | 'REJECT' | 'APPLY',
  ): Promise<SandboxWorkspaceChange> {
    const runtime = this.runtime(principal, runtimeId, true);
    const change = this.changes.get(changeId);
    if (change === undefined || change.runtimeId !== runtime.id)
      throw new SandboxRuntimeError('NOT_FOUND', 'Workspace change was not found.');
    const status: SandboxWorkspaceChange['status'] =
      action === 'REJECT' ? 'REJECTED' : action === 'APPLY' ? 'APPLIED' : 'REVIEWED';
    const updated = { ...change, status };
    this.changes.set(changeId, updated);
    this.audit(principal, `WORKSPACE_CHANGE_${action}`, runtime.id, runtime.projectId, {
      changeId,
    });
    return clone(updated);
  }
  async openTerminal(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    input: { readonly columns: number; readonly rows: number },
  ): Promise<SandboxTerminalSession> {
    const runtime = this.runtime(principal, runtimeId, true);
    if (runtime.status !== 'RUNNING')
      throw new SandboxRuntimeError(
        'TERMINAL_UNAVAILABLE',
        'Start the runtime before opening its sandbox terminal.',
      );
    const opened = await this.provider.openTerminal(this.providerId(runtime.id), {
      columns: input.columns,
      rows: input.rows,
      cwd: '/workspace',
    });
    const session: SandboxTerminalSession = {
      id: this.id(),
      runtimeId: runtime.id,
      projectId: runtime.projectId,
      userId: runtime.userId,
      status: 'OPEN',
      workingDirectory: '/workspace',
      columns: input.columns,
      rows: input.rows,
      startedAt: this.now(),
      stoppedAt: null,
      exitCode: null,
      inputRetention: 'NONE',
    };
    this.terminals.set(session.id, session);
    this.terminalProviderIds.set(session.id, opened.providerTerminalId);
    this.audit(principal, 'TERMINAL_OPEN', runtime.id, runtime.projectId, {
      columns: input.columns,
      rows: input.rows,
    });
    return clone(session);
  }
  async writeTerminal(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    sessionId: string,
    input: string,
  ): Promise<SandboxRuntimeLog> {
    safeCommand(input);
    const runtime = this.runtime(principal, runtimeId, true);
    const session = this.terminal(runtime, sessionId);
    const result = await this.provider.writeTerminal(this.providerId(runtime.id), {
      providerTerminalId: this.terminalProviderIds.get(session.id)!,
      input,
    });
    this.appendLog(runtime.id, null, 'STDOUT', result.stdout, runtime.limits.maxLogBytes);
    const log = this.appendLog(runtime.id, null, 'STDERR', result.stderr, runtime.limits.maxLogBytes);
    if (result.exitCode !== undefined && result.exitCode !== null) {
      this.terminals.set(session.id, { ...session, status: 'CLOSED', stoppedAt: this.now(), exitCode: result.exitCode });
    }
    this.audit(principal, 'TERMINAL_INPUT', runtime.id, runtime.projectId, {
      sessionId: session.id,
      bytes: Buffer.byteLength(input, 'utf8'),
    });
    return clone(log);
  }
  async resizeTerminal(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    sessionId: string,
    input: { readonly columns: number; readonly rows: number },
  ): Promise<SandboxTerminalSession> {
    const runtime = this.runtime(principal, runtimeId, true);
    const session = this.terminal(runtime, sessionId);
    await this.provider.resizeTerminal(this.providerId(runtime.id), {
      providerTerminalId: this.terminalProviderIds.get(session.id)!,
      ...input,
    });
    const updated = { ...session, columns: input.columns, rows: input.rows };
    this.terminals.set(updated.id, updated);
    return clone(updated);
  }
  async closeTerminal(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    sessionId: string,
  ): Promise<SandboxTerminalSession> {
    const runtime = this.runtime(principal, runtimeId, true);
    const session = this.terminal(runtime, sessionId);
    await this.provider.closeTerminal(
      this.providerId(runtime.id),
      this.terminalProviderIds.get(session.id)!,
    );
    const updated = { ...session, status: 'CLOSED' as const, stoppedAt: this.now() };
    this.terminals.set(updated.id, updated);
    this.terminalProviderIds.delete(updated.id);
    return clone(updated);
  }
  async listTerminalSessions(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxTerminalSessionPage> {
    this.runtime(principal, runtimeId);
    return {
      items: clone(
        [...this.terminals.values()].filter((item) => item.runtimeId === runtimeId),
      ),
      nextCursor: null,
    };
  }
  async injectSecretReference(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    input: { readonly key: string; readonly secretReference: string },
  ): Promise<SandboxRuntimeEnvironmentVariable> {
    const runtime = this.runtime(principal, runtimeId, true);
    const expiresAt = runtime.expiresAt;
    await this.provider.injectSecretReferences(this.providerId(runtime.id), {
      references: [input.secretReference],
      expiresAt,
    });
    const variable: SandboxRuntimeEnvironmentVariable = {
      id: this.id(),
      runtimeId: runtime.id,
      key: input.key,
      kind: 'SECRET_REFERENCE',
      secretReference: input.secretReference,
      status: 'INJECTED',
      expiresAt,
    };
    this.environment.set(variable.id, variable);
    this.audit(principal, 'SECRET_REFERENCE_INJECT', runtime.id, runtime.projectId, {
      key: input.key,
    });
    return this.publicEnvironment(variable);
  }
  async listEnvironment(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<readonly SandboxRuntimeEnvironmentVariable[]> {
    this.runtime(principal, runtimeId);
    return [...this.environment.values()]
      .filter((item) => item.runtimeId === runtimeId)
      .map((item) => this.publicEnvironment(item));
  }
  async getRuntimeTokenMetadata(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntimeTokenMetadata> {
    this.runtime(principal, runtimeId);
    const token = this.tokens.get(runtimeId);
    if (token === undefined)
      throw new SandboxRuntimeError(
        'NOT_FOUND',
        'Runtime token metadata was not found.',
      );
    return clone(token);
  }
  async listProblems(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntimeProblemPage> {
    this.runtime(principal, runtimeId);
    return {
      items: clone(
        [...this.problems.values()].filter((item) => item.runtimeId === runtimeId),
      ),
      nextCursor: null,
    };
  }
  async listArtifacts(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<readonly SandboxRuntimeArtifact[]> {
    this.runtime(principal, runtimeId);
    return clone(
      [...this.artifacts.values()].filter((item) => item.runtimeId === runtimeId),
    );
  }
  async exposePort(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    input: {
      readonly internalPort: number;
      readonly protocol: 'HTTP' | 'HTTPS' | 'WS';
    },
  ): Promise<SandboxRuntimePort> {
    const runtime = this.runtime(principal, runtimeId, true);
    if (!runtime.policy.allowedPorts.includes(input.internalPort))
      throw new SandboxRuntimeError(
        'FORBIDDEN',
        'Port is not allowed by the runtime policy.',
      );
    const providerPort = await this.provider.exposePort(
      this.providerIds.get(runtimeId)!,
      input,
    );
    const port: SandboxRuntimePort = {
      id: this.id(),
      runtimeId,
      internalPort: input.internalPort,
      protocol: input.protocol,
      status: 'EXPOSED',
    };
    this.ports.set(port.id, port);
    void providerPort;
    return clone(port);
  }
  async createPreview(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    portId: string,
  ): Promise<SandboxPreview> {
    const runtime = this.runtime(principal, runtimeId, true);
    const port = this.ports.get(portId);
    if (port === undefined || port.runtimeId !== runtimeId || port.status !== 'EXPOSED')
      throw new SandboxRuntimeError(
        'PREVIEW_UNAVAILABLE',
        'Preview port is unavailable.',
      );
    const id = this.id();
    const nonce = randomUUID().replaceAll('-', '');
    const gateway = await this.previewGateway.createPrivatePreview({
      previewId: id,
      runtimeId,
      projectId: runtime.projectId,
      userId: runtime.userId,
      portId,
      nonce,
      expiresAt: new Date(
        Date.parse(this.now()) + Math.min(runtime.limits.idleTimeoutMs, 30 * 60_000),
      ).toISOString(),
    });
    const origin =
      this.options.previewOriginFactory?.({
        runtimeId,
        userId: runtime.userId,
        projectId: runtime.projectId,
        nonce,
      }) ?? gateway.origin;
    if (!origin.startsWith('https://'))
      throw new SandboxRuntimeError(
        'PREVIEW_UNAVAILABLE',
        'Preview origin must use isolated HTTPS.',
      );
    const preview: SandboxPreview = {
      id,
      runtimeId,
      projectId: runtime.projectId,
      userId: runtime.userId,
      portId,
      access: 'PRIVATE',
      origin,
      expiresAt: new Date(
        Date.parse(this.now()) + Math.min(runtime.limits.idleTimeoutMs, 30 * 60_000),
      ).toISOString(),
      csp: gateway.csp,
      status: 'READY',
    };
    this.previews.set(preview.id, preview);
    this.runtimes.set(runtimeId, { ...runtime, previewId: preview.id });
    this.audit(principal, 'PREVIEW_CREATE', runtimeId, runtime.projectId);
    return clone(preview);
  }
  async getPreview(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    previewId: string,
  ): Promise<SandboxPreview> {
    const runtime = this.runtime(principal, runtimeId);
    const preview = this.previews.get(previewId);
    if (preview === undefined || preview.runtimeId !== runtime.id)
      throw new SandboxRuntimeError('NOT_FOUND', 'Sandbox preview was not found.');
    if (
      Date.parse(preview.expiresAt) <= Date.parse(this.now()) &&
      preview.status === 'READY'
    ) {
      const expired = { ...preview, status: 'EXPIRED' as const };
      this.previews.set(preview.id, expired);
      return clone(expired);
    }
    return clone(preview);
  }
  async syncWorkspace(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
    changeIds: readonly string[],
    expectedWorkspaceVersion: number,
  ): Promise<readonly SandboxWorkspaceChange[]> {
    const runtime = this.runtime(principal, runtimeId, true);
    const current = await this.options.projectReader.getWorkspaceVersion(
      runtime.projectId,
    );
    if (current === null || current !== expectedWorkspaceVersion)
      throw new SandboxRuntimeError(
        'RUNTIME_CONFLICT',
        'Workspace changed; review runtime changes before syncing.',
      );
    const selected = changeIds.map((id) => this.changes.get(id));
    if (
      selected.some(
        (item) =>
          item === undefined ||
          item.runtimeId !== runtime.id ||
          item.status !== 'REVIEWED',
      )
    )
      throw new SandboxRuntimeError(
        'CHANGE_REVIEW_REQUIRED',
        'Only explicitly reviewed runtime changes can be synced.',
      );
    const synced = await this.provider.syncWorkspace(this.providerId(runtime.id), {
      projectId: runtime.projectId,
      workspaceId: runtime.workspaceId,
      changeIds,
    });
    for (const changeId of changeIds) {
      const change = this.changes.get(changeId)!;
      this.changes.set(changeId, { ...change, status: 'APPLIED' });
    }
    this.audit(principal, 'WORKSPACE_SYNC', runtime.id, runtime.projectId, {
      count: changeIds.length,
    });
    return clone(synced);
  }
  async usage(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntimeUsage> {
    this.runtime(principal, runtimeId);
    return clone(
      await this.provider.getResourceUsage(this.providerIds.get(runtimeId)!),
    );
  }
  async recoverRuntime(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntime> {
    const runtime = this.runtime(principal, runtimeId, true);
    const providerStatus = await this.provider.recoverRuntime(
      this.providerId(runtime.id),
    );
    const status = providerStatus === 'LOST' ? ('FAILED' as const) : providerStatus;
    const updated = {
      ...runtime,
      status,
      recoveryState:
        providerStatus === 'LOST' ? ('LOST' as const) : ('HEALTHY' as const),
      ...(providerStatus === 'LOST' ? { stoppedAt: this.now() } : {}),
    };
    this.runtimes.set(runtime.id, updated);
    if (providerStatus === 'LOST')
      await this.cleanupRuntime(principal, updated, 'CRASH_RECOVERY');
    this.audit(principal, 'RUNTIME_RECOVER', runtime.id, runtime.projectId, {
      providerStatus,
    });
    return clone(this.runtimes.get(runtime.id)!);
  }
  async cleanupExpiredRuntimes(
    principal: AuthenticatedPrincipal,
  ): Promise<readonly SandboxRuntimeCleanupResult[]> {
    if (!isRoot(principal))
      throw new SandboxRuntimeError(
        'FORBIDDEN',
        'Root capability is required for orphan cleanup.',
      );
    const now = Date.parse(this.now());
    const cleaned: SandboxRuntimeCleanupResult[] = [];
    for (const runtime of this.runtimes.values()) {
      const lifetimeExpired = Date.parse(runtime.expiresAt) <= now;
      const idleExpired =
        runtime.idleExpiresAt !== undefined && Date.parse(runtime.idleExpiresAt) <= now;
      if (
        ['DESTROYED', 'EXPIRED'].includes(runtime.status) ||
        (!lifetimeExpired && !idleExpired)
      )
        continue;
      cleaned.push(
        await this.cleanupRuntime(
          principal,
          runtime,
          lifetimeExpired ? 'MAX_LIFETIME' : 'IDLE_TIMEOUT',
        ),
      );
      this.runtimes.set(runtime.id, {
        ...runtime,
        status: 'EXPIRED',
        stoppedAt: this.now(),
        currentTaskId: null,
        previewId: null,
        recoveryState: 'STALE',
      });
    }
    return clone(cleaned);
  }
  async inspectAsRoot(
    principal: AuthenticatedPrincipal,
    runtimeId: string,
  ): Promise<SandboxRuntime> {
    if (!isRoot(principal))
      throw new SandboxRuntimeError('FORBIDDEN', 'Root capability is required.');
    const runtime = this.runtime(principal, runtimeId);
    this.audit(principal, 'ROOT_RUNTIME_READ', runtimeId, runtime.projectId, {
      targetOwnerId: runtime.userId,
    });
    return clone(runtime);
  }
  private providerId(runtimeId: string): string {
    const providerId = this.providerIds.get(runtimeId);
    if (providerId === undefined)
      throw new SandboxRuntimeError(
        'PROVIDER_UNAVAILABLE',
        'Sandbox provider runtime is unavailable.',
      );
    return providerId;
  }
  private terminal(runtime: SandboxRuntime, sessionId: string): SandboxTerminalSession {
    const session = this.terminals.get(sessionId);
    if (
      session === undefined ||
      session.runtimeId !== runtime.id ||
      session.status !== 'OPEN'
    )
      throw new SandboxRuntimeError(
        'TERMINAL_UNAVAILABLE',
        'Sandbox terminal session is unavailable.',
      );
    return session;
  }
  private async runtimeConfig(projectId: string): Promise<SandboxRuntimeConfig | null> {
    const configured = await this.options.projectReader.getRuntimeConfig?.(projectId);
    if (configured !== undefined && configured !== null) return configured;
    if (this.provider.code !== 'MOCK') return null;
    return {
      packageManager: 'PNPM',
      lockfile: 'PNPM_LOCK',
      scripts: {
        BUILD: 'build',
        TEST: 'test',
        LINT: 'lint',
        TYPECHECK: 'typecheck',
        DEV_SERVER: 'dev',
      },
      artifactPaths: [],
    };
  }
  private managerForLockfile(
    lockfile: SandboxRuntimeConfig['lockfile'],
  ): 'NPM' | 'PNPM' | 'YARN' | null {
    return lockfile === 'PACKAGE_LOCK'
      ? 'NPM'
      : lockfile === 'PNPM_LOCK'
        ? 'PNPM'
        : lockfile === 'YARN_LOCK'
          ? 'YARN'
          : null;
  }
  private recordArtifacts(
    runtime: SandboxRuntime,
    taskId: string,
    artifacts: readonly NonNullable<SandboxProviderExecResult['artifacts']>[number][],
  ): string[] {
    return artifacts.map((artifact) => {
      const item: SandboxRuntimeArtifact = {
        id: this.id(),
        runtimeId: runtime.id,
        taskId,
        projectId: runtime.projectId,
        ownerId: runtime.userId,
        name: artifact.name,
        relativePath: artifact.relativePath,
        sizeBytes: artifact.sizeBytes,
        checksum: artifact.checksum,
        contentType: artifact.contentType,
        status: 'READY',
        createdAt: this.now(),
        expiresAt: runtime.expiresAt,
      };
      this.artifacts.set(item.id, item);
      return item.id;
    });
  }
  private recordProblems(
    runtime: SandboxRuntime,
    taskId: string,
    problems: readonly NonNullable<SandboxProviderExecResult['problems']>[number][],
  ): number {
    for (const problem of problems) {
      const item: SandboxRuntimeProblem = {
        id: this.id(),
        runtimeId: runtime.id,
        taskId,
        severity: problem.severity,
        message: redactText(problem.message).slice(0, 1024),
        path: problem.path ?? null,
        line: problem.line ?? null,
        column: problem.column ?? null,
        code: problem.code ?? null,
        source: problem.source,
        occurredAt: this.now(),
      };
      this.problems.set(item.id, item);
    }
    return problems.length;
  }
  private publicEnvironment(
    variable: SandboxRuntimeEnvironmentVariable,
  ): SandboxRuntimeEnvironmentVariable {
    return { ...variable, secretReference: null };
  }
  private async cleanupRuntime(
    principal: AuthenticatedPrincipal,
    runtime: SandboxRuntime,
    reason: SandboxRuntimeCleanupResult['reason'],
  ): Promise<SandboxRuntimeCleanupResult> {
    const providerId = this.providerId(runtime.id);
    const activeProcesses = [...this.processes.values()].filter(
      (item) => item.runtimeId === runtime.id && item.status === 'RUNNING',
    );
    for (const process of activeProcesses) {
      await this.provider.killProcess(
        providerId,
        this.processProviderIds.get(process.id) ?? process.id,
      );
      this.processes.set(process.id, {
        ...process,
        status: 'EXITED',
        stoppedAt: this.now(),
      });
      this.processProviderIds.delete(process.id);
    }
    for (const session of [...this.terminals.values()].filter(
      (item) => item.runtimeId === runtime.id && item.status === 'OPEN',
    )) {
      await this.provider.closeTerminal(
        providerId,
        this.terminalProviderIds.get(session.id)!,
      );
      this.terminals.set(session.id, {
        ...session,
        status: 'CLOSED',
        stoppedAt: this.now(),
      });
      this.terminalProviderIds.delete(session.id);
    }
    await this.provider.revokeInjectedSecrets(providerId);
    await this.provider.revokeScopedRuntimeToken(providerId);
    await this.provider.cleanupRuntime(providerId);
    const releasedPorts = [...this.ports.values()].filter(
      (item) => item.runtimeId === runtime.id && item.status !== 'RELEASED',
    );
    for (const port of releasedPorts)
      this.ports.set(port.id, { ...port, status: 'RELEASED' });
    const previews = [...this.previews.values()].filter(
      (item) => item.runtimeId === runtime.id && item.status === 'READY',
    );
    for (const preview of previews) {
      await this.previewGateway.revokePreview(preview.id);
      this.previews.set(preview.id, { ...preview, status: 'STOPPED' });
    }
    const secretVariables = [...this.environment.values()].filter(
      (item) => item.runtimeId === runtime.id && item.status === 'INJECTED',
    );
    for (const variable of secretVariables)
      this.environment.set(variable.id, { ...variable, status: 'REVOKED' });
    const token = this.tokens.get(runtime.id);
    if (token !== undefined)
      this.tokens.set(runtime.id, { ...token, status: 'REVOKED' });
    const result: SandboxRuntimeCleanupResult = {
      runtimeId: runtime.id,
      reason,
      stoppedProcesses: activeProcesses.length,
      releasedPorts: releasedPorts.length,
      revokedSecrets: secretVariables.length,
      revokedTokens: token === undefined ? 0 : 1,
      stoppedPreviews: previews.length,
      completedAt: this.now(),
    };
    this.cleanup.set(runtime.id, result);
    this.audit(principal, 'RUNTIME_CLEANUP', runtime.id, runtime.projectId, {
      reason,
      stoppedProcesses: activeProcesses.length,
    });
    return result;
  }
  private appendLog(
    runtimeId: string,
    taskId: string | null,
    stream: 'STDOUT' | 'STDERR' | 'SYSTEM',
    text: string,
    maxBytes: number,
  ): SandboxRuntimeLog {
    const logs = this.logs.get(runtimeId) ?? [];
    const safeText = redactText(text);
    const bytes = Buffer.byteLength(safeText, 'utf8');
    const log: SandboxRuntimeLog = {
      id: this.id(),
      runtimeId,
      taskId,
      stream,
      text: safeText.slice(0, maxBytes),
      occurredAt: this.now(),
      truncated: bytes > maxBytes,
    };
    logs.push(log);
    this.logs.set(runtimeId, logs.slice(-500));
    return log;
  }
  private audit(
    principal: AuthenticatedPrincipal,
    action: string,
    runtimeId: string,
    projectId: string,
    metadata?: Readonly<Record<string, string | number | boolean | null>>,
  ): void {
    const event = { action, actorUserId: principal.userId, runtimeId, projectId };
    this.options.audit?.append(metadata === undefined ? event : { ...event, metadata });
  }
}
