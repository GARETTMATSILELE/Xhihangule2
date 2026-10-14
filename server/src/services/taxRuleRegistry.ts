import { TaxRule, ITaxRule } from '../models/TaxRule';
import {
  STANDARD_VAT_PERCENT_BEFORE_2026,
  STANDARD_VAT_PERCENT_FROM_2026,
  VAT_RATE_CHANGE_2026
} from './tax/vatCalculation';

export type TaxRuleRecord = {
  id: string;
  jurisdiction: string;
  taxType: string;
  ruleCode: string;
  version: number;
  description: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  rate: number | null;
  supplyTreatment: string | null;
  calculationMethod: string | null;
  sourceReference: string;
  sourceDocument: string | null;
  notes: string | null;
  status: string;
};

const startOfDayUtc = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const dayBefore = (value: Date): Date => new Date(value.getTime() - 24 * 60 * 60 * 1000);

type SystemRuleSeed = {
  jurisdiction: string;
  taxType: string;
  ruleCode: string;
  version: number;
  description: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  rate: number | null;
  calculationMethod: string;
  sourceReference: string;
  sourceDocument: string;
  notes: string;
  status: 'ACTIVE';
};

/**
 * Authoritative configuration seeds. Rates live here, not in payment/VAT business logic.
 * Do not apply these rules to historical transactions automatically.
 */
export function systemTaxRuleSeeds(): SystemRuleSeed[] {
  const vatChange = startOfDayUtc(VAT_RATE_CHANGE_2026);
  return [
    {
      jurisdiction: 'ZW',
      taxType: 'VAT',
      ruleCode: 'ZW_VAT_STANDARD',
      version: 1,
      description: 'Standard Zimbabwe VAT rate before 1 January 2026',
      effectiveFrom: new Date(Date.UTC(1970, 0, 1)),
      effectiveTo: dayBefore(vatChange),
      rate: STANDARD_VAT_PERCENT_BEFORE_2026,
      calculationMethod: 'STANDARD_PERCENT',
      sourceReference: 'Zimbabwe VAT Act — historic standard rate',
      sourceDocument: 'Existing Mantis TaxRate seed (STANDARD_VAT_PERCENT_BEFORE_2026)',
      notes: 'Used as dated configuration only. Do not rewrite historical VAT amounts.',
      status: 'ACTIVE'
    },
    {
      jurisdiction: 'ZW',
      taxType: 'VAT',
      ruleCode: 'ZW_VAT_STANDARD',
      version: 2,
      description: 'Standard Zimbabwe VAT rate from 1 January 2026',
      effectiveFrom: vatChange,
      effectiveTo: null,
      rate: STANDARD_VAT_PERCENT_FROM_2026,
      calculationMethod: 'STANDARD_PERCENT',
      sourceReference: 'Finance Act / VAT rate change effective 1 January 2026',
      sourceDocument: 'Existing Mantis TaxRate seed (STANDARD_VAT_PERCENT_FROM_2026)',
      notes: 'Authoritative standard VAT rate for new calculations. Company settings cannot override it. Do not rewrite historical VAT amounts.',
      status: 'ACTIVE'
    },
    {
      jurisdiction: 'ZW',
      taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
      ruleCode: 'ZW_PRESUMPTIVE_RENTAL_PN08_2026',
      version: 1,
      description: 'Presumptive rental income tax on gross rental from business premises',
      effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
      effectiveTo: null,
      rate: 15,
      calculationMethod: 'GROSS_RENTAL_PERCENT',
      sourceReference: 'ZIMRA Public Notice 08 of 2026',
      sourceDocument: 'Public Notice 08 of 2026 (issued 5 February 2026); Finance Act 2025 (Act 7 of 2025); Income Tax Act s36R and 39th Schedule',
      notes: 'Verified against ZIMRA Public Notice 08 of 2026 (issued 5 February 2026). Rate is 15% of gross rental received; final tax; no deductions/allowances/credits. Applies only when snapshot rentalTaxRegime is PRESUMPTIVE_RENTAL. Residential dwellings are not liable (PN 08 s2); mixed-use remains ACCOUNTANT_REVIEW. VAT is separate. Do not infer from workspaceType.',
      status: 'ACTIVE'
    },
    {
      jurisdiction: 'ZW',
      taxType: 'INCOME_TAX',
      ruleCode: 'ZW_INCOME_TAX_TRADE_INVESTMENT_2024',
      version: 1,
      description: 'Ordinary income of an individual from trade and investments',
      effectiveFrom: new Date(Date.UTC(2024, 0, 1)),
      effectiveTo: null,
      rate: 25,
      calculationMethod: 'TAXABLE_INCOME_PERCENT',
      sourceReference: 'Finance Act s14(2b); ZIMRA tax rates — income of an individual from trade and investments',
      sourceDocument: 'https://www.zimra.co.zw/domestic-taxes/corporate/tax-rates ; Finance Act 13 of 2023 / Public Notice 9 of 2024 (24% to 25% from year of assessment beginning 1 January 2024)',
      notes: 'Flat rate on taxable income from trade/investment. Distinct from PAYE/remuneration progressive bands (0/20/25/30/35/40). Distinct from company/trust s14(2c) even though the published rate is also 25%. AIDS levy is NOT included in this rate; ITF 12C box 26 is a separate review item. Presumptive rental tax (PN 08) is a final tax and is not this rule. Do not apply this rule to PAYE. Capital allowances and tax credits are not implemented in this version.',
      status: 'ACTIVE'
    }
  ];
}

