import { AppError } from '../middleware/errorHandler';

export interface CommissionRates {
  totalCommission: number;
  preaFee: number;
  agentShare: number;
  agencyShare: number;
}

export interface CommissionResult {
  totalCommission: number;
  preaFee: number;
  agentShare: number;
  agencyShare: number;
  ownerAmount: number;
}

const RATES: Record<string, CommissionRates> = {
  residential: {
    totalCommission: 0.10, // 10%
    preaFee: 0.02, // 2%
    agentShare: 0.05, // 5%
    agencyShare: 0.03, // 3%
  },
  commercial: {
    totalCommission: 0.15, // 15%
    preaFee: 0.03, // 3%
    agentShare: 0.07, // 7%
    agencyShare: 0.05, // 5%
  }
};

export class CommissionService {
  private static instance: CommissionService;

  private constructor() {}

  public static getInstance(): CommissionService {
    if (!CommissionService.instance) {
      CommissionService.instance = new CommissionService();
    }
    return CommissionService.instance;
  }

  public calculateCommission(amount: number, propertyType: string): CommissionResult {
    if (amount <= 0) {
      throw new AppError('Amount must be greater than 0', 400, 'INVALID_AMOUNT');
    }

    const rate = RATES[propertyType.toLowerCase()];
    if (!rate) {
      throw new AppError('Invalid property type', 400, 'INVALID_PROPERTY_TYPE');
    }

    return {
      totalCommission: amount * rate.totalCommission,
      preaFee: amount * rate.preaFee,
      agentShare: amount * rate.agentShare,
      agencyShare: amount * rate.agencyShare,
      ownerAmount: amount * (1 - rate.totalCommission)
    };
  }

  public getRates(propertyType: string): CommissionRates {
    const rate = RATES[propertyType.toLowerCase()];
    if (!rate) {
      throw new AppError('Invalid property type', 400, 'INVALID_PROPERTY_TYPE');
    }
    return { ...rate };
  }
} 