import type {
  AiUsageAppRegistryEntry,
  AiUsageDailyAggregate,
  AiUsageDevice,
  AiUsageOverview,
  AiUsageProviderRegistryEntry,
  AiUsageSession,
} from '@me-zip/shared-types';

/** The dashboard never needs a prompt, response, URL, window title, activity
 * hash, credential, or user identifier. This deliberately small projection
 * prevents presentation code from becoming a second collection surface. */
export interface AiUsageSessionView {
  readonly id: string;
  readonly appLabel: string;
  readonly providerLabel: string;
  readonly deviceLabel: string;
  readonly sourceLabel: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationLabel: string;
  readonly idleLabel: string;
  readonly stateLabel: string;
  readonly canCorrect: boolean;
  readonly canDelete: boolean;
}

export interface AiUsageBreakdownView {
  readonly code: string;
  readonly label: string;
  readonly activeSeconds: number;
  readonly durationLabel: string;
  readonly sessionCount: number;
}

export interface AiUsageDashboardView {
  readonly totalActiveSeconds: number;
  readonly totalActiveLabel: string;
  readonly totalIdleLabel: string;
  readonly appBreakdown: readonly AiUsageBreakdownView[];
  readonly providerBreakdown: readonly AiUsageBreakdownView[];
  readonly deviceBreakdown: readonly AiUsageBreakdownView[];
  readonly sessionCount: number;
  readonly devices: readonly AiUsageDevice[];
  readonly sessions: readonly AiUsageSessionView[];
  readonly generatedAt: string;
  readonly timezone: string;
}

export const aiUsagePeriods = ['TODAY', 'WEEK', 'MONTH'] as const;
export type AiUsagePeriod = (typeof aiUsagePeriods)[number];

const sourceLabels: Readonly<Record<AiUsageSession['source'], string>> = {
  WINDOWS_AGENT: 'Windows Agent',
  BROWSER_EXTENSION: '浏览器扩展',
  MANUAL: '手动记录',
  MOBILE: '移动端受限记录',
  IMPORT: '导入记录',
};

const statusLabels: Readonly<Record<AiUsageSession['status'], string>> = {
  ACTIVE: '已记录',
  CORRECTED: '已更正',
  DEDUPLICATED: '已去重',
  DELETED: '已删除',
};

export function formatAiUsageDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '时长待服务端确认';
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) return `${hours} 小时 ${String(minutes).padStart(2, '0')} 分`;
  if (minutes > 0) return `${minutes} 分 ${String(remainingSeconds).padStart(2, '0')} 秒`;
  return `${remainingSeconds} 秒`;
}

function labelFor<T extends { readonly code: string; readonly displayName: string }>(
  entries: readonly T[],
  code: string,
): string {
  return entries.find((entry) => entry.code === code)?.displayName ?? '未知注册项';
}

function activeDaily(overview: AiUsageOverview): readonly AiUsageDailyAggregate[] {
  return overview.daily.filter(
    (entry) =>
      Number.isSafeInteger(entry.activeSeconds) &&
      entry.activeSeconds >= 0 &&
      Number.isSafeInteger(entry.sessionCount) &&
      entry.sessionCount >= 0,
  );
}

function aggregateBreakdown(
  daily: readonly AiUsageDailyAggregate[],
  key: 'appCode' | 'providerCode',
  labels: readonly { readonly code: string; readonly displayName: string }[],
): readonly AiUsageBreakdownView[] {
  const grouped = new Map<string, { activeSeconds: number; sessionCount: number }>();
  for (const entry of daily) {
    const code = entry[key];
    const current = grouped.get(code) ?? { activeSeconds: 0, sessionCount: 0 };
    grouped.set(code, {
      activeSeconds: current.activeSeconds + entry.activeSeconds,
      sessionCount: current.sessionCount + entry.sessionCount,
    });
  }
  return [...grouped.entries()]
    .map(([code, value]) => ({
      code,
      label: labelFor(labels, code),
      ...value,
      durationLabel: formatAiUsageDuration(value.activeSeconds),
    }))
    .sort((left, right) => right.activeSeconds - left.activeSeconds || left.label.localeCompare(right.label));
}