export function toTaxRuleRecord(doc: ITaxRule | Record<string, unknown>): TaxRuleRecord {
  const row = doc as any;
  return {
    id: String(row._id),
    jurisdiction: String(row.jurisdiction || 'ZW'),
    taxType: String(row.taxType),
    ruleCode: String(row.ruleCode),
    version: Number(row.version || 1),
    description: String(row.description || ''),
    effectiveFrom: new Date(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? new Date(row.effectiveTo) : null,
    rate: row.rate == null ? null : Number(row.rate),
    supplyTreatment: row.supplyTreatment || null,
    calculationMethod: row.calculationMethod || null,
    sourceReference: String(row.sourceReference || ''),
    sourceDocument: row.sourceDocument || null,
    notes: row.notes || null,
    status: String(row.status || 'ACTIVE')
  };
}

export function isRuleEffectiveOn(row: { effectiveFrom: Date; effectiveTo?: Date | null; status?: string }, onDate: Date): boolean {
  if (row.status && row.status !== 'ACTIVE') return false;
  const from = startOfDayUtc(row.effectiveFrom);
  const to = row.effectiveTo ? startOfDayUtc(row.effectiveTo) : null;
  const day = startOfDayUtc(onDate);
  if (day < from) return false;
  if (to && day > to) return false;
  return true;
}

export async function ensureSystemTaxRules(): Promise<TaxRuleRecord[]> {
  const seeds = systemTaxRuleSeeds();
  for (const seed of seeds) {
    await TaxRule.updateOne(
      { ruleCode: seed.ruleCode, version: seed.version },
      { $setOnInsert: seed },
      { upsert: true }
    );
  }
  const docs = await TaxRule.find({ ruleCode: { $in: seeds.map((s) => s.ruleCode) } }).sort({ taxType: 1, version: 1 });
  return docs.map(toTaxRuleRecord);
}

export async function getEffectiveTaxRule(taxType: string, onDate: Date, jurisdiction = 'ZW'): Promise<TaxRuleRecord | null> {
  await ensureSystemTaxRules();
  const docs = await TaxRule.find({ jurisdiction, taxType, status: 'ACTIVE' }).sort({ effectiveFrom: -1, version: -1 });
  const match = docs.find((doc) => isRuleEffectiveOn(doc, onDate));
  return match ? toTaxRuleRecord(match) : null;
}

export function jurisdictionCodeFromCountry(country?: string | null): string {
  const value = String(country || '').trim().toLowerCase();
  if (!value || value === 'zw' || value === 'zimbabwe' || value === 'republic of zimbabwe') return 'ZW';
  if (/^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  return '';
}

export function standardVatRuleCode(jurisdiction: string): string {
  return `${String(jurisdiction || '').trim().toUpperCase()}_VAT_STANDARD`;
}

export type DatedVatRateRow = {
  version: number;
  rate: number | null;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  status?: string;
};

const periodsConflict = (
  a: { effectiveFrom: Date; effectiveTo?: Date | null },
  b: { effectiveFrom: Date; effectiveTo?: Date | null }
): boolean => {
  const aFrom = startOfDayUtc(a.effectiveFrom);
  const bFrom = startOfDayUtc(b.effectiveFrom);
  const aTo = a.effectiveTo ? startOfDayUtc(a.effectiveTo) : null;
  const bTo = b.effectiveTo ? startOfDayUtc(b.effectiveTo) : null;
  if (aTo && aTo < aFrom) return false;
  if (bTo && bTo < bFrom) return false;
  if (aTo && bFrom > aTo) return false;
  if (bTo && aFrom > bTo) return false;
  return true;
};

/**
 * Plans a new standard VAT period without changing any stored rate.
 * Previous open periods are closed on the day before the new start.
 */
export function planStandardVatRateChange(
  existing: DatedVatRateRow[],
  candidate: { rate: number; effectiveFrom: Date }
): {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  nextVersion: number;
  closures: Array<{ version: number; effectiveTo: Date; rate: number | null }>;
} {
  const rate = Number(candidate.rate);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
    throw new Error('VAT rate must be a percentage greater than 0 and at most 100');
  }
  const effectiveFrom = startOfDayUtc(candidate.effectiveFrom);
  const active = existing.filter((row) => !row.status || row.status === 'ACTIVE');
  if (active.some((row) => startOfDayUtc(row.effectiveFrom).getTime() === effectiveFrom.getTime())) {
    throw new Error('A VAT rate already starts on this date. Historical rates cannot be overwritten.');
  }
  const previous = active
    .filter((row) => startOfDayUtc(row.effectiveFrom).getTime() < effectiveFrom.getTime())
    .sort((a, b) => startOfDayUtc(b.effectiveFrom).getTime() - startOfDayUtc(a.effectiveFrom).getTime());
  const closures: Array<{ version: number; effectiveTo: Date; rate: number | null }> = [];
  for (const row of previous) {
    if (!row.effectiveTo || startOfDayUtc(row.effectiveTo).getTime() >= effectiveFrom.getTime()) {
      const closeOn = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
      if (closeOn < startOfDayUtc(row.effectiveFrom)) {
        throw new Error('New VAT rate overlaps an existing rate period');
      }
      closures.push({ version: row.version, effectiveTo: closeOn, rate: row.rate });
    }
  }
  const later = active
    .filter((row) => startOfDayUtc(row.effectiveFrom).getTime() > effectiveFrom.getTime())
    .sort((a, b) => startOfDayUtc(a.effectiveFrom).getTime() - startOfDayUtc(b.effectiveFrom).getTime());
  const nextFrom = later[0] ? startOfDayUtc(later[0].effectiveFrom) : null;
  const effectiveTo = nextFrom ? new Date(nextFrom.getTime() - 24 * 60 * 60 * 1000) : null;
  const candidatePeriod = { effectiveFrom, effectiveTo };
  for (const row of active) {
    const closed = closures.find((item) => item.version === row.version);
    const period = closed
      ? { effectiveFrom: row.effectiveFrom, effectiveTo: closed.effectiveTo }
      : { effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo ?? null };
    if (periodsConflict(candidatePeriod, period)) {
      throw new Error('A VAT rate already covers part of this period');
    }
  }
  const nextVersion = active.reduce((max, row) => Math.max(max, Number(row.version || 0)), 0) + 1;
  return { effectiveFrom, effectiveTo, nextVersion, closures };
}

export async function listStandardVatRates(jurisdiction = 'ZW'): Promise<TaxRuleRecord[]> {
  await ensureSystemTaxRules();
  const code = standardVatRuleCode(jurisdiction);
  const docs = await TaxRule.find({ jurisdiction, taxType: 'VAT', ruleCode: code }).sort({ effectiveFrom: 1, version: 1 });
  return docs.map(toTaxRuleRecord);
}

export async function getEffectiveStandardVatRule(onDate: Date, jurisdiction = 'ZW'): Promise<TaxRuleRecord | null> {
  const rows = await listStandardVatRates(jurisdiction);
  const match = rows
    .filter((row) => row.status === 'ACTIVE')
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || b.version - a.version)
    .find((row) => isRuleEffectiveOn(row, onDate));
  return match || null;
}

