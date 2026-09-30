import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { validateCreatorPath } from '@me-zip/creator-lab';
import type {
  AuthenticatedPrincipal,
  CapabilityCode,
  CreatorHome,
  CreatorProfile,
  CreatorProject,
  CreatorProjectDetail,
  CreatorProjectDownloadGrant,
  CreatorProjectMedia,
  CreatorProjectMetadata,
  CreatorProjectSourceFile,
  CreatorProjectStats,
  CreatorProjectVisibilitySettings,
  CreatorGitHubConnection,
  CreatorPublicProfile,
  CreatorPublishedProjectSnapshot,
  CreatorRelease,
  CreatorReleaseAsset,
  CreatorSourceVisibility,
  CreatorWorkspaceFile,
  CreatorWorkspaceFileView,
  PublicExternalIdentity,
} from '@me-zip/shared-types';

export type CreatorEcosystemErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'ENTITLEMENT_REQUIRED'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'SECRET_BLOCKED'
  | 'PROVIDER_UNAVAILABLE'
  | 'DOWNLOAD_EXPIRED';

export class CreatorEcosystemError extends Error {
  public constructor(public readonly code: CreatorEcosystemErrorCode, message: string) {
    super(message);
    this.name = 'CreatorEcosystemError';
  }
}

/** This adapter deliberately delegates to the existing Phase 10 project
 * domain. It is not a second project, source, release, or workspace system. */
export interface CreatorEcosystemProjectGateway {
  getOwnedProject(ownerId: string, projectId: string): CreatorProject;
  listOwnedProjects(ownerId: string): readonly CreatorProject[];
  listOwnedFiles(ownerId: string, projectId: string): readonly CreatorWorkspaceFile[];
  readOwnedFile(ownerId: string, projectId: string, path: string): CreatorWorkspaceFileView;
  listOwnedReleases(ownerId: string, projectId: string): readonly CreatorRelease[];
  getGitHubConnection(ownerId: string): CreatorGitHubConnection | null;
}

