import { getLeaseLifecycleStatus } from '../../../utils/leaseLifecycle';
import { INDIVIDUAL_THEME } from '../theme';

export type PropertyOccupancyDisplayStatus = 'Vacant' | 'Occupied' | 'Statutory Tenant';

function getPropertyId(value: any): string {
  return String(value?._id || value?.$oid || value || '');
}

export function tenantLinkedPropertyIds(tenant: any): string[] {
  const ids = [
    getPropertyId(tenant?.propertyId),
    ...(Array.isArray(tenant?.propertyIds) ? tenant.propertyIds.map(getPropertyId) : [])
  ];
  return ids.filter(Boolean);
}

export function groupLeasesByProperty(leases: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const lease of leases) {
    const propertyId = getPropertyId(lease?.propertyId);
    if (!propertyId) continue;
    const rows = map.get(propertyId) || [];
    rows.push(lease);
    map.set(propertyId, rows);
  }
  return map;
}

export function groupTenantsByProperty(tenants: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const tenant of tenants) {
    if (String(tenant?.status || 'Active').toLowerCase() === 'inactive') continue;
    for (const propertyId of tenantLinkedPropertyIds(tenant)) {
      const rows = map.get(propertyId) || [];
      rows.push(tenant);
      map.set(propertyId, rows);
    }
  }
  return map;
}

function leaseHasTenant(lease: any): boolean {
  const tenantId = getPropertyId(lease?.tenantId);
  return Boolean(tenantId);
}

function isCurrentOccupyingLease(lease: any): boolean {
  const status = String(lease?.status || '').toLowerCase();
  if (['terminated', 'closed', 'draft', 'pending_approval'].includes(status)) return false;
  return leaseHasTenant(lease);
}

export function getPropertyOccupancyDisplayStatus(
  leasesForProperty: any[],
  tenantsForProperty: any[] = []
): PropertyOccupancyDisplayStatus {
  const attachedTenants = tenantsForProperty.filter((tenant) => String(tenant?.status || 'Active').toLowerCase() !== 'inactive');
  const occupyingLeases = (leasesForProperty || []).filter(isCurrentOccupyingLease);

  if (!attachedTenants.length && !occupyingLeases.length) return 'Vacant';

  const lifecycleStatuses = occupyingLeases.map((lease) => getLeaseLifecycleStatus(lease));
  const hasLiveLease = lifecycleStatuses.some((status) => status === 'active' || status === 'expiring_soon');
  if (!hasLiveLease && lifecycleStatuses.some((status) => status === 'expired')) {
    return attachedTenants.length ? 'Statutory Tenant' : 'Vacant';
  }

  return 'Occupied';
}

export function getActiveLeaseForProperty(leasesForProperty: any[]): any | undefined {
  return leasesForProperty.find((lease) => {
    const status = getLeaseLifecycleStatus(lease);
    return status === 'active' || status === 'expiring_soon';
  });
}

export function getLatestExpiredLeaseForProperty(leasesForProperty: any[]): any | undefined {
  return leasesForProperty
    .filter((lease) => getLeaseLifecycleStatus(lease) === 'expired')
    .sort((a, b) => new Date(b.endDate || 0).getTime() - new Date(a.endDate || 0).getTime())[0];
}

export function occupancyChipProps(status: PropertyOccupancyDisplayStatus) {
  switch (status) {
    case 'Occupied':
      return { color: 'success' as const, sx: undefined };
    case 'Statutory Tenant':
      return {
        color: 'warning' as const,
        sx: { bgcolor: `${INDIVIDUAL_THEME.warning}18`, color: INDIVIDUAL_THEME.warning, fontWeight: 600 }
      };
    default:
      return { color: 'default' as const, sx: { bgcolor: `${INDIVIDUAL_THEME.neutral}18`, color: INDIVIDUAL_THEME.neutral } };
  }
}
