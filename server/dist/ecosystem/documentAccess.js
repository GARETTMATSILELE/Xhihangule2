"use strict";
/** Tenant-facing document policy. Deny by default for property File records. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDeniedTenantPropertyFile = isDeniedTenantPropertyFile;
exports.isTenantVisiblePropertyFile = isTenantVisiblePropertyFile;
exports.toTenantFileSummary = toTenantFileSummary;
const ALLOW_TYPE = [
    'lease', 'signed_lease', 'amendment', 'addendum', 'renewal', 'termination',
    'receipt', 'inspection', 'maintenance', 'tenant', 'id', 'identity', 'passport',
];
const DENY_TOKEN = [
    'tax', 'vat', 'accounting', 'journal', 'owner', 'commission', 'bank',
    'financial', 'internal', 'statement', 'ledger', 'trust', 'contractor',
    'payroll', 'secret', 'private', 'agent-note', 'agent_note',
];
function haystack(file) {
    return `${file.fileType || ''} ${file.fileName || ''}`.toLowerCase();
}
function isDeniedTenantPropertyFile(file) {
    const text = haystack(file);
    return DENY_TOKEN.some((token) => text.includes(token));
}
function isTenantVisiblePropertyFile(file) {
    if (isDeniedTenantPropertyFile(file))
        return false;
    const text = haystack(file);
    return ALLOW_TYPE.some((token) => text.includes(token.replace('_', ' ')) || text.includes(token));
}
function toTenantFileSummary(file, includeUrl = false) {
    if (!file)
        return file;
    return Object.assign({ _id: file._id, fileName: file.fileName, fileType: file.fileType, propertyId: file.propertyId, uploadedAt: file.uploadedAt }, (includeUrl ? { url: file.fileUrl } : {}));
}
