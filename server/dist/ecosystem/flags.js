"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMasterEcosystemOverride = isMasterEcosystemOverride;
exports.isEcosystemFlagEnabled = isEcosystemFlagEnabled;
exports.isFlagEnabledForCompany = isFlagEnabledForCompany;
exports.getCompanyFlags = getCompanyFlags;
exports.ownerApprovalRequired = ownerApprovalRequired;
exports.isChannelGloballyEnabled = isChannelGloballyEnabled;
const Company_1 = require("../models/Company");
const ENV_OVERRIDE = {
    tenantPortalEnabled: 'TENANT_PORTAL_ENABLED',
    contractorPortalEnabled: 'CONTRACTOR_PORTAL_ENABLED',
    propertyMarketplaceEnabled: 'PROPERTY_MARKETPLACE_ENABLED',
    maintenanceQuotesEnabled: 'MAINTENANCE_QUOTES_ENABLED',
    onlinePaymentsEnabled: 'ONLINE_PAYMENTS_ENABLED',
    multichannelNotificationsEnabled: 'MULTICHANNEL_NOTIFICATIONS_ENABLED',
    tenantReferencesEnabled: 'TENANT_REFERENCES_ENABLED',
    contractorRatingsEnabled: 'CONTRACTOR_RATINGS_ENABLED',
};
function envBool(name) {
    const raw = String(process.env[name] || '').trim().toLowerCase();
    if (!raw)
        return undefined;
    if (['1', 'true', 'yes', 'on'].includes(raw))
        return true;
    if (['0', 'false', 'no', 'off'].includes(raw))
        return false;
    return undefined;
}
/** Dev/internal override. Never set in production. Does not change company flag defaults. */
function isMasterEcosystemOverride() {
    return envBool('ECOSYSTEM_ENABLED') === true;
}
function isEcosystemFlagEnabled(company, flag) {
    const env = envBool(ENV_OVERRIDE[flag]);
    if (env === true)
        return true;
    if ((company === null || company === void 0 ? void 0 : company.featureFlags) && company.featureFlags[flag] === true)
        return true;
    if (env === false)
        return false;
    return false;
}
function isFlagEnabledForCompany(company, flag) {
    return isMasterEcosystemOverride() || isEcosystemFlagEnabled(company, flag);
}
function getCompanyFlags(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!companyId)
            return null;
        return Company_1.Company.findById(companyId).select('featureFlags maintenanceApprovals workspaceType plan').lean();
    });
}
function ownerApprovalRequired(company) {
    if (!company)
        return true;
    if (company.featureFlags && company.featureFlags.maintenanceApprovals === false)
        return false;
    return true;
}
function isChannelGloballyEnabled(channel) {
    if (channel === 'EMAIL') {
        const v = envBool('EMAIL_ENABLED');
        if (v === false)
            return false;
        return Boolean(process.env.SMTP_HOST || process.env.EMAIL_PROVIDER || v === true);
    }
    if (channel === 'SMS') {
        return envBool('SMS_ENABLED') === true && Boolean(process.env.SMS_PROVIDER);
    }
    return envBool('WHATSAPP_ENABLED') === true && Boolean(process.env.WHATSAPP_PROVIDER);
}
