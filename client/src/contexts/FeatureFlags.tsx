import { useCompany } from './CompanyContext';

export type FeatureFlag = 'commissionEnabled' | 'agentAccounts' | 'propertyAccounts';

export function useFeature(flag: FeatureFlag): boolean {
  const { company } = useCompany();
  return Boolean(company?.featureFlags && (company.featureFlags as any)[flag] !== false);
}

export function usePropertyLimit(): number | null {
  const { company } = useCompany();
  return company?.propertyLimit ?? null;
}







