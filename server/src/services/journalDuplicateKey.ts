import { idsEqual } from '../utils/money';

export type DuplicateKeyDetails = {
  pattern: Record<string, unknown>;
  value: Record<string, unknown>;
};

export type JournalOperationIdentity = {
  companyId: unknown;
  sourceModule: string;
  sourceId: string;
  reference?: string;
};

const SOURCE_FIELDS = ['companyId', 'sourceModule', 'sourceId'];
const REFERENCE_FIELDS = ['companyId', 'reference'];

/**
 * Duplicate-key metadata from MongoDB-compatible servers.
 * A 11000 without keyPattern and keyValue is not treated as a known collision.
 * Production Cosmos DB is not verified to return these fields.
 */
export function duplicateKeyDetails(error: unknown): DuplicateKeyDetails | null {
  const err = error as {
    code?: unknown;
    keyPattern?: unknown;
    keyValue?: unknown;
    errorResponse?: { keyPattern?: unknown; keyValue?: unknown };
  } | null;
  if (!err || Number(err.code) !== 11000) return null;
  const pattern = err.keyPattern || err.errorResponse?.keyPattern;
  const value = err.keyValue || err.errorResponse?.keyValue;
  if (!pattern || typeof pattern !== 'object' || Array.isArray(pattern)) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    pattern: pattern as Record<string, unknown>,
    value: value as Record<string, unknown>
  };
}

function sameFieldSet(fields: string[], expected: string[]): boolean {
  if (fields.length !== expected.length) return false;
  return expected.every((field) => fields.includes(field));
}

/**
 * A duplicate key is a candidate for this posting only when the conflicting
 * index is the journal source identity or the company reference index, and
 * the key values name this operation. Any other index returns null so the
 * caller propagates the error.
 */
export function matchingJournalIdentity(
  error: unknown,
  candidates: JournalOperationIdentity[]
): JournalOperationIdentity | null {
  const details = duplicateKeyDetails(error);
  if (!details) return null;
  const fields = Object.keys(details.pattern);
  const sourceIndex = sameFieldSet(fields, SOURCE_FIELDS);
  const referenceIndex = sameFieldSet(fields, REFERENCE_FIELDS);
  if (!sourceIndex && !referenceIndex) return null;

  for (const identity of candidates) {
    if (details.value.companyId != null && !idsEqual(details.value.companyId, identity.companyId)) continue;
    if (sourceIndex) {
      if (String(details.value.sourceModule || '') !== identity.sourceModule) continue;
      if (String(details.value.sourceId || '') !== identity.sourceId) continue;
      return identity;
    }
    if (!identity.reference || String(details.value.reference || '') !== identity.reference) continue;
    return identity;
  }
  return null;
}

export function persistedJournalMatchesIdentity(
  journal: { companyId?: unknown; sourceModule?: unknown; sourceId?: unknown } | null | undefined,
  identity: JournalOperationIdentity
): boolean {
  if (!journal) return false;
  if (!idsEqual(journal.companyId, identity.companyId)) return false;
  if (String(journal.sourceModule || '') !== identity.sourceModule) return false;
  if (String(journal.sourceId || '') !== identity.sourceId) return false;
  return true;
}
