/**
 * Runtime policy for the paired AI Usage collector.
 *
 * This module deliberately accepts values as data instead of reading process
 * environment variables itself.  Each platform composition root supplies its
 * reviewed configuration, keeping tests deterministic and preventing a client
 * from quietly selecting a production endpoint.
 */
export const COLLECTOR_RUNTIME_MODES = ['DEVELOPMENT', 'TEST', 'PRODUCTION'] as const;

export type CollectorRuntimeMode = (typeof COLLECTOR_RUNTIME_MODES)[number];

export type CollectorConfigFailureReason =
  | 'INVALID_RUNTIME_MODE'
  | 'MISSING_ORIGIN'
  | 'INVALID_ORIGIN'
  | 'ORIGIN_NOT_ALLOWED_FOR_RUNTIME_MODE'
  | 'PRODUCTION_REQUIRES_PUBLIC_HTTPS_ORIGIN';

export interface CollectorConfigInput {
  /** Must explicitly be DEVELOPMENT, TEST, or PRODUCTION. */
  readonly mode?: unknown;
  /** An origin only: never a route, credential, query string, or fragment. */
  readonly apiOrigin?: unknown;
}

export interface CollectorMockOnlyConfig {
  readonly mode: 'DEVELOPMENT' | 'TEST';
  readonly state: 'MOCK_ONLY';
}

export interface CollectorNetworkConfig {
  readonly mode: CollectorRuntimeMode;
  readonly state: 'NETWORK_CONFIGURED';
  /** Canonical exact origin, for example `https://collector.example.com`. */
  readonly apiOrigin: string;
  /** Exact MV3 match pattern derived from the same origin. */
  readonly hostPermission: string;
}

export interface CollectorFailClosedConfig {
  readonly mode: CollectorRuntimeMode;
  readonly state: 'FAIL_CLOSED';
  readonly reason: CollectorConfigFailureReason;
}

export type CollectorRuntimeConfig =
  CollectorMockOnlyConfig | CollectorNetworkConfig | CollectorFailClosedConfig;

function explicitMode(value: unknown): CollectorRuntimeMode | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return COLLECTOR_RUNTIME_MODES.includes(normalized as CollectorRuntimeMode)
    ? (normalized as CollectorRuntimeMode)
    : null;
}

function normalizedOrigin(value: unknown): URL | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const parsed = new URL(value.trim());
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.pathname !== '/' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function bareHostname(value: string): string {
  return value.replace(/^\[/u, '').replace(/\]$/u, '').toLowerCase();
}

function isLoopbackHost(value: string): boolean {
  const host = bareHostname(value);
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') {
    return true;
  }
  return /^127(?:\.\d{1,3}){3}$/u.test(host);
}

function isPrivateIpv4(value: string): boolean {
  const host = bareHostname(value);
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))) {
    return false;
  }
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const first = octets[0]!;
  const second = octets[1]!;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isPublicProductionHost(value: string): boolean {
  const host = bareHostname(value);
  if (
    host.length === 0 ||
    // A literal IPv6 host is deliberately not accepted for the first
    // production release. It avoids treating an IPv6 private/link-local host
    // as public; an approved DNS hostname is required instead.
    host.includes(':') ||
    isLoopbackHost(host) ||
    isPrivateIpv4(host) ||
    host.endsWith('.local') ||
    host === 'local'
  ) {
    return false;
  }
  return true;
}

function exactHostPermission(origin: URL): string {
  return `${origin.protocol}//${origin.host}/*`;
}

/** True only when a caller may instantiate a network collector transport. */
export function isCollectorNetworkConfigured(
  config: CollectorRuntimeConfig,
): config is CollectorNetworkConfig {
  if (config.state !== 'NETWORK_CONFIGURED') return false;
  const resolved = resolveCollectorRuntimeConfig({
    mode: config.mode,
    apiOrigin: config.apiOrigin,
  });
  return (
    resolved.state === 'NETWORK_CONFIGURED' &&
    resolved.apiOrigin === config.apiOrigin &&
    resolved.hostPermission === config.hostPermission
  );
}

/**
 * Resolve a Collector origin without ever choosing a fallback URL.  An absent
 * explicit development/test endpoint permits only an injected mock adapter;
 * it never causes a network request.  An absent/unknown/invalid production
 * setting is always fail-closed.
 */
export function resolveCollectorRuntimeConfig(
  input: CollectorConfigInput = {},
): CollectorRuntimeConfig {
  const mode = explicitMode(input.mode);
  if (mode === null) {
    // Treat omitted and unknown modes as production, but require an explicit
    // production declaration before any endpoint can be used.
    return {
      mode: 'PRODUCTION',
      state: 'FAIL_CLOSED',
      reason: 'INVALID_RUNTIME_MODE',
    };
  }

  const originValue = input.apiOrigin;
  const originMissing =
    originValue === undefined ||
    (typeof originValue === 'string' && originValue.trim().length === 0);
  if (originMissing) {
    if (mode === 'DEVELOPMENT' || mode === 'TEST') {
      return { mode, state: 'MOCK_ONLY' };
    }
    return { mode, state: 'FAIL_CLOSED', reason: 'MISSING_ORIGIN' };
  }

  const origin = normalizedOrigin(originValue);
  if (origin === null) {
    return { mode, state: 'FAIL_CLOSED', reason: 'INVALID_ORIGIN' };
  }

  if (mode === 'DEVELOPMENT') {
    if (!isLoopbackHost(origin.hostname)) {
      return {
        mode,
        state: 'FAIL_CLOSED',
        reason: 'ORIGIN_NOT_ALLOWED_FOR_RUNTIME_MODE',
      };
    }
    return {
      mode,
      state: 'NETWORK_CONFIGURED',
      apiOrigin: origin.origin,
      hostPermission: exactHostPermission(origin),
    };
  }

  if (mode === 'TEST') {
    // Test adapters may be injected with no origin at all. When a test needs
    // a real network collector, it must be an explicit exact HTTPS endpoint;
    // plaintext HTTP remains limited to loopback.
    if (origin.protocol === 'http:' && !isLoopbackHost(origin.hostname)) {
      return {
        mode,
        state: 'FAIL_CLOSED',
        reason: 'ORIGIN_NOT_ALLOWED_FOR_RUNTIME_MODE',
      };
    }
    return {
      mode,
      state: 'NETWORK_CONFIGURED',
      apiOrigin: origin.origin,
      hostPermission: exactHostPermission(origin),
    };
  }

  if (origin.protocol !== 'https:' || !isPublicProductionHost(origin.hostname)) {
    return {
      mode,
      state: 'FAIL_CLOSED',
      reason: 'PRODUCTION_REQUIRES_PUBLIC_HTTPS_ORIGIN',
    };
  }

  return {
    mode,
    state: 'NETWORK_CONFIGURED',
    apiOrigin: origin.origin,
    hostPermission: exactHostPermission(origin),
  };
}
