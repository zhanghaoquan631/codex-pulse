import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  AuthenticatedPrincipal,
  CustomDomain,
  Deployment,
  DeploymentArtifact,
  DeploymentEnvironment,
  DeploymentEnvironmentConfig,
  DeploymentHealthCheck,
  DeploymentLog,
  DeploymentLogPage,
  DeploymentPage,
  DeploymentProviderCode,
  DeploymentSecretMetadata,
  DeploymentSourceType,
  DeploymentUsage,
  DnsRecordGuidance,
  PreviewShare,
  PreviewVisibility,
  ProjectPublication,
  ProjectPublishSettings,
  TlsStatus,
} from '@me-zip/shared-types';

export class DeploymentError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'ENTITLEMENT_REQUIRED'
      | 'VALIDATION'
      | 'CONFIRMATION_REQUIRED'
      | 'CONFLICT'
      | 'PROVIDER_UNAVAILABLE'
      | 'PROVIDER_FAILED'
      | 'RATE_LIMITED',
    message: string,
  ) {
    super(message);
    this.name = 'DeploymentError';
  }
}

export interface DeploymentEntitlementResolver {
  has(principal: AuthenticatedPrincipal, capability: string): boolean | Promise<boolean>;
}

export interface DeploymentProjectResolver {
  ownerId(projectId: string): string | null | Promise<string | null>;
  /** Optional safe project projection used by the public page. */
  describe?(projectId: string): Promise<{ readonly name: string; readonly description: string }>;
}

export interface DeploymentSourceResolver {
  resolve(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly projectId: string;
    readonly sourceType: DeploymentSourceType;
    readonly sourceRevision: string;
    readonly releaseId: string | null;
  }): Promise<{ readonly sourceRevision: string; readonly releaseId: string | null }>;
}

export interface DeploymentAudit {
  append(event: {
    readonly action: string;
    readonly actorUserId: string;
    readonly projectId: string | null;
    readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  }): void;
}

export interface DeploymentUsageGuard {
  reserve(input: { readonly userId: string; readonly projectId: string; readonly environment: DeploymentEnvironment }): Promise<void> | void;
  record(input: { readonly userId: string; readonly projectId: string; readonly metric: string; readonly quantity: number }): Promise<void> | void;
  release?(input: { readonly userId: string; readonly projectId: string }): Promise<void> | void;
}

export interface DeploymentProviderBuildInput {
  readonly deploymentId: string;
  readonly projectId: string;
  readonly sourceRevision: string;
  readonly environment: DeploymentEnvironment;
  readonly buildCommand: string;
  readonly packageManager: 'npm' | 'pnpm' | 'yarn';
  readonly lockfileHash: string;
}

export interface DeploymentProviderBuildResult {
  readonly buildId: string;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly manifest: Readonly<Record<string, string | number | boolean>>;
  readonly logs: readonly string[];
}

export interface DeploymentProviderDeployResult {
  readonly providerDeploymentId: string;
  readonly url: string;
  readonly logs: readonly string[];
}

export interface DeploymentProviderStatusResult {
  readonly status: 'LIVE' | 'FAILED' | 'CANCELLED';
  readonly url: string | null;
  readonly errorClass?: string;
  readonly errorMessage?: string;
}

export interface DeploymentProvider {
  readonly code: DeploymentProviderCode;
  prepare(input: DeploymentProviderBuildInput): Promise<DeploymentProviderBuildResult>;
  deploy(input: { readonly deploymentId: string; readonly artifact: DeploymentArtifact; readonly environment: DeploymentEnvironment }): Promise<DeploymentProviderDeployResult>;
  getStatus(providerDeploymentId: string): Promise<DeploymentProviderStatusResult>;
  cancel(providerDeploymentId: string): Promise<void>;
  delete(providerDeploymentId: string): Promise<void>;
  rollback(input: { readonly providerDeploymentId: string; readonly targetArtifact: DeploymentArtifact }): Promise<DeploymentProviderDeployResult>;
  getLogs(providerDeploymentId: string): Promise<readonly string[]>;
  configureDomain(input: { readonly hostname: string; readonly deploymentUrl: string }): Promise<{ readonly tlsStatus: TlsStatus }>;
  checkHealth(input: { readonly url: string; readonly environment: DeploymentEnvironment }): Promise<{ readonly status: 'PASS' | 'FAIL'; readonly errorMessage?: string }>;
}

export interface MockStaticProviderOptions {
  readonly baseUrl?: string;
  readonly failBuild?: boolean;
  readonly failDeploy?: boolean;
  readonly failHealth?: boolean;
}

/** A deterministic, execution-free local provider. It never starts a process or
 * contacts a cloud service; its URLs are synthetic and must not be called production. */
export class MockStaticDeploymentProvider implements DeploymentProvider {
  public readonly code = 'MOCK_STATIC' as const;
  private readonly deployments = new Map<string, DeploymentProviderStatusResult>();
  private readonly options: Required<MockStaticProviderOptions>;

