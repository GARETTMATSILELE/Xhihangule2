/**
 * Allow-list for PropertyAccount / AgentAccount update operators.
 * Amounts and original rows stay immutable; status cancellation and nested
 * pass-through appends are required for reversal and concurrent collections.
 */

const PROPERTY_ROOT_ARRAYS = ['transactions', 'ownerPayouts', 'passThroughAccounts.transactions'];

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}.$`));
}

export function isAllowedPropertyAccountSetPath(path: string): boolean {
  if (/^ownerPayouts\.\$(?:\[[^\]]+\])?\.(status|updatedAt)$/.test(path)) return true;
  // Reversal / correction: cancel a row without rewriting its amount.
  if (/^transactions\.\$(?:\[[^\]]+\])?\.(status|updatedAt|notes)$/.test(path)) return true;
  if (path === 'passThroughAccounts') return true;
  if (/^passThroughAccounts\.\$(?:\[[^\]]+\])?\.(runningBalance|totalCollected|totalPaid|lastUpdated)$/.test(path)) {
    return true;
  }
  return false;
}

export function isAllowedPropertyAccountPushPath(path: string): boolean {
  if (path === 'transactions' || path === 'ownerPayouts' || path === 'passThroughAccounts') return true;
  // Concurrent pass-through collections must append into an existing bucket.
  if (/^passThroughAccounts\.\$(?:\[[^\]]+\])?\.transactions$/.test(path)) return true;
  return false;
}

export function isIllegalPropertyAccountMutation(update: Record<string, any>): boolean {
  const illegalSetters = ['$set', '$unset', '$inc'];
  const illegalRemovers = ['$pull', '$pullAll', '$pop'];

  for (const op of illegalSetters) {
    const payload = (update as any)[op];
    if (!payload || typeof payload !== 'object') continue;
    for (const path of Object.keys(payload)) {
      if (isAllowedPropertyAccountSetPath(path)) continue;
      if (/^passThroughAccounts\..*transactions(?:\.|$)/.test(path) && op !== '$inc') return true;
      if (startsWithAny(path, PROPERTY_ROOT_ARRAYS)) return true;
    }
  }

  for (const op of illegalRemovers) {
    const payload = (update as any)[op];
    if (!payload || typeof payload !== 'object') continue;
    for (const path of Object.keys(payload)) {
      if (/^passThroughAccounts\..*transactions(?:\.|$)/.test(path)) return true;
      if (startsWithAny(path, PROPERTY_ROOT_ARRAYS)) return true;
    }
  }

  for (const op of ['$push', '$addToSet']) {
    const payload = (update as any)[op];
    if (!payload || typeof payload !== 'object') continue;
    for (const path of Object.keys(payload)) {
      if (!isAllowedPropertyAccountPushPath(path)) return true;
    }
  }
  return false;
}

export function isIllegalAgentAccountMutation(update: Record<string, any>): boolean {
  const illegalSetters = ['$set', '$unset', '$inc'];
  const illegalRemovers = ['$pull', '$pullAll', '$pop'];
  const allowedAppends = ['$push', '$addToSet'];
  const rootArrays = ['transactions', 'agentPayouts'];
  const startsWith = (k: string) =>
    rootArrays.some((p) => k === p || k.startsWith(`${p}.`) || k.startsWith(`${p}.$`));

  for (const op of illegalSetters) {
    const payload = (update as any)[op];
    if (!payload) continue;
    for (const path of Object.keys(payload)) {
      if (startsWith(path)) return true;
    }
  }
  for (const op of illegalRemovers) {
    const payload = (update as any)[op];
    if (!payload) continue;
    for (const path of Object.keys(payload)) {
      if (startsWith(path)) return true;
    }
  }
  for (const op of allowedAppends) {
    const payload = (update as any)[op];
    if (!payload) continue;
    for (const path of Object.keys(payload)) {
      if (!rootArrays.includes(path)) return true;
    }
  }
  return false;
}

export function isIndexCreationAllowed(): boolean {
  return process.env.ALLOW_ACCOUNTING_INDEX_MIGRATION === 'true';
}

export const LEDGER_EVENT_PROCESSOR_GENERATION = 2;
