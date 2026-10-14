"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORPHAN_SCAN_WINDOW_HOURS = void 0;
exports.detectOrphanAccountingRecords = detectOrphanAccountingRecords;
exports.runPaymentAccountingIntegrityPass = runPaymentAccountingIntegrityPass;
exports.getCompanyAccountingIntegritySummary = getCompanyAccountingIntegritySummary;
exports.listCompanyAccountingInconsistencies = listCompanyAccountingInconsistencies;
/**
 * Read-only accounting watchdog.
 *
 * Financial ledger writers are intentionally not imported here.
 * This module may persist diagnostic integrity flags and exception rows only.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const logger_1 = require("../utils/logger");
const Payment_1 = require("../models/Payment");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const AgentAccount_1 = require("../models/AgentAccount");
const CompanyAccount_1 = require("../models/CompanyAccount");
const JournalEntry_1 = require("../models/JournalEntry");
const VatRecord_1 = require("../models/VatRecord");
const rentalDeposit_1 = require("../models/rentalDeposit");
const AccountingException_1 = require("../models/AccountingException");
const paymentReconciliationQuery_1 = require("./paymentReconciliationQuery");
const paymentAccountingProjection_1 = require("./paymentAccountingProjection");
const paymentAccountingReconciliation_1 = require("./paymentAccountingReconciliation");
function asObjectId(value) {
    return mongoose_1.default.Types.ObjectId.isValid(value) ? new mongoose_1.default.Types.ObjectId(value) : null;
}
function paymentIdFromJournalSource(sourceId) {
    return String(sourceId || '').split(':')[0];
}
function paymentExists(paymentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const oid = asObjectId(paymentId);
        if (!oid)
            return false;
        const hit = yield Payment_1.Payment.findById(oid).select('_id').lean();
        return Boolean(hit);
    });
}
function flagOrphan(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        const oid = asObjectId(input.paymentId);
        yield AccountingException_1.AccountingException.updateOne({
            kind: 'orphan_accounting',
            ledger: input.ledger,
            'accountingRef.accountId': input.accountId || '',
            'accountingRef.transactionId': input.transactionId || input.paymentId
        }, {
            $set: {
                status: 'open',
                paymentId: oid || undefined,
                companyId: input.companyId && mongoose_1.default.Types.ObjectId.isValid(input.companyId)
                    ? new mongoose_1.default.Types.ObjectId(input.companyId)
                    : undefined,
                propertyId: input.propertyId && mongoose_1.default.Types.ObjectId.isValid(input.propertyId)
                    ? new mongoose_1.default.Types.ObjectId(input.propertyId)
                    : undefined,
                error: `accounting record has no source Payment (${input.paymentId})`,
                lastCheckedAt: now,
                issueType: 'orphaned',
                component: input.ledger,
                expected: 'Source Payment missing',
                actual: 'Accounting record exists',
                accountingRef: {
                    collection: input.collection,
                    accountId: input.accountId,
                    transactionId: input.transactionId || input.paymentId
                }
            },
            $setOnInsert: {
                kind: 'orphan_accounting',
                ledger: input.ledger,
                issueType: 'orphaned',
                detectedAt: now
            }
        }, { upsert: true });
    });
}
/**
 * Windowed orphan scan. Does not scan the entire accounting corpus.
 * Recent accounts/journals only (ORPHAN_SCAN_WINDOW_HOURS). Never deletes orphans.
 */
