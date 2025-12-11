export type Plan = 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';

export interface PlanFeatures {
  commissionEnabled: boolean;
  agentAccounts: boolean;
  propertyAccounts: boolean;
}

export interface PlanConfig {
  propertyLimit: number | null;
  featureFlags: PlanFeatures;
  pricingUSD?: { monthly: number; yearly: number };
}

export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  INDIVIDUAL: {
    propertyLimit: 10,
    featureFlags: {
      commissionEnabled: false,
      agentAccounts: true,
      propertyAccounts: true
    },
    pricingUSD: { monthly: 100, yearly: 1200 }
  },
  SME: {
    propertyLimit: 25,
    featureFlags: {
      commissionEnabled: true,
      agentAccounts: true,
      propertyAccounts: true
    },
    pricingUSD: { monthly: 300, yearly: 3600 }
  },
  ENTERPRISE: {
    propertyLimit: null,
    featureFlags: {
      commissionEnabled: true,
      agentAccounts: true,
      propertyAccounts: true
    },
    pricingUSD: { monthly: 600, yearly: 7200 }
  }
};



