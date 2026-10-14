import { roundMoney } from '../../utils/money';
import type { CommissionVatTreatment } from './taxTypes';

export type VatExtractResult = {
  gross: number;
  net: number;
  vatAmount: number;
  vatRate: number;
};

/** VAT included in a taxable gross: VAT = gross − gross / (1 + rate). */
export function extractInclusiveVat(gross: number, vatRate: number): VatExtractResult {
  const g = roundMoney(Math.max(0, Number(gross || 0)));
  const rate = Math.max(0, Number(vatRate || 0));
  if (!(g > 0) || !(rate > 0)) {
    return { gross: g, net: g, vatAmount: 0, vatRate: rate };
  }
  const net = roundMoney(g / (1 + rate));
  const vatAmount = roundMoney(g - net);
  return { gross: g, net, vatAmount, vatRate: rate };
}

export function exclusiveVatOn(net: number, vatRate: number): VatExtractResult {
  const n = roundMoney(Math.max(0, Number(net || 0)));
  const rate = Math.max(0, Number(vatRate || 0));
  const vatAmount = rate > 0 && n > 0 ? roundMoney(n * rate) : 0;
  return { gross: roundMoney(n + vatAmount), net: n, vatAmount, vatRate: rate };
}

export function commissionVatFromTreatment(input: {
  commission: number;
  vatRate: number;
  treatment: CommissionVatTreatment;
}): { commissionNet: number; commissionGross: number; vatAmount: number; treatment: CommissionVatTreatment } {
  const commission = roundMoney(Math.max(0, Number(input.commission || 0)));
  const vatRate = Math.max(0, Number(input.vatRate || 0));
  const treatment = input.treatment;
  if (treatment === 'NONE' || !(vatRate > 0) || !(commission > 0)) {
    return { commissionNet: commission, commissionGross: commission, vatAmount: 0, treatment: treatment === 'NONE' ? 'NONE' : treatment };
  }
  if (treatment === 'COMMISSION_VAT_INCLUSIVE') {
    const extracted = extractInclusiveVat(commission, vatRate);
    return {
      commissionNet: extracted.net,
      commissionGross: extracted.gross,
      vatAmount: extracted.vatAmount,
      treatment
    };
  }
  const added = exclusiveVatOn(commission, vatRate);
  return {
    commissionNet: added.net,
    commissionGross: added.gross,
    vatAmount: added.vatAmount,
    treatment
  };
}

export function filingPeriodFromDate(value: Date | string | undefined): string {
  const date = value ? new Date(value) : new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Standard Zimbabwe VAT from 1 January 2026, used only to seed the dated rate table. */
export const STANDARD_VAT_PERCENT_FROM_2026 = 15.5;
export const STANDARD_VAT_PERCENT_BEFORE_2026 = 15;
export const VAT_RATE_CHANGE_2026 = new Date(Date.UTC(2026, 0, 1));