exports.ORPHAN_SCAN_WINDOW_HOURS = 48;
function detectOrphanAccountingRecords() {
    return __awaiter(this, arguments, void 0, function* (limit = 50) {
        const stats = { scanned: 0, flagged: 0 };
        const since = new Date(Date.now() - exports.ORPHAN_SCAN_WINDOW_HOURS * 60 * 60 * 1000);
        const max = Math.max(1, Math.min(limit, paymentReconciliationQuery_1.PAYMENT_RECONCILIATION_BATCH_SIZE));
        const propertyRows = yield PropertyAccount_1.default.find({
            lastUpdated: { $gte: since },
            isArchived: { $ne: true }
        }).select('_id propertyId transactions.paymentId transactions._id').limit(max).lean();
        for (const account of propertyRows) {
            for (const tx of account.transactions || []) {
                const pid = (tx === null || tx === void 0 ? void 0 : tx.paymentId) ? String(tx.paymentId) : '';
                if (!pid)
                    continue;
                stats.scanned += 1;
                if (!(yield paymentExists(pid))) {
                    stats.flagged += 1;
                    yield flagOrphan({
                        ledger: 'property',
                        paymentId: pid,
                        propertyId: account.propertyId ? String(account.propertyId) : undefined,
                        accountId: String(account._id),
                        transactionId: (tx === null || tx === void 0 ? void 0 : tx._id) ? String(tx._id) : pid,
                        collection: 'propertyaccounts'
                    });
                }
            }
        }
        const agentRows = yield AgentAccount_1.AgentAccount.find({
            lastUpdated: { $gte: since }
        }).select('_id agentId transactions.paymentId transactions._id').limit(max).lean();
        for (const account of agentRows) {
            for (const tx of account.transactions || []) {
                const pid = (tx === null || tx === void 0 ? void 0 : tx.paymentId) ? String(tx.paymentId) : '';
                if (!pid)
                    continue;
                stats.scanned += 1;
                if (!(yield paymentExists(pid))) {
                    stats.flagged += 1;
                    yield flagOrphan({
                        ledger: 'agent',
                        paymentId: pid,
                        accountId: String(account._id),
                        transactionId: (tx === null || tx === void 0 ? void 0 : tx._id) ? String(tx._id) : pid,
                        collection: 'agentaccounts'
                    });
                }
            }
        }
        const companyRows = yield CompanyAccount_1.CompanyAccount.find({
            lastUpdated: { $gte: since }
        }).select('_id companyId transactions.paymentId transactions._id').limit(max).lean();
        for (const account of companyRows) {
            for (const tx of account.transactions || []) {
                const pid = (tx === null || tx === void 0 ? void 0 : tx.paymentId) ? String(tx.paymentId) : '';
                if (!pid)
                    continue;
                stats.scanned += 1;
                if (!(yield paymentExists(pid))) {
                    stats.flagged += 1;
                    yield flagOrphan({
                        ledger: 'company',
                        paymentId: pid,
                        companyId: account.companyId ? String(account.companyId) : undefined,
                        accountId: String(account._id),
                        transactionId: (tx === null || tx === void 0 ? void 0 : tx._id) ? String(tx._id) : pid,
                        collection: 'companyaccounts'
                    });
                }
            }
        }
        const journals = yield JournalEntry_1.JournalEntry.find({
            createdAt: { $gte: since },
            sourceId: { $exists: true, $type: 'string' }
        }).select('_id companyId sourceId').limit(max).lean();
        for (const row of journals) {
            const pid = paymentIdFromJournalSource(String(row.sourceId || ''));
            if (!pid)
                continue;
            stats.scanned += 1;
            if (!(yield paymentExists(pid))) {
                stats.flagged += 1;
                yield flagOrphan({
                    ledger: 'journal',
                    paymentId: pid,
                    companyId: row.companyId ? String(row.companyId) : undefined,
                    accountId: String(row._id),
                    transactionId: String(row._id),
                    collection: 'journalentries'
                });
            }
        }
        const vats = yield VatRecord_1.VatRecord.find({
            createdAt: { $gte: since }
        }).select('_id companyId transactionId').limit(max).lean();
        for (const row of vats) {
            const pid = String(row.transactionId || '');
            if (!pid)
                continue;
            stats.scanned += 1;
            if (!(yield paymentExists(pid))) {
                stats.flagged += 1;
                yield flagOrphan({
                    ledger: 'vat',
                    paymentId: pid,
                    companyId: row.companyId ? String(row.companyId) : undefined,
                    accountId: String(row._id),
                    transactionId: pid,
                    collection: 'vatrecords'
                });
            }
        }
        const deposits = yield rentalDeposit_1.RentalDeposit.find({
            createdAt: { $gte: since },
            type: 'payment',
            paymentId: { $exists: true }
        }).select('_id companyId propertyId paymentId').limit(max).lean();
        for (const row of deposits) {
            const pid = row.paymentId ? String(row.paymentId) : '';
            if (!pid)
                continue;
            stats.scanned += 1;
            if (!(yield paymentExists(pid))) {
                stats.flagged += 1;
                yield flagOrphan({
                    ledger: 'deposit',
                    paymentId: pid,
                    companyId: row.companyId ? String(row.companyId) : undefined,
                    propertyId: row.propertyId ? String(row.propertyId) : undefined,
                    accountId: String(row._id),
                    transactionId: String(row._id),
                    collection: 'rentaldeposits'
                });
            }
        }
        return stats;
    });
}
/**
 * READ / COMPARE / FLAG. Zero financial writes.
 * Selection: tracked incomplete payments only (accountingComplete=false or diagnostic pending/partial/failed/incomplete).
 * Historical payments without those fields are never selected.
 */
