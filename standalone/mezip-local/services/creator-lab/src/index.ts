import { createHash, randomUUID } from 'node:crypto';
import type {
  AuthenticatedPrincipal,
  CapabilityCode,
  CreatorAIChangeFile,
  CreatorAIChangeSet,
  CreatorGitCommit,
  CreatorGitStatus,
  CreatorGitStatusEntry,
  CreatorGitHubAuthorizationStart,
  CreatorGitHubConnection,
  CreatorProject,
  CreatorProjectExport,
  CreatorProjectPage,
  CreatorProjectType,
  CreatorProjectVisibility,
  CreatorRelease,
  CreatorReleaseAsset,
  CreatorRepository,
  CreatorWorkspaceChange,
  CreatorWorkspaceFile,
  CreatorWorkspaceFileView,
  CreatorWorkspaceSnapshot,
  CreatorWorkspaceDiff,
} from '@me-zip/shared-types';

export type CreatorLabErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'ENTITLEMENT_REQUIRED'
  | 'VALIDATION'
  | 'PATH_UNSAFE'
  | 'WORKSPACE_CONFLICT'
  | 'SECRET_BLOCKED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'GITHUB_NOT_CONFIGURED'
  | 'RELEASE_NOT_READY';

export class CreatorLabError extends Error {
  public constructor(public readonly code: CreatorLabErrorCode, message: string) {
    super(message);
    this.name = 'CreatorLabError';
  }
}

export interface CreatorLabEntitlementResolver {
  has(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean;
}

export interface CreatorLabAuditSink {
  append(event: {
    readonly action: 'PROJECT_READ' | 'PROJECT_WRITE' | 'PROJECT_DELETE' | 'AI_PROPOSAL' | 'AI_APPLY' | 'EXPORT' | 'GITHUB_CONNECT' | 'RELEASE_DOWNLOAD';
    readonly actorUserId: string;
    readonly projectId: string | null;
    readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  }): void;
}

export interface CreatorLabGitHubConnector {
  importRepository(input: { readonly ownerId: string; readonly connectionId: string; readonly fullName: string }): Promise<readonly { readonly path: string; readonly content: string }[]>;
}

/**
 * This port owns the OAuth code exchange and encrypted credential storage.
 * Browser and Mini clients can never supply an authorization reference or
 * GitHub token directly. A production implementation must bind `state` to the
 * authenticated owner and keep the access token server-side.
 */
export interface CreatorLabGitHubAuthorizationGateway {
  beginAuthorization(input: {
    readonly ownerId: string;
    readonly state: string;
  }): Promise<CreatorGitHubAuthorizationStart>;
  completeAuthorization(input: {
    readonly ownerId: string;
    readonly state: string;
    readonly code: string;
    readonly connectionId: string;
  }): Promise<{ readonly accountLabel: string }>;
}

export interface CreatorLabServiceOptions {
  readonly entitlementResolver: CreatorLabEntitlementResolver;
  readonly audit?: CreatorLabAuditSink;
  readonly githubConnector?: CreatorLabGitHubConnector;
  readonly githubAuthorizationGateway?: CreatorLabGitHubAuthorizationGateway;
  readonly now?: () => string;
  readonly id?: () => string;
  readonly maxFileBytes?: number;
}

interface StoredFile {
  readonly meta: CreatorWorkspaceFile;
  readonly content: string;
}

interface StoredSnapshot {
  readonly meta: CreatorWorkspaceSnapshot;
  readonly files: ReadonlyMap<string, StoredFile>;
}

const CAPABILITIES = {
  creator: 'CREATOR_LAB_ACCESS' as CapabilityCode,
  codeHub: 'CODE_HUB_ACCESS' as CapabilityCode,
  vibe: 'VIBE_CODING_ACCESS' as CapabilityCode,
  download: 'CODE_DOWNLOAD_ACCESS' as CapabilityCode,
};
const ROOT_ROLE = 'ORIGINAL_DEVELOPER_ROOT';
const SENSITIVE_SEGMENT = /^(?:\.env(?:\..*)?|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|credentials?(?:\..*)?|secrets?(?:\..*)?|.*\.pem|.*\.key)$/iu;
const SECRET_CONTENT = /(?:api[_-]?key|client[_-]?secret|private[_-]?key|authorization\s*:\s*bearer|ghp_[a-z0-9]{20,})/iu;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isRoot(principal: AuthenticatedPrincipal): boolean {
  return principal.roles.includes(ROOT_ROLE);
}

function safePath(path: string): string {
  if (typeof path !== 'string' || path.trim() === '' || path.length > 512 || path.includes('\0') || path.includes('\\') || path.startsWith('/')) {
    throw new CreatorLabError('PATH_UNSAFE', 'Workspace path is unsafe.');
  }
  const normalized = path.replace(/\/+/gu, '/');
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || SENSITIVE_SEGMENT.test(segment))) {
    throw new CreatorLabError('PATH_UNSAFE', 'Workspace path is unsafe.');
  }
  return normalized;
}

