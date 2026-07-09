"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IN_PROGRESS_STATUSES = exports.PAYMENT_STATUSES = exports.APPROVED_STATUSES = exports.APPROVAL_STATUSES = exports.OPEN_STATUSES = exports.STATUS_LABELS = exports.LEGACY_STATUS_MAP = exports.MAINTENANCE_STATUSES = void 0;
exports.normalizeMaintenanceStatus = normalizeMaintenanceStatus;
exports.statusLabel = statusLabel;
exports.isApprovalPending = isApprovalPending;
exports.isOwnerApproved = isOwnerApproved;
/** Enterprise maintenance lifecycle statuses (snake_case slugs). */
exports.MAINTENANCE_STATUSES = [
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
];
exports.LEGACY_STATUS_MAP = {
    pending: 'draft',
    pending_approval: 'awaiting_approval',
    pending_completion: 'awaiting_payment',
    cancelled: 'rejected',
};
exports.STATUS_LABELS = {
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
exports.OPEN_STATUSES = [
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
exports.APPROVAL_STATUSES = ['awaiting_approval', 'pending_approval'];
exports.APPROVED_STATUSES = ['approved', 'awaiting_payment', 'funded', 'assigned', 'in_progress', 'completed', 'verified', 'pending_completion'];
exports.PAYMENT_STATUSES = ['awaiting_payment', 'pending_completion'];
exports.IN_PROGRESS_STATUSES = ['assigned', 'in_progress'];
function normalizeMaintenanceStatus(status) {
    if (!status)
        return 'draft';
    if (exports.LEGACY_STATUS_MAP[status])
        return exports.LEGACY_STATUS_MAP[status];
    if (exports.MAINTENANCE_STATUSES.includes(status))
        return status;
    return 'draft';
}
function statusLabel(status) {
    return exports.STATUS_LABELS[status || ''] || status || 'Unknown';
}
function isApprovalPending(status) {
    const n = normalizeMaintenanceStatus(status);
    return n === 'awaiting_approval';
}
function isOwnerApproved(status) {
    const n = normalizeMaintenanceStatus(status);
    return exports.APPROVED_STATUSES.includes(n) || n === 'closed' || n === 'verified';
}
