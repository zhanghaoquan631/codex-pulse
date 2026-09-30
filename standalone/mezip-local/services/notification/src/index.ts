/** Delivery targets; provider registration is intentionally outside this domain. */
export type NotificationChannel = 'IN_APP' | 'WEB' | 'WECHAT' | 'IOS' | 'WINDOWS' | 'MOBILE';

export type NotificationPreference =
  | 'MESSAGES'
  | 'REPLIES'
  | 'MENTIONS'
  | 'FOLLOWERS'
  | 'PROJECTS'
  | 'BENEFITS'
  | 'FOUNDER';

export interface NotificationIntent {
  readonly userId: string;
  readonly channel: NotificationChannel;
  readonly type: 'AI_DAILY_RESET' | 'MESSAGE' | 'REPLY' | 'MENTION' | 'FOLLOWER' | 'PROJECT' | 'BENEFIT' | 'SYSTEM';
  readonly title: string;
  readonly body: string;
}

/** A lock-screen projection must not disclose private body/media or membership state. */
export interface SafeNotificationEnvelope {
  readonly channel: Exclude<NotificationChannel, 'IN_APP'>;
  readonly title: 'ME.zip 有一条新提醒';
  readonly body: '打开应用后查看详情';
  readonly notificationType: NotificationIntent['type'];
}

export function toSafeNotificationEnvelope(intent: NotificationIntent): SafeNotificationEnvelope | null {
  if (intent.channel === 'IN_APP') return null;
  return {
    channel: intent.channel,
    title: 'ME.zip 有一条新提醒',
    body: '打开应用后查看详情',
    notificationType: intent.type,
  };
}

export function shouldSendDailyReset(previousDayHadActivity: boolean): boolean {
  return previousDayHadActivity;
}