export interface CreatorEcosystemEntitlements {
  has(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean;
}

/** Media IDs are opaque. The caller must prove ownership to attach a private
 * cover/screenshot; the ecosystem never accepts an arbitrary media URL. */
export interface CreatorEcosystemMediaAuthorizer {
  assertOwner(input: { readonly ownerId: string; readonly mediaId: string }): void;
}

/** Phase 17 remains the single follow graph. */
export interface CreatorFollowGraph {
  setFollow(input: { readonly principal: AuthenticatedPrincipal; readonly creatorId: string; readonly followed: boolean; readonly idempotencyKey: string }): boolean;
  isFollowing(input: { readonly principal: AuthenticatedPrincipal; readonly creatorId: string }): boolean;
  followerCount?(creatorId: string): number;
}

/** Project saves must land in the established private save/archive domain.
 * A Creator is intentionally never given the identity of a saver. */
export interface CreatorProjectSaveStore {
  setSaved(input: { readonly principal: AuthenticatedPrincipal; readonly projectId: string; readonly snapshotId: string; readonly saved: boolean; readonly idempotencyKey: string }): boolean;
  isSaved(input: { readonly principal: AuthenticatedPrincipal; readonly projectId: string }): boolean;
  aggregateCount?(projectId: string): number;
}

/** Optional bridge to Phase 17 Social. A project is never posted implicitly;
 * this port must receive an explicit publish/update action from the owner. */
export interface CreatorProjectSocialPublisher {
  publishProjectSnapshot(input: { readonly principal: AuthenticatedPrincipal; readonly snapshot: CreatorPublishedProjectSnapshot }): Promise<void> | void;
}

/** Preview/Deployment data is only an already-authorized server projection.
 * It never fetches a supplied URL and therefore cannot become an SSRF proxy. */
export interface CreatorProjectDemoResolver {
  status(input: { readonly ownerId: string; readonly projectId: string }): CreatorPublishedProjectSnapshot['demoStatus'];
}

export interface CreatorEcosystemAudit {
  append(event: {
    readonly action: 'PROFILE_WRITE' | 'PROJECT_METADATA_WRITE' | 'PROJECT_PUBLISH' | 'PROJECT_UNPUBLISH' | 'SOURCE_READ' | 'DOWNLOAD_GRANT' | 'SAVE' | 'FOLLOW' | 'PROJECT_VIEW';
    readonly actorUserId: string;
    readonly projectId: string | null;
    readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  }): void;
}

export interface CreatorEcosystemServiceOptions {
  readonly projects: CreatorEcosystemProjectGateway;
  readonly entitlements: CreatorEcosystemEntitlements;
  readonly media?: CreatorEcosystemMediaAuthorizer;
  readonly follows?: CreatorFollowGraph;
  readonly saves?: CreatorProjectSaveStore;
  readonly publicIdentities?: { listPublic(ownerId: string): readonly PublicExternalIdentity[] };
  readonly social?: CreatorProjectSocialPublisher;
  readonly demos?: CreatorProjectDemoResolver;
  readonly audit?: CreatorEcosystemAudit;
  /** Server configuration only; clients cannot nominate themselves Founder. */
  readonly founderUserIds?: readonly string[];
  readonly now?: () => string;
  readonly id?: () => string;
  readonly token?: () => string;
}

interface StoredProfile {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarMediaId: string | null;
  readonly bio: string | null;
  readonly profileVisibility: 'PUBLIC' | 'PRIVATE';
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface StoredDownload {
  readonly tokenHash: string;
  readonly ownerId: string;
  readonly asset: CreatorReleaseAsset;
  readonly expiresAt: string;
}

const CAPABILITIES = {
  creator: 'CREATOR_LAB_ACCESS' as CapabilityCode,
  source: 'CODE_HUB_ACCESS' as CapabilityCode,
  download: 'RELEASE_DOWNLOAD' as CapabilityCode,
};
const SENSITIVE_SEGMENT = /(?:^|\/)(?:\.env(?:\..*)?|id_rsa(?:\.pub)?|id_ed25519(?:\.pub)?|credentials?(?:\..*)?|secrets?(?:\..*)?|.*\.pem|.*\.key)$/iu;
const SECRET_CONTENT = /(?:api[_-]?key|client[_-]?secret|private[_-]?key|authorization\s*:\s*bearer|ghp_[a-z0-9]{20,})/iu;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalTags(values: readonly string[]): readonly string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/gu, ' ');
    if (normalized.length === 0 || normalized.length > 64 || !/^[\p{L}\p{N}][\p{L}\p{N} .+/#_-]*$/u.test(normalized)) {
      throw new CreatorEcosystemError('VALIDATION', 'Project tags and technologies are invalid.');
    }
    unique.add(normalized);
  }
  if (unique.size > 30) throw new CreatorEcosystemError('VALIDATION', 'Too many project tags or technologies.');
  return [...unique];
}

function initialVisibility(projectId: string, now: string): CreatorProjectVisibilitySettings {
  return {
    projectId,
    projectVisibility: 'PRIVATE',
    sourceVisibility: 'PRIVATE',
    downloadVisibility: 'DISABLED',
    demoVisibility: 'DISABLED',
    updatedAt: now,
  };
}

export class CreatorEcosystemService {
  private readonly profiles = new Map<string, StoredProfile>();
  private readonly metadata = new Map<string, CreatorProjectMetadata>();
  private readonly media = new Map<string, CreatorProjectMedia[]>();
  private readonly snapshots = new Map<string, CreatorPublishedProjectSnapshot[]>();
  private readonly assets = new Map<string, CreatorReleaseAsset>();
  private readonly downloads = new Map<string, StoredDownload>();
  private readonly stats = new Map<string, CreatorProjectStats>();
  private readonly publishIdempotency = new Map<string, string>();
  private readonly founderIds: ReadonlySet<string>;
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly token: () => string;

  public constructor(private readonly options: CreatorEcosystemServiceOptions) {
    this.founderIds = new Set(options.founderUserIds ?? []);
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? randomUUID;
    this.token = options.token ?? (() => randomBytes(32).toString('base64url'));
  }

  private requireCreator(principal: AuthenticatedPrincipal): void {
    if (!this.options.entitlements.has(principal, CAPABILITIES.creator)) {
      throw new CreatorEcosystemError('ENTITLEMENT_REQUIRED', 'Creator access is required.');
    }
  }

  private ownedProject(principal: AuthenticatedPrincipal, projectId: string): CreatorProject {
    try {
      return this.options.projects.getOwnedProject(principal.userId, projectId);
    } catch {
      throw new CreatorEcosystemError('NOT_FOUND', 'Project was not found.');
    }
  }

