import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../api/axios';
import { apiService } from '../../../api';
import { inspectionService } from '../../../services/inspectionService';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { billCategories } from '../constants';
import { portfolioHealthScore, propertyHealthScore } from '../utils/healthScore';
import { buildActionItems, buildOwnerBriefChecks } from '../utils/actionCenter';
import {
  getActiveLeaseForProperty,
  getLatestExpiredLeaseForProperty,
  getPropertyOccupancyDisplayStatus,
  groupLeasesByProperty,
  groupTenantsByProperty
} from '../utils/propertyOccupancy';
import useIndividualDashboard from './useIndividualDashboard';

function unwrapList(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.leases)) return raw.leases;
  if (Array.isArray(raw?.tenants)) return raw.tenants;
  if (Array.isArray(raw?.data?.tenants)) return raw.data.tenants;
  return [];
}

export function usePortfolioContext() {
  const { data, loading, error, reload } = useIndividualDashboard();
  const [leases, setLeases] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [auxLoading, setAuxLoading] = useState(true);

  const reloadAux = useCallback(async () => {
    try {
      setAuxLoading(true);
      const [leaseRes, tenantRes, maintRes, inspRes, expenseRows] = await Promise.all([
        api.get('/leases').catch(() => ({ data: [] })),
        api.get('/tenants', { params: { page: 1, limit: 10000 } }).catch(() => ({ data: [] })),
        apiService.getMaintenanceRequests().catch(() => ({ data: [] })),
        inspectionService.getInspections().catch(() => []),
        individualWorkspaceService.getExpenses().catch(() => [])
      ]);
      setLeases(unwrapList(leaseRes.data));
      setTenants(unwrapList(tenantRes.data));
      const maintList = Array.isArray(maintRes.data) ? maintRes.data : maintRes.data?.data || [];
      setMaintenance(maintList);
      setInspections(Array.isArray(inspRes) ? inspRes : []);
      const billRows = (Array.isArray(expenseRows) ? expenseRows : []).filter((e: any) =>
        billCategories.includes(e.category) || ['Municipal', 'Levies', 'Insurance', 'Utilities'].includes(String(e.category))
      );
      setBills(billRows);
    } finally {
      setAuxLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadAux();
  }, [reloadAux]);

  const refreshAll = useCallback(async () => {
    await Promise.all([reload(), reloadAux()]);
  }, [reload, reloadAux]);

  const leasesByProperty = useMemo(() => groupLeasesByProperty(leases), [leases]);
  const tenantsByProperty = useMemo(() => groupTenantsByProperty(tenants), [tenants]);

  const leaseByProperty = useMemo(() => {
    const map = new Map<string, any>();
    Array.from(leasesByProperty.entries()).forEach(([propertyId, propertyLeases]) => {
      const activeLease = getActiveLeaseForProperty(propertyLeases);
      if (activeLease) map.set(propertyId, activeLease);
    });
    return map;
  }, [leasesByProperty]);

  const maintenanceByProperty = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of maintenance) {
      const status = String(item.status || '').toLowerCase();
      if (!['closed', 'completed', 'cancelled'].includes(status)) {
        const pid = String(item.propertyId?._id || item.propertyId || '');
        if (pid) map.set(pid, (map.get(pid) || 0) + 1);
      }
    }
    return map;
  }, [maintenance]);

  const outstandingBillsByProperty = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    for (const bill of bills) {
      const status = String(bill.status || 'completed').toLowerCase();
      const due = bill.date ? new Date(bill.date) : null;
      if (status !== 'paid' && status !== 'completed' && due && due < now) {
        const pid = String(bill.propertyId || '');
        map.set(pid, (map.get(pid) || 0) + Number(bill.amount || 0));
      }
    }
    return map;
  }, [bills]);

  const propertyExtras = useMemo(() => {
    const extras: Record<string, { maintenanceOpen?: number; leaseDaysRemaining?: number | null; outstandingBills?: number }> = {};
    for (const p of data?.properties || []) {
      const lease = leaseByProperty.get(p.propertyId);
      const days = lease?.endDate
        ? Math.ceil((new Date(lease.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      extras[p.propertyId] = {
        maintenanceOpen: maintenanceByProperty.get(p.propertyId) || 0,
        leaseDaysRemaining: days,
        outstandingBills: outstandingBillsByProperty.get(p.propertyId) || 0
      };
    }
    return extras;
  }, [data?.properties, leaseByProperty, maintenanceByProperty, outstandingBillsByProperty]);

  const portfolioScore = useMemo(
    () => portfolioHealthScore(data?.properties || [], propertyExtras),
    [data?.properties, propertyExtras]
  );

  const enrichedProperties = useMemo(
    () => (data?.properties || []).map((p) => {
      const propertyLeases = leasesByProperty.get(p.propertyId) || [];
      const propertyTenants = tenantsByProperty.get(p.propertyId) || [];
      const activeLease = getActiveLeaseForProperty(propertyLeases);
      const expiredLease = getLatestExpiredLeaseForProperty(propertyLeases);
      const occupancyDisplayStatus = getPropertyOccupancyDisplayStatus(propertyLeases, propertyTenants);
      const leaseForDates = activeLease || expiredLease;

      const occupancyStatus = occupancyDisplayStatus === 'Vacant' ? 'Vacant' as const : 'Occupied' as const;
      const occupancyAdjusted = { ...p, occupancyStatus };

      return {
        ...occupancyAdjusted,
        occupancyDisplayStatus,
        displayLease: leaseForDates,
        healthScore: propertyHealthScore(occupancyAdjusted, propertyExtras[p.propertyId]),
        leaseEndDate: leaseForDates?.endDate,
        openMaintenance: maintenanceByProperty.get(p.propertyId) || 0,
        outstandingBills: outstandingBillsByProperty.get(p.propertyId) || 0
      };
    }),
    [data?.properties, propertyExtras, leasesByProperty, tenantsByProperty, maintenanceByProperty, outstandingBillsByProperty]
  );

  const outstandingBillsTotal = useMemo(
    () => bills.reduce((sum, b) => {
      const status = String(b.status || 'completed').toLowerCase();
      if (status === 'paid' || status === 'completed') return sum;
      return sum + Number(b.amount || 0);
    }, 0),
    [bills]
  );

  const billsDueThisMonth = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return bills.filter((b) => {
      const d = b.date ? new Date(b.date) : null;
      const status = String(b.status || 'completed').toLowerCase();
      return d && d >= start && d < end && status !== 'paid' && status !== 'completed';
    }).length;
  }, [bills]);

  const maintenanceOpen = useMemo(
    () => maintenance.filter((m) => !['closed', 'completed', 'cancelled'].includes(String(m.status || '').toLowerCase())).length,
    [maintenance]
  );

  const upcomingLeaseRenewals = useMemo(
    () => leases.filter((l) => {
      const status = String(l.status || '').toLowerCase();
      if (!['active', 'expiring_soon'].includes(status)) return false;
      const days = Math.ceil((new Date(l.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 90;
    }).length,
    [leases]
  );

  const occupancyCounts = useMemo(() => {
    const occupied = enrichedProperties.filter((p) => p.occupancyDisplayStatus !== 'Vacant').length;
    return {
      occupied,
      vacant: Math.max(0, enrichedProperties.length - occupied)
    };
  }, [enrichedProperties]);

  const actionItems = useMemo(() => buildActionItems({
    outstandingRent: data?.summary.outstandingRent || 0,
    leases,
    inspections,
    maintenance: maintenance.slice(0, 20),
    billsDue: billsDueThisMonth,
    outstandingBills: outstandingBillsTotal,
    properties: data?.properties || []
  }), [data, leases, inspections, maintenance, billsDueThisMonth, outstandingBillsTotal]);

  const ownerBriefChecks = useMemo(() => buildOwnerBriefChecks({
    outstandingRent: data?.summary.outstandingRent || 0,
    leases,
    maintenanceOpen,
    netProfit: data?.summary.netProfit || 0,
    outstandingBills: outstandingBillsTotal
  }), [data, leases, maintenanceOpen, outstandingBillsTotal]);

  return {
    data,
    loading: loading || auxLoading,
    error,
    refreshAll,
    leases,
    maintenance,
    inspections,
    bills,
    portfolioScore,
    enrichedProperties,
    occupancyCounts,
    actionItems,
    ownerBriefChecks,
    outstandingBillsTotal,
    billsDueThisMonth,
    maintenanceOpen,
    upcomingLeaseRenewals,
    leaseByProperty
  };
}

export default usePortfolioContext;
