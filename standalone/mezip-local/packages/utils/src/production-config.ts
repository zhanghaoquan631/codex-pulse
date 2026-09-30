/**
 * Server-composition configuration contract.
 *
 * It accepts data instead of reading `process.env` so no browser, Mini Program
 * or test can silently select a production dependency. The bootstrap layer is
 * responsible for passing environment variables or secret-manager references.
 */
export const MEZIP_DEPLOYMENT_ENVIRONMENTS = [
  'DEVELOPMENT',
  'TEST',
  'STAGING',
  'PRODUCTION',
] as const;

export type MezipDeploymentEnvironment = (typeof MEZIP_DEPLOYMENT_ENVIRONMENTS)[number];

export type ProductionConfigIssueCode =
  | 'INVALID_ENVIRONMENT'
  | 'MISSING_PUBLIC_APP_ORIGIN'
  | 'MISSING_API_ORIGIN'
  | 'MISSING_DATABASE_REFERENCE'
  | 'MISSING_QUEUE_REFERENCE'
  | 'MISSING_REQUIRED_SECRET_REFERENCE'
  | 'MISSING_STORAGE_CONFIGURATION'
  | 'INVALID_PUBLIC_ORIGIN'
  | 'INVALID_API_ORIGIN'
  | 'INVALID_ALLOWED_ORIGIN'
  | 'INVALID_CALLBACK_URL'
  | 'INVALID_STORAGE_ENDPOINT'
  | 'INVALID_STORAGE_BUCKET'
  | 'INVALID_SECRET_REFERENCE'
  | 'LOCALHOST_IN_PRODUCTION'
  | 'DEVELOPMENT_DATABASE_IN_PRODUCTION'
  | 'MOCK_PROVIDER_IN_PRODUCTION';

export interface ProductionConfigIssue {
  readonly code: ProductionConfigIssueCode;
  /** Safe field label only; never includes the submitted value. */
  readonly field: string;
}

export interface MezipProductionConfigInput {
  readonly environment?: unknown;
  readonly publicAppOrigin?: unknown;
  readonly apiOrigin?: unknown;
  readonly allowedOrigins?: unknown;
  readonly callbackUrls?: unknown;
  readonly databaseUrlReference?: unknown;
  readonly queueUrlReference?: unknown;
  readonly storageEndpoint?: unknown;
  readonly storageBucket?: unknown;
  readonly secretReferences?: unknown;
  readonly providerModes?: unknown;
}

export interface ValidatedProductionConfig {
  readonly environment: 'PRODUCTION';
  readonly publicAppOrigin: string;
  readonly apiOrigin: string;
  readonly allowedOrigins: readonly string[];
  readonly callbackUrls: readonly string[];
  readonly databaseUrlReference: string;
  readonly queueUrlReference: string;
  readonly storageEndpoint: string;
  readonly storageBucket: string;
  /** These are opaque `vault://`, `kms://` or `secret://` references only. */
  readonly secretReferences: Readonly<Record<string, string>>;
}

export class ProductionConfigError extends Error {
  public readonly issues: readonly ProductionConfigIssue[];

  public constructor(issues: readonly ProductionConfigIssue[]) {
    super('Production configuration is invalid.');
    this.name = 'ProductionConfigError';
    this.issues = issues;
  }
}

const requiredSecretNames = [
  'AUTH_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
] as const;

function environment(value: unknown): MezipDeploymentEnvironment | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  return MEZIP_DEPLOYMENT_ENVIRONMENTS.includes(
    normalized as MezipDeploymentEnvironment,
  )
    ? (normalized as MezipDeploymentEnvironment)
    : undefined;
}

function hostname(value: string): string {
  return value.replace(/^\[/u, '').replace(/\]$/u, '').toLowerCase();
}

function isIpv4Private(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part)))
    return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return false;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second !== undefined && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isPublicHost(value: string): boolean {
  const host = hostname(value);
  return (
    host.length > 0 &&
    !host.includes(':') &&
    host !== 'localhost' &&
    !host.endsWith('.localhost') &&
    host !== 'local' &&
    !host.endsWith('.local') &&
    !isIpv4Private(host)
  );
}

function parseHttpsOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== '' ||
      !isPublicHost(url.hostname)
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function parseCallbackUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== '' ||
      !isPublicHost(url.hostname)
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function list(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string')
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  return [];
}

function secretReference(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const normalized = value.trim();
  return /^(?:vault|kms|secret):\/\/[A-Za-z0-9._/-]+$/u.test(normalized)
    ? normalized
    : undefined;
}

