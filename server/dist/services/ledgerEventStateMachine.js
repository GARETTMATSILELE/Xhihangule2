"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isClaimableLedgerEvent = isClaimableLedgerEvent;
exports.nextLedgerEventStatusAfterClaim = nextLedgerEventStatusAfterClaim;
exports.nextLedgerEventStatusAfterSuccess = nextLedgerEventStatusAfterSuccess;
exports.nextLedgerEventStatusAfterFailure = nextLedgerEventStatusAfterFailure;
exports.computeLedgerBackoffMs = computeLedgerBackoffMs;
exports.classifyReversalOutcome = classifyReversalOutcome;
/**
 * Pure claim predicate. A worker crash leaves status=processing;
 * those rows become claimable again after staleProcessingMs.
 */
function isClaimableLedgerEvent(input) {
    var _a;
    const required = input.requiredGeneration;
    if (typeof required === 'number' && input.processorGeneration !== required) {
        return false;
    }
    const now = input.now.getTime();
    const staleMs = (_a = input.staleProcessingMs) !== null && _a !== void 0 ? _a : 5 * 60 * 1000;
    if (input.status === 'completed')
        return false;
    if (input.status === 'processing') {
        const claimed = input.claimedAt ? new Date(input.claimedAt).getTime() : 0;
        return claimed > 0 && now - claimed >= staleMs;
    }
    if (input.status === 'pending' || input.status === 'failed') {
        const next = input.nextAttemptAt ? new Date(input.nextAttemptAt).getTime() : 0;
        return !next || next <= now;
    }
    return false;
}
function nextLedgerEventStatusAfterClaim() {
    return 'processing';
}
function nextLedgerEventStatusAfterSuccess() {
    return 'completed';
}
function nextLedgerEventStatusAfterFailure() {
    return 'failed';
}
function computeLedgerBackoffMs(attempt) {
    const base = 5000;
    const cap = 10 * 60 * 1000;
    const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
    return exp;
}
function classifyReversalOutcome(progress) {
    const values = Object.values(progress);
    if (values.every((v) => v === 'reversed' || v === 'absent')) {
        return values.some((v) => v === 'reversed') ? 'already_reversed' : 'reversed';
    }
    if (values.some((v) => v === 'failed')) {
        return values.some((v) => v === 'reversed') ? 'partial' : 'failed';
    }
    if (values.some((v) => v === 'active'))
        return 'partial';
    return 'reversed';
}
