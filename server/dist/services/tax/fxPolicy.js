"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTaxFx = resolveTaxFx;
const money_1 = require("../../utils/money");
const norm = (value) => String(value || 'USD').trim().toUpperCase() || 'USD';
/**
 * Live FX conversion is not implemented. Same-currency 1.0 is a currency identity, not an FX rate.
 * Cross-currency without an explicit sourced rate is FX_REVIEW_REQUIRED — never silently 1.
 */
function resolveTaxFx(input = {}) {
    const transactionCurrency = norm(input.transactionCurrency);
    const taxCurrency = norm(input.taxCurrency || input.transactionCurrency);
    const functionalCurrency = norm(input.functionalCurrency || input.transactionCurrency);
    const same = transactionCurrency === taxCurrency && taxCurrency === functionalCurrency;
    if (same) {
        return {
            transactionCurrency,
            taxCurrency,
            functionalCurrency,
            exchangeRate: 1,
            rateSource: 'SAME_CURRENCY',
            rateDate: input.rateDate || null,
            fxReviewRequired: false
        };
    }
    const rate = input.exchangeRate == null ? null : Number(input.exchangeRate);
    const source = String(input.rateSource || '').trim();
    if (rate != null && Number.isFinite(rate) && rate > 0 && source && source !== '1' && source.toUpperCase() !== 'IMPLIED_ONE') {
        return {
            transactionCurrency,
            taxCurrency,
            functionalCurrency,
            exchangeRate: (0, money_1.roundMoney)(rate, 6),
            rateSource: source,
            rateDate: input.rateDate || null,
            fxReviewRequired: false
        };
    }
    return {
        transactionCurrency,
        taxCurrency,
        functionalCurrency,
        exchangeRate: null,
        rateSource: 'UNAVAILABLE',
        rateDate: input.rateDate || null,
        fxReviewRequired: true,
        reviewReason: 'FX_REVIEW_REQUIRED'
    };
}
