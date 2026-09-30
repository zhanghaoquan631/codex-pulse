import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EncryptedLocalGitHubWorkspaceStore } from './local-secure-store.js';
import type { GitHubWorkspaceOwnerState } from './types.js';

const emptyState = (): GitHubWorkspaceOwnerState => ({
  connection: null,
  pendingAuthorizations: {},
  repositories: [],
  issues: [],
  pullRequests: [],
  activity: [],
  contributions: null,
  tasks: [],
  snippets: [],
  idempotency: {},
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('EncryptedLocalGitHubWorkspaceStore', () => {
  it('survives restart while keeping owner state and credentials encrypted at rest', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mezip-github-store-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'workspace.enc.json');
    const key = randomBytes(32).toString('base64url');
    const state: GitHubWorkspaceOwnerState = {
      ...emptyState(),
      snippets: [
        {
          id: 'snippet-1',
          source: 'MANUAL',
          sourceUrl: null,
          title: 'private title',
          description: 'private description',
          language: 'TypeScript',
          content: 'private source content',
          tags: [],
          favorite: false,
          createdAt: '2026-08-21T00:00:00.000Z',
          updatedAt: '2026-08-21T00:00:00.000Z',
        },
      ],
    };
    const first = new EncryptedLocalGitHubWorkspaceStore({ filePath, key });
    await first.writeOwner('alice', state);
    await first.put({
      ownerId: 'alice',
      connectionId: 'connection-1',
      accessToken: 'github-user-token',
    });
    const raw = await readFile(filePath, 'utf8');
    expect(raw).not.toContain('private source content');
    expect(raw).not.toContain('github-user-token');

    const restarted = new EncryptedLocalGitHubWorkspaceStore({ filePath, key });
    expect(await restarted.readOwner('alice')).toEqual(state);
    expect(
      await restarted.get({ ownerId: 'alice', connectionId: 'connection-1' }),
    ).toBe('github-user-token');
    await restarted.remove({ ownerId: 'alice', connectionId: 'connection-1' });
    expect(
      await restarted.get({ ownerId: 'alice', connectionId: 'connection-1' }),
    ).toBeNull();
  });

  it('fails closed for the wrong key or invalid key material', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mezip-github-store-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'workspace.enc.json');
    const key = randomBytes(32).toString('base64url');
    const store = new EncryptedLocalGitHubWorkspaceStore({ filePath, key });
    await store.writeOwner('alice', emptyState());
    const wrong = new EncryptedLocalGitHubWorkspaceStore({
      filePath,
      key: randomBytes(32).toString('base64url'),
    });
    await expect(wrong.readOwner('alice')).rejects.toThrow(/could not be opened/u);
    expect(
      () => new EncryptedLocalGitHubWorkspaceStore({ filePath, key: 'weak' }),
    ).toThrow(/32-byte base64url/u);
  });

  it('re-homes a connected random-session owner to the stable local owner', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mezip-github-store-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'workspace.enc.json');
    const key = randomBytes(32).toString('base64url');
    const connectedState: GitHubWorkspaceOwnerState = {
      ...emptyState(),
      connection: {
        id: 'connection-1',
        githubUserId: '123',
        githubLogin: 'tom',
        githubAvatarUrl: null,
        installationId: 'installation-1',
        status: 'CONNECTED',
        repositorySelection: 'SELECTED',
        authorizedRepositoryCount: 1,
        connectedAt: '2026-08-21T00:00:00.000Z',
        updatedAt: '2026-08-21T00:00:00.000Z',
        lastSyncedAt: null,
        syncStatus: 'IDLE',
        rateLimitRemaining: null,
        rateLimitResetAt: null,
      },
    };
    const store = new EncryptedLocalGitHubWorkspaceStore({ filePath, key });
    await store.writeOwner('local-github-owner:random-session', connectedState);
    await store.put({
      ownerId: 'local-github-owner:random-session',
      connectionId: 'connection-1',
      accessToken: 'github-user-token',
    });

    expect(await store.migrateConnectedOwner('local-github-owner:stable-owner')).toBe(true);
    expect(await store.readOwner('local-github-owner:stable-owner')).toEqual(connectedState);
    expect(
      await store.get({
        ownerId: 'local-github-owner:stable-owner',
        connectionId: 'connection-1',
      }),
    ).toBe('github-user-token');
    expect(await store.readOwner('local-github-owner:random-session')).toEqual(emptyState());
  });
});
