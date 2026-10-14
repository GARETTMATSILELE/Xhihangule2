"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OWNER_COLLECTION_STATUSES = void 0;
exports.nextOwnerCollectionStatus = nextOwnerCollectionStatus;
exports.assertOwnerCollectionTransition = assertOwnerCollectionTransition;
/**
 * Operational owner cash-collection workflow.
 * This is evidence of who collected what. It does not post accounting.
 */
exports.OWNER_COLLECTION_STATUSES = [
    'NOT_REQUESTED',
    'OWNER_REQUESTED',
    'READY_FOR_COLLECTION',
    'COLLECTED',
    'ACKNOWLEDGED',
];
const NEXT = {
    NOT_REQUESTED: 'OWNER_REQUESTED',
    OWNER_REQUESTED: 'READY_FOR_COLLECTION',
    READY_FOR_COLLECTION: 'COLLECTED',
    COLLECTED: 'ACKNOWLEDGED',
    ACKNOWLEDGED: null,
};
function nextOwnerCollectionStatus(current) {
    var _a;
    return (_a = NEXT[current]) !== null && _a !== void 0 ? _a : null;
}
function assertOwnerCollectionTransition(current, requested) {
    const allowed = NEXT[current];
    if (allowed !== requested) {
        const error = new Error(`Collection cannot move from ${current} to ${requested}. Next status is ${allowed || 'none'}.`);
        error.status = 409;
        throw error;
    }
}
