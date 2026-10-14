import mongoose from 'mongoose';
import { Company } from '../models/Company';
import {
  calculatePropertyCommission,
  toPaymentCommissionSnapshot,
  applyLevyPassThroughToSnapshot,
  type PropertyCommissionInput,
  type PropertyCommissionResult,
  type CommissionResult
} from './propertyCommissionCalculator';
import { getVatRateForDate } from './taxRateService';
import { AppError } from '../middleware/errorHandler';

export type { CommissionResult, PropertyCommissionInput, PropertyCommissionResult };
export { calculatePropertyCommission, toPaymentCommissionSnapshot, applyLevyPassThroughToSnapshot };

export class CommissionService {
  public static async calculate(amount: number, commissionPercentage: number, companyId: mongoose.Types.ObjectId): Promise<CommissionResult> {
    const company = await Company.findById(companyId).lean();
    const result = calculatePropertyCommission({
      grossRent: amount,
      levy: 0,
      commissionPercentage,
      vatOnCommission: false,
      commissionEnabled: company?.featureFlags?.commissionEnabled !== false,
      preaPercentOfTotal: company?.commissionConfig?.preaPercentOfTotal,
      agentPercentOfRemaining: company?.commissionConfig?.agentPercentOfRemaining,
      agencyPercentOfRemaining: company?.commissionConfig?.agencyPercentOfRemaining
    });
    return {
      totalCommission: result.totalCommission,
      preaFee: result.preaFee,
      agentShare: result.agentShare,
      agencyShare: result.agencyShare,
      ownerAmount: result.ownerAmount
    };
  }

  public static async calculateForProperty(input: {
    companyId: mongoose.Types.ObjectId | string | undefined;
    grossRent: number;
    levy?: number;
    commissionPercentage: number;
    vatOnCommission?: boolean;
    vatTreatment?: 'inclusive' | 'exclusive' | null;
    vatRate?: number;
    paymentDate?: Date;
    commissionType?: 'management' | 'introduction';
  }): Promise<PropertyCommissionResult> {
    const company = input.companyId ? await Company.findById(input.companyId).lean() : null;
    const vatOnCommission = Boolean(input.vatOnCommission);
    let vatRate = Number(input.vatRate);
    let vatRuleId: string | undefined;
    let vatJurisdiction: string | undefined;
    if (vatOnCommission && input.companyId) {
      const lookedUp = await getVatRateForDate(input.companyId, input.paymentDate || new Date());
      if (lookedUp.source === 'none' || !(lookedUp.decimal > 0)) {
        throw new AppError('No centrally managed VAT rate applies on the payment date. The payment was not saved.', 400);
      }
      vatRate = lookedUp.decimal;
      vatRuleId = lookedUp.taxRateId;
      vatJurisdiction = lookedUp.jurisdiction;
    }
    if (!Number.isFinite(vatRate) || vatRate < 0) vatRate = 0;

    const result = calculatePropertyCommission({
      grossRent: input.grossRent,
      levy: input.levy,
      commissionPercentage: input.commissionPercentage,
      vatOnCommission,
      vatTreatment: input.vatTreatment,
      vatRate,
      commissionEnabled: company?.featureFlags?.commissionEnabled !== false,
      preaPercentOfTotal: company?.commissionConfig?.preaPercentOfTotal,
      agentPercentOfRemaining: company?.commissionConfig?.agentPercentOfRemaining,
      agencyPercentOfRemaining: company?.commissionConfig?.agencyPercentOfRemaining,
      commissionType: input.commissionType
    });
    if (vatRuleId) (result as PropertyCommissionResult & { vatRuleId?: string }).vatRuleId = vatRuleId;
    if (vatJurisdiction) (result as PropertyCommissionResult & { vatJurisdiction?: string }).vatJurisdiction = vatJurisdiction;
    if (input.paymentDate) (result as PropertyCommissionResult & { vatTaxPoint?: Date }).vatTaxPoint = input.paymentDate;
    return result;
  }
}