function languageFor(path: string): string | null {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === undefined || extension === path.toLowerCase()) return null;
  const languages: Readonly<Record<string, string>> = { ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact', css: 'css', html: 'html', json: 'json', md: 'markdown', wxml: 'xml', wxss: 'css', py: 'python', sh: 'shell' };
  return languages[extension] ?? extension;
}

function mapFile(meta: CreatorWorkspaceFile, content: string | null): CreatorWorkspaceFileView {
  return { ...clone(meta), content };
}

function projectPage(items: readonly CreatorProject[], limit: number, cursor: string | null): CreatorProjectPage {
  const sorted = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  const start = cursor === null ? 0 : Math.max(0, sorted.findIndex((item) => item.id === cursor) + 1);
  const page = sorted.slice(start, start + limit);
  return { items: page.map(clone), nextCursor: sorted[start + page.length]?.id ?? null };
}

export interface CreatorProjectCreateInput {
  readonly name: string;
  readonly description: string;
  readonly type: CreatorProjectType;
  readonly visibility: CreatorProjectVisibility;
  readonly template?: 'BLANK' | 'REACT_WEB' | 'MINI_PROGRAM' | 'BASIC_TS';
}

export interface CreatorFileCreateInput { readonly path: string; readonly kind: 'FILE' | 'FOLDER'; readonly content?: string; readonly expectedVersion?: number; }
export interface CreatorFileUpdateInput { readonly path: string; readonly content: string; readonly expectedChecksum: string; readonly expectedVersion: number; }
export interface CreatorFileMoveInput { readonly path: string; readonly nextPath: string; readonly expectedVersion: number; }
export interface CreatorAIChangeRequest {
  readonly request: string;
  readonly scopePaths: readonly string[];
  readonly expectedVersion: number;
  readonly files?: readonly CreatorAIChangeFile[];
}

export class CreatorLabService {
  private readonly projects = new Map<string, CreatorProject>();
  private readonly repositories = new Map<string, CreatorRepository>();
  private readonly files = new Map<string, StoredFile>();
  private readonly snapshots = new Map<string, StoredSnapshot>();
  private readonly changes = new Map<string, CreatorAIChangeSet>();
  private readonly changeSnapshots = new Map<string, string>();
  private readonly commits = new Map<string, CreatorGitCommit[]>();
  private readonly baseline = new Map<string, Map<string, string>>();
  private readonly releases = new Map<string, CreatorRelease>();
  private readonly assets = new Map<string, CreatorReleaseAsset>();
  private readonly exports = new Map<string, CreatorProjectExport>();
  private readonly connections = new Map<string, CreatorGitHubConnection>();
  private readonly pendingGitHubAuthorizations = new Map<
    string,
    Readonly<{ ownerId: string; expiresAt: string }>
  >();
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly maxFileBytes: number;

  public constructor(private readonly options: CreatorLabServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? randomUUID;
    this.maxFileBytes = options.maxFileBytes ?? 1_000_000;
  }

  private requireCapability(principal: AuthenticatedPrincipal, capability: CapabilityCode): void {
    if (isRoot(principal) || this.options.entitlementResolver.has(principal, capability)) return;
    throw new CreatorLabError('ENTITLEMENT_REQUIRED', 'Creator Lab entitlement is required.');
  }

  private requireProject(principal: AuthenticatedPrincipal, projectId: string, write = false): CreatorProject {
    const project = this.projects.get(projectId);
    if (project === undefined || project.status === 'DELETED') throw new CreatorLabError('NOT_FOUND', 'Project was not found.');
    if (project.ownerId === principal.userId || isRoot(principal)) {
      if (isRoot(principal) && project.ownerId !== principal.userId) this.options.audit?.append({ action: write ? 'PROJECT_WRITE' : 'PROJECT_READ', actorUserId: principal.userId, projectId, metadata: { targetOwnerId: project.ownerId } });
      return project;
    }
    if (!write && project.status === 'ACTIVE' && project.visibility === 'PUBLISHED') return project;
    throw new CreatorLabError('NOT_FOUND', 'Project was not found.');
  }

