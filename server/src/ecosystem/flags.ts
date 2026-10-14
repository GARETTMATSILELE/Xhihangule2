import { Company } from '../models/Company';
import { ECOSYSTEM_FLAGS } from './constants';

export type EcosystemFlagKey = (typeof ECOSYSTEM_FLAGS)[keyof typeof ECOSYSTEM_FLAGS];

const ENV_OVERRIDE: Record<EcosystemFlagKey, string> = {
  tenantPortalEnabled: 'TENANT_PORTAL_ENABLED',
  contractorPortalEnabled: 'CONTRACTOR_PORTAL_ENABLED',
  propertyMarketplaceEnabled: 'PROPERTY_MARKETPLACE_ENABLED',
  maintenanceQuotesEnabled: 'MAINTENANCE_QUOTES_ENABLED',
  onlinePaymentsEnabled: 'ONLINE_PAYMENTS_ENABLED',
  multichannelNotificationsEnabled: 'MULTICHANNEL_NOTIFICATIONS_ENABLED',
  tenantReferencesEnabled: 'TENANT_REFERENCES_ENABLED',
  contractorRatingsEnabled: 'CONTRACTOR_RATINGS_ENABLED',
};

function envBool(name: string): boolean | undefined {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return undefined;
}

/** Dev/internal override. Never set in production. Does not change company flag defaults. */
export function isMasterEcosystemOverride(): boolean {
  return envBool('ECOSYSTEM_ENABLED') === true;
}

export function isEcosystemFlagEnabled(
  company: { featureFlags?: Record<string, any> } | null | undefined,
  flag: EcosystemFlagKey
): boolean {
  const env = envBool(ENV_OVERRIDE[flag]);
  if (env === true) return true;
  if (company?.featureFlags && company.featureFlags[flag] === true) return true;
  if (env === false) return false;
  return false;
}

export function isFlagEnabledForCompany(
  company: { featureFlags?: Record<string, any> } | null | undefined,
  flag: EcosystemFlagKey
): boolean {
  return isMasterEcosystemOverride() || isEcosystemFlagEnabled(company, flag);
}

export async function getCompanyFlags(companyId?: string | null) {
  if (!companyId) return null;
  return Company.findById(companyId).select('featureFlags maintenanceApprovals workspaceType plan').lean();
}

export function ownerApprovalRequired(company: { featureFlags?: Record<string, any> } | null | undefined): boolean {
  if (!company) return true;
  if (company.featureFlags && company.featureFlags.maintenanceApprovals === false) return false;
  return true;
}

export function isChannelGloballyEnabled(channel: 'EMAIL' | 'SMS' | 'WHATSAPP'): boolean {
  if (channel === 'EMAIL') {
    const v = envBool('EMAIL_ENABLED');
    if (v === false) return false;
    return Boolean(process.env.SMTP_HOST || process.env.EMAIL_PROVIDER || v === true);
  }
  if (channel === 'SMS') {
    return envBool('SMS_ENABLED') === true && Boolean(process.env.SMS_PROVIDER);
  }
  return envBool('WHATSAPP_ENABLED') === true && Boolean(process.env.WHATSAPP_PROVIDER);
}
