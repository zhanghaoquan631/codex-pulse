import { describe, expect, it } from 'vitest';

import {
  CREATOR_INTRO_PREFERENCE_KEY,
  creatorIntroReverseTimeline,
  defaultCreatorIntroPreference,
  markCreatorIntroSeen,
  readCreatorIntroPreference,
  setCreatorIntroDisabled,
  shouldShowCreatorIntro,
  transitionCreatorIntro,
} from './creatorIntroModel.js';

describe('creator identity reveal model', () => {
  it('shows only when safe local preference storage, a full tier, and no disable flag are available', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const read = readCreatorIntroPreference(storage);
    expect(shouldShowCreatorIntro(read, 'FULL')).toBe(true);
    expect(shouldShowCreatorIntro(read, 'LITE')).toBe(false);
    expect(shouldShowCreatorIntro(read, 'STATIC')).toBe(false);
    expect(shouldShowCreatorIntro(readCreatorIntroPreference(undefined), 'FULL')).toBe(
      false,
    );
    storage.setItem(
      CREATOR_INTRO_PREFERENCE_KEY,
      JSON.stringify(setCreatorIntroDisabled(defaultCreatorIntroPreference, true)),
    );
    expect(shouldShowCreatorIntro(readCreatorIntroPreference(storage), 'FULL')).toBe(
      false,
    );
  });

  it('persists only low-risk seen/disabled/version preferences', () => {
    expect(markCreatorIntroSeen(defaultCreatorIntroPreference)).toMatchObject({
      seen: true,
      disabled: false,
    });
    expect(setCreatorIntroDisabled(defaultCreatorIntroPreference, true)).toMatchObject({
      seen: true,
      disabled: true,
    });
  });

  it('uses named progressive and reverse-fold states rather than boolean animation flags', () => {
    let state = transitionCreatorIntro('IDLE', 'START');
    for (const expected of [
      'IDENTITY_CHIP',
      'STACK_REVEAL',
      'CARD_OPENING',
      'CONTENT_REVEAL',
      'READY',
    ]) {
      state = transitionCreatorIntro(state, 'NEXT');
      expect(state).toBe(expected);
    }
    expect(transitionCreatorIntro(state, 'CONTINUE')).toBe('CONTENT_CLOSING');
    expect(transitionCreatorIntro('READY', 'SKIP')).toBe('EXITING');
    expect(creatorIntroReverseTimeline.map((item) => item.delayMs)).toEqual([
      0, 180, 360, 540, 740,
    ]);
  });
});
