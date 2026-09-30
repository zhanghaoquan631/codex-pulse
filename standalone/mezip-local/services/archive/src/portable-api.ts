import type { AuthenticatedPrincipal, JsonObject } from '@me-zip/shared-types';
import type {
  PortableArchiveExportRequest,
  PortableArchiveImportRequest,
} from '@me-zip/shared-types';

import { PortableArchiveError, type PortableArchiveService } from './portable.js';

export interface PortableArchiveApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal: AuthenticatedPrincipal;
  readonly body?: JsonObject;
}

export interface PortableArchiveApiResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function stringValue(value: unknown, required = true): string | undefined {
  if (value === undefined || value === null) {
    if (required)
      throw new PortableArchiveError('VALIDATION', 'A required value is missing.');
    return undefined;
  }
  if (typeof value !== 'string' || value.length > 300_000_000)
    throw new PortableArchiveError('VALIDATION', 'The archive input is invalid.');
  return value;
}
function body(request: PortableArchiveApiRequest): JsonObject {
  return request.body ?? {};
}
function bytesFromBody(request: PortableArchiveApiRequest): Uint8Array {
  return new Uint8Array(
    Buffer.from(stringValue(body(request).archiveBase64) as string, 'base64'),
  );
}
function exportRequest(input: JsonObject): PortableArchiveExportRequest {
  return {
    type: (input.type ?? 'FULL_ARCHIVE') as PortableArchiveExportRequest['type'],
    ...(typeof input.year === 'number' ? { year: input.year } : {}),
    ...(Array.isArray(input.sections)
      ? { sections: input.sections as PortableArchiveExportRequest['sections'] }
      : {}),
    ...(typeof input.includeMedia === 'boolean'
      ? { includeMedia: input.includeMedia }
      : {}),
    ...(typeof input.includeTrash === 'boolean'
      ? { includeTrash: input.includeTrash }
      : {}),
    ...(typeof input.encryptionMode === 'string'
      ? {
          encryptionMode:
            input.encryptionMode as PortableArchiveExportRequest['encryptionMode'],
        }
      : {}),
    ...(typeof input.password === 'string' ? { password: input.password } : {}),
    ...(typeof input.timezone === 'string' ? { timezone: input.timezone } : {}),
    ...(typeof input.locale === 'string' ? { locale: input.locale } : {}),
  } as PortableArchiveExportRequest;
}
function importRequest(input: JsonObject): PortableArchiveImportRequest {
  return {
    ...(Array.isArray(input.sections)
      ? { sections: input.sections as PortableArchiveImportRequest['sections'] }
      : {}),
    ...(typeof input.conflictResolution === 'string'
      ? {
          conflictResolution:
            input.conflictResolution as PortableArchiveImportRequest['conflictResolution'],
        }
      : {}),
    ...(typeof input.restoreMode === 'string'
      ? {
          restoreMode: input.restoreMode as PortableArchiveImportRequest['restoreMode'],
        }
      : {}),
    ...(typeof input.password === 'string' ? { password: input.password } : {}),
  } as PortableArchiveImportRequest;
}
function status(error: unknown): number {
  if (!(error instanceof PortableArchiveError)) return 500;
  if (error.code === 'FORBIDDEN') return 403;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'CONFLICT') return 409;
  if (
    error.code === 'INTEGRITY_FAILED' ||
    error.code === 'ZIP_SLIP' ||
    error.code === 'ZIP_BOMB' ||
    error.code === 'PASSWORD_REQUIRED' ||
    error.code === 'UNSUPPORTED_SCHEMA'
  )
    return 422;
  return 400;
}

