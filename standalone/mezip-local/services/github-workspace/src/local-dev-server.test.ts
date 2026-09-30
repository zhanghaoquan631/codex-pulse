import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalGitHubWorkspaceServer } from './local-dev-server.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

function listen(server: ReturnType<typeof createLocalGitHubWorkspaceServer>) {
  return new Promise<AddressInfo>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address() as AddressInfo));
  });
}

function close(server: ReturnType<typeof createLocalGitHubWorkspaceServer>) {
  return new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
}

describe('local GitHub Workspace bridge', () => {
  it('fails closed without GitHub App configuration', async () => {
    const server = createLocalGitHubWorkspaceServer({ environment: {} });
    const address = await listen(server);
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/v1/github-workspace/connection`,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: 'GITHUB_CALLBACK_REQUIRES_CONFIGURATION' },
      });
    } finally {
      await close(server);
    }
  });

  it('creates an HttpOnly local owner session and redirects only to GitHub', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mezip-github-server-'));
    temporaryDirectories.push(directory);
    const environment = {
      PUBLIC_APP_URL: 'http://127.0.0.1:5174',
      GITHUB_APP_ID: '12345',
      GITHUB_CLIENT_ID: 'Iv1.test-client',
      GITHUB_CLIENT_SECRET: 'server-only-secret',
      GITHUB_PRIVATE_KEY: 'server-only-private-key',
      GITHUB_WEBHOOK_SECRET: 'server-only-webhook-secret',
      MEZIP_GITHUB_LOCAL_DATA_KEY: randomBytes(32).toString('base64url'),
      MEZIP_GITHUB_DEV_SESSION_SECRET: randomBytes(32).toString('base64url'),
      MEZIP_GITHUB_LOCAL_DATA_FILE: join(directory, 'workspace.enc.json'),
    };
    const server = createLocalGitHubWorkspaceServer({ environment });
    const address = await listen(server);
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/integrations/github/connect`,
        { redirect: 'manual' },
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toMatch(
        /^https:\/\/github\.com\/login\/oauth\/authorize/u,
      );
      expect(response.headers.get('location')).not.toContain('server-only-secret');
      const sessionCookie = response.headers.get('set-cookie');
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Lax');
      expect(sessionCookie).not.toContain('github-user-token');
    } finally {
      await close(server);
    }
  });

  it('bootstraps the stable local owner when checking connection without a cookie', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mezip-github-server-'));
    temporaryDirectories.push(directory);
    const environment = {
      PUBLIC_APP_URL: 'http://127.0.0.1:5174',
      GITHUB_APP_ID: '12345',
      GITHUB_CLIENT_ID: 'Iv1.test-client',
      GITHUB_CLIENT_SECRET: 'server-only-secret',
      GITHUB_PRIVATE_KEY: 'server-only-private-key',
      GITHUB_WEBHOOK_SECRET: 'server-only-webhook-secret',
      MEZIP_GITHUB_LOCAL_DATA_KEY: randomBytes(32).toString('base64url'),
      MEZIP_GITHUB_DEV_SESSION_SECRET: randomBytes(32).toString('base64url'),
      MEZIP_GITHUB_LOCAL_DATA_FILE: join(directory, 'workspace.enc.json'),
    };
    const server = createLocalGitHubWorkspaceServer({ environment });
    const address = await listen(server);
    try {
      const first = await fetch(
        `http://127.0.0.1:${address.port}/v1/github-workspace/connection`,
      );
      expect(first.status).toBe(200);
      expect(first.headers.get('set-cookie')).toContain('HttpOnly');
      expect(await first.text()).toBe('');

      const sessionCookie = first.headers.get('set-cookie')?.split(';')[0];
      expect(sessionCookie).toBeTruthy();
      const second = await fetch(
        `http://127.0.0.1:${address.port}/v1/github-workspace/connection`,
        { headers: { cookie: sessionCookie! } },
      );
      expect(second.status).toBe(200);
      expect(await second.text()).toBe('');
    } finally {
      await close(server);
    }
  });
});
