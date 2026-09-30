import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { GitHubWorkspaceError } from './github-workspace.js';
import type { GitHubWorkspaceService } from './github-workspace.js';

export interface GitHubWorkspaceApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal: AuthenticatedPrincipal | null;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
}

export interface GitHubWorkspaceApiResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

type JsonObject = Readonly<Record<string, unknown>>;
const object = (value: unknown): JsonObject => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GitHubWorkspaceError('VALIDATION', 'Request body must be an object.');
  }
  return value as JsonObject;
};

function strict(value: unknown, keys: readonly string[]): JsonObject {
  const row = object(value);
  if (Object.keys(row).some((key) => !keys.includes(key))) {
    throw new GitHubWorkspaceError(
      'VALIDATION',
      'Request body contains unsupported fields.',
    );
  }
  return row;
}

function string(value: unknown, name: string, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string')
    throw new GitHubWorkspaceError('VALIDATION', `${name} must be a string.`);
  return value;
}

function boolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean')
    throw new GitHubWorkspaceError('VALIDATION', `${name} must be a boolean.`);
  return value;
}

function number(value: string | undefined, fallback: number): number {
  if (value === undefined || value.length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed))
    throw new GitHubWorkspaceError('VALIDATION', 'Pagination value is invalid.');
  return parsed;
}

function principal(request: GitHubWorkspaceApiRequest): AuthenticatedPrincipal {
  if (request.principal === null)
    throw new GitHubWorkspaceError('UNAUTHORIZED', 'Sign in to use GitHub Workspace.');
  return request.principal;
}

function status(error: GitHubWorkspaceError): number {
  if (error.code === 'UNAUTHORIZED' || error.code === 'AUTH_REQUIRED') return 401;
  if (error.code === 'FORBIDDEN' || error.code === 'PERMISSION_REQUIRED') return 403;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'CONFLICT') return 409;
  if (error.code === 'RATE_LIMITED') return 429;
  if (error.code === 'VALIDATION') return 400;
  if (error.code === 'GITHUB_CALLBACK_REQUIRES_CONFIGURATION') return 503;
  return 502;
}

function response(
  statusCode: number,
  body: unknown,
  headers?: Readonly<Record<string, string>>,
): GitHubWorkspaceApiResponse {
  return headers === undefined
    ? { status: statusCode, body }
    : { status: statusCode, body, headers };
}

// Keep the OAuth callback aligned with the current feature-area entry point.
// The older V3 shell remains available, but returning there made a successful
// authorization appear disconnected from the V6 workspace linked by the app.
const officialWorkspaceReturn = '/github-workspace-v6/index.html';

export class GitHubWorkspaceApiAdapter {
  public constructor(private readonly service: GitHubWorkspaceService) {}

