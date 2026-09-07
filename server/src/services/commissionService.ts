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
  }): Promise<PropertyCommissionResult> {
    const company = input.companyId ? await Company.findById(input.companyId).lean() : null;
    const vatOnCommission = Boolean(input.vatOnCommission);
    let vatRate = Number(input.vatRate);
    if (vatOnCommission && !Number.isFinite(vatRate) && input.companyId) {
      const lookedUp = await getVatRateForDate(input.companyId, input.paymentDate || new Date());
      vatRate = lookedUp.decimal;
    }
    if (!Number.isFinite(vatRate) || vatRate < 0) vatRate = 0;

    return calculatePropertyCommission({
      grossRent: input.grossRent,
      levy: input.levy,
      commissionPercentage: input.commissionPercentage,
      vatOnCommission,
      vatTreatment: input.vatTreatment,
      vatRate,
      commissionEnabled: company?.featureFlags?.commissionEnabled !== false,
      preaPercentOfTotal: company?.commissionConfig?.preaPercentOfTotal,
      agentPercentOfRemaining: company?.commissionConfig?.agentPercentOfRemaining,
      agencyPercentOfRemaining: company?.commissionConfig?.agencyPercentOfRemaining
    });
  }
}