  private profile(ownerId: string): StoredProfile {
    const found = this.profiles.get(ownerId);
    if (found !== undefined) return found;
    const now = this.now();
    const fallback: StoredProfile = {
      userId: ownerId,
      username: `creator-${ownerId.slice(0, 12).replace(/[^A-Za-z0-9_-]/gu, '') || 'profile'}`,
      displayName: 'Creator',
      avatarMediaId: null,
      bio: null,
      profileVisibility: 'PRIVATE',
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.set(ownerId, fallback);
    return fallback;
  }

  private meta(project: CreatorProject): CreatorProjectMetadata {
    const found = this.metadata.get(project.id);
    if (found !== undefined) return found;
    const now = this.now();
    const created: CreatorProjectMetadata = {
      projectId: project.id,
      ownerId: project.ownerId,
      slug: null,
      coverMediaId: null,
      tags: [],
      technologies: [],
      lifecycle: 'DRAFT',
      visibility: initialVisibility(project.id, now),
      updatedAt: now,
    };
    this.metadata.set(project.id, created);
    return created;
  }

  private publicProfile(ownerId: string, allowPrivateProfile = false): CreatorPublicProfile {
    const profile = this.profile(ownerId);
    if (!allowPrivateProfile && profile.profileVisibility !== 'PUBLIC') {
      throw new CreatorEcosystemError('NOT_FOUND', 'Creator profile was not found.');
    }
    const projects = [...this.metadata.values()].filter((item) => item.ownerId === ownerId && item.lifecycle === 'PUBLISHED' && item.visibility.projectVisibility === 'PUBLIC');
    const releases = projects.flatMap((item) => {
      try { return this.options.projects.listOwnedReleases(ownerId, item.projectId).filter((release) => release.status === 'PUBLISHED'); } catch { return []; }
    });
    return {
      userId: ownerId,
      username: profile.username,
      displayName: profile.displayName,
      avatarMediaId: profile.avatarMediaId,
      bio: profile.bio,
      creatorBadge: true,
      founderBadge: this.founderIds.has(ownerId),
      connectedApps: clone(this.options.publicIdentities?.listPublic(ownerId) ?? []),
      projectCount: projects.length,
      releaseCount: releases.length,
      followerCount: this.options.follows?.followerCount?.(ownerId) ?? null,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  private assertPublicProject(project: CreatorProject, metadata: CreatorProjectMetadata): void {
    if (metadata.lifecycle !== 'PUBLISHED' || metadata.visibility.projectVisibility === 'PRIVATE') {
      throw new CreatorEcosystemError('NOT_FOUND', 'Project was not found.');
    }
  }

  private note(projectId: string, patch: Partial<CreatorProjectStats>): void {
    const current = this.stats.get(projectId) ?? { projectId, projectViews: 0, projectSaves: 0, demoOpens: 0, downloads: 0 };
    this.stats.set(projectId, { ...current, ...patch });
  }

  private assertMedia(ownerId: string, mediaId: string | null | undefined): void {
    if (mediaId === undefined || mediaId === null) return;
    if (this.options.media === undefined) throw new CreatorEcosystemError('PROVIDER_UNAVAILABLE', 'Media authorization is not configured.');
    this.options.media.assertOwner({ ownerId, mediaId });
  }

  private scanWorkspace(ownerId: string, projectId: string): void {
    for (const file of this.options.projects.listOwnedFiles(ownerId, projectId)) {
      if (file.kind !== 'FILE') continue;
      if (SENSITIVE_SEGMENT.test(file.path)) throw new CreatorEcosystemError('SECRET_BLOCKED', 'A sensitive file prevents publication.');
      const view = this.options.projects.readOwnedFile(ownerId, projectId, file.path);
      if (view.content !== null && SECRET_CONTENT.test(view.content)) {
        throw new CreatorEcosystemError('SECRET_BLOCKED', 'A potential credential prevents publication.');
      }
    }
  }

  private canReadSource(principal: AuthenticatedPrincipal, project: CreatorProject, meta: CreatorProjectMetadata): boolean {
    if (project.ownerId === principal.userId) return true;
    if (meta.visibility.sourceVisibility === 'PUBLIC') return true;
    return meta.visibility.sourceVisibility === 'ENTITLEMENT_GATED' && this.options.entitlements.has(principal, CAPABILITIES.source);
  }

  private canDownload(principal: AuthenticatedPrincipal, project: CreatorProject, meta: CreatorProjectMetadata): boolean {
    if (project.ownerId === principal.userId) return true;
    if (meta.visibility.downloadVisibility === 'PUBLIC') return true;
    return meta.visibility.downloadVisibility === 'ENTITLEMENT_GATED' && this.options.entitlements.has(principal, CAPABILITIES.download);
  }

  private canOpenDemo(principal: AuthenticatedPrincipal, project: CreatorProject, meta: CreatorProjectMetadata): boolean {
    if (project.ownerId === principal.userId) return true;
    if (meta.visibility.demoVisibility === 'PUBLIC') return true;
    return meta.visibility.demoVisibility === 'ENTITLEMENT_GATED' && this.options.entitlements.has(principal, 'PREVIEW_DEPLOY_ACCESS');
  }

  public updateProfile(
    principal: AuthenticatedPrincipal,
    input: { readonly username?: string | undefined; readonly displayName?: string | undefined; readonly avatarMediaId?: string | null | undefined; readonly bio?: string | null | undefined; readonly profileVisibility?: 'PUBLIC' | 'PRIVATE' | undefined },
  ): CreatorProfile {
    this.requireCreator(principal);
    const current = this.profile(principal.userId);
    if (input.username !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/u.test(input.username)) throw new CreatorEcosystemError('VALIDATION', 'Username is invalid.');
    if (input.displayName !== undefined && (input.displayName.trim().length === 0 || input.displayName.length > 120)) throw new CreatorEcosystemError('VALIDATION', 'Display name is invalid.');
    if (input.bio !== undefined && input.bio !== null && input.bio.length > 1_000) throw new CreatorEcosystemError('VALIDATION', 'Bio is too long.');
    this.assertMedia(principal.userId, input.avatarMediaId);
    const next: StoredProfile = {
      ...current,
      ...(input.username === undefined ? {} : { username: input.username.trim() }),
      ...(input.displayName === undefined ? {} : { displayName: input.displayName.trim() }),
      ...(input.avatarMediaId === undefined ? {} : { avatarMediaId: input.avatarMediaId }),
      ...(input.bio === undefined ? {} : { bio: input.bio }),
      ...(input.profileVisibility === undefined ? {} : { profileVisibility: input.profileVisibility }),
      updatedAt: this.now(),
    };
    this.profiles.set(principal.userId, next);
    this.options.audit?.append({ action: 'PROFILE_WRITE', actorUserId: principal.userId, projectId: null, metadata: { visibility: next.profileVisibility } });
    return { ...this.publicProfile(principal.userId, true), profileVisibility: next.profileVisibility };
  }

  public getProfile(principal: AuthenticatedPrincipal | null, ownerId: string): CreatorProfile | CreatorPublicProfile {
    if (principal?.userId === ownerId) {
      const profile = this.profile(ownerId);
      return { ...this.publicProfile(ownerId, true), profileVisibility: profile.profileVisibility };
    }
    return this.publicProfile(ownerId);
  }

  public getHome(principal: AuthenticatedPrincipal): CreatorHome {
    this.requireCreator(principal);
    const projects = this.options.projects.listOwnedProjects(principal.userId).filter((project) => project.status !== 'DELETED');
    const releases = projects.flatMap((project) => this.options.projects.listOwnedReleases(principal.userId, project.id));
    const profile = this.profile(principal.userId);
    return {
      profile: { ...this.publicProfile(principal.userId, true), profileVisibility: profile.profileVisibility },
      projects: clone(projects),
      draftProjects: clone(projects.filter((project) => this.meta(project).lifecycle === 'DRAFT')),
      publishedProjects: clone(projects.filter((project) => this.meta(project).lifecycle === 'PUBLISHED')),
      releases: clone(releases),
      connectedGitHub: (() => {
        try { return this.options.projects.getGitHubConnection(principal.userId); } catch { return null; }
      })(),
    };
  }

  public updateProjectMetadata(
    principal: AuthenticatedPrincipal,
    projectId: string,
    input: {
      readonly slug?: string | null | undefined;
      readonly coverMediaId?: string | null | undefined;
      readonly tags?: readonly string[] | undefined;
      readonly technologies?: readonly string[] | undefined;
      readonly projectVisibility?: CreatorProjectMetadata['visibility']['projectVisibility'] | undefined;
      readonly sourceVisibility?: CreatorSourceVisibility | undefined;
      readonly downloadVisibility?: CreatorProjectMetadata['visibility']['downloadVisibility'] | undefined;
      readonly demoVisibility?: CreatorProjectMetadata['visibility']['demoVisibility'] | undefined;
    },
  ): CreatorProjectMetadata {
    this.requireCreator(principal);
    const project = this.ownedProject(principal, projectId);
    const current = this.meta(project);
    if (input.slug !== undefined && input.slug !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.slug)) throw new CreatorEcosystemError('VALIDATION', 'Project slug is invalid.');
    this.assertMedia(principal.userId, input.coverMediaId);
    const tags = input.tags === undefined ? current.tags : canonicalTags(input.tags);
    const technologies = input.technologies === undefined ? current.technologies : canonicalTags(input.technologies);
    if (tags.length > 20 || technologies.length > 30) throw new CreatorEcosystemError('VALIDATION', 'Too many project tags or technologies.');
    const visibility: CreatorProjectVisibilitySettings = {
      ...current.visibility,
      ...(input.projectVisibility === undefined ? {} : { projectVisibility: input.projectVisibility }),
      ...(input.sourceVisibility === undefined ? {} : { sourceVisibility: input.sourceVisibility }),
      ...(input.downloadVisibility === undefined ? {} : { downloadVisibility: input.downloadVisibility }),
      ...(input.demoVisibility === undefined ? {} : { demoVisibility: input.demoVisibility }),
      updatedAt: this.now(),
    };
    const next: CreatorProjectMetadata = {
      ...current,
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      ...(input.coverMediaId === undefined ? {} : { coverMediaId: input.coverMediaId }),
      tags,
      technologies,
      visibility,
      updatedAt: this.now(),
    };
    this.metadata.set(projectId, next);
    this.options.audit?.append({ action: 'PROJECT_METADATA_WRITE', actorUserId: principal.userId, projectId, metadata: { projectVisibility: visibility.projectVisibility, sourceVisibility: visibility.sourceVisibility, downloadVisibility: visibility.downloadVisibility, demoVisibility: visibility.demoVisibility } });
    return clone(next);
  }

  public setProjectMedia(principal: AuthenticatedPrincipal, projectId: string, input: { readonly mediaId: string; readonly kind: 'COVER' | 'SCREENSHOT'; readonly caption?: string | null | undefined; readonly position?: number | undefined }): readonly CreatorProjectMedia[] {
    this.requireCreator(principal);
    const project = this.ownedProject(principal, projectId);
    this.assertMedia(project.ownerId, input.mediaId);
    if (input.caption !== undefined && input.caption !== null && input.caption.length > 320) throw new CreatorEcosystemError('VALIDATION', 'Screenshot caption is too long.');
    const existing = this.media.get(projectId) ?? [];
    const item: CreatorProjectMedia = { id: this.id(), projectId, mediaId: input.mediaId, kind: input.kind, caption: input.caption ?? null, position: input.position ?? existing.length };
    const next = [...existing.filter((candidate) => candidate.kind !== 'COVER' || input.kind !== 'COVER'), item]
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
    if (next.filter((candidate) => candidate.kind === 'SCREENSHOT').length > 12) throw new CreatorEcosystemError('VALIDATION', 'A project can have at most twelve screenshots.');
    this.media.set(projectId, next);
    return clone(next);
  }

  public publishProject(principal: AuthenticatedPrincipal, projectId: string, input: { readonly releaseId?: string | null | undefined; readonly idempotencyKey: string }): CreatorPublishedProjectSnapshot {
    this.requireCreator(principal);
    const project = this.ownedProject(principal, projectId);
    const meta = this.meta(project);
    if (meta.visibility.projectVisibility === 'PRIVATE') throw new CreatorEcosystemError('VALIDATION', 'Choose Public or Unlisted project visibility before publishing.');
    const profile = this.profile(project.ownerId);
    if (profile.profileVisibility !== 'PUBLIC') throw new CreatorEcosystemError('VALIDATION', 'Make the Creator profile public before publishing a project.');
    if (input.idempotencyKey.trim().length < 16 || input.idempotencyKey.length > 200) {
      throw new CreatorEcosystemError('VALIDATION', 'A valid idempotency key is required to publish a project.');
    }
    const key = `${principal.userId}:${projectId}:${input.idempotencyKey}`;
    const existingId = this.publishIdempotency.get(key);
    if (existingId !== undefined) {
      const existing = this.snapshots.get(projectId)?.find((snapshot) => snapshot.id === existingId);
      if (existing !== undefined) return clone(existing);
    }
    this.scanWorkspace(project.ownerId, projectId);
    const releases = this.options.projects.listOwnedReleases(project.ownerId, projectId);
    const releaseId = input.releaseId ?? releases.find((release) => release.status === 'PUBLISHED')?.id ?? null;
    if (releaseId !== null && !releases.some((release) => release.id === releaseId && release.status === 'PUBLISHED')) throw new CreatorEcosystemError('VALIDATION', 'A published release is required for this publication.');
    const demoStatus = this.options.demos?.status({ ownerId: project.ownerId, projectId }) ?? 'NOT_AVAILABLE';
    const media = this.media.get(projectId) ?? [];
    const snapshot: CreatorPublishedProjectSnapshot = {
      id: this.id(),
      projectId,
      ownerId: project.ownerId,
      projectName: project.name,
      description: project.description,
      coverMediaId: meta.coverMediaId,
      tags: meta.tags,
      technologies: meta.technologies,
      screenshots: media.filter((item) => item.kind === 'SCREENSHOT'),
      releaseId,
      demoStatus,
      publishedAt: this.now(),
    };
    const nextMeta: CreatorProjectMetadata = { ...meta, lifecycle: 'PUBLISHED', updatedAt: this.now() };
    this.metadata.set(projectId, nextMeta);
    this.snapshots.set(projectId, [...(this.snapshots.get(projectId) ?? []), snapshot]);
    this.publishIdempotency.set(key, snapshot.id);
    this.options.audit?.append({ action: 'PROJECT_PUBLISH', actorUserId: principal.userId, projectId, metadata: { snapshotId: snapshot.id, releaseId: releaseId ?? null } });
    return clone(snapshot);
  }

  public async publishProjectUpdate(principal: AuthenticatedPrincipal, projectId: string, snapshotId: string): Promise<void> {
    this.requireCreator(principal);
    const project = this.ownedProject(principal, projectId);
    const snapshot = this.snapshots.get(projectId)?.find((item) => item.id === snapshotId);
    if (snapshot === undefined || snapshot.ownerId !== project.ownerId) throw new CreatorEcosystemError('NOT_FOUND', 'Project snapshot was not found.');
    if (this.options.social === undefined) throw new CreatorEcosystemError('PROVIDER_UNAVAILABLE', 'Social publishing is not configured.');
    await this.options.social.publishProjectSnapshot({ principal, snapshot: clone(snapshot) });
  }

  public unpublishProject(principal: AuthenticatedPrincipal, projectId: string): CreatorProjectMetadata {
    this.requireCreator(principal);
    const project = this.ownedProject(principal, projectId);
    const meta = this.meta(project);
    const next: CreatorProjectMetadata = { ...meta, lifecycle: 'ACTIVE', visibility: { ...meta.visibility, projectVisibility: 'PRIVATE', updatedAt: this.now() }, updatedAt: this.now() };
    this.metadata.set(projectId, next);
    this.options.audit?.append({ action: 'PROJECT_UNPUBLISH', actorUserId: principal.userId, projectId, metadata: {} });
    return clone(next);
  }

  public getProjectDetail(principal: AuthenticatedPrincipal | null, projectId: string): CreatorProjectDetail {
    let project: CreatorProject | undefined;
    let ownerId: string | undefined;
    for (const meta of this.metadata.values()) if (meta.projectId === projectId) { ownerId = meta.ownerId; break; }
    if (ownerId !== undefined) {
      try { project = this.options.projects.getOwnedProject(ownerId, projectId); } catch { throw new CreatorEcosystemError('NOT_FOUND', 'Project was not found.'); }
    }
    if (project === undefined) throw new CreatorEcosystemError('NOT_FOUND', 'Project was not found.');
    const meta = this.meta(project);
    const owner = principal?.userId === project.ownerId;
    if (!owner) this.assertPublicProject(project, meta);
    const releases = this.options.projects.listOwnedReleases(project.ownerId, project.id).filter((release) => owner || release.status === 'PUBLISHED');
    const snapshots = this.snapshots.get(project.id) ?? [];
    const latestSnapshot = snapshots.at(-1) ?? null;
    if (!owner && latestSnapshot === null) throw new CreatorEcosystemError('NOT_FOUND', 'Published project snapshot was not found.');
    /** Public detail is built from the immutable published snapshot rather
     * than current editable project metadata. Independent visibility settings
     * intentionally remain live authorization controls. */
    const detailProject: CreatorProject = !owner && latestSnapshot !== null
      ? { ...project, name: latestSnapshot.projectName, description: latestSnapshot.description, visibility: 'PUBLISHED' }
      : project;
    const detailMetadata: CreatorProjectMetadata = !owner && latestSnapshot !== null
      ? { ...meta, coverMediaId: latestSnapshot.coverMediaId, tags: latestSnapshot.tags, technologies: latestSnapshot.technologies }
      : meta;
    const viewer = principal === null
      ? { isOwner: false, canViewSource: false, canDownload: false, canOpenDemo: false, saved: null, followingCreator: null }
      : {
          isOwner: owner,
          canViewSource: this.canReadSource(principal, project, meta),
          canDownload: this.canDownload(principal, project, meta),
          canOpenDemo: this.canOpenDemo(principal, project, meta),
          saved: this.options.saves?.isSaved({ principal, projectId: project.id }) ?? null,
          followingCreator: this.options.follows?.isFollowing({ principal, creatorId: project.ownerId }) ?? null,
        };
    this.note(project.id, { projectViews: (this.stats.get(project.id)?.projectViews ?? 0) + 1 });
    this.options.audit?.append({ action: 'PROJECT_VIEW', actorUserId: principal?.userId ?? 'anonymous', projectId: project.id, metadata: { owner } });
    return { project: clone(detailProject), creator: this.publicProfile(project.ownerId, owner), metadata: clone(detailMetadata), latestSnapshot: clone(latestSnapshot), releases: clone(releases), viewer };
  }

  public searchProjects(principal: AuthenticatedPrincipal | null, query: string, limit = 20): readonly CreatorProjectDetail[] {
    const needle = query.trim().toLocaleLowerCase();
    if (needle.length === 0 || needle.length > 200 || limit < 1 || limit > 50) throw new CreatorEcosystemError('VALIDATION', 'Search input is invalid.');
    return [...this.metadata.values()]
      .filter((meta) => meta.lifecycle === 'PUBLISHED' && meta.visibility.projectVisibility === 'PUBLIC')
      .filter((meta) => {
        try {
          const project = this.options.projects.getOwnedProject(meta.ownerId, meta.projectId);
          const profile = this.profile(meta.ownerId);
          return profile.profileVisibility === 'PUBLIC' && `${project.name} ${project.description} ${meta.tags.join(' ')} ${meta.technologies.join(' ')}`.toLocaleLowerCase().includes(needle);
        } catch { return false; }
      })
      .slice(0, limit)
      .map((meta) => this.getProjectDetail(principal, meta.projectId));
  }

  public readSource(principal: AuthenticatedPrincipal, projectId: string, rawPath: string): CreatorProjectSourceFile {
    const path = validateCreatorPath(rawPath);
    const detail = this.getProjectDetail(principal, projectId);
    if (!detail.viewer.canViewSource) throw new CreatorEcosystemError('ENTITLEMENT_REQUIRED', 'Source is not available to this account.');
    const file = this.options.projects.readOwnedFile(detail.project.ownerId, projectId, path);
    if (SENSITIVE_SEGMENT.test(file.path)) throw new CreatorEcosystemError('NOT_FOUND', 'Source file was not found.');
    const state: CreatorProjectSourceFile['state'] = file.content === null ? 'BINARY' : file.sizeBytes > 1_000_000 ? 'TOO_LARGE' : 'TEXT';
    const value: CreatorProjectSourceFile = { projectId, path: file.path, language: file.language, content: state === 'TEXT' ? file.content : null, state };
    this.options.audit?.append({ action: 'SOURCE_READ', actorUserId: principal.userId, projectId, metadata: { path: file.path, state } });
    return value;
  }

  public registerReleaseAsset(principal: AuthenticatedPrincipal, projectId: string, input: { readonly releaseId: string; readonly name: string; readonly sizeBytes: number; readonly checksum: string; readonly contentType: string }): CreatorReleaseAsset {
    this.requireCreator(principal);
    const project = this.ownedProject(principal, projectId);
    if (!this.options.projects.listOwnedReleases(project.ownerId, projectId).some((release) => release.id === input.releaseId)) throw new CreatorEcosystemError('NOT_FOUND', 'Release was not found.');
    if (input.name.length === 0 || input.name.length > 240 || /[\\/\0]/u.test(input.name) || input.sizeBytes < 0 || input.sizeBytes > 1_000_000_000 || !/^[a-f0-9]{64}$/u.test(input.checksum) || input.contentType.length > 160) throw new CreatorEcosystemError('VALIDATION', 'Release asset metadata is invalid.');
    const asset: CreatorReleaseAsset = { id: this.id(), releaseId: input.releaseId, projectId, name: input.name, sizeBytes: input.sizeBytes, checksum: input.checksum, contentType: input.contentType };
    this.assets.set(asset.id, asset);
    return clone(asset);
  }

  public requestDownload(principal: AuthenticatedPrincipal, projectId: string, assetId: string): CreatorProjectDownloadGrant {
    const detail = this.getProjectDetail(principal, projectId);
    if (!detail.viewer.canDownload) throw new CreatorEcosystemError('ENTITLEMENT_REQUIRED', 'Download is not available to this account.');
    const asset = this.assets.get(assetId);
    if (asset === undefined || asset.projectId !== projectId || !detail.releases.some((release) => release.id === asset.releaseId && (release.status === 'PUBLISHED' || detail.viewer.isOwner))) throw new CreatorEcosystemError('NOT_FOUND', 'Release asset was not found.');
    const token = this.token();
    const expiresAt = new Date(Date.parse(this.now()) + 10 * 60 * 1_000).toISOString();
    this.downloads.set(hash(token), { tokenHash: hash(token), ownerId: principal.userId, asset, expiresAt });
    this.note(projectId, { downloads: (this.stats.get(projectId)?.downloads ?? 0) + 1 });
    this.options.audit?.append({ action: 'DOWNLOAD_GRANT', actorUserId: principal.userId, projectId, metadata: { assetId, expiresAt } });
    return { assetId, releaseId: asset.releaseId, downloadToken: token, expiresAt };
  }

  public redeemDownload(principal: AuthenticatedPrincipal, token: string): CreatorReleaseAsset {
    const grant = this.downloads.get(hash(token));
    if (grant === undefined || grant.ownerId !== principal.userId) throw new CreatorEcosystemError('NOT_FOUND', 'Download grant was not found.');
    if (Date.parse(grant.expiresAt) <= Date.parse(this.now())) throw new CreatorEcosystemError('DOWNLOAD_EXPIRED', 'Download grant has expired.');
    return clone(grant.asset);
  }

  public saveProject(principal: AuthenticatedPrincipal, projectId: string, saved: boolean, idempotencyKey: string): boolean {
    const detail = this.getProjectDetail(principal, projectId);
    if (detail.viewer.isOwner) throw new CreatorEcosystemError('VALIDATION', 'A creator cannot save their own project.');
    if (this.options.saves === undefined) throw new CreatorEcosystemError('PROVIDER_UNAVAILABLE', 'Private Save to ME is not configured.');
    const snapshot = detail.latestSnapshot;
    if (snapshot === null) throw new CreatorEcosystemError('NOT_FOUND', 'Published project snapshot was not found.');
    const value = this.options.saves.setSaved({ principal, projectId, snapshotId: snapshot.id, saved, idempotencyKey });
    this.note(projectId, { projectSaves: this.options.saves.aggregateCount?.(projectId) ?? this.stats.get(projectId)?.projectSaves ?? 0 });
    this.options.audit?.append({ action: 'SAVE', actorUserId: principal.userId, projectId, metadata: { saved: value } });
    return value;
  }

  public followCreator(principal: AuthenticatedPrincipal, creatorId: string, followed: boolean, idempotencyKey: string): boolean {
    if (principal.userId === creatorId) throw new CreatorEcosystemError('VALIDATION', 'A creator cannot follow themselves.');
    this.publicProfile(creatorId);
    if (this.options.follows === undefined) throw new CreatorEcosystemError('PROVIDER_UNAVAILABLE', 'Follow service is not configured.');
    const value = this.options.follows.setFollow({ principal, creatorId, followed, idempotencyKey });
    this.options.audit?.append({ action: 'FOLLOW', actorUserId: principal.userId, projectId: null, metadata: { creatorId, followed: value } });
    return value;
  }

  public getStats(principal: AuthenticatedPrincipal, projectId: string): CreatorProjectStats {
    this.requireCreator(principal);
    this.ownedProject(principal, projectId);
    const current = this.stats.get(projectId) ?? { projectId, projectViews: 0, projectSaves: 0, demoOpens: 0, downloads: 0 };
    return clone({ ...current, projectSaves: this.options.saves?.aggregateCount?.(projectId) ?? current.projectSaves });
  }
}

export { CreatorLabEcosystemProjectGateway } from './creator-lab-adapter.js';
