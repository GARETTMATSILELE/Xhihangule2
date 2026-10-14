/** Tenant-facing document policy. Deny by default for property File records. */

const ALLOW_TYPE = [
  'lease', 'signed_lease', 'amendment', 'addendum', 'renewal', 'termination',
  'receipt', 'inspection', 'maintenance', 'tenant', 'id', 'identity', 'passport',
];

const DENY_TOKEN = [
  'tax', 'vat', 'accounting', 'journal', 'owner', 'commission', 'bank',
  'financial', 'internal', 'statement', 'ledger', 'trust', 'contractor',
  'payroll', 'secret', 'private', 'agent-note', 'agent_note',
];

function haystack(file: { fileType?: string; fileName?: string }): string {
  return `${file.fileType || ''} ${file.fileName || ''}`.toLowerCase();
}

export function isDeniedTenantPropertyFile(file: { fileType?: string; fileName?: string }): boolean {
  const text = haystack(file);
  return DENY_TOKEN.some((token) => text.includes(token));
}

export function isTenantVisiblePropertyFile(file: { fileType?: string; fileName?: string }): boolean {
  if (isDeniedTenantPropertyFile(file)) return false;
  const text = haystack(file);
  return ALLOW_TYPE.some((token) => text.includes(token.replace('_', ' ')) || text.includes(token));
}

export function toTenantFileSummary(file: any, includeUrl = false) {
  if (!file) return file;
  return {
    _id: file._id,
    fileName: file.fileName,
    fileType: file.fileType,
    propertyId: file.propertyId,
    uploadedAt: file.uploadedAt,
    ...(includeUrl ? { url: file.fileUrl } : {}),
  };
}