export async function createCentralStandardVatRate(input: {
  jurisdiction?: string;
  rate: number;
  effectiveFrom: Date;
  sourceReference: string;
  notes?: string;
  createdBy?: string;
}): Promise<TaxRuleRecord> {
  const jurisdiction = jurisdictionCodeFromCountry(input.jurisdiction || 'ZW') || String(input.jurisdiction || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(jurisdiction)) {
    throw new Error('Jurisdiction must be a two-letter country code');
  }
  const sourceReference = String(input.sourceReference || '').trim();
  if (!sourceReference) {
    throw new Error('A source or legal reference is required');
  }
  await ensureSystemTaxRules();
  const code = standardVatRuleCode(jurisdiction);
  const existing = await TaxRule.find({ jurisdiction, taxType: 'VAT', ruleCode: code, status: 'ACTIVE' });
  const plan = planStandardVatRateChange(existing.map((row) => ({
    version: row.version,
    rate: row.rate ?? null,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    status: row.status
  })), { rate: input.rate, effectiveFrom: input.effectiveFrom });

  for (const closure of plan.closures) {
    await TaxRule.updateOne(
      { ruleCode: code, version: closure.version },
      {
        $set: {
          effectiveTo: closure.effectiveTo,
          updatedBy: input.createdBy || null
        }
      }
    );
  }

  const created = await TaxRule.create({
    jurisdiction,
    taxType: 'VAT',
    ruleCode: code,
    version: plan.nextVersion,
    description: `Standard ${jurisdiction} VAT rate from ${plan.effectiveFrom.toISOString().slice(0, 10)}`,
    effectiveFrom: plan.effectiveFrom,
    effectiveTo: plan.effectiveTo,
    rate: Number(input.rate),
    calculationMethod: 'STANDARD_PERCENT',
    sourceReference,
    notes: input.notes || 'Added by a system administrator. Historical posted transactions are unchanged.',
    status: 'ACTIVE',
    createdBy: input.createdBy || null
  });
  return toTaxRuleRecord(created);
}

export async function listTaxRules(taxType?: string): Promise<TaxRuleRecord[]> {
  await ensureSystemTaxRules();
  const query: Record<string, unknown> = { jurisdiction: 'ZW' };
  if (taxType) query.taxType = taxType;
  const docs = await TaxRule.find(query).sort({ taxType: 1, effectiveFrom: 1, version: 1 });
  return docs.map(toTaxRuleRecord);
}
