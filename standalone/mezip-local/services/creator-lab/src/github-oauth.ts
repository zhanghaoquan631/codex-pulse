import {
  CreatorLabError,
  type CreatorLabGitHubAuthorizationGateway,
  type CreatorLabGitHubConnector,
} from './index.js';

export interface GitHubCredentialVault {
  put(input: {
    readonly ownerId: string;
    readonly connectionId: string;
    readonly accessToken: string;
  }): Promise<void>;
  get(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<string | null>;
  remove?(input: { readonly ownerId: string; readonly connectionId: string }): Promise<void>;
}

/** Development/test only. Production must inject a durable encrypted vault. */
export class InMemoryGitHubCredentialVault implements GitHubCredentialVault {
  private readonly values = new Map<string, string>();

  public async put(input: {
    readonly ownerId: string;
    readonly connectionId: string;
    readonly accessToken: string;
  }): Promise<void> {
    this.values.set(`${input.ownerId}:${input.connectionId}`, input.accessToken);
  }

  public async get(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<string | null> {
    return this.values.get(`${input.ownerId}:${input.connectionId}`) ?? null;
  }
}

export interface GitHubOAuthConnectorOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly callbackUrl: string;
  readonly credentialVault: GitHubCredentialVault;
  readonly fetcher?: typeof fetch;
  readonly scopes?: readonly string[];
}

function safeCallbackUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub OAuth callback URL is invalid.');
  }
  const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])$/iu.test(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub OAuth callback URL is invalid.');
  }
  return url;
}

function requiredSecret(value: string, name: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2_000) {
    throw new CreatorLabError('GITHUB_NOT_CONFIGURED', `GitHub OAuth ${name} is missing.`);
  }
  return trimmed;
}

function repositoryName(fullName: string): { readonly owner: string; readonly repository: string } {
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?)\/([A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?)$/u.exec(fullName.trim());
  if (match === null) throw new CreatorLabError('VALIDATION', 'GitHub repository name is invalid.');
  return { owner: match[1]!, repository: match[2]! };
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub OAuth returned an invalid response.');
  }
}

/**
 * A server-only GitHub OAuth adapter. It exchanges the short-lived `code`
 * using the client secret and stores the returned access token only in the
 * injected vault. No token, secret, or callback payload enters a public DTO.
 */
export class GitHubOAuthConnector
  implements CreatorLabGitHubAuthorizationGateway, CreatorLabGitHubConnector
{
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly scopes: readonly string[];

  public constructor(private readonly options: GitHubOAuthConnectorOptions) {
    this.clientId = requiredSecret(options.clientId, 'client ID');
    this.clientSecret = requiredSecret(options.clientSecret, 'client secret');
    this.callbackUrl = safeCallbackUrl(options.callbackUrl);
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.scopes = options.scopes ?? ['read:user', 'repo'];
    if (
      typeof this.fetcher !== 'function' ||
      this.scopes.length === 0 ||
      this.scopes.some((scope) => !/^[A-Za-z0-9:_-]{1,80}$/u.test(scope))
    ) {
      throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub OAuth configuration is invalid.');
    }
  }

  public async beginAuthorization(input: {
    readonly ownerId: string;
    readonly state: string;
  }): Promise<{ readonly authorizationUrl: string; readonly expiresAt: string }> {
    if (input.ownerId.trim().length === 0 || input.state.trim().length < 16) {
      throw new CreatorLabError('VALIDATION', 'GitHub authorization request is invalid.');
    }
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.callbackUrl.toString());
    url.searchParams.set('scope', this.scopes.join(' '));
    url.searchParams.set('state', input.state);
    return {
      authorizationUrl: url.toString(),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
  }

  public async completeAuthorization(input: {
    readonly ownerId: string;
    readonly state: string;
    readonly code: string;
    readonly connectionId: string;
  }): Promise<{ readonly accountLabel: string }> {
    if (
      input.ownerId.trim().length === 0 ||
      input.connectionId.trim().length === 0 ||
      input.state.trim().length < 16 ||
      input.code.trim().length === 0
    ) {
      throw new CreatorLabError('VALIDATION', 'GitHub authorization callback is invalid.');
    }
    const tokenResponse = await this.fetcher('https://github.com/login/oauth/access_token', {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: input.code,
        redirect_uri: this.callbackUrl.toString(),
      }),
    });
    if (!tokenResponse.ok) {
      throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub authorization could not be completed.');
    }
    const tokenPayload = await responseJson(tokenResponse);
    const accessToken =
      tokenPayload !== null &&
      typeof tokenPayload === 'object' &&
      typeof (tokenPayload as { readonly access_token?: unknown }).access_token === 'string'
        ? (tokenPayload as { readonly access_token: string }).access_token
        : null;
    if (accessToken === null || accessToken.length === 0 || accessToken.length > 10_000) {
      throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub authorization could not be completed.');
    }
    const userResponse = await this.fetcher('https://api.github.com/user', {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!userResponse.ok) {
      throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub account identity could not be verified.');
    }
    const user = await responseJson(userResponse);
    const accountLabel =
      user !== null &&
      typeof user === 'object' &&
      typeof (user as { readonly login?: unknown }).login === 'string'
        ? (user as { readonly login: string }).login.trim()
        : '';
    if (accountLabel.length === 0 || accountLabel.length > 120) {
      throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub account identity could not be verified.');
    }
    await this.options.credentialVault.put({
      ownerId: input.ownerId,
      connectionId: input.connectionId,
      accessToken,
    });
    return { accountLabel };
  }

  public async importRepository(input: {
    readonly ownerId: string;
    readonly connectionId: string;
    readonly fullName: string;
  }): Promise<readonly { readonly path: string; readonly content: string }[]> {
    const token = await this.options.credentialVault.get({
      ownerId: input.ownerId,
      connectionId: input.connectionId,
    });
    if (token === null) throw new CreatorLabError('NOT_FOUND', 'GitHub connection was not found.');
    const parsed = repositoryName(input.fullName);
    const base = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}`;
    const response = await this.fetcher(`${base}/readme`, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new CreatorLabError('GITHUB_NOT_CONFIGURED', 'GitHub repository could not be imported.');
    }
    const content = await response.text();
    if (content.length > 1_000_000) {
      throw new CreatorLabError('VALIDATION', 'GitHub README exceeds the import limit.');
    }
    return [{ path: 'README.md', content }];
  }
}
