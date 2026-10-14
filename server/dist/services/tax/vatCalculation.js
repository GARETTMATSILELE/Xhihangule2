"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VAT_RATE_CHANGE_2026 = exports.STANDARD_VAT_PERCENT_BEFORE_2026 = exports.STANDARD_VAT_PERCENT_FROM_2026 = void 0;
exports.extractInclusiveVat = extractInclusiveVat;
exports.exclusiveVatOn = exclusiveVatOn;
exports.commissionVatFromTreatment = commissionVatFromTreatment;
exports.filingPeriodFromDate = filingPeriodFromDate;
const money_1 = require("../../utils/money");
/** VAT included in a taxable gross: VAT = gross − gross / (1 + rate). */
function extractInclusiveVat(gross, vatRate) {
    const g = (0, money_1.roundMoney)(Math.max(0, Number(gross || 0)));
    const rate = Math.max(0, Number(vatRate || 0));
    if (!(g > 0) || !(rate > 0)) {
        return { gross: g, net: g, vatAmount: 0, vatRate: rate };
    }
    const net = (0, money_1.roundMoney)(g / (1 + rate));
    const vatAmount = (0, money_1.roundMoney)(g - net);
    return { gross: g, net, vatAmount, vatRate: rate };
}
function exclusiveVatOn(net, vatRate) {
    const n = (0, money_1.roundMoney)(Math.max(0, Number(net || 0)));
    const rate = Math.max(0, Number(vatRate || 0));
    const vatAmount = rate > 0 && n > 0 ? (0, money_1.roundMoney)(n * rate) : 0;
    return { gross: (0, money_1.roundMoney)(n + vatAmount), net: n, vatAmount, vatRate: rate };
}
function commissionVatFromTreatment(input) {
    const commission = (0, money_1.roundMoney)(Math.max(0, Number(input.commission || 0)));
    const vatRate = Math.max(0, Number(input.vatRate || 0));
    const treatment = input.treatment;
    if (treatment === 'NONE' || !(vatRate > 0) || !(commission > 0)) {
        return { commissionNet: commission, commissionGross: commission, vatAmount: 0, treatment: treatment === 'NONE' ? 'NONE' : treatment };
    }
    if (treatment === 'COMMISSION_VAT_INCLUSIVE') {
        const extracted = extractInclusiveVat(commission, vatRate);
        return {
            commissionNet: extracted.net,
            commissionGross: extracted.gross,
            vatAmount: extracted.vatAmount,
            treatment
        };
    }
    const added = exclusiveVatOn(commission, vatRate);
    return {
        commissionNet: added.net,
        commissionGross: added.gross,
        vatAmount: added.vatAmount,
        treatment
    };
}
function filingPeriodFromDate(value) {
    const date = value ? new Date(value) : new Date();
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}
/** Standard Zimbabwe VAT from 1 January 2026, used only to seed the dated rate table. */
exports.STANDARD_VAT_PERCENT_FROM_2026 = 15.5;
exports.STANDARD_VAT_PERCENT_BEFORE_2026 = 15;
exports.VAT_RATE_CHANGE_2026 = new Date(Date.UTC(2026, 0, 1));
