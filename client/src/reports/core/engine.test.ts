import { describe, expect, it } from 'vitest';
import { buildReport, cellValue } from './engine';
import { propertyDetailsReportDefinition, PropertyReportRow } from '../definitions/propertyDetails';

function row(partial: Partial<PropertyReportRow> & Pick<PropertyReportRow, 'id' | 'address'>): PropertyReportRow {
  return {
    name: '',
    propertyType: 'House',
    propertyCategory: 'Residential',
    occupancyStatus: 'Rented',
    ownerName: '',
    agentId: '',
    agentName: '',
    tenantName: '',
    tenantPhone: '',
    tenantEmail: '',
    rentAmount: null,
    commissionPercent: null,
    commissionAmount: null,
    levyAmount: null,
    currency: 'USD',
    leaseStartDate: null,
    leaseEndDate: null,
    leasePeriod: '',
    paidUpTo: '',
    leaseStatus: '',
    createdAt: null,
    updatedAt: null,
    recency: 0,
    ...partial,
  };
}

const sample: PropertyReportRow[] = [
  row({
    id: '1',
    address: '23 Kingsmead Road, Borrowdale, Harare',
    name: 'Kingsmead 23',
    occupancyStatus: 'Rented',
    ownerName: 'Alice Owner',
    agentId: 'agent-a',
    agentName: 'Amy Agent',
    tenantName: 'Tom Tenant',
    tenantPhone: '0771111111',
    tenantEmail: 'tom@example.com',
    rentAmount: 1000,
    commissionPercent: 10,
    commissionAmount: 100,
    levyAmount: 50,
    leaseStartDate: '2026-01-01',
    leaseEndDate: '2026-12-31',
    leasePeriod: '12 months',
    paidUpTo: 'March 2026',
    leaseStatus: 'Active',
    recency: 300,
    propertyCategory: 'Residential',
  }),
  row({
    id: '2',
    address: '15 Borrowdale Road',
    name: 'Borrowdale 15',
    occupancyStatus: 'Rented',
    ownerName: 'Bob Owner',
    agentId: 'agent-b',
    agentName: 'Ben Agent',
    tenantName: 'Tina Tenant',
    rentAmount: 800,
    commissionPercent: 15,
    leasePeriod: '6 months',
    paidUpTo: 'February 2026',
    recency: 200,
    propertyCategory: 'Commercial',
    propertyType: 'commercial',
  }),
  row({
    id: '3',
    address: '21 Fife Avenue',
    name: 'Fife 21',
    occupancyStatus: 'Vacant',
    ownerName: 'Cara Owner',
    agentId: 'agent-a',
    agentName: 'Amy Agent',
    recency: 400,
    propertyCategory: 'Residential',
  }),
  row({
    id: '4',
    address: '7 Kingsmead Road',
    name: 'Kingsmead 7',
    occupancyStatus: 'Vacant',
    ownerName: 'Dan Owner',
    agentId: 'agent-b',
    agentName: 'Ben Agent',
    recency: 100,
    propertyCategory: 'Commercial',
    propertyType: 'commercial',
  }),
];

const getId = (item: PropertyReportRow) => item.id;

