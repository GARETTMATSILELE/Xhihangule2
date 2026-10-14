import {
  AccountBalance,
  Assessment,
  Build,
  Dashboard,
  Description,
  FactCheck,
  Folder,
  HomeWork,
  People,
  Receipt,
  Settings,
  TrendingDown
} from '@mui/icons-material';
import React from 'react';

export const drawerWidth = 280;

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
    items: [{ text: 'Dashboard', icon: React.createElement(Dashboard), path: '/individual-dashboard' }]
  },
  {
    title: 'Properties',
    items: [
      { text: 'Properties', icon: React.createElement(HomeWork), path: '/individual-dashboard/properties' },
      { text: 'Tenants', icon: React.createElement(People), path: '/individual-dashboard/tenants' },
      { text: 'Leases', icon: React.createElement(Description), path: '/individual-dashboard/leases' },
      { text: 'Inspections', icon: React.createElement(FactCheck), path: '/individual-dashboard/inspections' },
      { text: 'Maintenance', icon: React.createElement(Build), path: '/individual-dashboard/maintenance' },
      { text: 'Files', icon: React.createElement(Folder), path: '/individual-dashboard/files' }
    ]
  },
  {
    title: 'Finance',
    items: [
      { text: 'Rent Collection', icon: React.createElement(Receipt), path: '/individual-dashboard/rent-collection' },
      { text: 'Expenses', icon: React.createElement(TrendingDown), path: '/individual-dashboard/expenses' },
      { text: 'Bills & Levies', icon: React.createElement(Description), path: '/individual-dashboard/bills' },
      { text: 'Accounting', icon: React.createElement(AccountBalance), path: '/individual-dashboard/accounting' },
      { text: 'VAT', icon: React.createElement(Receipt), path: '/individual-dashboard/tax/vat' },
      { text: 'Rental Tax', icon: React.createElement(AccountBalance), path: '/individual-dashboard/tax/rental' },
      { text: 'Income Tax', icon: React.createElement(Assessment), path: '/individual-dashboard/tax/income' },
      { text: 'Tax Compliance', icon: React.createElement(FactCheck), path: '/individual-dashboard/tax/compliance' }
    ]
  },
  {
    title: '',
    items: [
      { text: 'Reports', icon: React.createElement(Assessment), path: '/individual-dashboard/reports' },
      { text: 'Settings', icon: React.createElement(Settings), path: '/individual-dashboard/settings' }
    ]
  }
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
  'Maintenance', 'Municipal', 'Levies', 'Security', 'Insurance',
  'Gardening', 'Cleaning', 'Repairs', 'Utilities', 'Legal', 'Other'
];

export const billCategories = ['Municipal', 'Levies', 'Insurance', 'Utilities'] as const;

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