function aggregateDevices(
  sessions: readonly AiUsageSession[],
  devices: readonly AiUsageDevice[],
): readonly AiUsageBreakdownView[] {
  const grouped = new Map<string, { activeSeconds: number; sessionCount: number }>();
  for (const session of sessions) {
    if (session.status === 'DELETED' || !Number.isSafeInteger(session.activeSeconds)) continue;
    /** Explicit manual/import sessions do not impersonate a paired device. */
    const deviceKey = session.deviceId ?? 'SELF_ENTERED';
    const current = grouped.get(deviceKey) ?? { activeSeconds: 0, sessionCount: 0 };
    grouped.set(deviceKey, {
      activeSeconds: current.activeSeconds + Math.max(0, session.activeSeconds),
      sessionCount: current.sessionCount + 1,
    });
  }
  return [...grouped.entries()]
    .map(([deviceId, value]) => {
      const device = devices.find((candidate) => candidate.id === deviceId);
      return {
        code: deviceId,
        label:
          device?.label?.trim() ||
          (deviceId === 'SELF_ENTERED'
            ? '手动或导入记录'
            : device?.deviceType === 'BROWSER_EXTENSION'
              ? '浏览器扩展'
              : 'Windows 设备'),
        ...value,
        durationLabel: formatAiUsageDuration(value.activeSeconds),
      };
    })
    .sort((left, right) => right.activeSeconds - left.activeSeconds || left.label.localeCompare(right.label));
}

function sessionView(
  session: AiUsageSession,
  apps: readonly AiUsageAppRegistryEntry[],
  providers: readonly AiUsageProviderRegistryEntry[],
  devices: readonly AiUsageDevice[],
): AiUsageSessionView {
  const device = devices.find((candidate) => candidate.id === session.deviceId);
  return {
    id: session.id,
    appLabel: labelFor(apps, session.appCode),
    providerLabel: labelFor(providers, session.providerCode),
    deviceLabel:
      device?.label?.trim() ||
      (session.deviceId === null
        ? '手动或导入记录'
        : device?.deviceType === 'BROWSER_EXTENSION'
          ? '浏览器扩展'
          : 'Windows 设备'),
    sourceLabel: sourceLabels[session.source],
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationLabel: formatAiUsageDuration(session.activeSeconds),
    idleLabel: formatAiUsageDuration(session.idleSeconds),
    stateLabel: statusLabels[session.status],
    canCorrect: session.status !== 'DELETED',
    canDelete: session.status !== 'DELETED',
  };
}

/** Project server-authorized metadata into a display model. The retained
 * Internal ownership fields never cross the public AI Usage session contract. */
export function createAiUsageDashboardView(input: {
  readonly overview: AiUsageOverview;
  readonly apps: readonly AiUsageAppRegistryEntry[];
  readonly providers: readonly AiUsageProviderRegistryEntry[];
  readonly devices: readonly AiUsageDevice[];
  readonly sessions: readonly AiUsageSession[];
}): AiUsageDashboardView {
  const daily = activeDaily(input.overview);
  const safeSessions = input.sessions.filter(
    (session) =>
      session.status !== 'DELETED' &&
      Number.isSafeInteger(session.activeSeconds) &&
      session.activeSeconds >= 0 &&
      Number.isSafeInteger(session.idleSeconds) &&
      session.id.trim().length > 0,
  );
  const totalActiveSeconds = Math.max(0, input.overview.totalActiveSeconds);
  return {
    totalActiveSeconds,
    totalActiveLabel: formatAiUsageDuration(totalActiveSeconds),
    totalIdleLabel: formatAiUsageDuration(Math.max(0, input.overview.totalIdleSeconds)),
    appBreakdown: aggregateBreakdown(daily, 'appCode', input.apps),
    providerBreakdown: aggregateBreakdown(daily, 'providerCode', input.providers),
    deviceBreakdown: aggregateDevices(safeSessions, input.devices),
    sessionCount: safeSessions.length,
    devices: input.devices,
    sessions: safeSessions
      .map((session) => sessionView(session, input.apps, input.providers, input.devices))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
    generatedAt: input.overview.generatedAt,
    timezone: input.overview.preferences.timezone,
  };
}

/** `from` / `to` are view filters only. The server resolves the authoritative
 * local-midnight bucket using the account timezone. */
export function aiUsageRangeForPeriod(period: AiUsagePeriod, now = new Date()): {
  readonly from: string;
  readonly to: string;
} {
  const end = new Date(now);
  const start = new Date(now);
  if (period === 'WEEK') start.setDate(start.getDate() - 6);
  if (period === 'MONTH') start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** A privacy-safe local cue for Town/Cat. It only depends on an aggregate. */
export function aiUsageAggregateCue(activeSeconds: number): string {
  if (!Number.isFinite(activeSeconds) || activeSeconds <= 0) {
    return '今天还没有 AI 使用记录；是否要从一段专注开始？';
  }
  return `今天已经和 AI 一起工作了 ${formatAiUsageDuration(activeSeconds)}。`;
}