  public constructor(options: MockStaticProviderOptions = {}) {
    this.options = {
      baseUrl: options.baseUrl ?? 'https://mock-deploy.invalid',
      failBuild: options.failBuild ?? false,
      failDeploy: options.failDeploy ?? false,
      failHealth: options.failHealth ?? false,
    };
  }

  public async prepare(input: DeploymentProviderBuildInput): Promise<DeploymentProviderBuildResult> {
    if (this.options.failBuild) throw new DeploymentError('PROVIDER_FAILED', 'Mock build failed.');
    const contentHash = sha256(`${input.projectId}:${input.sourceRevision}:${input.lockfileHash}:${input.buildCommand}`);
    return {
      buildId: `mock-build-${input.deploymentId}`,
      contentHash,
      sizeBytes: 1_024,
      manifest: { entry: 'index.html', immutable: true, provider: this.code, environment: input.environment },
      logs: [`build ${input.sourceRevision}`, `run ${input.buildCommand}`, 'artifact sealed'],
    };
  }

  public async deploy(input: { readonly deploymentId: string; readonly artifact: DeploymentArtifact; readonly environment: DeploymentEnvironment }): Promise<DeploymentProviderDeployResult> {
    if (this.options.failDeploy) throw new DeploymentError('PROVIDER_FAILED', 'Mock deployment failed.');
    const providerDeploymentId = `mock-deployment-${input.deploymentId}`;
    const url = `${this.options.baseUrl}/${input.deploymentId}`;
    this.deployments.set(providerDeploymentId, { status: 'LIVE', url });
    return { providerDeploymentId, url, logs: [`publish ${input.artifact.contentHash}`, 'static assets ready'] };
  }

  public async getStatus(providerDeploymentId: string): Promise<DeploymentProviderStatusResult> {
    return this.deployments.get(providerDeploymentId) ?? { status: 'FAILED', url: null, errorClass: 'NOT_FOUND', errorMessage: 'Provider deployment was not found.' };
  }

