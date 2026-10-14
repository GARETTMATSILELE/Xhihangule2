"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateOrdinaryIncomeTaxWorkingPaper = calculateOrdinaryIncomeTaxWorkingPaper;
const incomeTaxRounding_1 = require("./tax/incomeTaxRounding");
function signedAdjustment(type, amount) {
    const value = Math.abs(Number(amount || 0));
    const code = String(type || '').toUpperCase();
    if (code === 'ADD_BACK' || code === 'NON_DEDUCTIBLE_EXPENSE' || code === 'PRIVATE_EXPENSE' || code === 'ACCOUNTING_DEPRECIATION_ADD_BACK') {
        return { addBack: value, deduction: 0, exempt: 0, capital: 0, other: 0 };
    }
    if (code === 'DEDUCTION')
        return { addBack: 0, deduction: value, exempt: 0, capital: 0, other: 0 };
    if (code === 'EXEMPT_INCOME')
        return { addBack: 0, deduction: 0, exempt: value, capital: 0, other: 0 };
    if (code === 'CAPITAL_ADJUSTMENT')
        return { addBack: 0, deduction: 0, exempt: 0, capital: value, other: 0 };
    return { addBack: 0, deduction: 0, exempt: 0, capital: 0, other: Number(amount || 0) };
}
const BLOCKING_REVIEW = new Set([
    'PROFILE_SNAPSHOT_MISSING',
    'TAX_PERIOD_MISSING',
    'TAX_RULE_UNAVAILABLE',
    'PRESUMPTIVE_VS_ORDINARY_TREATMENT_UNCLEAR',
    'MISSING_INCOME_TAX_CLASSIFICATION',
    'CURRENCY_CONVERSION_REQUIRED',
    'MANUAL_ADJUSTMENT_AWAITING_REVIEW',
    'VAT_COMPONENT_REQUIRES_REVIEW'
]);
function calculateOrdinaryIncomeTaxWorkingPaper(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const reviewReasons = [...(input.reviewReasons || [])];
    const currencies = Array.from(new Set((input.currencies || []).filter(Boolean)));
    const ruleMeta = {
        taxRuleId: ((_a = input.incomeTaxRule) === null || _a === void 0 ? void 0 : _a.id) || null,
        taxRuleVersion: (_c = (_b = input.incomeTaxRule) === null || _b === void 0 ? void 0 : _b.version) !== null && _c !== void 0 ? _c : null,
        taxRuleCode: ((_d = input.incomeTaxRule) === null || _d === void 0 ? void 0 : _d.ruleCode) || null,
        sourceReference: ((_e = input.incomeTaxRule) === null || _e === void 0 ? void 0 : _e.sourceReference) || null,
        calculationMethod: ((_f = input.incomeTaxRule) === null || _f === void 0 ? void 0 : _f.calculationMethod) || 'TAXABLE_INCOME_PERCENT',
        taxRate: (_h = (_g = input.incomeTaxRule) === null || _g === void 0 ? void 0 : _g.rate) !== null && _h !== void 0 ? _h : null
    };
    const empty = (status, extra = {}) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        return ({
            currencies,
            accountingIncome: (_a = extra.accountingIncome) !== null && _a !== void 0 ? _a : null,
            accountingExpenses: (_b = extra.accountingExpenses) !== null && _b !== void 0 ? _b : null,
            accountingProfit: (_c = extra.accountingProfit) !== null && _c !== void 0 ? _c : null,
            addBacks: (_d = extra.addBacks) !== null && _d !== void 0 ? _d : null,
            deductions: (_e = extra.deductions) !== null && _e !== void 0 ? _e : null,
            exemptIncome: (_f = extra.exemptIncome) !== null && _f !== void 0 ? _f : null,
            capitalAdjustments: (_g = extra.capitalAdjustments) !== null && _g !== void 0 ? _g : null,
            otherTaxAdjustments: (_h = extra.otherTaxAdjustments) !== null && _h !== void 0 ? _h : null,
            taxableIncomeBeforeAdjustments: (_j = extra.taxableIncomeBeforeAdjustments) !== null && _j !== void 0 ? _j : null,
            taxableIncome: (_k = extra.taxableIncome) !== null && _k !== void 0 ? _k : null,
            taxRate: (_l = extra.taxRate) !== null && _l !== void 0 ? _l : ruleMeta.taxRate,
            taxAmount: (_m = extra.taxAmount) !== null && _m !== void 0 ? _m : null,
            calculationMethod: ruleMeta.calculationMethod,
            calculationStatus: status,
            taxRuleId: ruleMeta.taxRuleId,
            taxRuleVersion: ruleMeta.taxRuleVersion,
            taxRuleCode: ruleMeta.taxRuleCode,
            sourceReference: ruleMeta.sourceReference,
            reviewReasons: extra.reviewReasons || reviewReasons,
            vatAmount: null,
            presumptiveTaxAmount: null
        });
    };
    if (input.profilePresent === false) {
        return empty('PROFILE_REQUIRED', { reviewReasons: ['PROFILE_SNAPSHOT_MISSING'] });
    }
    if (input.periodAssignmentStatus === 'PERIOD_REQUIRED') {
        return empty('PERIOD_REQUIRED', { reviewReasons: Array.from(new Set([...reviewReasons, 'TAX_PERIOD_MISSING'])) });
    }
    if (currencies.length > 1) {
        return empty('REVIEW_REQUIRED', {
            reviewReasons: Array.from(new Set([...reviewReasons, 'CURRENCY_CONVERSION_REQUIRED']))
        });
    }
    const income = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(input.accountingIncome);
    const expenses = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(input.accountingExpenses);
    const profit = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(income - expenses);
    let addBacks = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(input.lineAddBacks);
    const classifiedDeductions = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(input.lineDeductions);
    let extraDeductions = 0;
    let exempt = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(input.lineExemptIncome);
    let capital = 0;
    let other = 0;
    for (const row of input.adjustments || []) {
        if (row.status && row.status !== 'APPROVED' && row.status !== 'POSTED') {
            if (row.status === 'PENDING' || row.status === 'REVIEW_REQUIRED') {
                reviewReasons.push('MANUAL_ADJUSTMENT_AWAITING_REVIEW');
            }
            continue;
        }
        if (!String(row.reason || '').trim()) {
            reviewReasons.push('MANUAL_ADJUSTMENT_AWAITING_REVIEW');
            continue;
        }
        const split = signedAdjustment(row.adjustmentType, row.amount);
        addBacks = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(addBacks + split.addBack);
        extraDeductions = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(extraDeductions + split.deduction);
        exempt = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(exempt + split.exempt);
        capital = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(capital + split.capital);
        other = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(other + split.other);
    }
    const deductions = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(classifiedDeductions + extraDeductions);
    const before = profit;
    // Allowable line deductions already reduced accounting profit. Only extra/manual deductions subtract again.
    const taxable = (0, incomeTaxRounding_1.roundIncomeTaxMoney)(profit + addBacks - extraDeductions - exempt + other);
    if (reviewReasons.some((reason) => BLOCKING_REVIEW.has(reason))) {
        return empty('REVIEW_REQUIRED', {
            accountingIncome: income,
            accountingExpenses: expenses,
            accountingProfit: profit,
            addBacks,
            deductions,
            exemptIncome: exempt,
            capitalAdjustments: capital,
            otherTaxAdjustments: other,
            taxableIncomeBeforeAdjustments: before,
            taxableIncome: null,
            taxAmount: null,
            reviewReasons: Array.from(new Set(reviewReasons))
        });
    }
    if (!input.incomeTaxRule || input.incomeTaxRule.rate == null || input.incomeTaxRule.calculationMethod !== 'TAXABLE_INCOME_PERCENT') {
        return empty('RULE_REQUIRED', {
            accountingIncome: income,
            accountingExpenses: expenses,
            accountingProfit: profit,
            addBacks,
            deductions,
            exemptIncome: exempt,
            capitalAdjustments: capital,
            otherTaxAdjustments: other,
            taxableIncomeBeforeAdjustments: before,
            taxableIncome: taxable,
            taxAmount: null,
            reviewReasons: Array.from(new Set([...reviewReasons, 'TAX_RULE_UNAVAILABLE']))
        });
    }
    const taxAmount = (0, incomeTaxRounding_1.calculateTaxableIncomePercent)(taxable, input.incomeTaxRule.rate);
    return empty('CALCULATED', {
        accountingIncome: income,
        accountingExpenses: expenses,
        accountingProfit: profit,
        addBacks,
        deductions,
        exemptIncome: exempt,
        capitalAdjustments: capital,
        otherTaxAdjustments: other,
        taxableIncomeBeforeAdjustments: before,
        taxableIncome: taxable,
        taxRate: input.incomeTaxRule.rate,
        taxAmount
    });
}
