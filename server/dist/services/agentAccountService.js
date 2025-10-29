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
exports.AgentAccountService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const AgentAccount_1 = require("../models/AgentAccount");
const Payment_1 = require("../models/Payment");
const User_1 = require("../models/User");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
class AgentAccountService {
    static getInstance() {
        if (!AgentAccountService.instance) {
            AgentAccountService.instance = new AgentAccountService();
        }
        return AgentAccountService.instance;
    }
    /**
     * Get or create agent account
     */
    getOrCreateAgentAccount(agentId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log('getOrCreateAgentAccount called with agentId:', agentId);
                console.log('Converting to ObjectId:', new mongoose_1.default.Types.ObjectId(agentId));
                let account = yield AgentAccount_1.AgentAccount.findOne({ agentId: new mongoose_1.default.Types.ObjectId(agentId) });
                console.log('Database query result:', account ? 'Found account' : 'No account found');
                if (!account) {
                    // Get agent details
                    const agent = yield User_1.User.findById(agentId);
                    if (!agent) {
                        throw new errorHandler_1.AppError('Agent not found', 404);
                    }
                    // Create new account
                    account = new AgentAccount_1.AgentAccount({
                        agentId: new mongoose_1.default.Types.ObjectId(agentId),
                        agentName: `${agent.firstName} ${agent.lastName}`,
                        agentEmail: agent.email,
                        transactions: [],
                        agentPayouts: [],
                        runningBalance: 0,
                        totalCommissions: 0,
                        totalPayouts: 0,
                        totalPenalties: 0,
                        isActive: true
                    });
                    yield account.save();
                    logger_1.logger.info(`Created new agent account for agent: ${agentId}`);
                }
                else {
                    // Recalculate balance for existing account
                    yield this.recalculateBalance(account);
                }
                return account;
            }
            catch (error) {
                logger_1.logger.error('Error in getOrCreateAgentAccount:', error);
                throw error;
            }
        });
    }
    /**
     * Add commission transaction
     */
    addCommission(agentId, commissionData) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = yield this.getOrCreateAgentAccount(agentId);
                const transaction = {
                    type: 'commission',
                    amount: commissionData.amount,
                    date: commissionData.date,
                    description: commissionData.description,
                    reference: commissionData.reference,
                    status: 'completed',
                    notes: commissionData.notes
                };
                account.transactions.push(transaction);
                account.totalCommissions += commissionData.amount;
                account.lastCommissionDate = commissionData.date;
                account.lastUpdated = new Date();
                yield this.recalculateBalance(account);
                yield account.save();
                logger_1.logger.info(`Added commission of ${commissionData.amount} to agent ${agentId}`);
                return account;
            }
            catch (error) {
                logger_1.logger.error('Error adding commission:', error);
                throw error;
            }
        });
    }
    /**
     * Add penalty transaction
     */
    addPenalty(agentId, penaltyData) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = yield this.getOrCreateAgentAccount(agentId);
                const transaction = {
                    type: 'penalty',
                    amount: penaltyData.amount,
                    date: penaltyData.date,
                    description: penaltyData.description,
                    reference: penaltyData.reference,
                    status: 'completed',
                    notes: penaltyData.notes,
                    category: penaltyData.category
                };
                account.transactions.push(transaction);
                account.totalPenalties += penaltyData.amount;
                account.lastPenaltyDate = penaltyData.date;
                account.lastUpdated = new Date();
                yield this.recalculateBalance(account);
                yield account.save();
                logger_1.logger.info(`Added penalty of ${penaltyData.amount} to agent ${agentId}`);
                return account;
            }
            catch (error) {
                logger_1.logger.error('Error adding penalty:', error);
                throw error;
            }
        });
    }
    /**
     * Create agent payout
     */
    createAgentPayout(agentId, payoutData) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = yield this.getOrCreateAgentAccount(agentId);
                if (account.runningBalance < payoutData.amount) {
                    throw new errorHandler_1.AppError('Insufficient balance for payout', 400);
                }
                // Generate reference number
                const referenceNumber = `AGP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                const payout = {
                    amount: payoutData.amount,
                    date: new Date(),
                    paymentMethod: payoutData.paymentMethod,
                    recipientId: payoutData.recipientId,
                    recipientName: payoutData.recipientName,
                    referenceNumber,
                    status: 'pending',
                    notes: payoutData.notes
                };
                // Add payout transaction
                const transaction = {
                    type: 'payout',
                    amount: payoutData.amount,
                    date: new Date(),
                    description: `Payout to ${payoutData.recipientName}`,
                    reference: referenceNumber,
                    status: 'pending',
                    notes: payoutData.notes
                };
                account.agentPayouts.push(payout);
                account.transactions.push(transaction);
                account.totalPayouts += payoutData.amount;
                account.lastPayoutDate = new Date();
                account.lastUpdated = new Date();
                yield this.recalculateBalance(account);
                yield account.save();
                logger_1.logger.info(`Created payout of ${payoutData.amount} for agent ${agentId}`);
                return { account, payout };
            }
            catch (error) {
                logger_1.logger.error('Error creating agent payout:', error);
                throw error;
            }
        });
    }
    /**
     * Update payout status
     */
    updatePayoutStatus(agentId, payoutId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = yield this.getOrCreateAgentAccount(agentId);
                const payout = account.agentPayouts.find(p => { var _a; return ((_a = p._id) === null || _a === void 0 ? void 0 : _a.toString()) === payoutId; });
                if (!payout) {
                    throw new errorHandler_1.AppError('Payout not found', 404);
                }
                payout.status = status;
                if (status === 'completed') {
                    payout.processedAt = new Date();
                }
                // Update corresponding transaction status
                const transaction = account.transactions.find(t => t.reference === payout.referenceNumber);
                if (transaction) {
                    transaction.status = status;
                }
                account.lastUpdated = new Date();
                yield this.recalculateBalance(account);
                yield account.save();
                logger_1.logger.info(`Updated payout status to ${status} for agent ${agentId}`);
                return account;
            }
            catch (error) {
                logger_1.logger.error('Error updating payout status:', error);
                throw error;
            }
        });
    }
    /**
     * Recalculate running balance
     */
    recalculateBalance(account) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let balance = 0;
                // Sort transactions by date
                const sortedTransactions = account.transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                for (const transaction of sortedTransactions) {
                    if (transaction.type === 'commission') {
                        balance += transaction.amount;
                    }
                    else if (transaction.type === 'payout' || transaction.type === 'penalty') {
                        balance -= transaction.amount;
                    }
                    transaction.runningBalance = balance;
                }
                account.runningBalance = balance;
                account.lastUpdated = new Date();
            }
            catch (error) {
                logger_1.logger.error('Error recalculating balance:', error);
                throw error;
            }
        });
    }
    /**
     * Get agent account with summary and commission data from payments
     */
    getAgentAccount(agentId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                // First try to get or create the account
                const account = yield this.getOrCreateAgentAccount(agentId);
                // Sync commission transactions from payments to ensure balance is up to date
                yield this.syncCommissionTransactions(agentId);
                // Refresh the account after syncing
                const updatedAccount = yield this.getOrCreateAgentAccount(agentId);
                // Get commission data from payments for display
                console.log('Fetching commission data for agentId:', agentId);
                // Determine agent role to filter payment types
                const agentUser = yield User_1.User.findById(agentId).select('role');
                const paymentTypeFilter = ((agentUser === null || agentUser === void 0 ? void 0 : agentUser.role) === 'sales') ? 'sale' : 'rental';
                // First check if there are any payments for this agent
                const totalPayments = yield Payment_1.Payment.countDocuments({
                    agentId: new mongoose_1.default.Types.ObjectId(agentId),
                    paymentType: paymentTypeFilter
                });
                console.log('Total payments for agent:', totalPayments);
                const completedPayments = yield Payment_1.Payment.countDocuments({
                    agentId: new mongoose_1.default.Types.ObjectId(agentId),
                    status: 'completed',
                    paymentType: paymentTypeFilter
                });
                console.log('Completed payments for agent:', completedPayments);
                const commissionData = yield Payment_1.Payment.find({
                    agentId: new mongoose_1.default.Types.ObjectId(agentId),
                    status: 'completed',
                    paymentType: paymentTypeFilter
                }).populate('propertyId', 'address propertyName')
                    .populate('tenantId', 'firstName lastName')
                    .select('paymentDate amount commissionDetails propertyId tenantId referenceNumber paymentType manualPropertyAddress manualTenantName')
                    .sort({ paymentDate: -1 })
                    .lean(); // Use lean() for better performance since we don't need Mongoose documents
                console.log('Found commission data:', commissionData.length, 'records');
                if (commissionData.length > 0) {
                    console.log('Sample commission record:', {
                        paymentDate: commissionData[0].paymentDate,
                        amount: commissionData[0].amount,
                        agentShare: (_a = commissionData[0].commissionDetails) === null || _a === void 0 ? void 0 : _a.agentShare,
                        propertyName: (_b = commissionData[0].propertyId) === null || _b === void 0 ? void 0 : _b.propertyName
                    });
                }
                const accountData = updatedAccount.toObject();
                const result = Object.assign(Object.assign({}, accountData), { commissionData });
                console.log('Returning agent account with commission data:', {
                    agentId: result.agentId,
                    agentName: result.agentName,
                    commissionDataCount: ((_c = result.commissionData) === null || _c === void 0 ? void 0 : _c.length) || 0,
                    totalCommissions: result.totalCommissions,
                    runningBalance: result.runningBalance
                });
                return result;
            }
            catch (error) {
                logger_1.logger.error('Error getting agent account:', error);
                if (error instanceof mongoose_1.default.Error.CastError) {
                    throw new errorHandler_1.AppError('Invalid agent ID format', 400);
                }
                throw error;
            }
        });
    }
    /**
     * Get all agent accounts for a company
     */
    getCompanyAgentAccounts(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get all agents for the company
                const agents = yield User_1.User.find({ companyId: new mongoose_1.default.Types.ObjectId(companyId), role: { $in: ['agent', 'sales'] } });
                const agentIds = agents.map(agent => agent._id);
                // Get or create accounts for all agents
                const accounts = yield Promise.all(agentIds.map(agentId => this.getOrCreateAgentAccount(agentId.toString())));
                return accounts;
            }
            catch (error) {
                logger_1.logger.error('Error getting company agent accounts:', error);
                throw error;
            }
        });
    }
    /**
     * Sync commission transactions for a specific agent
     */
    syncCommissionTransactions(agentId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                console.log('Syncing commission transactions for agent:', agentId);
                // Determine agent role to filter payment types
                const agentUser = yield User_1.User.findById(agentId).select('role');
                const paymentTypeFilter = ((agentUser === null || agentUser === void 0 ? void 0 : agentUser.role) === 'sales') ? 'sale' : 'rental';
                // Get all completed payments where this agent is either:
                // - the recorded agentId on the payment, or
                // - the owner or collaborator in a sales split
                const agentObjId = new mongoose_1.default.Types.ObjectId(agentId);
                const payments = yield Payment_1.Payment.find({
                    status: 'completed',
                    paymentType: paymentTypeFilter,
                    $or: [
                        { agentId: agentObjId },
                        { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
                        { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
                    ]
                }).select('paymentDate amount commissionDetails referenceNumber propertyId tenantId paymentType');
                const account = yield this.getOrCreateAgentAccount(agentId);
                let newTransactionsAdded = 0;
                for (const payment of payments) {
                    // Determine the applicable commission amount for this agent
                    const split = (_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.agentSplit;
                    let applicableAmount = 0;
                    let roleLabel = 'agent';
                    if (split && payment.paymentType === 'sale') {
                        const ownerId = (split === null || split === void 0 ? void 0 : split.ownerUserId) ? String(split.ownerUserId) : undefined;
                        const collabId = (split === null || split === void 0 ? void 0 : split.collaboratorUserId) ? String(split.collaboratorUserId) : undefined;
                        if (ownerId === agentId) {
                            applicableAmount = Number((split === null || split === void 0 ? void 0 : split.ownerAgentShare) || 0);
                            roleLabel = 'owner';
                        }
                        else if (collabId === agentId) {
                            applicableAmount = Number((split === null || split === void 0 ? void 0 : split.collaboratorAgentShare) || 0);
                            roleLabel = 'collaborator';
                        }
                        else {
                            applicableAmount = 0;
                        }
                    }
                    else {
                        // Rentals and introductions: a single agent commission applies
                        applicableAmount = Number(((_b = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.agentShare) || 0);
                        roleLabel = 'agent';
                    }
                    if (applicableAmount && applicableAmount > 0) {
                        // Use a role-qualified reference ONLY for sales splits to distinguish entries
                        const baseRef = String(payment.referenceNumber || '');
                        const isSalesSplit = !!split && payment.paymentType === 'sale';
                        const uniqueRef = isSalesSplit ? `${baseRef}-${roleLabel}` : baseRef;
                        // Check if this commission transaction already exists.
                        // Older rental transactions may have missing reference or a description without role tag,
                        // so we perform a broader match for non-sales payments to avoid duplicates.
                        const existingTransaction = account.transactions.find(t => {
                            if (t.type !== 'commission')
                                return false;
                            if (t.reference === uniqueRef)
                                return true;
                            if (!isSalesSplit) {
                                if (t.reference === baseRef)
                                    return true;
                                if (typeof t.description === 'string' && baseRef && t.description.includes(baseRef))
                                    return true;
                            }
                            return false;
                        });
                        if (!existingTransaction) {
                            // Add commission transaction
                            // For rentals/introductions: keep legacy description to prevent duplicates.
                            const description = isSalesSplit
                                ? `Commission (${roleLabel}) from payment ${baseRef}`
                                : `Commission from payment ${baseRef}`;
                            const transaction = {
                                type: 'commission',
                                amount: applicableAmount,
                                date: payment.paymentDate,
                                description,
                                reference: uniqueRef,
                                status: 'completed',
                                notes: `Property: ${payment.propertyId}, Tenant: ${payment.tenantId}`
                            };
                            account.transactions.push(transaction);
                            account.totalCommissions += applicableAmount;
                            account.lastCommissionDate = payment.paymentDate;
                            newTransactionsAdded++;
                            console.log(`Added commission transaction (${isSalesSplit ? roleLabel : 'agent'}): ${applicableAmount} for payment ${baseRef}`);
                        }
                    }
                }
                if (newTransactionsAdded > 0) {
                    // Recalculate balance and save
                    yield this.recalculateBalance(account);
                    yield account.save();
                    console.log(`Synced ${newTransactionsAdded} new commission transactions for agent ${agentId}`);
                }
                else {
                    console.log('No new commission transactions to sync for agent:', agentId);
                }
            }
            catch (error) {
                logger_1.logger.error('Error syncing commission transactions:', error);
                throw error;
            }
        });
    }
    /**
     * Sync agent accounts from payments
     */
    syncFromPayments(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get all agents for the company
                const agents = yield User_1.User.find({ companyId: new mongoose_1.default.Types.ObjectId(companyId), role: 'agent' });
                for (const agent of agents) {
                    yield this.syncCommissionTransactions(agent._id.toString());
                }
                logger_1.logger.info(`Synced agent accounts from payments for company ${companyId}`);
            }
            catch (error) {
                logger_1.logger.error('Error syncing agent accounts from payments:', error);
                throw error;
            }
        });
    }
    /**
     * Get acknowledgement document data
     */
    getAcknowledgementDocument(agentId, payoutId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = yield this.getAgentAccount(agentId);
                const payout = account.agentPayouts.find(p => { var _a; return ((_a = p._id) === null || _a === void 0 ? void 0 : _a.toString()) === payoutId; });
                if (!payout) {
                    throw new errorHandler_1.AppError('Payout not found', 404);
                }
                return {
                    payout,
                    agentName: account.agentName,
                    agentEmail: account.agentEmail
                };
            }
            catch (error) {
                logger_1.logger.error('Error getting acknowledgement document:', error);
                throw error;
            }
        });
    }
    /**
     * Format currency
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }
    /**
     * Get transaction type label
     */
    getTransactionTypeLabel(type) {
        const labels = {
            commission: 'Commission',
            payout: 'Payout',
            penalty: 'Penalty',
            adjustment: 'Adjustment'
        };
        return labels[type] || type;
    }
    /**
     * Get payment method label
     */
    getPaymentMethodLabel(method) {
        const labels = {
            bank_transfer: 'Bank Transfer',
            cash: 'Cash',
            mobile_money: 'Mobile Money',
            check: 'Check'
        };
        return labels[method] || method;
    }
    /**
     * Calculate running balance from transactions
     */
    calculateRunningBalance(transactions) {
        let balance = 0;
        const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const updatedTransactions = sortedTransactions.map(transaction => {
            if (transaction.type === 'commission') {
                balance += transaction.amount;
            }
            else if (transaction.type === 'payout' || transaction.type === 'penalty') {
                balance -= transaction.amount;
            }
            return Object.assign(Object.assign({}, transaction), { runningBalance: balance });
        });
        return { transactions: updatedTransactions, finalBalance: balance };
    }
}
exports.AgentAccountService = AgentAccountService;
exports.default = AgentAccountService.getInstance();
