import type { IndividualSummary } from '../services/individualWorkspaceService';
import type { ExecutiveDashboardData } from '../types/agencyOperations';

const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

function isoDaysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export const DEMO_INDIVIDUAL_COMPANY = {
  _id: 'demo-company-individual',
  name: 'Sample Landlord Portfolio',
  address: '8 Normandy Road, Alexandra Park, Harare',
  phone: '+263783222010',
  email: 'demo@mantisafrica.example',
  registrationNumber: '',
  tinNumber: '',
  ownerId: 'demo-owner',
  isActive: true,
  subscriptionStatus: 'trial' as const,
  companyType: 'INDIVIDUAL_LANDLORD' as const,
  workspaceType: 'individual' as const,
  plan: 'INDIVIDUAL' as const,
  bankAccounts: [],
  createdAt: '2026-01-15T08:00:00.000Z',
  updatedAt: '2026-09-16T08:00:00.000Z',
  __v: 0
};

export const DEMO_AGENCY_COMPANY = {
  ...DEMO_INDIVIDUAL_COMPANY,
  _id: 'demo-company-agency',
  name: 'Sample Agency Operations',
  companyType: 'REGISTERED_BUSINESS' as const,
  workspaceType: 'agency' as const,
  plan: 'SME' as const,
  registrationNumber: 'DEMO-REG-0001',
  tinNumber: 'DEMO-TIN-0001'
};

export function getDemoCompany() {
  return isAgencyDemo() ? DEMO_AGENCY_COMPANY : DEMO_INDIVIDUAL_COMPANY;
}

function isAgencyDemo() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/demo/enterprise');
}

export const DEMO_PROPERTIES: IndividualSummary['properties'] = [
  {
    propertyId: 'demo-prop-1',
    propertyName: '12 Arundel Road',
    address: '12 Arundel Road, Mount Pleasant, Harare',
    occupancyStatus: 'Occupied',
    monthlyRent: 1200,
    expectedRent: 1200,
    collectedRent: 1200,
    outstandingRent: 0,
    rentCollectionStatus: 'green',
    monthlyIncome: 1200,
    monthlyExpenses: 180,
    netProfit: 1020,
    annualProfit: 12240,
    runningBalance: 1020,
    occupancyPercent: 100,
    collectionPercent: 100,
    profitabilityPercent: 85,
    expenseRatio: 15,
    maintenanceDue: false
  },
  {
    propertyId: 'demo-prop-2',
    propertyName: 'Avondale Court 2A',
    address: '2A King George Road, Avondale, Harare',
    occupancyStatus: 'Occupied',
    monthlyRent: 850,
    expectedRent: 850,
    collectedRent: 400,
    outstandingRent: 450,
    rentCollectionStatus: 'amber',
    monthlyIncome: 400,
    monthlyExpenses: 140,
    netProfit: 260,
    annualProfit: 3120,
    runningBalance: -450,
    occupancyPercent: 100,
    collectionPercent: 47,
    profitabilityPercent: 31,
    expenseRatio: 35,
    maintenanceDue: true
  },
  {
    propertyId: 'demo-prop-3',
    propertyName: 'Borrowdale Cottage',
    address: 'Borrowdale Brooke, Harare',
    occupancyStatus: 'Vacant',
    monthlyRent: 1400,
    expectedRent: 1400,
    collectedRent: 0,
    outstandingRent: 0,
    rentCollectionStatus: 'red',
    monthlyIncome: 0,
    monthlyExpenses: 95,
    netProfit: -95,
    annualProfit: -1140,
    runningBalance: -95,
    occupancyPercent: 0,
    collectionPercent: 0,
    profitabilityPercent: 0,
    expenseRatio: 100,
    maintenanceDue: false
  },
  {
    propertyId: 'demo-prop-4',
    propertyName: 'Alexandra Park Townhouse',
    address: '8 Normandy Lane, Alexandra Park, Harare',
    occupancyStatus: 'Occupied',
    monthlyRent: 1100,
    expectedRent: 1100,
    collectedRent: 1100,
    outstandingRent: 0,
    rentCollectionStatus: 'green',
    monthlyIncome: 1100,
    monthlyExpenses: 160,
    netProfit: 940,
    annualProfit: 11280,
    runningBalance: 940,
    occupancyPercent: 100,
    collectionPercent: 100,
    profitabilityPercent: 85,
    expenseRatio: 15,
    maintenanceDue: false
  },
  {
    propertyId: 'demo-prop-5',
    propertyName: 'Greendale Duplex',
    address: '14 St Aubins Drive, Greendale, Harare',
    occupancyStatus: 'Occupied',
    monthlyRent: 950,
    expectedRent: 950,
    collectedRent: 950,
    outstandingRent: 0,
    rentCollectionStatus: 'green',
    monthlyIncome: 950,
    monthlyExpenses: 210,
    netProfit: 740,
    annualProfit: 8880,
    runningBalance: 740,
    occupancyPercent: 100,
    collectionPercent: 100,
    profitabilityPercent: 78,
    expenseRatio: 22,
    maintenanceDue: false
  },
  {
    propertyId: 'demo-prop-6',
    propertyName: 'Eastlea Townhouse',
    address: '3 McChlery Avenue, Eastlea, Harare',
    occupancyStatus: 'Occupied',
    monthlyRent: 780,
    expectedRent: 780,
    collectedRent: 780,
    outstandingRent: 0,
    rentCollectionStatus: 'green',
    monthlyIncome: 780,
    monthlyExpenses: 90,
    netProfit: 690,
    annualProfit: 8280,
    runningBalance: 690,
    occupancyPercent: 100,
    collectionPercent: 100,
    profitabilityPercent: 88,
    expenseRatio: 12,
    maintenanceDue: false
  }
];

