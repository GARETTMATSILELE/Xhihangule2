"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.samePaynowEventConflict = samePaynowEventConflict;
const journalDuplicateKey_1 = require("./journalDuplicateKey");
/**
 * A duplicate-key error proves this Paynow callback only when the index fields are
 * exactly provider and eventId and the values name this event. Missing metadata,
 * or a different index, is not the same event.
 */
function samePaynowEventConflict(error, eventId) {
    const details = (0, journalDuplicateKey_1.duplicateKeyDetails)(error);
    if (!details)
        return false;
    const fields = Object.keys(details.pattern);
    if (fields.length !== 2 || !fields.includes('provider') || !fields.includes('eventId'))
        return false;
    return String(details.value.eventId || '') === eventId && String(details.value.provider || '') === 'paynow';
}
