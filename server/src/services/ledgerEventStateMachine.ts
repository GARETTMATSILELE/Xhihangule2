export type LedgerEventStatus = 'pending' | 'processing' | 'failed' | 'completed';

export type LedgerEventClaimInput = {
  status: LedgerEventStatus;
  nextAttemptAt?: Date | string | null;
  claimedAt?: Date | string | null;
  processorGeneration?: number;
  now: Date;
  staleProcessingMs?: number;
  requiredGeneration?: number;
};

/**
 * Pure claim predicate. A worker crash leaves status=processing;
 * those rows become claimable again after staleProcessingMs.
 */
export function isClaimableLedgerEvent(input: LedgerEventClaimInput): boolean {
  const required = input.requiredGeneration;
  if (typeof required === 'number' && input.processorGeneration !== required) {
    return false;
  }
  const now = input.now.getTime();
  const staleMs = input.staleProcessingMs ?? 5 * 60 * 1000;
  if (input.status === 'completed') return false;
  if (input.status === 'processing') {
    const claimed = input.claimedAt ? new Date(input.claimedAt).getTime() : 0;
    return claimed > 0 && now - claimed >= staleMs;
  }
  if (input.status === 'pending' || input.status === 'failed') {
    const next = input.nextAttemptAt ? new Date(input.nextAttemptAt).getTime() : 0;
    return !next || next <= now;
  }
  return false;
}

export function nextLedgerEventStatusAfterClaim(): LedgerEventStatus {
  return 'processing';
}

export function nextLedgerEventStatusAfterSuccess(): LedgerEventStatus {
  return 'completed';
}

export function nextLedgerEventStatusAfterFailure(): LedgerEventStatus {
  return 'failed';
}

export const LEDGER_RETRY_LIMIT = 8;

export function ledgerRetryExhausted(attemptCount: number): boolean {
  return attemptCount >= LEDGER_RETRY_LIMIT;
}

export function computeLedgerBackoffMs(attempt: number): number {
  const base = 5000;
  const cap = 10 * 60 * 1000;
  const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
  return exp;
}

export type ReversalArtifactState = 'absent' | 'active' | 'reversed' | 'failed';

export type ReversalProgress = {
  ownerIncome: ReversalArtifactState;
  configuredExpense: ReversalArtifactState;
  companyCommission: ReversalArtifactState;
  agentCommission: ReversalArtifactState;
  trust: ReversalArtifactState;
  journal: ReversalArtifactState;
};

export function classifyReversalOutcome(progress: ReversalProgress): 'already_reversed' | 'reversed' | 'partial' | 'failed' {
  const values = Object.values(progress);
  if (values.every((v) => v === 'reversed' || v === 'absent')) {
    return values.some((v) => v === 'reversed') ? 'already_reversed' : 'reversed';
  }
  if (values.some((v) => v === 'failed')) {
    return values.some((v) => v === 'reversed') ? 'partial' : 'failed';
  }
  if (values.some((v) => v === 'active')) return 'partial';
  return 'reversed';
}
