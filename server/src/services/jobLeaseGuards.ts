export function isLeaseAvailable(
  doc: { ownerToken?: string; leaseExpiresAt?: Date | string } | null | undefined,
  now: Date
): boolean {
  if (!doc) return true;
  if (!doc.ownerToken) return true;
  const expiresAt = doc.leaseExpiresAt ? new Date(doc.leaseExpiresAt) : new Date(0);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
}

export function canMutateLease(
  doc: { ownerToken?: string } | null | undefined,
  token: string
): boolean {
  return Boolean(doc && token && doc.ownerToken === token);
}
