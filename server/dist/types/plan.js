"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_CONFIG = void 0;
exports.PLAN_CONFIG = {
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
