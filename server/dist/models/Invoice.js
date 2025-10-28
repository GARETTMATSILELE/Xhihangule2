"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Invoice = void 0;
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const InvoiceItemSchema = new mongoose_1.Schema({
    code: { type: String, required: true },
    description: { type: String, required: true },
    taxPercentage: { type: Number, required: true, default: 15 },
    netPrice: { type: Number, required: true },
    quantity: { type: Number, required: false, default: 1 },
    unitPrice: { type: Number, required: false, default: 0 }
});
const ClientDetailsSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    tinNumber: { type: String, required: false },
    vatNumber: { type: String, required: false },
    bpNumber: { type: String, required: false }
});
const BankAccountSchema = new mongoose_1.Schema({
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true },
    accountType: { type: String, enum: ['USD NOSTRO', 'ZiG'], required: true },
    bankName: { type: String, required: true },
    branchName: { type: String, required: true },
    branchCode: { type: String, required: true }
});
const InvoiceSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true },
    property: { type: String, required: true },
    client: { type: ClientDetailsSchema, required: true },
    currency: { type: String, enum: ['USD', 'ZiG', 'ZAR'], default: 'USD' },
    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    amountExcludingTax: { type: Number, required: true, default: 0 },
    taxPercentage: { type: Number, required: true, default: 15 },
    taxAmount: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },
    dueDate: { type: Date, required: true },
    items: [InvoiceItemSchema],
    type: { type: String, enum: ['rental', 'sale'], required: true },
    saleDetails: { type: String },
    status: { type: String, enum: ['paid', 'unpaid', 'overdue'], default: 'unpaid' },
    selectedBankAccount: { type: BankAccountSchema, required: false },
    fiscalData: {
        qrContent: { type: String },
        fiscalNumber: { type: String },
        deviceSerial: { type: String },
        documentNumber: { type: String },
        signature: { type: String }
    }
}, { timestamps: true });
exports.Invoice = database_1.accountingConnection.model('Invoice', InvoiceSchema, 'invoices');
