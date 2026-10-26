export type CanonicalTaxLine = {
  obligationId: string;
  paymentId?: string | null;
  taxPeriod: string;
  status: string;
  recognised: number;
  paid: number;
  outstanding: number;
};

export type CanonicalPropertyBalance = {
  propertyId: string;
  propertyName: string;
  recognised: number;
  paid: number;
  reversed: number;
  outstanding: number;
  lines: CanonicalTaxLine[];
};

export type CanonicalTaxAccount = {
  taxType: string;
  label: string;
  recognised: number;
  paid: number;
  outstanding: number;
  reversed: number;
  properties: CanonicalPropertyBalance[];
};

export type TrustLedgerEntry = {
  entryId: string;
  date: string | Date;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  sourceType: 'opening' | 'payout';
  reference?: string;
  payoutId?: string;
  receiptUploadedAt?: string | Date;
};

export type TrustPropertyLedger = {
  propertyId: string;
  propertyName?: string;
  propertyAddress?: string;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: TrustLedgerEntry[];
};

export type TaxDiscrepancy = {
  kind: string;
  taxType: string;
  propertyId: string;
  propertyName?: string;
  difference: number;
  detail: string;
};

export type UnifiedPropertyRow = {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  recognised: number;
  paid: number;
  reversed: number;
  outstanding: number;
  trustOutstanding: number;
  trustDebit: number;
  trustCredit: number;
  status: string;
  canRecordPayout: boolean;
  lines: CanonicalTaxLine[];
  trustEntries: TrustLedgerEntry[];
  discrepancies: TaxDiscrepancy[];
};

export type UnifiedTaxAccount = {
  canonicalType: string;
  legacyType: 'VAT' | 'VAT_ON_COMMISSION' | 'CGT' | 'CGWT' | null;
  label: string;
  recognised: number;
  paid: number;
  outstanding: number;
  reversed: number;
  trustDebit: number;
  trustCredit: number;
  trustOutstanding: number;
  status: string;
  properties: UnifiedPropertyRow[];
};

const LEGACY_ACCOUNTS: Array<{ legacyType: UnifiedTaxAccount['legacyType']; canonicalType: string; label: string }> = [
  { legacyType: 'VAT', canonicalType: 'VAT_OUTPUT', label: 'Output VAT' },
  { legacyType: 'VAT_ON_COMMISSION', canonicalType: 'VAT_ON_COMMISSION', label: 'VAT on agency commission' },
  { legacyType: 'CGT', canonicalType: 'CAPITAL_GAINS_TAX', label: 'Capital Gains Tax' },
  { legacyType: 'CGWT', canonicalType: 'CAPITAL_GAINS_WITHHOLDING_TAX', label: 'Capital Gains Withholding Tax' }
];

const round = (value: number) => Number(Number(value || 0).toFixed(2));

const propertyStatus = (canonicalOutstanding: number, trustOutstanding: number, discrepancies: TaxDiscrepancy[]): string => {
  if (discrepancies.length > 0) return discrepancies[0].kind;
  if (Math.abs(round(canonicalOutstanding - trustOutstanding)) <= 0.05) return 'RECONCILED';
  if (round(canonicalOutstanding) > 0 && round(trustOutstanding) === 0) return 'OBLIGATION_WITHOUT_TRUST_LEDGER';
  if (round(trustOutstanding) > 0 && round(canonicalOutstanding) === 0) return 'LEGACY_TRUST_RECORD_WITHOUT_OBLIGATION';
  return 'LEGACY_AMOUNT_MISMATCH';
};

