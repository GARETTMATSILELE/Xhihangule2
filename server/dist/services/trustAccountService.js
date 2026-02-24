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
const TrustAccount_1 = require("../models/TrustAccount");
const TrustTransaction_1 = require("../models/TrustTransaction");
const TaxRecord_1 = require("../models/TaxRecord");
const TrustSettlement_1 = require("../models/TrustSettlement");
const TrustAuditLog_1 = require("../models/TrustAuditLog");
const taxEngine_1 = __importDefault(require("./taxEngine"));
const Property_1 = require("../models/Property");
const Payment_1 = require("../models/Payment");
const money = (n) => Number(Number(n || 0).toFixed(2));
const toObjectId = (id) => new mongoose_1.default.Types.ObjectId(id);
const WORKFLOW_TRANSITIONS = {
    VALUED: ['LISTED'],
    LISTED: ['DEPOSIT_RECEIVED', 'TRUST_OPEN'],
    DEPOSIT_RECEIVED: ['TRUST_OPEN', 'TAX_PENDING'],
    TRUST_OPEN: ['TAX_PENDING', 'SETTLED'],
    TAX_PENDING: ['SETTLED'],
    SETTLED: ['TRANSFER_COMPLETE', 'TRUST_CLOSED'],
    TRANSFER_COMPLETE: ['TRUST_CLOSED'],
    TRUST_CLOSED: []
};
class TrustAccountService {
    constructor() {
        this.indexesEnsured = false;
    }
    ensureIndexes() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.indexesEnsured)
                return;
            yield Promise.all([
                TrustAccount_1.TrustAccount.collection.createIndex({ companyId: 1, propertyId: 1, status: 1 }),
                TrustAccount_1.TrustAccount.collection.createIndex({ companyId: 1, buyerId: 1, status: 1 }),
                TrustAccount_1.TrustAccount.collection.createIndex({ companyId: 1, status: 1, createdAt: -1 }),
                TrustTransaction_1.TrustTransaction.collection.createIndex({ trustAccountId: 1, createdAt: -1 }),
                TrustTransaction_1.TrustTransaction.collection.createIndex({ companyId: 1, type: 1, createdAt: -1 }),
                TrustTransaction_1.TrustTransaction.collection.createIndex({ paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $exists: true, $type: 'objectId' } } }),
                TaxRecord_1.TaxRecord.collection.createIndex({ companyId: 1, trustAccountId: 1, taxType: 1, createdAt: -1 }),
                TrustSettlement_1.TrustSettlement.collection.createIndex({ companyId: 1, trustAccountId: 1 }, { unique: true }),
                TrustAuditLog_1.TrustAuditLog.collection.createIndex({ companyId: 1, entityType: 1, entityId: 1, timestamp: -1 })
            ]);
            this.indexesEnsured = true;
        });
    }
    withOptionalTransaction(work) {
        return __awaiter(this, void 0, void 0, function* () {
            let session = null;
            try {
                session = yield mongoose_1.default.startSession();
                let result;
                yield session.withTransaction(() => __awaiter(this, void 0, void 0, function* () {
                    result = yield work(session || undefined);
                }));
                return result;
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 20 || /Transaction numbers are only allowed/.test(String((error === null || error === void 0 ? void 0 : error.message) || ''))) {
                    return work(undefined);
                }
                throw error;
            }
            finally {
                if (session) {
                    try {
                        session.endSession();
                    }
                    catch (_a) {
                        // noop
                    }
                }
            }
        });
    }
    audit(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield TrustAuditLog_1.TrustAuditLog.create([
                {
                    companyId: toObjectId(input.companyId),
                    entityType: input.entityType,
                    entityId: input.entityId,
                    action: input.action,
                    sourceEvent: input.sourceEvent,
                    oldValue: input.oldValue || null,
                    newValue: input.newValue || null,
                    performedBy: input.performedBy ? toObjectId(input.performedBy) : undefined,
                    timestamp: new Date()
                }
            ], input.session ? { session: input.session } : undefined);
        });
    }
    createTrustAccount(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            return this.withOptionalTransaction((session) => __awaiter(this, void 0, void 0, function* () {
                const existing = yield TrustAccount_1.TrustAccount.findOne({
                    companyId: toObjectId(input.companyId),
                    propertyId: toObjectId(input.propertyId),
                    status: { $in: ['OPEN', 'SETTLED'] }
                }).session(session || null);
                if (existing)
                    return existing;
                const openingBalance = money(input.openingBalance || 0);
                const created = yield TrustAccount_1.TrustAccount.create([
                    {
                        companyId: toObjectId(input.companyId),
                        propertyId: toObjectId(input.propertyId),
                        buyerId: input.buyerId ? toObjectId(input.buyerId) : undefined,
                        sellerId: input.sellerId ? toObjectId(input.sellerId) : undefined,
                        dealId: input.dealId,
                        openingBalance,
                        runningBalance: openingBalance,
                        closingBalance: openingBalance,
                        purchasePrice: 0,
                        amountReceived: openingBalance,
                        amountOutstanding: 0,
                        status: 'OPEN',
                        workflowState: input.initialWorkflowState || 'TRUST_OPEN'
                    }
                ], session ? { session } : undefined);
                const trust = created[0];
                yield this.audit({
                    companyId: input.companyId,
                    entityType: 'TRUST_ACCOUNT',
                    entityId: String(trust._id),
                    action: 'CREATED',
                    sourceEvent: 'trust.account.created',
                    newValue: trust.toObject(),
                    performedBy: input.createdBy,
                    session
                });
                return trust;
            }));
        });
    }
    getByProperty(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            return TrustAccount_1.TrustAccount.findOne({
                companyId: toObjectId(companyId),
                propertyId: toObjectId(propertyId),
                status: { $in: ['OPEN', 'SETTLED', 'CLOSED'] }
            }).sort({ createdAt: -1 });
        });
    }
    getById(companyId, trustAccountId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            return TrustAccount_1.TrustAccount.findOne({
                _id: toObjectId(trustAccountId),
                companyId: toObjectId(companyId)
            });
        });
    }
    listTrustAccounts(companyId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            const page = Math.max(1, Number((params === null || params === void 0 ? void 0 : params.page) || 1));
            const limit = Math.min(200, Math.max(1, Number((params === null || params === void 0 ? void 0 : params.limit) || 20)));
            const skip = (page - 1) * limit;
            const query = { companyId: toObjectId(companyId) };
            if ((params === null || params === void 0 ? void 0 : params.status) && ['OPEN', 'SETTLED', 'CLOSED'].includes(params.status)) {
                query.status = params.status;
            }
            const list = yield TrustAccount_1.TrustAccount.find(query)
                .populate('propertyId', 'name address')
                .populate('buyerId', 'firstName lastName')
                .populate('sellerId', 'firstName lastName')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();
            const total = yield TrustAccount_1.TrustAccount.countDocuments(query);
            const filtered = (params === null || params === void 0 ? void 0 : params.search)
                ? list.filter((row) => {
                    var _a, _b;
                    const needle = String(params.search || '').toLowerCase();
                    const name = String(((_a = row === null || row === void 0 ? void 0 : row.propertyId) === null || _a === void 0 ? void 0 : _a.name) || '').toLowerCase();
                    const addr = String(((_b = row === null || row === void 0 ? void 0 : row.propertyId) === null || _b === void 0 ? void 0 : _b.address) || '').toLowerCase();
                    return name.includes(needle) || addr.includes(needle);
                })
                : list;
            const propertyIds = filtered
                .map((row) => { var _a; return String(((_a = row === null || row === void 0 ? void 0 : row.propertyId) === null || _a === void 0 ? void 0 : _a._id) || (row === null || row === void 0 ? void 0 : row.propertyId) || '').trim(); })
                .filter((id) => id.length > 0);
            const paymentRows = propertyIds.length
                ? yield Payment_1.Payment.find({
                    companyId: toObjectId(companyId),
                    propertyId: { $in: propertyIds.map((id) => toObjectId(id)) },
                    paymentType: 'sale',
                    status: 'completed',
                    isProvisional: { $ne: true },
                    isInSuspense: { $ne: true }
                })
                    .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
                    .select('propertyId buyerName sellerName')
                    .lean()
                : [];
            const namesByProperty = new Map();
            for (const p of paymentRows) {
                const key = String((p === null || p === void 0 ? void 0 : p.propertyId) || '');
                if (!key)
                    continue;
                const existing = namesByProperty.get(key) || { buyer: '', seller: '' };
                const buyer = existing.buyer || String((p === null || p === void 0 ? void 0 : p.buyerName) || '').trim();
                const seller = existing.seller || String((p === null || p === void 0 ? void 0 : p.sellerName) || '').trim();
                namesByProperty.set(key, { buyer, seller });
            }
            const items = filtered.map((row) => {
                var _a;
                const propertyKey = String(((_a = row === null || row === void 0 ? void 0 : row.propertyId) === null || _a === void 0 ? void 0 : _a._id) || (row === null || row === void 0 ? void 0 : row.propertyId) || '');
                const partyNames = namesByProperty.get(propertyKey) || { buyer: '', seller: '' };
                return Object.assign(Object.assign({}, row), { partyNames });
            });
            return { items, total, page, limit };
        });
    }
    postTransaction(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            return this.withOptionalTransaction((session) => __awaiter(this, void 0, void 0, function* () {
                const account = yield TrustAccount_1.TrustAccount.findOne({
                    _id: toObjectId(input.trustAccountId),
                    companyId: toObjectId(input.companyId)
                }).session(session || null);
                if (!account)
                    throw new Error('Trust account not found');
                if (account.status === 'CLOSED')
                    throw new Error('Trust account is closed');
                const settlement = yield TrustSettlement_1.TrustSettlement.findOne({
                    companyId: toObjectId(input.companyId),
                    trustAccountId: account._id
                }).session(session || null);
                if (settlement === null || settlement === void 0 ? void 0 : settlement.locked)
                    throw new Error('Trust settlement is locked');
                if (input.paymentId) {
                    const existing = yield TrustTransaction_1.TrustTransaction.findOne({
                        companyId: toObjectId(input.companyId),
                        paymentId: toObjectId(input.paymentId)
                    }).session(session || null);
                    if (existing) {
                        yield this.audit({
                            companyId: input.companyId,
                            entityType: 'TRUST_TRANSACTION',
                            entityId: String(existing._id),
                            action: 'DUPLICATE_IGNORED',
                            sourceEvent: input.sourceEvent || 'payment.confirmed',
                            oldValue: existing.toObject(),
                            newValue: existing.toObject(),
                            performedBy: input.createdBy,
                            session
                        });
                        return { account, transaction: existing, duplicate: true };
                    }
                }
                const debit = money(input.debit || 0);
                const credit = money(input.credit || 0);
                if (debit <= 0 && credit <= 0)
                    throw new Error('Debit or credit amount is required');
                const existingTxCount = yield TrustTransaction_1.TrustTransaction.countDocuments({
                    companyId: toObjectId(input.companyId),
                    trustAccountId: account._id
                }).session(session || null);
                const nextBalance = money(account.runningBalance + credit - debit);
                if (nextBalance < 0)
                    throw new Error('Insufficient trust balance for this transaction');
                const tx = yield TrustTransaction_1.TrustTransaction.create([
                    {
                        companyId: toObjectId(input.companyId),
                        trustAccountId: account._id,
                        propertyId: toObjectId(input.propertyId),
                        paymentId: input.paymentId ? toObjectId(input.paymentId) : undefined,
                        type: input.type,
                        debit,
                        credit,
                        vatComponent: money(input.vatComponent || 0),
                        runningBalance: nextBalance,
                        reference: input.reference,
                        sourceEvent: input.sourceEvent,
                        createdBy: input.createdBy ? toObjectId(input.createdBy) : undefined
                    }
                ], session ? { session } : undefined).catch((error) => __awaiter(this, void 0, void 0, function* () {
                    if ((error === null || error === void 0 ? void 0 : error.code) === 11000 && input.paymentId) {
                        const existing = yield TrustTransaction_1.TrustTransaction.findOne({
                            companyId: toObjectId(input.companyId),
                            paymentId: toObjectId(input.paymentId)
                        }).session(session || null);
                        if (existing) {
                            yield this.audit({
                                companyId: input.companyId,
                                entityType: 'TRUST_TRANSACTION',
                                entityId: String(existing._id),
                                action: 'DUPLICATE_KEY_IGNORED',
                                sourceEvent: input.sourceEvent || 'payment.confirmed',
                                oldValue: existing.toObject(),
                                newValue: existing.toObject(),
                                performedBy: input.createdBy,
                                session
                            });
                            return [existing];
                        }
                    }
                    throw error;
                }));
                const before = account.toObject();
                // Business rule: once first buyer funding is posted, opening balance becomes funded opening amount.
                if (existingTxCount === 0 &&
                    Number(account.openingBalance || 0) === 0 &&
                    input.type === 'BUYER_PAYMENT' &&
                    credit > 0 &&
                    debit === 0) {
                    account.openingBalance = nextBalance;
                }
                account.runningBalance = nextBalance;
                account.closingBalance = nextBalance;
                account.lastTransactionAt = new Date();
                if (input.type === 'BUYER_PAYMENT') {
                    const property = yield Property_1.Property.findById(account.propertyId).select('price').lean();
                    const purchasePrice = money(Number((property === null || property === void 0 ? void 0 : property.price) || account.purchasePrice || 0));
                    const amountReceived = money((account.amountReceived || 0) + credit - debit);
                    account.purchasePrice = purchasePrice;
                    account.amountReceived = amountReceived;
                    account.amountOutstanding = money(Math.max(0, purchasePrice - amountReceived));
                }
                if (input.type === 'BUYER_PAYMENT' && account.workflowState === 'LISTED') {
                    account.workflowState = 'DEPOSIT_RECEIVED';
                }
                yield account.save(session ? { session } : undefined);
                yield this.audit({
                    companyId: input.companyId,
                    entityType: 'TRUST_TRANSACTION',
                    entityId: String(tx[0]._id),
                    action: 'POSTED',
                    sourceEvent: input.sourceEvent,
                    newValue: tx[0].toObject(),
                    performedBy: input.createdBy,
                    session
                });
                yield this.audit({
                    companyId: input.companyId,
                    entityType: 'TRUST_ACCOUNT',
                    entityId: String(account._id),
                    action: 'BALANCE_UPDATED',
                    sourceEvent: input.sourceEvent,
                    oldValue: before,
                    newValue: account.toObject(),
                    performedBy: input.createdBy,
                    session
                });
                return { account, transaction: tx[0] };
            }));
        });
    }
    recordBuyerPayment(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const trust = input.trustAccountId
                ? yield TrustAccount_1.TrustAccount.findOne({ _id: toObjectId(input.trustAccountId), companyId: toObjectId(input.companyId) })
                : yield this.getByProperty(input.companyId, input.propertyId);
            const account = trust ||
                (yield this.createTrustAccount({
                    companyId: input.companyId,
                    propertyId: input.propertyId,
                    buyerId: input.buyerId,
                    sellerId: input.sellerId,
                    createdBy: input.createdBy
                }));
            return this.postTransaction({
                companyId: input.companyId,
                trustAccountId: String(account._id),
                propertyId: input.propertyId,
                type: 'BUYER_PAYMENT',
                paymentId: input.paymentId,
                credit: input.amount,
                reference: input.reference,
                sourceEvent: input.sourceEvent || 'payment.confirmed',
                createdBy: input.createdBy
            });
        });
    }
    reverseBuyerPayment(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const trust = input.trustAccountId
                ? yield TrustAccount_1.TrustAccount.findOne({ _id: toObjectId(input.trustAccountId), companyId: toObjectId(input.companyId) })
                : yield this.getByProperty(input.companyId, input.propertyId);
            const account = trust ||
                (yield this.createTrustAccount({
                    companyId: input.companyId,
                    propertyId: input.propertyId,
                    buyerId: input.buyerId,
                    sellerId: input.sellerId,
                    createdBy: input.createdBy
                }));
            return this.postTransaction({
                companyId: input.companyId,
                trustAccountId: String(account._id),
                propertyId: input.propertyId,
                type: 'BUYER_PAYMENT',
                paymentId: input.paymentId,
                debit: Math.abs(Number(input.amount || 0)),
                reference: input.reference,
                sourceEvent: input.sourceEvent || 'payment.reversed',
                createdBy: input.createdBy
            });
        });
    }
    calculateSettlement(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            return this.withOptionalTransaction((session) => __awaiter(this, void 0, void 0, function* () {
                const account = yield TrustAccount_1.TrustAccount.findOne({
                    _id: toObjectId(input.trustAccountId),
                    companyId: toObjectId(input.companyId)
                }).session(session || null);
                if (!account)
                    throw new Error('Trust account not found');
                if (account.status === 'CLOSED')
                    throw new Error('Trust account is closed');
                const settlementPayments = yield Payment_1.Payment.find({
                    companyId: toObjectId(input.companyId),
                    propertyId: account.propertyId,
                    paymentType: 'sale',
                    status: 'completed',
                    isProvisional: { $ne: true },
                    isInSuspense: { $ne: true }
                })
                    .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
                    .lean()
                    .session(session || null);
                if (!settlementPayments.length) {
                    throw new Error('No completed sale payments found for this property');
                }
                const derivedSalePrice = money(settlementPayments.reduce((sum, payment) => sum + Number((payment === null || payment === void 0 ? void 0 : payment.amount) || 0), 0));
                const derivedCommission = money(settlementPayments.reduce((sum, payment) => {
                    var _a, _b, _c, _d;
                    return sum +
                        Number((_d = (_c = (_b = (_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.totalCommission) !== null && _b !== void 0 ? _b : payment === null || payment === void 0 ? void 0 : payment.totalCommission) !== null && _c !== void 0 ? _c : payment === null || payment === void 0 ? void 0 : payment.TotalCommission) !== null && _d !== void 0 ? _d : 0);
                }, 0));
                const derivedVatOnCommission = money(settlementPayments.reduce((sum, payment) => {
                    var _a, _b, _c, _d, _e;
                    return sum +
                        Number((_e = (_d = (_c = (_b = (_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) !== null && _b !== void 0 ? _b : payment === null || payment === void 0 ? void 0 : payment.vatOnCommission) !== null && _c !== void 0 ? _c : payment === null || payment === void 0 ? void 0 : payment.VATOnCommission) !== null && _d !== void 0 ? _d : payment === null || payment === void 0 ? void 0 : payment['vat on commission']) !== null && _e !== void 0 ? _e : 0);
                }, 0));
                const derivedVatOnSale = money(settlementPayments.reduce((sum, payment) => {
                    var _a, _b, _c, _d;
                    return sum +
                        Number((_d = (_c = (_b = (_a = payment === null || payment === void 0 ? void 0 : payment.taxDetails) === null || _a === void 0 ? void 0 : _a.vatOnSale) !== null && _b !== void 0 ? _b : payment === null || payment === void 0 ? void 0 : payment.vatOnSale) !== null && _c !== void 0 ? _c : payment === null || payment === void 0 ? void 0 : payment.vatAmount) !== null && _d !== void 0 ? _d : 0);
                }, 0));
                const resolvedCommission = derivedCommission > 0 ? derivedCommission : money(Number(input.commissionAmount || 0));
                const summaryBase = taxEngine_1.default.generateTaxSummary({
                    salePrice: derivedSalePrice,
                    commissionAmount: resolvedCommission,
                    vatOnCommissionAmount: derivedVatOnCommission > 0 ? derivedVatOnCommission : undefined,
                    applyVatOnSale: input.applyVatOnSale,
                    cgtRate: input.cgtRate,
                    vatSaleRate: input.vatSaleRate,
                    vatOnCommissionRate: input.vatOnCommissionRate
                });
                const cgt = input.cgtAmount != null ? money(input.cgtAmount) : money(summaryBase.cgt);
                const vatOnSale = derivedVatOnSale > 0 ? derivedVatOnSale : money(summaryBase.vatOnSale);
                const vatOnCommission = derivedVatOnCommission > 0 ? derivedVatOnCommission : money(summaryBase.vatOnCommission);
                const commission = money(summaryBase.commission);
                const totalDeductions = money(cgt + commission + vatOnCommission + vatOnSale);
                const sellerNetPayout = money(Math.max(0, derivedSalePrice - totalDeductions));
                const deductions = [
                    { type: 'CGT', amount: cgt },
                    { type: 'COMMISSION', amount: commission },
                    { type: 'VAT_ON_COMMISSION', amount: vatOnCommission },
                    { type: 'VAT', amount: vatOnSale }
                ].filter((d) => d.amount > 0);
                const settlement = yield TrustSettlement_1.TrustSettlement.findOneAndUpdate({ companyId: toObjectId(input.companyId), trustAccountId: account._id }, {
                    $set: {
                        salePrice: derivedSalePrice,
                        grossProceeds: derivedSalePrice,
                        deductions,
                        netPayout: sellerNetPayout,
                        settlementDate: new Date()
                    },
                    $setOnInsert: { locked: false }
                }, { upsert: true, new: true, session });
                if (settlement) {
                    yield this.audit({
                        companyId: input.companyId,
                        entityType: 'TRUST_SETTLEMENT',
                        entityId: String(settlement._id),
                        action: 'CALCULATED',
                        sourceEvent: 'trust.settlement.calculated',
                        newValue: settlement.toObject(),
                        performedBy: input.createdBy,
                        session
                    });
                }
                return {
                    settlement,
                    taxSummary: Object.assign(Object.assign({}, summaryBase), { cgt,
                        vatOnSale,
                        vatOnCommission,
                        commission,
                        totalDeductions,
                        sellerNetPayout, breakdown: Object.assign(Object.assign({}, (summaryBase.breakdown || {})), { sourceOfTruth: {
                                salePrice: 'payments.sum(amount)',
                                commission: 'payments.sum(commissionDetails.totalCommission)',
                                vatOnCommission: derivedVatOnCommission > 0 ? 'payments.sum(commissionDetails.vatOnCommission)' : 'tax-engine',
                                vatOnSale: derivedVatOnSale > 0 ? 'payments.sum(vatOnSale)' : 'tax-engine'
                            } }) })
                };
            }));
        });
    }
    applyTaxDeductions(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            return this.withOptionalTransaction((session) => __awaiter(this, void 0, void 0, function* () {
                const account = yield TrustAccount_1.TrustAccount.findOne({
                    _id: toObjectId(input.trustAccountId),
                    companyId: toObjectId(input.companyId)
                }).session(session || null);
                if (!account)
                    throw new Error('Trust account not found');
                const settlement = yield TrustSettlement_1.TrustSettlement.findOne({
                    companyId: toObjectId(input.companyId),
                    trustAccountId: account._id
                }).session(session || null);
                if (!settlement)
                    throw new Error('Settlement must be calculated first');
                if (settlement.locked)
                    throw new Error('Settlement is locked');
                const taxItems = settlement.deductions.filter((d) => ['CGT', 'VAT', 'VAT_ON_COMMISSION', 'COMMISSION'].includes(String(d.type || '').toUpperCase()));
                const settlementRefPrefix = `settlement:${settlement._id}:`;
                const existingSettlementDeductions = yield TrustTransaction_1.TrustTransaction.find({
                    companyId: toObjectId(input.companyId),
                    trustAccountId: account._id,
                    reference: { $regex: `^${settlementRefPrefix}` }
                })
                    .select('type debit reference')
                    .lean()
                    .session(session || null);
                const appliedByType = existingSettlementDeductions.reduce((acc, tx) => {
                    const txType = String((tx === null || tx === void 0 ? void 0 : tx.type) || '').toUpperCase();
                    const deductionType = txType === 'CGT_DEDUCTION'
                        ? 'CGT'
                        : txType === 'VAT_DEDUCTION'
                            ? 'VAT'
                            : txType === 'VAT_ON_COMMISSION'
                                ? 'VAT_ON_COMMISSION'
                                : txType === 'COMMISSION_DEDUCTION'
                                    ? 'COMMISSION'
                                    : '';
                    if (!deductionType)
                        return acc;
                    acc[deductionType] = money((acc[deductionType] || 0) + Number((tx === null || tx === void 0 ? void 0 : tx.debit) || 0));
                    return acc;
                }, {});
                let postedAnyDeduction = false;
                for (const d of taxItems) {
                    const normalizedType = String(d.type || '').toUpperCase();
                    const targetAmount = money(Number(d.amount || 0));
                    const alreadyApplied = money(appliedByType[normalizedType] || 0);
                    const deltaToApply = money(targetAmount - alreadyApplied);
                    if (deltaToApply <= 0)
                        continue;
                    if (normalizedType === 'COMMISSION') {
                        yield this.postTransaction({
                            companyId: input.companyId,
                            trustAccountId: input.trustAccountId,
                            propertyId: String(account.propertyId),
                            type: 'COMMISSION_DEDUCTION',
                            debit: deltaToApply,
                            reference: `settlement:${settlement._id}:commission`,
                            createdBy: input.createdBy
                        });
                        postedAnyDeduction = true;
                        continue;
                    }
                    const taxType = normalizedType;
                    yield TaxRecord_1.TaxRecord.create([
                        {
                            companyId: toObjectId(input.companyId),
                            trustAccountId: account._id,
                            taxType,
                            amount: deltaToApply,
                            calculationBreakdown: {
                                settlementId: String(settlement._id),
                                deductionType: d.type,
                                appliedDelta: deltaToApply
                            },
                            paidToZimra: false,
                            paymentReference: input.zimraPaymentReference
                        }
                    ], session ? { session } : undefined);
                    yield this.postTransaction({
                        companyId: input.companyId,
                        trustAccountId: input.trustAccountId,
                        propertyId: String(account.propertyId),
                        type: taxType === 'CGT' ? 'CGT_DEDUCTION' : taxType === 'VAT' ? 'VAT_DEDUCTION' : 'VAT_ON_COMMISSION',
                        debit: deltaToApply,
                        reference: `settlement:${settlement._id}:${taxType.toLowerCase()}`,
                        createdBy: input.createdBy
                    });
                    postedAnyDeduction = true;
                }
                if (!postedAnyDeduction) {
                    return { success: true, alreadyApplied: true };
                }
                const before = account.toObject();
                account.workflowState = 'TAX_PENDING';
                yield account.save(session ? { session } : undefined);
                yield this.audit({
                    companyId: input.companyId,
                    entityType: 'TRUST_ACCOUNT',
                    entityId: String(account._id),
                    action: 'TAX_APPLIED',
                    sourceEvent: 'trust.tax.applied',
                    oldValue: before,
                    newValue: account.toObject(),
                    performedBy: input.createdBy,
                    session
                });
                return { success: true };
            }));
        });
    }
    transferToSeller(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            return this.withOptionalTransaction((session) => __awaiter(this, void 0, void 0, function* () {
                const account = yield TrustAccount_1.TrustAccount.findOne({
                    _id: toObjectId(input.trustAccountId),
                    companyId: toObjectId(input.companyId)
                }).session(session || null);
                if (!account)
                    throw new Error('Trust account not found');
                const settlement = yield TrustSettlement_1.TrustSettlement.findOne({
                    companyId: toObjectId(input.companyId),
                    trustAccountId: account._id
                }).session(session || null);
                if (!settlement)
                    throw new Error('Settlement must exist before transfer');
                if (settlement.locked)
                    throw new Error('Settlement is locked');
                if (money(input.amount) > money(settlement.netPayout))
                    throw new Error('Transfer amount exceeds settlement net payout');
                yield this.postTransaction({
                    companyId: input.companyId,
                    trustAccountId: String(account._id),
                    propertyId: String(account.propertyId),
                    type: 'TRANSFER_TO_SELLER',
                    debit: input.amount,
                    reference: input.reference || `settlement:${settlement._id}:seller-transfer`,
                    createdBy: input.createdBy
                });
                account.status = 'SETTLED';
                account.workflowState = 'TRANSFER_COMPLETE';
                yield account.save(session ? { session } : undefined);
                return { success: true };
            }));
        });
    }
    closeTrustAccount(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            return this.withOptionalTransaction((session) => __awaiter(this, void 0, void 0, function* () {
                const account = yield TrustAccount_1.TrustAccount.findOne({
                    _id: toObjectId(input.trustAccountId),
                    companyId: toObjectId(input.companyId)
                }).session(session || null);
                if (!account)
                    throw new Error('Trust account not found');
                if (account.runningBalance !== 0)
                    throw new Error('Cannot close trust account with non-zero balance');
                const before = account.toObject();
                account.status = 'CLOSED';
                account.workflowState = 'TRUST_CLOSED';
                account.closedAt = new Date();
                account.lockReason = input.lockReason || 'Closed by accountant';
                yield account.save(session ? { session } : undefined);
                yield TrustSettlement_1.TrustSettlement.updateOne({ companyId: toObjectId(input.companyId), trustAccountId: account._id }, { $set: { locked: true } }, { session });
                yield this.audit({
                    companyId: input.companyId,
                    entityType: 'TRUST_ACCOUNT',
                    entityId: String(account._id),
                    action: 'CLOSED',
                    sourceEvent: 'trust.account.closed',
                    oldValue: before,
                    newValue: account.toObject(),
                    performedBy: input.createdBy,
                    session
                });
                return account;
            }));
        });
    }
    transitionWorkflowState(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            const account = yield TrustAccount_1.TrustAccount.findOne({
                _id: toObjectId(input.trustAccountId),
                companyId: toObjectId(input.companyId)
            });
            if (!account)
                throw new Error('Trust account not found');
            const allowed = WORKFLOW_TRANSITIONS[account.workflowState] || [];
            if (!allowed.includes(input.toState)) {
                throw new Error(`Invalid workflow transition from ${account.workflowState} to ${input.toState}`);
            }
            const before = account.toObject();
            account.workflowState = input.toState;
            yield account.save();
            yield this.audit({
                companyId: input.companyId,
                entityType: 'TRUST_ACCOUNT',
                entityId: String(account._id),
                action: 'WORKFLOW_STATE_CHANGED',
                sourceEvent: 'trust.workflow.transition',
                oldValue: before,
                newValue: account.toObject(),
                performedBy: input.createdBy
            });
            return account;
        });
    }
    getLedger(companyId, trustAccountId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            const page = Math.max(1, Number((params === null || params === void 0 ? void 0 : params.page) || 1));
            const limit = Math.min(200, Math.max(1, Number((params === null || params === void 0 ? void 0 : params.limit) || 50)));
            const skip = (page - 1) * limit;
            const [items, total] = yield Promise.all([
                TrustTransaction_1.TrustTransaction.find({ companyId: toObjectId(companyId), trustAccountId: toObjectId(trustAccountId) })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                TrustTransaction_1.TrustTransaction.countDocuments({ companyId: toObjectId(companyId), trustAccountId: toObjectId(trustAccountId) })
            ]);
            return { items, total, page, limit };
        });
    }
    verifyAndRepairAccountInvariants(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.ensureIndexes();
            const account = yield TrustAccount_1.TrustAccount.findOne({
                _id: toObjectId(input.trustAccountId),
                companyId: toObjectId(input.companyId)
            });
            if (!account)
                throw new Error('Trust account not found');
            const txs = yield TrustTransaction_1.TrustTransaction.find({
                companyId: toObjectId(input.companyId),
                trustAccountId: toObjectId(input.trustAccountId)
            })
                .select('type debit credit runningBalance createdAt')
                .sort({ createdAt: 1, _id: 1 })
                .lean();
            const oldest = txs.length ? txs[0] : null;
            const newest = txs.length ? txs[txs.length - 1] : null;
            const startsWithFundingCredit = !!oldest &&
                String(oldest.type || '') === 'BUYER_PAYMENT' &&
                Number(oldest.credit || 0) > 0 &&
                Number(oldest.debit || 0) === 0;
            const expectedOpening = oldest
                ? (startsWithFundingCredit
                    ? money(Number(oldest.runningBalance || 0))
                    : money(Number(oldest.runningBalance || 0) - Number(oldest.credit || 0) + Number(oldest.debit || 0)))
                : money(Number(account.openingBalance || 0));
            const expectedRunning = newest
                ? money(Number(newest.runningBalance || 0))
                : money(Number(account.openingBalance || 0));
            const expectedClosing = expectedRunning;
            const expectedLastTransactionAt = newest ? new Date(newest.createdAt) : undefined;
            const buyerFundsNet = money(txs
                .filter((row) => String((row === null || row === void 0 ? void 0 : row.type) || '') === 'BUYER_PAYMENT')
                .reduce((sum, row) => sum + Number((row === null || row === void 0 ? void 0 : row.credit) || 0) - Number((row === null || row === void 0 ? void 0 : row.debit) || 0), 0));
            const expectedAmountReceived = money(Math.max(0, buyerFundsNet));
            const expectedAmountOutstanding = money(Math.max(0, Number(account.purchasePrice || 0) - expectedAmountReceived));
            const patch = {};
            if (money(Number(account.openingBalance || 0)) !== expectedOpening)
                patch.openingBalance = expectedOpening;
            if (money(Number(account.runningBalance || 0)) !== expectedRunning)
                patch.runningBalance = expectedRunning;
            if (money(Number(account.closingBalance || 0)) !== expectedClosing)
                patch.closingBalance = expectedClosing;
            if (money(Number(account.amountReceived || 0)) !== expectedAmountReceived)
                patch.amountReceived = expectedAmountReceived;
            if (money(Number(account.amountOutstanding || 0)) !== expectedAmountOutstanding)
                patch.amountOutstanding = expectedAmountOutstanding;
            if (expectedLastTransactionAt)
                patch.lastTransactionAt = expectedLastTransactionAt;
            const repaired = Object.keys(patch).length > 0;
            if (!repaired) {
                return {
                    repaired: false,
                    expected: {
                        openingBalance: expectedOpening,
                        runningBalance: expectedRunning,
                        closingBalance: expectedClosing,
                        amountReceived: expectedAmountReceived,
                        amountOutstanding: expectedAmountOutstanding
                    }
                };
            }
            const before = account.toObject();
            account.set(patch);
            yield account.save();
            yield this.audit({
                companyId: input.companyId,
                entityType: 'TRUST_ACCOUNT',
                entityId: String(account._id),
                action: 'INVARIANT_AUTO_REPAIRED',
                sourceEvent: input.sourceEvent || 'trust.invariant.repair',
                oldValue: before,
                newValue: account.toObject(),
                performedBy: input.performedBy
            });
            return {
                repaired: true,
                expected: {
                    openingBalance: expectedOpening,
                    runningBalance: expectedRunning,
                    closingBalance: expectedClosing,
                    amountReceived: expectedAmountReceived,
                    amountOutstanding: expectedAmountOutstanding
                }
            };
        });
    }
    getTaxSummary(companyId, trustAccountId) {
        return __awaiter(this, void 0, void 0, function* () {
            const trustAccountObjectId = toObjectId(trustAccountId);
            const companyObjectId = toObjectId(companyId);
            const [records, account] = yield Promise.all([
                TaxRecord_1.TaxRecord.find({ companyId: companyObjectId, trustAccountId: trustAccountObjectId }).lean(),
                TrustAccount_1.TrustAccount.findOne({ _id: trustAccountObjectId, companyId: companyObjectId }).select('propertyId').lean()
            ]);
            const cgt = money(records.filter((r) => r.taxType === 'CGT').reduce((s, r) => s + Number(r.amount || 0), 0));
            const vat = money(records.filter((r) => r.taxType === 'VAT').reduce((s, r) => s + Number(r.amount || 0), 0));
            const vatOnCommissionFromTaxRecords = money(records.filter((r) => r.taxType === 'VAT_ON_COMMISSION').reduce((s, r) => s + Number(r.amount || 0), 0));
            let vatOnCommissionFromPayments = null;
            if (account === null || account === void 0 ? void 0 : account.propertyId) {
                const salePayments = yield Payment_1.Payment.find({
                    companyId: companyObjectId,
                    propertyId: account.propertyId,
                    paymentType: 'sale',
                    status: 'completed',
                    isProvisional: { $ne: true },
                    isInSuspense: { $ne: true }
                })
                    .select('commissionDetails.vatOnCommission')
                    .lean();
                vatOnCommissionFromPayments = money(salePayments.reduce((sum, payment) => { var _a; return sum + Number(((_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) || 0); }, 0));
            }
            const vatOnCommission = vatOnCommissionFromPayments !== null ? vatOnCommissionFromPayments : vatOnCommissionFromTaxRecords;
            return {
                cgt,
                vat,
                vatOnCommission,
                total: money(cgt + vat + vatOnCommission),
                paidToZimraCount: records.filter((r) => r.paidToZimra).length,
                records
            };
        });
    }
    getAuditLogs(companyId_1, trustAccountId_1) {
        return __awaiter(this, arguments, void 0, function* (companyId, trustAccountId, limit = 200) {
            return TrustAuditLog_1.TrustAuditLog.find({
                companyId: toObjectId(companyId),
                $or: [{ entityId: trustAccountId }, { entityType: 'TRUST_ACCOUNT', entityId: trustAccountId }]
            })
                .sort({ timestamp: -1 })
                .limit(Math.min(500, Math.max(1, Number(limit || 200))))
                .lean();
        });
    }
    getReconciliation(companyId, trustAccountId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [account, txs, settlement] = yield Promise.all([
                TrustAccount_1.TrustAccount.findOne({ _id: toObjectId(trustAccountId), companyId: toObjectId(companyId) }).lean(),
                TrustTransaction_1.TrustTransaction.find({ trustAccountId: toObjectId(trustAccountId), companyId: toObjectId(companyId) }).lean(),
                TrustSettlement_1.TrustSettlement.findOne({ trustAccountId: toObjectId(trustAccountId), companyId: toObjectId(companyId) }).lean()
            ]);
            if (!account)
                throw new Error('Trust account not found');
            const totalBuyerFundsHeld = money(txs
                .filter((t) => t.type === 'BUYER_PAYMENT')
                .reduce((sum, t) => sum + Number(t.credit || 0) - Number(t.debit || 0), 0));
            const sellerLiability = money((settlement === null || settlement === void 0 ? void 0 : settlement.netPayout) || 0);
            const trustBankBalance = money(account.runningBalance || 0);
            const variance = money(trustBankBalance - totalBuyerFundsHeld);
            return {
                trustBankBalance,
                totalBuyerFundsHeld,
                sellerLiability,
                variance,
                healthy: variance === 0
            };
        });
    }
}
exports.default = new TrustAccountService();
