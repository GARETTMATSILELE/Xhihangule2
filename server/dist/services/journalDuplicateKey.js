"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.duplicateKeyDetails = duplicateKeyDetails;
exports.matchingJournalIdentity = matchingJournalIdentity;
exports.persistedJournalMatchesIdentity = persistedJournalMatchesIdentity;
const money_1 = require("../utils/money");
const SOURCE_FIELDS = ['companyId', 'sourceModule', 'sourceId'];
const REFERENCE_FIELDS = ['companyId', 'reference'];
/**
 * Duplicate-key metadata from MongoDB-compatible servers.
 * A 11000 without keyPattern and keyValue is not treated as a known collision.
 * Production Cosmos DB is not verified to return these fields.
 */
function duplicateKeyDetails(error) {
    var _a, _b;
    const err = error;
    if (!err || Number(err.code) !== 11000)
        return null;
    const pattern = err.keyPattern || ((_a = err.errorResponse) === null || _a === void 0 ? void 0 : _a.keyPattern);
    const value = err.keyValue || ((_b = err.errorResponse) === null || _b === void 0 ? void 0 : _b.keyValue);
    if (!pattern || typeof pattern !== 'object' || Array.isArray(pattern))
        return null;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    return {
        pattern: pattern,
        value: value
    };
}
function sameFieldSet(fields, expected) {
    if (fields.length !== expected.length)
        return false;
    return expected.every((field) => fields.includes(field));
}
/**
 * A duplicate key is a candidate for this posting only when the conflicting
 * index is the journal source identity or the company reference index, and
 * the key values name this operation. Any other index returns null so the
 * caller propagates the error.
 */
function matchingJournalIdentity(error, candidates) {
    const details = duplicateKeyDetails(error);
    if (!details)
        return null;
    const fields = Object.keys(details.pattern);
    const sourceIndex = sameFieldSet(fields, SOURCE_FIELDS);
    const referenceIndex = sameFieldSet(fields, REFERENCE_FIELDS);
    if (!sourceIndex && !referenceIndex)
        return null;
    for (const identity of candidates) {
        if (details.value.companyId != null && !(0, money_1.idsEqual)(details.value.companyId, identity.companyId))
            continue;
        if (sourceIndex) {
            if (String(details.value.sourceModule || '') !== identity.sourceModule)
                continue;
            if (String(details.value.sourceId || '') !== identity.sourceId)
                continue;
            return identity;
        }
        if (!identity.reference || String(details.value.reference || '') !== identity.reference)
            continue;
        return identity;
    }
    return null;
}
function persistedJournalMatchesIdentity(journal, identity) {
    if (!journal)
        return false;
    if (!(0, money_1.idsEqual)(journal.companyId, identity.companyId))
        return false;
    if (String(journal.sourceModule || '') !== identity.sourceModule)
        return false;
    if (String(journal.sourceId || '') !== identity.sourceId)
        return false;
    return true;
}
