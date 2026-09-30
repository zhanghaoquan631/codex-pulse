export const mediaStates = [
  'UPLOAD',
  'QUARANTINE',
  'HASHED',
  'SCANNING',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'DELETED',
] as const;
export type MediaState = (typeof mediaStates)[number];

const mediaTransitions: Readonly<Record<MediaState, readonly MediaState[]>> = {
  UPLOAD: ['QUARANTINE', 'DELETED'],
  QUARANTINE: ['HASHED', 'REJECTED', 'DELETED'],
  HASHED: ['SCANNING', 'REJECTED', 'DELETED'],
  SCANNING: ['APPROVED', 'REJECTED', 'DELETED'],
  APPROVED: ['PUBLISHED', 'DELETED'],
  REJECTED: ['DELETED'],
  PUBLISHED: ['DELETED'],
  DELETED: [],
};

export function canTransitionMedia(from: MediaState, to: MediaState): boolean {
  return mediaTransitions[from].includes(to);
}

export function canIssueDownload(state: MediaState, releasedByOwner: boolean): boolean {
  return state === 'PUBLISHED' && releasedByOwner;
}