export class PortableArchiveApiAdapter {
  public constructor(private readonly service: PortableArchiveService) {}
  public handle(request: PortableArchiveApiRequest): PortableArchiveApiResponse {
    try {
      const segments = request.path
        .replace(/^\/v1\/archive\/?/u, '')
        .split('/')
        .filter(Boolean);
      const [resource, id, action] = segments;
      const input = body(request);
      let data: unknown;
      if (resource === 'exports' && request.method === 'POST' && id === undefined)
        data = this.service.createExport(request.principal, exportRequest(input));
      else if (resource === 'exports' && request.method === 'GET' && id === undefined)
        data = this.service.listExports(request.principal);
      else if (
        resource === 'exports' &&
        id !== undefined &&
        action === undefined &&
        request.method === 'GET'
      )
        data = this.service.getExport(request.principal, id);
      else if (
        resource === 'exports' &&
        id !== undefined &&
        action === 'cancel' &&
        request.method === 'POST'
      )
        data = this.service.cancelExport(request.principal, id);
      else if (
        resource === 'exports' &&
        id !== undefined &&
        action === 'download' &&
        request.method === 'GET'
      )
        data = this.service.downloadExport(
          request.principal,
          id,
          typeof input.token === 'string' ? input.token : undefined,
        );
      else if (
        resource === 'exports' &&
        id !== undefined &&
        action === 'bytes' &&
        request.method === 'GET'
      )
        data = {
          archiveBase64: Buffer.from(
            this.service.readDownload(
              request.principal,
              id,
              stringValue(input.token) as string,
            ),
          ).toString('base64'),
        };
      else if (resource === 'verify' && request.method === 'POST')
        data = this.service.verifyArchive(
          request.principal,
          bytesFromBody(request),
          typeof input.password === 'string' ? input.password : undefined,
        );
      else if (resource === 'imports' && request.method === 'POST' && id === undefined)
        data = this.service.previewImport(
          request.principal,
          bytesFromBody(request),
          importRequest(input),
        );
      else if (
        resource === 'imports' &&
        id !== undefined &&
        action === undefined &&
        request.method === 'GET'
      )
        data = this.service.getImport(request.principal, id);
      else if (
        resource === 'imports' &&
        id !== undefined &&
        action === 'restore' &&
        request.method === 'POST'
      )
        data = this.service.startImport(
          request.principal,
          id,
          bytesFromBody(request),
          importRequest(input),
        );
      else if (resource === 'backups' && request.method === 'GET' && id === undefined)
        data = this.service.listBackups(request.principal);
      else if (resource === 'backups' && request.method === 'POST' && id === undefined)
        data = this.service.createBackup(request.principal, exportRequest(input));
      else if (resource === 'annual' && id !== undefined && request.method === 'GET')
        data = this.service.getAnnualArchive(request.principal, Number(id));
      else if (resource === 'legacy' && id === 'plan' && request.method === 'GET')
        data = this.service.getLegacyPlan(request.principal);
      else if (resource === 'legacy' && id === 'plan' && request.method === 'PATCH')
        data = this.service.updateLegacyPlan(request.principal, input as never);
      else if (resource === 'legacy' && id === 'recipients' && request.method === 'GET')
        data = this.service.listLegacyRecipients(request.principal);
      else if (
        resource === 'legacy' &&
        id === 'recipients' &&
        request.method === 'POST'
      )
        data = this.service.addLegacyRecipient(request.principal, {
          displayName: stringValue(input.displayName) as string,
          contactReference: stringValue(input.contactReference) as string,
        });
      else if (
        resource === 'legacy' &&
        id === 'recipients' &&
        action !== undefined &&
        request.method === 'DELETE'
      )
        data = this.service.removeLegacyRecipient(request.principal, action);
      else if (resource === 'legacy' && id === 'policy' && request.method === 'GET')
        data = this.service.getLegacyPolicy(request.principal);
      else if (resource === 'audit' && request.method === 'GET')
        data = this.service.listAudit(request.principal);
      else
        throw new PortableArchiveError(
          'NOT_FOUND',
          'Portable archive route was not found.',
        );
      return { status: request.method === 'POST' ? 201 : 200, body: { data } };
    } catch (error) {
      const code = error instanceof PortableArchiveError ? error.code : 'INTERNAL';
      const message =
        error instanceof PortableArchiveError
          ? error.message
          : 'Portable archive request failed.';
      return {
        status: status(error),
        body: { error: { code, message, retryable: code === 'CONFLICT' } },
      };
    }
  }
}
