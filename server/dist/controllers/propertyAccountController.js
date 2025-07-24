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
exports.getAcknowledgementDocument = exports.getPaymentRequestDocument = exports.createPropertyPayment = exports.getPropertyTransactions = void 0;
exports.getPropertyAccount = getPropertyAccount;
exports.addExpense = addExpense;
const Property_1 = require("../models/Property");
const Payment_1 = require("../models/Payment");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const getPropertyTransactions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId } = req.params;
        const { type } = req.query;
        if (!propertyId)
            return res.status(400).json({ message: 'Property ID required' });
        if (!type || (type !== 'income' && type !== 'expenditure')) {
            return res.status(400).json({ message: 'Query param type=income|expenditure required' });
        }
        if (type === 'income') {
            // Find all rental income payments for this property (after commission)
            const payments = yield Payment_1.Payment.find({ propertyId, type: 'rent', status: 'completed' })
                .sort({ createdAt: 1 });
            // Map to show net income (after commission)
            const income = payments.map((p) => {
                var _a, _b;
                return ({
                    _id: p._id,
                    date: p.createdAt,
                    amount: p.amount - (((_a = p.commissionDetails) === null || _a === void 0 ? void 0 : _a.totalCommission) || 0),
                    grossAmount: p.amount,
                    commission: ((_b = p.commissionDetails) === null || _b === void 0 ? void 0 : _b.totalCommission) || 0,
                    tenant: p.tenantId,
                    lease: p.leaseId,
                    description: p.description || 'Rental income',
                });
            });
            return res.json(income);
        }
        else {
            // Expenditure: payments made from this property account (type: 'expenditure' or similar)
            const payments = yield Payment_1.Payment.find({ propertyId, type: 'expenditure', status: 'completed' })
                .sort({ createdAt: 1 });
            return res.json(payments);
        }
    }
    catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});
exports.getPropertyTransactions = getPropertyTransactions;
const createPropertyPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId } = req.params;
        const { amount, recipientId, recipientType, reason } = req.body;
        if (!propertyId || !amount || !recipientId || !recipientType) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        // For now, just create a Payment with type 'expenditure'
        const payment = new Payment_1.Payment({
            propertyId,
            amount,
            recipientId,
            recipientType, // 'owner' or 'contractor'
            reason,
            type: 'expenditure',
            status: 'completed',
            createdAt: new Date(),
        });
        yield payment.save();
        res.status(201).json(payment);
    }
    catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});
exports.createPropertyPayment = createPropertyPayment;
const getPaymentRequestDocument = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId, paymentId } = req.params;
        // Fetch payment and property
        const payment = yield Payment_1.Payment.findById(paymentId);
        const property = yield Property_1.Property.findById(propertyId);
        if (!payment || !property) {
            return res.status(404).json({ message: 'Payment or property not found' });
        }
        // For now, return a JSON with the details needed for the payment request document
        res.json({
            documentType: 'Payment Request',
            property: {
                name: property.name,
                address: property.address,
            },
            payment: {
                amount: payment.amount,
                recipientId: payment.recipientId,
                recipientType: payment.recipientType,
                reason: payment.reason,
                date: payment.createdAt,
            },
        });
    }
    catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});
exports.getPaymentRequestDocument = getPaymentRequestDocument;
const getAcknowledgementDocument = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId, paymentId } = req.params;
        const payment = yield Payment_1.Payment.findById(paymentId);
        const property = yield Property_1.Property.findById(propertyId);
        if (!payment || !property) {
            return res.status(404).json({ message: 'Payment or property not found' });
        }
        // For now, return a JSON with the details needed for the acknowledgement document
        res.json({
            documentType: 'Acknowledgement of Receipt',
            property: {
                address: property.address,
            },
            payment: {
                amount: payment.amount,
                reason: payment.reason,
                recipientId: payment.recipientId,
                recipientType: payment.recipientType,
                date: payment.createdAt,
            },
            blanks: {
                name: '',
                idNumber: '',
                signature: '',
                contactNumber: payment.recipientType === 'contractor' ? '' : undefined,
            },
        });
    }
    catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});
exports.getAcknowledgementDocument = getAcknowledgementDocument;
function getPropertyAccount(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { propertyId } = req.params;
        const account = yield PropertyAccount_1.default.findOne({ propertyId });
        if (!account)
            return res.status(404).json({ error: 'Not found' });
        res.json(account);
    });
}
function addExpense(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { propertyId } = req.params;
        const { amount, date, description } = req.body;
        let account = yield PropertyAccount_1.default.findOne({ propertyId });
        if (!account) {
            account = new PropertyAccount_1.default({ propertyId, transactions: [], runningBalance: 0 });
        }
        account.transactions.push({
            type: 'expense',
            amount,
            date: date ? new Date(date) : new Date(),
            description
        });
        account.transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        account.runningBalance = account.transactions.reduce((sum, t) => {
            return t.type === 'income' ? sum + t.amount : sum - t.amount;
        }, 0);
        account.lastUpdated = new Date();
        yield account.save();
        res.json(account);
    });
}
