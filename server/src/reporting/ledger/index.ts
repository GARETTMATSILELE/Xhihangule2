import { CurrencyCode, SourceReferenceDTO } from '../dto';

export type LedgerSourceSystem =
  | 'property_account'
  | 'trust_account'
  | 'general_ledger'
  | 'tax'
  | 'commission'
  | 'payment'
  | 'owner_payout'
  | 'pass_through';

export interface CanonicalLedgerEntry {
  entryId: string;
  sourceSystem: LedgerSourceSystem | string;
  sourceModel: string;
  sourceId: string;
  companyId: string;
  propertyId?: string;
  ownerId?: string;
  tenantId?: string;
  trustAccountId?: string;
  accountCode?: string;
  eventType: string;
  direction: 'debit' | 'credit';
  debit: number;
  credit: number;
  amount: number;
  currency: CurrencyCode;
  effectiveDate: Date;
  postedDate?: Date;
  status: string;
  runningBalance?: number;
  reversalOf?: string;
  metadata?: Record<string, unknown>;
}

export interface LedgerQuery {
  companyId: string;
  propertyId?: string;
  ownerId?: string;
  tenantId?: string;
  trustAccountId?: string;
  from?: Date;
  to?: Date;
  eventTypes?: string[];
}

export interface LedgerNormalizer<TSource = unknown> {
  readonly sourceSystem: LedgerSourceSystem | string;
  normalize(source: TSource, context: { companyId: string; currency: CurrencyCode }): CanonicalLedgerEntry[];
}

export const toSourceReference = (entry: CanonicalLedgerEntry): SourceReferenceDTO => ({
  sourceSystem: entry.sourceSystem,
  sourceModel: entry.sourceModel,
  sourceId: entry.sourceId,
  ledgerEntryId: entry.entryId,
  description: entry.eventType
});

export const sortLedgerEntries = (entries: CanonicalLedgerEntry[]): CanonicalLedgerEntry[] =>
  [...entries].sort((a, b) => {
    const byDate = a.effectiveDate.getTime() - b.effectiveDate.getTime();
    if (byDate !== 0) return byDate;
    return a.entryId.localeCompare(b.entryId);
  });

export const sumCredits = (entries: CanonicalLedgerEntry[]): number =>
  entries.reduce((sum, entry) => sum + Number(entry.credit || 0), 0);

export const sumDebits = (entries: CanonicalLedgerEntry[]): number =>
  entries.reduce((sum, entry) => sum + Number(entry.debit || 0), 0);

