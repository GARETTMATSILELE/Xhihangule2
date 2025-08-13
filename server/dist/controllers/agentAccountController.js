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
exports.getAcknowledgementDocument = exports.syncAgentCommissions = exports.syncAgentAccounts = exports.updatePayoutStatus = exports.createAgentPayout = exports.addPenalty = exports.getCompanyAgentAccounts = exports.getAgentAccount = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const agentAccountService_1 = __importDefault(require("../services/agentAccountService"));
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
/**
 * Get agent account with summary
 */
const getAgentAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { agentId } = req.params;
        console.log('getAgentAccount controller called with agentId:', agentId);
        console.log('User:', req.user);
        if (!agentId) {
            return res.status(400).json({ message: 'Agent ID is required' });
        }
        // Validate agent ID format
        if (!mongoose_1.default.Types.ObjectId.isValid(agentId)) {
            return res.status(400).json({ message: 'Invalid agent ID format' });
        }
        console.log('Calling agentAccountService.getAgentAccount...');
        const account = yield agentAccountService_1.default.getAgentAccount(agentId);
        console.log('Account retrieved successfully:', {
            agentId: account.agentId,
            agentName: account.agentName,
            commissionDataCount: ((_a = account.commissionData) === null || _a === void 0 ? void 0 : _a.length) || 0,
            totalCommissions: account.totalCommissions
        });
        res.json({
            success: true,
            data: account,
            message: 'Agent account retrieved successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error in getAgentAccount:', error);
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
exports.getAgentAccount = getAgentAccount;
/**
 * Get all agent accounts for the company
 */
const getCompanyAgentAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
        const accounts = yield agentAccountService_1.default.getCompanyAgentAccounts(companyId);
        res.json({
            success: true,
            data: accounts
        });
    }
    catch (error) {
        logger_1.logger.error('Error in getCompanyAgentAccounts:', error);
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
exports.getCompanyAgentAccounts = getCompanyAgentAccounts;
/**
 * Add penalty to agent account
 */
const addPenalty = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { agentId } = req.params;
        const { amount, date, description, reference, notes, category } = req.body;
        if (!agentId) {
            return res.status(400).json({ message: 'Agent ID is required' });
        }
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Valid amount is required' });
        }
        if (!description) {
            return res.status(400).json({ message: 'Description is required' });
        }
        const updatedAccount = yield agentAccountService_1.default.addPenalty(agentId, {
            amount: Number(amount),
            date: date ? new Date(date) : new Date(),
            description,
            reference,
            notes,
            category
        });
        res.json({
            success: true,
            data: updatedAccount,
            message: 'Penalty added successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error in addPenalty:', error);
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
exports.addPenalty = addPenalty;
/**
 * Create agent payout
 */
const createAgentPayout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { agentId } = req.params;
        const { amount, paymentMethod, recipientId, recipientName, notes } = req.body;
        if (!agentId) {
            return res.status(400).json({ message: 'Agent ID is required' });
        }
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Valid amount is required' });
        }
        if (!paymentMethod) {
            return res.status(400).json({ message: 'Payment method is required' });
        }
        if (!recipientId || !recipientName) {
            return res.status(400).json({ message: 'Recipient information is required' });
        }
        const result = yield agentAccountService_1.default.createAgentPayout(agentId, {
            amount: Number(amount),
            paymentMethod,
            recipientId,
            recipientName,
            notes
        });
        res.json({
            success: true,
            data: result,
            message: 'Agent payout created successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error in createAgentPayout:', error);
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
exports.createAgentPayout = createAgentPayout;
/**
 * Update payout status
 */
const updatePayoutStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { agentId, payoutId } = req.params;
        const { status } = req.body;
        if (!agentId) {
            return res.status(400).json({ message: 'Agent ID is required' });
        }
        if (!payoutId) {
            return res.status(400).json({ message: 'Payout ID is required' });
        }
        if (!status || !['completed', 'failed', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: 'Valid status is required' });
        }
        const updatedAccount = yield agentAccountService_1.default.updatePayoutStatus(agentId, payoutId, status);
        res.json({
            success: true,
            data: updatedAccount,
            message: `Payout status updated to ${status}`
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
 * Sync agent accounts from payments
 */
const syncAgentAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
        yield agentAccountService_1.default.syncFromPayments(companyId);
        res.json({
            success: true,
            message: 'Agent accounts synced successfully from payments'
        });
    }
    catch (error) {
        logger_1.logger.error('Error in syncAgentAccounts:', error);
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
exports.syncAgentAccounts = syncAgentAccounts;
/**
 * Sync commission transactions for a specific agent
 */
const syncAgentCommissions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { agentId } = req.params;
        if (!agentId) {
            return res.status(400).json({ message: 'Agent ID is required' });
        }
        // Validate agent ID format
        if (!mongoose_1.default.Types.ObjectId.isValid(agentId)) {
            return res.status(400).json({ message: 'Invalid agent ID format' });
        }
        yield agentAccountService_1.default.syncCommissionTransactions(agentId);
        res.json({
            success: true,
            message: 'Agent commission transactions synced successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error in syncAgentCommissions:', error);
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
exports.syncAgentCommissions = syncAgentCommissions;
/**
 * Get acknowledgement document
 */
const getAcknowledgementDocument = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { agentId, payoutId } = req.params;
        if (!agentId) {
            return res.status(400).json({ message: 'Agent ID is required' });
        }
        if (!payoutId) {
            return res.status(400).json({ message: 'Payout ID is required' });
        }
        const documentData = yield agentAccountService_1.default.getAcknowledgementDocument(agentId, payoutId);
        res.json({
            success: true,
            data: documentData
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
