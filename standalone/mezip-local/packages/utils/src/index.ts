export {
  COLLECTOR_RUNTIME_MODES,
  isCollectorNetworkConfigured,
  resolveCollectorRuntimeConfig,
  type CollectorConfigFailureReason,
  type CollectorConfigInput,
  type CollectorFailClosedConfig,
  type CollectorMockOnlyConfig,
  type CollectorNetworkConfig,
  type CollectorRuntimeConfig,
  type CollectorRuntimeMode,
} from './collector-config.js';

export {
  MEZIP_DEPLOYMENT_ENVIRONMENTS,
  ProductionConfigError,
  validateProductionConfig,
  type MezipDeploymentEnvironment,
  type MezipProductionConfigInput,
  type ProductionConfigIssue,
  type ProductionConfigIssueCode,
  type ValidatedProductionConfig,
} from './production-config.js';

export function isSameOwner(principalId: string, ownerId: string): boolean {
  return principalId.length > 0 && principalId === ownerId;
}

export function calculateActiveSeconds(
  startedAt: Date,
  endedAt: Date,
  idleSeconds: number,
): number {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - startedAt.getTime()) / 1_000),
  );
  return Math.max(0, elapsedSeconds - Math.max(0, idleSeconds));
}

export function cnyFenToDisplay(amountFen: number): string {
  if (!Number.isSafeInteger(amountFen) || amountFen < 0) {
    throw new Error('Amount must be a non-negative integer number of CNY fen.');
  }
  return `¥${(amountFen / 100).toFixed(2)}`;
}
