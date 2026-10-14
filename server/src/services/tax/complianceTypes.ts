export const COMPLIANCE_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'REVIEW_REQUIRED',
  'READY_FOR_ACCOUNTANT',
  'READY_FOR_TAX_PREPARATION',
  'FINALIZED'
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const COMPLIANCE_SEVERITIES = ['BLOCKER', 'WARNING', 'INFORMATION'] as const;
export type ComplianceSeverity = (typeof COMPLIANCE_SEVERITIES)[number];

export const COMPLIANCE_REVIEW_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'WAIVED'] as const;
export type ComplianceReviewStatus = (typeof COMPLIANCE_REVIEW_STATUSES)[number];

export const COMPLIANCE_ISSUE_TYPES = [
  'MISSING_TAX_CLASSIFICATION',
  'MISSING_TAX_RULE',
  'MISSING_TAX_PERIOD',
  'MIXED_CURRENCY',
  'MISSING_DOCUMENT',
  'CAPITAL_REVENUE_REVIEW',
  'PRIVATE_USE_REVIEW',
  'VAT_REVIEW',
  'PRESUMPTIVE_RENTAL_REVIEW',
  'INCOME_TAX_REVIEW',
  'AIDS_LEVY_REVIEW',
  'CAPITAL_ALLOWANCE_REVIEW',
  'DUPLICATE_OR_RECONCILIATION_REVIEW',
  'NOT_YET_TAX_CLASSIFIED',
  'OWNERSHIP_ALLOCATION_UNCLEAR',
  'CURRENCY_CONVERSION_REQUIRED',
  'TAX_PAYMENT_UNMATCHED'
] as const;
export type ComplianceIssueType = (typeof COMPLIANCE_ISSUE_TYPES)[number];

export const EVIDENCE_DOCUMENT_TYPES = [
  'RENTAL_RECEIPT',
  'TENANCY_AGREEMENT',
  'INVOICE',
  'SUPPLIER_INVOICE',
  'MAINTENANCE_INVOICE',
  'RATES_STATEMENT',
  'BANK_EVIDENCE',
  'TAX_PAYMENT_PROOF',
  'VAT_DOCUMENT',
  'CONTRACTOR_QUOTE',
  'CAPITAL_EXPENDITURE_DOCUMENT',
  'OTHER_INCOME_EVIDENCE',
  'OTHER'
] as const;
export type EvidenceDocumentType = (typeof EVIDENCE_DOCUMENT_TYPES)[number];

export const EVIDENCE_STATUSES = ['MISSING', 'UPLOADED', 'REVIEWED', 'ACCEPTED', 'REQUIRES_REVIEW', 'NOT_REQUIRED'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const TAX_PACK_STATUSES = ['GENERATED', 'FINALIZED', 'SUPERSEDED'] as const;
export type TaxPackStatus = (typeof TAX_PACK_STATUSES)[number];

export type ComplianceFinding = {
  severity: ComplianceSeverity;
  issueType: string;
  description: string;
  taxType?: string | null;
  sourceId?: string | null;
  taxPeriodKey?: string | null;
};

export type ComplianceMetrics = {
  unclassifiedTransactions: number;
  missingDocuments: number;
  openReviews: number;
  closedPeriods: number;
  incompleteCalculations: number;
  vatReviewItems: number;
  rentalTaxReviewItems: number;
  incomeTaxReviewItems: number;
};

export type ComplianceReadinessResult = {
  status: ComplianceStatus;
  blockers: ComplianceFinding[];
  warnings: ComplianceFinding[];
  information: ComplianceFinding[];
  metrics: ComplianceMetrics;
};

export const TAX_PACK_DISCLAIMER =
  'This tax pack is a record-keeping and tax-preparation working paper based on information recorded in Mantis and the tax rules configured for the relevant period. It is not a ZIMRA assessment, filing confirmation, tax clearance certificate, or legal/tax opinion. Taxpayers should obtain professional advice where required.';
