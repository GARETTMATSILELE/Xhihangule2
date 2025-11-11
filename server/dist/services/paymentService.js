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
exports.updatePaymentStatus = exports.getPaymentDetails = exports.createPayment = exports.getCompanyPayments = void 0;
const Payment_1 = require("../models/Payment");
const Property_1 = require("../models/Property");
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const errorHandler_1 = require("../middleware/errorHandler");
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = require("../config/database");
// CommissionService is imported elsewhere in the codebase; this service does not need a singleton
const logger_1 = require("../utils/logger");
const databaseService_1 = require("./databaseService");
const commissionService_1 = require("./commissionService");
const dbService = databaseService_1.DatabaseService.getInstance();
// Remove unused singleton reference; commission calculations are handled in controllers via CommissionService
// Commission calculations are centralized in CommissionService
// Get all payments for a company
const getCompanyPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        if (!(0, database_1.isDatabaseAvailable)()) {
            throw new errorHandler_1.AppError('Database is not available', 503);
        }
        const payments = yield Payment_1.Payment.find({ companyId: req.user.companyId })
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName')
            .populate('agentId', 'firstName lastName')
            .populate('processedBy', 'firstName lastName')
            .sort({ paymentDate: -1 });
        res.json(payments);
    }
    catch (error) {
        console.error('Error fetching company payments:', error);
        res.status(500).json({
            message: 'Failed to fetch payments',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getCompanyPayments = getCompanyPayments;
// Create a new payment
const createPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const session = yield mongoose_1.default.startSession();
    session.startTransaction();
    try {
        if (!(0, database_1.isDatabaseAvailable)()) {
            throw new errorHandler_1.AppError('Database is not available', 503);
        }
        const { paymentType, propertyType, propertyId, tenantId, agentId, paymentDate, paymentMethod, amount, depositAmount, referenceNumber, notes, } = req.body;
        // Validate required fields
        if (!propertyId || !tenantId || !agentId || !amount) {
            throw new errorHandler_1.AppError('Missing required fields', 400);
        }
        // Get property details
        const property = yield Property_1.Property.findById(propertyId).session(session);
        if (!property) {
            throw new errorHandler_1.AppError('Property not found', 404);
        }
        // Get agent details
        const agent = yield User_1.User.findById(agentId).session(session);
        if (!agent) {
            throw new errorHandler_1.AppError('Agent not found', 404);
        }
        // Calculate commission using centralized service and company-configured splits
        const commissionPercent = typeof property.commission === 'number'
            ? property.commission
            : ((propertyType || 'residential') === 'residential' ? 15 : 10);
        const commissionDetails = yield commissionService_1.CommissionService.calculate(amount, commissionPercent, new mongoose_1.default.Types.ObjectId(req.user.companyId));
        // Create payment record
        const payment = new Payment_1.Payment({
            paymentType,
            propertyType,
            propertyId,
            tenantId,
            agentId,
            companyId: req.user.companyId,
            paymentDate,
            paymentMethod,
            amount,
            depositAmount,
            referenceNumber,
            notes,
            processedBy: req.user.userId,
            commissionDetails,
            status: 'completed',
        });
        yield payment.save({ session });
        // Update company revenue
        yield Company_1.Company.findByIdAndUpdate(req.user.companyId, {
            $inc: {
                revenue: commissionDetails.agencyShare,
            },
        }, { session });
        // Update agent commission
        yield User_1.User.findByIdAndUpdate(agentId, {
            $inc: {
                commission: commissionDetails.agentShare,
            },
        }, { session });
        // If it's a rental payment, update property owner's balance
        if (paymentType === 'rental' && property.ownerId) {
            yield User_1.User.findByIdAndUpdate(property.ownerId, {
                $inc: {
                    balance: commissionDetails.ownerAmount,
                },
            }, { session });
            // Update property statistics
            yield Property_1.Property.findByIdAndUpdate(propertyId, {
                $inc: {
                    totalRentCollected: amount,
                    occupancyRate: 100 / (property.units || 1),
                },
                $set: {
                    status: 'rented',
                    occupiedUnits: (property.occupiedUnits || 0) + 1,
                },
            }, { session });
        }
        yield session.commitTransaction();
        res.status(201).json({
            message: 'Payment processed successfully',
            payment,
        });
    }
    catch (error) {
        yield session.abortTransaction();
        console.error('Error processing payment:', error);
        res.status(error instanceof errorHandler_1.AppError ? error.statusCode : 500).json({
            message: error instanceof errorHandler_1.AppError ? error.message : 'Failed to process payment',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
    finally {
        session.endSession();
    }
});
exports.createPayment = createPayment;
// Get payment details
const getPaymentDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!req.user) {
            throw new errorHandler_1.AppError('Authentication required', 401, 'AUTH_REQUIRED');
        }
        if (!(0, database_1.isDatabaseAvailable)()) {
            throw new errorHandler_1.AppError('Database is not available', 503, 'DB_UNAVAILABLE');
        }
        const payment = yield Payment_1.Payment.findById(req.params.id)
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName')
            .populate('agentId', 'firstName lastName')
            .populate('processedBy', 'firstName lastName');
        if (!payment) {
            throw new errorHandler_1.AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
        }
        // Check if user has access to this payment
        if (payment.companyId.toString() !== req.user.companyId) {
            throw new errorHandler_1.AppError('Access denied', 403, 'ACCESS_DENIED');
        }
        res.json(payment);
    }
    catch (error) {
        logger_1.logger.error('Error fetching payment details:', {
            error,
            paymentId: req.params.id,
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId
        });
        if (error instanceof errorHandler_1.AppError) {
            res.status(error.statusCode).json({
                status: error.status,
                message: error.message,
                code: error.code
            });
        }
        else {
            res.status(500).json({
                status: 'error',
                message: 'Failed to fetch payment details',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
});
exports.getPaymentDetails = getPaymentDetails;
// Update payment status
const updatePaymentStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const session = yield mongoose_1.default.startSession();
    session.startTransaction();
    try {
        if (!(0, database_1.isDatabaseAvailable)()) {
            throw new errorHandler_1.AppError('Database is not available', 503);
        }
        const { status } = req.body;
        if (!['pending', 'completed', 'failed'].includes(status)) {
            throw new errorHandler_1.AppError('Invalid status', 400);
        }
        const payment = yield Payment_1.Payment.findById(req.params.id).session(session);
        if (!payment) {
            throw new errorHandler_1.AppError('Payment not found', 404);
        }
        // Check if user has access to this payment
        if (payment.companyId.toString() !== req.user.companyId) {
            throw new errorHandler_1.AppError('Access denied', 403);
        }
        const oldStatus = payment.status;
        payment.status = status;
        yield payment.save({ session });
        // If payment is being marked as failed, reverse the commission and revenue updates
        if (oldStatus === 'completed' && status === 'failed') {
            const { commissionDetails } = payment;
            // Reverse company revenue
            yield Company_1.Company.findByIdAndUpdate(payment.companyId, {
                $inc: {
                    revenue: -commissionDetails.agencyShare,
                },
            }, { session });
            // Reverse agent commission
            yield User_1.User.findByIdAndUpdate(payment.agentId, {
                $inc: {
                    commission: -commissionDetails.agentShare,
                },
            }, { session });
            // If it was a rental payment, reverse property owner's balance
            if (payment.paymentType === 'rental') {
                const property = yield Property_1.Property.findById(payment.propertyId).session(session);
                if (property) {
                    yield User_1.User.findByIdAndUpdate(property.ownerId, {
                        $inc: {
                            balance: -commissionDetails.ownerAmount,
                        },
                    }, { session });
                    // Update property statistics
                    yield Property_1.Property.findByIdAndUpdate(payment.propertyId, {
                        $inc: {
                            totalRentCollected: -payment.amount,
                            occupancyRate: -100 / (property.units || 1),
                        },
                        $set: {
                            status: 'available',
                            occupiedUnits: Math.max(0, (property.occupiedUnits || 0) - 1),
                        },
                    }, { session });
                }
            }
        }
        yield session.commitTransaction();
        res.json({
            message: 'Payment status updated successfully',
            payment,
        });
    }
    catch (error) {
        yield session.abortTransaction();
        console.error('Error updating payment status:', error);
        res.status(error instanceof errorHandler_1.AppError ? error.statusCode : 500).json({
            message: error instanceof errorHandler_1.AppError ? error.message : 'Failed to update payment status',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
    finally {
        session.endSession();
    }
});
exports.updatePaymentStatus = updatePaymentStatus;
// Update property occupancy when adding a payment
const updatePropertyOccupancy = (property, isAdding) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // These fields have default values in the schema
        const units = property.units || 1;
        const occupiedUnits = property.occupiedUnits || 0;
        const updatedOccupancy = {
            occupancyRate: 100 / units,
            occupiedUnits: isAdding ? occupiedUnits + 1 : Math.max(0, occupiedUnits - 1)
        };
        yield Property_1.Property.findByIdAndUpdate(property._id, {
            $set: updatedOccupancy
        });
        return updatedOccupancy;
    }
    catch (error) {
        logger_1.logger.error('Error updating property occupancy:', error);
        throw new errorHandler_1.AppError('Failed to update property occupancy', 500);
    }
});
