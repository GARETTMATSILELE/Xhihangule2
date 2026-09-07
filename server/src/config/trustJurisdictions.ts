import { TrustCustodyType } from '../models/TrustMatter';

export type TrustJurisdictionConfig = {
  country: string;
  currency: string;
  trustRules: string;
  taxRules: string;
  defaultCustody: TrustCustodyType;
  vatEnabled: boolean;
  cgtEnabled: boolean;
  escrowEnabled: boolean;
};

export const ZIMBABWE_TRUST_JURISDICTION: TrustJurisdictionConfig = {
  country: 'Zimbabwe',
  currency: 'USD',
  trustRules: 'ZW_ESTATE_AGENCY_TRUST',
  taxRules: 'ZW_DEFAULT',
  defaultCustody: 'AGENCY_TRUST_BANK',
  vatEnabled: true,
  cgtEnabled: true,
  escrowEnabled: true
};

export const DEFAULT_TRUST_JURISDICTION = ZIMBABWE_TRUST_JURISDICTION;
