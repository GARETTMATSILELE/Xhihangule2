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
exports.ensureDevelopmentLedgers = exports.getAcknowledgementDocument = exports.getPaymentRequestDocument = exports.syncPropertyAccounts = exports.reconcilePropertyDuplicates = exports.getPayoutHistory = exports.updatePayoutStatus = exports.createOwnerPayout = exports.addExpense = exports.getPropertyTransactions = exports.getCompanyPropertyAccounts = exports.migrateLegacyLedgerTypes = exports.getPropertyAccount = void 0;
const Property_1 = require("../models/Property");
const Development_1 = require("../models/Development");
const DevelopmentUnit_1 = require("../models/DevelopmentUnit");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const propertyAccountService_1 = __importDefault(require("../services/propertyAccountService"));
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const propertyAccountService_2 = require("../services/propertyAccountService");
/**
 * Get property account with summary
 */
const getPropertyAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId } = req.params;
        const ledger = req.query.ledger === 'sale' ? 'sale' : 'rental';
        console.log('getPropertyAccount controller called with propertyId:', propertyId);
        console.log('User:', req.user);
        if (!propertyId) {
            return res.status(400).json({ message: 'Property ID is required' });
        }
        console.log('Calling propertyAccountService.getPropertyAccount...');
        // Load the most complete account (dedup-aware) and recalc balance; creates one if missing
        const account = yield propertyAccountService_1.default.getPropertyAccount(propertyId, ledger);
        res.json({
            success: true,
            data: account
        });
    }
    catch (error) {
        logger_1.logger.error('Error in getPropertyAccount:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.getPropertyAccount = getPropertyAccount;
/**
 * One-off migration to normalize legacy ledger types to 'sale' where applicable.
 */
const migrateLegacyLedgerTypes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) ? String(req.user.companyId) : undefined;
        const dryRunFlag = String((_e = (_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.dryRun) !== null && _c !== void 0 ? _c : (_d = req.query) === null || _d === void 0 ? void 0 : _d.dryRun) !== null && _e !== void 0 ? _e : '').toLowerCase();
        const dryRun = dryRunFlag === '1' || dryRunFlag === 'true' || dryRunFlag === 'yes';
        const result = yield propertyAccountService_1.default.migrateLegacyLedgerTypesForCompany(companyId, { dryRun });
        return res.json({ success: true, data: result, dryRun });
    }
    catch (error) {
        logger_1.logger.error('Error in migrateLegacyLedgerTypes:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});
exports.migrateLegacyLedgerTypes = migrateLegacyLedgerTypes;
/**
 * Get all property accounts for company
 */
const getCompanyPropertyAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        // Fast, lightweight listing mode for UI lists:
        // Accepts ?summary=1&search=...&page=1&limit=24&ledger=rental|sale
        const summaryFlag = String(req.query.summary || '').toLowerCase();
        const isSummary = summaryFlag === '1' || summaryFlag === 'true' || summaryFlag === 'yes';
        if (isSummary) {
            const rawPage = Number(req.query.page || 1);
            const rawLimit = Number(req.query.limit || 24);
            const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
            const limitBase = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 24;
            const limit = Math.min(Math.max(limitBase, 1), 100); // clamp 1..100
            const search = String(req.query.search || '').trim();
            const ledger = (String(req.query.ledger || '').toLowerCase() === 'sale') ? 'sale' : (String(req.query.ledger || '').toLowerCase() === 'rental' ? 'rental' : undefined);
            // Resolve all property-like IDs (properties, developments, units) for this company
            const [properties, developments] = yield Promise.all([
                Property_1.Property.find({ companyId: req.user.companyId }).select('_id rentalType').lean(),
                Development_1.Development.find({ companyId: req.user.companyId }).select('_id').lean()
            ]);
            const propertyIds = properties.map(p => p._id);
            const developmentIds = developments.map(d => d._id);
            const salePropertyIdSet = new Set(properties
                .filter((p) => String((p === null || p === void 0 ? void 0 : p.rentalType) || '').toLowerCase() === 'sale')
                .map((p) => String(p._id)));
            let unitIds = [];
            if (developmentIds.length > 0) {
                try {
                    const units = yield DevelopmentUnit_1.DevelopmentUnit.find({ developmentId: { $in: developmentIds } }).select('_id').lean();
                    unitIds = units.map(u => u._id);
                }
                catch (_b) {
                    // ignore unit lookup errors in summary path
                }
            }
            const allIds = [...propertyIds, ...developmentIds, ...unitIds];
            const developmentIdSet = new Set(developmentIds.map((d) => String(d)));
            const unitIdSet = new Set(unitIds.map((u) => String(u)));
            const query = Object.assign({}, (allIds.length > 0 ? { propertyId: { $in: allIds } } : { _id: null }) // empty result if no ids
            );
            if (ledger)
                query.ledgerType = ledger;
            if (search) {
                const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                query.$or = [
                    { propertyName: { $regex: regex } },
                    { propertyAddress: { $regex: regex } },
                    { ownerName: { $regex: regex } }
                ];
            }
            // Fetch one extra record to compute hasMore without a separate count()
            const pageSkip = (page - 1) * limit;
            const rows = yield PropertyAccount_1.default.find(query)
                .select('propertyId ledgerType propertyName propertyAddress ownerId ownerName runningBalance totalIncome totalExpenses totalOwnerPayouts lastUpdated createdAt updatedAt')
                .sort({ lastUpdated: -1 })
                .skip(pageSkip)
                .limit(limit + 1)
                .lean();
            const hasMore = rows.length > limit;
            const itemsRaw = hasMore ? rows.slice(0, limit) : rows;
            // Normalize/mend ledger type for legacy records:
            // - If ledgerType is missing or 'rental' but the source entity implies sale, mark as 'sale' for response
            const items = itemsRaw.map((it) => {
                const pid = String((it === null || it === void 0 ? void 0 : it.propertyId) || '');
                let ledger = String((it === null || it === void 0 ? void 0 : it.ledgerType) || '').toLowerCase();
                const looksLikeSale = salePropertyIdSet.has(pid) ||
                    developmentIdSet.has(pid) ||
                    unitIdSet.has(pid);
                if ((!ledger || ledger === 'rental') && looksLikeSale) {
                    ledger = 'sale';
                }
                return Object.assign(Object.assign({}, it), { ledgerType: ledger || (looksLikeSale ? 'sale' : it === null || it === void 0 ? void 0 : it.ledgerType) });
            });
            return res.json({
                success: true,
                data: items,
                meta: {
                    page,
                    limit,
                    hasMore,
                    nextPage: hasMore ? page + 1 : null
                }
            });
        }
        // Full payload mode (backward compatible; includes transactions/payouts and performs maintenance)
        const accounts = yield propertyAccountService_1.default.getCompanyPropertyAccounts(req.user.companyId);
        res.json({
            success: true,
            data: accounts
        });
    }
    catch (error) {
        logger_1.logger.error('Error in getCompanyPropertyAccounts:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.getCompanyPropertyAccounts = getCompanyPropertyAccounts;
/**
 * Get property transactions with filters
 */
const getPropertyTransactions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId } = req.params;
        const { type, startDate, endDate, category, status } = req.query;
        const ledger = req.query.ledger === 'sale' ? 'sale' : 'rental';
        if (!propertyId) {
            return res.status(400).json({ message: 'Property ID is required' });
        }
        const filters = {};
        if (type)
            filters.type = type;
        if (startDate)
            filters.startDate = new Date(startDate);
        if (endDate)
            filters.endDate = new Date(endDate);
        if (category)
            filters.category = category;
        if (status)
            filters.status = status;
        const transactions = yield propertyAccountService_1.default.getTransactionHistory(propertyId, filters, ledger);
        res.json({
            success: true,
            data: transactions
        });
    }
    catch (error) {
        logger_1.logger.error('Error in getPropertyTransactions:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.getPropertyTransactions = getPropertyTransactions;
/**
 * Add expense to property account
 */
const addExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const { propertyId } = req.params;
        const ledger = (String(((_a = req.query) === null || _a === void 0 ? void 0 : _a.ledger) || '').toLowerCase() === 'sale' ? 'sale' : (String(((_b = req.query) === null || _b === void 0 ? void 0 : _b.ledger) || '').toLowerCase() === 'rental' ? 'rental' : undefined));
        const { amount, date, description, category, recipientId, recipientType, notes } = req.body;
        if (!propertyId) {
            return res.status(400).json({ message: 'Property ID is required' });
        }
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Valid amount is required' });
        }
        if (!description) {
            return res.status(400).json({ message: 'Description is required' });
        }
        if (!((_c = req.user) === null || _c === void 0 ? void 0 : _c.userId)) {
            return res.status(401).json({ message: 'User authentication required' });
        }
        const idempotencyKey = req.headers['idempotency-key'] || ((_d = req.body) === null || _d === void 0 ? void 0 : _d.idempotencyKey) || undefined;
        const expenseData = {
            amount: Number(amount),
            date: date ? new Date(date) : new Date(),
            description,
            category,
            recipientId,
            recipientType,
            processedBy: req.user.userId,
            notes,
            idempotencyKey
        };
        const account = yield propertyAccountService_1.default.addExpense(propertyId, expenseData, ledger);
        // Echo back idempotency key for client-side caching (header and body)
        if (idempotencyKey) {
            try {
                res.setHeader('Idempotency-Key', idempotencyKey);
            }
            catch (_e) { }
        }
        res.json({
            success: true,
            message: 'Expense added successfully',
            data: account,
            idempotencyKey: idempotencyKey || undefined
        });
    }
    catch (error) {
        logger_1.logger.error('Error in addExpense:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.addExpense = addExpense;
/**
 * Create owner payout
 */
const createOwnerPayout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const { propertyId } = req.params;
        const ledger = (String(((_a = req.query) === null || _a === void 0 ? void 0 : _a.ledger) || '').toLowerCase() === 'sale' ? 'sale' : (String(((_b = req.query) === null || _b === void 0 ? void 0 : _b.ledger) || '').toLowerCase() === 'rental' ? 'rental' : undefined));
        const { amount, paymentMethod, recipientId, recipientName, recipientBankDetails, notes } = req.body;
        if (!propertyId) {
            return res.status(400).json({ message: 'Property ID is required' });
        }
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Valid amount is required' });
        }
        if (!paymentMethod) {
            return res.status(400).json({ message: 'Payment method is required' });
        }
        if (!((_c = req.user) === null || _c === void 0 ? void 0 : _c.userId)) {
            return res.status(401).json({ message: 'User authentication required' });
        }
        // Get the property account to access owner information
        console.log('Getting property account for propertyId:', propertyId);
        const account = yield propertyAccountService_1.default.getPropertyAccount(propertyId, ledger);
        console.log('Property account retrieved:', {
            accountId: account._id,
            ownerId: account.ownerId,
            ownerName: account.ownerName,
            runningBalance: account.runningBalance
        });
        // Use provided recipientId or fall back to property owner
        let finalRecipientId = recipientId;
        let finalRecipientName = recipientName;
        if (!finalRecipientId || finalRecipientId.trim() === '') {
            console.log('RecipientId is empty, using property owner');
            if (!account.ownerId) {
                console.log('Property has no owner assigned');
                return res.status(400).json({ message: 'Property has no owner assigned' });
            }
            finalRecipientId = account.ownerId.toString();
            finalRecipientName = account.ownerName || 'Property Owner';
            console.log('Using owner as recipient:', { finalRecipientId, finalRecipientName });
        }
        if (!finalRecipientName) {
            return res.status(400).json({ message: 'Recipient name is required' });
        }
        const idempotencyKey = req.headers['idempotency-key'] || ((_d = req.body) === null || _d === void 0 ? void 0 : _d.idempotencyKey) || undefined;
        const payoutData = {
            amount: Number(amount),
            paymentMethod,
            recipientId: finalRecipientId,
            recipientName: finalRecipientName,
            recipientBankDetails,
            processedBy: req.user.userId,
            notes,
            idempotencyKey
        };
        const { account: updatedAccount, payout } = yield propertyAccountService_1.default.createOwnerPayout(propertyId, payoutData, ledger);
        // Echo back generated/used idempotency key
        if (payout === null || payout === void 0 ? void 0 : payout.idempotencyKey) {
            try {
                res.setHeader('Idempotency-Key', String(payout.idempotencyKey));
            }
            catch (_e) { }
        }
        res.json({
            success: true,
            message: 'Owner payout created successfully',
            data: { account: updatedAccount, payout },
            idempotencyKey: payout === null || payout === void 0 ? void 0 : payout.idempotencyKey
        });
    }
    catch (error) {
        logger_1.logger.error('Error in createOwnerPayout:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.createOwnerPayout = createOwnerPayout;
/**
 * Update payout status
 */
const updatePayoutStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { propertyId, payoutId } = req.params;
        const { status } = req.body;
        if (!propertyId) {
            return res.status(400).json({ message: 'Property ID is required' });
        }
        if (!payoutId) {
            return res.status(400).json({ message: 'Payout ID is required' });
        }
        if (!status || !['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: 'Valid status is required' });
        }
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'User authentication required' });
        }
        const account = yield propertyAccountService_1.default.updatePayoutStatus(propertyId, payoutId, status, req.user.userId);
        res.json({
            success: true,
            message: 'Payout status updated successfully',
            data: account
        });
    }
    catch (error) {
        logger_1.logger.error('Error in updatePayoutStatus:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.updatePayoutStatus = updatePayoutStatus;
/**
 * Get payout history
 */
const getPayoutHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId } = req.params;
        if (!propertyId) {
            return res.status(400).json({ message: 'Property ID is required' });
        }
        const payouts = yield propertyAccountService_1.default.getPayoutHistory(propertyId);
        res.json({
            success: true,
            data: payouts
        });
    }
    catch (error) {
        logger_1.logger.error('Error in getPayoutHistory:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.getPayoutHistory = getPayoutHistory;
/**
 * Reconcile and remove duplicate income transactions for a property ledger
 */
const reconcilePropertyDuplicates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId } = req.params;
        const ledger = req.query.ledger === 'sale' ? 'sale' : 'rental';
        if (!propertyId) {
            return res.status(400).json({ message: 'Property ID is required' });
        }
        const result = yield (0, propertyAccountService_2.reconcilePropertyLedgerDuplicates)(propertyId, ledger);
        return res.json({ success: true, message: 'Reconciliation completed', data: result });
    }
    catch (error) {
        logger_1.logger.error('Error in reconcilePropertyDuplicates:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});
exports.reconcilePropertyDuplicates = reconcilePropertyDuplicates;
/**
 * Sync property accounts with payments
 */
const syncPropertyAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield propertyAccountService_1.default.syncPropertyAccountsWithPayments();
        // Also migrate sale income transactions into dedicated sale ledgers (idempotent)
        try {
            const result = yield propertyAccountService_1.default.migrateSalesLedgerForCompany();
            console.log('Sales ledger migration result:', result);
        }
        catch (e) {
            console.warn('Sales ledger migration skipped/failed:', e);
        }
        res.json({
            success: true,
            message: 'Property accounts synced successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error in syncPropertyAccounts:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.syncPropertyAccounts = syncPropertyAccounts;
/**
 * Get payment request document
 */
const getPaymentRequestDocument = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId, payoutId } = req.params;
        if (!propertyId || !payoutId) {
            return res.status(400).json({ message: 'Property ID and Payout ID are required' });
        }
        const account = yield propertyAccountService_1.default.getPropertyAccount(propertyId);
        const payout = account.ownerPayouts.find(p => { var _a; return ((_a = p._id) === null || _a === void 0 ? void 0 : _a.toString()) === payoutId; });
        if (!payout) {
            return res.status(404).json({ message: 'Payout not found' });
        }
        const property = yield Property_1.Property.findById(propertyId);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }
        res.json({
            success: true,
            data: {
                documentType: 'Payment Request',
                property: {
                    name: property.name,
                    address: property.address,
                },
                payout: {
                    amount: payout.amount,
                    recipientName: payout.recipientName,
                    paymentMethod: payout.paymentMethod,
                    referenceNumber: payout.referenceNumber,
                    date: payout.date,
                    notes: payout.notes,
                },
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error in getPaymentRequestDocument:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.getPaymentRequestDocument = getPaymentRequestDocument;
/**
 * Get acknowledgement document
 */
const getAcknowledgementDocument = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId, payoutId } = req.params;
        if (!propertyId || !payoutId) {
            return res.status(400).json({ message: 'Property ID and Payout ID are required' });
        }
        const account = yield propertyAccountService_1.default.getPropertyAccount(propertyId);
        const payout = account.ownerPayouts.find(p => { var _a; return ((_a = p._id) === null || _a === void 0 ? void 0 : _a.toString()) === payoutId; });
        if (!payout) {
            return res.status(404).json({ message: 'Payout not found' });
        }
        const property = yield Property_1.Property.findById(propertyId);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }
        res.json({
            success: true,
            data: {
                documentType: 'Acknowledgement of Receipt',
                property: {
                    name: property.name,
                    address: property.address,
                },
                payout: {
                    amount: payout.amount,
                    recipientName: payout.recipientName,
                    paymentMethod: payout.paymentMethod,
                    referenceNumber: payout.referenceNumber,
                    date: payout.date,
                    notes: payout.notes,
                },
                blanks: {
                    name: '',
                    idNumber: '',
                    signature: '',
                    contactNumber: '',
                    date: '',
                },
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error in getAcknowledgementDocument:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.getAcknowledgementDocument = getAcknowledgementDocument;
/**
 * Ensure development sale ledgers exist and backfill payments into them.
 * Scoped to the current user's company if available.
 */
const ensureDevelopmentLedgers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) ? String(req.user.companyId) : undefined;
        const result = yield propertyAccountService_1.default.ensureDevelopmentLedgersAndBackfillPayments({
            companyId
        });
        return res.json({ success: true, message: 'Development ledgers ensured and payments backfilled', data: result });
    }
    catch (error) {
        logger_1.logger.error('Error in ensureDevelopmentLedgers:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});
exports.ensureDevelopmentLedgers = ensureDevelopmentLedgers;
