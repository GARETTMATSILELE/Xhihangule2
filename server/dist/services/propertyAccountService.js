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
exports.PropertyAccountService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const Payment_1 = require("../models/Payment");
const Property_1 = require("../models/Property");
const PropertyOwner_1 = require("../models/PropertyOwner");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const Development_1 = require("../models/Development");
class PropertyAccountService {
    static getInstance() {
        if (!PropertyAccountService.instance) {
            PropertyAccountService.instance = new PropertyAccountService();
        }
        return PropertyAccountService.instance;
    }
    /**
     * Get or create property account
     */
    getOrCreatePropertyAccount(propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                console.log('getOrCreatePropertyAccount called with propertyId:', propertyId);
                console.log('Converting to ObjectId:', new mongoose_1.default.Types.ObjectId(propertyId));
                let account = yield PropertyAccount_1.default.findOne({ propertyId: new mongoose_1.default.Types.ObjectId(propertyId) });
                console.log('Database query result:', account ? 'Found account' : 'No account found');
                if (!account) {
                    // Try resolve as a Property; if not found, try as a Development
                    const property = yield Property_1.Property.findById(propertyId);
                    const development = property ? null : yield Development_1.Development.findById(propertyId);
                    if (!property && !development) {
                        throw new errorHandler_1.AppError('Property not found', 404);
                    }
                    // Get owner details
                    let ownerName = 'Unknown Owner';
                    let ownerId = null;
                    if (property) {
                        // Resolve owner via PropertyOwner linkage
                        if (property.ownerId) {
                            const owner = yield PropertyOwner_1.PropertyOwner.findById(property.ownerId);
                            if (owner) {
                                ownerName = `${owner.firstName} ${owner.lastName}`.trim();
                                ownerId = owner._id;
                            }
                        }
                        if (!ownerId) {
                            const owner = yield PropertyOwner_1.PropertyOwner.findOne({
                                properties: { $in: [new mongoose_1.default.Types.ObjectId(propertyId)] }
                            });
                            if (owner) {
                                ownerName = `${owner.firstName} ${owner.lastName}`.trim();
                                ownerId = owner._id;
                            }
                        }
                    }
                    else if (development) {
                        // Resolve owner from Development.owner first/last name
                        const first = ((_a = development.owner) === null || _a === void 0 ? void 0 : _a.firstName) || '';
                        const last = ((_b = development.owner) === null || _b === void 0 ? void 0 : _b.lastName) || '';
                        const companyName = ((_c = development.owner) === null || _c === void 0 ? void 0 : _c.companyName) || '';
                        const combined = `${first} ${last}`.trim();
                        ownerName = combined || companyName || 'Unknown Owner';
                    }
                    // Create new account
                    account = new PropertyAccount_1.default({
                        propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
                        propertyName: property ? property.name : development === null || development === void 0 ? void 0 : development.name,
                        propertyAddress: property ? property.address : development === null || development === void 0 ? void 0 : development.address,
                        ownerId: ownerId,
                        ownerName,
                        transactions: [],
                        ownerPayouts: [],
                        runningBalance: 0,
                        totalIncome: 0,
                        totalExpenses: 0,
                        totalOwnerPayouts: 0,
                        isActive: true
                    });
                    yield account.save();
                    logger_1.logger.info(`Created new property account for property: ${propertyId}`);
                }
                else {
                    // Recalculate balance for existing account
                    yield this.recalculateBalance(account);
                }
                return account;
            }
            catch (error) {
                logger_1.logger.error('Error in getOrCreatePropertyAccount:', error);
                throw error;
            }
        });
    }
    /**
     * Recalculate balance for an existing account
     */
    recalculateBalance(account) {
        return __awaiter(this, void 0, void 0, function* () {
            // Calculate totals from transactions
            const totalIncome = account.transactions
                .filter(t => t.type === 'income' && t.status === 'completed')
                .reduce((sum, t) => sum + t.amount, 0);
            const totalExpenses = account.transactions
                .filter(t => t.type !== 'income' && t.status === 'completed')
                .reduce((sum, t) => sum + t.amount, 0);
            const totalOwnerPayouts = account.ownerPayouts
                .filter(p => p.status === 'completed')
                .reduce((sum, p) => sum + p.amount, 0);
            // Calculate running balance
            const newRunningBalance = totalIncome - totalExpenses - totalOwnerPayouts;
            // Update the account if balance has changed
            if (account.runningBalance !== newRunningBalance) {
                account.runningBalance = newRunningBalance;
                account.totalIncome = totalIncome;
                account.totalExpenses = totalExpenses;
                account.totalOwnerPayouts = totalOwnerPayouts;
                account.lastUpdated = new Date();
                // Use updateOne instead of save() to avoid triggering pre-save middleware
                yield PropertyAccount_1.default.updateOne({ _id: account._id }, {
                    $set: {
                        runningBalance: newRunningBalance,
                        totalIncome: totalIncome,
                        totalExpenses: totalExpenses,
                        totalOwnerPayouts: totalOwnerPayouts,
                        lastUpdated: new Date()
                    }
                });
                console.log(`Recalculated balance for property ${account.propertyId}: ${newRunningBalance}`);
            }
        });
    }
    /**
     * Record income from rental payments
     */
    recordIncomeFromPayment(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const session = yield mongoose_1.default.startSession();
            let useTransaction = false;
            try {
                session.startTransaction();
                useTransaction = true;
            }
            catch (txnErr) {
                console.warn('PropertyAccountService: transactions unsupported; proceeding without transaction:', txnErr);
                useTransaction = false;
            }
            try {
                const payment = useTransaction
                    ? yield Payment_1.Payment.findById(paymentId).session(session)
                    : yield Payment_1.Payment.findById(paymentId);
                if (!payment) {
                    throw new errorHandler_1.AppError('Payment not found', 404);
                }
                if (payment.status !== 'completed') {
                    logger_1.logger.info(`Skipping income recording for payment ${paymentId} - status: ${payment.status}`);
                    return;
                }
                // Guard: exclude deposit-only payments from income
                const deposit = payment.depositAmount || 0;
                if (deposit > 0 && (payment.amount <= deposit)) {
                    logger_1.logger.info(`Skipping income for deposit-only payment ${paymentId} (amount: ${payment.amount}, deposit: ${deposit})`);
                    return;
                }
                // Get or create property account
                const account = yield this.getOrCreatePropertyAccount(payment.propertyId.toString());
                // Check if income already recorded for this payment
                const existingTransaction = account.transactions.find(t => { var _a; return ((_a = t.paymentId) === null || _a === void 0 ? void 0 : _a.toString()) === paymentId && t.type === 'income'; });
                if (existingTransaction) {
                    logger_1.logger.info(`Income already recorded for payment: ${paymentId}`);
                    return;
                }
                // Calculate owner amount (income after commission) and exclude deposits
                const ownerAmount = ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount) || 0;
                const totalPaid = payment.amount || 0;
                const depositPortion = payment.depositAmount || 0;
                const ownerFraction = totalPaid > 0 ? ownerAmount / totalPaid : 0;
                const incomeAmount = Math.max(0, (totalPaid - depositPortion) * ownerFraction);
                if (incomeAmount <= 0) {
                    logger_1.logger.info(`Skipping income for payment ${paymentId} due to deposit exclusion or zero owner income (computed=${incomeAmount}).`);
                    return;
                }
                // Create income transaction (rental vs sale)
                const isSale = payment.paymentType === 'sale';
                const incomeDescription = isSale
                    ? `Sale income - ${payment.referenceNumber}`
                    : `Rental income - ${payment.referenceNumber}`;
                const incomeCategory = isSale ? 'sale_income' : 'rental_income';
                const incomeTransaction = {
                    type: 'income',
                    amount: incomeAmount,
                    date: payment.paymentDate || payment.createdAt,
                    paymentId: new mongoose_1.default.Types.ObjectId(paymentId),
                    description: incomeDescription,
                    category: incomeCategory,
                    status: 'completed',
                    processedBy: payment.processedBy,
                    referenceNumber: payment.referenceNumber,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                account.transactions.push(incomeTransaction);
                if (useTransaction) {
                    yield account.save({ session });
                }
                else {
                    yield account.save();
                }
                logger_1.logger.info(`Recorded income of ${incomeAmount} for property ${payment.propertyId} from payment ${paymentId}`);
                if (useTransaction) {
                    yield session.commitTransaction();
                }
            }
            catch (error) {
                if (useTransaction) {
                    yield session.abortTransaction();
                }
                logger_1.logger.error('Error recording income from payment:', error);
                throw error;
            }
            finally {
                session.endSession();
            }
        });
    }
    /**
     * Add expense to property account
     */
    addExpense(propertyId, expenseData) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (expenseData.amount <= 0) {
                    throw new errorHandler_1.AppError('Expense amount must be greater than 0', 400);
                }
                const account = yield this.getOrCreatePropertyAccount(propertyId);
                // Check if account has sufficient balance
                if (account.runningBalance < expenseData.amount) {
                    throw new errorHandler_1.AppError('Insufficient balance for this expense', 400);
                }
                const expenseTransaction = {
                    type: 'expense',
                    amount: expenseData.amount,
                    date: expenseData.date,
                    description: expenseData.description,
                    category: expenseData.category || 'general',
                    recipientId: expenseData.recipientId,
                    recipientType: expenseData.recipientType,
                    status: 'completed',
                    processedBy: new mongoose_1.default.Types.ObjectId(expenseData.processedBy),
                    notes: expenseData.notes,
                    referenceNumber: `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                // Add transaction to account
                account.transactions.push(expenseTransaction);
                // Save the account (this will trigger pre-save middleware to recalculate balance)
                yield account.save();
                logger_1.logger.info(`Added expense of ${expenseData.amount} to property ${propertyId}`);
                return account;
            }
            catch (error) {
                logger_1.logger.error('Error adding expense:', error);
                throw error;
            }
        });
    }
    /**
     * Create owner payout
     */
    createOwnerPayout(propertyId, payoutData) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (payoutData.amount <= 0) {
                    throw new errorHandler_1.AppError('Payout amount must be greater than 0', 400);
                }
                const account = yield this.getOrCreatePropertyAccount(propertyId);
                // Check if account has sufficient balance
                if (account.runningBalance < payoutData.amount) {
                    throw new errorHandler_1.AppError('Insufficient balance for this payout', 400);
                }
                // Generate unique reference number
                const referenceNumber = `PAYOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const payout = {
                    amount: payoutData.amount,
                    date: new Date(),
                    paymentMethod: payoutData.paymentMethod,
                    referenceNumber,
                    status: 'pending',
                    processedBy: new mongoose_1.default.Types.ObjectId(payoutData.processedBy),
                    recipientId: new mongoose_1.default.Types.ObjectId(payoutData.recipientId),
                    recipientName: payoutData.recipientName,
                    recipientBankDetails: payoutData.recipientBankDetails,
                    notes: payoutData.notes,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                account.ownerPayouts.push(payout);
                // Save the account (this will trigger pre-save middleware to recalculate balance)
                yield account.save();
                logger_1.logger.info(`Created owner payout of ${payoutData.amount} for property ${propertyId}`);
                return { account, payout };
            }
            catch (error) {
                logger_1.logger.error('Error creating owner payout:', error);
                throw error;
            }
        });
    }
    /**
     * Update payout status
     */
    updatePayoutStatus(propertyId, payoutId, status, processedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = yield PropertyAccount_1.default.findOne({ propertyId: new mongoose_1.default.Types.ObjectId(propertyId) });
                if (!account) {
                    throw new errorHandler_1.AppError('Property account not found', 404);
                }
                const payout = account.ownerPayouts.find(p => { var _a; return ((_a = p._id) === null || _a === void 0 ? void 0 : _a.toString()) === payoutId; });
                if (!payout) {
                    throw new errorHandler_1.AppError('Payout not found', 404);
                }
                // If changing from pending to completed, check balance
                if (payout.status === 'pending' && status === 'completed') {
                    if (account.runningBalance < payout.amount) {
                        throw new errorHandler_1.AppError('Insufficient balance to complete payout', 400);
                    }
                }
                payout.status = status;
                payout.updatedAt = new Date();
                // Save the account (this will trigger pre-save middleware to recalculate balance)
                yield account.save();
                logger_1.logger.info(`Updated payout ${payoutId} status to ${status} for property ${propertyId}`);
                return account;
            }
            catch (error) {
                logger_1.logger.error('Error updating payout status:', error);
                throw error;
            }
        });
    }
    /**
     * Get property account with summary
     */
    getPropertyAccount(propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                const account = yield PropertyAccount_1.default.findOne({ propertyId: new mongoose_1.default.Types.ObjectId(propertyId) });
                if (!account) {
                    throw new errorHandler_1.AppError('Property account not found', 404);
                }
                // Update owner information if missing or outdated
                if (!account.ownerName || account.ownerName === 'Unknown Owner') {
                    const property = yield Property_1.Property.findById(propertyId);
                    if (property) {
                        let ownerName = 'Unknown Owner';
                        let ownerId = null;
                        if (property.ownerId) {
                            const owner = yield PropertyOwner_1.PropertyOwner.findById(property.ownerId);
                            if (owner) {
                                ownerName = `${owner.firstName} ${owner.lastName}`.trim();
                                ownerId = owner._id;
                            }
                        }
                        if (!ownerId) {
                            const owner = yield PropertyOwner_1.PropertyOwner.findOne({
                                properties: { $in: [new mongoose_1.default.Types.ObjectId(propertyId)] }
                            });
                            if (owner) {
                                ownerName = `${owner.firstName} ${owner.lastName}`.trim();
                                ownerId = owner._id;
                            }
                        }
                        if (ownerId) {
                            account.ownerId = ownerId;
                            account.ownerName = ownerName;
                            yield account.save();
                        }
                    }
                    else {
                        // Fallback: resolve via Development document
                        const development = yield Development_1.Development.findById(propertyId);
                        if (development) {
                            const first = ((_a = development.owner) === null || _a === void 0 ? void 0 : _a.firstName) || '';
                            const last = ((_b = development.owner) === null || _b === void 0 ? void 0 : _b.lastName) || '';
                            const companyName = ((_c = development.owner) === null || _c === void 0 ? void 0 : _c.companyName) || '';
                            const combined = `${first} ${last}`.trim();
                            const ownerName = combined || companyName || 'Unknown Owner';
                            account.ownerName = ownerName;
                            yield account.save();
                        }
                    }
                }
                // Recalculate balance for the account
                yield this.recalculateBalance(account);
                return account;
            }
            catch (error) {
                logger_1.logger.error('Error getting property account:', error);
                throw error;
            }
        });
    }
    /**
     * Get all property accounts for a company
     */
    getCompanyPropertyAccounts(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get all properties for the company
                const properties = yield Property_1.Property.find({ companyId });
                const propertyIds = properties.map(p => p._id);
                const accounts = yield PropertyAccount_1.default.find({
                    propertyId: { $in: propertyIds }
                }).sort({ lastUpdated: -1 });
                return accounts;
            }
            catch (error) {
                logger_1.logger.error('Error getting company property accounts:', error);
                throw error;
            }
        });
    }
    /**
     * Sync all property accounts with payment data
     */
    syncPropertyAccountsWithPayments() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Starting property account sync with payments...');
                // Get all completed rental payments that haven't been recorded as income
                const payments = yield Payment_1.Payment.find({
                    status: 'completed',
                    paymentType: 'rental'
                });
                let syncedCount = 0;
                for (const payment of payments) {
                    try {
                        yield this.recordIncomeFromPayment(payment._id.toString());
                        syncedCount++;
                    }
                    catch (error) {
                        logger_1.logger.error(`Failed to sync payment ${payment._id}:`, error);
                    }
                }
                logger_1.logger.info(`Property account sync completed. Synced ${syncedCount} payments.`);
            }
            catch (error) {
                logger_1.logger.error('Error syncing property accounts:', error);
                throw error;
            }
        });
    }
    /**
     * Get transaction history with filters
     */
    getTransactionHistory(propertyId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = yield this.getPropertyAccount(propertyId);
                let transactions = account.transactions;
                // Apply filters
                if (filters.type) {
                    transactions = transactions.filter(t => t.type === filters.type);
                }
                if (filters.startDate) {
                    transactions = transactions.filter(t => t.date >= filters.startDate);
                }
                if (filters.endDate) {
                    transactions = transactions.filter(t => t.date <= filters.endDate);
                }
                if (filters.category) {
                    transactions = transactions.filter(t => t.category === filters.category);
                }
                if (filters.status) {
                    transactions = transactions.filter(t => t.status === filters.status);
                }
                // Sort by date descending
                return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
            }
            catch (error) {
                logger_1.logger.error('Error getting transaction history:', error);
                throw error;
            }
        });
    }
    /**
     * Get payout history
     */
    getPayoutHistory(propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = yield this.getPropertyAccount(propertyId);
                return account.ownerPayouts.sort((a, b) => b.date.getTime() - a.date.getTime());
            }
            catch (error) {
                logger_1.logger.error('Error getting payout history:', error);
                throw error;
            }
        });
    }
}
exports.PropertyAccountService = PropertyAccountService;
exports.default = PropertyAccountService.getInstance();