export function getDemoIndividualSummary(): IndividualSummary {
  const occupied = DEMO_PROPERTIES.filter((p) => p.occupancyStatus === 'Occupied').length;
  const monthlyIncome = DEMO_PROPERTIES.reduce((sum, p) => sum + p.monthlyIncome, 0);
  const monthlyExpenses = DEMO_PROPERTIES.reduce((sum, p) => sum + p.monthlyExpenses, 0);
  const outstandingRent = DEMO_PROPERTIES.reduce((sum, p) => sum + p.outstandingRent, 0);
  const expectedRent = DEMO_PROPERTIES.reduce((sum, p) => sum + p.expectedRent, 0);

  return {
    summary: {
      totalProperties: DEMO_PROPERTIES.length,
      totalTenants: 5,
      occupiedUnits: occupied,
      vacantUnits: DEMO_PROPERTIES.length - occupied,
      monthlyIncome,
      monthlyExpenses,
      netProfit: monthlyIncome - monthlyExpenses,
      outstandingRent,
      netMonthlyCashflow: monthlyIncome - monthlyExpenses,
      rentCollectionRate: expectedRent ? Math.round((monthlyIncome / expectedRent) * 100) : 0
    },
    charts: {
      incomeTrend: months.map((month, i) => ({ month, amount: 4100 + i * 180 })),
      expenseTrend: months.map((month, i) => ({ month, amount: 820 - i * 20 })),
      occupancyRate: months.map((month, i) => ({ month, rate: 78 + i * 2 })),
      rentCollectionTrend: months.map((month, i) => ({ month, rate: 84 + i }))
    },
    properties: DEMO_PROPERTIES,
    recentActivity: [
      { type: 'rent', date: isoDaysFromNow(-2), description: 'Rent recorded — 12 Arundel Road', amount: 1200, propertyId: 'demo-prop-1' },
      { type: 'expense', date: isoDaysFromNow(-5), description: 'Municipal bill — Avondale Court 2A', amount: 86, propertyId: 'demo-prop-2' },
      { type: 'maintenance', date: isoDaysFromNow(-8), description: 'Geyser repair logged — Greendale Duplex', amount: 140, propertyId: 'demo-prop-5' }
    ]
  };
}

