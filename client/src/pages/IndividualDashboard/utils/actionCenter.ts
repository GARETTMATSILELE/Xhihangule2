export type ActionPriority = 'critical' | 'warning' | 'success' | 'info';

export type ActionItem = {
  id: string;
  priority: ActionPriority;
  icon: string;
  title: string;
  description: string;
  link: string;
};

type BuildActionParams = {
  outstandingRent: number;
  leases: Array<{ _id: string; propertyId: any; endDate: string; status: string }>;
  inspections: Array<{ _id: string; status: string; scheduledDate?: string; propertyId?: any }>;
  maintenance: Array<{ _id: string; status: string; title?: string; propertyId?: any }>;
  billsDue: number;
  outstandingBills: number;
  properties: Array<{ propertyId: string; propertyName: string; rentCollectionStatus: string }>;
};

function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function buildActionItems(params: BuildActionParams): ActionItem[] {
  const items: ActionItem[] = [];

  if (params.outstandingRent > 0) {
    items.push({
      id: 'rent-overdue',
      priority: 'critical',
      icon: '🔴',
      title: 'Rent overdue',
      description: `$${params.outstandingRent.toFixed(2)} outstanding across your portfolio`,
      link: '/individual-dashboard/rent-collection'
    });
  }

  for (const lease of params.leases) {
    const status = String(lease.status || '').toLowerCase();
    if (!['active', 'expiring_soon'].includes(status)) continue;
    const days = daysUntil(lease.endDate);
    if (days >= 0 && days <= 30) {
      items.push({
        id: `lease-${lease._id}`,
        priority: 'warning',
        icon: '🟡',
        title: `Lease expires in ${days} days`,
        description: 'Review renewal options before expiry',
        link: '/individual-dashboard/leases'
      });
    }
  }

  for (const inspection of params.inspections) {
    const status = String(inspection.status || '').toLowerCase();
    if (['overdue', 'due_today'].includes(status)) {
      items.push({
        id: `inspection-${inspection._id}`,
        priority: 'warning',
        icon: '🟡',
        title: 'Inspection due',
        description: 'Schedule or complete pending inspection',
        link: '/individual-dashboard/inspections'
      });
    }
  }

  for (const item of params.maintenance) {
    const status = String(item.status || '').toLowerCase();
    if (['open', 'pending', 'submitted', 'in_progress'].includes(status)) {
      items.push({
        id: `maintenance-${item._id}`,
        priority: 'warning',
        icon: '🟡',
        title: item.title || 'Maintenance in progress',
        description: 'Open maintenance request needs attention',
        link: '/individual-dashboard/maintenance'
      });
    } else if (status === 'closed' || status === 'completed') {
      items.push({
        id: `maintenance-done-${item._id}`,
        priority: 'success',
        icon: '🟢',
        title: 'Maintenance completed',
        description: item.title || 'Work order closed',
        link: '/individual-dashboard/maintenance'
      });
    }
  }

  if (params.billsDue > 0) {
    items.push({
      id: 'bills-due',
      priority: 'warning',
      icon: '🟡',
      title: `${params.billsDue} bill${params.billsDue > 1 ? 's' : ''} due this month`,
      description: 'Review municipal bills and levies',
      link: '/individual-dashboard/bills'
    });
  }

  if (params.outstandingBills <= 0 && params.outstandingRent <= 0) {
    items.push({
      id: 'bills-paid',
      priority: 'success',
      icon: '🟢',
      title: 'No outstanding bills',
      description: 'All tracked bills are up to date',
      link: '/individual-dashboard/bills'
    });
  }

  const paidProperties = params.properties.filter((p) => p.rentCollectionStatus === 'green');
  if (paidProperties.length && params.outstandingRent <= 0) {
    items.push({
      id: 'rent-collected',
      priority: 'success',
      icon: '🟢',
      title: 'Rent collected',
      description: `${paidProperties.length} propert${paidProperties.length > 1 ? 'ies' : 'y'} fully paid this month`,
      link: '/individual-dashboard/rent-collection'
    });
  }

  return items.slice(0, 12);
}

export function buildOwnerBriefChecks(params: {
  outstandingRent: number;
  leases: Array<{ endDate: string; status: string }>;
  maintenanceOpen: number;
  netProfit: number;
  outstandingBills: number;
}) {
  const overdueLeases = params.leases.filter((l) => {
    const status = String(l.status || '').toLowerCase();
    return ['active', 'expiring_soon'].includes(status) && daysUntil(l.endDate) < 0;
  }).length;

  return [
    { ok: params.outstandingRent <= 0, label: 'Rent collected' },
    { ok: overdueLeases === 0, label: 'No overdue leases' },
    { ok: params.maintenanceOpen === 0, label: 'No outstanding maintenance' },
    { ok: params.netProfit >= 0, label: 'Positive cashflow' },
    { ok: params.outstandingBills <= 0, label: 'No overdue bills' }
  ];
}
