import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { TaxRate, ITaxRate } from '../models/TaxRate';
import { roundMoney } from '../utils/money';
import { AppError } from '../middleware/errorHandler';
import {
  STANDARD_VAT_PERCENT_FROM_2026,
  VAT_RATE_CHANGE_2026
} from './tax/vatCalculation';
import {
  getEffectiveStandardVatRule,
  jurisdictionCodeFromCountry,
  listStandardVatRates
} from './taxRuleRegistry';

export const VAT_TAX_TYPE = 'VAT' as const;
export type DatedTaxType = 'VAT' | 'CGT' | 'CGWT';

export interface TaxRateRecord {
  _id: string;
  companyId: string;
  taxType: DatedTaxType;
  rate: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isActive: boolean;
  jurisdiction?: string;
  sourceReference?: string | null;
  notes?: string | null;
  managedBy?: 'mantis';
}

const toId = (value: mongoose.Types.ObjectId | string): mongoose.Types.ObjectId =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));

const startOfDayUtc = (value: Date): Date => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const toRecord = (doc: ITaxRate | Record<string, unknown>): TaxRateRecord => ({
  _id: String((doc as any)._id),
  companyId: String((doc as any).companyId),
  taxType: ((doc as any).taxType || VAT_TAX_TYPE) as DatedTaxType,
  rate: Number((doc as any).rate || 0),
  effectiveFrom: new Date((doc as any).effectiveFrom),
  effectiveTo: (doc as any).effectiveTo ? new Date((doc as any).effectiveTo) : null,
  isActive: Boolean((doc as any).isActive)
});

/**
 * Convert a stored percentage (15.5) into the decimal used by payment snapshots (0.155).
 */