function runPaymentAccountingIntegrityPass() {
    return __awaiter(this, arguments, void 0, function* (limit = 50) {
        const stats = { selected: 0, checked: 0, complete: 0, incomplete: 0, orphansFlagged: 0 };
        const filter = (0, paymentAccountingProjection_1.buildAccountingIntegrityCandidateFilter)();
        const rows = yield Payment_1.Payment.find(filter)
            .select('_id companyId propertyId accountingComplete accountingStatus')
            .sort({ accountingLastAttemptAt: 1, _id: 1 })
            .limit(Math.max(1, Math.min(limit, paymentReconciliationQuery_1.PAYMENT_RECONCILIATION_BATCH_SIZE)))
            .lean();
        stats.selected = rows.length;
        for (const row of rows) {
            const paymentId = String(row._id);
            try {
                stats.checked += 1;
                const recon = yield (0, paymentAccountingReconciliation_1.reconcilePayment)(paymentId);
                yield (0, paymentAccountingReconciliation_1.applyReconciliationOutcome)(paymentId, recon, {
                    companyId: row.companyId ? String(row.companyId) : undefined
                });
                if (recon.accountingComplete)
                    stats.complete += 1;
                else
                    stats.incomplete += 1;
                logger_1.logger.info('Accounting integrity check', {
                    paymentId,
                    result: recon.accountingComplete ? 'complete' : 'incomplete',
                    missing: recon.missing,
                    mismatched: recon.mismatched,
                    timestamp: new Date().toISOString()
                });
            }
            catch (e) {
                stats.incomplete += 1;
                logger_1.logger.warn('Integrity detection failed', { paymentId, error: (e === null || e === void 0 ? void 0 : e.message) || e });
            }
        }
        try {
            const orphans = yield detectOrphanAccountingRecords(limit);
            stats.orphansFlagged = orphans.flagged;
        }
        catch (e) {
            logger_1.logger.warn('Orphan accounting detection failed', { error: (e === null || e === void 0 ? void 0 : e.message) || e });
        }
        logger_1.logger.info('Payment accounting integrity pass completed', stats);
        return stats;
    });
}
function companyOid(companyId) {
    if (!mongoose_1.default.Types.ObjectId.isValid(companyId)) {
        throw new Error('Invalid companyId');
    }
    return new mongoose_1.default.Types.ObjectId(companyId);
}
function getCompanyAccountingIntegritySummary(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const cid = companyOid(companyId);
        const tracked = { companyId: cid, accountingComplete: { $in: [true, false] } };
        const [totalChecked, complete, incomplete, mismatched, orphaned, exceptions] = yield Promise.all([
            Payment_1.Payment.countDocuments(tracked),
            Payment_1.Payment.countDocuments({ companyId: cid, accountingComplete: true }),
            Payment_1.Payment.countDocuments({ companyId: cid, accountingComplete: false }),
            AccountingException_1.AccountingException.countDocuments({ companyId: cid, status: 'open', issueType: 'mismatched' }),
            AccountingException_1.AccountingException.countDocuments({ companyId: cid, status: 'open', kind: 'orphan_accounting' }),
            AccountingException_1.AccountingException.countDocuments({ companyId: cid, status: 'open' })
        ]);
        return {
            totalChecked,
            complete,
            incomplete,
            mismatched,
            orphaned,
            exceptions,
            orphanScanWindowHours: exports.ORPHAN_SCAN_WINDOW_HOURS
        };
    });
}
function displayName(doc, fallback = '') {
    if (!doc)
        return fallback;
    if (typeof doc === 'string')
        return doc;
    const name = String(doc.name || '').trim();
    if (name)
        return name;
    const person = `${doc.firstName || ''} ${doc.lastName || ''}`.trim();
    if (person)
        return person;
    if (doc.address)
        return String(doc.address);
    return fallback;
}
function listCompanyAccountingInconsistencies(companyId_1) {
    return __awaiter(this, arguments, void 0, function* (companyId, filters = {}) {
        const cid = companyOid(companyId);
        const page = Math.max(1, Number(filters.page || 1));
        const limit = Math.max(1, Math.min(100, Number(filters.limit || 25)));
        const query = { companyId: cid, status: 'open' };
        const status = String(filters.status || 'all');
        if (status === 'orphaned')
            query.kind = 'orphan_accounting';
        else if (status === 'mismatched')
            query.issueType = 'mismatched';
        else if (status === 'incomplete')
            query.kind = 'incomplete_projection';
        if (filters.component) {
            const component = String(filters.component);
            query.$or = [
                { component },
                { missingComponents: component },
                { 'issues.component': component },
                { ledger: componentToLedger(component) }
            ];
        }
        const paymentFilter = { companyId: cid };
        let constrainPayments = false;
        if (filters.dateFrom || filters.dateTo) {
            const paymentDate = {};
            if (filters.dateFrom)
                paymentDate.$gte = filters.dateFrom;
            if (filters.dateTo)
                paymentDate.$lte = filters.dateTo;
            paymentFilter.paymentDate = paymentDate;
            constrainPayments = true;
        }
        if (filters.propertyId && mongoose_1.default.Types.ObjectId.isValid(filters.propertyId)) {
            paymentFilter.propertyId = new mongoose_1.default.Types.ObjectId(filters.propertyId);
            constrainPayments = true;
        }
        if (filters.agentId && mongoose_1.default.Types.ObjectId.isValid(filters.agentId)) {
            paymentFilter.agentId = new mongoose_1.default.Types.ObjectId(filters.agentId);
            constrainPayments = true;
        }
        if (filters.currency) {
            paymentFilter.currency = filters.currency;
            constrainPayments = true;
        }
        if (filters.paymentReference && String(filters.paymentReference).trim()) {
            paymentFilter.referenceNumber = new RegExp(String(filters.paymentReference).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            constrainPayments = true;
        }
        if (constrainPayments) {
            const paymentIds = yield Payment_1.Payment.find(paymentFilter).select('_id').limit(2000).lean();
            query.paymentId = { $in: paymentIds.map((row) => row._id) };
        }
        const [total, rows] = yield Promise.all([
            AccountingException_1.AccountingException.countDocuments(query),
            AccountingException_1.AccountingException.find(query)
                .sort({ detectedAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
        ]);
        const paymentIds = Array.from(new Set(rows.map((row) => row.paymentId).filter(Boolean).map((id) => String(id))));
        const payments = paymentIds.length
            ? yield Payment_1.Payment.find({ _id: { $in: paymentIds }, companyId: cid })
                .select('referenceNumber paymentDate propertyId tenantId agentId currency amount depositAmount accountingComplete')
                .populate('propertyId', 'name address')
                .populate('tenantId', 'name firstName lastName')
                .lean()
            : [];
        const paymentMap = new Map(payments.map((p) => [String(p._id), p]));
        const items = rows.map((row) => {
            const payment = row.paymentId ? paymentMap.get(String(row.paymentId)) : undefined;
            const issue = Array.isArray(row.issues) && row.issues.length ? row.issues[0] : null;
            const component = row.component || (issue === null || issue === void 0 ? void 0 : issue.component) || row.ledger || (row.missingComponents || [])[0] || '';
            const statusLabel = row.kind === 'orphan_accounting'
                ? 'ORPHANED'
                : (row.issueType === 'mismatched' ? 'MISMATCHED' : 'MISSING');
            return {
                id: String(row._id),
                date: (payment === null || payment === void 0 ? void 0 : payment.paymentDate) || row.detectedAt,
                paymentReference: (payment === null || payment === void 0 ? void 0 : payment.referenceNumber) || '',
                paymentId: row.paymentId ? String(row.paymentId) : '',
                property: displayName(payment === null || payment === void 0 ? void 0 : payment.propertyId),
                tenant: displayName(payment === null || payment === void 0 ? void 0 : payment.tenantId),
                currency: (payment === null || payment === void 0 ? void 0 : payment.currency) || '',
                issue: row.error || statusLabel,
                component,
                expected: row.expected != null ? row.expected : (statusLabel === 'ORPHANED' ? 'Source Payment missing' : issue === null || issue === void 0 ? void 0 : issue.expected),
                actual: row.actual != null ? row.actual : (statusLabel === 'ORPHANED' ? 'Accounting record exists' : issue === null || issue === void 0 ? void 0 : issue.actual),
                difference: row.difference != null ? row.difference : issue === null || issue === void 0 ? void 0 : issue.difference,
                status: statusLabel,
                accountingComplete: (payment === null || payment === void 0 ? void 0 : payment.accountingComplete) === true,
                canRepair: row.kind !== 'orphan_accounting' && Boolean(row.paymentId)
            };
        });
        return { items, total, page, limit };
    });
}
function componentToLedger(component) {
    const map = {
        ownerIncome: 'property',
        agentCommission: 'agent',
        companyCommission: 'company',
        journal: 'journal',
        vat: 'vat',
        deposit: 'deposit',
        property: 'property',
        agent: 'agent',
        company: 'company'
    };
    return map[component];
}
