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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInvoices = exports.createInvoice = void 0;
const Invoice_1 = require("../models/Invoice");
const createInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const invoice = new Invoice_1.Invoice(req.body);
        yield invoice.save();
        res.status(201).json(invoice);
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating invoice', error });
    }
});
exports.createInvoice = createInvoice;
const getInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const invoices = yield Invoice_1.Invoice.find().sort({ createdAt: -1 });
        res.json(invoices);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching invoices', error });
    }
});
exports.getInvoices = getInvoices;
