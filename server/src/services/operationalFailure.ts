import { isPermanentAccountingFailure } from './transactionDomain';

export type OperationalFailureClass = 'transient' | 'permanent' | 'conflict';

export class ExpenseSyncError extends Error {
  readonly failureClass: OperationalFailureClass;
  readonly code: string | number;

  constructor(message: string, failureClass: OperationalFailureClass, code: string | number = 'EXPENSE_SYNC_FAILED') {
    super(message);
    this.name = 'ExpenseSyncError';
    this.failureClass = failureClass;
    this.code = code;
  }
}

/**
 * Transient means a later bounded retry may succeed.
 * Conflict is a duplicate-key error that was not proven to be the same operation.
 * Permanent means validation or a business rule; those are not retried until an accountant acts.
 */
export function classifyOperationalFailure(error: unknown): OperationalFailureClass {
  if (error instanceof ExpenseSyncError) return error.failureClass;
  if (isPermanentAccountingFailure(error)) return 'permanent';
  const err = error as { code?: unknown; statusCode?: unknown; message?: unknown } | null;
  const code = Number(err?.code);
  if (code === 11000) return 'conflict';
  const message = String(err?.message || '');
  if (
    code === 16500
    || code === 50
    || code === 89
    || code === 91
    || /throttl|TooManyRequests|ECONNRESET|ETIMEDOUT|timed out|connection.*closed|MongoNetwork|server selection/i.test(message)
  ) {
    return 'transient';
  }
  const status = Number(err?.statusCode);
  if (status >= 400 && status < 500) return 'permanent';
  return 'transient';
}