  private updateProject(project: CreatorProject, patch: Partial<CreatorProject>): CreatorProject {
    const updated = { ...project, ...patch, updatedAt: this.now() };
    this.projects.set(project.id, updated);
    return updated;
  }

  private key(projectId: string, path: string): string { return `${projectId}:${path}`; }

  private readStoredFile(projectId: string, path: string): StoredFile {
    const file = this.files.get(this.key(projectId, path));
    if (file === undefined) throw new CreatorLabError('NOT_FOUND', 'Workspace file was not found.');
    return file;
  }

  private assertVersion(project: CreatorProject, expectedVersion: number): void {
    if (project.workspaceVersion !== expectedVersion) throw new CreatorLabError('WORKSPACE_CONFLICT', 'Workspace changed; review the current diff before applying.');
  }

  private setFile(project: CreatorProject, path: string, kind: 'FILE' | 'FOLDER', content: string): StoredFile {
    if (Buffer.byteLength(content, 'utf8') > this.maxFileBytes) throw new CreatorLabError('VALIDATION', 'File exceeds the workspace size limit.');
    if (SECRET_CONTENT.test(content)) throw new CreatorLabError('SECRET_BLOCKED', 'Potential secret or credential material is blocked from the workspace.');
    const now = this.now();
    const id = this.files.get(this.key(project.id, path))?.meta.id ?? this.id();
    const meta: CreatorWorkspaceFile = { id, projectId: project.id, path, kind, language: kind === 'FILE' ? languageFor(path) : null, sizeBytes: Buffer.byteLength(content, 'utf8'), checksum: digest(content), createdAt: this.files.get(this.key(project.id, path))?.meta.createdAt ?? now, updatedAt: now };
    const stored = { meta, content };
    this.files.set(this.key(project.id, path), stored);
    return stored;
  }

  public createProject(principal: AuthenticatedPrincipal, input: CreatorProjectCreateInput): CreatorProject {
    this.requireCapability(principal, CAPABILITIES.creator);
    if (input.name.trim() === '') throw new CreatorLabError('VALIDATION', 'Project name is required.');
    const now = this.now();
    const project: CreatorProject = { id: this.id(), ownerId: principal.userId, name: input.name.trim(), description: input.description, type: input.type, visibility: input.visibility, status: 'ACTIVE', defaultBranch: 'main', workspaceVersion: 1, createdAt: now, updatedAt: now, lastOpenedAt: null };
    this.projects.set(project.id, project);
    const template: Record<string, string> = { 'README.md': `# ${project.name}\n\nCreated in ME.zip Creator Lab.\n` };
    if (input.template === 'REACT_WEB') template['src/App.tsx'] = 'export function App() { return <main>Creator Lab</main>; }\n';
    if (input.template === 'MINI_PROGRAM') template['pages/index/index.wxml'] = '<view class="page">Creator Lab</view>\n';
    if (input.template === 'BASIC_TS') template['src/index.ts'] = 'export const projectName = \'Creator Lab\';\n';
    for (const [path, content] of Object.entries(template)) this.setFile(project, safePath(path), 'FILE', content);
    this.baseline.set(project.id, new Map([...this.files.values()].filter((file) => file.meta.projectId === project.id).map((file) => [file.meta.path, file.meta.checksum])));
    this.options.audit?.append({ action: 'PROJECT_WRITE', actorUserId: principal.userId, projectId: project.id, metadata: { operation: 'CREATE' } });
    return clone(project);
  }

  public listProjects(principal: AuthenticatedPrincipal, input: { readonly limit: number; readonly cursor: string | null }): CreatorProjectPage {
    this.requireCapability(principal, CAPABILITIES.creator);
    return projectPage([...this.projects.values()].filter((project) => project.ownerId === principal.userId && project.status === 'ACTIVE'), input.limit, input.cursor);
  }

  public getProject(principal: AuthenticatedPrincipal, projectId: string): CreatorProject {
    const project = this.requireProject(principal, projectId);
    this.updateProject(project, { lastOpenedAt: this.now() });
    return clone(this.projects.get(project.id)!);
  }

  public trashProject(principal: AuthenticatedPrincipal, projectId: string): CreatorProject {
    const project = this.requireProject(principal, projectId, true);
    const updated = this.updateProject(project, { status: 'TRASHED' });
    this.options.audit?.append({ action: 'PROJECT_DELETE', actorUserId: principal.userId, projectId, metadata: { operation: 'TRASH' } });
    return clone(updated);
  }

