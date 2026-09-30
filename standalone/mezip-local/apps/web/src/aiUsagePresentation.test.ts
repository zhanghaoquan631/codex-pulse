import type {
  AiUsageAppRegistryEntry,
  AiUsageDevice,
  AiUsageOverview,
  AiUsageProviderRegistryEntry,
  AiUsageSession,
} from '@me-zip/shared-types';
import { describe, expect, it } from 'vitest';

import {
  aiUsageAggregateCue,
  aiUsageRangeForPeriod,
  createAiUsageDashboardView,
  formatAiUsageDuration,
} from './aiUsagePresentation.js';

const apps: readonly AiUsageAppRegistryEntry[] = [
  {
    code: 'CHATGPT',
    displayName: 'ChatGPT',
    providerCode: 'OPENAI',
    status: 'ACTIVE',
    allowedDeviceTypes: ['WINDOWS_AGENT', 'BROWSER_EXTENSION'],
  },
];
const providers: readonly AiUsageProviderRegistryEntry[] = [
  { code: 'OPENAI', displayName: 'OpenAI', status: 'ACTIVE' },
];
const devices: readonly AiUsageDevice[] = [
  {
    id: 'device-1',
    deviceType: 'WINDOWS_AGENT',
    label: '我的 Windows 电脑',
    status: 'ACTIVE',
    pairedAt: '2026-08-18T00:00:00.000Z',
    lastSeenAt: '2026-08-18T09:00:00.000Z',
    revokedAt: null,
  },
];
const overview: AiUsageOverview = {
  preferences: {
    enabled: true,
    windowsAgentEnabled: true,
    browserExtensionEnabled: false,
    idleThresholdSeconds: 180,
    timezone: 'Asia/Taipei',
    updatedAt: '2026-08-18T00:00:00.000Z',
  },
  daily: [
    {
      localDay: '2026-08-18',
      timezone: 'Asia/Taipei',
      appCode: 'CHATGPT',
      providerCode: 'OPENAI',
      activeSeconds: 3_720,
      idleSeconds: 60,
      sessionCount: 1,
    },
  ],
  totalActiveSeconds: 3_720,
  totalIdleSeconds: 60,
  deviceCount: 1,
  generatedAt: '2026-08-18T09:00:00.000Z',
};
const sessions: readonly AiUsageSession[] = [
  {
    id: 'session-1',
    serviceId: 'CHATGPT',
    appCode: 'CHATGPT',
    providerCode: 'OPENAI',
    deviceId: 'device-1',
    platform: 'WINDOWS',
    startedAt: '2026-08-18T08:00:00.000Z',
    endedAt: '2026-08-18T09:02:00.000Z',
    activeSeconds: 3_720,
    idleSeconds: 60,
    source: 'WINDOWS_AGENT',
    timezone: 'Asia/Taipei',
    localDay: '2026-08-18',
    status: 'ACTIVE',
    correctedAt: null,
    deletedAt: null,
    createdAt: '2026-08-18T09:02:00.000Z',
    updatedAt: '2026-08-18T09:02:00.000Z',
  },
];

describe('AI Usage presentation boundary', () => {
  it('formats active duration without shaming interpretation', () => {
    expect(formatAiUsageDuration(3_720)).toBe('1 小时 02 分');
    expect(aiUsageAggregateCue(3_720)).toContain('1 小时 02 分');
  });

  it('projects only owner-safe session display fields', () => {
    const view = createAiUsageDashboardView({ overview, apps, providers, devices, sessions });
    expect(view.totalActiveLabel).toBe('1 小时 02 分');
    expect(view.appBreakdown[0]).toMatchObject({ label: 'ChatGPT', activeSeconds: 3_720 });
    expect(view.sessions[0]).toMatchObject({
      appLabel: 'ChatGPT',
      providerLabel: 'OpenAI',
      deviceLabel: '我的 Windows 电脑',
      sourceLabel: 'Windows Agent',
    });
    expect(JSON.stringify(view)).not.toContain('never-render-this');
    expect(JSON.stringify(view)).not.toContain('activityHash');
  });

  it('keeps period requests bounded and local-day explanation server-authoritative', () => {
    const range = aiUsageRangeForPeriod('WEEK', new Date('2026-08-18T12:00:00.000Z'));
    expect(range.from).toBeDefined();
    expect(range.to).toBeDefined();
    expect(Date.parse(range.to ?? '')).toBeGreaterThan(Date.parse(range.from ?? ''));
  });
});
