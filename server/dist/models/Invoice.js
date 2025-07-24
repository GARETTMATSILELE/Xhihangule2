"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Invoice = void 0;
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const InvoiceSchema = new mongoose_1.Schema({
    property: { type: String, required: true },
    client: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    description: { type: String },
    type: { type: String, enum: ['rental', 'sale'], required: true },
    saleDetails: { type: String },
    status: { type: String, enum: ['paid', 'unpaid', 'overdue'], default: 'unpaid' },
}, { timestamps: true });
exports.Invoice = database_1.accountingConnection.model('Invoice', InvoiceSchema, 'invoices');
