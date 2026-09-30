export type HomeExperienceMode = 'STANDARD' | 'TOWN';
export type MotionPreference = 'AUTO' | 'FULL' | 'REDUCED' | 'OFF';
export type ExperienceTier = 'FULL' | 'LITE' | 'STATIC';

export interface SoundSettings {
  readonly master: boolean;
  readonly backgroundMusic: boolean;
  readonly hover: boolean;
  readonly click: boolean;
  readonly cat: boolean;
  readonly ambient: boolean;
  readonly volume: number;
  readonly muted: boolean;
}

export interface UiExperienceSettings {
  readonly homeMode: HomeExperienceMode;
  readonly catEnabled: boolean;
  readonly ambientEffects: boolean;
  readonly motion: MotionPreference;
  readonly sound: SoundSettings;
}

export const defaultUiExperienceSettings: UiExperienceSettings = {
  homeMode: 'STANDARD',
  catEnabled: true,
  ambientEffects: false,
  motion: 'AUTO',
  sound: {
    master: false,
    backgroundMusic: false,
    hover: false,
    click: false,
    cat: false,
    ambient: false,
    volume: 40,
    muted: false,
  },
};

const storageKey = 'mezip.ui-experience-settings.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isMotionPreference(value: unknown): value is MotionPreference {
  return value === 'AUTO' || value === 'FULL' || value === 'REDUCED' || value === 'OFF';
}

function isHomeExperienceMode(value: unknown): value is HomeExperienceMode {
  return value === 'STANDARD' || value === 'TOWN';
}

function numberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

/**
 * Only low-risk UI preferences are persisted. No auth material, account data,
 * API key, provider credential, entitlement, or private record enters storage.
 */
export function parseUiExperienceSettings(raw: string | null): UiExperienceSettings {
  if (raw === null) return defaultUiExperienceSettings;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null)
      return defaultUiExperienceSettings;
    const candidate = parsed as Partial<UiExperienceSettings>;
    const soundCandidate =
      typeof candidate.sound === 'object' && candidate.sound !== null
        ? (candidate.sound as Partial<SoundSettings>)
        : {};
    const volume = numberInRange(soundCandidate.volume, 0, 100);

    return {
      homeMode: isHomeExperienceMode(candidate.homeMode)
        ? candidate.homeMode
        : defaultUiExperienceSettings.homeMode,
      catEnabled: isBoolean(candidate.catEnabled)
        ? candidate.catEnabled
        : defaultUiExperienceSettings.catEnabled,
      ambientEffects: isBoolean(candidate.ambientEffects)
        ? candidate.ambientEffects
        : defaultUiExperienceSettings.ambientEffects,
      motion: isMotionPreference(candidate.motion)
        ? candidate.motion
        : defaultUiExperienceSettings.motion,
      sound: {
        master: isBoolean(soundCandidate.master)
          ? soundCandidate.master
          : defaultUiExperienceSettings.sound.master,
        backgroundMusic: isBoolean(soundCandidate.backgroundMusic)
          ? soundCandidate.backgroundMusic
          : defaultUiExperienceSettings.sound.backgroundMusic,
        hover: isBoolean(soundCandidate.hover)
          ? soundCandidate.hover
          : defaultUiExperienceSettings.sound.hover,
        click: isBoolean(soundCandidate.click)
          ? soundCandidate.click
          : defaultUiExperienceSettings.sound.click,
        cat: isBoolean(soundCandidate.cat)
          ? soundCandidate.cat
          : defaultUiExperienceSettings.sound.cat,
        ambient: isBoolean(soundCandidate.ambient)
          ? soundCandidate.ambient
          : defaultUiExperienceSettings.sound.ambient,
        volume: volume ?? defaultUiExperienceSettings.sound.volume,
        muted: isBoolean(soundCandidate.muted)
          ? soundCandidate.muted
          : defaultUiExperienceSettings.sound.muted,
      },
    };
  } catch {
    return defaultUiExperienceSettings;
  }
}

export function loadUiExperienceSettings(
  storage?: KeyValueStorage,
): UiExperienceSettings {
  if (storage === undefined) return defaultUiExperienceSettings;
  try {
    return parseUiExperienceSettings(storage.getItem(storageKey));
  } catch {
    return defaultUiExperienceSettings;
  }
}

export function saveUiExperienceSettings(
  settings: UiExperienceSettings,
  storage?: KeyValueStorage,
): void {
  if (storage === undefined) return;
  try {
    storage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    // Storage can be disabled by the browser; the experience still works in memory.
  }
}

export function experienceTier(
  preference: MotionPreference,
  systemPrefersReducedMotion: boolean,
): ExperienceTier {
  if (preference === 'OFF') return 'STATIC';
  if (preference === 'REDUCED') return 'LITE';
  if (preference === 'FULL') return 'FULL';
  return systemPrefersReducedMotion ? 'LITE' : 'FULL';
}

export function updateSoundSetting(
  settings: UiExperienceSettings,
  key: keyof SoundSettings,
  value: boolean | number,
): UiExperienceSettings {
  if (key === 'volume') {
    const volume = numberInRange(value, 0, 100) ?? settings.sound.volume;
    return { ...settings, sound: { ...settings.sound, volume } };
  }
  if (typeof value !== 'boolean') return settings;
  return { ...settings, sound: { ...settings.sound, [key]: value } };
}
