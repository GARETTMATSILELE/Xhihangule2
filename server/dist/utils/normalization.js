"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEmail = normalizeEmail;
exports.normalizeLegalIdentifier = normalizeLegalIdentifier;
exports.escapeRegex = escapeRegex;
exports.normalizeCompanyType = normalizeCompanyType;
exports.normalizeWorkspaceType = normalizeWorkspaceType;
function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}
function normalizeLegalIdentifier(value) {
    const normalized = String(value || '').trim();
    return normalized ? normalized.toUpperCase().replace(/\s+/g, '') : undefined;
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function normalizeCompanyType(value) {
    return value === 'INDIVIDUAL_LANDLORD' ? 'INDIVIDUAL_LANDLORD' : 'REGISTERED_BUSINESS';
}
function normalizeWorkspaceType(value, fallback = 'agency') {
    return value === 'individual' ? 'individual' : fallback;
}
