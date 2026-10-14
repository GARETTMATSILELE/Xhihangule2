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
exports.tryFiscalizeInvoice = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../models/Company");
const tryFiscalizeInvoice = (companyId, invoicePayload) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const company = yield Company_1.Company.findById(new mongoose_1.default.Types.ObjectId(companyId));
        if (!company || !company.fiscalConfig || !company.fiscalConfig.enabled) {
            return { status: 'NOT_FISCALISED' };
        }
        const { tinNumber } = company;
        const deviceSerial = company.fiscalConfig.deviceSerial || undefined;
        // Local QR payload is an attempt only. It is not FDMS confirmation.
        const qrPayload = JSON.stringify({
            tin: tinNumber,
            total: invoicePayload.totalAmount,
            tax: invoicePayload.taxAmount,
            vat: invoicePayload.taxPercentage,
            net: invoicePayload.amountExcludingTax,
            ts: invoicePayload.createdAt ? new Date(invoicePayload.createdAt).toISOString() : new Date().toISOString(),
            inv: invoicePayload._id || undefined,
            dev: deviceSerial
        });
        return {
            qrContent: qrPayload,
            deviceSerial,
            status: 'NOT_FISCALISED',
            error: 'FDMS integration is not implemented; local QR is not a fiscal invoice'
        };
    }
    catch (e) {
        return { status: 'FISCALISATION_FAILURE', error: (e === null || e === void 0 ? void 0 : e.message) || 'Fiscalisation failed' };
    }
});
exports.tryFiscalizeInvoice = tryFiscalizeInvoice;
