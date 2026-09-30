import {
  creatorAiChangeRequestSchema,
  creatorApplyChangeSchema,
  creatorFileCreateSchema,
  creatorFileDeleteSchema,
  creatorFileMoveSchema,
  creatorFileUpdateSchema,
  creatorGithubAuthorizationCompleteSchema,
  creatorGithubImportSchema,
  creatorGitCommitSchema,
  creatorProjectCreateSchema,
  creatorProjectListQuerySchema,
  creatorReleaseCreateSchema,
  creatorSnapshotSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import {
  CreatorLabError,
  type CreatorLabService,
  type CreatorProjectCreateInput,
} from './index.js';

export interface CreatorLabApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
}

export interface CreatorLabApiResponse {
  readonly status: number;
  readonly body: unknown;
}

function statusFor(error: unknown): number {
  if (!(error instanceof CreatorLabError)) return 500;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'FORBIDDEN') return 403;
  if (error.code === 'ENTITLEMENT_REQUIRED') return 403;
  if (error.code === 'WORKSPACE_CONFLICT') return 409;
  if (error.code === 'PATH_UNSAFE' || error.code === 'SECRET_BLOCKED' || error.code === 'VALIDATION') return 400;
  if (error.code === 'GITHUB_NOT_CONFIGURED') return 503;
  return 500;
}

function safeMessage(error: unknown): string {
  if (error instanceof CreatorLabError) return error.message;
  return 'Creator Lab request could not be completed.';
}

function principal(request: CreatorLabApiRequest): AuthenticatedPrincipal {
  if (request.principal === undefined) throw new CreatorLabError('FORBIDDEN', 'An authenticated user is required.');
  return request.principal;
}

function parse<T>(result: { readonly success: boolean; readonly data?: T; readonly error?: unknown }): T {
  if (!result.success || result.data === undefined) throw new CreatorLabError('VALIDATION', 'Creator Lab request is invalid.');
  return result.data;
}

function projectPath(path: string): RegExpMatchArray | null {
  return /^\/v1\/creator\/projects\/([^/]+)(?:\/(.*))?$/u.exec(path);
}

export class CreatorLabApiAdapter {
  public constructor(private readonly service: CreatorLabService) {}

  public async handle(request: CreatorLabApiRequest): Promise<CreatorLabApiResponse> {
    try {
      const body = await this.route(request);
      return { status: 200, body: { data: body } };
    } catch (error) {
      return { status: statusFor(error), body: { error: { code: error instanceof CreatorLabError ? error.code : 'INTERNAL', message: safeMessage(error), retryable: statusFor(error) >= 500 } } };
    }
  }

