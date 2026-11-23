import {
  AccountBalanceOutlined,
  ApartmentOutlined,
  BuildOutlined,
  DescriptionOutlined,
  FactCheckOutlined,
  FolderOutlined,
  HomeOutlined,
  InsightsOutlined,
  PeopleOutline,
  ReceiptLongOutlined,
  SettingsOutlined,
  TrendingDown
} from '@mui/icons-material';
import React from 'react';

export const drawerWidth = 240;

export type NavItem = {
  text: string;
  icon: React.ReactElement;
  path: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: '',
    items: [
      { text: 'Dashboard', icon: React.createElement(HomeOutlined), path: '/individual-dashboard' },
      { text: 'Properties', icon: React.createElement(ApartmentOutlined), path: '/individual-dashboard/properties' },
      { text: 'Tenants', icon: React.createElement(PeopleOutline), path: '/individual-dashboard/tenants' },
      { text: 'Leases', icon: React.createElement(DescriptionOutlined), path: '/individual-dashboard/leases' },
      { text: 'Inspections', icon: React.createElement(FactCheckOutlined), path: '/individual-dashboard/inspections' },
      { text: 'Maintenance', icon: React.createElement(BuildOutlined), path: '/individual-dashboard/maintenance' },
      { text: 'Files', icon: React.createElement(FolderOutlined), path: '/individual-dashboard/files' }
    ]
  },
  {
    title: 'Finance',
    items: [
      { text: 'Rent Collection', icon: React.createElement(ReceiptLongOutlined), path: '/individual-dashboard/rent-collection' },
      { text: 'Expenses', icon: React.createElement(TrendingDown), path: '/individual-dashboard/expenses' },
      { text: 'Bills & Levies', icon: React.createElement(DescriptionOutlined), path: '/individual-dashboard/bills' },
      { text: 'Accounting', icon: React.createElement(AccountBalanceOutlined), path: '/individual-dashboard/accounting' },
      { text: 'Reports & Insights', icon: React.createElement(InsightsOutlined), path: '/individual-dashboard/reports' },
      { text: 'Settings', icon: React.createElement(SettingsOutlined), path: '/individual-dashboard/settings' }
    ]
  }
];

/** Tax centres stay available from Reports. They are not primary navigation. */
export const TAX_CENTRE_LINKS = [
  ['tax/vat', 'VAT summary'],
  ['tax/rental', 'Rental tax summary'],
  ['tax/income', 'Income tax summary'],
  ['tax/compliance', 'Tax Compliance']
];

export function getNavSections(base = '/individual-dashboard'): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      path: item.path.replace('/individual-dashboard', base)
    }))
  }));
}

export const expenseCategories = [
  'Repairs', 'Maintenance', 'Utilities', 'Levies', 'Municipal Rates',
  'Insurance', 'Security', 'Property Management', 'Other'
];

export const billCategories = ['Municipal', 'Municipal Rates', 'Levies', 'Insurance', 'Utilities'] as const;

export const billSubsections = [
  { key: 'Municipal', label: 'Municipal Bills' },
  { key: 'Levies', label: 'Levies' },
  { key: 'Insurance', label: 'Insurance' },
  { key: 'Utilities', label: 'Utilities' },
  { key: 'Other', label: 'Custom Charges' }
];

export const reportGroups = [
  {
    title: 'Financial Reports',
    reports: [
      ['profit-loss', 'Profit & Loss'],
      ['cashflow', 'Cashflow'],
      ['tax-preparation', 'Tax Summary'],
      ['property-performance', 'Income Statement'],
      ['expense', 'Expense Summary']
    ]
  },
  {
    title: 'Property Reports',
    reports: [
      ['property-performance', 'Property Performance'],
      ['expense', 'Maintenance Summary'],
      ['occupancy', 'Occupancy Report'],
      ['property-performance', 'Property Ledger']
    ]
  },
  {
    title: 'Tenant Reports',
    reports: [
      ['rent-collection', 'Rent Collection'],
      ['rent-collection', 'Tenant Ledger'],
      ['occupancy', 'Lease Summary']
    ]
  }
];

export const fileCategories = [
  'Leases', 'Inspection Reports', 'Receipts', 'Invoices',
  'Municipal Bills', 'Insurance', 'Property Photos',
  'Maintenance Documents', 'Other'
];