describe('property details report engine', () => {
  it('Test 1 — everything includes all selected fields and properties', () => {
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: propertyDetailsReportDefinition.fields.map((field) => field.key),
      filters: { occupancy: 'all', propertyType: 'all' },
      sortKey: 'recent',
      groupKey: 'occupancy',
      getId,
    });
    expect(report.totalCount).toBe(4);
    expect(report.selectedFields.map((field) => field.key)).toContain('address');
    expect(report.selectedFields.map((field) => field.key)).toContain('paidUpTo');
    expect(report.selectedFields).toHaveLength(propertyDetailsReportDefinition.fields.length);
  });

  it('Test 2 — address only returns only the address field', () => {
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: ['address'],
      filters: { occupancy: 'all', propertyType: 'all' },
      sortKey: 'address-asc',
      groupKey: null,
      getId,
    });
    expect(report.selectedFields).toHaveLength(1);
    expect(report.selectedFields[0].key).toBe('address');
    expect(report.sections[0].rows.map((item) => cellValue(report.selectedFields[0], item))).toEqual([
      '15 Borrowdale Road',
      '21 Fife Avenue',
      '23 Kingsmead Road, Borrowdale, Harare',
      '7 Kingsmead Road',
    ]);
  });

  it('Test 3 — rented only excludes vacant properties', () => {
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: ['address'],
      filters: { occupancy: 'rented', propertyType: 'all' },
      sortKey: 'recent',
      groupKey: 'occupancy',
      getId,
    });
    expect(report.sections.map((section) => section.key)).toEqual(['rented']);
    expect(report.sections[0].rows.every((item) => item.occupancyStatus === 'Rented')).toBe(true);
  });

  it('Test 4 — vacant only shows only vacant properties', () => {
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: ['address'],
      filters: { occupancy: 'vacant', propertyType: 'all' },
      sortKey: 'recent',
      groupKey: 'occupancy',
      getId,
    });
    expect(report.sections.map((section) => section.key)).toEqual(['vacant']);
    expect(report.totalCount).toBe(2);
  });

  it('Test 5 — residential only excludes commercial properties', () => {
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: ['address', 'propertyCategory'],
      filters: { occupancy: 'all', propertyType: 'residential' },
      sortKey: 'recent',
      groupKey: null,
      getId,
    });
    expect(report.sections[0].rows.every((item) => item.propertyCategory === 'Residential')).toBe(true);
    expect(report.totalCount).toBe(2);
  });

  it('Test 6 — rented properties appear first and vacant properties are grouped at the bottom', () => {
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: ['address'],
      filters: { occupancy: 'all', propertyType: 'all' },
      sortKey: 'recent',
      groupKey: 'occupancy',
      getId,
    });
    expect(report.sections.map((section) => section.label)).toEqual(['Rented Properties', 'Vacant Properties']);
    expect(report.sections[0].rows.map((item) => item.address)).toEqual([
      '23 Kingsmead Road, Borrowdale, Harare',
      '15 Borrowdale Road',
    ]);
    expect(report.sections[1].rows.map((item) => item.address)).toEqual([
      '21 Fife Avenue',
      '7 Kingsmead Road',
    ]);
  });

  it('Test 7 — most recent sorting puts newest properties first within each group', () => {
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: ['address'],
      filters: { occupancy: 'all', propertyType: 'all' },
      sortKey: 'recent',
      groupKey: 'occupancy',
      getId,
    });
    expect(report.sections[0].rows.map((item) => item.recency)).toEqual([300, 200]);
    expect(report.sections[1].rows.map((item) => item.recency)).toEqual([400, 100]);
  });

  it('Test 8 — selected fields become table columns in definition order', () => {
    const keys = ['address', 'ownerName', 'tenantName', 'rentAmount', 'commissionPercent', 'leasePeriod', 'paidUpTo'];
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: keys,
      filters: { occupancy: 'all', propertyType: 'all' },
      sortKey: 'recent',
      groupKey: null,
      getId,
    });
    expect(report.selectedFields.map((field) => field.key)).toEqual(keys);
    expect(report.selectedFields.map((field) => field.label)).toEqual([
      'Property Address',
      'Owner',
      'Tenant Name',
      'Rent Amount',
      'Commission %',
      'Lease Period',
      'Paid Up To',
    ]);
  });

  it('Test 9 — missing information displays as an em dash', () => {
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: ['tenantName', 'tenantPhone', 'rentAmount', 'levyAmount', 'paidUpTo'],
      filters: { occupancy: 'vacant', propertyType: 'all' },
      sortKey: 'recent',
      groupKey: null,
      getId,
    });
    const vacant = report.sections[0].rows[0];
    expect(cellValue(report.selectedFields[0], vacant)).toBe('—');
    expect(cellValue(report.selectedFields[1], vacant)).toBe('—');
    expect(cellValue(report.selectedFields[2], vacant)).toBe('—');
    expect(cellValue(report.selectedFields[3], vacant)).toBe('—');
    expect(cellValue(report.selectedFields[4], vacant)).toBe('—');
  });

  it('does not invent values and keeps selected-property scoping', () => {
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: ['address'],
      filters: { occupancy: 'all', propertyType: 'all' },
      sortKey: 'recent',
      groupKey: null,
      selectedIds: ['1', '4'],
      getId,
    });
    expect(report.sections[0].rows.map((item) => item.id).sort()).toEqual(['1', '4']);
  });

  it('filters properties by associated agent', () => {
    const report = buildReport(sample, propertyDetailsReportDefinition, {
      selectedKeys: ['address', 'agentName'],
      filters: { occupancy: 'all', propertyType: 'all', agent: 'agent-a' },
      sortKey: 'recent',
      groupKey: null,
      getId,
    });
    expect(report.totalCount).toBe(2);
    expect(report.sections[0].rows.every((item) => item.agentId === 'agent-a')).toBe(true);
    expect(report.sections[0].rows.map((item) => item.id).sort()).toEqual(['1', '3']);
  });
});
