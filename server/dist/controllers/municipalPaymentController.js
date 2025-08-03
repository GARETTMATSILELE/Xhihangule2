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
exports.createMunicipalPayment = void 0;
const MunicipalPayment_1 = require("../models/MunicipalPayment");
const errorHandler_1 = require("../middleware/errorHandler");
const mongoose_1 = __importDefault(require("mongoose"));
const createMunicipalPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const municipalPaymentData = Object.assign(Object.assign({}, req.body), { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId), processedBy: new mongoose_1.default.Types.ObjectId(req.user.userId), paymentType: 'municipal', status: 'completed' // Set as completed for accountant dashboard payments
         });
        const municipalPayment = new MunicipalPayment_1.MunicipalPayment(municipalPaymentData);
        yield municipalPayment.save();
        // Populate the created municipal payment for response
        const populatedMunicipalPayment = yield MunicipalPayment_1.MunicipalPayment.findById(municipalPayment._id)
            .populate('propertyId', 'name address')
            .populate('processedBy', 'firstName lastName email');
        res.status(201).json(populatedMunicipalPayment);
    }
    catch (error) {
        console.error('Error creating municipal payment:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        res.status(400).json({ message: error.message || 'Failed to create municipal payment' });
    }
});
exports.createMunicipalPayment = createMunicipalPayment;
