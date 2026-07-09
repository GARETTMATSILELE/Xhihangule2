import { Lease, LeaseStatus } from '../types/lease';

export const leaseStatuses: LeaseStatus[] = [
  'draft',
  'pending_approval',
  'active',
  'expiring_soon',
  'expired',
  'renewed',
  'terminated',
  'pending_settlement',
  'closed',
];

export const leaseStatusLabels: Record<LeaseStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  active: 'Active',
  expiring_soon: 'Expiring Soon',
  expired: 'Expired',
  renewed: 'Renewed',
  terminated: 'Terminated',
  pending_settlement: 'Pending Settlement',
  closed: 'Closed',
};

const immutableStatuses: LeaseStatus[] = [
  'active',
  'expiring_soon',
  'expired',
  'renewed',
  'terminated',
  'pending_settlement',
  'closed',
];

export function normalizeLeaseStatus(status?: string): LeaseStatus {
  if (!status) return 'active';
  return leaseStatuses.includes(status as LeaseStatus) ? (status as LeaseStatus) : 'active';
}

export function getLeaseLifecycleStatus(lease: Pick<Lease, 'status' | 'endDate'>): LeaseStatus {
  const status = normalizeLeaseStatus(lease.status);
  if (status !== 'active') return status;

  const endDate = lease.endDate ? new Date(lease.endDate) : null;
  if (!endDate || Number.isNaN(endDate.getTime())) return status;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (endDate < today) return 'expired';

  const expiringSoonThreshold = new Date(today);
  expiringSoonThreshold.setDate(expiringSoonThreshold.getDate() + 60);
  return endDate <= expiringSoonThreshold ? 'expiring_soon' : status;
}

export function isLeaseImmutable(lease: Pick<Lease, 'status'>): boolean {
  return immutableStatuses.includes(normalizeLeaseStatus(lease.status));
}

export function getId(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return String(value._id || value.$oid || value.id || '');
  return '';
}

export function buildLeaseLineage(lease: Lease, leases: Lease[]): Lease[] {
  const byId = new Map(leases.map((item) => [getId(item._id), item]));
  const lineage: Lease[] = [];
  const visited = new Set<string>();

  let cursor: Lease | undefined = lease;
  while (cursor) {
    const cursorId = getId(cursor._id);
    if (!cursorId || visited.has(cursorId)) break;
    visited.add(cursorId);
    lineage.unshift(cursor);
    cursor = byId.get(getId(cursor.previousLeaseId));
  }

  cursor = byId.get(getId(lease.successorLeaseId)) || leases.find((item) => getId(item.previousLeaseId) === getId(lease._id));
  while (cursor) {
    const cursorId = getId(cursor._id);
    if (!cursorId || visited.has(cursorId)) break;
    visited.add(cursorId);
    lineage.push(cursor);
    cursor = byId.get(getId(cursor.successorLeaseId)) || leases.find((item) => getId(item.previousLeaseId) === cursorId);
  }

  return lineage;
}

