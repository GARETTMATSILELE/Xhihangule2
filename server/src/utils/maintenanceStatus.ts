/** Enterprise maintenance lifecycle statuses (snake_case slugs). */
export const MAINTENANCE_STATUSES = [
  'draft',
  'awaiting_approval',
  'approved',
  'awaiting_payment',
  'funded',
  'assigned',
  'in_progress',
  'completed',
  'verified',
  'closed',
  'rejected',
  // Legacy values kept for backward compatibility during migration
  'pending',
  'pending_approval',
  'pending_completion',
  'cancelled',
] as const;

export type MaintenanceStatusValue = (typeof MAINTENANCE_STATUSES)[number];

export const LEGACY_STATUS_MAP: Record<string, MaintenanceStatusValue> = {
  pending: 'draft',
  pending_approval: 'awaiting_approval',
  pending_completion: 'awaiting_payment',
  cancelled: 'rejected',
};

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  awaiting_payment: 'Awaiting Payment',
  funded: 'Funded',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  closed: 'Closed',
  rejected: 'Rejected',
  pending: 'Draft',
  pending_approval: 'Awaiting Approval',
  pending_completion: 'Awaiting Payment',
  cancelled: 'Rejected',
};

export const OPEN_STATUSES = [
  'draft',
  'awaiting_approval',
  'approved',
  'awaiting_payment',
  'funded',
  'assigned',
  'in_progress',
  'completed',
  'pending',
  'pending_approval',
  'pending_completion',
];

export const APPROVAL_STATUSES = ['awaiting_approval', 'pending_approval'];
export const APPROVED_STATUSES = ['approved', 'awaiting_payment', 'funded', 'assigned', 'in_progress', 'completed', 'verified', 'pending_completion'];
export const PAYMENT_STATUSES = ['awaiting_payment', 'pending_completion'];
export const IN_PROGRESS_STATUSES = ['assigned', 'in_progress'];

export function normalizeMaintenanceStatus(status?: string): MaintenanceStatusValue {
  if (!status) return 'draft';
  if (LEGACY_STATUS_MAP[status]) return LEGACY_STATUS_MAP[status];
  if ((MAINTENANCE_STATUSES as readonly string[]).includes(status)) return status as MaintenanceStatusValue;
  return 'draft';
}

export function statusLabel(status?: string): string {
  return STATUS_LABELS[status || ''] || status || 'Unknown';
}

export function isApprovalPending(status?: string): boolean {
  const n = normalizeMaintenanceStatus(status);
  return n === 'awaiting_approval';
}

export function isOwnerApproved(status?: string): boolean {
  const n = normalizeMaintenanceStatus(status);
  return APPROVED_STATUSES.includes(n) || n === 'closed' || n === 'verified';
}
