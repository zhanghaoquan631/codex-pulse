import { describe, expect, it } from 'vitest';
import { executeExternalAppLaunch, openOfficialOAuthAuthorization } from './externalIdentityClient.js';

describe('executeExternalAppLaunch', () => {
  it('refuses non-HTTPS launches even if a malformed plan reaches the browser boundary', async () => {
    await expect(executeExternalAppLaunch({ provider: 'X', action: 'OPEN_HTTPS', href: 'javascript:alert(1)', copyText: null, qrMediaId: null, message: '' }))
      .resolves.toContain('无效');
  });

  it('does not treat unsupported plans as a successful connection or launch', async () => {
    await expect(executeExternalAppLaunch({ provider: 'HONOR_OF_KINGS', action: 'UNSUPPORTED', href: null, copyText: null, qrMediaId: null, message: '未验证' }))
      .resolves.toBe('未验证');
  });
});

describe('openOfficialOAuthAuthorization', () => {
  it('rejects non-official OAuth destinations', () => {
    expect(openOfficialOAuthAuthorization('https://evil.example/authorize')).toContain('官方允许列表');
  });
});
