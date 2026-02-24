"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.runTrustReconciliation = exports.generateTrustReport = exports.getTrustAccountByPropertyFull = exports.getTrustAccountFull = exports.getTrustReconciliation = exports.getTrustAuditLogs = exports.getTrustTaxSummary = exports.getTrustLedger = exports.transitionTrustWorkflow = exports.closeTrustAccount = exports.transferToSeller = exports.applyTaxDeductions = exports.calculateSettlement = exports.recordBuyerPayment = exports.createTrustAccount = exports.getTrustAccount = exports.getTrustAccountByProperty = exports.listTrustAccounts = void 0;
const Property_1 = require("../models/Property");
const Payment_1 = require("../models/Payment");
const trustAccountService_1 = __importDefault(require("../services/trustAccountService"));
const TrustSettlement_1 = require("../models/TrustSettlement");
const reportGenerator_1 = require("../services/reportGenerator");
const trustReconciliationJob_1 = require("../jobs/trustReconciliationJob");
const companyIdFromReq = (req) => { var _a; return (((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) ? String(req.user.companyId) : undefined); };
const emitTrustUpdate = (companyId, trustAccountId, event) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { getIo } = yield Promise.resolve().then(() => __importStar(require('../config/socket')));
        const io = getIo();
        if (!io)
            return;
        io.to(`company-${companyId}`).emit('trustAccountUpdated', { trustAccountId, event, timestamp: new Date().toISOString() });
        io.to(`company-${companyId}`).emit('trust.updated', { trustAccountId, event, timestamp: new Date().toISOString() });
    }
    catch (_a) {
        // non-fatal
    }
});
const ensureCompany = (req, res) => {
    const companyId = companyIdFromReq(req);
    if (!companyId) {
        res.status(400).json({ message: 'companyId is required' });
        return null;
    }
    return companyId;
};
const getPaymentPartyNames = (companyId, propertyId) => __awaiter(void 0, void 0, void 0, function* () {
    const payments = yield Payment_1.Payment.find({
        companyId,
        propertyId,
        paymentType: 'sale',
        status: 'completed',
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true }
    })
        .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
        .select('buyerName sellerName')
        .limit(50)
        .lean();
    const buyer = payments.map((p) => String((p === null || p === void 0 ? void 0 : p.buyerName) || '').trim()).find((name) => name.length > 0) || '';
    const seller = payments.map((p) => String((p === null || p === void 0 ? void 0 : p.sellerName) || '').trim()).find((name) => name.length > 0) || '';
    return { buyer, seller };
});
const filterOutReversedLedgerRows = (companyId, ledgerRows) => __awaiter(void 0, void 0, void 0, function* () {
    if (!Array.isArray(ledgerRows) || ledgerRows.length === 0)
        return [];
    const paymentIds = Array.from(new Set(ledgerRows
        .map((row) => String((row === null || row === void 0 ? void 0 : row.paymentId) || '').trim())
        .filter((id) => id.length > 0)));
    if (!paymentIds.length)
        return ledgerRows;
    const linkedPayments = yield Payment_1.Payment.find({
        companyId,
        _id: { $in: paymentIds }
    })
        .select('_id status reversalOfPaymentId')
        .lean();
    const hiddenPaymentIds = new Set(linkedPayments
        .filter((payment) => {
        const status = String((payment === null || payment === void 0 ? void 0 : payment.status) || '').toLowerCase();
        return status === 'reversed' || !!(payment === null || payment === void 0 ? void 0 : payment.reversalOfPaymentId);
    })
        .map((payment) => String((payment === null || payment === void 0 ? void 0 : payment._id) || '')));
    if (!hiddenPaymentIds.size)
        return ledgerRows;
    return ledgerRows.filter((row) => !hiddenPaymentIds.has(String((row === null || row === void 0 ? void 0 : row.paymentId) || '')));
});
const listTrustAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const search = typeof req.query.search === 'string' ? req.query.search : undefined;
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 25);
        const payload = yield trustAccountService_1.default.listTrustAccounts(companyId, { status, search, page, limit });
        return res.json({ data: payload.items, page: payload.page, limit: payload.limit, total: payload.total });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to list trust accounts' });
    }
});
exports.listTrustAccounts = listTrustAccounts;
const getTrustAccountByProperty = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const propertyId = String(req.params.propertyId || '');
        const account = yield trustAccountService_1.default.getByProperty(companyId, propertyId);
        if (!account)
            return res.status(404).json({ message: 'Trust account not found' });
        return res.json({ data: account });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch trust account' });
    }
});
exports.getTrustAccountByProperty = getTrustAccountByProperty;
const getTrustAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const item = yield trustAccountService_1.default.getById(companyId, String(req.params.id || ''));
        if (!item)
            return res.status(404).json({ message: 'Trust account not found' });
        return res.json({ data: item });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch trust account' });
    }
});
exports.getTrustAccount = getTrustAccount;
const createTrustAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const { propertyId, buyerId, sellerId, dealId, openingBalance, initialWorkflowState } = req.body || {};
        if (!propertyId)
            return res.status(400).json({ message: 'propertyId is required' });
        const account = yield trustAccountService_1.default.createTrustAccount({
            companyId,
            propertyId: String(propertyId),
            buyerId: buyerId ? String(buyerId) : undefined,
            sellerId: sellerId ? String(sellerId) : undefined,
            dealId: dealId ? String(dealId) : undefined,
            openingBalance: Number(openingBalance || 0),
            initialWorkflowState,
            createdBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) ? String(req.user.userId) : undefined
        });
        return res.status(201).json({ message: 'Trust account created', data: account });
    }
    catch (error) {
        return res.status(400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to create trust account' });
    }
});
exports.createTrustAccount = createTrustAccount;
const recordBuyerPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const { amount, reference, propertyId, buyerId, sellerId, paymentId } = req.body || {};
        if (!amount)
            return res.status(400).json({ message: 'amount is required' });
        if (!propertyId)
            return res.status(400).json({ message: 'propertyId is required' });
        const result = yield trustAccountService_1.default.recordBuyerPayment({
            companyId,
            trustAccountId,
            propertyId: String(propertyId),
            amount: Number(amount),
            reference: reference ? String(reference) : undefined,
            paymentId: paymentId ? String(paymentId) : undefined,
            sourceEvent: 'trust.manual.buyer.payment',
            createdBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) ? String(req.user.userId) : undefined,
            buyerId: buyerId ? String(buyerId) : undefined,
            sellerId: sellerId ? String(sellerId) : undefined
        });
        yield emitTrustUpdate(companyId, trustAccountId, 'BUYER_PAYMENT_RECORDED');
        return res.status(201).json({ message: 'Buyer payment recorded', data: result });
    }
    catch (error) {
        return res.status(400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to record buyer payment' });
    }
});
exports.recordBuyerPayment = recordBuyerPayment;
const calculateSettlement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const { salePrice, commissionAmount, applyVatOnSale, cgtRate, cgtAmount, vatSaleRate, vatOnCommissionRate } = req.body || {};
        const data = yield trustAccountService_1.default.calculateSettlement({
            companyId,
            trustAccountId,
            salePrice: salePrice != null ? Number(salePrice) : undefined,
            commissionAmount: commissionAmount != null ? Number(commissionAmount) : undefined,
            applyVatOnSale: Boolean(applyVatOnSale),
            cgtRate: cgtRate != null ? Number(cgtRate) : undefined,
            cgtAmount: cgtAmount != null ? Number(cgtAmount) : undefined,
            vatSaleRate: vatSaleRate != null ? Number(vatSaleRate) : undefined,
            vatOnCommissionRate: vatOnCommissionRate != null ? Number(vatOnCommissionRate) : undefined,
            createdBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) ? String(req.user.userId) : undefined
        });
        yield emitTrustUpdate(companyId, trustAccountId, 'SETTLEMENT_CALCULATED');
        return res.json({ message: 'Settlement calculated', data });
    }
    catch (error) {
        return res.status(400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to calculate settlement' });
    }
});
exports.calculateSettlement = calculateSettlement;
const applyTaxDeductions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const data = yield trustAccountService_1.default.applyTaxDeductions({
            companyId,
            trustAccountId,
            createdBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) ? String(req.user.userId) : undefined,
            zimraPaymentReference: typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.zimraPaymentReference) === 'string' ? req.body.zimraPaymentReference : undefined
        });
        yield emitTrustUpdate(companyId, trustAccountId, 'TAX_DEDUCTIONS_APPLIED');
        return res.json({ message: 'Tax deductions applied', data });
    }
    catch (error) {
        return res.status(400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to apply tax deductions' });
    }
});
exports.applyTaxDeductions = applyTaxDeductions;
const transferToSeller = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const { amount, reference } = req.body || {};
        if (!amount)
            return res.status(400).json({ message: 'amount is required' });
        const data = yield trustAccountService_1.default.transferToSeller({
            companyId,
            trustAccountId,
            amount: Number(amount),
            reference: reference ? String(reference) : undefined,
            createdBy: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) ? String(req.user.userId) : undefined
        });
        yield emitTrustUpdate(companyId, trustAccountId, 'TRANSFER_TO_SELLER');
        return res.json({ message: 'Seller transfer completed', data });
    }
    catch (error) {
        return res.status(400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to transfer to seller' });
    }
});
exports.transferToSeller = transferToSeller;
const closeTrustAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const data = yield trustAccountService_1.default.closeTrustAccount({
            companyId,
            trustAccountId,
            lockReason: typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.lockReason) === 'string' ? req.body.lockReason : undefined,
            createdBy: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId) ? String(req.user.userId) : undefined
        });
        yield emitTrustUpdate(companyId, trustAccountId, 'TRUST_ACCOUNT_CLOSED');
        return res.json({ message: 'Trust account closed', data });
    }
    catch (error) {
        return res.status(400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to close trust account' });
    }
});
exports.closeTrustAccount = closeTrustAccount;
const transitionTrustWorkflow = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const toState = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.toState) || '');
        if (!toState)
            return res.status(400).json({ message: 'toState is required' });
        const data = yield trustAccountService_1.default.transitionWorkflowState({
            companyId,
            trustAccountId,
            toState: toState,
            createdBy: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId) ? String(req.user.userId) : undefined
        });
        yield emitTrustUpdate(companyId, trustAccountId, 'WORKFLOW_STATE_CHANGED');
        return res.json({ message: 'Workflow state updated', data });
    }
    catch (error) {
        return res.status(400).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to update workflow' });
    }
});
exports.transitionTrustWorkflow = transitionTrustWorkflow;
const getTrustLedger = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 50);
        const data = yield trustAccountService_1.default.getLedger(companyId, trustAccountId, { page, limit });
        return res.json({ data: data.items, page: data.page, limit: data.limit, total: data.total });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch trust ledger' });
    }
});
exports.getTrustLedger = getTrustLedger;
const getTrustTaxSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const data = yield trustAccountService_1.default.getTaxSummary(companyId, trustAccountId);
        return res.json({ data });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch tax summary' });
    }
});
exports.getTrustTaxSummary = getTrustTaxSummary;
const getTrustAuditLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const limit = Number(req.query.limit || 200);
        const data = yield trustAccountService_1.default.getAuditLogs(companyId, trustAccountId, limit);
        return res.json({ data });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch audit logs' });
    }
});
exports.getTrustAuditLogs = getTrustAuditLogs;
const getTrustReconciliation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const data = yield trustAccountService_1.default.getReconciliation(companyId, trustAccountId);
        return res.json({ data });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch trust reconciliation' });
    }
});
exports.getTrustReconciliation = getTrustReconciliation;
const getTrustAccountFull = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const account = yield trustAccountService_1.default.getById(companyId, trustAccountId);
        if (!account)
            return res.status(404).json({ message: 'Trust account not found' });
        try {
            yield trustAccountService_1.default.verifyAndRepairAccountInvariants({
                companyId,
                trustAccountId,
                sourceEvent: 'trust.account.full.read'
            });
        }
        catch (_a) {
            // non-fatal on read
        }
        const [refreshedAccount, ledger, taxSummary, auditLogs, reconciliation, settlement] = yield Promise.all([
            trustAccountService_1.default.getById(companyId, trustAccountId),
            trustAccountService_1.default.getLedger(companyId, trustAccountId, { page: 1, limit: 100 }),
            trustAccountService_1.default.getTaxSummary(companyId, trustAccountId),
            trustAccountService_1.default.getAuditLogs(companyId, trustAccountId, 100),
            trustAccountService_1.default.getReconciliation(companyId, trustAccountId),
            TrustSettlement_1.TrustSettlement.findOne({ companyId, trustAccountId }).lean()
        ]);
        const filteredLedgerRows = yield filterOutReversedLedgerRows(companyId, ledger.items || []);
        const partyNames = yield getPaymentPartyNames(companyId, String((refreshedAccount === null || refreshedAccount === void 0 ? void 0 : refreshedAccount.propertyId) || account.propertyId || ''));
        return res.json({
            data: {
                trustAccount: refreshedAccount || account,
                ledger: filteredLedgerRows,
                taxSummary,
                auditLogs,
                reconciliation,
                settlement,
                partyNames
            }
        });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch trust account detail' });
    }
});
exports.getTrustAccountFull = getTrustAccountFull;
const getTrustAccountByPropertyFull = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const propertyId = String(req.params.propertyId || '');
        const account = yield trustAccountService_1.default.getByProperty(companyId, propertyId);
        if (!account)
            return res.status(404).json({ message: 'Trust account not found for property' });
        req.params.id = String(account._id);
        return (0, exports.getTrustAccountFull)(req, res);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to fetch property trust account detail' });
    }
});
exports.getTrustAccountByPropertyFull = getTrustAccountByPropertyFull;
const generateTrustReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const companyId = ensureCompany(req, res);
        if (!companyId)
            return;
        const trustAccountId = String(req.params.id || '');
        const reportType = String(req.params.reportType || '').toLowerCase() || 'buyer-statement';
        const account = yield trustAccountService_1.default.listTrustAccounts(companyId, { page: 1, limit: 200 });
        const trust = account.items.find((r) => String(r._id) === trustAccountId);
        if (!trust)
            return res.status(404).json({ message: 'Trust account not found' });
        const [ledger, taxSummary, auditLogs, reconciliation, settlement, property] = yield Promise.all([
            trustAccountService_1.default.getLedger(companyId, trustAccountId, { page: 1, limit: 500 }),
            trustAccountService_1.default.getTaxSummary(companyId, trustAccountId),
            trustAccountService_1.default.getAuditLogs(companyId, trustAccountId, 500),
            trustAccountService_1.default.getReconciliation(companyId, trustAccountId),
            TrustSettlement_1.TrustSettlement.findOne({ companyId, trustAccountId }).lean(),
            Property_1.Property.findById(trust.propertyId).lean()
        ]);
        const filteredLedgerRows = yield filterOutReversedLedgerRows(companyId, ledger.items || []);
        let rows = [];
        let totals = {};
        if (reportType === 'buyer-statement') {
            rows = filteredLedgerRows.map((t) => ({
                date: t.createdAt,
                type: t.type,
                debit: t.debit,
                credit: t.credit,
                runningBalance: t.runningBalance,
                reference: t.reference || ''
            }));
            totals = { trustBalance: reconciliation.trustBankBalance, buyerFundsHeld: reconciliation.totalBuyerFundsHeld };
        }
        else if (reportType === 'seller-settlement') {
            rows = ((settlement === null || settlement === void 0 ? void 0 : settlement.deductions) || []).map((d) => ({ type: d.type, amount: d.amount }));
            totals = { salePrice: Number((settlement === null || settlement === void 0 ? void 0 : settlement.salePrice) || 0), netPayout: Number((settlement === null || settlement === void 0 ? void 0 : settlement.netPayout) || 0) };
        }
        else if (reportType === 'tax-zimra') {
            rows = taxSummary.records.map((r) => ({
                taxType: r.taxType,
                amount: r.amount,
                paidToZimra: r.paidToZimra,
                paymentReference: r.paymentReference || ''
            }));
            totals = {
                cgt: taxSummary.cgt,
                vat: taxSummary.vat,
                vatOnCommission: taxSummary.vatOnCommission,
                total: taxSummary.total
            };
        }
        else if (reportType === 'audit-log') {
            rows = auditLogs.map((l) => ({
                timestamp: l.timestamp,
                entityType: l.entityType,
                action: l.action,
                entityId: l.entityId
            }));
        }
        else {
            rows = [reconciliation];
            totals = {
                trustBankBalance: reconciliation.trustBankBalance,
                buyerFundsHeld: reconciliation.totalBuyerFundsHeld,
                sellerLiability: reconciliation.sellerLiability,
                variance: reconciliation.variance
            };
        }
        const pdf = yield (0, reportGenerator_1.generateTrustReportPdf)({
            reportType,
            companyName: 'Mantis Africa',
            propertyLabel: String((property === null || property === void 0 ? void 0 : property.address) || (property === null || property === void 0 ? void 0 : property.name) || (trust === null || trust === void 0 ? void 0 : trust.propertyId) || ''),
            auditReference: `TRUST-${trustAccountId}-${Date.now()}`,
            rows,
            totals
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="trust-${reportType}-${trustAccountId}.pdf"`);
        return res.status(200).send(pdf);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to generate trust report' });
    }
});
exports.generateTrustReport = generateTrustReport;
const runTrustReconciliation = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, trustReconciliationJob_1.runTrustReconciliationOnce)();
        return res.json({ message: 'Trust reconciliation completed' });
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to run trust reconciliation' });
    }
});
exports.runTrustReconciliation = runTrustReconciliation;
