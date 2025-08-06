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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInvoices = exports.createInvoice = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Invoice_1 = require("../models/Invoice");
const errorHandler_1 = require("../middleware/errorHandler");
const database_1 = require("../config/database");
// Function to generate unique item code
const generateItemCode = () => __awaiter(void 0, void 0, void 0, function* () {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `ITEM-${timestamp}-${random}`.toUpperCase();
});
// Function to calculate tax breakdown
const calculateTaxBreakdown = (items, discount = 0, taxPercentage = 15) => {
    const subtotal = items.reduce((sum, item) => sum + item.netPrice, 0);
    const amountExcludingTax = subtotal - discount;
    const taxAmount = (amountExcludingTax * taxPercentage) / 100;
    const totalAmount = amountExcludingTax + taxAmount;
    return {
        subtotal,
        amountExcludingTax,
        taxAmount,
        totalAmount
    };
};
// Function to validate client details
const validateClientDetails = (client) => {
    var _a, _b;
    if (!client || typeof client !== 'object') {
        throw new errorHandler_1.AppError('Client details are required', 400);
    }
    // Only name and address are required
    if (!client.name || typeof client.name !== 'string' || client.name.trim() === '') {
        throw new errorHandler_1.AppError('Client name is required', 400);
    }
    if (!client.address || typeof client.address !== 'string' || client.address.trim() === '') {
        throw new errorHandler_1.AppError('Client address is required', 400);
    }
    return {
        name: client.name.trim(),
        address: client.address.trim(),
        tinNumber: ((_a = client.tinNumber) === null || _a === void 0 ? void 0 : _a.trim()) || undefined,
        vatNumber: ((_b = client.vatNumber) === null || _b === void 0 ? void 0 : _b.trim()) || undefined
    };
};
const createInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
        }
        const _b = req.body, { items, discount = 0, taxPercentage = 15, client } = _b, otherData = __rest(_b, ["items", "discount", "taxPercentage", "client"]);
        // Validate client details
        const validatedClient = validateClientDetails(client);
        // Generate codes for items if not provided
        const processedItems = yield Promise.all(items.map((item) => __awaiter(void 0, void 0, void 0, function* () {
            return (Object.assign(Object.assign({}, item), { code: item.code || (yield generateItemCode()), taxPercentage: item.taxPercentage || taxPercentage }));
        })));
        // Calculate tax breakdown
        const breakdown = calculateTaxBreakdown(processedItems, discount, taxPercentage);
        const invoiceData = Object.assign(Object.assign(Object.assign(Object.assign({}, otherData), { client: validatedClient, items: processedItems, discount,
            taxPercentage }), breakdown), { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) });
        const invoice = new Invoice_1.Invoice(invoiceData);
        yield invoice.save();
        res.status(201).json(invoice);
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error('Error creating invoice:', error);
        res.status(500).json({ message: 'Error creating invoice', error: error instanceof Error ? error.message : 'Unknown error' });
    }
});
exports.createInvoice = createInvoice;
const getInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        console.log('getInvoices called with user:', {
            userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId,
            companyId: (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId,
            role: (_c = req.user) === null || _c === void 0 ? void 0 : _c.role
        });
        if (!((_d = req.user) === null || _d === void 0 ? void 0 : _d.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
        }
        console.log('Fetching invoices for company:', req.user.companyId);
        // Check if the accounting connection is ready
        const accountingConnectionState = database_1.accountingConnection.readyState;
        console.log('Accounting connection state:', accountingConnectionState);
        if (accountingConnectionState !== 1) {
            console.error('Accounting database not connected. State:', accountingConnectionState);
            throw new errorHandler_1.AppError('Database connection not available', 503);
        }
        // First try to find invoices with companyId
        let invoices = yield Invoice_1.Invoice.find({
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId)
        }).sort({ createdAt: -1 });
        console.log(`Found ${invoices.length} invoices with companyId ${req.user.companyId}`);
        // If no invoices found with companyId, try to find all invoices (for backward compatibility)
        if (invoices.length === 0) {
            console.log('No invoices found with companyId, trying to fetch all invoices...');
            invoices = yield Invoice_1.Invoice.find({}).sort({ createdAt: -1 });
            console.log(`Found ${invoices.length} total invoices (no company filtering)`);
        }
        console.log('Returning invoices:', invoices.length);
        res.json(invoices);
    }
    catch (error) {
        console.error('Error in getInvoices:', error);
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        if (error instanceof Error) {
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
        res.status(500).json({
            message: 'Error fetching invoices',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getInvoices = getInvoices;