  public listFiles(principal: AuthenticatedPrincipal, projectId: string): readonly CreatorWorkspaceFile[] {
    const project = this.requireProject(principal, projectId);
    return [...this.files.values()].filter((file) => file.meta.projectId === project.id).map((file) => clone(file.meta)).sort((a, b) => a.path.localeCompare(b.path));
  }

  public readFile(principal: AuthenticatedPrincipal, projectId: string, rawPath: string): CreatorWorkspaceFileView {
    const project = this.requireProject(principal, projectId);
    const path = safePath(rawPath);
    const stored = this.readStoredFile(project.id, path);
    return mapFile(stored.meta, project.ownerId === principal.userId || isRoot(principal) ? stored.content : null);
  }

  public createFile(principal: AuthenticatedPrincipal, projectId: string, input: CreatorFileCreateInput): CreatorWorkspaceFile {
    const project = this.requireProject(principal, projectId, true);
    const path = safePath(input.path);
    if (input.expectedVersion !== undefined) this.assertVersion(project, input.expectedVersion);
    if (this.files.has(this.key(project.id, path))) throw new CreatorLabError('VALIDATION', 'Workspace path already exists.');
    const stored = this.setFile(project, path, input.kind, input.kind === 'FILE' ? input.content ?? '' : '');
    this.updateProject(project, { workspaceVersion: project.workspaceVersion + 1 });
    return clone(stored.meta);
  }

  public updateFile(principal: AuthenticatedPrincipal, projectId: string, input: CreatorFileUpdateInput): CreatorWorkspaceFile {
    const project = this.requireProject(principal, projectId, true);
    const path = safePath(input.path);
    this.assertVersion(project, input.expectedVersion);
    const current = this.readStoredFile(project.id, path);
    if (current.meta.checksum !== input.expectedChecksum) throw new CreatorLabError('WORKSPACE_CONFLICT', 'File changed; refresh before saving.');
    const stored = this.setFile(project, path, 'FILE', input.content);
    this.updateProject(project, { workspaceVersion: project.workspaceVersion + 1 });
    return clone(stored.meta);
  }

  public moveFile(principal: AuthenticatedPrincipal, projectId: string, input: CreatorFileMoveInput): CreatorWorkspaceFile {
    const project = this.requireProject(principal, projectId, true);
    const path = safePath(input.path);
    const nextPath = safePath(input.nextPath);
    this.assertVersion(project, input.expectedVersion);
    if (this.files.has(this.key(project.id, nextPath))) throw new CreatorLabError('VALIDATION', 'Destination path already exists.');
    const current = this.readStoredFile(project.id, path);
    this.files.delete(this.key(project.id, path));
    const moved = this.setFile(project, nextPath, current.meta.kind, current.content);
    this.updateProject(project, { workspaceVersion: project.workspaceVersion + 1 });
    return clone(moved.meta);
  }

  public deleteFile(principal: AuthenticatedPrincipal, projectId: string, rawPath: string, expectedVersion: number): void {
    const project = this.requireProject(principal, projectId, true);
    const path = safePath(rawPath);
    this.assertVersion(project, expectedVersion);
    this.readStoredFile(project.id, path);
    this.files.delete(this.key(project.id, path));
    this.updateProject(project, { workspaceVersion: project.workspaceVersion + 1 });
  }

  public searchFiles(principal: AuthenticatedPrincipal, projectId: string, query: string): readonly CreatorWorkspaceFile[] {
    const project = this.requireProject(principal, projectId);
    const needle = query.trim().toLowerCase();
    if (needle === '') return [];
    return [...this.files.values()].filter((file) => file.meta.projectId === project.id && file.meta.path.toLowerCase().includes(needle)).map((file) => clone(file.meta));
  }

  public createSnapshot(principal: AuthenticatedPrincipal, projectId: string, reason: CreatorWorkspaceSnapshot['reason']): CreatorWorkspaceSnapshot {
    const project = this.requireProject(principal, projectId, true);
    const now = this.now();
    const snapshot: CreatorWorkspaceSnapshot = { id: this.id(), projectId, ownerId: project.ownerId, version: project.workspaceVersion, reason, fileCount: [...this.files.values()].filter((file) => file.meta.projectId === projectId).length, checksum: digest(this.serializeProject(projectId)), createdAt: now };
    const copy = new Map<string, StoredFile>();
    for (const [key, file] of this.files.entries()) if (file.meta.projectId === projectId) copy.set(key, clone(file));
    this.snapshots.set(snapshot.id, { meta: snapshot, files: copy });
    return clone(snapshot);
  }

