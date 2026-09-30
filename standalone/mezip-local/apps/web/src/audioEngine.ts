import type { SoundSettings } from './experienceSettings.js';

export type SoundCue = 'hover' | 'click' | 'cat';

const cueKeys: Record<SoundCue, keyof SoundSettings> = {
  hover: 'hover',
  click: 'click',
  cat: 'cat',
};

const cueProfiles: Record<
  SoundCue,
  { readonly start: number; readonly end: number; readonly duration: number }
> = {
  hover: { start: 820, end: 680, duration: 0.045 },
  click: { start: 460, end: 330, duration: 0.09 },
  cat: { start: 720, end: 1180, duration: 0.18 },
};

export function soundEnabledForCue(settings: SoundSettings, cue: SoundCue): boolean {
  return (
    settings.master &&
    !settings.muted &&
    settings.volume > 0 &&
    Boolean(settings[cueKeys[cue]])
  );
}

/**
 * A tiny local oscillator fallback for interaction cues. It deliberately does
 * not load a file, request a network resource, or attempt to imitate a
 * third-party recording. Browsers may reject audio until a user gesture; that
 * failure is intentionally swallowed so it can never block the UI.
 */
export class LocalSoundEngine {
  private context: AudioContext | null = null;

  private lastPlayedAt = new Map<SoundCue, number>();

  play(cue: SoundCue, settings: SoundSettings): void {
    if (!soundEnabledForCue(settings, cue)) return;
    const now = Date.now();
    const previous = this.lastPlayedAt.get(cue) ?? 0;
    if (now - previous < 48) return;
    this.lastPlayedAt.set(cue, now);

    const context = this.getContext();
    if (context === null) return;
    const profile = cueProfiles[cue];
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime;
      const endAt = startAt + profile.duration;
      const peak = Math.min(0.055, Math.max(0.004, settings.volume / 1800));
      oscillator.type = cue === 'cat' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(profile.start, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(profile.end, endAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.02);
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
    } catch {
      // Audio is an enhancement. A missing/blocked AudioContext is a no-op.
    }
  }

  dispose(): void {
    const context = this.context;
    this.context = null;
    this.lastPlayedAt.clear();
    if (context !== null) void context.close().catch(() => undefined);
  }

  private getContext(): AudioContext | null {
    if (this.context !== null) return this.context;
    if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') {
      return null;
    }
    try {
      this.context = new window.AudioContext();
      return this.context;
    } catch {
      return null;
    }
  }
}
