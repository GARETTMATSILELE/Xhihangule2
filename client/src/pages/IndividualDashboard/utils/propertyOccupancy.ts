import { getLeaseLifecycleStatus } from '../../../utils/leaseLifecycle';
import { INDIVIDUAL_THEME } from '../theme';

export type PropertyOccupancyDisplayStatus = 'Vacant' | 'Occupied' | 'Statutory Tenant';

function getPropertyId(lease: any): string {
  return String(lease?.propertyId?._id || lease?.propertyId || '');
}

export function groupLeasesByProperty(leases: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const lease of leases) {
    const propertyId = getPropertyId(lease);
    if (!propertyId) continue;
    const rows = map.get(propertyId) || [];
    rows.push(lease);
    map.set(propertyId, rows);
  }
  return map;
}

export function getPropertyOccupancyDisplayStatus(leasesForProperty: any[]): PropertyOccupancyDisplayStatus {
  if (!leasesForProperty.length) return 'Vacant';

  const lifecycleStatuses = leasesForProperty.map((lease) => getLeaseLifecycleStatus(lease));

  if (lifecycleStatuses.some((status) => status === 'active' || status === 'expiring_soon')) {
    return 'Occupied';
  }

  if (lifecycleStatuses.some((status) => status === 'expired')) {
    return 'Statutory Tenant';
  }

  return 'Vacant';
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
