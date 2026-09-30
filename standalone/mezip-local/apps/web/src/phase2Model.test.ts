import { describe, expect, it } from 'vitest';

import {
  appRoutes,
  homeModeForRoute,
  normalizeRoute,
  routeForHomeMode,
} from './appModel.js';
import { catStateForSearch, LocalCatDialogueService } from './catModel.js';
import { MockDevEntitlementProvider, membershipPlans } from './entitlementModel.js';
import {
  defaultUiExperienceSettings,
  experienceTier,
  parseUiExperienceSettings,
  updateSoundSetting,
} from './experienceSettings.js';

describe('Phase 2 Web presentation contracts', () => {
  it('keeps every required shell route reachable and maps both Home modes deterministically', () => {
    expect(appRoutes.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        '/',
        '/town',
        '/life',
        '/timeline',
        '/history',
        '/fitness',
        '/constellation',
        '/community',
        '/messages',
        '/activities',
        '/membership',
        '/benefits',
        '/ai',
        '/creator',
        '/code',
        '/me',
        '/settings',
      ]),
    );
    expect(normalizeRoute('/home')).toBe('/');
    expect(normalizeRoute('/not-a-route')).toBe('/');
    expect(routeForHomeMode('STANDARD')).toBe('/');
    expect(routeForHomeMode('TOWN')).toBe('/town');
    expect(homeModeForRoute('/town')).toBe('TOWN');
    expect(homeModeForRoute('/community')).toBe('STANDARD');
  });

  it('keeps the frozen membership pricing as integer CNY fen and resolves capabilities through a provider', async () => {
    expect(
      membershipPlans.map(({ code, amountFen, priceLabel }) => ({
        code,
        amountFen,
        priceLabel,
      })),
    ).toEqual([
      { code: 'FREE', amountFen: 0, priceLabel: '¥0' },
      { code: 'GO', amountFen: 1_000, priceLabel: '¥10/月' },
      { code: 'PLUS', amountFen: 2_000, priceLabel: '¥20/月' },
      { code: 'PRO', amountFen: 4_000, priceLabel: '¥40/月' },
      { code: 'PRO_MAX', amountFen: 8_000, priceLabel: '¥80/月' },
    ]);
    expect(membershipPlans.every((plan) => Number.isInteger(plan.amountFen))).toBe(
      true,
    );

    const freeProvider = new MockDevEntitlementProvider('FREE');
    await expect(freeProvider.resolve('ARCHIVE_PRIVATE')).resolves.toMatchObject({
      allowed: true,
      source: 'MOCK_DEV',
    });
    await expect(freeProvider.resolve('FOUNDER_DM')).resolves.toMatchObject({
      allowed: false,
      source: 'MOCK_DEV',
    });
  });

  it('keeps Cat local, dismissible and disconnected from AI requests', () => {
    const cat = new LocalCatDialogueService();
    expect(cat.next(() => 0)).toMatchObject({
      state: 'REMINDER',
      text: expect.any(String),
    });
    expect(catStateForSearch(false, '', false)).toBe('IDLE');
    expect(catStateForSearch(true, '', false)).toBe('WELCOME');
    expect(catStateForSearch(true, 'timeline', true)).toBe('HAPPY');
    expect(catStateForSearch(true, 'unknown', false)).toBe('THINKING');
  });

  it('defaults all sound and ambient enhancements off and offers reduced/static fallbacks', () => {
    expect(defaultUiExperienceSettings).toMatchObject({
      catEnabled: true,
      ambientEffects: false,
      sound: {
        master: false,
        backgroundMusic: false,
        hover: false,
        click: false,
        cat: false,
        ambient: false,
      },
    });
    expect(
      updateSoundSetting(defaultUiExperienceSettings, 'click', true).sound.click,
    ).toBe(true);
    expect(
      updateSoundSetting(defaultUiExperienceSettings, 'volume', 141).sound.volume,
    ).toBe(100);
    expect(
      parseUiExperienceSettings('{"ambientEffects":true,"sound":{"master":true}}'),
    ).toMatchObject({
      ambientEffects: true,
      sound: { master: true, click: false },
    });
    expect(experienceTier('AUTO', false)).toBe('FULL');
    expect(experienceTier('AUTO', true)).toBe('LITE');
    expect(experienceTier('REDUCED', false)).toBe('LITE');
    expect(experienceTier('OFF', false)).toBe('STATIC');
  });

});
