export type ReportCategory = 'Financial Performance' | 'Property Performance' | 'Rental & Tenancy' | 'Tax & Compliance';

export type ReportSource = 'report' | 'tax' | 'leases';

export type ReportDefinition = {
  key: string;
  title: string;
  description: string;
  category: ReportCategory;
  source: ReportSource;
  reportType?: string;
  categoryFilter?: string;
  icon: 'pnl' | 'statement' | 'cashflow' | 'expense' | 'performance' | 'ledger' | 'occupancy' | 'maintenance' | 'rent' | 'tenant' | 'lease' | 'tax' | 'obligation' | 'history';
  emptyMessage: string;
  note?: string;
};

export const REPORT_SECTIONS: ReportCategory[] = [
  'Financial Performance',
  'Property Performance',
  'Rental & Tenancy',
  'Tax & Compliance'
];

export const REPORT_CATALOG: ReportDefinition[] = [
  {
    key: 'profit-loss',
    title: 'Profit & Loss',
    description: 'Review rental income, operating expenses and net property performance.',
    category: 'Financial Performance',
    source: 'report',
    reportType: 'profit-loss',
    icon: 'pnl',
    emptyMessage: 'No financial activity found for this reporting period.'
  },
  {
    key: 'income-statement',
    title: 'Income Statement',
    description: 'Income, operating expenses and the net result for each property.',
    category: 'Financial Performance',
    source: 'report',
    reportType: 'property-performance',
    icon: 'statement',
    emptyMessage: 'No financial activity found for this reporting period.'
  },
  {
    key: 'cashflow',
    title: 'Cashflow',
    description: 'Income received and operating expenses recorded in the period.',
    category: 'Financial Performance',
    source: 'report',
    reportType: 'cashflow',
    icon: 'cashflow',
    emptyMessage: 'No financial activity found for this reporting period.',
    note: 'This uses the property ledger result. It is not a bank reconciliation.'
  },
  {
    key: 'expense-summary',
    title: 'Expense Summary',
    description: 'Operating expenditure recorded against your properties.',
    category: 'Financial Performance',
    source: 'report',
    reportType: 'expense',
    icon: 'expense',
    emptyMessage: 'No expenses found for this reporting period.'
  },
  {
    key: 'property-performance',
    title: 'Property Performance',
    description: 'Compare income, expenses and net result across the portfolio.',
    category: 'Property Performance',
    source: 'report',
    reportType: 'property-performance',
    icon: 'performance',
    emptyMessage: 'No property results found for this reporting period.'
  },
  {
    key: 'property-ledger',
    title: 'Property Ledger',
    description: 'Ledger entries and the running balance for the selected period.',
    category: 'Property Performance',
    source: 'report',
    reportType: 'property-ledger',
    icon: 'ledger',
    emptyMessage: 'No ledger entries found for this reporting period.',
    note: 'The balance includes activity from before the selected period.'
  },
  {
    key: 'occupancy',
    title: 'Occupancy Report',
    description: 'See which properties are occupied and which are vacant.',
    category: 'Property Performance',
    source: 'report',
    reportType: 'occupancy',
    icon: 'occupancy',
    emptyMessage: 'No properties found for this reporting period.'
  },
  {
    key: 'maintenance-summary',
    title: 'Maintenance Summary',
    description: 'Maintenance and repair costs recorded in the period.',
    category: 'Property Performance',
    source: 'report',
    reportType: 'expense',
    categoryFilter: 'Maintenance',
    icon: 'maintenance',
    emptyMessage: 'No maintenance expenses found for this reporting period.'
  },
  {
    key: 'rent-collection',
    title: 'Rent Collection',
    description: 'Expected rent, rent received and what is still outstanding.',
    category: 'Rental & Tenancy',
    source: 'report',
    reportType: 'rent-collection',
    icon: 'rent',
    emptyMessage: 'No rent activity found for this reporting period.'
  },
  {
    key: 'tenant-ledger',
    title: 'Tenant Ledger',
    description: 'Rent expected, collected and outstanding for each property.',
    category: 'Rental & Tenancy',
    source: 'report',
    reportType: 'rent-collection',
    icon: 'tenant',
    emptyMessage: 'No rent activity found for this reporting period.',
    note: 'Rent is reported by property. A line-by-line tenant statement is not available from the reporting service.'
  },
  {
    key: 'lease-summary',
    title: 'Lease Summary',
    description: 'Lease dates, status and rent for the properties you select.',
    category: 'Rental & Tenancy',
    source: 'leases',
    icon: 'lease',
    emptyMessage: 'No leases found for this selection.'
  },
  {
    key: 'tax-summary',
    title: 'Tax Summary',
    description: 'VAT, rental tax and income tax figures from the existing tax working papers.',
    category: 'Tax & Compliance',
    source: 'tax',
    icon: 'tax',
    emptyMessage: 'No tax figures are available for this reporting period.'
  },
  {
    key: 'tax-obligations',
    title: 'Tax Obligations',
    description: 'Calculated tax amounts and their status. Nothing is estimated in this screen.',
    category: 'Tax & Compliance',
    source: 'tax',
    icon: 'obligation',
    emptyMessage: 'No calculated tax obligations are available for this reporting period.'
  },
  {
    key: 'tax-payment-history',
    title: 'Tax Payment History',
    description: 'Tax payments already recorded on the rental and income tax working papers.',
    category: 'Tax & Compliance',
    source: 'tax',
    icon: 'history',
    emptyMessage: 'No tax payments recorded for this reporting period.'
  }
];

export function reportByKey(key?: string) {
  return REPORT_CATALOG.find((report) => report.key === key);
}