  public async handle(
    request: GitHubWorkspaceApiRequest,
  ): Promise<GitHubWorkspaceApiResponse> {
    try {
      const actor = principal(request);
      const query = request.query ?? {};
      const headers = request.headers ?? {};

      if (
        request.method === 'GET' &&
        request.path === '/api/integrations/github/connect'
      ) {
        const start = await this.service.beginConnection(actor);
        return response(302, null, {
          Location: start.authorizationUrl,
          'Cache-Control': 'no-store',
        });
      }

      if (
        request.method === 'GET' &&
        request.path === '/api/integrations/github/callback'
      ) {
        const state = string(query.state, 'state');
        const code = string(query.code, 'code');
        const installationId = string(query.installation_id, 'installation_id', true);
        await this.service.completeConnection(actor, {
          state: state!,
          code: code!,
          ...(installationId === undefined ? {} : { installationId }),
        });
        return response(302, null, {
          Location: `${officialWorkspaceReturn}?connection=complete`,
          'Cache-Control': 'no-store',
        });
      }

      if (
        request.method === 'GET' &&
        request.path === '/v1/github-workspace/connection'
      ) {
        return response(200, await this.service.getConnection(actor), {
          'Cache-Control': 'no-store',
        });
      }

      if (
        request.method === 'POST' &&
        request.path === '/v1/github-workspace/connection/start'
      ) {
        strict(request.body ?? {}, []);
        return response(200, await this.service.beginConnection(actor), {
          'Cache-Control': 'no-store',
        });
      }

      if (
        request.method === 'POST' &&
        request.path === '/v1/github-workspace/connection/callback'
      ) {
        const body = strict(request.body, ['state', 'code', 'installationId']);
        const state = string(body.state, 'state')!;
        const code = string(body.code, 'code')!;
        const installationId = string(body.installationId, 'installationId', true);
        return response(
          200,
          await this.service.completeConnection(actor, {
            state,
            code,
            ...(installationId === undefined ? {} : { installationId }),
          }),
          { 'Cache-Control': 'no-store' },
        );
      }

      if (
        request.method === 'DELETE' &&
        request.path === '/v1/github-workspace/connection'
      ) {
        await this.service.disconnect(actor);
        return response(204, null);
      }

      if (request.method === 'POST' && request.path === '/v1/github-workspace/sync') {
        strict(request.body ?? {}, []);
        const idempotencyKey = headers['idempotency-key'];
        if (idempotencyKey === undefined)
          throw new GitHubWorkspaceError(
            'VALIDATION',
            'Idempotency-Key header is required.',
          );
        return response(200, await this.service.sync(actor, idempotencyKey), {
          'Cache-Control': 'no-store',
        });
      }

      if (
        request.method === 'GET' &&
        request.path === '/v1/github-workspace/overview'
      ) {
        return response(200, await this.service.getOverview(actor), {
          'Cache-Control': 'private, max-age=30',
        });
      }

      if (
        request.method === 'GET' &&
        request.path === '/v1/github-workspace/repositories'
      ) {
        return response(
          200,
          await this.service.listRepositories(actor, {
            ...(query.q === undefined ? {} : { query: query.q }),
            ...(query.visibility === undefined
              ? {}
              : {
                  visibility: query.visibility as
                    'ALL' | 'PUBLIC' | 'PRIVATE' | 'ARCHIVED' | 'FORKED',
                }),
            ...(query.language === undefined ? {} : { language: query.language }),
            ...(query.sort === undefined
              ? {}
              : { sort: query.sort as 'UPDATED' | 'NAME' | 'STARS' }),
            page: number(query.page, 1),
            limit: number(query.limit, 30),
          }),
        );
      }

      const contentMatch =
        /^\/v1\/github-workspace\/repositories\/([^/]+)\/([^/]+)\/contents$/u.exec(
          request.path,
        );
      if (request.method === 'GET' && contentMatch !== null) {
        return response(
          200,
          await this.service.readRepositoryContent(
            actor,
            `${decodeURIComponent(contentMatch[1]!)}/${decodeURIComponent(contentMatch[2]!)}`,
            query.path ?? '',
          ),
        );
      }

      const commitsMatch =
        /^\/v1\/github-workspace\/repositories\/([^/]+)\/([^/]+)\/commits$/u.exec(
          request.path,
        );
      if (request.method === 'GET' && commitsMatch !== null) {
        return response(
          200,
          await this.service.listCommits(
            actor,
            `${decodeURIComponent(commitsMatch[1]!)}/${decodeURIComponent(commitsMatch[2]!)}`,
            number(query.page, 1),
          ),
        );
      }

      const branchesMatch =
        /^\/v1\/github-workspace\/repositories\/([^/]+)\/([^/]+)\/branches$/u.exec(
          request.path,
        );
      if (request.method === 'GET' && branchesMatch !== null) {
        return response(
          200,
          await this.service.listBranches(
            actor,
            `${decodeURIComponent(branchesMatch[1]!)}/${decodeURIComponent(branchesMatch[2]!)}`,
          ),
        );
      }

      const repositoryMatch =
        /^\/v1\/github-workspace\/repositories\/([^/]+)\/([^/]+)$/u.exec(request.path);
      if (request.method === 'GET' && repositoryMatch !== null) {
        return response(
          200,
          await this.service.getRepository(
            actor,
            `${decodeURIComponent(repositoryMatch[1]!)}/${decodeURIComponent(repositoryMatch[2]!)}`,
          ),
        );
      }

      if (request.method === 'GET' && request.path === '/v1/github-workspace/issues') {
        return response(
          200,
          await this.service.listIssues(actor, {
            ...(query.state === undefined
              ? {}
              : { state: query.state as 'OPEN' | 'CLOSED' | 'ALL' }),
            ...(query.repository === undefined ? {} : { repository: query.repository }),
            ...(query.q === undefined ? {} : { query: query.q }),
          }),
        );
      }

      const issueMatch =
        /^\/v1\/github-workspace\/issues\/([^/]+)\/([^/]+)\/(\d+)$/u.exec(request.path);
      if (request.method === 'GET' && issueMatch !== null) {
        return response(
          200,
          await this.service.getIssue(
            actor,
            `${decodeURIComponent(issueMatch[1]!)}/${decodeURIComponent(issueMatch[2]!)}`,
            Number(issueMatch[3]),
          ),
        );
      }

      if (
        request.method === 'GET' &&
        request.path === '/v1/github-workspace/pull-requests'
      ) {
        return response(
          200,
          await this.service.listPullRequests(actor, {
            ...(query.state === undefined
              ? {}
              : { state: query.state as 'OPEN' | 'CLOSED' | 'MERGED' | 'ALL' }),
            ...(query.repository === undefined ? {} : { repository: query.repository }),
            ...(query.reviewState === undefined
              ? {}
              : {
                  reviewState: query.reviewState as
                    | 'REVIEW_REQUIRED'
                    | 'CHANGES_REQUESTED'
                    | 'APPROVED'
                    | 'UNKNOWN'
                    | 'ALL',
                }),
            ...(query.q === undefined ? {} : { query: query.q }),
          }),
        );
      }

      const pullMatch =
        /^\/v1\/github-workspace\/pull-requests\/([^/]+)\/([^/]+)\/(\d+)$/u.exec(
          request.path,
        );
      if (request.method === 'GET' && pullMatch !== null) {
        return response(
          200,
          await this.service.getPullRequest(
            actor,
            `${decodeURIComponent(pullMatch[1]!)}/${decodeURIComponent(pullMatch[2]!)}`,
            Number(pullMatch[3]),
          ),
        );
      }

      if (request.method === 'GET' && request.path === '/v1/github-workspace/tasks') {
        return response(200, await this.service.listTasks(actor));
      }

      const taskMatch = /^\/v1\/github-workspace\/tasks\/([^/]+)$/u.exec(request.path);
      if (request.method === 'PATCH' && taskMatch !== null) {
        const body = strict(request.body, ['status']);
        const idempotencyKey = headers['idempotency-key'];
        if (idempotencyKey === undefined)
          throw new GitHubWorkspaceError(
            'VALIDATION',
            'Idempotency-Key header is required.',
          );
        return response(
          200,
          await this.service.updateTaskStatus(actor, {
            taskId: decodeURIComponent(taskMatch[1]!),
            status: string(body.status, 'status') as
              'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE',
            idempotencyKey,
          }),
        );
      }

      if (
        request.method === 'GET' &&
        request.path === '/v1/github-workspace/activity'
      ) {
        return response(200, await this.service.listActivity(actor, query.kind));
      }

      if (
        request.method === 'GET' &&
        request.path === '/v1/github-workspace/snippets'
      ) {
        return response(
          200,
          await this.service.listSnippets(actor, {
            ...(query.q === undefined ? {} : { query: query.q }),
            ...(query.language === undefined ? {} : { language: query.language }),
            ...(query.source === undefined
              ? {}
              : {
                  source: query.source as
                    'MEZIP' | 'GITHUB_GIST' | 'REPOSITORY_FILE' | 'MANUAL',
                }),
            ...(query.favorite === undefined
              ? {}
              : { favorite: query.favorite === 'true' }),
          }),
        );
      }

      if (
        request.method === 'POST' &&
        request.path === '/v1/github-workspace/snippets'
      ) {
        const body = strict(request.body, [
          'title',
          'description',
          'language',
          'content',
          'tags',
          'source',
          'sourceUrl',
        ]);
        const idempotencyKey = headers['idempotency-key'];
        if (idempotencyKey === undefined)
          throw new GitHubWorkspaceError(
            'VALIDATION',
            'Idempotency-Key header is required.',
          );
        if (
          body.tags !== undefined &&
          (!Array.isArray(body.tags) ||
            body.tags.some((tag) => typeof tag !== 'string'))
        ) {
          throw new GitHubWorkspaceError('VALIDATION', 'Snippet tags are invalid.');
        }
        return response(
          201,
          await this.service.createSnippet(actor, {
            title: string(body.title, 'title')!,
            language: string(body.language, 'language')!,
            content: string(body.content, 'content')!,
            idempotencyKey,
            ...(body.description === undefined
              ? {}
              : { description: string(body.description, 'description')! }),
            ...(body.tags === undefined ? {} : { tags: body.tags as string[] }),
            ...(body.source === undefined
              ? {}
              : {
                  source: string(body.source, 'source') as
                    'MEZIP' | 'GITHUB_GIST' | 'REPOSITORY_FILE' | 'MANUAL',
                }),
            ...(body.sourceUrl === undefined
              ? {}
              : { sourceUrl: string(body.sourceUrl, 'sourceUrl')! }),
          }),
        );
      }

      const favoriteMatch =
        /^\/v1\/github-workspace\/snippets\/([^/]+)\/favorite$/u.exec(request.path);
      if (request.method === 'PATCH' && favoriteMatch !== null) {
        const body = strict(request.body, ['favorite']);
        return response(
          200,
          await this.service.setSnippetFavorite(
            actor,
            decodeURIComponent(favoriteMatch[1]!),
            boolean(body.favorite, 'favorite'),
          ),
        );
      }

      const snippetMatch = /^\/v1\/github-workspace\/snippets\/([^/]+)$/u.exec(
        request.path,
      );
      if (request.method === 'DELETE' && snippetMatch !== null) {
        await this.service.deleteSnippet(actor, decodeURIComponent(snippetMatch[1]!));
        return response(204, null);
      }

      if (request.method === 'GET' && request.path === '/v1/github-workspace/search') {
        return response(200, await this.service.search(actor, query.q ?? ''));
      }

      throw new GitHubWorkspaceError(
        'NOT_FOUND',
        'GitHub Workspace route was not found.',
      );
    } catch (error) {
      const known =
        error instanceof GitHubWorkspaceError
          ? error
          : new GitHubWorkspaceError(
              'GITHUB_UNAVAILABLE',
              'GitHub Workspace request failed.',
              true,
            );
      return response(
        status(known),
        {
          error: {
            code: known.code,
            message: known.message,
            retryable: known.retryable,
          },
        },
        { 'Cache-Control': 'no-store' },
      );
    }
  }
}