export const vatPercentToDecimal = (percent: number): number => {
  const n = Number(percent || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMoney(n / 100, 6);
};

export const vatDecimalToPercent = (decimal: number): number => {
  const n = Number(decimal || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMoney(n * 100, 4);
};

const isEffectiveOn = (row: { effectiveFrom: Date; effectiveTo?: Date | null }, onDate: Date): boolean => {
  const from = startOfDayUtc(row.effectiveFrom);
  const to = row.effectiveTo ? startOfDayUtc(row.effectiveTo) : null;
  const day = startOfDayUtc(onDate);
  if (day < from) return false;
  if (to && day > to) return false;
  return true;
};

export function selectRateEffectiveOn<T extends { effectiveFrom: Date; effectiveTo?: Date | null }>(
  rows: T[],
  onDate: Date
): T | undefined {
  return rows.find((row) => isEffectiveOn(row, onDate));
}

async function jurisdictionForCompany(companyId: mongoose.Types.ObjectId | string | undefined): Promise<string> {
  if (!companyId) return 'ZW';
  const company = await Company.findById(toId(companyId)).select('country').lean();
  return jurisdictionCodeFromCountry((company as any)?.country);
}

export const getVatRateForDate = async (
  companyId: mongoose.Types.ObjectId | string | undefined,
  onDate: Date = new Date()
): Promise<{
  percent: number;
  decimal: number;
  source: 'central' | 'none';
  taxRateId?: string;
  jurisdiction?: string;
  effectiveFrom?: Date;
}> => {
  const jurisdiction = await jurisdictionForCompany(companyId);
  if (!jurisdiction) return { percent: 0, decimal: 0, source: 'none' };
  const rule = await getEffectiveStandardVatRule(onDate, jurisdiction);
  const percent = Number(rule?.rate ?? 0);
  if (!rule || !(percent > 0)) {
    return { percent: 0, decimal: 0, source: 'none', jurisdiction };
  }
  return {
    percent,
    decimal: vatPercentToDecimal(percent),
    source: 'central',
    taxRateId: rule.id,
    jurisdiction,
    effectiveFrom: rule.effectiveFrom
  };
};

export const periodsOverlap = (
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

export async function detectVatRateReview(_companyId?: mongoose.Types.ObjectId | string): Promise<{
  required: boolean;
  currentRate: number | null;
  expectedRate: number;
  coveringFrom: Date;
  message: string;
} | null> {
  const change = startOfDayUtc(VAT_RATE_CHANGE_2026);
  const covering = await getEffectiveStandardVatRule(change, 'ZW');
  if (!covering) {
    return {
      required: true,
      currentRate: null,
      expectedRate: STANDARD_VAT_PERCENT_FROM_2026,
      coveringFrom: change,
      message: 'No central Zimbabwe VAT rate covers 1 January 2026. A system administrator must add it to the Mantis VAT registry. No historical transaction has been modified.'
    };
  }
  const currentRate = Number(covering.rate || 0);
  if (currentRate === STANDARD_VAT_PERCENT_FROM_2026) return null;
  return {
    required: true,
    currentRate,
    expectedRate: STANDARD_VAT_PERCENT_FROM_2026,
    coveringFrom: change,
    message: `Central Zimbabwe VAT rate covering 1 January 2026 is ${currentRate}%. Review is for the system administrator. No historical transaction has been modified.`
  };
}

export const getTaxRateForDate = async (
  companyId: mongoose.Types.ObjectId | string | undefined,
  taxType: DatedTaxType,
  onDate: Date = new Date()
): Promise<{ percent: number; decimal: number; source: 'taxRate' | 'none'; taxRateId?: string }> => {
  if (!companyId) return { percent: 0, decimal: 0, source: 'none' };
  const id = toId(companyId);
  if (taxType === 'VAT') {
    const vat = await getVatRateForDate(id, onDate);
    return { percent: vat.percent, decimal: vat.decimal, source: vat.source === 'none' ? 'none' : 'taxRate', taxRateId: vat.taxRateId };
  }
  const rows = await TaxRate.find({ companyId: id, taxType }).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
  const match = selectRateEffectiveOn(rows as Array<{ effectiveFrom: Date; effectiveTo?: Date | null; rate?: number; _id?: unknown }>, onDate);
  if (!match) return { percent: 0, decimal: 0, source: 'none' };
  const percent = Number(match.rate || 0);
  return { percent, decimal: vatPercentToDecimal(percent), source: 'taxRate', taxRateId: String(match._id) };
};

export const listCentralVatRatesForCompany = async (companyId: mongoose.Types.ObjectId | string): Promise<TaxRateRecord[]> => {
  const jurisdiction = await jurisdictionForCompany(companyId);
  if (!jurisdiction) return [];
  const rules = await listStandardVatRates(jurisdiction);
  const today = startOfDayUtc(new Date());
  return rules.map((rule) => ({
    _id: rule.id,
    companyId: '',
    taxType: 'VAT' as const,
    rate: Number(rule.rate || 0),
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    isActive: isEffectiveOn({ effectiveFrom: rule.effectiveFrom, effectiveTo: rule.effectiveTo }, today) && rule.status === 'ACTIVE',
    jurisdiction: rule.jurisdiction,
    sourceReference: rule.sourceReference,
    notes: rule.notes,
    managedBy: 'mantis' as const
  }));
};

export const listTaxRates = async (companyId: mongoose.Types.ObjectId | string, taxType: string = VAT_TAX_TYPE): Promise<TaxRateRecord[]> => {
  if (String(taxType || VAT_TAX_TYPE).toUpperCase() === VAT_TAX_TYPE) {
    return listCentralVatRatesForCompany(companyId);
  }
  const id = toId(companyId);
  const rows = await TaxRate.find({ companyId: id, taxType }).sort({ effectiveFrom: -1, createdAt: -1 });
  return rows.map((row) => toRecord(row));
};

export const createVatRate = async (input: {
  companyId: mongoose.Types.ObjectId | string;
  rate: number;
  effectiveFrom: Date;
  createdBy?: mongoose.Types.ObjectId | string;
  taxType?: DatedTaxType;
}): Promise<TaxRateRecord> => {
  const companyId = toId(input.companyId);
  const taxType: DatedTaxType = input.taxType || VAT_TAX_TYPE;
  if (taxType === VAT_TAX_TYPE) {
    throw new AppError('Standard VAT rates are managed centrally by Mantis and cannot be set for a company', 403);
  }
  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new AppError('Rate must be a number greater than or equal to 0', 400);
  }
  const effectiveFrom = startOfDayUtc(input.effectiveFrom || new Date());

  const duplicateDate = await TaxRate.findOne({
    companyId,
    taxType,
    effectiveFrom
  });
  if (duplicateDate) {
    throw new AppError('A rate already exists for this effective date. Historical rates cannot be overwritten.', 400);
  }

  const previous = await TaxRate.find({
    companyId,
    taxType,
    effectiveFrom: { $lt: effectiveFrom }
  }).sort({ effectiveFrom: -1, createdAt: -1 });

  for (const row of previous) {
    if (!row.effectiveTo || startOfDayUtc(row.effectiveTo) >= effectiveFrom) {
      const closeOn = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
      if (closeOn < startOfDayUtc(row.effectiveFrom)) {
        throw new AppError('New rate would overlap an existing rate period', 400);
      }
      row.effectiveTo = closeOn;
    }
    row.isActive = false;
    await row.save();
  }

  const later = await TaxRate.find({
    companyId,
    taxType,
    effectiveFrom: { $gt: effectiveFrom }
  }).sort({ effectiveFrom: 1 });
  const nextFrom = later[0]?.effectiveFrom ? startOfDayUtc(later[0].effectiveFrom) : null;
  const newTo = nextFrom ? new Date(nextFrom.getTime() - 24 * 60 * 60 * 1000) : null;

  const remaining = await TaxRate.find({ companyId, taxType, effectiveFrom: { $ne: effectiveFrom } });
  const candidate = { effectiveFrom, effectiveTo: newTo };
  for (const row of remaining) {
    if (periodsOverlap(candidate, { effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo })) {
      throw new AppError('A rate already covers part of this period. Historical rates cannot be overwritten.', 400);
    }
  }

  const created = await TaxRate.create({
    companyId,
    taxType,
    rate,
    effectiveFrom,
    effectiveTo: newTo,
    isActive: !nextFrom,
    createdBy: input.createdBy ? toId(input.createdBy) : null
  });

  return toRecord(created);
};