export function getDemoAccounting() {
  const dashboard = getDemoIndividualSummary();
  const ranked = [...dashboard.properties].sort((a, b) => b.netProfit - a.netProfit);
  return {
    ...dashboard,
    overview: {
      monthlyIncome: dashboard.summary.monthlyIncome,
      monthlyExpenses: dashboard.summary.monthlyExpenses,
      netProfit: dashboard.summary.netProfit,
      outstandingRent: dashboard.summary.outstandingRent
    },
    topPerformingProperties: ranked.slice(0, 3),
    worstPerformingProperties: ranked.slice(-2).reverse()
  };
}

export const DEMO_TENANTS = [
  { _id: 'demo-tenant-1', firstName: 'Nyasha', lastName: 'Moyo', status: 'Active', propertyId: { _id: 'demo-prop-1', name: '12 Arundel Road' }, email: 'nyasha.moyo@example.test', phone: '+263771000001' },
  { _id: 'demo-tenant-2', firstName: 'Tafadzwa', lastName: 'Dube', status: 'Active', propertyId: { _id: 'demo-prop-2', name: 'Avondale Court 2A' }, email: 'tafadzwa.dube@example.test', phone: '+263771000002' },
  { _id: 'demo-tenant-3', firstName: 'Rudo', lastName: 'Ncube', status: 'Active', propertyId: { _id: 'demo-prop-4', name: 'Alexandra Park Townhouse' }, email: 'rudo.ncube@example.test', phone: '+263771000003' },
  { _id: 'demo-tenant-4', firstName: 'Kudakwashe', lastName: 'Sibanda', status: 'Active', propertyId: { _id: 'demo-prop-5', name: 'Greendale Duplex' }, email: 'kuda.sibanda@example.test', phone: '+263771000004' },
  { _id: 'demo-tenant-5', firstName: 'Chipo', lastName: 'Mhlanga', status: 'Active', propertyId: { _id: 'demo-prop-6', name: 'Eastlea Townhouse' }, email: 'chipo.mhlanga@example.test', phone: '+263771000005' }
];

export const DEMO_LEASES = [
  { _id: 'demo-lease-1', propertyId: { _id: 'demo-prop-1', name: '12 Arundel Road' }, tenantId: 'demo-tenant-1', status: 'active', startDate: isoDaysFromNow(-280), endDate: isoDaysFromNow(85), rent: 1200 },
  { _id: 'demo-lease-2', propertyId: { _id: 'demo-prop-2', name: 'Avondale Court 2A' }, tenantId: 'demo-tenant-2', status: 'active', startDate: isoDaysFromNow(-410), endDate: isoDaysFromNow(18), rent: 850 },
  { _id: 'demo-lease-4', propertyId: { _id: 'demo-prop-4', name: 'Alexandra Park Townhouse' }, tenantId: 'demo-tenant-3', status: 'active', startDate: isoDaysFromNow(-190), endDate: isoDaysFromNow(175), rent: 1100 },
  { _id: 'demo-lease-5', propertyId: { _id: 'demo-prop-5', name: 'Greendale Duplex' }, tenantId: 'demo-tenant-4', status: 'active', startDate: isoDaysFromNow(-60), endDate: isoDaysFromNow(305), rent: 950 },
  { _id: 'demo-lease-6', propertyId: { _id: 'demo-prop-6', name: 'Eastlea Townhouse' }, tenantId: 'demo-tenant-5', status: 'active', startDate: isoDaysFromNow(-500), endDate: isoDaysFromNow(40), rent: 780 }
];