function references(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  const normalized: Record<string, string> = {};
  for (const [name, reference] of entries) {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/u.test(name)) return undefined;
    const parsed = secretReference(reference);
    if (parsed === undefined) return undefined;
    normalized[name] = parsed;
  }
  return normalized;
}

function productionProviderModesAreSafe(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      typeof entry === 'string' &&
      !/(?:^|[_-])(?:mock|fake|local[_-]?deterministic)(?:$|[_-])/iu.test(entry),
  );
}

/**
 * Returns validated, non-secret configuration or throws without echoing a
 * potentially sensitive raw value. Production cannot inherit localhost,
 * development database or mock-provider values from an implicit default.
 */
export function validateProductionConfig(
  input: MezipProductionConfigInput,
): ValidatedProductionConfig {
  const issues: ProductionConfigIssue[] = [];
  if (environment(input.environment) !== 'PRODUCTION') {
    issues.push({ code: 'INVALID_ENVIRONMENT', field: 'environment' });
  }

  const publicAppOrigin = parseHttpsOrigin(input.publicAppOrigin);
  if (publicAppOrigin === undefined) {
    issues.push({ code: 'MISSING_PUBLIC_APP_ORIGIN', field: 'publicAppOrigin' });
  }
  const apiOrigin = parseHttpsOrigin(input.apiOrigin);
  if (apiOrigin === undefined) {
    issues.push({ code: 'MISSING_API_ORIGIN', field: 'apiOrigin' });
  }

  const databaseUrlReference = secretReference(input.databaseUrlReference);
  if (databaseUrlReference === undefined) {
    issues.push({ code: 'MISSING_DATABASE_REFERENCE', field: 'databaseUrlReference' });
  }
  const queueUrlReference = secretReference(input.queueUrlReference);
  if (queueUrlReference === undefined) {
    issues.push({ code: 'MISSING_QUEUE_REFERENCE', field: 'queueUrlReference' });
  }

  const storageEndpoint = parseHttpsOrigin(input.storageEndpoint);
  if (storageEndpoint === undefined) {
    issues.push({ code: 'MISSING_STORAGE_CONFIGURATION', field: 'storageEndpoint' });
  }
  const storageBucket =
    typeof input.storageBucket === 'string' &&
    /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(input.storageBucket.trim())
      ? input.storageBucket.trim()
      : undefined;
  if (storageBucket === undefined) {
    issues.push({ code: 'INVALID_STORAGE_BUCKET', field: 'storageBucket' });
  }

  const secretReferences = references(input.secretReferences);
  if (secretReferences === undefined) {
    issues.push({ code: 'INVALID_SECRET_REFERENCE', field: 'secretReferences' });
  } else {
    for (const name of requiredSecretNames) {
      if (secretReferences[name] === undefined) {
        issues.push({ code: 'MISSING_REQUIRED_SECRET_REFERENCE', field: name });
      }
    }
  }

  const allowedOrigins = list(input.allowedOrigins).map(parseHttpsOrigin);
  if (
    allowedOrigins.some((origin) => origin === undefined) ||
    (publicAppOrigin !== undefined && !allowedOrigins.includes(publicAppOrigin))
  ) {
    issues.push({ code: 'INVALID_ALLOWED_ORIGIN', field: 'allowedOrigins' });
  }
  const callbacks = list(input.callbackUrls).map(parseCallbackUrl);
  if (callbacks.some((url) => url === undefined)) {
    issues.push({ code: 'INVALID_CALLBACK_URL', field: 'callbackUrls' });
  }
  if (!productionProviderModesAreSafe(input.providerModes)) {
    issues.push({ code: 'MOCK_PROVIDER_IN_PRODUCTION', field: 'providerModes' });
  }

  if (
    issues.length > 0 ||
    publicAppOrigin === undefined ||
    apiOrigin === undefined ||
    databaseUrlReference === undefined ||
    queueUrlReference === undefined ||
    storageEndpoint === undefined ||
    storageBucket === undefined ||
    secretReferences === undefined
  ) {
    throw new ProductionConfigError(issues);
  }

  return Object.freeze({
    environment: 'PRODUCTION',
    publicAppOrigin,
    apiOrigin,
    allowedOrigins: Object.freeze(allowedOrigins as string[]),
    callbackUrls: Object.freeze(callbacks as string[]),
    databaseUrlReference,
    queueUrlReference,
    storageEndpoint,
    storageBucket,
    secretReferences: Object.freeze({ ...secretReferences }),
  });
}
