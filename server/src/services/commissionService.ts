import mongoose from 'mongoose';
import { Company } from '../models/Company';

export interface CommissionResult {
  totalCommission: number;
  preaFee: number;
  agentShare: number;
  agencyShare: number;
  ownerAmount: number;
}

export class CommissionService {
  public static async calculate(amount: number, commissionPercentage: number, companyId: mongoose.Types.ObjectId): Promise<CommissionResult> {
    const company = await Company.findById(companyId).lean();
    const commissionEnabled = company?.featureFlags?.commissionEnabled !== false;
    if (!commissionEnabled) {
      return {
        totalCommission: 0,
        preaFee: 0,
        agentShare: 0,
        agencyShare: 0,
        ownerAmount: amount
      };
    }

    const totalCommission = (amount * (commissionPercentage || 0)) / 100;
    const preaPercentOfTotal = Math.max(0, Math.min(1, company?.commissionConfig?.preaPercentOfTotal ?? 0.03));
    const agentPercentOfRemaining = Math.max(0, Math.min(1, company?.commissionConfig?.agentPercentOfRemaining ?? 0.6));
    const agencyPercentOfRemaining = Math.max(0, Math.min(1, company?.commissionConfig?.agencyPercentOfRemaining ?? 0.4));

    const preaFee = totalCommission * preaPercentOfTotal;
    const remainingCommission = totalCommission - preaFee;
    const agentShare = remainingCommission * agentPercentOfRemaining;
    const agencyShare = remainingCommission * agencyPercentOfRemaining;
    return {
      totalCommission,
      preaFee,
      agentShare,
      agencyShare,
      ownerAmount: amount - totalCommission
    };
  }
}