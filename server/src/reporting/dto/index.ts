export type ReportFormat = 'pdf' | 'excel' | 'csv' | 'json';

export type ReportStatus = 'draft' | 'generated' | 'reconciled' | 'variance';

export type CurrencyCode = 'USD' | 'ZiG' | 'ZAR' | string;

export interface MoneyAmountDTO {
  amount: number;
  currency: CurrencyCode;
}

export interface ReportPeriodDTO {
  startDate: string;
  endDate: string;
  label: string;
}

export interface ReportPartyDTO {
  id?: string;
  displayName: string;
  email?: string;
  phone?: string;
  logo?: string;
  type?: 'owner' | 'tenant' | 'buyer' | 'seller' | 'agent' | 'company' | string;
}

export interface AuditMetadataDTO {
  reportId: string;
  reportType: string;
  generatedBy?: string;
  generatedAt: string;
  softwareVersion?: string;
  dtoVersion: string;
  templateVersion?: string;
  sourceLedgerVersion?: string;
  accountingVersion?: string;
  hash: string;
  correlationId: string;
}

export interface SourceReferenceDTO {
  sourceSystem: string;
  sourceModel: string;
  sourceId: string;
  ledgerEntryId?: string;
  description?: string;
}

export interface ReconciliationCheckDTO {
  id: string;
  label: string;
  expected: MoneyAmountDTO;
  actual: MoneyAmountDTO;
  variance: MoneyAmountDTO;
  passed: boolean;
  sourceReferences: SourceReferenceDTO[];
}

export interface ReconciliationDTO {
  status: 'passed' | 'failed' | 'not_run';
  checks: ReconciliationCheckDTO[];
}

export interface CashFlowStepDTO {
  id: string;
  label: string;
  amount: MoneyAmountDTO;
  direction: 'inflow' | 'outflow' | 'balance';
  sourceReferences: SourceReferenceDTO[];
}

export interface CashFlowDTO {
  openingBalance: MoneyAmountDTO;
  totalInflows: MoneyAmountDTO;
  totalOutflows: MoneyAmountDTO;
  ownerPayments: MoneyAmountDTO;
  closingBalance: MoneyAmountDTO;
  steps: CashFlowStepDTO[];
  reconciliation: ReconciliationDTO;
}

export interface PropertyKPIDTO {
  occupancyRate?: number;
  collectionRate?: number;
  outstandingRent: MoneyAmountDTO;
  openMaintenanceCount: number;
  closedMaintenanceCount: number;
  lastInspectionDate?: string;
  nextInspectionDate?: string;
  financialKpis: Record<string, MoneyAmountDTO | number | string | undefined>;
}

export interface ChartSeriesDTO {
  id: string;
  label: string;
  points: Array<{ label: string; value: number; date?: string }>;
  currency?: CurrencyCode;
}

export interface ChartDTO {
  id: string;
  title: string;
  kind: 'line' | 'bar' | 'pie' | 'area' | 'waterfall';
  series: ChartSeriesDTO[];
  sourceReferences: SourceReferenceDTO[];
}

export interface TimelineEventDTO {
  id: string;
  label: string;
  occurredAt?: string;
  amount?: MoneyAmountDTO;
  status?: string;
  sourceReferences: SourceReferenceDTO[];
}

export interface TimelineDTO {
  id: string;
  title: string;
  events: TimelineEventDTO[];
}

export type StatementRowType = 'Income' | 'Payout' | 'Expense' | 'Other';

export interface LedgerRowDTO {
  id: string;
  date: string;
  reference?: string;
  description: string;
  debit: MoneyAmountDTO;
  credit: MoneyAmountDTO;
  runningBalance: MoneyAmountDTO;
  status: string;
  sourceReferences: SourceReferenceDTO[];
  rowType?: StatementRowType;
  rentAmount?: MoneyAmountDTO;
  totalAmountReceived?: MoneyAmountDTO;
  contractualRent?: MoneyAmountDTO;
  receiptReviewRequired?: boolean;
  commission?: MoneyAmountDTO;
  vatOnCommission?: MoneyAmountDTO;
  levies?: MoneyAmountDTO;
  ownerAmount?: MoneyAmountDTO;
  vatRate?: number;
  paymentId?: string;
  ownerWaterfall?: OwnerWaterfallDTO;
}