  public restoreSnapshot(principal: AuthenticatedPrincipal, snapshotId: string): CreatorProject {
    const snapshot = this.snapshots.get(snapshotId);
    if (snapshot === undefined) throw new CreatorLabError('NOT_FOUND', 'Workspace snapshot was not found.');
    const project = this.requireProject(principal, snapshot.meta.projectId, true);
    for (const key of [...this.files.keys()]) if (key.startsWith(`${project.id}:`)) this.files.delete(key);
    for (const [key, file] of snapshot.files.entries()) this.files.set(key, clone(file));
    const updated = this.updateProject(project, { workspaceVersion: project.workspaceVersion + 1 });
    return clone(updated);
  }

  public diff(principal: AuthenticatedPrincipal, projectId: string): CreatorWorkspaceDiff {
    const project = this.requireProject(principal, projectId);
    const base = this.baseline.get(projectId) ?? new Map<string, string>();
    const current = new Map([...this.files.values()].filter((file) => file.meta.projectId === projectId).map((file) => [file.meta.path, file.meta.checksum]));
    const paths = new Set([...base.keys(), ...current.keys()]);
    const changes: CreatorWorkspaceChange[] = [];
    for (const path of [...paths].sort()) {
      const oldChecksum = base.get(path) ?? null;
      const newChecksum = current.get(path) ?? null;
      if (oldChecksum === newChecksum) continue;
      const stored = this.files.get(this.key(projectId, path));
      changes.push({ id: this.id(), projectId, ownerId: project.ownerId, operation: oldChecksum === null ? 'CREATE' : newChecksum === null ? 'DELETE' : 'UPDATE', path, nextPath: null, oldChecksum, newChecksum, content: project.ownerId === principal.userId || isRoot(principal) ? stored?.content ?? null : null });
    }
    return { projectId, baseVersion: project.workspaceVersion, currentVersion: project.workspaceVersion, changes };
  }

  public gitStatus(principal: AuthenticatedPrincipal, projectId: string): CreatorGitStatus {
    const project = this.requireProject(principal, projectId);
    const diff = this.diff(principal, projectId);
    const entries: CreatorGitStatusEntry[] = diff.changes.map((change) => ({ path: change.path, status: change.operation === 'CREATE' ? 'UNTRACKED' : change.operation === 'DELETE' ? 'DELETED' : 'MODIFIED', oldPath: change.nextPath }));
    return { projectId, branch: project.defaultBranch, ahead: this.commits.get(projectId)?.length ?? 0, behind: 0, clean: entries.length === 0, entries };
  }

  public gitCommit(principal: AuthenticatedPrincipal, projectId: string, message: string, expectedVersion: number, paths: readonly string[]): CreatorGitCommit {
    const project = this.requireProject(principal, projectId, true);
    this.assertVersion(project, expectedVersion);
    const status = this.gitStatus(principal, projectId);
    const selected = paths.length === 0 ? status.entries.map((entry) => entry.path) : paths.map(safePath);
    const baseline = this.baseline.get(projectId) ?? new Map<string, string>();
    for (const path of selected) {
      const stored = this.files.get(this.key(projectId, path));
      if (stored === undefined) baseline.delete(path);
      else baseline.set(path, stored.meta.checksum);
    }
    this.baseline.set(projectId, baseline);
    const commit: CreatorGitCommit = { id: this.id(), projectId, ownerId: project.ownerId, branch: project.defaultBranch, message: message.trim(), changedPaths: selected, createdAt: this.now() };
    this.commits.set(projectId, [...(this.commits.get(projectId) ?? []), commit]);
    return clone(commit);
  }

  public gitHistory(principal: AuthenticatedPrincipal, projectId: string): readonly CreatorGitCommit[] {
    this.requireProject(principal, projectId);
    return clone([...(this.commits.get(projectId) ?? [])].reverse());
  }

