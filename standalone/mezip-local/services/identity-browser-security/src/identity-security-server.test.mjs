import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createIdentitySecurityServer, extractEmailOtp, mailSnapshotFromGmailMessage } from './identity-security-server.mjs';

async function withServer(run, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'mezip-identity-security-'));
  const server = createIdentitySecurityServer({ dataDirectory: directory, host: '127.0.0.1', port: 0, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { Origin: 'http://127.0.0.1:5174', ...(options.headers || {}) },
    });
    const body = response.status === 204 ? null : await response.json();
    return { response, body };
  };
  try {
    await run({ directory, request });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('starts with no fabricated accounts or external provider records', async () => {
  await withServer(async ({ request }) => {
    const { response, body } = await request('/v1/identity-security/state');
    assert.equal(response.status, 200);
    assert.equal(body.totals.accounts, 0);
    assert.deepEqual(body.workspaces, []);
    assert.equal(body.policy.gmailData, 'UNAUTHORIZED_UNLESS_OFFICIAL_OAUTH_CONNECTED');
    assert.equal(body.policy.chatgptData, 'NO_CHATGPT_DATA_ACCESS');
  });
});

test('keeps browser profiles bound to their own account workspaces', async () => {
  await withServer(async ({ request }) => {
    const create = async (email) => {
      const { response, body } = await request('/v1/identity-security/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: '个人使用', browser: 'EDGE' }),
      });
      assert.equal(response.status, 201);
      return body.workspace;
    };
    const first = await create('account01@example.com');
    const second = await create('account02@example.com');
    assert.notEqual(first.profile.id, second.profile.id);
    const { response, body } = await request(`/v1/identity-security/workspaces/${first.id}/profile/${second.profile.id}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: 'GMAIL' }),
    });
    assert.equal(response.status, 403);
    assert.equal(body.error.code, 'PROFILE_WORKSPACE_MISMATCH');
  });
});

test('encrypts a TOTP secret in a local vault and never returns it through state', async () => {
  await withServer(async ({ directory, request }) => {
    const created = await request('/v1/identity-security/workspaces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'account01@example.com', purpose: '主账号' }),
    });
    const workspace = created.body.workspace;
    const unlocked = await request('/v1/identity-security/vault/unlock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase: 'a local vault passphrase' }),
    });
    assert.equal(unlocked.response.status, 201);
    const cookie = unlocked.response.headers.get('set-cookie').split(';')[0];
    const secret = 'JBSWY3DPEHPK3PXP';
    const stored = await request(`/v1/identity-security/workspaces/${workspace.id}/2fa/totp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ secret, provider: 'Google Authenticator' }),
    });
    assert.equal(stored.response.status, 204);
    const state = await request('/v1/identity-security/state');
    assert.equal(JSON.stringify(state.body).includes(secret), false);
    assert.equal(readFileSync(join(directory, 'vault.enc.json'), 'utf8').includes(secret), false);
    const code = await request(`/v1/identity-security/workspaces/${workspace.id}/2fa/totp`, { headers: { Cookie: cookie } });
    assert.equal(code.response.status, 200);
    assert.match(code.body.code, /^\d{6}$/u);
    const deleted = await request(`/v1/identity-security/workspaces/${workspace.id}/2fa/totp`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ confirmation: 'DELETE TOTP' }),
    });
    assert.equal(deleted.response.status, 204);
    const afterDeletion = await request(`/v1/identity-security/workspaces/${workspace.id}/2fa/totp`, { headers: { Cookie: cookie } });
    assert.equal(afterDeletion.response.status, 404);
  });
});

test('refuses to claim Gmail is connected without official OAuth configuration', async () => {
  await withServer(async ({ request }) => {
    const created = await request('/v1/identity-security/workspaces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'account01@example.com', purpose: '主账号' }),
    });
    const { response, body } = await request(`/v1/identity-security/workspaces/${created.body.workspace.id}/gmail/connect`, { method: 'POST' });
    assert.equal(response.status, 409);
    assert.equal(body.error.code, 'GMAIL_OAUTH_NOT_CONFIGURED');
  });
});

test('creates an official Gmail OAuth PKCE request without exposing local secrets', async () => {
  const clientSecret = 'local-only-client-secret';
  await withServer(async ({ request }) => {
    const created = await request('/v1/identity-security/workspaces', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'account01@example.com', purpose: '主账号' }),
    });
    const unlocked = await request('/v1/identity-security/vault/unlock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase: 'another local vault passphrase' }),
    });
    const cookie = unlocked.response.headers.get('set-cookie').split(';')[0];
    const connected = await request(`/v1/identity-security/workspaces/${created.body.workspace.id}/gmail/connect`, {
      method: 'POST', headers: { Cookie: cookie },
    });
    assert.equal(connected.response.status, 200);
    assert.match(connected.body.authorizationUrl, /^https:\/\/accounts\.google\.com\//u);
    assert.match(connected.body.authorizationUrl, /code_challenge_method=S256/u);
    assert.equal(connected.body.authorizationUrl.includes(clientSecret), false);
    assert.equal(JSON.stringify(connected.body).includes(clientSecret), false);
  }, {
    environment: {
      GOOGLE_OAUTH_CLIENT_ID: 'local-client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: clientSecret,
      GOOGLE_OAUTH_REDIRECT_URI: 'http://127.0.0.1:4326/v1/identity-security/gmail/callback',
    },
  });
});

test('does not treat dates, prices, or random numbers as email verification codes', () => {
  assert.equal(extractEmailOtp({ subject: 'Payment receipt', preview: '2026-08-23 ¥38.50', from: 'Store' }), null);
  assert.equal(extractEmailOtp({ subject: 'Your verification code is 739251', preview: '', from: 'GitHub <noreply@github.com>' }).code, '739251');
  assert.equal(extractEmailOtp({ subject: '登录验证码：618409', preview: '', from: 'OpenAI' }).code, '618409');
});

test('binds each parsed Gmail record to its exact account workspace', () => {
  const first = mailSnapshotFromGmailMessage({ id: 'workspace_a', email: 'account01@example.com' }, {
    id: 'first', internalDate: String(Date.now()), snippet: 'Your security code is 123456', payload: { headers: [{ name: 'From', value: 'GitHub <noreply@github.com>' }, { name: 'Subject', value: 'Your security code is 123456' }] },
  });
  const second = mailSnapshotFromGmailMessage({ id: 'workspace_b', email: 'account02@example.com' }, {
    id: 'second', internalDate: String(Date.now()), snippet: 'Your security code is 654321', payload: { headers: [{ name: 'From', value: 'GitHub <noreply@github.com>' }, { name: 'Subject', value: 'Your security code is 654321' }] },
  });
  assert.equal(first.workspaceId, 'workspace_a');
  assert.equal(first.recipientEmail, 'account01@example.com');
  assert.equal(second.workspaceId, 'workspace_b');
  assert.equal(second.recipientEmail, 'account02@example.com');
  assert.notEqual(first.otp.code, second.otp.code);
});
