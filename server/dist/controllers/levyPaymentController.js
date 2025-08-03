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
exports.getLevyPayments = exports.createLevyPayment = void 0;
const LevyPayment_1 = require("../models/LevyPayment");
const errorHandler_1 = require("../middleware/errorHandler");
const mongoose_1 = __importDefault(require("mongoose"));
const createLevyPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
        }
        if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId)) {
            throw new errorHandler_1.AppError('User ID not found. Please ensure you are properly authenticated.', 400);
        }
        // Validate required fields
        const { propertyId, paymentDate, paymentMethod, amount, currency = 'USD' } = req.body;
        if (!propertyId) {
            throw new errorHandler_1.AppError('Property ID is required', 400);
        }
        if (!paymentDate) {
            throw new errorHandler_1.AppError('Payment date is required', 400);
        }
        if (!paymentMethod) {
            throw new errorHandler_1.AppError('Payment method is required', 400);
        }
        if (!amount || amount <= 0) {
            throw new errorHandler_1.AppError('Valid amount is required', 400);
        }
        const levyPaymentData = Object.assign(Object.assign({}, req.body), { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId), processedBy: new mongoose_1.default.Types.ObjectId(req.user.userId), paymentType: 'levy', status: 'completed' // Set as completed for accountant dashboard payments
         });
        const levyPayment = new LevyPayment_1.LevyPayment(levyPaymentData);
        yield levyPayment.save();
        // Populate the created levy payment for response
        const populatedLevyPayment = yield LevyPayment_1.LevyPayment.findById(levyPayment._id)
            .populate('propertyId', 'name address')
            .populate('processedBy', 'firstName lastName email');
        res.status(201).json(populatedLevyPayment);
    }
    catch (error) {
        console.error('Error creating levy payment:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        res.status(400).json({ message: error.message || 'Failed to create levy payment' });
    }
});
exports.createLevyPayment = createLevyPayment;
const getLevyPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        const levyPayments = yield LevyPayment_1.LevyPayment.find({ companyId })
            .populate('propertyId', 'name address')
            .populate('processedBy', 'firstName lastName email')
            .sort({ paymentDate: -1 });
        res.status(200).json(levyPayments);
    }
    catch (error) {
        console.error('Error fetching levy payments:', error);
        res.status(500).json({ message: error.message || 'Failed to fetch levy payments' });
    }
});
exports.getLevyPayments = getLevyPayments;
