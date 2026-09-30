import type {
  AiUsageAppCode,
  AiUsageProviderCode,
  AuthenticatedPrincipal,
  JsonObject,
} from '@me-zip/shared-types';

import { AiUsageError } from './ai-usage.js';
import type { AiUsageService } from './ai-usage.js';

/** A deliberately small, metadata-only contribution for an existing private
 * Daily Pack. Archive already exposes Daily Pack `stats` in its private
 * Timeline, so a trusted Archive composition can surface this contribution in
 * both places without creating a duplicate raw-activity timeline source. */
export interface AiUsageDailyPackContribution {
  readonly schemaVersion: 'mezip.ai-usage.daily.v1';
  readonly localDay: string;
  readonly timezone: string;
  readonly activeSeconds: number;
  readonly idleSeconds: number;
  readonly sessionCount: number;
  readonly apps: readonly {
    readonly appCode: AiUsageAppCode;
    readonly providerCode: AiUsageProviderCode;
    readonly activeSeconds: number;
    readonly idleSeconds: number;
    readonly sessionCount: number;
  }[];
}

/**
 * Archive owns Daily Pack persistence, revisioning and its private Timeline.
 * This server-only port intentionally receives the authenticated principal
 * instead of an owner id supplied by a caller. Implementations must merge the
 * `aiUsage` key with an existing private Daily Pack rather than replace other
 * Daily Pack statistics.
 */
export interface AiUsageDailyPackPort {
  mergeAiUsageDailyPack(
    principal: AuthenticatedPrincipal,
    contribution: AiUsageDailyPackContribution,
  ): void | Promise<void>;
}

function assertLocalDay(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new AiUsageError('VALIDATION', 'AI Usage Daily Pack day is invalid.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AiUsageError('VALIDATION', 'AI Usage Daily Pack day is invalid.');
  }
}

/** A safe `DailyPack.stats` fragment. It includes only aggregate durations and
 * app/provider registry codes; prompts, response content, activity hashes,
 * device credentials, URLs and user identifiers cannot enter this shape. */
export function toAiUsageDailyPackStats(
  contribution: AiUsageDailyPackContribution,
): JsonObject {
  return {
    aiUsage: {
      schemaVersion: contribution.schemaVersion,
      localDay: contribution.localDay,
      timezone: contribution.timezone,
      activeSeconds: contribution.activeSeconds,
      idleSeconds: contribution.idleSeconds,
      sessionCount: contribution.sessionCount,
      apps: contribution.apps.map((entry) => ({
        appCode: entry.appCode,
        providerCode: entry.providerCode,
        activeSeconds: entry.activeSeconds,
        idleSeconds: entry.idleSeconds,
        sessionCount: entry.sessionCount,
      })),
    },
  };
}

/**
 * Composition seam between Phase 7 and the private Archive service. It never
 * reads an Archive record or accepts client ownership; it turns the
 * server-authorized aggregate into a narrow contribution that Archive may
 * merge into its Daily Pack. Because Archive's private Timeline already
 * exposes Daily Pack stats, no new public timeline source is created.
 */
export class AiUsageArchiveIntegration {
  public constructor(private readonly usage: AiUsageService) {}

  public buildDailyPackContribution(
    principal: AuthenticatedPrincipal,
    localDay: string,
  ): AiUsageDailyPackContribution | null {
    assertLocalDay(localDay);
    const overview = this.usage.getOverview(principal);
    const rows = overview.daily.filter((entry) => entry.localDay === localDay);
    if (rows.length === 0) return null;
    return {
      schemaVersion: 'mezip.ai-usage.daily.v1',
      localDay,
      timezone: overview.preferences.timezone,
      activeSeconds: rows.reduce((total, entry) => total + entry.activeSeconds, 0),
      idleSeconds: rows.reduce((total, entry) => total + entry.idleSeconds, 0),
      sessionCount: rows.reduce((total, entry) => total + entry.sessionCount, 0),
      apps: rows
        .map((entry) => ({
          appCode: entry.appCode,
          providerCode: entry.providerCode,
          activeSeconds: entry.activeSeconds,
          idleSeconds: entry.idleSeconds,
          sessionCount: entry.sessionCount,
        }))
        .sort((left, right) => left.appCode.localeCompare(right.appCode)),
    };
  }

  public async mergeIntoDailyPack(
    principal: AuthenticatedPrincipal,
    localDay: string,
    port: AiUsageDailyPackPort,
  ): Promise<AiUsageDailyPackContribution | null> {
    const contribution = this.buildDailyPackContribution(principal, localDay);
    if (contribution === null) return null;
    await port.mergeAiUsageDailyPack(principal, contribution);
    return contribution;
  }
}