  public proposeAIChange(principal: AuthenticatedPrincipal, projectId: string, input: CreatorAIChangeRequest): CreatorAIChangeSet {
    this.requireCapability(principal, CAPABILITIES.vibe);
    const project = this.requireProject(principal, projectId, true);
    this.assertVersion(project, input.expectedVersion);
    const scope = input.scopePaths.map(safePath);
    const files = (input.files ?? []).map((file) => ({ ...clone(file), path: safePath(file.path), nextPath: file.nextPath === null || file.nextPath === undefined ? null : safePath(file.nextPath) }));
    if (files.some((file) => !scope.some((path) => file.path === path || file.path.startsWith(`${path}/`)))) throw new CreatorLabError('VALIDATION', 'AI change is outside the selected scope.');
    if (files.some((file) => file.content !== null && file.content !== undefined && SECRET_CONTENT.test(file.content))) throw new CreatorLabError('SECRET_BLOCKED', 'AI change contains blocked secret material.');
    const change: CreatorAIChangeSet = { id: this.id(), projectId, ownerId: project.ownerId, requestSummary: input.request, scopePaths: scope, workspaceVersion: project.workspaceVersion, status: 'PROPOSED', files, createdAt: this.now(), appliedAt: null, rolledBackAt: null };
    this.changes.set(change.id, change);
    this.options.audit?.append({ action: 'AI_PROPOSAL', actorUserId: principal.userId, projectId, metadata: { fileCount: files.length } });
    return clone(change);
  }

  public applyAIChange(principal: AuthenticatedPrincipal, changeId: string, expectedVersion: number): CreatorAIChangeSet {
    const change = this.changes.get(changeId);
    if (change === undefined) throw new CreatorLabError('NOT_FOUND', 'Change set was not found.');
    const project = this.requireProject(principal, change.projectId, true);
    if (change.status !== 'PROPOSED') throw new CreatorLabError('VALIDATION', 'Change set is no longer reviewable.');
    if (change.workspaceVersion !== expectedVersion) throw new CreatorLabError('WORKSPACE_CONFLICT', 'Change set was created for a different workspace version.');
    this.assertVersion(project, expectedVersion);
    const snapshot = this.createSnapshot(principal, project.id, 'AI_APPLY');
    try {
      for (const file of change.files) this.applyChangeFile(project, file);
    } catch (error) {
      this.restoreSnapshot(principal, snapshot.id);
      throw error;
    }
    this.updateProject(project, { workspaceVersion: project.workspaceVersion + 1 });
    const applied = { ...change, status: 'APPLIED' as const, appliedAt: this.now() };
    this.changes.set(change.id, applied);
    this.changeSnapshots.set(change.id, snapshot.id);
    this.options.audit?.append({ action: 'AI_APPLY', actorUserId: principal.userId, projectId: project.id, metadata: { changeId } });
    return clone(applied);
  }

  private applyChangeFile(project: CreatorProject, file: CreatorAIChangeFile): void {
    const path = safePath(file.path);
    if (file.operation === 'CREATE' || file.operation === 'UPDATE') {
      const current = this.files.get(this.key(project.id, path));
      if (file.operation === 'UPDATE' && current === undefined) throw new CreatorLabError('WORKSPACE_CONFLICT', 'AI update target is missing.');
      if (file.expectedChecksum !== null && file.expectedChecksum !== undefined && current?.meta.checksum !== file.expectedChecksum) throw new CreatorLabError('WORKSPACE_CONFLICT', 'AI change target has changed.');
      this.setFile(project, path, 'FILE', file.content ?? '');
    } else if (file.operation === 'DELETE') {
      this.files.delete(this.key(project.id, path));
    } else if (file.operation === 'RENAME' || file.operation === 'MOVE') {
      const nextPath = file.nextPath === null ? null : safePath(file.nextPath ?? '');
      if (nextPath === null) throw new CreatorLabError('VALIDATION', 'A move requires a destination path.');
      const current = this.readStoredFile(project.id, path);
      this.files.delete(this.key(project.id, path));
      this.setFile(project, nextPath, current.meta.kind, current.content);
    }
  }

  public rollbackAIChange(principal: AuthenticatedPrincipal, changeId: string): CreatorAIChangeSet {
    const change = this.changes.get(changeId);
    if (change === undefined || change.status !== 'APPLIED') throw new CreatorLabError('NOT_FOUND', 'Applied change set was not found.');
    const project = this.requireProject(principal, change.projectId, true);
    const snapshotId = this.changeSnapshots.get(changeId);
    if (snapshotId === undefined) throw new CreatorLabError('VALIDATION', 'Rollback snapshot is unavailable.');
    this.restoreSnapshot(principal, snapshotId);
    const rolledBack = { ...change, status: 'ROLLED_BACK' as const, rolledBackAt: this.now() };
    this.changes.set(changeId, rolledBack);
    this.updateProject(project, { workspaceVersion: project.workspaceVersion + 1 });
    return clone(rolledBack);
  }

