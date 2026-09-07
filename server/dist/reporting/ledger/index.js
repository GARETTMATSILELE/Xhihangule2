"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sumDebits = exports.sumCredits = exports.sortLedgerEntries = exports.toSourceReference = void 0;
const toSourceReference = (entry) => ({
    sourceSystem: entry.sourceSystem,
    sourceModel: entry.sourceModel,
    sourceId: entry.sourceId,
    ledgerEntryId: entry.entryId,
    description: entry.eventType
});
exports.toSourceReference = toSourceReference;
const sortLedgerEntries = (entries) => [...entries].sort((a, b) => {
    const byDate = a.effectiveDate.getTime() - b.effectiveDate.getTime();
    if (byDate !== 0)
        return byDate;
    return a.entryId.localeCompare(b.entryId);
});
exports.sortLedgerEntries = sortLedgerEntries;
const sumCredits = (entries) => entries.reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
exports.sumCredits = sumCredits;
const sumDebits = (entries) => entries.reduce((sum, entry) => sum + Number(entry.debit || 0), 0);
exports.sumDebits = sumDebits;