export const DEMO_MAINTENANCE = [
  {
    _id: 'demo-maint-1',
    title: 'Kitchen tap leak',
    status: 'in_progress',
    priority: 'Normal',
    category: 'Plumbing',
    propertyId: { _id: 'demo-prop-2', name: 'Avondale Court 2A' },
    contractorName: 'Harare Plumbing Co.',
    estimatedCost: 85,
    requestedAmount: 85
  },
  {
    _id: 'demo-maint-2',
    title: 'Geyser replacement quote',
    status: 'open',
    priority: 'High',
    category: 'Electrical',
    propertyId: { _id: 'demo-prop-5', name: 'Greendale Duplex' },
    contractorName: 'City Electrical',
    estimatedCost: 240,
    requestedAmount: 240
  },
  {
    _id: 'demo-maint-3',
    title: 'Garden gate latch',
    status: 'completed',
    priority: 'Low',
    category: 'General',
    propertyId: { _id: 'demo-prop-1', name: '12 Arundel Road' },
    paidAmount: 35,
    paymentDate: isoDaysFromNow(-12)
  }
];

export const DEMO_INSPECTIONS = [
  { _id: 'demo-insp-1', type: 'routine', status: 'scheduled', scheduledDate: isoDaysFromNow(9), propertyId: 'demo-prop-4' },
  { _id: 'demo-insp-2', type: 'move_out', status: 'due_today', scheduledDate: isoDaysFromNow(0), propertyId: 'demo-prop-3' }
];

export const DEMO_EXPENSES = [
  { _id: 'demo-exp-1', propertyId: 'demo-prop-2', category: 'Municipal', amount: 86, date: isoDaysFromNow(6), status: 'unpaid', description: 'City of Harare rates' },
  { _id: 'demo-exp-2', propertyId: 'demo-prop-4', category: 'Levies', amount: 120, date: isoDaysFromNow(-3), status: 'completed', description: 'Body corporate levy' },
  { _id: 'demo-exp-3', propertyId: 'demo-prop-1', category: 'Insurance', amount: 55, date: isoDaysFromNow(12), status: 'unpaid', description: 'Building cover instalment' }
];