  private requireGitHubAuthorization(): CreatorLabGitHubAuthorizationGateway {
    if (
      this.options.githubAuthorizationGateway === undefined ||
      this.options.githubConnector === undefined
    ) {
      throw new CreatorLabError(
        'GITHUB_NOT_CONFIGURED',
        'GitHub OAuth is not configured for this deployment.',
      );
    }
    return this.options.githubAuthorizationGateway;
  }

  public async beginGitHubAuthorization(
    principal: AuthenticatedPrincipal,
  ): Promise<CreatorGitHubAuthorizationStart> {
    this.requireCapability(principal, CAPABILITIES.codeHub);
    const gateway = this.requireGitHubAuthorization();
    const state = `github-${this.id()}-${this.id()}`;
    const handoff = await gateway.beginAuthorization({ ownerId: principal.userId, state });
    if (
      typeof handoff.authorizationUrl !== 'string' ||
      handoff.authorizationUrl.length === 0 ||
      !Number.isFinite(Date.parse(handoff.expiresAt)) ||
      Date.parse(handoff.expiresAt) <= Date.parse(this.now())
    ) {
      throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub OAuth did not provide a valid authorization handoff.');
    }
    this.pendingGitHubAuthorizations.set(state, {
      ownerId: principal.userId,
      expiresAt: handoff.expiresAt,
    });
    return clone(handoff);
  }

  public async completeGitHubAuthorization(
    principal: AuthenticatedPrincipal,
    input: { readonly code: string; readonly state: string },
  ): Promise<CreatorGitHubConnection> {
    this.requireCapability(principal, CAPABILITIES.codeHub);
    const gateway = this.requireGitHubAuthorization();
    const pending = this.pendingGitHubAuthorizations.get(input.state);
    if (pending === undefined) {
      throw new CreatorLabError('NOT_FOUND', 'GitHub authorization request was not found or expired.');
    }
    if (Date.parse(pending.expiresAt) <= Date.parse(this.now())) {
      this.pendingGitHubAuthorizations.delete(input.state);
      throw new CreatorLabError('NOT_FOUND', 'GitHub authorization request was not found or expired.');
    }
    if (pending.ownerId !== principal.userId) {
      throw new CreatorLabError('FORBIDDEN', 'GitHub authorization request belongs to another account.');
    }
    const connectionId = this.id();
    const completed = await gateway.completeAuthorization({
      ownerId: principal.userId,
      state: input.state,
      code: input.code,
      connectionId,
    });
    const accountLabel = completed.accountLabel.trim();
    if (accountLabel.length === 0 || accountLabel.length > 120) {
      throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub OAuth did not provide a valid account identity.');
    }
    const connection: CreatorGitHubConnection = { id: connectionId, ownerId: principal.userId, provider: 'GITHUB', accountLabel, status: 'CONNECTED', connectedAt: this.now() };
    this.connections.set(connection.id, connection);
    this.pendingGitHubAuthorizations.delete(input.state);
    this.options.audit?.append({ action: 'GITHUB_CONNECT', actorUserId: principal.userId, projectId: null, metadata: { connectionId: connection.id } });
    return clone(connection);
  }

  /** Returns only the caller's safe connection projection; credentials stay in the vault. */
  public getGitHubConnection(principal: AuthenticatedPrincipal): CreatorGitHubConnection | null {
    this.requireCapability(principal, CAPABILITIES.codeHub);
    const connection = [...this.connections.values()].find(
      (candidate) => candidate.ownerId === principal.userId && candidate.provider === 'GITHUB',
    );
    return connection === undefined ? null : clone(connection);
  }

  public async importGitHubRepository(principal: AuthenticatedPrincipal, input: { readonly connectionId: string; readonly repositoryFullName: string; readonly projectName: string }): Promise<CreatorProject> {
    this.requireCapability(principal, CAPABILITIES.codeHub);
    const connection = this.connections.get(input.connectionId);
    if (connection === undefined || connection.ownerId !== principal.userId || connection.status !== 'CONNECTED') throw new CreatorLabError('NOT_FOUND', 'GitHub connection was not found.');
    const project = this.createProject(principal, { name: input.projectName, description: `Imported from ${input.repositoryFullName}`, type: 'OTHER', visibility: 'PRIVATE', template: 'BLANK' });
    const repository: CreatorRepository = { id: this.id(), projectId: project.id, ownerId: principal.userId, source: 'GITHUB', provider: 'GITHUB', name: input.repositoryFullName.split('/')[1] ?? input.repositoryFullName, fullName: input.repositoryFullName, defaultBranch: 'main', connectedAt: this.now(), status: 'IMPORTING' };
    this.repositories.set(repository.id, repository);
    const connector = this.options.githubConnector;
    if (connector === undefined) {
      throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub repository import is not configured for this deployment.');
    }
    const imported = await connector.importRepository({ ownerId: principal.userId, connectionId: connection.id, fullName: input.repositoryFullName });
    const current = this.requireProject(principal, project.id, true);
    for (const file of imported) this.setFile(current, safePath(file.path), 'FILE', file.content);
    this.updateProject(current, { workspaceVersion: current.workspaceVersion + 1 });
    this.repositories.set(repository.id, { ...repository, status: 'CONNECTED' });
    return clone(current);
  }

