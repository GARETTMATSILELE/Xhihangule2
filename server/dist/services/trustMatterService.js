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
const mongoose_1 = __importDefault(require("mongoose"));
const trustJurisdictions_1 = require("../config/trustJurisdictions");
const TrustAuditLog_1 = require("../models/TrustAuditLog");
const TrustMatter_1 = require("../models/TrustMatter");
const money = (n) => Number(Number(n || 0).toFixed(2));
const toObjectId = (id) => new mongoose_1.default.Types.ObjectId(id);
const toOptionalObjectId = (value) => {
    const id = String((value === null || value === void 0 ? void 0 : value._id) || value || '').trim();
    return mongoose_1.default.Types.ObjectId.isValid(id) ? toObjectId(id) : undefined;
};
const DOCUMENT_LABELS = {
    AGREEMENT_OF_SALE: 'Agreement of Sale',
    OFFER_LETTER: 'Offer Letter',
    PROOF_OF_PAYMENT: 'Proof of Payment',
    DEPOSIT_SLIP: 'Deposit Slip',
    TRANSFER_DOCUMENTS: 'Transfer Documents',
    CGT_CLEARANCE: 'CGT Clearance',
    RATES_CLEARANCE: 'Rates Clearance',
    COMMISSION_INVOICE: 'Commission Invoice',
    SELLER_STATEMENT: 'Seller Statement',
    BUYER_STATEMENT: 'Buyer Statement',
    TAX_CERTIFICATE: 'Tax Certificate',
    OTHER_DOCUMENTS: 'Other Documents'
};
const WORKFLOW_LABELS = [
    { key: 'TRUST_MATTER_OPENED', label: 'Trust Matter Opened' },
    { key: 'BUYER_DEPOSIT_RECEIVED', label: 'Buyer Deposit Received' },
    { key: 'FUNDS_HELD', label: 'Funds Held' },
    { key: 'SETTLEMENT_CALCULATED', label: 'Settlement Calculated' },
    { key: 'SETTLEMENT_APPROVED', label: 'Settlement Approved' },
    { key: 'FUNDS_ALLOCATED', label: 'Funds Allocated' },
    { key: 'SELLER_PAID', label: 'Seller Paid' },
    { key: 'TAXES_PAID', label: 'Taxes Paid' },
    { key: 'TRUST_BALANCED', label: 'Trust Balanced' },
    { key: 'TRUST_CLOSED', label: 'Trust Closed' }
];
const readableAuditAction = (rawAction) => {
    const action = String(rawAction || '').toUpperCase();
    const map = {
        CREATED: 'Trust Matter Opened',
        POSTED: 'Trust Transaction Posted',
        BALANCE_UPDATED: 'Trust Balance Updated',
        CALCULATED: 'Settlement Calculated',
        TAX_APPLIED: 'Taxes Applied',
        CLOSED: 'Trust Closed',
        WORKFLOW_STATE_CHANGED: 'Workflow Updated',
        INVARIANT_AUTO_REPAIRED: 'Ledger Invariant Repaired',
        DUPLICATE_IGNORED: 'Duplicate Event Ignored',
        DUPLICATE_KEY_IGNORED: 'Duplicate Event Ignored',
        CUSTODY_UPDATED: 'Custody Updated',
        DOCUMENTS_UPDATED: 'Supporting Documents Updated'
    };
    return map[action] || String(rawAction || 'Trust Event');
};
const readableTransactionType = (rawType) => {
    const type = String(rawType || '').toUpperCase();
    const map = {
        BUYER_PAYMENT: 'Buyer Payment',
        CGT_DEDUCTION: 'CGT Deduction',
        COMMISSION_DEDUCTION: 'Commission Deduction',
        VAT_DEDUCTION: 'VAT Deduction',
        VAT_ON_COMMISSION: 'VAT on Commission',
        TRANSFER_TO_SELLER: 'Transfer to Seller',
        REFUND: 'Refund'
    };
    return map[type] || String(rawType || 'Trust Transaction');
};
const stageFromAccount = (account) => {
    const state = String(account.workflowState || '');
    if (account.status === 'CLOSED' || state === 'TRUST_CLOSED')
        return 'TRUST_CLOSED';
    if (state === 'TRANSFER_COMPLETE')
        return 'SELLER_PAID';
    if (state === 'SETTLED')
        return 'FUNDS_ALLOCATED';
    if (state === 'TAX_PENDING')
        return 'SETTLEMENT_CALCULATED';
    if (state === 'DEPOSIT_RECEIVED')
        return 'BUYER_DEPOSIT_RECEIVED';
    if (state === 'TRUST_OPEN')
        return 'FUNDS_HELD';
    return 'TRUST_MATTER_OPENED';
};
const buildMatterNumber = (account) => {
    const openedYear = new Date(account.createdAt || Date.now()).getFullYear();
    return `TM-${openedYear}-${String(account._id).slice(-8).toUpperCase()}`;
};
class TrustMatterService {
    constructor() {
        this.indexesEnsured = false;
    }
    ensureIndexes() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.indexesEnsured)
                return;
            yield Promise.all([
                TrustMatter_1.TrustMatter.collection.createIndex({ trustAccountId: 1 }, { unique: true }),
                TrustMatter_1.TrustMatter.collection.createIndex({ companyId: 1, matterNumber: 1 }, { unique: true }),
                TrustMatter_1.TrustMatter.collection.createIndex({ companyId: 1, status: 1, workflowStage: 1, createdAt: -1 })
            ]);
            this.indexesEnsured = true;
        });
    }
    defaultDocuments(existing) {
        const byType = new Map((existing || []).map((document) => [document.type, document]));
        return Object.keys(DOCUMENT_LABELS).map((type) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            return ({
                type,
                label: DOCUMENT_LABELS[type],
                status: ((_a = byType.get(type)) === null || _a === void 0 ? void 0 : _a.status) || 'MISSING',
                fileId: (_b = byType.get(type)) === null || _b === void 0 ? void 0 : _b.fileId,
                fileName: (_c = byType.get(type)) === null || _c === void 0 ? void 0 : _c.fileName,
                reference: (_d = byType.get(type)) === null || _d === void 0 ? void 0 : _d.reference,
                notes: (_e = byType.get(type)) === null || _e === void 0 ? void 0 : _e.notes,
                receivedAt: (_f = byType.get(type)) === null || _f === void 0 ? void 0 : _f.receivedAt,
                approvedAt: (_g = byType.get(type)) === null || _g === void 0 ? void 0 : _g.approvedAt,
                updatedBy: (_h = byType.get(type)) === null || _h === void 0 ? void 0 : _h.updatedBy,
                updatedAt: (_j = byType.get(type)) === null || _j === void 0 ? void 0 : _j.updatedAt
            });
        });
    }
    getForTrustAccount(companyId, trustAccountId) {
        return __awaiter(this, void 0, void 0, function* () {
            return TrustMatter_1.TrustMatter.findOne({
                companyId: toObjectId(companyId),
                trustAccountId: toObjectId(trustAccountId)
            });
        });
    }
    ensureForTrustAccount(input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            yield this.ensureIndexes();
            const account = input.account;
            const accountId = String((account === null || account === void 0 ? void 0 : account._id) || '');
            const propertyId = String(((_a = account === null || account === void 0 ? void 0 : account.propertyId) === null || _a === void 0 ? void 0 : _a._id) || (account === null || account === void 0 ? void 0 : account.propertyId) || '');
            if (!accountId || !propertyId)
                throw new Error('Trust account and property are required to ensure a trust matter');
            const status = String((account === null || account === void 0 ? void 0 : account.status) || 'OPEN');
            const purchasePrice = money(Number(((_b = input.property) === null || _b === void 0 ? void 0 : _b.price) || (account === null || account === void 0 ? void 0 : account.purchasePrice) || 0));
            const workflowStage = stageFromAccount(account);
            const jurisdiction = trustJurisdictions_1.DEFAULT_TRUST_JURISDICTION;
            const setFields = {
                purchasePrice,
                status,
                settlementStatus: status === 'CLOSED' ? 'CLOSED' : status === 'SETTLED' ? 'SETTLED' : 'PENDING',
                workflowStage,
                dateClosed: (account === null || account === void 0 ? void 0 : account.closedAt) || undefined
            };
            const buyerId = toOptionalObjectId(account === null || account === void 0 ? void 0 : account.buyerId);
            const sellerId = toOptionalObjectId(account === null || account === void 0 ? void 0 : account.sellerId);
            const responsibleAccountant = toOptionalObjectId(input.responsibleAccountant);
            if (buyerId)
                setFields.buyerId = buyerId;
            if (sellerId)
                setFields.sellerId = sellerId;
            if (account === null || account === void 0 ? void 0 : account.dealId)
                setFields.dealId = account.dealId;
            if (responsibleAccountant)
                setFields.responsibleAccountant = responsibleAccountant;
            const matter = yield TrustMatter_1.TrustMatter.findOneAndUpdate({ companyId: toObjectId(input.companyId), trustAccountId: toObjectId(accountId) }, {
                $set: setFields,
                $setOnInsert: {
                    companyId: toObjectId(input.companyId),
                    trustAccountId: toObjectId(accountId),
                    propertyId: toObjectId(propertyId),
                    matterNumber: buildMatterNumber(account),
                    custodyType: jurisdiction.defaultCustody,
                    custodyDetails: {},
                    dateOpened: (account === null || account === void 0 ? void 0 : account.createdAt) || new Date(),
                    jurisdiction,
                    documents: this.defaultDocuments(),
                    reconciliationMetadata: {}
                }
            }, { upsert: true, new: true });
            if (!matter)
                throw new Error('Failed to ensure trust matter');
            if (!Array.isArray(matter.documents) || matter.documents.length < Object.keys(DOCUMENT_LABELS).length) {
                matter.documents = this.defaultDocuments(matter.documents);
                yield matter.save();
            }
            return matter;
        });
    }
    updateCustody(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            const matter = yield TrustMatter_1.TrustMatter.findOne({
                companyId: toObjectId(input.companyId),
                trustAccountId: toObjectId(input.trustAccountId)
            });
            if (!matter)
                throw new Error('Trust matter not found');
            const before = matter.toObject();
            matter.custodyType = input.custodyType;
            matter.custodyDetails = input.custodyDetails || {};
            yield matter.save();
            yield this.auditMatterChange({
                companyId: input.companyId,
                matter,
                action: 'CUSTODY_UPDATED',
                sourceEvent: 'trust.matter.custody.updated',
                oldValue: before,
                newValue: matter.toObject(),
                performedBy: input.performedBy
            });
            return matter;
        });
    }
    upsertDocuments(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            const matter = yield TrustMatter_1.TrustMatter.findOne({
                companyId: toObjectId(input.companyId),
                trustAccountId: toObjectId(input.trustAccountId)
            });
            if (!matter)
                throw new Error('Trust matter not found');
            const before = matter.toObject();
            const byType = new Map(this.defaultDocuments(matter.documents).map((document) => [document.type, document]));
            for (const document of input.documents) {
                const type = String(document.type || '');
                if (!DOCUMENT_LABELS[type])
                    continue;
                const existing = byType.get(type) || { type, label: DOCUMENT_LABELS[type], status: 'MISSING' };
                byType.set(type, Object.assign(Object.assign({}, existing), { label: String(document.label || existing.label || DOCUMENT_LABELS[type]), status: (document.status || existing.status || 'MISSING'), fileId: document.fileId, fileName: document.fileName, reference: document.reference, notes: document.notes, receivedAt: document.receivedAt, approvedAt: document.approvedAt, updatedBy: input.performedBy ? toObjectId(input.performedBy) : existing.updatedBy, updatedAt: new Date() }));
            }
            matter.documents = Object.keys(DOCUMENT_LABELS).map((type) => byType.get(type));
            yield matter.save();
            yield this.auditMatterChange({
                companyId: input.companyId,
                matter,
                action: 'DOCUMENTS_UPDATED',
                sourceEvent: 'trust.matter.documents.updated',
                oldValue: before,
                newValue: matter.toObject(),
                performedBy: input.performedBy
            });
            return matter;
        });
    }
    buildWorkflowTimeline(input) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        const auditByAction = new Map();
        for (const audit of input.auditLogs || []) {
            const action = String((audit === null || audit === void 0 ? void 0 : audit.action) || '').toUpperCase();
            if (action && !auditByAction.has(action))
                auditByAction.set(action, audit);
        }
        const firstBuyerPayment = (input.ledger || [])
            .filter((row) => String((row === null || row === void 0 ? void 0 : row.type) || '').toUpperCase() === 'BUYER_PAYMENT' && Number((row === null || row === void 0 ? void 0 : row.credit) || 0) > 0)
            .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())[0];
        const sellerTransfer = (input.ledger || []).find((row) => String((row === null || row === void 0 ? void 0 : row.type) || '').toUpperCase() === 'TRANSFER_TO_SELLER');
        const taxDeduction = (input.ledger || []).find((row) => ['CGT_DEDUCTION', 'VAT_DEDUCTION', 'VAT_ON_COMMISSION'].includes(String((row === null || row === void 0 ? void 0 : row.type) || '').toUpperCase()));
        const commissionDeduction = (input.ledger || []).find((row) => String((row === null || row === void 0 ? void 0 : row.type) || '').toUpperCase() === 'COMMISSION_DEDUCTION');
        const settlementAudit = auditByAction.get('CALCULATED');
        const closedAudit = auditByAction.get('CLOSED');
        const stageData = {
            TRUST_MATTER_OPENED: {
                complete: true,
                date: ((_a = input.matter) === null || _a === void 0 ? void 0 : _a.dateOpened) || ((_b = input.account) === null || _b === void 0 ? void 0 : _b.createdAt),
                user: (_c = auditByAction.get('CREATED')) === null || _c === void 0 ? void 0 : _c.performedBy,
                auditReference: ((_d = auditByAction.get('CREATED')) === null || _d === void 0 ? void 0 : _d.sourceEvent) || 'trust.account.created'
            },
            BUYER_DEPOSIT_RECEIVED: {
                complete: !!firstBuyerPayment,
                date: firstBuyerPayment === null || firstBuyerPayment === void 0 ? void 0 : firstBuyerPayment.createdAt,
                user: firstBuyerPayment === null || firstBuyerPayment === void 0 ? void 0 : firstBuyerPayment.createdBy,
                auditReference: (firstBuyerPayment === null || firstBuyerPayment === void 0 ? void 0 : firstBuyerPayment.reference) || (firstBuyerPayment === null || firstBuyerPayment === void 0 ? void 0 : firstBuyerPayment.sourceEvent)
            },
            FUNDS_HELD: {
                complete: Number(((_e = input.account) === null || _e === void 0 ? void 0 : _e.runningBalance) || 0) > 0 || !!firstBuyerPayment,
                date: firstBuyerPayment === null || firstBuyerPayment === void 0 ? void 0 : firstBuyerPayment.createdAt,
                user: firstBuyerPayment === null || firstBuyerPayment === void 0 ? void 0 : firstBuyerPayment.createdBy,
                auditReference: firstBuyerPayment === null || firstBuyerPayment === void 0 ? void 0 : firstBuyerPayment.sourceEvent
            },
            SETTLEMENT_CALCULATED: {
                complete: !!input.settlement,
                date: ((_f = input.settlement) === null || _f === void 0 ? void 0 : _f.settlementDate) || (settlementAudit === null || settlementAudit === void 0 ? void 0 : settlementAudit.timestamp),
                user: settlementAudit === null || settlementAudit === void 0 ? void 0 : settlementAudit.performedBy,
                auditReference: settlementAudit === null || settlementAudit === void 0 ? void 0 : settlementAudit.sourceEvent
            },
            SETTLEMENT_APPROVED: {
                complete: Boolean(((_g = input.settlement) === null || _g === void 0 ? void 0 : _g.locked) || sellerTransfer || ((_h = input.account) === null || _h === void 0 ? void 0 : _h.status) === 'SETTLED' || ((_j = input.account) === null || _j === void 0 ? void 0 : _j.status) === 'CLOSED'),
                date: ((_k = input.settlement) === null || _k === void 0 ? void 0 : _k.updatedAt) || ((_l = input.settlement) === null || _l === void 0 ? void 0 : _l.settlementDate),
                user: settlementAudit === null || settlementAudit === void 0 ? void 0 : settlementAudit.performedBy,
                auditReference: ((_m = input.settlement) === null || _m === void 0 ? void 0 : _m.locked) ? 'settlement.locked' : undefined
            },
            FUNDS_ALLOCATED: {
                complete: !!commissionDeduction || !!taxDeduction || !!input.settlement,
                date: (commissionDeduction === null || commissionDeduction === void 0 ? void 0 : commissionDeduction.createdAt) || (taxDeduction === null || taxDeduction === void 0 ? void 0 : taxDeduction.createdAt) || ((_o = input.settlement) === null || _o === void 0 ? void 0 : _o.settlementDate),
                user: (commissionDeduction === null || commissionDeduction === void 0 ? void 0 : commissionDeduction.createdBy) || (taxDeduction === null || taxDeduction === void 0 ? void 0 : taxDeduction.createdBy),
                auditReference: (commissionDeduction === null || commissionDeduction === void 0 ? void 0 : commissionDeduction.reference) || (taxDeduction === null || taxDeduction === void 0 ? void 0 : taxDeduction.reference)
            },
            SELLER_PAID: {
                complete: !!sellerTransfer,
                date: sellerTransfer === null || sellerTransfer === void 0 ? void 0 : sellerTransfer.createdAt,
                user: sellerTransfer === null || sellerTransfer === void 0 ? void 0 : sellerTransfer.createdBy,
                auditReference: sellerTransfer === null || sellerTransfer === void 0 ? void 0 : sellerTransfer.reference
            },
            TAXES_PAID: {
                complete: !!taxDeduction,
                date: taxDeduction === null || taxDeduction === void 0 ? void 0 : taxDeduction.createdAt,
                user: taxDeduction === null || taxDeduction === void 0 ? void 0 : taxDeduction.createdBy,
                auditReference: taxDeduction === null || taxDeduction === void 0 ? void 0 : taxDeduction.reference
            },
            TRUST_BALANCED: {
                complete: Boolean((_p = input.reconciliation) === null || _p === void 0 ? void 0 : _p.healthy),
                date: new Date(),
                user: undefined,
                auditReference: ((_q = input.reconciliation) === null || _q === void 0 ? void 0 : _q.healthy) ? 'trust.reconciliation.healthy' : undefined
            },
            TRUST_CLOSED: {
                complete: ((_r = input.account) === null || _r === void 0 ? void 0 : _r.status) === 'CLOSED',
                date: ((_s = input.account) === null || _s === void 0 ? void 0 : _s.closedAt) || (closedAudit === null || closedAudit === void 0 ? void 0 : closedAudit.timestamp),
                user: closedAudit === null || closedAudit === void 0 ? void 0 : closedAudit.performedBy,
                auditReference: closedAudit === null || closedAudit === void 0 ? void 0 : closedAudit.sourceEvent
            }
        };
        return WORKFLOW_LABELS.map((stage) => ({
            key: stage.key,
            label: stage.label,
            complete: stageData[stage.key].complete,
            date: stageData[stage.key].date || null,
            user: stageData[stage.key].user || null,
            auditReference: stageData[stage.key].auditReference || null
        }));
    }
    buildFundsAllocation(input) {
        var _a, _b, _c;
        const deductions = new Map((((_a = input.settlement) === null || _a === void 0 ? void 0 : _a.deductions) || []).map((deduction) => [String(deduction.type || '').toUpperCase(), money(Number(deduction.amount || 0))]));
        const sellerFunds = money(Number(((_b = input.settlement) === null || _b === void 0 ? void 0 : _b.netPayout) || 0));
        const agencyCommission = money(Number(deductions.get('COMMISSION') || 0));
        const vatLiability = money(Number(deductions.get('VAT') || 0));
        const vatOnCommission = money(Number(deductions.get('VAT_ON_COMMISSION') || 0));
        const cgtLiability = money(Number(deductions.get('CGT') || 0));
        const totalTrustBalance = money(Number(((_c = input.account) === null || _c === void 0 ? void 0 : _c.runningBalance) || 0));
        const allocated = money(sellerFunds + agencyCommission + vatLiability + vatOnCommission + cgtLiability);
        return {
            fundsCurrentlyHeld: totalTrustBalance,
            sellerFunds,
            agencyCommission,
            vatLiability,
            vatOnCommission,
            cgtLiability,
            otherAdjustments: 0,
            remainingUnallocated: money(totalTrustBalance - allocated),
            totalTrustBalance
        };
    }
    buildPaymentAllocation(input) {
        var _a, _b, _c;
        const funds = this.buildFundsAllocation(input);
        const purchasePrice = money(Number(((_a = input.settlement) === null || _a === void 0 ? void 0 : _a.salePrice) || ((_b = input.settlement) === null || _b === void 0 ? void 0 : _b.grossProceeds) || ((_c = input.account) === null || _c === void 0 ? void 0 : _c.purchasePrice) || 0));
        const allocated = money(funds.sellerFunds + funds.agencyCommission + funds.vatOnCommission + funds.vatLiability + funds.cgtLiability + funds.otherAdjustments);
        return {
            purchasePrice,
            allocated: {
                seller: funds.sellerFunds,
                commission: funds.agencyCommission,
                vatCommission: funds.vatOnCommission,
                vat: funds.vatLiability,
                cgt: funds.cgtLiability,
                other: funds.otherAdjustments
            },
            balanceRemaining: money(Math.max(0, purchasePrice - allocated))
        };
    }
    buildLedgerPresentation(ledger) {
        return (ledger || []).map((row) => ({
            id: String((row === null || row === void 0 ? void 0 : row._id) || ''),
            date: (row === null || row === void 0 ? void 0 : row.createdAt) || null,
            transaction: readableTransactionType(row === null || row === void 0 ? void 0 : row.type),
            receipt: (row === null || row === void 0 ? void 0 : row.paymentId) ? String(row.paymentId) : null,
            reference: (row === null || row === void 0 ? void 0 : row.reference) || null,
            debit: money(Number((row === null || row === void 0 ? void 0 : row.debit) || 0)),
            credit: money(Number((row === null || row === void 0 ? void 0 : row.credit) || 0)),
            runningBalance: money(Number((row === null || row === void 0 ? void 0 : row.runningBalance) || 0)),
            performedBy: (row === null || row === void 0 ? void 0 : row.createdBy) || null,
            approval: null,
            supportingDocument: null
        }));
    }
    buildAuditPresentation(auditLogs) {
        return (auditLogs || []).map((row) => ({
            id: String((row === null || row === void 0 ? void 0 : row._id) || ''),
            title: readableAuditAction(row === null || row === void 0 ? void 0 : row.action),
            action: (row === null || row === void 0 ? void 0 : row.action) || null,
            performedBy: (row === null || row === void 0 ? void 0 : row.performedBy) || null,
            date: (row === null || row === void 0 ? void 0 : row.timestamp) || (row === null || row === void 0 ? void 0 : row.createdAt) || null,
            reference: (row === null || row === void 0 ? void 0 : row.sourceEvent) || (row === null || row === void 0 ? void 0 : row.migrationId) || (row === null || row === void 0 ? void 0 : row.entityId) || null,
            triggeredAutomatically: !(row === null || row === void 0 ? void 0 : row.performedBy),
            entityType: (row === null || row === void 0 ? void 0 : row.entityType) || null,
            entityId: (row === null || row === void 0 ? void 0 : row.entityId) || null,
            technicalDetails: {
                oldValue: (row === null || row === void 0 ? void 0 : row.oldValue) || null,
                newValue: (row === null || row === void 0 ? void 0 : row.newValue) || null,
                sourceEvent: (row === null || row === void 0 ? void 0 : row.sourceEvent) || null
            }
        }));
    }
    buildReconciliationPresentation(input) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        const custodyType = String(((_a = input.matter) === null || _a === void 0 ? void 0 : _a.custodyType) || 'AGENCY_TRUST_BANK');
        const trustBalance = money(Number((_e = (_c = (_b = input.reconciliation) === null || _b === void 0 ? void 0 : _b.trustBankBalance) !== null && _c !== void 0 ? _c : (_d = input.account) === null || _d === void 0 ? void 0 : _d.runningBalance) !== null && _e !== void 0 ? _e : 0));
        const difference = money(Number((_g = (_f = input.reconciliation) === null || _f === void 0 ? void 0 : _f.variance) !== null && _g !== void 0 ? _g : 0));
        return {
            trustBalance,
            cashHeld: custodyType === 'AGENCY_CASH' ? trustBalance : null,
            bankBalance: custodyType === 'AGENCY_TRUST_BANK' ? trustBalance : null,
            lawyerConfirmation: custodyType === 'LAWYER_TRUST_ACCOUNT' ? ((_j = (_h = input.matter) === null || _h === void 0 ? void 0 : _h.custodyDetails) === null || _j === void 0 ? void 0 : _j.confirmationDate) || null : null,
            difference,
            status: ((_k = input.reconciliation) === null || _k === void 0 ? void 0 : _k.healthy) ? 'Reconciled' : 'Review Required',
            reconciled: Boolean((_l = input.reconciliation) === null || _l === void 0 ? void 0 : _l.healthy),
            lastReconciled: ((_o = (_m = input.matter) === null || _m === void 0 ? void 0 : _m.reconciliationMetadata) === null || _o === void 0 ? void 0 : _o.lastReconciledAt) || null,
            by: ((_q = (_p = input.matter) === null || _p === void 0 ? void 0 : _p.reconciliationMetadata) === null || _q === void 0 ? void 0 : _q.lastReconciledBy) || null
        };
    }
    auditMatterChange(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield TrustAuditLog_1.TrustAuditLog.create({
                companyId: toObjectId(input.companyId),
                entityType: 'TRUST_MATTER',
                entityId: String(input.matter._id),
                action: input.action,
                sourceEvent: input.sourceEvent,
                oldValue: input.oldValue || null,
                newValue: input.newValue || null,
                performedBy: input.performedBy ? toObjectId(input.performedBy) : undefined,
                timestamp: new Date()
            });
        });
    }
}
exports.default = new TrustMatterService();