export function getDemoExecutiveDashboard(): ExecutiveDashboardData {
  return {
    businessHealth: {
      totalProperties: 48,
      occupiedProperties: 42,
      vacantProperties: 6,
      occupancyRate: 88,
      propertiesUnderManagement: 48,
      totalMonthlyRent: 86400,
      outstandingRent: 6120,
      outstandingMunicipalBills: 1840,
      outstandingLevies: 960,
      openMaintenanceRequests: 7,
      upcomingLeaseRenewals: 5,
      activeAgents: 8,
      trends: {
        occupancyRate: 'up',
        vacantProperties: 'down',
        outstandingRent: 'down'
      }
    },
    alerts: [
      {
        id: 'demo-alert-1',
        severity: 'critical',
        title: 'Vacancy ageing past 30 days',
        description: 'Borrowdale cottage and two Glen Lorne units need letting attention.',
        link: '/demo/enterprise',
        category: 'vacancies'
      },
      {
        id: 'demo-alert-2',
        severity: 'attention',
        title: 'Five leases expire within 30 days',
        description: 'Renewal conversations should start this week.',
        link: '/demo/enterprise',
        category: 'leases'
      }
    ],
    agentPerformance: {
      leaderboard: [
        { agentId: 'demo-agent-1', agentName: 'Lindiwe Ncube', propertiesManaged: 11, propertiesLet: 4, vacancyClosures: 3, rentCollectionSuccess: 96, maintenanceResolution: 91, viewingsConducted: 18, leasesSigned: 4, inspectionCompletion: 100, revenueGenerated: 18400 },
        { agentId: 'demo-agent-2', agentName: 'Farai Moyo', propertiesManaged: 9, propertiesLet: 3, vacancyClosures: 2, rentCollectionSuccess: 91, maintenanceResolution: 88, viewingsConducted: 14, leasesSigned: 3, inspectionCompletion: 92, revenueGenerated: 15120 },
        { agentId: 'demo-agent-3', agentName: 'Tinashe Dube', propertiesManaged: 8, propertiesLet: 2, vacancyClosures: 1, rentCollectionSuccess: 87, maintenanceResolution: 80, viewingsConducted: 11, leasesSigned: 2, inspectionCompletion: 85, revenueGenerated: 12850 }
      ],
      highlights: {
        topLettings: {
          agentId: 'demo-agent-1',
          agentName: 'Lindiwe Ncube',
          propertiesManaged: 11,
          propertiesLet: 4,
          vacancyClosures: 3,
          rentCollectionSuccess: 96,
          maintenanceResolution: 91,
          viewingsConducted: 18,
          leasesSigned: 4,
          inspectionCompletion: 100,
          revenueGenerated: 18400
        },
        topCollection: {
          agentId: 'demo-agent-2',
          agentName: 'Farai Moyo',
          propertiesManaged: 9,
          propertiesLet: 3,
          vacancyClosures: 2,
          rentCollectionSuccess: 91,
          maintenanceResolution: 88,
          viewingsConducted: 14,
          leasesSigned: 3,
          inspectionCompletion: 92,
          revenueGenerated: 15120
        }
      }
    },
    vacancies: [
      { propertyId: 'demo-v-1', propertyName: 'Borrowdale Cottage', address: 'Borrowdale Brooke, Harare', daysVacant: 34, expectedRevenueLoss: 1400, assignedAgentName: 'Lindiwe Ncube', marketingStatus: 'advertised', viewingCount: 6, applicationsReceived: 1, agingLevel: 'red' },
      { propertyId: 'demo-v-2', propertyName: 'Glen Lorne 12B', address: 'Glen Lorne, Harare', daysVacant: 18, expectedRevenueLoss: 980, assignedAgentName: 'Farai Moyo', marketingStatus: 'viewings', viewingCount: 4, applicationsReceived: 0, agingLevel: 'amber' },
      { propertyId: 'demo-v-3', propertyName: 'Mount Pleasant Flat 4', address: 'Mount Pleasant, Harare', daysVacant: 7, expectedRevenueLoss: 420, assignedAgentName: 'Tinashe Dube', marketingStatus: 'listed', viewingCount: 2, applicationsReceived: 0, agingLevel: 'green' }
    ],
    leaseExpiries: [
      { leaseId: 'demo-el-1', propertyId: 'demo-prop-2', propertyName: 'Avondale Court 2A', endDate: isoDaysFromNow(18), daysUntil: 18, severity: 'attention' },
      { leaseId: 'demo-el-2', propertyId: 'demo-prop-6', propertyName: 'Eastlea Townhouse', endDate: isoDaysFromNow(40), daysUntil: 40, severity: 'healthy' },
      { leaseId: 'demo-el-3', propertyId: 'demo-ag-9', propertyName: 'Belgravia Maisonette', endDate: isoDaysFromNow(12), daysUntil: 12, severity: 'critical' }
    ],
    maintenanceOverview: { open: 7, overdue: 2 },
    inspectionSchedule: [
      { _id: 'demo-insp-a', type: 'routine', scheduledDate: isoDaysFromNow(3) },
      { _id: 'demo-insp-b', type: 'owner_walkthrough', scheduledDate: isoDaysFromNow(8) }
    ],
    leadPipeline: {
      total: 21,
      byStage: [
        { stage: 'enquiry', count: 8 },
        { stage: 'viewing', count: 7 },
        { stage: 'application', count: 4 },
        { stage: 'offer', count: 2 }
      ],
      conversionRate: 28,
      bySource: [
        { label: 'Website', count: 9 },
        { label: 'WhatsApp', count: 7 },
        { label: 'Referral', count: 5 }
      ]
    },
    rosterSummary: [
      { id: 'demo-shift-1', agentId: 'demo-agent-1', agentName: 'Lindiwe Ncube', dutyType: 'viewing_duty', shiftDate: isoDaysFromNow(1), coverageArea: 'Northern suburbs', status: 'scheduled' },
      { id: 'demo-shift-2', agentId: 'demo-agent-3', agentName: 'Tinashe Dube', dutyType: 'emergency_maintenance_duty', shiftDate: isoDaysFromNow(0), coverageArea: 'Harare east', status: 'on_duty' }
    ],
    lastUpdated: new Date().toISOString()
  };
}

