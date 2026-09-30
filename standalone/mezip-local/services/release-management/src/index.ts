import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

export const releaseChannels = [
  'DEVELOPMENT',
  'INTERNAL',
  'ALPHA',
  'BETA',
  'PRODUCTION',
] as const;
export type ReleaseChannel = (typeof releaseChannels)[number];
export const testerStatuses = [
  'INVITED',
  'ACTIVE',
  'PAUSED',
  'REMOVED',
  'EXPIRED',
] as const;
export type TesterStatus = (typeof testerStatuses)[number];
export const feedbackCategories = [
  'BUG',
  'UX',
  'FEATURE_REQUEST',
  'PERFORMANCE',
  'CONTENT',
  'OTHER',
] as const;
export type FeedbackCategory = (typeof feedbackCategories)[number];

export class ReleaseManagementError extends Error {
  public constructor(
    public readonly code:
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'VALIDATION'
      | 'MAINTENANCE',
    message: string,
  ) {
    super(message);
    this.name = 'ReleaseManagementError';
  }
}

export interface ReleaseBuild {
  readonly id: string;
  readonly appVersion: string;
  readonly buildNumber: number;
  readonly gitCommit: string;
  readonly channel: ReleaseChannel;
  readonly environment: ReleaseChannel;
  readonly apiVersion: string;
  readonly schemaVersion: string;
  readonly builtAt: string;
  readonly releaseNotes: string;
  readonly knownIssues: readonly string[];
}
export interface TesterEnrollment {
  readonly userId: string;
  readonly channel: Extract<ReleaseChannel, 'INTERNAL' | 'ALPHA' | 'BETA'>;
  readonly status: TesterStatus;
  readonly invitedBy: string;
  readonly invitedAt: string;
  readonly acceptedAt: string | null;
  readonly expiresAt: string | null;
}
export interface FeatureFlag {
  readonly key: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly environment: ReleaseChannel;
  readonly platform: 'WEB' | 'MINI' | 'IOS' | 'ANDROID' | null;
  readonly releaseChannel: ReleaseChannel | null;
  readonly rolloutPercentage: number;
  readonly killSwitch: boolean;
  readonly updatedAt: string;
}
export interface FeedbackRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly category: FeedbackCategory;
  readonly title: string;
  readonly description: string;
  readonly platform: 'WEB' | 'MINI' | 'IOS' | 'ANDROID';
  readonly appVersion: string;
  readonly buildNumber: number;
  readonly route: string | null;
  readonly status:
    | 'NEW'
    | 'TRIAGED'
    | 'IN_PROGRESS'
    | 'RESOLVED'
    | 'CLOSED'
    | 'DUPLICATE'
    | 'WONT_FIX';
  readonly createdAt: string;
}
export interface ReleaseAuditEvent {
  readonly action: string;
  readonly actorId: string;
  readonly at: string;
  readonly target: string;
}
export interface ReleaseTelemetry {
  readonly name:
    | 'app_launch'
    | 'login_success'
    | 'page_open'
    | 'feature_use'
    | 'error'
    | 'crash'
    | 'feedback_submitted';
  readonly platform: string;
  readonly route: string | null;
  readonly appVersion: string;
  readonly buildNumber: number;
  readonly fields: Readonly<Record<string, string | number | boolean>>;
}

const privileged = new Set(['ROOT', 'FOUNDER', 'OPERATOR']);
const sensitive =
  /(?:token|cookie|password|secret|authorization|message.?body|life.?body|prompt|source.?code|private.?search)/iu;
function now(clock: () => Date): string {
  return clock().toISOString();
}
function requireOperator(principal: AuthenticatedPrincipal): void {
  if (!principal.roles.some((role) => privileged.has(role)))
    throw new ReleaseManagementError(
      'FORBIDDEN',
      'Release controls are restricted to authorized operators.',
    );
}
function validChannel(value: string): value is ReleaseChannel {
  return (releaseChannels as readonly string[]).includes(value);
}
function cleanText(value: string, field: string, max: number): string {
  const next = value.trim();
  if (next.length === 0 || next.length > max)
    throw new ReleaseManagementError('VALIDATION', `Invalid ${field}.`);
  return next;
}
function stableBucket(userId: string, key: string): number {
  return (
    Number.parseInt(
      createHash('sha256').update(`${key}:${userId}`).digest('hex').slice(0, 8),
      16,
    ) % 100
  );
}

