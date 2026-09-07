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
const money_1 = require("../utils/money");
const accountingPostingPolicy_1 = require("./accountingPostingPolicy");
const commissionProjection_1 = require("./commissionProjection");
const propertyAccountTotals_1 = require("./propertyAccountTotals");
class AgentAccountService {
    static getInstance() {
        if (!AgentAccountService.instance) {
            AgentAccountService.instance = new AgentAccountService();
        }
        return AgentAccountService.instance;
    }
    /**
     * Sync commission transactions for a single payment (SSOT: Payment)
     * Idempotent: uses paymentId + role-qualified reference for dedupe.
     */
    syncCommissionForPayment(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const payment = yield Payment_1.Payment.findById(paymentId)
                    .select('paymentDate amount commissionDetails referenceNumber paymentType agentId companyId propertyId tenantId isProvisional isInSuspense commissionFinalized status reversalOfPaymentId')
                    .lean();
                if (!payment)
                    return;
                if (!(0, accountingPostingPolicy_1.shouldPostAgentCommission)(payment))
                    return;
                const lanes = (0, commissionProjection_1.projectCommissionLanes)(payment);
                for (const lane of lanes) {
                    const referenceBase = String(payment.referenceNumber || '');
                    const description = lane.role === 'agent'
                        ? `Commission from payment ${referenceBase}`
                        : `Commission (${lane.role}) from payment ${referenceBase}`;
                    yield this.addCommission(lane.agentId, {
                        amount: lane.amount,
                        date: new Date(payment.paymentDate || new Date()),
                        description,
                        reference: lane.reference,
                        notes: `Property: ${payment.propertyId || ''}, Tenant: ${payment.tenantId || ''}`,
                        paymentId: String(paymentId)
                    });
                }
            }
            catch (error) {
                logger_1.logger.error('Error syncing commission for payment:', error);
                throw error;
            }
        });
    }
    reverseCommissionForPayment(paymentId, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const payment = yield Payment_1.Payment.findById(paymentId)
                    .select('_id paymentDate referenceNumber')
                    .lean();
                if (!payment)
                    return;
                const accounts = yield AgentAccount_1.AgentAccount.find({ 'transactions.paymentId': String(paymentId) });
                for (const account of accounts) {
                    const commissionRows = (account.transactions || []).filter((t) => t.type === 'commission' && String(t.paymentId || '') === String(paymentId) && String(t.status || '') === 'completed');
                    if (!commissionRows.length)
                        continue;
                    for (const row of commissionRows) {
                        const role = (0, commissionProjection_1.inferCommissionRoleFromReference)(String(row.reference || ''));
                        const reversalRef = (0, commissionProjection_1.commissionReversalReference)(String(paymentId), role);
                        const penalty = {
                            type: 'penalty',
                            amount: Number(row.amount || 0),
                            date: new Date(),
                            description: `Commission reversal for payment ${String(payment.referenceNumber || paymentId)}`,
                            reference: reversalRef,
                            status: 'completed',
                            notes: reason || 'Manual payment reversal',
                            paymentId: String(paymentId)
                        };
                        yield AgentAccount_1.AgentAccount.updateOne({ _id: account._id, 'transactions.reference': { $ne: reversalRef } }, { $push: { transactions: penalty }, $set: { lastUpdated: new Date() } });
                    }
                    const fresh = yield AgentAccount_1.AgentAccount.findById(account._id);
                    if (fresh) {
                        yield this.recalculateBalance(fresh);
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Error reversing commission for payment:', error);
                throw error;
            }
        });
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
                return account;
            }
            catch (error) {
                logger_1.logger.error('Error in getOrCreateAgentAccount:', error);
                throw error;
            }
        });
    }
    /**
     * Backfill any missing ledger commission transactions for an agent from Payments.
     * Safe and idempotent: uses per-payment sync with paymentId/role references.
     */
    backfillMissingForAgent(agentId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const updatedAccount = yield this.getOrCreateAgentAccount(agentId);
            const agentObjId = new mongoose_1.default.Types.ObjectId(agentId);
            const allowedTypes = ['rental', 'sale', 'introduction'];
            const commissionData = yield Payment_1.Payment.find({
                status: 'completed',
                paymentType: { $in: allowedTypes },
                isProvisional: { $ne: true },
                isInSuspense: { $ne: true },
                $and: [
                    { $or: [{ commissionFinalized: true }, { commissionFinalized: { $exists: false } }] },
                    {
                        $or: [
                            { agentId: agentObjId },
                            { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
                            { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
                        ]
                    }
                ]
            }).select('_id paymentType commissionDetails').lean();
            const needsSync = [];
            const txByRef = new Set((updatedAccount.transactions || [])
                .filter(t => t.type === 'commission')
                .map(t => String(t.reference || '')));
            for (const p of commissionData) {
                const pid = String((p === null || p === void 0 ? void 0 : p._id) || '');
                const split = (_a = p === null || p === void 0 ? void 0 : p.commissionDetails) === null || _a === void 0 ? void 0 : _a.agentSplit;
                if (p.paymentType === 'sale' && split) {
                    const ownerId = (split === null || split === void 0 ? void 0 : split.ownerUserId) ? String(split.ownerUserId) : undefined;
                    const collabId = (split === null || split === void 0 ? void 0 : split.collaboratorUserId) ? String(split.collaboratorUserId) : undefined;
                    const ownerAmt = Number((split === null || split === void 0 ? void 0 : split.ownerAgentShare) || 0);
                    const collabAmt = Number((split === null || split === void 0 ? void 0 : split.collaboratorAgentShare) || 0);
                    if (ownerId === agentId && ownerAmt > 0) {
                        const ref = `${pid}-owner`;
                        if (!txByRef.has(ref))
                            needsSync.push(pid);
                    }
                    else if (collabId === agentId && collabAmt > 0) {
                        const ref = `${pid}-collaborator`;
                        if (!txByRef.has(ref))
                            needsSync.push(pid);
                    }
                    else {
                        // Fall through to non-split lane if split not applicable to this agent
                        const ref = pid;
                        if (!txByRef.has(ref))
                            needsSync.push(pid);
                    }
                }
                else {
                    const ref = pid;
                    if (!txByRef.has(ref))
                        needsSync.push(pid);
                }
            }
            if (needsSync.length > 0) {
                const uniq = Array.from(new Set(needsSync));
                for (const pid of uniq) {
                    try {
                        yield this.syncCommissionForPayment(pid);
                    }
                    catch (e) {
                        logger_1.logger.warn(`Backfill failed for payment ${pid}:`, (e === null || e === void 0 ? void 0 : e.message) || e);
                    }
                }
                // Recalculate to ensure balances updated
                const account = yield this.getOrCreateAgentAccount(agentId);
                yield this.recalculateBalance(account);
                yield account.save();
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
                if (commissionData.reference) {
                    const exists = account.transactions.some(t => t.type === 'commission' &&
                        typeof t.reference === 'string' &&
                        t.reference.length > 0 &&
                        t.reference === commissionData.reference);
                    if (exists) {
                        logger_1.logger.warn(`Duplicate commission reference "${commissionData.reference}" for agent ${agentId} ignored.`);
                        return account;
                    }
                }
                const transaction = {
                    type: 'commission',
                    amount: commissionData.amount,
                    date: commissionData.date,
                    description: commissionData.description,
                    reference: commissionData.reference,
                    status: 'completed',
                    notes: commissionData.notes
                };
                if (commissionData.paymentId) {
                    transaction.paymentId = commissionData.paymentId;
                }
                const filter = { agentId: new mongoose_1.default.Types.ObjectId(agentId) };
                if (commissionData.reference) {
                    filter['transactions.reference'] = { $ne: commissionData.reference };
                }
                const pushed = yield AgentAccount_1.AgentAccount.updateOne(filter, {
                    $push: { transactions: transaction },
                    $set: { lastCommissionDate: commissionData.date, lastUpdated: new Date() }
                });
                if (Number(pushed.modifiedCount || 0) === 0) {
                    return yield AgentAccount_1.AgentAccount.findOne({ agentId: new mongoose_1.default.Types.ObjectId(agentId) });
                }
                const fresh = yield AgentAccount_1.AgentAccount.findOne({ agentId: new mongoose_1.default.Types.ObjectId(agentId) });
                if (fresh) {
                    yield this.recalculateBalance(fresh);
                    logger_1.logger.info(`Added commission of ${commissionData.amount} to agent ${agentId}`);
                    return fresh;
                }
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
                const totals = (0, propertyAccountTotals_1.computeAgentAccountTotals)(account);
                account.totalCommissions = totals.totalCommissions;
                account.totalPayouts = totals.totalPayouts;
                account.totalPenalties = totals.totalPenalties;
                account.runningBalance = totals.runningBalance;
                account.lastUpdated = new Date();
                if (account._id) {
                    yield AgentAccount_1.AgentAccount.updateOne({ _id: account._id }, {
                        $set: {
                            totalCommissions: totals.totalCommissions,
                            totalPayouts: totals.totalPayouts,
                            totalPenalties: totals.totalPenalties,
                            runningBalance: totals.runningBalance,
                            lastUpdated: new Date()
                        }
                    });
                }
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
            var _a;
            try {
                const account = yield AgentAccount_1.AgentAccount.findOne({ agentId: new mongoose_1.default.Types.ObjectId(agentId) });
                if (!account) {
                    throw new errorHandler_1.AppError('Agent account not found', 404);
                }
                let updatedAccount = account;
                // Get commission data from payments for display
                console.log('Fetching commission data for agentId:', agentId);
                // Fetch both rentals and sales where this agent is involved either as the payment.agentId
                // or through a sales split (owner/collaborator). This avoids role-based blind spots.
                const agentObjId = new mongoose_1.default.Types.ObjectId(agentId);
                const allowedTypes = ['rental', 'sale', 'introduction'];
                // First check if there are any relevant payments
                const totalPayments = yield Payment_1.Payment.countDocuments({
                    status: 'completed',
                    paymentType: { $in: allowedTypes },
                    isProvisional: { $ne: true },
                    isInSuspense: { $ne: true },
                    $and: [
                        { $or: [{ commissionFinalized: true }, { commissionFinalized: { $exists: false } }] },
                        {
                            $or: [
                                { agentId: agentObjId },
                                { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
                                { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
                            ]
                        }
                    ]
                });
                console.log('Relevant completed payments for agent:', totalPayments);
                const commissionData = yield Payment_1.Payment.find({
                    status: 'completed',
                    paymentType: { $in: allowedTypes },
                    isProvisional: { $ne: true },
                    isInSuspense: { $ne: true },
                    $and: [
                        { $or: [{ commissionFinalized: true }, { commissionFinalized: { $exists: false } }] },
                        {
                            $or: [
                                { agentId: agentObjId },
                                { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
                                { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
                            ]
                        }
                    ]
                })
                    .populate('propertyId', 'address propertyName')
                    .populate('tenantId', 'firstName lastName')
                    .select('paymentDate amount commissionDetails propertyId tenantId referenceNumber paymentType manualPropertyAddress manualTenantName')
                    .sort({ paymentDate: -1 })
                    .lean(); // Use lean() for better performance
                console.log('Found commission data:', commissionData.length, 'records');
                const accountData = updatedAccount.toObject();
                const result = Object.assign(Object.assign({}, accountData), { commissionData });
                console.log('Returning agent account with commission data:', {
                    agentId: result.agentId,
                    agentName: result.agentName,
                    commissionDataCount: ((_a = result.commissionData) === null || _a === void 0 ? void 0 : _a.length) || 0,
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
                const agents = yield User_1.User.find({
                    companyId: new mongoose_1.default.Types.ObjectId(companyId),
                    $or: [
                        { role: { $in: ['agent', 'sales'] } },
                        { roles: { $in: ['agent', 'sales'] } }
                    ]
                });
                const agentIds = agents.map(agent => agent._id);
                const accounts = yield AgentAccount_1.AgentAccount.find({ agentId: { $in: agentIds } });
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
                // Get all completed payments where this agent is either:
                // - the recorded agentId on the payment, or
                // - the owner or collaborator in a sales split
                const agentObjId = new mongoose_1.default.Types.ObjectId(agentId);
                const payments = yield Payment_1.Payment.find({
                    status: 'completed',
                    paymentType: { $in: ['rental', 'sale', 'introduction'] },
                    isProvisional: { $ne: true },
                    isInSuspense: { $ne: true },
                    $and: [
                        { $or: [{ commissionFinalized: true }, { commissionFinalized: { $exists: false } }] },
                        {
                            $or: [
                                { agentId: agentObjId },
                                { 'commissionDetails.agentSplit.ownerUserId': agentObjId },
                                { 'commissionDetails.agentSplit.collaboratorUserId': agentObjId }
                            ]
                        }
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
                            // Only dedupe on exact same paymentId. This allows multiple installments
                            // that share the same textual reference to each create their own entry.
                            const samePayment = String(t.paymentId || '') === String(payment._id || '');
                            if (!samePayment)
                                return false;
                            // For split sales, also ensure we dedupe per role lane
                            if (isSalesSplit) {
                                return String(t.reference || '').endsWith(`-${roleLabel}`);
                            }
                            return true;
                        });
                        if (!existingTransaction) {
                            // Try to match a legacy entry without paymentId using reference/description/amount (backfill paymentId instead of adding)
                            const amountsEqual = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.005;
                            const legacyMatch = account.transactions.find(t => {
                                if (t.type !== 'commission')
                                    return false;
                                if (t.paymentId)
                                    return false;
                                if (!amountsEqual(t.amount, applicableAmount))
                                    return false;
                                const ref = String(t.reference || '');
                                const desc = String(t.description || '');
                                if (isSalesSplit) {
                                    // Must match role-qualified reference for split lanes
                                    return ref === uniqueRef || desc.includes(uniqueRef);
                                }
                                // Non-split (rentals/introductions): allow base reference or description includes baseRef
                                return ref === baseRef || desc.includes(baseRef);
                            });
                            if (legacyMatch) {
                                // Backfill paymentId and normalize reference; do not create a new transaction
                                legacyMatch.paymentId = payment._id;
                                if (isSalesSplit) {
                                    legacyMatch.reference = uniqueRef;
                                    legacyMatch.description = `Commission (${roleLabel}) from payment ${baseRef}`;
                                }
                                else if (!legacyMatch.reference) {
                                    legacyMatch.reference = baseRef;
                                }
                                account.lastCommissionDate = payment.paymentDate;
                                // Continue to next payment without incrementing newTransactionsAdded
                                continue;
                            }
                            // Add commission transaction
                            // For rentals/introductions: keep legacy description to prevent duplicates.
                            const description = isSalesSplit
                                ? `Commission (${roleLabel}) from payment ${baseRef}`
                                : `Commission from payment ${baseRef}`;
                            const transaction = {
                                type: 'commission',
                                amount: applicableAmount,
                                date: payment.paymentDate,
                                paymentId: payment._id,
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
                // Strong de-duplication pass:
                // - For commission entries WITH paymentId: keep one per (paymentId, role), prefer latest date
                // - For commission entries WITHOUT paymentId: keep at most one per (normalizedRef, role, amountCents),
                //   and drop any that collide with an existing paymentId-backed (paymentId, role)
                {
                    const inferRole = (ref) => {
                        const r = (ref || '').toLowerCase();
                        if (r.endsWith('-owner'))
                            return 'owner';
                        if (r.endsWith('-collaborator'))
                            return 'collaborator';
                        return 'agent';
                    };
                    const normalizeRef = (ref) => (ref || '').trim().replace(/\s+/g, ' ').toLowerCase();
                    const nonCommission = [];
                    const commissions = [];
                    for (const t of account.transactions) {
                        if (t.type === 'commission')
                            commissions.push(t);
                        else
                            nonCommission.push(t);
                    }
                    const keepByPidRole = Object.create(null);
                    const legacyBuckets = Object.create(null);
                    // Partition into paymentId-backed and legacy buckets
                    for (const t of commissions) {
                        const ref = String(t.reference || '');
                        const role = inferRole(ref);
                        if (t.paymentId) {
                            const key = `${String(t.paymentId)}:${role}`;
                            const existing = keepByPidRole[key];
                            if (!existing || new Date(t.date).getTime() >= new Date(existing.date).getTime()) {
                                keepByPidRole[key] = t;
                            }
                        }
                        else {
                            const amtCents = Math.round(Number(t.amount || 0) * 100);
                            const bucketKey = `${normalizeRef(ref)}:${role}:${amtCents}`;
                            if (!legacyBuckets[bucketKey])
                                legacyBuckets[bucketKey] = [];
                            legacyBuckets[bucketKey].push(t);
                        }
                    }
                    // Build final list: start with paymentId-backed kept entries
                    const finalCommissions = Object.values(keepByPidRole);
                    // For each legacy bucket, keep only one if there is no payment-backed entry that would cover it
                    for (const bucketKey of Object.keys(legacyBuckets)) {
                        const list = legacyBuckets[bucketKey];
                        if (list.length === 0)
                            continue;
                        // If any item in bucket has a paymentId already (shouldn't be here), skip bucket
                        // Otherwise, retain the earliest by date
                        const chosen = list.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
                        // Determine role from chosen reference and check if a paymentId-backed entry with same role exists
                        const role = inferRole(String(chosen.reference || ''));
                        // We cannot link to a specific paymentId here; if any payment-backed entry exists with same role and similar reference,
                        // assume coverage and drop legacy. Otherwise keep single legacy.
                        const anyPidSameRole = finalCommissions.some(t => inferRole(String(t.reference || '')) === role);
                        if (!anyPidSameRole) {
                            finalCommissions.push(chosen);
                        }
                    }
                    // Reassemble final transactions list
                    account.transactions = [...nonCommission, ...finalCommissions]
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                }
                // Always recalc and save to ensure running balance and timestamps stay current
                yield this.recalculateBalance(account);
                yield account.save();
                console.log(`Commission sync complete for agent ${agentId}; new transactions added: ${newTransactionsAdded}`);
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
                const agents = yield User_1.User.find({
                    companyId: new mongoose_1.default.Types.ObjectId(companyId),
                    $or: [
                        { role: { $in: ['agent', 'sales'] } },
                        { roles: { $in: ['agent', 'sales'] } }
                    ]
                });
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
        return (0, money_1.formatCurrency)(amount, 'USD');
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
