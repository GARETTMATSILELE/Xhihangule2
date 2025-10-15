"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_CONFIG = void 0;
exports.PLAN_CONFIG = {
    INDIVIDUAL: {
        propertyLimit: 10,
        featureFlags: {
            commissionEnabled: false,
            agentAccounts: true,
            propertyAccounts: true
        },
        pricingUSD: { monthly: 100, yearly: 1000 }
    },
    SME: {
        propertyLimit: 25,
        featureFlags: {
            commissionEnabled: true,
            agentAccounts: true,
            propertyAccounts: true
        },
        pricingUSD: { monthly: 300, yearly: 3000 }
    },
    ENTERPRISE: {
        propertyLimit: null,
        featureFlags: {
            commissionEnabled: true,
            agentAccounts: true,
            propertyAccounts: true
        },
        pricingUSD: { monthly: 600, yearly: 6000 }
    }
};