export class ReleaseManagementService {
  private readonly enrollments = new Map<string, TesterEnrollment>();
  private readonly flags = new Map<string, FeatureFlag>();
  private readonly builds = new Map<number, ReleaseBuild>();
  private readonly feedback = new Map<string, FeedbackRecord>();
  private readonly audit: ReleaseAuditEvent[] = [];
  private maintenance = false;
  public constructor(
    private readonly options: Readonly<{ clock?: () => Date; id?: () => string }> = {},
  ) {}
  private get clock(): () => Date {
    return this.options.clock ?? (() => new Date());
  }
  private get id(): () => string {
    return this.options.id ?? randomUUID;
  }
  public createBuild(
    actor: AuthenticatedPrincipal,
    input: Omit<ReleaseBuild, 'id' | 'builtAt'>,
  ): ReleaseBuild {
    requireOperator(actor);
    if (
      !validChannel(input.channel) ||
      !validChannel(input.environment) ||
      input.buildNumber < 1 ||
      !Number.isInteger(input.buildNumber)
    )
      throw new ReleaseManagementError('VALIDATION', 'Invalid build metadata.');
    if (this.builds.has(input.buildNumber))
      throw new ReleaseManagementError(
        'CONFLICT',
        'Build number is immutable and already exists.',
      );
    const build = Object.freeze({
      ...input,
      id: this.id(),
      builtAt: now(this.clock),
      knownIssues: Object.freeze([...input.knownIssues]),
    });
    this.builds.set(build.buildNumber, build);
    this.record('build_created', actor.userId, build.id);
    return build;
  }
  public enroll(
    actor: AuthenticatedPrincipal,
    userId: string,
    channel: TesterEnrollment['channel'],
    expiresAt: string | null = null,
  ): TesterEnrollment {
    requireOperator(actor);
    if (!userId)
      throw new ReleaseManagementError('VALIDATION', 'Invalid tester enrollment.');
    const record = Object.freeze({
      userId,
      channel,
      status: 'INVITED' as const,
      invitedBy: actor.userId,
      invitedAt: now(this.clock),
      acceptedAt: null,
      expiresAt,
    });
    this.enrollments.set(userId, record);
    this.record('tester_invited', actor.userId, userId);
    return record;
  }
  public acceptEnrollment(principal: AuthenticatedPrincipal): TesterEnrollment {
    const enrollment = this.enrollments.get(principal.userId);
    if (!enrollment || enrollment.status !== 'INVITED')
      throw new ReleaseManagementError('NOT_FOUND', 'No pending tester enrollment.');
    const next = Object.freeze({
      ...enrollment,
      status: 'ACTIVE' as const,
      acceptedAt: now(this.clock),
    });
    this.enrollments.set(principal.userId, next);
    return next;
  }
  public setFlag(
    actor: AuthenticatedPrincipal,
    input: Omit<FeatureFlag, 'updatedAt'>,
  ): FeatureFlag {
    requireOperator(actor);
    if (
      !/^[a-z][a-z0-9_.-]{2,79}$/u.test(input.key) ||
      !validChannel(input.environment) ||
      (input.releaseChannel !== null && !validChannel(input.releaseChannel)) ||
      !Number.isInteger(input.rolloutPercentage) ||
      input.rolloutPercentage < 0 ||
      input.rolloutPercentage > 100
    )
      throw new ReleaseManagementError('VALIDATION', 'Invalid feature flag.');
    const flag = Object.freeze({ ...input, updatedAt: now(this.clock) });
    this.flags.set(flag.key, flag);
    this.record(
      flag.enabled ? 'flag_enabled' : 'flag_disabled',
      actor.userId,
      flag.key,
    );
    return flag;
  }
  public evaluate(
    principal: AuthenticatedPrincipal,
    key: string,
    environment: ReleaseChannel,
    platform: FeatureFlag['platform'],
  ): Readonly<{
    enabled: boolean;
    reason: 'ENABLED' | 'MAINTENANCE' | 'CHANNEL' | 'ROLLOUT' | 'DISABLED';
  }> {
    const flag = this.flags.get(key);
    if (!flag || !flag.enabled) return { enabled: false, reason: 'DISABLED' };
    if (this.maintenance && !principal.roles.includes('ROOT'))
      return { enabled: false, reason: 'MAINTENANCE' };
    if (
      flag.environment !== environment ||
      (flag.platform !== null && flag.platform !== platform)
    )
      return { enabled: false, reason: 'DISABLED' };
    const enrollment = this.enrollments.get(principal.userId);
    const effectiveChannel: ReleaseChannel = principal.roles.some((role) =>
      privileged.has(role),
    )
      ? 'INTERNAL'
      : enrollment?.status === 'ACTIVE'
        ? enrollment.channel
        : 'DEVELOPMENT';
    if (flag.releaseChannel !== null && effectiveChannel !== flag.releaseChannel)
      return { enabled: false, reason: 'CHANNEL' };
    if (stableBucket(principal.userId, key) >= flag.rolloutPercentage)
      return { enabled: false, reason: 'ROLLOUT' };
    return { enabled: true, reason: 'ENABLED' };
  }
  public setMaintenance(actor: AuthenticatedPrincipal, active: boolean): void {
    requireOperator(actor);
    this.maintenance = active;
    this.record(
      active ? 'maintenance_enabled' : 'maintenance_disabled',
      actor.userId,
      'global',
    );
  }
  public submitFeedback(
    principal: AuthenticatedPrincipal | undefined,
    input: Omit<FeedbackRecord, 'id' | 'userId' | 'status' | 'createdAt'>,
  ): FeedbackRecord {
    const category = input.category;
    if (!(feedbackCategories as readonly string[]).includes(category))
      throw new ReleaseManagementError('VALIDATION', 'Invalid feedback category.');
    const result = Object.freeze({
      ...input,
      id: this.id(),
      userId: principal?.userId ?? null,
      title: cleanText(input.title, 'feedback title', 140),
      description: cleanText(input.description, 'feedback description', 4_000),
      route: input.route === null ? null : cleanText(input.route, 'route', 256),
      status: 'NEW' as const,
      createdAt: now(this.clock),
    });
    this.feedback.set(result.id, result);
    return result;
  }
  public telemetry(event: ReleaseTelemetry): ReleaseTelemetry {
    for (const key of Object.keys(event.fields))
      if (sensitive.test(key))
        throw new ReleaseManagementError(
          'VALIDATION',
          'Sensitive telemetry is not permitted.',
        );
    return Object.freeze({
      ...event,
      route: event.route === null ? null : cleanText(event.route, 'route', 256),
      fields: Object.freeze({ ...event.fields }),
    });
  }
  public listFeedback(actor: AuthenticatedPrincipal): readonly FeedbackRecord[] {
    requireOperator(actor);
    return Object.freeze([...this.feedback.values()]);
  }
  public listAudit(actor: AuthenticatedPrincipal): readonly ReleaseAuditEvent[] {
    requireOperator(actor);
    return Object.freeze([...this.audit]);
  }
  public getOwnEnrollment(principal: AuthenticatedPrincipal): TesterEnrollment | null {
    return this.enrollments.get(principal.userId) ?? null;
  }
  private record(action: string, actorId: string, target: string): void {
    this.audit.push(Object.freeze({ action, actorId, target, at: now(this.clock) }));
  }
}
export function createReleaseManagementService(
  options?: ConstructorParameters<typeof ReleaseManagementService>[0],
): ReleaseManagementService {
  return new ReleaseManagementService(options);
}
