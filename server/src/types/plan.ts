export type Plan = 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
export type WorkspaceType = 'agency' | 'individual';

export interface PlanFeatures {
  commissionEnabled: boolean;
  agentAccounts: boolean;
  propertyAccounts: boolean;
  propertyOwners: boolean;
  commissions: boolean;
  trustAccounting: boolean;
  maintenanceApprovals: boolean;
  accounting: boolean;
  agents: boolean;
  tenantPortalEnabled?: boolean;
  contractorPortalEnabled?: boolean;
  propertyMarketplaceEnabled?: boolean;
  maintenanceQuotesEnabled?: boolean;
  onlinePaymentsEnabled?: boolean;
  multichannelNotificationsEnabled?: boolean;
  tenantReferencesEnabled?: boolean;
  contractorRatingsEnabled?: boolean;
}

export interface PlanConfig {
  propertyLimit: number | null;
  featureFlags: PlanFeatures;
  pricingUSD?: { monthly: number; yearly: number };
  workspaceType: WorkspaceType;
}

export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  INDIVIDUAL: {
    propertyLimit: 10,
    featureFlags: {
      commissionEnabled: false,
      agentAccounts: true,
      propertyAccounts: true,
      propertyOwners: false,
      commissions: false,
      trustAccounting: false,
      maintenanceApprovals: false,
      accounting: true,
      agents: false
    },
    pricingUSD: { monthly: 250, yearly: 3000 },
    workspaceType: 'individual'
  },
  SME: {
    propertyLimit: 25,
    featureFlags: {
      commissionEnabled: true,
      agentAccounts: true,
      propertyAccounts: true,
      propertyOwners: true,
      commissions: true,
      trustAccounting: true,
      maintenanceApprovals: true,
      accounting: true,
      agents: true
    },
    pricingUSD: { monthly: 600, yearly: 7200 },
    workspaceType: 'agency'
  },
  ENTERPRISE: {
    propertyLimit: null,
    featureFlags: {
      commissionEnabled: true,
      agentAccounts: true,
      propertyAccounts: true,
      propertyOwners: true,
      commissions: true,
      trustAccounting: true,
      maintenanceApprovals: true,
      accounting: true,
      agents: true
    },
    pricingUSD: { monthly: 1200, yearly: 14400 },
    workspaceType: 'agency'
  }
};



