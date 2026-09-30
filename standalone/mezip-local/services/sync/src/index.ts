export interface SyncCursor {
  readonly stream: string;
  readonly position: string;
  readonly updatedAt: string;
}

export function shouldRetrySync(attempt: number, maxAttempts = 5): boolean {
  return Number.isInteger(attempt) && attempt >= 0 && attempt < maxAttempts;
}
