"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLeaseAvailable = isLeaseAvailable;
exports.canMutateLease = canMutateLease;
function isLeaseAvailable(doc, now) {
    if (!doc)
        return true;
    if (!doc.ownerToken)
        return true;
    const expiresAt = doc.leaseExpiresAt ? new Date(doc.leaseExpiresAt) : new Date(0);
    return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
}
function canMutateLease(doc, token) {
    return Boolean(doc && token && doc.ownerToken === token);
}
