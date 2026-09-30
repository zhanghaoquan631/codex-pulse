import {
  validateProductionConfig,
  type MezipProductionConfigInput,
  type ValidatedProductionConfig,
} from '@me-zip/utils';

export interface ProductionDependency {
  readonly name: 'DATABASE' | 'QUEUE' | 'STORAGE' | 'SECRETS';
  readonly required: boolean;
  isReady(): Promise<boolean>;
}

export interface ProductionReadiness {
  readonly status: 'READY' | 'NOT_READY';
  /** Only coarse dependency names; endpoints and credentials never leave the host. */
  readonly unavailable: readonly ProductionDependency['name'][];
}

export interface OperationalEvent {
  readonly requestId: string;
  readonly service: string;
  readonly route: string;
  readonly method: string;
  readonly status: number;
  readonly durationMs: number;
  readonly errorClass?: string;
  readonly subjectReference?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface OperationalLogger {
  write(event: Readonly<Record<string, unknown>>): void;
}

export interface MetricsSink {
  increment(name: string, value: number, tags: Readonly<Record<string, string>>): void;
  observe(name: string, value: number, tags: Readonly<Record<string, string>>): void;
}

const sensitiveKey =
  /(?:authorization|cookie|token|secret|password|otp|private.?key|signed.?url|signature|body|content|prompt|ciphertext)/iu;

/** Removes common credential/content fields before a log or telemetry adapter sees them. */
export function redactOperationalMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (metadata === undefined) return {};
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    redacted[key] = sensitiveKey.test(key)
      ? '[REDACTED]'
      : typeof value === 'string'
        ? value.slice(0, 256)
        : value;
  }
  return Object.freeze(redacted);
}

export function writeOperationalEvent(
  logger: OperationalLogger,
  event: OperationalEvent,
): void {
  logger.write(
    Object.freeze({
      requestId: event.requestId,
      service: event.service,
      route: event.route,
      method: event.method,
      status: event.status,
      durationMs: Math.max(0, Math.floor(event.durationMs)),
      errorClass: event.errorClass ?? null,
      subjectReference: event.subjectReference ?? null,
      metadata: redactOperationalMetadata(event.metadata),
    }),
  );
}

export function recordRequestMetrics(
  sink: MetricsSink,
  event: Pick<
    OperationalEvent,
    'service' | 'route' | 'method' | 'status' | 'durationMs'
  >,
): void {
  const tags = Object.freeze({
    service: event.service,
    route: event.route,
    method: event.method,
    statusClass: `${Math.floor(event.status / 100)}xx`,
  });
  sink.increment('mezip_request_total', 1, tags);
  sink.observe('mezip_request_duration_ms', Math.max(0, event.durationMs), tags);
}

export interface ProductionHttpPolicy {
  readonly allowedOrigins: readonly string[];
  readonly headers: Readonly<Record<string, string>>;
  corsHeaders(origin: string | undefined): Readonly<Record<string, string>>;
}

/** Returns production-safe headers without a credentials-plus-wildcard CORS mode. */
export function createProductionHttpPolicy(
  config: ValidatedProductionConfig,
): ProductionHttpPolicy {
  const connectSources = [
    ...new Set([config.publicAppOrigin, config.apiOrigin, config.storageEndpoint]),
  ];
  const headers = Object.freeze({
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      `connect-src 'self' ${connectSources.join(' ')}`,
      "img-src 'self' data: https:",
      "media-src 'self' https:",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
    ].join('; '),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(self), microphone=(), geolocation=(), payment=(self)',
  });
  return Object.freeze({
    allowedOrigins: config.allowedOrigins,
    headers,
    corsHeaders(origin: string | undefined) {
      if (origin === undefined || !config.allowedOrigins.includes(origin)) return {};
      return Object.freeze({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin',
      });
    },
  });
}

export interface ProductionRuntime {
  readonly config: ValidatedProductionConfig;
  readonly http: ProductionHttpPolicy;
  liveness(): Readonly<{ status: 'LIVE' }>;
  readiness(): Promise<ProductionReadiness>;
}

/**
 * Production host composition must call this before accepting traffic. It
 * rejects unsafe configuration before adapters can receive a request.
 */
export function createProductionRuntime(
  configInput: MezipProductionConfigInput,
  dependencies: readonly ProductionDependency[],
): ProductionRuntime {
  const config = validateProductionConfig(configInput);
  const required = dependencies.filter((dependency) => dependency.required);
  return Object.freeze({
    config,
    http: createProductionHttpPolicy(config),
    liveness: () => Object.freeze({ status: 'LIVE' as const }),
    readiness: async () => {
      const states = await Promise.all(
        required.map(async (dependency) => ({
          dependency,
          ready: await dependency.isReady(),
        })),
      );
      const unavailable = states
        .filter((state) => !state.ready)
        .map((state) => state.dependency.name);
      return Object.freeze({
        status: unavailable.length === 0 ? ('READY' as const) : ('NOT_READY' as const),
        unavailable: Object.freeze(unavailable),
      });
    },
  });
}