  private async route(request: CreatorLabApiRequest): Promise<unknown> {
    const user = principal(request);
    if (request.path === '/v1/creator/projects' && request.method === 'GET') {
      const query = parse(creatorProjectListQuerySchema.safeParse({ cursor: request.query?.cursor, limit: request.query?.limit }));
      return this.service.listProjects(user, { cursor: query.cursor ?? null, limit: query.limit });
    }
    if (request.path === '/v1/creator/projects' && request.method === 'POST') {
      return this.service.createProject(user, parse(creatorProjectCreateSchema.safeParse(request.body ?? {})) as CreatorProjectCreateInput);
    }
    const project = projectPath(request.path);
    if (project === null) {
      if (request.path === '/v1/creator/github/authorization' && request.method === 'GET')
        return this.service.beginGitHubAuthorization(user);
      if (request.path === '/v1/creator/github/authorization/complete' && request.method === 'POST')
        return this.service.completeGitHubAuthorization(
          user,
          parse(creatorGithubAuthorizationCompleteSchema.safeParse(request.body ?? {})),
        );
      if (request.path === '/v1/creator/github/connection' && request.method === 'GET')
        return this.service.getGitHubConnection(user);
      if (request.path === '/v1/creator/github/import' && request.method === 'POST') return this.service.importGitHubRepository(user, parse(creatorGithubImportSchema.safeParse(request.body ?? {})));
      throw new CreatorLabError('NOT_FOUND', 'Creator Lab route was not found.');
    }
    const projectId = project[1]!;
    const subpath = project[2] ?? '';
    if (subpath === '' && request.method === 'GET') return this.service.getProject(user, projectId);
    if (subpath === '' && request.method === 'DELETE') return this.service.trashProject(user, projectId);
    if (subpath === 'files' && request.method === 'GET') {
      const queryPath = request.query?.path;
      return queryPath === undefined ? this.service.listFiles(user, projectId) : this.service.readFile(user, projectId, queryPath);
    }
    if (subpath === 'files' && request.method === 'POST') {
      const input = parse(creatorFileCreateSchema.safeParse(request.body ?? {}));
      if (input.content === undefined) return this.service.createFile(user, projectId, { path: input.path, kind: input.kind });
      return input.expectedVersion === undefined
        ? this.service.createFile(user, projectId, { path: input.path, kind: input.kind, content: input.content })
        : this.service.createFile(user, projectId, { path: input.path, kind: input.kind, content: input.content, expectedVersion: input.expectedVersion });
    }
    if (subpath === 'files' && request.method === 'PATCH') {
      const input = parse(creatorFileUpdateSchema.safeParse(request.body ?? {}));
      return this.service.updateFile(user, projectId, input);
    }
    if (subpath === 'files/move' && request.method === 'POST') return this.service.moveFile(user, projectId, parse(creatorFileMoveSchema.safeParse(request.body ?? {})));
    if (subpath === 'files' && request.method === 'DELETE') {
      const rawPath = request.query?.path;
      if (rawPath === undefined) throw new CreatorLabError('VALIDATION', 'A file path is required.');
      const input = parse(creatorFileDeleteSchema.safeParse(request.body ?? {}));
      return this.service.deleteFile(user, projectId, rawPath, input.expectedVersion);
    }
    if (subpath === 'search' && request.method === 'GET') return this.service.searchFiles(user, projectId, request.query?.q ?? '');
    if (subpath === 'snapshots' && request.method === 'POST') return this.service.createSnapshot(user, projectId, parse(creatorSnapshotSchema.safeParse(request.body ?? {})).reason);
    const snapshot = /^snapshots\/([^/]+)\/restore$/u.exec(subpath);
    if (snapshot !== null && request.method === 'POST') return this.service.restoreSnapshot(user, snapshot[1]!);
    if (subpath === 'git/status' && request.method === 'GET') return this.service.gitStatus(user, projectId);
    if (subpath === 'git/diff' && request.method === 'GET') return this.service.diff(user, projectId);
    if (subpath === 'git/history' && request.method === 'GET') return this.service.gitHistory(user, projectId);
    if (subpath === 'git/commits' && request.method === 'POST') {
      const input = parse(creatorGitCommitSchema.safeParse(request.body ?? {}));
      return this.service.gitCommit(user, projectId, input.message, input.expectedVersion, input.paths);
    }
    if (subpath === 'ai/changes' && request.method === 'POST') {
      const input = parse(creatorAiChangeRequestSchema.safeParse(request.body ?? {}));
      return input.files === undefined
        ? this.service.proposeAIChange(user, projectId, { request: input.request, scopePaths: input.scopePaths, expectedVersion: input.expectedVersion })
        : this.service.proposeAIChange(user, projectId, {
          request: input.request,
          scopePaths: input.scopePaths,
          expectedVersion: input.expectedVersion,
          files: input.files.map((file) => ({
            path: file.path,
            operation: file.operation,
            nextPath: file.nextPath ?? null,
            expectedChecksum: file.expectedChecksum ?? null,
            content: file.content ?? null,
          })),
        });
    }
    const change = /^ai\/changes\/([^/]+)\/(apply|rollback)$/u.exec(subpath);
    if (change !== null && change[2] === 'apply' && request.method === 'POST') return this.service.applyAIChange(user, change[1]!, parse(creatorApplyChangeSchema.safeParse(request.body ?? {})).expectedVersion);
    if (change !== null && change[2] === 'rollback' && request.method === 'POST') return this.service.rollbackAIChange(user, change[1]!);
    if (subpath === 'releases' && request.method === 'GET') return this.service.listReleases(user, projectId);
    if (subpath === 'releases' && request.method === 'POST') {
      const input = parse(creatorReleaseCreateSchema.safeParse(request.body ?? {}));
      return this.service.createRelease(user, projectId, input.sourceCommitId === undefined ? { version: input.version, title: input.title, notes: input.notes, sourceCommitId: null } : { version: input.version, title: input.title, notes: input.notes, sourceCommitId: input.sourceCommitId });
    }
    const release = /^releases\/([^/]+)\/publish$/u.exec(subpath);
    if (release !== null && request.method === 'POST') return this.service.publishRelease(user, release[1]!);
    if (subpath === 'exports' && request.method === 'POST') return this.service.exportProject(user, projectId);
    const exportMatch = /^exports\/([^/]+)$/u.exec(subpath);
    if (exportMatch !== null && request.method === 'GET') return this.service.getExport(user, exportMatch[1]!);
    throw new CreatorLabError('NOT_FOUND', 'Creator Lab route was not found.');
  }
}
