import { ReportDefinition } from '../core/types';
import { compareText } from '../core/engine';
import { formatDateValue, formatMoneyValue, formatPercentValue } from '../core/format';

export type PropertyReportRow = {
  id: string;
  address: string;
  name: string;
  propertyType: string;
  propertyCategory: string;
  occupancyStatus: 'Rented' | 'Vacant' | string;
  ownerName: string;
  agentId: string;
  agentName: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  rentAmount: number | null;
  commissionPercent: number | null;
  commissionAmount: number | null;
  levyAmount: number | null;
  currency: string;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  leasePeriod: string;
  paidUpTo: string;
  leaseStatus: string;
  createdAt: string | null;
  updatedAt: string | null;
  recency: number;
};

export type PropertyDetailsReportResponse = {
  reportType: string;
  company: {
    name: string;
    logo?: string;
  };
  generatedAt: string;
  properties: PropertyReportRow[];
};

const money = (value: unknown, row: PropertyReportRow) => formatMoneyValue(value, row.currency || 'USD');

export const propertyDetailsReportDefinition: ReportDefinition<PropertyReportRow> = {
  type: 'property-details',
  title: 'Property Details Report',
  defaultSort: 'recent',
  defaultGroup: 'occupancy',
  fields: [
    { key: 'address', label: 'Property Address', group: 'Property', getValue: (row) => row.address, defaultSelected: true },
    { key: 'name', label: 'Property Name', group: 'Property', getValue: (row) => row.name },
    { key: 'propertyType', label: 'Property Type', group: 'Property', getValue: (row) => row.propertyType },
    { key: 'propertyCategory', label: 'Residential / Commercial', group: 'Property', getValue: (row) => row.propertyCategory },
    { key: 'occupancyStatus', label: 'Occupancy Status', group: 'Property', getValue: (row) => row.occupancyStatus, defaultSelected: true },
    { key: 'ownerName', label: 'Owner', group: 'Property', getValue: (row) => row.ownerName, defaultSelected: true },
    { key: 'agentName', label: 'Agent', group: 'Property', getValue: (row) => row.agentName },
    { key: 'tenantName', label: 'Tenant Name', group: 'Tenant', getValue: (row) => row.tenantName },
    { key: 'tenantPhone', label: 'Tenant Phone', group: 'Tenant', getValue: (row) => row.tenantPhone },
    { key: 'tenantEmail', label: 'Tenant Email', group: 'Tenant', getValue: (row) => row.tenantEmail },
    { key: 'rentAmount', label: 'Rent Amount', group: 'Financial', getValue: (row) => row.rentAmount, format: money, defaultSelected: true },
    { key: 'commissionPercent', label: 'Commission %', group: 'Financial', getValue: (row) => row.commissionPercent, format: formatPercentValue },
    { key: 'commissionAmount', label: 'Commission Amount', group: 'Financial', getValue: (row) => row.commissionAmount, format: money },
    { key: 'levyAmount', label: 'Levy Amount', group: 'Financial', getValue: (row) => row.levyAmount, format: money },
    { key: 'currency', label: 'Currency', group: 'Financial', getValue: (row) => row.currency },
    { key: 'leaseStartDate', label: 'Lease Start', group: 'Lease', getValue: (row) => row.leaseStartDate, format: formatDateValue },
    { key: 'leaseEndDate', label: 'Lease End', group: 'Lease', getValue: (row) => row.leaseEndDate, format: formatDateValue },
    { key: 'leasePeriod', label: 'Lease Period', group: 'Lease', getValue: (row) => row.leasePeriod },
    { key: 'paidUpTo', label: 'Paid Up To', group: 'Lease', getValue: (row) => row.paidUpTo },
    { key: 'leaseStatus', label: 'Lease Status', group: 'Lease', getValue: (row) => row.leaseStatus },
  ],
  filters: [
    {
      key: 'occupancy',
      label: 'Occupancy',
      options: [
        { value: 'all', label: 'All' },
        { value: 'rented', label: 'Rented' },
        { value: 'vacant', label: 'Vacant' },
      ],
      match: (row, value) => row.occupancyStatus.toLowerCase() === value,
    },
    {
      key: 'propertyType',
      label: 'Property Type',
      options: [
        { value: 'all', label: 'All' },
        { value: 'residential', label: 'Residential' },
        { value: 'commercial', label: 'Commercial' },
      ],
      match: (row, value) => row.propertyCategory.toLowerCase() === value,
    },
    {
      key: 'agent',
      label: 'Agent',
      options: [{ value: 'all', label: 'All agents' }],
      getOptions: (rows) => {
        const agents = new Map<string, string>();
        let hasUnassigned = false;
        for (const row of rows) {
          if (row.agentId) {
            if (!agents.has(row.agentId)) agents.set(row.agentId, row.agentName || 'Agent');
          } else {
            hasUnassigned = true;
          }
        }
        const options = Array.from(agents.entries())
          .sort((a, b) => compareText(a[1], b[1]))
          .map(([value, label]) => ({ value, label }));
        if (hasUnassigned) options.push({ value: 'unassigned', label: 'Unassigned' });
        return [{ value: 'all', label: 'All agents' }, ...options];
      },
      match: (row, value) => (value === 'unassigned' ? !row.agentId : row.agentId === value),
    },
  ],
  sorts: [
    { key: 'recent', label: 'Most Recent', compare: (a, b) => (b.recency || 0) - (a.recency || 0) },
    { key: 'oldest', label: 'Oldest', compare: (a, b) => (a.recency || 0) - (b.recency || 0) },
    { key: 'address-asc', label: 'Property Address A–Z', compare: (a, b) => compareText(a.address, b.address) },
    { key: 'address-desc', label: 'Property Address Z–A', compare: (a, b) => compareText(b.address, a.address) },
    { key: 'owner-asc', label: 'Owner A–Z', compare: (a, b) => compareText(a.ownerName, b.ownerName) },
    { key: 'owner-desc', label: 'Owner Z–A', compare: (a, b) => compareText(b.ownerName, a.ownerName) },
    { key: 'agent-asc', label: 'Agent A–Z', compare: (a, b) => compareText(a.agentName, b.agentName) },
    { key: 'agent-desc', label: 'Agent Z–A', compare: (a, b) => compareText(b.agentName, a.agentName) },
  ],
  groups: [
    {
      key: 'occupancy',
      label: 'Rented / Vacant',
      getGroupKey: (row) => (row.occupancyStatus === 'Vacant' ? 'vacant' : 'rented'),
      groupOrder: ['rented', 'vacant'],
      groupLabels: {
        rented: 'Rented Properties',
        vacant: 'Vacant Properties',
      },
    },
  ],
  search: (row, query) => {
    const haystack = [row.address, row.name, row.ownerName, row.agentName, row.tenantName].join(' ').toLowerCase();
    return haystack.includes(query);
  },
};
