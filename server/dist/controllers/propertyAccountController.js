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
exports.getAcknowledgementDocument = exports.getPaymentRequestDocument = exports.syncPropertyAccounts = exports.getPayoutHistory = exports.updatePayoutStatus = exports.createOwnerPayout = exports.addExpense = exports.getPropertyTransactions = exports.getCompanyPropertyAccounts = exports.getPropertyAccount = void 0;
const Property_1 = require("../models/Property");
const propertyAccountService_1 = __importDefault(require("../services/propertyAccountService"));
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
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
        // Ensure an account exists (create if missing), respecting the requested ledger
        const account = yield propertyAccountService_1.default.getOrCreatePropertyAccount(propertyId, ledger);
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
 * Get all property accounts for company
 */
const getCompanyPropertyAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
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
    var _a;
    try {
        const { propertyId } = req.params;
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
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'User authentication required' });
        }
        const expenseData = {
            amount: Number(amount),
            date: date ? new Date(date) : new Date(),
            description,
            category,
            recipientId,
            recipientType,
            processedBy: req.user.userId,
            notes
        };
        const account = yield propertyAccountService_1.default.addExpense(propertyId, expenseData);
        res.json({
            success: true,
            message: 'Expense added successfully',
            data: account
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
    var _a;
    try {
        const { propertyId } = req.params;
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
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'User authentication required' });
        }
        // Get the property account to access owner information
        console.log('Getting property account for propertyId:', propertyId);
        const account = yield propertyAccountService_1.default.getPropertyAccount(propertyId);
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
        const payoutData = {
            amount: Number(amount),
            paymentMethod,
            recipientId: finalRecipientId,
            recipientName: finalRecipientName,
            recipientBankDetails,
            processedBy: req.user.userId,
            notes
        };
        const { account: updatedAccount, payout } = yield propertyAccountService_1.default.createOwnerPayout(propertyId, payoutData);
        res.json({
            success: true,
            message: 'Owner payout created successfully',
            data: { account: updatedAccount, payout }
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
