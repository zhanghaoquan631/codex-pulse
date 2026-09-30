import { describe, expect, it } from 'vitest';

import { toSafeNotificationEnvelope } from './index.js';

describe('notification platform projection', () => {
  it('does not expose a private message body on a device or web notification', () => {
    expect(toSafeNotificationEnvelope({
      userId: 'owner_1',
      channel: 'IOS',
      type: 'MESSAGE',
      title: 'Alice sent a message',
      body: 'private conversation content',
    })).toEqual({
      channel: 'IOS',
      title: 'ME.zip 有一条新提醒',
      body: '打开应用后查看详情',
      notificationType: 'MESSAGE',
    });
  });
});
