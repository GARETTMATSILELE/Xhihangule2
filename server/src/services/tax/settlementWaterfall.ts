import { roundMoney } from '../../utils/money';
import type { CanonicalTaxType } from './taxTypes';

export type SettlementWaterfallStep = {
  type: CanonicalTaxType | 'AGENCY_COMMISSION' | 'OTHER_DEDUCTION' | 'SELLER_NET';
  basis: string;
  rate?: number;
  amount: number;
  reason: string;
  taxObligationId?: string;
  ledgerEntry?: string;
};

export type SettlementWaterfallInput = {
  grossSaleProceeds: number;
  saleVat?: number;
  cgwt?: number;
  agencyCommission?: number;
  vatOnCommission?: number;
  otherDeductions?: Array<{ type?: string; amount: number; reason?: string }>;
};

export type SettlementWaterfallResult = {
  steps: SettlementWaterfallStep[];
  sellerNetProceeds: number;
  totalDeductions: number;
};

/**
 * Auditable seller settlement waterfall. CGT liability is NOT a step here —
 * Capital Gains Withholding Tax is the trust deduction; final CGT is recorded separately.
 */
export function buildSettlementWaterfall(input: SettlementWaterfallInput): SettlementWaterfallResult {
  const gross = roundMoney(Math.max(0, Number(input.grossSaleProceeds || 0)));
  const steps: SettlementWaterfallStep[] = [
    {
      type: 'SELLER_NET',
      basis: 'GROSS_SALE_PROCEEDS',
      amount: gross,
      reason: 'Gross sale proceeds received into trust'
    }
  ];

  const deductions: SettlementWaterfallStep[] = [];
  const saleVat = roundMoney(Math.max(0, Number(input.saleVat || 0)));
  if (saleVat > 0) {
    deductions.push({
      type: 'VAT_OUTPUT',
      basis: 'PROPERTY_SALE_VAT',
      amount: saleVat,
      reason: 'Property sale output VAT withheld from seller proceeds'
    });
  }
  const cgwt = roundMoney(Math.max(0, Number(input.cgwt || 0)));
  if (cgwt > 0) {
    deductions.push({
      type: 'CAPITAL_GAINS_WITHHOLDING_TAX',
      basis: 'SALE_CONSIDERATION',
      amount: cgwt,
      reason: 'Capital Gains Withholding Tax withheld pending remittance to ZIMRA'
    });
  }
  const commission = roundMoney(Math.max(0, Number(input.agencyCommission || 0)));
  if (commission > 0) {
    deductions.push({
      type: 'AGENCY_COMMISSION',
      basis: 'COMMISSION_BASE',
      amount: commission,
      reason: 'Agency commission on sale'
    });
  }
  const vatOnCommission = roundMoney(Math.max(0, Number(input.vatOnCommission || 0)));
  if (vatOnCommission > 0) {
    deductions.push({
      type: 'VAT_ON_COMMISSION',
      basis: 'COMMISSION',
      amount: vatOnCommission,
      reason: 'VAT on agency commission'
    });
  }
  for (const other of input.otherDeductions || []) {
    const amount = roundMoney(Math.max(0, Number(other.amount || 0)));
    if (!(amount > 0)) continue;
    deductions.push({
      type: 'OTHER_DEDUCTION',
      basis: String(other.type || 'OTHER'),
      amount,
      reason: other.reason || 'Other authorised deduction'
    });
  }

  const totalDeductions = roundMoney(deductions.reduce((s, d) => s + d.amount, 0));
  const sellerNetProceeds = roundMoney(Math.max(0, gross - totalDeductions));
  return {
    steps: [...steps, ...deductions, {
      type: 'SELLER_NET',
      basis: 'NET_AFTER_WATERFALL',
      amount: sellerNetProceeds,
      reason: 'Net seller proceeds after authorised deductions'
    }],
    sellerNetProceeds,
    totalDeductions
  };
}