  public async cancel(providerDeploymentId: string): Promise<void> { this.deployments.set(providerDeploymentId, { status: 'CANCELLED', url: null }); }
  public async delete(providerDeploymentId: string): Promise<void> { this.deployments.delete(providerDeploymentId); }
  public async rollback(input: { readonly providerDeploymentId: string; readonly targetArtifact: DeploymentArtifact }): Promise<DeploymentProviderDeployResult> {
    const existing = this.deployments.get(input.providerDeploymentId);
    if (existing === undefined) throw new DeploymentError('PROVIDER_FAILED', 'Mock rollback target was not found.');
    const url = existing.url ?? `${this.options.baseUrl}/rollback/${input.targetArtifact.id}`;
    this.deployments.set(input.providerDeploymentId, { status: 'LIVE', url });
    return { providerDeploymentId: input.providerDeploymentId, url, logs: [`rollback ${input.targetArtifact.contentHash}`] };
  }
  public async getLogs(providerDeploymentId: string): Promise<readonly string[]> { return [`provider deployment ${providerDeploymentId}`]; }
  public async configureDomain(): Promise<{ readonly tlsStatus: TlsStatus }> { return { tlsStatus: 'ACTIVE' }; }
  public async checkHealth(input: { readonly url: string; readonly environment: DeploymentEnvironment }): Promise<{ readonly status: 'PASS' | 'FAIL'; readonly errorMessage?: string }> {
    return this.options.failHealth ? { status: 'FAIL', errorMessage: `Mock health failed for ${input.url}.` } : { status: 'PASS' };
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type StoredDeployment = Mutable<Deployment> & { providerDeploymentId: string | null };
type StoredArtifact = Mutable<DeploymentArtifact>;
type StoredPreviewShare = Mutable<PreviewShare> & { tokenHash: string };
type StoredDomain = Mutable<CustomDomain> & { verificationTokenHash: string };

export interface DeploymentServiceOptions {
  readonly entitlementResolver: DeploymentEntitlementResolver;
  readonly projectResolver?: DeploymentProjectResolver;
  readonly sourceResolver?: DeploymentSourceResolver;
  readonly provider?: DeploymentProvider;
  readonly dnsVerifier?: (input: { readonly hostname: string; readonly record: DnsRecordGuidance }) => Promise<boolean>;
  readonly usageGuard?: DeploymentUsageGuard;
  readonly audit?: DeploymentAudit;
  readonly id?: () => string;
  readonly token?: () => string;
  readonly now?: () => string;
}

export interface CreateDeploymentInput {
  readonly projectId: string;
  readonly environment: DeploymentEnvironment;
  readonly provider?: DeploymentProviderCode;
  readonly sourceType: DeploymentSourceType;
  readonly sourceRevision: string;
  readonly releaseId?: string | null;
  readonly buildCommand?: string;
  readonly packageManager?: 'npm' | 'pnpm' | 'yarn';
  readonly lockfileHash?: string;
  readonly confirmProduction?: boolean;
  readonly actor?: 'USER' | 'AI_ASSISTED';
}

export interface CreatePreviewShareInput {
  readonly deploymentId: string;
  readonly visibility?: PreviewVisibility | undefined;
  readonly expiresInDays?: 1 | 7 | 30 | undefined;
  readonly passwordProtected?: boolean | undefined;
}

export interface AddDomainInput {
  readonly projectId: string;
  readonly deploymentId: string;
  readonly hostname: string;
  readonly verificationMethod?: 'DNS_TXT' | 'DNS_CNAME' | undefined;
}

export interface PublishProjectInput {
  readonly releaseId?: string | null | undefined;
  readonly projectVisibility?: 'PRIVATE' | 'UNLISTED' | 'PUBLISHED' | undefined;
  readonly sourceVisibility?: 'PRIVATE' | 'SELECTED_RELEASE' | 'PUBLIC' | undefined;
  readonly downloadVisibility?: 'PRIVATE' | 'SELECTED_RELEASE' | 'PUBLIC' | undefined;
  readonly description?: string | undefined;
  readonly screenshots?: readonly string[] | undefined;
  readonly demoUrl?: string | null | undefined;
  readonly readme?: string | null | undefined;
}

function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function clone<T>(value: T): T { return structuredClone(value); }
function isRoot(principal: AuthenticatedPrincipal): boolean { return principal.roles.includes('ORIGINAL_DEVELOPER_ROOT'); }
function safeHostname(value: string): string {
  const hostname = value.trim().toLowerCase().replace(/\.$/u, '');
  if (hostname.length < 4 || hostname.length > 253 || hostname.includes('..') || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(hostname) || !hostname.includes('.')) throw new DeploymentError('VALIDATION', 'A valid hostname is required.');
  return hostname;
}

export class DeploymentService {
  private readonly provider: DeploymentProvider;
  private readonly id: () => string;
  private readonly token: () => string;
  private readonly now: () => string;
  private readonly deployments = new Map<string, StoredDeployment>();
  private readonly artifacts = new Map<string, StoredArtifact>();
  private readonly logs = new Map<string, DeploymentLog[]>();
  private readonly health = new Map<string, DeploymentHealthCheck>();
  private readonly shares = new Map<string, StoredPreviewShare>();
  private readonly domains = new Map<string, StoredDomain>();
  private readonly domainByHostname = new Map<string, string>();
  private readonly env = new Map<string, DeploymentEnvironmentConfig>();
  private readonly secrets = new Map<string, DeploymentSecretMetadata>();
  private readonly settings = new Map<string, ProjectPublishSettings>();
  private readonly publications = new Map<string, ProjectPublication>();
  private readonly usage = new Map<string, DeploymentUsage>();

  public constructor(private readonly options: DeploymentServiceOptions) {
    this.provider = options.provider ?? new MockStaticDeploymentProvider();
    this.id = options.id ?? randomUUID;
    this.token = options.token ?? (() => randomBytes(32).toString('base64url'));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private async ownerFor(projectId: string): Promise<string> {
    if (this.options.projectResolver === undefined) throw new DeploymentError('FORBIDDEN', 'A trusted project owner resolver is required.');
    const owner = await this.options.projectResolver.ownerId(projectId);
    if (owner === null) throw new DeploymentError('NOT_FOUND', 'Project was not found.');
    return owner;
  }

  private async assertProject(principal: AuthenticatedPrincipal, projectId: string, write: boolean): Promise<string> {
    if (projectId.trim().length === 0) throw new DeploymentError('VALIDATION', 'Project is required.');
    const owner = await this.ownerFor(projectId);
    if (owner === principal.userId) return owner;
    if (!write && isRoot(principal)) {
      this.options.audit?.append({ action: 'DEPLOYMENT_ROOT_READ', actorUserId: principal.userId, projectId, metadata: { targetOwnerId: owner } });
      return owner;
    }
    throw new DeploymentError('NOT_FOUND', 'Project was not found.');
  }

  private async requireCapability(principal: AuthenticatedPrincipal, capability: string): Promise<void> {
    if (!(await this.options.entitlementResolver.has(principal, capability))) throw new DeploymentError('ENTITLEMENT_REQUIRED', 'Deployment access is not enabled for this account.');
  }

  private addLog(deploymentId: string, phase: DeploymentLog['phase'], level: DeploymentLog['level'], message: string): void {
    const list = this.logs.get(deploymentId) ?? [];
    list.push({ id: this.id(), deploymentId, phase, level, message: message.slice(0, 2_000), sequence: list.length + 1, createdAt: this.now() });
    this.logs.set(deploymentId, list.slice(-2_000));
  }

  private incrementUsage(projectId: string, patch: Partial<DeploymentUsage>): void {
    const current = this.usage.get(projectId) ?? { projectId, buildSeconds: 0, artifactBytes: 0, deploymentCount: 0, previewMinutes: 0, bandwidthBytes: 0, runtimeSeconds: 0 };
    const next: Mutable<DeploymentUsage> = { ...current };
    for (const [key, value] of Object.entries(patch) as Array<[keyof DeploymentUsage, number | undefined]>) {
      if (typeof value === 'number' && key !== 'projectId') next[key] = (next[key] as number) + value;
    }
    this.usage.set(projectId, next);
  }

  private publicDeployment(value: StoredDeployment): Deployment { const { providerDeploymentId, ...publicValue } = value; void providerDeploymentId; return clone(publicValue); }
  private publicShare(value: StoredPreviewShare, token: string | null = null): PreviewShare { const { tokenHash, ...publicValue } = value; void tokenHash; return clone({ ...publicValue, token }); }
  private publicDomain(value: StoredDomain): CustomDomain { const { verificationTokenHash, ...publicValue } = value; void verificationTokenHash; return clone(publicValue); }

  public async createDeployment(principal: AuthenticatedPrincipal, input: CreateDeploymentInput): Promise<Deployment> {
    const ownerId = await this.assertProject(principal, input.projectId, true);
    await this.requireCapability(principal, input.environment === 'PRODUCTION' ? 'PRODUCTION_DEPLOY_ACCESS' : 'PREVIEW_DEPLOY_ACCESS');
    if (input.environment === 'PRODUCTION' && input.confirmProduction !== true) throw new DeploymentError('CONFIRMATION_REQUIRED', 'Production deployment requires explicit confirmation.');
    if (input.provider !== undefined && input.provider !== this.provider.code) throw new DeploymentError('PROVIDER_UNAVAILABLE', 'The requested deployment provider is not configured for this service.');
    if (!input.sourceRevision.trim() || (input.sourceType === 'RELEASE' && !input.releaseId)) throw new DeploymentError('VALIDATION', 'Deployment must reference an explicit source revision and release when applicable.');
    const resolved = await this.options.sourceResolver?.resolve({ principal, projectId: input.projectId, sourceType: input.sourceType, sourceRevision: input.sourceRevision, releaseId: input.releaseId ?? null });
    const sourceRevision = resolved?.sourceRevision ?? input.sourceRevision.trim();
    const releaseId = resolved?.releaseId ?? input.releaseId ?? null;
    await this.options.usageGuard?.reserve({ userId: principal.userId, projectId: input.projectId, environment: input.environment });
    const deploymentId = this.id();
    const deployment: StoredDeployment = {
      id: deploymentId,
      ownerId,
      projectId: input.projectId,
      environment: input.environment,
      provider: input.provider ?? this.provider.code,
      sourceType: input.sourceType,
      sourceRevision,
      releaseId,
      buildArtifactId: null,
      status: 'QUEUED',
      url: null,
      actor: input.actor ?? 'USER',
      createdAt: this.now(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      errorClass: null,
      errorMessage: null,
      supersededByDeploymentId: null,
      providerDeploymentId: null,
    };
    this.deployments.set(deploymentId, deployment);
    this.addLog(deploymentId, 'BUILD', 'INFO', `Queued ${input.environment} deployment from ${input.sourceType}:${sourceRevision}.`);
    this.options.audit?.append({ action: 'DEPLOYMENT_CREATE', actorUserId: principal.userId, projectId: input.projectId, metadata: { deploymentId, environment: input.environment, sourceType: input.sourceType } });
    try {
      deployment.status = 'BUILDING';
      deployment.startedAt = this.now();
      const build = await this.provider.prepare({ deploymentId, projectId: input.projectId, sourceRevision, environment: input.environment, buildCommand: input.buildCommand ?? 'pnpm build', packageManager: input.packageManager ?? 'pnpm', lockfileHash: input.lockfileHash ?? 'server-resolved' });
      const artifact: StoredArtifact = { id: this.id(), projectId: input.projectId, sourceRevision, buildId: build.buildId, contentHash: build.contentHash, sizeBytes: build.sizeBytes, manifest: clone(build.manifest), status: 'READY', createdAt: this.now() };
      this.artifacts.set(artifact.id, artifact);
      deployment.buildArtifactId = artifact.id;
      for (const line of build.logs) this.addLog(deploymentId, 'BUILD', 'INFO', line);
      this.incrementUsage(input.projectId, { buildSeconds: 1, artifactBytes: artifact.sizeBytes });
      await this.options.usageGuard?.record({ userId: principal.userId, projectId: input.projectId, metric: 'BUILD_MINUTES', quantity: 1 });
      deployment.status = 'READY_TO_DEPLOY';
      const deployed = await this.provider.deploy({ deploymentId, artifact, environment: input.environment });
      deployment.providerDeploymentId = deployed.providerDeploymentId;
      deployment.status = 'DEPLOYING';
      deployment.url = deployed.url;
      for (const line of deployed.logs) this.addLog(deploymentId, 'DEPLOY', 'INFO', line);
      const health = await this.provider.checkHealth({ url: deployed.url, environment: input.environment });
      const healthRow: DeploymentHealthCheck = { id: this.id(), deploymentId, status: health.status, url: deployed.url, checkedAt: this.now(), errorClass: health.status === 'FAIL' ? 'HEALTH_FAILED' : null, errorMessage: health.errorMessage ?? null };
      this.health.set(deploymentId, healthRow);
      if (health.status !== 'PASS') throw new DeploymentError('PROVIDER_FAILED', health.errorMessage ?? 'Deployment health check failed.');
      deployment.status = 'LIVE';
      deployment.completedAt = this.now();
      this.incrementUsage(input.projectId, { deploymentCount: 1 });
      const previous = [...this.deployments.values()].find((item) => item.projectId === input.projectId && item.environment === input.environment && item.id !== deploymentId && item.status === 'LIVE');
      if (previous) { previous.status = 'SUPERSEDED'; previous.supersededByDeploymentId = deploymentId; }
      this.addLog(deploymentId, 'DEPLOY', 'INFO', 'Provider health passed; deployment is LIVE in the selected environment.');
      return this.publicDeployment(deployment);
    } catch (error) {
      deployment.status = error instanceof DeploymentError && error.code === 'CONFIRMATION_REQUIRED' ? 'FAILED' : 'FAILED';
      deployment.failedAt = this.now();
      deployment.errorClass = error instanceof DeploymentError ? error.code : 'PROVIDER_FAILED';
      deployment.errorMessage = error instanceof DeploymentError ? error.message : 'Deployment failed.';
      this.addLog(deploymentId, 'DEPLOY', 'ERROR', deployment.errorMessage);
      await this.options.usageGuard?.release?.({ userId: principal.userId, projectId: input.projectId });
      throw error instanceof DeploymentError ? error : new DeploymentError('PROVIDER_FAILED', 'Deployment failed.');
    }
  }

  public async listDeployments(principal: AuthenticatedPrincipal, projectId: string, limit = 50): Promise<DeploymentPage> {
    await this.assertProject(principal, projectId, false);
    const items = [...this.deployments.values()].filter((item) => item.projectId === projectId && item.status !== 'DELETED').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.min(100, Math.max(1, limit))).map((item) => this.publicDeployment(item));
    return { items, nextCursor: null };
  }

  public async getDeployment(principal: AuthenticatedPrincipal, deploymentId: string): Promise<Deployment> {
    const deployment = this.deployments.get(deploymentId);
    if (deployment === undefined) throw new DeploymentError('NOT_FOUND', 'Deployment was not found.');
    await this.assertProject(principal, deployment.projectId, false);
    return this.publicDeployment(deployment);
  }

  public async cancelDeployment(principal: AuthenticatedPrincipal, deploymentId: string): Promise<Deployment> {
    const deployment = this.deployments.get(deploymentId);
    if (deployment === undefined) throw new DeploymentError('NOT_FOUND', 'Deployment was not found.');
    await this.assertProject(principal, deployment.projectId, true);
    if (!['QUEUED', 'BUILDING', 'READY_TO_DEPLOY', 'DEPLOYING'].includes(deployment.status)) throw new DeploymentError('CONFLICT', 'This deployment cannot be cancelled in its current state.');
    if (deployment.providerDeploymentId) await this.provider.cancel(deployment.providerDeploymentId);
    deployment.status = 'CANCELLED';
    deployment.completedAt = this.now();
    this.addLog(deploymentId, 'DEPLOY', 'WARN', 'Deployment cancelled by the owner.');
    return this.publicDeployment(deployment);
  }

  public async deleteDeployment(principal: AuthenticatedPrincipal, deploymentId: string, confirmProduction = false): Promise<Deployment> {
    const deployment = this.deployments.get(deploymentId);
    if (deployment === undefined) throw new DeploymentError('NOT_FOUND', 'Deployment was not found.');
    await this.assertProject(principal, deployment.projectId, true);
    if (deployment.environment === 'PRODUCTION' && deployment.status === 'LIVE' && !confirmProduction) throw new DeploymentError('CONFIRMATION_REQUIRED', 'Deleting a live production deployment requires confirmation.');
    deployment.status = 'DELETING';
    if (deployment.providerDeploymentId) await this.provider.delete(deployment.providerDeploymentId);
    if (deployment.buildArtifactId) this.artifacts.get(deployment.buildArtifactId)!.status = 'DELETED';
    deployment.status = 'DELETED';
    deployment.completedAt = this.now();
    return this.publicDeployment(deployment);
  }

  public async rollbackDeployment(principal: AuthenticatedPrincipal, deploymentId: string, targetDeploymentId: string, confirmProduction: boolean): Promise<Deployment> {
    const current = this.deployments.get(deploymentId);
    const target = this.deployments.get(targetDeploymentId);
    if (!current || !target || current.projectId !== target.projectId || current.environment !== 'PRODUCTION' || target.environment !== 'PRODUCTION' || target.buildArtifactId === null) throw new DeploymentError('NOT_FOUND', 'Rollback deployment was not found.');
    await this.assertProject(principal, current.projectId, true);
    if (!confirmProduction) throw new DeploymentError('CONFIRMATION_REQUIRED', 'Production rollback requires explicit confirmation.');
    const artifact = this.artifacts.get(target.buildArtifactId);
    if (!artifact || !current.providerDeploymentId) throw new DeploymentError('CONFLICT', 'Rollback artifact is unavailable.');
    const result = await this.provider.rollback({ providerDeploymentId: current.providerDeploymentId, targetArtifact: artifact });
    current.status = 'ROLLED_BACK';
    target.status = 'LIVE';
    target.url = result.url;
    target.completedAt = this.now();
    this.addLog(current.id, 'DEPLOY', 'WARN', `Rolled back to ${target.sourceRevision}.`);
    this.options.audit?.append({ action: 'DEPLOYMENT_ROLLBACK', actorUserId: principal.userId, projectId: current.projectId, metadata: { deploymentId, targetDeploymentId } });
    return this.publicDeployment(target);
  }

  public async getLogs(principal: AuthenticatedPrincipal, deploymentId: string, cursor = 0, limit = 100): Promise<DeploymentLogPage> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) throw new DeploymentError('NOT_FOUND', 'Deployment was not found.');
    await this.assertProject(principal, deployment.projectId, false);
    const list = this.logs.get(deploymentId) ?? [];
    const items = list.slice(Math.max(0, cursor), Math.max(0, cursor) + Math.min(200, Math.max(1, limit))).map(clone);
    return { items, nextCursor: cursor + items.length < list.length ? String(cursor + items.length) : null };
  }

  public async getHealth(principal: AuthenticatedPrincipal, deploymentId: string): Promise<DeploymentHealthCheck> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) throw new DeploymentError('NOT_FOUND', 'Deployment was not found.');
    await this.assertProject(principal, deployment.projectId, false);
    return clone(this.health.get(deploymentId) ?? { id: this.id(), deploymentId, status: 'PENDING', url: deployment.url, checkedAt: null, errorClass: null, errorMessage: null });
  }

  public async createPreviewShare(principal: AuthenticatedPrincipal, input: CreatePreviewShareInput): Promise<PreviewShare> {
    const deployment = this.deployments.get(input.deploymentId);
    if (!deployment || deployment.environment !== 'PREVIEW' || deployment.status !== 'LIVE' || deployment.url === null) throw new DeploymentError('NOT_FOUND', 'A live preview deployment is required.');
    await this.assertProject(principal, deployment.projectId, true);
    const visibility = input.visibility ?? 'PRIVATE';
    if (input.passwordProtected === true) throw new DeploymentError('VALIDATION', 'Password-protected preview sharing is not configured yet.');
    const rawToken = visibility === 'LINK_ONLY' ? this.token() : null;
    const expiresAt = new Date(new Date(this.now()).getTime() + (input.expiresInDays ?? 1) * 86_400_000).toISOString();
    const share: StoredPreviewShare = { id: this.id(), ownerId: principal.userId, projectId: deployment.projectId, deploymentId: deployment.id, visibility, shareUrl: rawToken ? `${deployment.url}/share/${rawToken}` : null, token: null, tokenHash: rawToken ? sha256(rawToken) : '', passwordProtected: input.passwordProtected ?? false, expiresAt, revokedAt: null, createdAt: this.now() };
    this.shares.set(share.id, share);
    return this.publicShare(share, rawToken);
  }

  public async revokePreviewShare(principal: AuthenticatedPrincipal, shareId: string): Promise<PreviewShare> {
    const share = this.shares.get(shareId);
    if (!share) throw new DeploymentError('NOT_FOUND', 'Preview share was not found.');
    await this.assertProject(principal, share.projectId, true);
    share.revokedAt = this.now();
    return this.publicShare(share);
  }

  public accessPreview(shareToken: string, now = this.now()): { readonly deploymentId: string; readonly url: string } {
    if (shareToken.length < 16 || shareToken.length > 256) throw new DeploymentError('NOT_FOUND', 'Preview share is unavailable.');
    const hash = sha256(shareToken);
    const share = [...this.shares.values()].find((item) => item.tokenHash === hash);
    if (!share || share.revokedAt !== null || share.expiresAt <= now || share.shareUrl === null) throw new DeploymentError('NOT_FOUND', 'Preview share is unavailable.');
    const deployment = this.deployments.get(share.deploymentId);
    if (!deployment || deployment.status !== 'LIVE' || !deployment.url) throw new DeploymentError('NOT_FOUND', 'Preview deployment is unavailable.');
    return { deploymentId: deployment.id, url: deployment.url };
  }

  public async addDomain(principal: AuthenticatedPrincipal, input: AddDomainInput): Promise<CustomDomain> {
    await this.requireCapability(principal, 'CUSTOM_DOMAIN_ACCESS');
    const owner = await this.assertProject(principal, input.projectId, true);
    const deployment = this.deployments.get(input.deploymentId);
    if (!deployment || deployment.projectId !== input.projectId || deployment.environment !== 'PRODUCTION' || deployment.status !== 'LIVE') throw new DeploymentError('NOT_FOUND', 'A live production deployment is required for a custom domain.');
    const hostname = safeHostname(input.hostname);
    const existing = this.domainByHostname.get(hostname);
    if (existing) throw new DeploymentError('CONFLICT', 'This domain is already associated with another project.');
    const token = this.token();
    const record: DnsRecordGuidance = { recordType: input.verificationMethod === 'DNS_CNAME' ? 'CNAME' : 'TXT', name: input.verificationMethod === 'DNS_CNAME' ? `_mezip.${hostname}` : `_mezip-verification.${hostname}`, value: input.verificationMethod === 'DNS_CNAME' ? `verify.${hostname}.invalid` : token };
    const domain: StoredDomain = { id: this.id(), ownerId: owner, projectId: input.projectId, hostname, status: 'PENDING_VERIFICATION', verificationMethod: input.verificationMethod ?? 'DNS_TXT', verificationTokenPresent: true, dnsRecord: record, verifiedAt: null, tlsStatus: 'PENDING', createdAt: this.now(), verificationTokenHash: sha256(token) };
    this.domains.set(domain.id, domain);
    this.domainByHostname.set(hostname, domain.id);
    return this.publicDomain(domain);
  }

  public async verifyDomain(principal: AuthenticatedPrincipal, domainId: string): Promise<CustomDomain> {
    const domain = this.domains.get(domainId);
    if (!domain) throw new DeploymentError('NOT_FOUND', 'Domain was not found.');
    await this.assertProject(principal, domain.projectId, true);
    if (!domain.dnsRecord || !(await this.options.dnsVerifier?.({ hostname: domain.hostname, record: domain.dnsRecord }) ?? false)) throw new DeploymentError('CONFLICT', 'DNS verification is still pending.');
    domain.status = 'VERIFIED';
    domain.verifiedAt = this.now();
    const live = [...this.deployments.values()].find((item) => item.projectId === domain.projectId && item.environment === 'PRODUCTION' && item.status === 'LIVE' && item.url);
    if (live?.url) {
      domain.status = 'CONFIGURING';
      const configured = await this.provider.configureDomain({ hostname: domain.hostname, deploymentUrl: live.url });
      domain.tlsStatus = configured.tlsStatus;
      domain.status = configured.tlsStatus === 'ACTIVE' ? 'ACTIVE' : 'VERIFIED';
    }
    return this.publicDomain(domain);
  }

  public async removeDomain(principal: AuthenticatedPrincipal, domainId: string): Promise<CustomDomain> {
    const domain = this.domains.get(domainId);
    if (!domain) throw new DeploymentError('NOT_FOUND', 'Domain was not found.');
    await this.assertProject(principal, domain.projectId, true);
    domain.status = 'DISCONNECTED';
    domain.tlsStatus = 'PENDING';
    this.domainByHostname.delete(domain.hostname);
    return this.publicDomain(domain);
  }

  public async getDomains(principal: AuthenticatedPrincipal, projectId: string): Promise<readonly CustomDomain[]> { await this.assertProject(principal, projectId, false); return [...this.domains.values()].filter((domain) => domain.projectId === projectId).map((domain) => this.publicDomain(domain)); }
  public async getEnvironment(principal: AuthenticatedPrincipal, projectId: string, environment: DeploymentEnvironment): Promise<DeploymentEnvironmentConfig> { await this.assertProject(principal, projectId, false); return clone(this.env.get(`${projectId}:${environment}`) ?? { projectId, environment, publicEnv: {}, secretRefs: [], updatedAt: this.now() }); }
  public async updateEnvironment(principal: AuthenticatedPrincipal, projectId: string, environment: DeploymentEnvironment, input: { readonly publicEnv: Readonly<Record<string, string>>; readonly secretRefs: readonly string[] }): Promise<DeploymentEnvironmentConfig> {
    await this.assertProject(principal, projectId, true);
    for (const [key, value] of Object.entries(input.publicEnv)) if (!/^[A-Z_][A-Z0-9_]{0,63}$/u.test(key) || value.length > 4_000 || /(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)/iu.test(key)) throw new DeploymentError('VALIDATION', 'Environment variable names or values are invalid.');
    if (input.secretRefs.some((value) => !/^(?:vault|secret):\/\/[A-Za-z0-9._/-]+$/u.test(value))) throw new DeploymentError('VALIDATION', 'Secret references must be opaque vault references.');
    const config: DeploymentEnvironmentConfig = { projectId, environment, publicEnv: clone(input.publicEnv), secretRefs: [...new Set(input.secretRefs)], updatedAt: this.now() };
    this.env.set(`${projectId}:${environment}`, config);
    return clone(config);
  }
  public async setSecretReference(principal: AuthenticatedPrincipal, input: { readonly projectId: string; readonly environment: DeploymentEnvironment; readonly name: string; readonly secretReference: string }): Promise<DeploymentSecretMetadata> {
    await this.assertProject(principal, input.projectId, true);
    if (!/^[A-Z_][A-Z0-9_]{0,63}$/u.test(input.name) || !/^(?:vault|secret):\/\/[A-Za-z0-9._/-]+$/u.test(input.secretReference)) throw new DeploymentError('VALIDATION', 'Only named opaque secret references are accepted.');
    const key = `${input.projectId}:${input.environment}:${input.name}`;
    const previous = this.secrets.get(key);
    const metadata: DeploymentSecretMetadata = { id: previous?.id ?? this.id(), projectId: input.projectId, environment: input.environment, name: input.name, secretVersion: (previous?.secretVersion ?? 0) + 1, updatedAt: this.now(), rotatedAt: previous ? this.now() : null, valuePresent: true };
    this.secrets.set(key, metadata);
    const current = await this.getEnvironment(principal, input.projectId, input.environment);
    await this.updateEnvironment(principal, input.projectId, input.environment, { publicEnv: current.publicEnv, secretRefs: [...current.secretRefs.filter((ref) => ref !== input.secretReference), input.secretReference] });
    return clone(metadata);
  }
  public async listSecretMetadata(principal: AuthenticatedPrincipal, projectId: string, environment: DeploymentEnvironment): Promise<readonly DeploymentSecretMetadata[]> { await this.assertProject(principal, projectId, false); return clone([...this.secrets.values()].filter((item) => item.projectId === projectId && item.environment === environment)); }

  public async getUsage(principal: AuthenticatedPrincipal, projectId: string): Promise<DeploymentUsage> { await this.assertProject(principal, projectId, false); return clone(this.usage.get(projectId) ?? { projectId, buildSeconds: 0, artifactBytes: 0, deploymentCount: 0, previewMinutes: 0, bandwidthBytes: 0, runtimeSeconds: 0 }); }

  public async publishProject(principal: AuthenticatedPrincipal, projectId: string, input: PublishProjectInput): Promise<ProjectPublication> {
    await this.assertProject(principal, projectId, true);
    const description = input.description ?? (await this.options.projectResolver?.describe?.(projectId))?.description ?? '';
    const name = (await this.options.projectResolver?.describe?.(projectId))?.name ?? projectId;
    const publication: ProjectPublication = { projectId, projectName: name, description, screenshots: [...(input.screenshots ?? [])].slice(0, 12), demoUrl: input.demoUrl ?? null, readme: input.readme ?? null, releaseId: input.releaseId ?? null, creatorDisplayName: null, updatedAt: this.now() };
    this.publications.set(projectId, publication);
    this.settings.set(projectId, { projectId, projectVisibility: input.projectVisibility ?? 'PUBLISHED', sourceVisibility: input.sourceVisibility ?? 'PRIVATE', downloadVisibility: input.downloadVisibility ?? 'PRIVATE', updatedAt: this.now() });
    return clone(publication);
  }
  public async unpublishProject(principal: AuthenticatedPrincipal, projectId: string): Promise<ProjectPublishSettings> { await this.assertProject(principal, projectId, true); const current = this.settings.get(projectId) ?? { projectId, projectVisibility: 'PRIVATE' as const, sourceVisibility: 'PRIVATE' as const, downloadVisibility: 'PRIVATE' as const, updatedAt: this.now() }; const next = { ...current, projectVisibility: 'PRIVATE' as const, updatedAt: this.now() }; this.settings.set(projectId, next); return clone(next); }
  public async getPublishSettings(principal: AuthenticatedPrincipal, projectId: string): Promise<ProjectPublishSettings> { await this.assertProject(principal, projectId, false); return clone(this.settings.get(projectId) ?? { projectId, projectVisibility: 'PRIVATE', sourceVisibility: 'PRIVATE', downloadVisibility: 'PRIVATE', updatedAt: this.now() }); }
  public getPublicProject(projectId: string): ProjectPublication { const settings = this.settings.get(projectId); const publication = this.publications.get(projectId); if (!settings || settings.projectVisibility !== 'PUBLISHED' || !publication) throw new DeploymentError('NOT_FOUND', 'Published project was not found.'); return clone(publication); }
}

export const deploymentCapabilities = {
  preview: 'PREVIEW_DEPLOY_ACCESS',
  production: 'PRODUCTION_DEPLOY_ACCESS',
  domain: 'CUSTOM_DOMAIN_ACCESS',
} as const;
