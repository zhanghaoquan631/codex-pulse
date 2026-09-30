import type {
  ArchiveSourceLifecycleEvent,
  ArchiveSourceLifecycleSink,
} from '@me-zip/archive';
import type {
  PersonalAIKnowledgeSourceType,
} from '@me-zip/shared-types';

import {
  PersonalAIError,
  type PersonalAIService,
} from './personal-ai.js';

export interface PersonalAIArchiveLifecycleOutcome {
  readonly action: ArchiveSourceLifecycleEvent['action'];
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  /** Derived index data was removed immediately after trash/delete. */
  readonly invalidated: boolean;
  /** A post-commit reindex was queued for a saved/revised/restored source. */
  readonly queuedJobId: string | null;
  /** Personal AI may be off/not consented/not entitled; Archive itself still
   * remains committed and no source body is ever put into this event. */
  readonly skipped: 'NONE' | 'PERSONAL_AI_DISABLED_OR_UNAUTHORIZED';
}

function sourceTypeFor(event: ArchiveSourceLifecycleEvent): PersonalAIKnowledgeSourceType {
  switch (event.sourceType) {
    case 'ENTRY': return 'LIFE';
    case 'HISTORY': return 'HISTORY';
    case 'FITNESS': return 'FITNESS';
    case 'DAILY_PACK': return 'DAILY_PACK';
  }
}

/**
 * Owns the translation between Archive's body-free post-commit event and
 * Personal AI's bounded indexing API.  It is intentionally server-only: the
 * event originates from the Archive repository after persistence, never from
 * an HTTP/Mini/Web request.  Archive receives only the returned sink shape and
 * remains independent of Personal AI.
 */
export function createPersonalAIArchiveLifecycleSink(service: PersonalAIService): ArchiveSourceLifecycleSink {
  return {
    publish(event) {
      service.handleTrustedArchiveLifecycle(event);
    },
  };
}

/** Maps a committed Archive lifecycle event to a result that a production
 * outbox adapter can record.  The method lives outside the HTTP adapter to
 * prevent clients from forging an owner/action lifecycle input. */
export function handlePersonalAIArchiveLifecycle(
  service: PersonalAIService,
  event: ArchiveSourceLifecycleEvent,
): PersonalAIArchiveLifecycleOutcome {
  const sourceType = sourceTypeFor(event);
  const outcome = service.handleTrustedArchiveLifecycle(event);
  return { ...outcome, sourceType };
}

/** Exported solely for a narrow test/composition check; it avoids consumers
 * matching localized error strings while still not revealing Archive content. */
export function isPersonalAIArchiveLifecycleSkippable(error: unknown): boolean {
  return error instanceof PersonalAIError && (
    error.code === 'ENTITLEMENT_REQUIRED' ||
    error.code === 'CONSENT_REQUIRED' ||
    error.code === 'FORBIDDEN'
  );
}
