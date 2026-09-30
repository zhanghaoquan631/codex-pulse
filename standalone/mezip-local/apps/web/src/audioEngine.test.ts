import { describe, expect, it } from 'vitest';

import { soundEnabledForCue } from './audioEngine.js';
import { defaultUiExperienceSettings } from './experienceSettings.js';

describe('sound cue policy', () => {
  it('keeps all cues disabled by the default settings', () => {
    expect(soundEnabledForCue(defaultUiExperienceSettings.sound, 'hover')).toBe(false);
    expect(soundEnabledForCue(defaultUiExperienceSettings.sound, 'click')).toBe(false);
    expect(soundEnabledForCue(defaultUiExperienceSettings.sound, 'cat')).toBe(false);
  });

  it('requires the master switch, cue switch, volume and unmuted state', () => {
    const sound = {
      ...defaultUiExperienceSettings.sound,
      master: true,
      click: true,
      volume: 40,
    };
    expect(soundEnabledForCue(sound, 'click')).toBe(true);
    expect(soundEnabledForCue({ ...sound, muted: true }, 'click')).toBe(false);
    expect(soundEnabledForCue({ ...sound, volume: 0 }, 'click')).toBe(false);
    expect(soundEnabledForCue({ ...sound, click: false }, 'click')).toBe(false);
  });
});
