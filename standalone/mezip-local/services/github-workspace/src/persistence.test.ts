import { describe, expect, it } from 'vitest';
import {
  PostgresGitHubWorkspacePersistence,
  type GitHubWorkspaceSqlClient,
  type GitHubWorkspaceStateCipher,
} from './persistence.js';
import type { GitHubWorkspaceOwnerState } from './types.js';

const owner = '00000000-0000-4000-8000-000000000701';
const empty: GitHubWorkspaceOwnerState = {
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
};

class ReversibleCipher implements GitHubWorkspaceStateCipher {
  public readonly productionSafe = true;
  public lastAad = '';
  public async encrypt(input: { readonly plaintext: string; readonly aad: string }) {
    this.lastAad = input.aad;
    return {
      ciphertext: new TextEncoder().encode(input.plaintext),
      keyReference: 'kms://github-workspace',
      keyVersion: 3,
    };
  }
  public async decrypt(input: {
    readonly ciphertext: Uint8Array;
    readonly aad: string;
  }) {
    this.lastAad = input.aad;
    return new TextDecoder().decode(input.ciphertext);
  }
}

describe('PostgresGitHubWorkspacePersistence', () => {
  it('encrypts the complete owner state with owner-bound AAD and restores it', async () => {
    let row: Readonly<Record<string, unknown>> | undefined;
    const client: GitHubWorkspaceSqlClient = {
      query: async <Row extends Readonly<Record<string, unknown>>>(
        sql: string,
        parameters?: readonly unknown[],
      ) => {
        if (sql.includes('INSERT INTO')) {
          row = {
            state_ciphertext: parameters?.[1],
            key_reference: parameters?.[2],
            key_version: parameters?.[3],
          };
          return { rows: [] };
        }
        return { rows: (row === undefined ? [] : [row]) as readonly Row[] };
      },
    };
    const cipher = new ReversibleCipher();
    const repository = new PostgresGitHubWorkspacePersistence(client, cipher);
    await repository.writeOwner(owner, empty);
    expect(cipher.lastAad).toBe(`github-workspace-owner:${owner}`);
    expect(await repository.readOwner(owner)).toEqual(empty);
  });

  it('returns an isolated empty state when no durable row exists', async () => {
    const repository = new PostgresGitHubWorkspacePersistence(
      { query: async () => ({ rows: [] }) },
      new ReversibleCipher(),
    );
    const first = await repository.readOwner(owner);
    const second = await repository.readOwner(owner);
    expect(first).toEqual(empty);
    expect(first).not.toBe(second);
  });

  it('rejects unsafe ciphers and non-UUID durable owners', async () => {
    const unsafe: GitHubWorkspaceStateCipher = {
      productionSafe: false,
      encrypt: async () => ({
        ciphertext: new Uint8Array([1]),
        keyReference: 'kms://unsafe',
        keyVersion: 1,
      }),
      decrypt: async () => '{}',
    };
    expect(
      () =>
        new PostgresGitHubWorkspacePersistence(
          { query: async () => ({ rows: [] }) },
          unsafe,
        ),
    ).toThrow(/production-safe/u);
    const repository = new PostgresGitHubWorkspacePersistence(
      { query: async () => ({ rows: [] }) },
      new ReversibleCipher(),
    );
    await expect(repository.readOwner('user-from-browser')).rejects.toThrow(/UUID/u);
  });
});
