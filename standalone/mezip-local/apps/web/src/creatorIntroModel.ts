import type { CreatorIntroStage } from '@me-zip/shared-types';

import type { ExperienceTier } from './experienceSettings.js';

export const CREATOR_INTRO_PREFERENCE_KEY = 'mezip.creator-intro-preference.v1';
export const CREATOR_INTRO_VERSION = 1;

export interface CreatorIntroPreference {
  readonly version: number;
  readonly seen: boolean;
  readonly disabled: boolean;
}

export const defaultCreatorIntroPreference: CreatorIntroPreference = {
  version: CREATOR_INTRO_VERSION,
  seen: false,
  disabled: false,
};

export interface CreatorIntroStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CreatorIntroPreferenceRead {
  readonly available: boolean;
  readonly preference: CreatorIntroPreference;
}

function isPreference(value: unknown): value is CreatorIntroPreference {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<CreatorIntroPreference>;
  return (
    typeof candidate.version === 'number' &&
    typeof candidate.seen === 'boolean' &&
    typeof candidate.disabled === 'boolean'
  );
}

export function readCreatorIntroPreference(
  storage: CreatorIntroStorage | undefined,
): CreatorIntroPreferenceRead {
  if (storage === undefined) {
    return { available: false, preference: defaultCreatorIntroPreference };
  }
  try {
    const raw = storage.getItem(CREATOR_INTRO_PREFERENCE_KEY);
    if (raw === null)
      return { available: true, preference: defaultCreatorIntroPreference };
    const value: unknown = JSON.parse(raw);
    if (!isPreference(value)) {
      return { available: true, preference: defaultCreatorIntroPreference };
    }
    return {
      available: true,
      preference: {
        version: Number.isSafeInteger(value.version)
          ? value.version
          : CREATOR_INTRO_VERSION,
        seen: value.seen,
        disabled: value.disabled,
      },
    };
  } catch {
    return { available: false, preference: defaultCreatorIntroPreference };
  }
}

export function saveCreatorIntroPreference(
  preference: CreatorIntroPreference,
  storage: CreatorIntroStorage | undefined,
): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(
      CREATOR_INTRO_PREFERENCE_KEY,
      JSON.stringify({ ...preference, version: CREATOR_INTRO_VERSION }),
    );
    return true;
  } catch {
    return false;
  }
}

export function shouldShowCreatorIntro(
  read: CreatorIntroPreferenceRead,
  tier: ExperienceTier,
): boolean {
  return read.available && !read.preference.disabled && tier === 'FULL';
}

export function markCreatorIntroSeen(
  preference: CreatorIntroPreference,
): CreatorIntroPreference {
  return { ...preference, version: CREATOR_INTRO_VERSION, seen: true };
}

export function setCreatorIntroDisabled(
  preference: CreatorIntroPreference,
  disabled: boolean,
): CreatorIntroPreference {
  return {
    ...preference,
    version: CREATOR_INTRO_VERSION,
    seen: true,
    disabled,
  };
}

export type CreatorIntroTransition = 'START' | 'NEXT' | 'CONTINUE' | 'SKIP' | 'FINISH';

const nextStages: Readonly<Record<CreatorIntroStage, CreatorIntroStage>> = {
  IDLE: 'ENTERING',
  ENTERING: 'IDENTITY_CHIP',
  IDENTITY_CHIP: 'STACK_REVEAL',
  STACK_REVEAL: 'CARD_OPENING',
  CARD_OPENING: 'CONTENT_REVEAL',
  CONTENT_REVEAL: 'READY',
  READY: 'READY',
  CONTENT_CLOSING: 'CARD_CLOSING',
  CARD_CLOSING: 'STACK_COLLAPSING',
  STACK_COLLAPSING: 'EXITING',
  EXITING: 'COMPLETE',
  COMPLETE: 'COMPLETE',
};

export function transitionCreatorIntro(
  current: CreatorIntroStage,
  transition: CreatorIntroTransition,
): CreatorIntroStage {
  if (transition === 'START') return current === 'IDLE' ? 'ENTERING' : current;
  if (transition === 'NEXT') return nextStages[current];
  if (transition === 'CONTINUE')
    return current === 'COMPLETE' ? 'COMPLETE' : 'CONTENT_CLOSING';
  if (transition === 'SKIP') return current === 'COMPLETE' ? 'COMPLETE' : 'EXITING';
  return 'COMPLETE';
}

export const creatorIntroEntranceTimeline: readonly {
  readonly stage: CreatorIntroStage;
  readonly delayMs: number;
}[] = [
  { stage: 'ENTERING', delayMs: 80 },
  { stage: 'IDENTITY_CHIP', delayMs: 360 },
  { stage: 'STACK_REVEAL', delayMs: 620 },
  { stage: 'CARD_OPENING', delayMs: 640 },
  { stage: 'CONTENT_REVEAL', delayMs: 640 },
  { stage: 'READY', delayMs: 720 },
];

export const creatorIntroReverseTimeline: readonly {
  readonly stage: CreatorIntroStage;
  readonly delayMs: number;
}[] = [
  { stage: 'CONTENT_CLOSING', delayMs: 0 },
  { stage: 'CARD_CLOSING', delayMs: 180 },
  { stage: 'STACK_COLLAPSING', delayMs: 360 },
  { stage: 'EXITING', delayMs: 540 },
  { stage: 'COMPLETE', delayMs: 740 },
];