export function buildUnifiedTaxAccounts(input: {
  canonicalAccounts?: CanonicalTaxAccount[];
  trustLedgers?: Partial<Record<'VAT' | 'VAT_ON_COMMISSION' | 'CGT' | 'CGWT', TrustPropertyLedger[]>>;
  discrepancies?: TaxDiscrepancy[];
  hasCanonicalPosition?: boolean;
}): UnifiedTaxAccount[] {
  const hasCanonicalPosition = input.hasCanonicalPosition !== false;
  const canonicalByType = new Map((input.canonicalAccounts || []).map((account) => [account.taxType, account]));
  const seen = new Set<string>();
  const accounts: UnifiedTaxAccount[] = [];

  const pushAccount = (legacyType: UnifiedTaxAccount['legacyType'], canonicalType: string, fallbackLabel: string) => {
    if (seen.has(canonicalType)) return;
    seen.add(canonicalType);
    const canonical = canonicalByType.get(canonicalType);
    const trustRows = legacyType ? (input.trustLedgers?.[legacyType] || []) : [];
    const byProperty = new Map<string, UnifiedPropertyRow>();

    for (const property of canonical?.properties || []) {
      byProperty.set(property.propertyId, {
        propertyId: property.propertyId,
        propertyName: property.propertyName,
        propertyAddress: '',
        recognised: round(property.recognised),
        paid: round(property.paid),
        reversed: round(property.reversed),
        outstanding: round(property.outstanding),
        trustOutstanding: 0,
        trustDebit: 0,
        trustCredit: 0,
        status: 'RECONCILED',
        canRecordPayout: false,
        lines: property.lines || [],
        trustEntries: [],
        discrepancies: []
      });
    }

    for (const ledger of trustRows) {
      const existing = byProperty.get(ledger.propertyId);
      const trustOutstanding = round(ledger.closingBalance);
      if (existing) {
        existing.propertyName = existing.propertyName || ledger.propertyName || ledger.propertyId;
        existing.propertyAddress = ledger.propertyAddress || '';
        existing.trustOutstanding = trustOutstanding;
        existing.trustDebit = round(ledger.totalDebit);
        existing.trustCredit = round(ledger.totalCredit);
        existing.trustEntries = ledger.entries || [];
        existing.canRecordPayout = trustOutstanding > 0.005;
      } else {
        byProperty.set(ledger.propertyId, {
          propertyId: ledger.propertyId,
          propertyName: ledger.propertyName || ledger.propertyId,
          propertyAddress: ledger.propertyAddress || '',
          recognised: 0,
          paid: 0,
          reversed: 0,
          outstanding: 0,
          trustOutstanding,
          trustDebit: round(ledger.totalDebit),
          trustCredit: round(ledger.totalCredit),
          status: 'RECONCILED',
          canRecordPayout: trustOutstanding > 0.005,
          lines: [],
          trustEntries: ledger.entries || [],
          discrepancies: []
        });
      }
    }

    const properties: UnifiedPropertyRow[] = [];
    byProperty.forEach((row) => {
      row.discrepancies = hasCanonicalPosition
        ? (input.discrepancies || []).filter((item) =>
          item.taxType === canonicalType && item.propertyId === row.propertyId && !String(item.kind).startsWith('GL_')
        )
        : [];
      row.status = hasCanonicalPosition
        ? propertyStatus(row.outstanding, row.trustOutstanding, row.discrepancies)
        : 'HISTORICAL_TRUST_BOOK';
      properties.push(row);
    });
    properties.sort((a, b) =>
      b.outstanding - a.outstanding || b.trustOutstanding - a.trustOutstanding || a.propertyName.localeCompare(b.propertyName)
    );
    if (!canonical && properties.length === 0) return;

    const trustDebit = round(properties.reduce((sum, row) => sum + row.trustDebit, 0));
    const trustCredit = round(properties.reduce((sum, row) => sum + row.trustCredit, 0));
    accounts.push({
      canonicalType,
      legacyType,
      label: canonical?.label || fallbackLabel,
      recognised: round(canonical?.recognised || 0),
      paid: round(canonical?.paid || 0),
      outstanding: round(canonical?.outstanding || 0),
      reversed: round(canonical?.reversed || 0),
      trustDebit,
      trustCredit,
      trustOutstanding: round(trustDebit - trustCredit),
      status: !hasCanonicalPosition
        ? 'HISTORICAL_TRUST_BOOK'
        : properties.some((row) => row.status !== 'RECONCILED') ? 'RECONCILIATION_REQUIRED' : 'RECONCILED',
      properties
    });
  };

  for (const account of LEGACY_ACCOUNTS) {
    pushAccount(account.legacyType, account.canonicalType, account.label);
  }
  for (const account of input.canonicalAccounts || []) {
    pushAccount(null, account.taxType, account.label);
  }
  return accounts;
}