  public createRelease(principal: AuthenticatedPrincipal, projectId: string, input: { readonly version: string; readonly title: string; readonly notes: string; readonly sourceCommitId: string | null }): CreatorRelease {
    this.requireCapability(principal, CAPABILITIES.codeHub);
    const project = this.requireProject(principal, projectId, true);
    const release: CreatorRelease = { id: this.id(), projectId, ownerId: project.ownerId, version: input.version.startsWith('v') ? input.version : `v${input.version}`, title: input.title, notes: input.notes, status: 'DRAFT', sourceCommitId: input.sourceCommitId, createdAt: this.now(), publishedAt: null };
    this.releases.set(release.id, release);
    return clone(release);
  }

  public publishRelease(principal: AuthenticatedPrincipal, releaseId: string): CreatorRelease {
    const release = this.releases.get(releaseId);
    if (release === undefined) throw new CreatorLabError('NOT_FOUND', 'Release was not found.');
    this.requireProject(principal, release.projectId, true);
    const updated = { ...release, status: 'PUBLISHED' as const, publishedAt: this.now() };
    this.releases.set(releaseId, updated);
    return clone(updated);
  }

  public listReleases(principal: AuthenticatedPrincipal, projectId: string): readonly CreatorRelease[] {
    this.requireProject(principal, projectId);
    return clone([...this.releases.values()].filter((release) => release.projectId === projectId && (release.status === 'PUBLISHED' || release.ownerId === principal.userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  public exportProject(principal: AuthenticatedPrincipal, projectId: string): CreatorProjectExport {
    this.requireCapability(principal, CAPABILITIES.download);
    const project = this.requireProject(principal, projectId, true);
    const files = [...this.files.values()].filter((file) => file.meta.projectId === projectId).sort((a, b) => a.meta.path.localeCompare(b.meta.path));
    const manifest = JSON.stringify({ schema_version: 'mezip.creator.project.v1', project_id: project.id, project_name: project.name, exported_at: this.now(), source_type: 'WORKSPACE', files: files.map((file) => ({ path: file.meta.path, checksum: file.meta.checksum, size: file.meta.sizeBytes })) });
    const exportRow: CreatorProjectExport = { id: this.id(), projectId, ownerId: project.ownerId, format: 'ZIP', status: 'READY', manifestChecksum: digest(manifest), fileCount: files.length, createdAt: this.now(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    this.exports.set(exportRow.id, exportRow);
    this.options.audit?.append({ action: 'EXPORT', actorUserId: principal.userId, projectId, metadata: { exportId: exportRow.id, fileCount: files.length, manifestChecksum: exportRow.manifestChecksum } });
    return clone(exportRow);
  }

  public getExport(principal: AuthenticatedPrincipal, exportId: string): CreatorProjectExport {
    const row = this.exports.get(exportId);
    if (row === undefined || row.ownerId !== principal.userId) throw new CreatorLabError('NOT_FOUND', 'Project export was not found.');
    if (Date.parse(row.expiresAt) <= Date.parse(this.now())) return { ...clone(row), status: 'EXPIRED' };
    return clone(row);
  }

  private serializeProject(projectId: string): string {
    return [...this.files.values()].filter((file) => file.meta.projectId === projectId).sort((a, b) => a.meta.path.localeCompare(b.meta.path)).map((file) => `${file.meta.path}\0${file.content}`).join('\n');
  }
}

export { CAPABILITIES as creatorLabCapabilities, safePath as validateCreatorPath };
export {
  GitHubOAuthConnector,
  InMemoryGitHubCredentialVault,
  type GitHubCredentialVault,
  type GitHubOAuthConnectorOptions,
} from './github-oauth.js';