export function resolveDemoGet(url: string): unknown {
  const path = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/api/, '');

  if (path.includes('/individual/tax-profile')) {
    return {
      legalName: 'Sample Landlord Portfolio',
      tin: null,
      vatRegistered: false,
      incomeTaxRegistered: false,
      rentalTaxRegime: 'ACCOUNTANT_REVIEW',
      taxYearStartMonth: 1,
      sampleData: true
    };
  }
  if (path.includes('/individual/tax/vat/transactions') || path.includes('/individual/tax/rental/transactions') || path.includes('/individual/tax/income/transactions')) {
    return [];
  }
  if (path.includes('/individual/tax/vat/review') || path.includes('/individual/tax/rental/review') || path.includes('/individual/tax/income/review') || path.includes('/individual/tax/review')) {
    return [];
  }
  if (path.includes('/individual/tax/vat/reconciliation')) {
    return { workingPaper: { outputVat: null, inputVat: null, netVatPosition: null }, recordTotals: { outputVat: null, inputVat: null }, findings: [] };
  }
  if (path.includes('/individual/tax/vat/working-paper') || path.includes('/individual/tax/vat')) {
    return {
      disclaimer: 'Sample workspace VAT working paper. Not a ZIMRA assessment.',
      vatRegistered: 'NOT_REGISTERED',
      vatRegistrationStatus: 'NOT_REGISTERED',
      outputVat: null,
      inputVat: null,
      netVatPosition: null,
      reviewItems: 0,
      taxPeriod: '2026-09',
      taxpayer: { name: 'Sample Landlord Portfolio', tin: null, vatNumber: null }
    };
  }
  if (path.includes('/individual/tax/rental/reconciliation')) {
    return { workingPaper: { calculatedRentalTax: 300, taxPayments: 0, calculatedBalance: 300 }, recordTotals: { calculatedRentalTax: 300 }, findings: [] };
  }
  if (path.includes('/individual/tax/rental/annual')) {
    return { year: 2026, properties: [{ propertyId: 'demo-prop-1', propertyName: '12 Arundel Road', grossRentalReceipts: 2000, rentalTaxBase: 2000, calculatedRentalTax: 300, taxPayments: 0, balance: 300 }] };
  }
  if (path.includes('/individual/tax/rental/working-paper') || path.includes('/individual/tax/rental')) {
    return {
      disclaimer: 'Sample workspace rental-tax working paper. Calculated amounts are not a confirmed ZIMRA liability.',
      rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
      currentPeriod: '2026-09',
      taxPeriod: '2026-09',
      calculatedRentalTax: 300,
      taxPayments: 0,
      calculatedBalance: 300,
      transactions: 1,
      reviewItems: 0,
      grossRentalReceipts: 2000,
      excludedAmounts: 0,
      rentalTaxBase: 2000,
      applicableRate: 15,
      payments: []
    };
  }
  if (path.includes('/individual/tax/income/reconciliation')) {
    return { workingPaper: { taxableIncome: null, calculatedIncomeTax: null }, recordTotals: {}, findings: [] };
  }
  if (path.includes('/individual/tax/income/annual')) {
    return { year: 2026, accountingProfit: null, taxableIncome: null, calculatedIncomeTax: null, incompleteMonths: ['2026-01'], reviewItems: 1 };
  }
  if (path.includes('/individual/tax/income/working-paper')) {
    return {
      disclaimer: 'Sample workspace income-tax working paper. Not a ZIMRA assessment.',
      taxableIncome: null,
      calculatedIncomeTax: null,
      accountingProfit: null,
      taxPayments: 0,
      reviewItems: [{ reason: 'AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW' }]
    };
  }
  if (path.includes('/individual/tax/income')) {
    return {
      disclaimer: 'Sample workspace income-tax working paper. Not a ZIMRA assessment.',
      taxableIncome: null,
      calculatedIncomeTax: null,
      accountingProfit: null,
      taxPayments: 0,
      unreconciledAmount: null,
      currentPeriod: '2026-09',
      calculationStatus: 'REVIEW_REQUIRED',
      transactions: 0,
      reviewItems: 1
    };
  }
  if (path.includes('/individual/tax/compliance') && path.includes('/reconciliation')) {
    return {
      disclaimer: 'Sample tax-preparation workspace. Not a ZIMRA assessment.',
      vat: { label: 'VAT projection', calculated: null, recordedPayments: null, paymentStatus: 'NOT_RECORDED', unreconciled: null, status: 'NOT_CALCULATED' },
      rentalTax: { label: 'Presumptive rental tax projection', calculated: 300, recordedPayments: 0, unreconciled: 300, status: 'CALCULATED' },
      incomeTax: { label: 'Ordinary income-tax projection', calculated: null, recordedPayments: 0, unreconciled: null, status: 'NOT_CALCULATED' }
    };
  }
  if (path.includes('/individual/tax/compliance') && (path.includes('/reviews') || path.includes('/evidence'))) {
    return [];
  }
  if (path.includes('/individual/tax/compliance')) {
    return {
      disclaimer: 'Sample tax-preparation workspace. Not a ZIMRA assessment.',
      taxYear: 2026,
      years: [2026, 2025],
      status: 'REVIEW_REQUIRED',
      taxpayer: { name: 'Sample Landlord Portfolio', tin: null },
      accounting: { rentalIncome: 2000, expenses: 180, netAccountingProfit: 1820 },
      vat: { outputVat: null, inputVat: null, reviewItems: 0, periodsIncomplete: 1 },
      rentalTax: { calculatedRentalTax: 300, paymentsRecorded: 0, reviewItems: 0 },
      incomeTax: { taxableIncome: null, calculatedIncomeTax: null, paymentsRecorded: 0, reviewItems: 1 },
      readiness: {
        status: 'REVIEW_REQUIRED',
        blockers: [{ description: 'Ownership percentage is not 100% and the tax allocation is not determined', issueType: 'OWNERSHIP_ALLOCATION_UNCLEAR' }],
        warnings: [{ description: 'AIDS levy is not included in the ordinary income-tax working paper', issueType: 'AIDS_LEVY_REVIEW' }],
        information: [{ description: 'Landlord is not VAT registered', issueType: 'VAT_REVIEW' }]
      },
      compliance: { unclassifiedTransactions: 0, missingDocuments: 0, openReviews: 1, closedPeriods: 0, incompleteCalculations: 1 },
      items: []
    };
  }
  if (path.includes('/individual/tax/periods')) return [];
  if (path.includes('/individual/dashboard')) return getDemoIndividualSummary();
  if (path.includes('/individual/accounting')) return getDemoAccounting();
  if (path.includes('/individual/income')) return { data: [] };
  if (path.includes('/individual/expenses') || path.includes('/individual/expense')) return DEMO_EXPENSES;
  if (path.includes('/leases')) return { data: DEMO_LEASES };
  if (path.includes('/tenants')) return { data: DEMO_TENANTS, tenants: DEMO_TENANTS };
  if (path.includes('/maintenance')) return { data: DEMO_MAINTENANCE };
  if (path.includes('/inspections')) return DEMO_INSPECTIONS;
  if (path.includes('/companies/current')) return getDemoCompany();
  if (path.includes('/files')) return { data: [] };
  if (path.includes('/properties')) return { data: DEMO_PROPERTIES };
  if (path.includes('/reports')) return { data: [] };
  if (path.includes('/agency/operations') || path.includes('/executive')) return getDemoExecutiveDashboard();
  return { data: [] };
}
