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
  INSPECTIONS: 'inspections',
  VAT_PAYOUTS: 'vatpayouts',
  CHART_OF_ACCOUNTS: 'chartofaccounts',
  JOURNAL_ENTRIES: 'journalentries',
  JOURNAL_LINES: 'journallines',
  VAT_RECORDS: 'vatrecords',
  COMPANY_BALANCES: 'companybalances',
  BANK_ACCOUNTS: 'bankaccounts',
  BANK_TRANSACTIONS: 'banktransactions',
  ACCOUNTING_EVENT_LOGS: 'accountingeventlogs',
  TRUST_ACCOUNTS: 'trustaccounts',
  TRUST_TRANSACTIONS: 'trusttransactions',
  TAX_RECORDS: 'taxrecords',
  TRUST_SETTLEMENTS: 'trustsettlements',
  TRUST_AUDIT_LOGS: 'trustauditlogs',
  TRUST_EVENT_FAILURE_LOGS: 'trusteventfailurelogs',
  TRUST_RECONCILIATION_RESULTS: 'trustreconciliationresults',
  WEBHOOK_EVENT_RECEIPTS: 'webhookeventreceipts',
  EVENT_DEDUP_RECORDS: 'eventdeduprecords',
  MIGRATION_STATE: 'migration_state'
} as const; 

// Extend type to include inspections without breaking existing imports
export type CollectionsKeys = keyof typeof COLLECTIONS | 'INSPECTIONS';

// Backward-compatible augmentation for new collections
export const ensureCollections = {
  ...COLLECTIONS,
  INSPECTIONS: (COLLECTIONS as any).INSPECTIONS || 'inspections',
  VAT_PAYOUTS: (COLLECTIONS as any).VAT_PAYOUTS || 'vatpayouts'
} as const;