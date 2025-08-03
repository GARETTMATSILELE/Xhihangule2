"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Invoice = void 0;
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const InvoiceItemSchema = new mongoose_1.Schema({
    code: { type: String, required: true },
    description: { type: String, required: true },
    taxPercentage: { type: Number, required: true, default: 15 },
    netPrice: { type: Number, required: true }
});
const ClientDetailsSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    tinNumber: { type: String, required: true },
    bpNumber: { type: String, required: true },
    vatNumber: { type: String, required: true }
});
const InvoiceSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true },
    property: { type: String, required: true },
    client: { type: ClientDetailsSchema, required: true },
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
}, { timestamps: true });
exports.Invoice = database_1.accountingConnection.model('Invoice', InvoiceSchema, 'invoices');
