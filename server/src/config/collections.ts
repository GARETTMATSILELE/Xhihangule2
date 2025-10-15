export const COLLECTIONS = {
  USERS: 'users',
  COMPANIES: 'companies',
  PROPERTIES: 'properties',
  TENANTS: 'tenants',
  LEASES: 'leases',
  PAYMENTS: 'payments',
  MAINTENANCE_REQUESTS: 'maintenancerequests',
  CHART_DATA: 'chartdatas',
  PROPERTY_OWNERS: 'propertyowners',
  SALES_OWNERS: 'salesowners',
  LEVY_PAYMENTS: 'levypayments',
  MUNICIPAL_PAYMENTS: 'municipalpayments',
  PROPERTY_ACCOUNTS: 'propertyaccounts',
  AGENT_ACCOUNTS: 'agentaccounts',
  VALUATIONS: 'valuations',
  DEVELOPMENTS: 'developments',
  DEVELOPMENT_UNITS: 'developmentunits',
  INSPECTIONS: 'inspections'
} as const; 

// Extend type to include inspections without breaking existing imports
export type CollectionsKeys = keyof typeof COLLECTIONS | 'INSPECTIONS';

// Backward-compatible augmentation for new collections
export const ensureCollections = {
  ...COLLECTIONS,
  INSPECTIONS: (COLLECTIONS as any).INSPECTIONS || 'inspections'
} as const;