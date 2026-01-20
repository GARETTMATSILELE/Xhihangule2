"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureCollections = exports.COLLECTIONS = void 0;
exports.COLLECTIONS = {
    USERS: 'users',
    COMPANIES: 'companies',
    PROPERTIES: 'properties',
    TENANTS: 'tenants',
    LEASES: 'leases',
    PAYMENTS: 'payments',
    MAINTENANCE_REQUESTS: 'maintenancerequests',
    CHART_DATA: 'chartdatas',
    PROPERTY_OWNERS: 'propertyowners',
    SALES_OWNERS: 'salesowners',
    LEVY_PAYMENTS: 'levypayments',
    MUNICIPAL_PAYMENTS: 'municipalpayments',
    PROPERTY_ACCOUNTS: 'propertyaccounts',
    AGENT_ACCOUNTS: 'agentaccounts',
    VALUATIONS: 'valuations',
    DEVELOPMENTS: 'developments',
    DEVELOPMENT_UNITS: 'developmentunits',
    INSPECTIONS: 'inspections',
    VAT_PAYOUTS: 'vatpayouts'
};
// Backward-compatible augmentation for new collections
exports.ensureCollections = Object.assign(Object.assign({}, exports.COLLECTIONS), { INSPECTIONS: exports.COLLECTIONS.INSPECTIONS || 'inspections', VAT_PAYOUTS: exports.COLLECTIONS.VAT_PAYOUTS || 'vatpayouts' });
