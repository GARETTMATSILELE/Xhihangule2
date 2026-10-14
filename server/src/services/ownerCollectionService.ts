/**
 * Operational owner cash-collection workflow.
 * This is evidence of who collected what. It does not post accounting.
 */
export const OWNER_COLLECTION_STATUSES = [
  'NOT_REQUESTED',
  'OWNER_REQUESTED',
  'READY_FOR_COLLECTION',
  'COLLECTED',
  'ACKNOWLEDGED',
] as const;

export type OwnerCollectionStatus = typeof OWNER_COLLECTION_STATUSES[number];

const NEXT: Record<OwnerCollectionStatus, OwnerCollectionStatus | null> = {
  NOT_REQUESTED: 'OWNER_REQUESTED',
  OWNER_REQUESTED: 'READY_FOR_COLLECTION',
  READY_FOR_COLLECTION: 'COLLECTED',
  COLLECTED: 'ACKNOWLEDGED',
  ACKNOWLEDGED: null,
};

export function nextOwnerCollectionStatus(current: OwnerCollectionStatus): OwnerCollectionStatus | null {
  return NEXT[current] ?? null;
}

export function assertOwnerCollectionTransition(current: OwnerCollectionStatus, requested: OwnerCollectionStatus): void {
  const allowed = NEXT[current];
  if (allowed !== requested) {
    const error = new Error(`Collection cannot move from ${current} to ${requested}. Next status is ${allowed || 'none'}.`);
    (error as any).status = 409;
    throw error;
  }
}
