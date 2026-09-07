import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { TaxRate, ITaxRate } from '../models/TaxRate';
import { roundMoney } from '../utils/money';
import { AppError } from '../middleware/errorHandler';

export const VAT_TAX_TYPE = 'VAT' as const;

export interface TaxRateRecord {
  _id: string;
  companyId: string;
  taxType: typeof VAT_TAX_TYPE;
  rate: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isActive: boolean;
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
  taxType: VAT_TAX_TYPE,
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

const companyVatPercentFallback = async (companyId: mongoose.Types.ObjectId): Promise<number> => {
  const company = await Company.findById(companyId).select('commissionConfig.vatPercentOnCommission createdAt').lean();
  const configured = Number((company as any)?.commissionConfig?.vatPercentOnCommission);
  if (Number.isFinite(configured) && configured >= 0) {
    return vatDecimalToPercent(configured);
  }
  return 0;
};

const syncCompanyCurrentVat = async (companyId: mongoose.Types.ObjectId, percent: number): Promise<void> => {
  await Company.updateOne(
    { _id: companyId },
    { $set: { 'commissionConfig.vatPercentOnCommission': vatPercentToDecimal(percent) } }
  );
};

export const ensureCompanyVatRate = async (companyId: mongoose.Types.ObjectId | string): Promise<TaxRateRecord | null> => {
  const id = toId(companyId);
  const existing = await TaxRate.findOne({ companyId: id, taxType: VAT_TAX_TYPE }).sort({ effectiveFrom: -1, createdAt: -1 });
  if (existing) return toRecord(existing);

  const percent = await companyVatPercentFallback(id);
  if (!(percent > 0)) return null;

  const company = await Company.findById(id).select('createdAt').lean();
  const created = await TaxRate.create({
    companyId: id,
    taxType: VAT_TAX_TYPE,
    rate: percent,
    effectiveFrom: (company as any)?.createdAt || new Date('1970-01-01T00:00:00.000Z'),
    effectiveTo: null,
    isActive: true
  });
  return toRecord(created);
};

export const getVatRateForDate = async (
  companyId: mongoose.Types.ObjectId | string | undefined,
  onDate: Date = new Date()
): Promise<{ percent: number; decimal: number; source: 'taxRate' | 'company' | 'none'; taxRateId?: string }> => {
  if (!companyId) return { percent: 0, decimal: 0, source: 'none' };
  const id = toId(companyId);
  await ensureCompanyVatRate(id);
  const rows = await TaxRate.find({ companyId: id, taxType: VAT_TAX_TYPE }).sort({ effectiveFrom: -1, createdAt: -1 }).lean();
  const match = rows.find((row) => isEffectiveOn(row as any, onDate));
  if (match) {
    const percent = Number(match.rate || 0);
    return {
      percent,
      decimal: vatPercentToDecimal(percent),
      source: 'taxRate',
      taxRateId: String(match._id)
    };
  }

  const fallbackPercent = await companyVatPercentFallback(id);
  if (fallbackPercent > 0) {
    return { percent: fallbackPercent, decimal: vatPercentToDecimal(fallbackPercent), source: 'company' };
  }
  return { percent: 0, decimal: 0, source: 'none' };
};

export const listTaxRates = async (companyId: mongoose.Types.ObjectId | string, taxType: string = VAT_TAX_TYPE): Promise<TaxRateRecord[]> => {
  const id = toId(companyId);
  await ensureCompanyVatRate(id);
  const rows = await TaxRate.find({ companyId: id, taxType }).sort({ effectiveFrom: -1, createdAt: -1 });
  return rows.map((row) => toRecord(row));
};

export const createVatRate = async (input: {
  companyId: mongoose.Types.ObjectId | string;
  rate: number;
  effectiveFrom: Date;
  createdBy?: mongoose.Types.ObjectId | string;
}): Promise<TaxRateRecord> => {
  const companyId = toId(input.companyId);
  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new AppError('VAT rate must be a number greater than or equal to 0', 400);
  }
  const effectiveFrom = startOfDayUtc(input.effectiveFrom || new Date());

  const overlapping = await TaxRate.findOne({
    companyId,
    taxType: VAT_TAX_TYPE,
    effectiveFrom,
    isActive: true
  });
  if (overlapping) {
    throw new AppError('A VAT rate already exists for this effective date', 400);
  }

  const previous = await TaxRate.find({
    companyId,
    taxType: VAT_TAX_TYPE,
    effectiveFrom: { $lt: effectiveFrom }
  }).sort({ effectiveFrom: -1, createdAt: -1 });

  for (const row of previous) {
    if (!row.effectiveTo || startOfDayUtc(row.effectiveTo) >= effectiveFrom) {
      const closeOn = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
      row.effectiveTo = closeOn;
    }
    row.isActive = false;
    await row.save();
  }

  const later = await TaxRate.find({
    companyId,
    taxType: VAT_TAX_TYPE,
    effectiveFrom: { $gt: effectiveFrom }
  }).sort({ effectiveFrom: 1 });
  const nextFrom = later[0]?.effectiveFrom ? startOfDayUtc(later[0].effectiveFrom) : null;

  const created = await TaxRate.create({
    companyId,
    taxType: VAT_TAX_TYPE,
    rate,
    effectiveFrom,
    effectiveTo: nextFrom ? new Date(nextFrom.getTime() - 24 * 60 * 60 * 1000) : null,
    isActive: !nextFrom,
    createdBy: input.createdBy ? toId(input.createdBy) : null
  });

  const current = await getVatRateForDate(companyId, new Date());
  await syncCompanyCurrentVat(companyId, current.percent);
  return toRecord(created);
};
