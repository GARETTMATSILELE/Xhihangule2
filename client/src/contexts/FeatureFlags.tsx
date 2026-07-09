import { useCompany } from './CompanyContext';

export type FeatureFlag =
  | 'commissionEnabled'
  | 'agentAccounts'
  | 'propertyAccounts'
  | 'propertyOwners'
  | 'commissions'
  | 'trustAccounting'
  | 'maintenanceApprovals'
  | 'accounting'
  | 'agents'
  | 'multiUser'
  | 'advancedReports'
  | 'apiAccess'
  | 'prioritySupport';

const PLAN_FEATURES: Record<string, Partial<Record<FeatureFlag, boolean>>> = {
  INDIVIDUAL: {
    commissionEnabled: false,
    agentAccounts: true,
    propertyAccounts: true,
    propertyOwners: false,
    commissions: false,
    trustAccounting: false,
    maintenanceApprovals: false,
    accounting: true,
    agents: false,
    multiUser: false,
    advancedReports: false,
    apiAccess: false,
    prioritySupport: false
  },
  SME: {
    commissionEnabled: true,
    agentAccounts: true,
    propertyAccounts: true,
    propertyOwners: true,
    commissions: true,
    trustAccounting: true,
    maintenanceApprovals: true,
    accounting: true,
    agents: true,
    multiUser: true,
    advancedReports: true,
    apiAccess: false,
    prioritySupport: false
  },
  ENTERPRISE: {
    commissionEnabled: true,
    agentAccounts: true,
    propertyAccounts: true,
    propertyOwners: true,
    commissions: true,
    trustAccounting: true,
    maintenanceApprovals: true,
    accounting: true,
    agents: true,
    multiUser: true,
    advancedReports: true,
    apiAccess: true,
    prioritySupport: true
  }
};

export function useFeature(flag: FeatureFlag): boolean {
  const { company } = useCompany();
  const planDefault = PLAN_FEATURES[company?.plan || 'INDIVIDUAL']?.[flag];
  const explicit = (company?.featureFlags as any)?.[flag];
  if (explicit !== undefined) return explicit !== false;
  return planDefault !== false;
}

export function isIndividualWorkspace(company: { workspaceType?: string; plan?: string } | null | undefined): boolean {
  return company?.workspaceType === 'individual' || company?.plan === 'INDIVIDUAL';
}

export function isAgencyWorkspace(company: { workspaceType?: string; plan?: string } | null | undefined): boolean {
  return !isIndividualWorkspace(company);
}

export function getCompanyFeature(
  company: { featureFlags?: Partial<Record<FeatureFlag, boolean>>; plan?: string } | null | undefined,
  flag: FeatureFlag
): boolean {
  const explicit = (company?.featureFlags as any)?.[flag];
  if (explicit !== undefined) return explicit !== false;
  const planDefault = PLAN_FEATURES[company?.plan || 'INDIVIDUAL']?.[flag];
  return planDefault !== false;
}

export function usePropertyLimit(): number | null {
  const { company } = useCompany();
  return company?.propertyLimit ?? null;
}

export function usePlanLimits() {
  const { company } = useCompany();
  const plan = company?.plan || 'INDIVIDUAL';
  return {
    plan,
    propertyLimit: company?.propertyLimit ?? (plan === 'INDIVIDUAL' ? 10 : plan === 'SME' ? 120 : null),
    userLimit: plan === 'INDIVIDUAL' ? 1 : plan === 'SME' ? 25 : null,
    storageGb: plan === 'INDIVIDUAL' ? 2 : plan === 'SME' ? 10 : null
  };
}




