export interface OwnerWaterfallDTO {
  grossAmount: MoneyAmountDTO;
  commissionAmount: MoneyAmountDTO;
  levyAmount: MoneyAmountDTO;
  vatOnCommission: MoneyAmountDTO;
  vatRate?: number;
  netOwnerAmount: MoneyAmountDTO;
  recordedOwnerAmount?: MoneyAmountDTO;
  difference: MoneyAmountDTO;
  reviewRequired: boolean;
  formula: string;
}

export interface StatementSummaryDTO {
  openingBalance: MoneyAmountDTO;
  /** Contractual rent component. Kept so existing consumers are not redefined. */
  totalRent: MoneyAmountDTO;
  /** Cash received from the tenant, including levy collected in the same payment. */
  totalAmountReceived?: MoneyAmountDTO;
  totalCommission: MoneyAmountDTO;
  totalVat: MoneyAmountDTO;
  totalLevies: MoneyAmountDTO;
  totalOwnerAmount: MoneyAmountDTO;
  totalPayouts: MoneyAmountDTO;
  closingBalance: MoneyAmountDTO;
}

export interface TrustPositionDTO {
  openingBalance: MoneyAmountDTO;
  moneyReceived: MoneyAmountDTO;
  expenses: MoneyAmountDTO;
  ownerPayments: MoneyAmountDTO;
  closingBalanceHeld: MoneyAmountDTO;
  reconciliation: ReconciliationDTO;
}

export interface TenantStatusDTO {
  tenant?: ReportPartyDTO;
  lease?: {
    id?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  };
  monthlyRent?: MoneyAmountDTO;
  rentStatus?: string;
  arrears: MoneyAmountDTO;
  deposit?: MoneyAmountDTO;
  nextDueDate?: string;
  occupancy?: string;
}

export interface PropertyPerformanceDTO {
  occupancyRate?: number;
  rentCollectionRate?: number;
  outstandingRent: MoneyAmountDTO;
  openMaintenance: number;
  closedMaintenance: number;
  lastInspection?: string;
  nextInspection?: string;
}

export interface ReportNotesDTO {
  managementNotes: string[];
  maintenanceNotes: string[];
  inspectionNotes: string[];
  latePaymentNotes: string[];
  generalComments: string[];
}

export interface ReportDataQualityDTO {
  hasLedgerData: boolean;
  ledgerEntryCount: number;
  sourceSystems: string[];
  warnings: string[];
}

export interface ReportPluginSectionDTO {
  id: string;
  title: string;
  type: string;
  payload: unknown;
  sourceReferences: SourceReferenceDTO[];
}

export interface OwnerStatementDTO {
  dtoVersion: string;
  status: ReportStatus;
  audit: AuditMetadataDTO;
  company: ReportPartyDTO;
  owner: ReportPartyDTO;
  property: {
    id: string;
    name: string;
    address?: string;
  };
  statementNumber: string;
  ledger?: 'rental' | 'sale';
  currency?: string;
  period: ReportPeriodDTO;
  executiveSummary: {
    openingBalance: MoneyAmountDTO;
    rentalIncome: MoneyAmountDTO;
    otherIncome: MoneyAmountDTO;
    totalFundsReceived: MoneyAmountDTO;
    totalDeductions: MoneyAmountDTO;
    netAvailable: MoneyAmountDTO;
    ownerPaid: MoneyAmountDTO;
    closingTrustBalance: MoneyAmountDTO;
  };
  cashFlow: CashFlowDTO;
  trustLedger: LedgerRowDTO[];
  incomeBreakdown: CashFlowStepDTO[];
  expenseBreakdown: CashFlowStepDTO[];
  ownerPayments: LedgerRowDTO[];
  trustPosition: TrustPositionDTO;
  tenantStatus: TenantStatusDTO;
  propertyPerformance: PropertyPerformanceDTO;
  notes: ReportNotesDTO;
  preparedBy?: ReportPartyDTO;
  dataQuality: ReportDataQualityDTO;
  propertyKpis: PropertyKPIDTO;
  charts: ChartDTO[];
  timeline: TimelineDTO;
  pluginSections: ReportPluginSectionDTO[];
  statementSummary?: StatementSummaryDTO;
  ownerMoneyWaterfall?: OwnerWaterfallDTO;
  rentalSettlement?: {
    grossRent: MoneyAmountDTO;
    levy: MoneyAmountDTO;
    commission: MoneyAmountDTO;
    vatOnCommission: MoneyAmountDTO;
    ownerPayable: MoneyAmountDTO;
  };
  reconciliation: ReconciliationDTO;
}
