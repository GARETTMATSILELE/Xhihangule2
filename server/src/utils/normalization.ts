export function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function normalizeLegalIdentifier(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized ? normalized.toUpperCase().replace(/\s+/g, '') : undefined;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeCompanyType(value: unknown): 'INDIVIDUAL_LANDLORD' | 'REGISTERED_BUSINESS' {
  return value === 'INDIVIDUAL_LANDLORD' ? 'INDIVIDUAL_LANDLORD' : 'REGISTERED_BUSINESS';
}

export function normalizeWorkspaceType(value: unknown, fallback: 'agency' | 'individual' = 'agency'): 'agency' | 'individual' {
  return value === 'individual' ? 'individual' : fallback;
}
