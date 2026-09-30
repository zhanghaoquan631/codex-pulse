import type { InMemoryArchiveRepository } from '@me-zip/archive';
import type { AuthenticatedPrincipal, CommunityMediaReference } from '@me-zip/shared-types';
import { CommunityError, type CommunitySnapshotSource } from './index.js';

/**
 * Adapter from the Phase 3 archive service to the Phase 4 publication seam.
 * It is the only place where Community asks Archive for an original record or
 * media asset, and every call is owner-scoped by the archive repository.
 */
export class ArchiveCommunitySnapshotSource implements CommunitySnapshotSource {
  public constructor(private readonly archive: InMemoryArchiveRepository) {}

  public publish(
    principal: AuthenticatedPrincipal,
    input: {
      readonly sourceEntryId: string;
      readonly sourceRevision?: number;
      readonly selectedFieldKeys?: readonly string[];
    },
  ) {
    try {
      return this.archive.publishSnapshotProjection(
        principal,
        input.sourceEntryId,
        input.sourceRevision,
        input.selectedFieldKeys,
      );
    } catch {
      // Do not leak whether another user's private archive entry exists.
      throw new CommunityError('NOT_FOUND', 'The requested archive record is not available.');
    }
  }

  public read(principal: AuthenticatedPrincipal, archiveSnapshotId: string) {
    try {
      return this.archive.getPublishedSnapshot(principal, archiveSnapshotId);
    } catch {
      // Snapshot reads remain owner-scoped even when a caller guesses an id.
      throw new CommunityError('NOT_FOUND', 'The requested archive snapshot is not available.');
    }
  }

  public resolveMedia(
    principal: AuthenticatedPrincipal,
    mediaIds: readonly string[],
  ): readonly CommunityMediaReference[] {
    return mediaIds.map((mediaId) => {
      let media;
      try {
        media = this.archive.getMedia(principal, mediaId);
      } catch {
        throw new CommunityError('NOT_FOUND', 'The requested media is not available.');
      }
      if (media.status !== 'READY') {
        throw new CommunityError('INVALID_STATE', 'Community media must be READY before publication.');
      }
      if (!media.contentType.startsWith('image/') && !media.contentType.startsWith('video/')) {
        throw new CommunityError('VALIDATION', 'Only image/video media can be published to Community.');
      }
      return {
        mediaId,
        kind: media.contentType.startsWith('video/') ? 'VIDEO' : 'IMAGE',
        altText: null,
      };
    });
  }
}
