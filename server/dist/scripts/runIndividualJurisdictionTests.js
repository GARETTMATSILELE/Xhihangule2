"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const calculate_1 = require("../services/individualJurisdiction/calculate");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const publishedRules_1 = require("../services/individualJurisdiction/publishedRules");
const operations_1 = require("../services/individualJurisdiction/operations");
const results = {};
const on = (date) => new Date(`${date}T00:00:00.000Z`);
function base(overrides = {}) {
    return Object.assign({ asOf: on('2026-06-01'), currency: 'USD', taxJurisdiction: 'ZW', propertyJurisdiction: 'ZW', residencyJurisdiction: 'ZW', enabledTaxes: [], rentalIncome: 0, allowableExpenses: 0 }, overrides);
}
const amountOf = (code, input) => (0, calculate_1.calculateJurisdictionEstimate)(input).lines.find((row) => row.code === code);
{
    const continuing = amountOf('NORMAL_INCOME_TAX', base({
        rentalIncome: 1000,
        allowableExpenses: 200,
        rentalTaxRegime: 'SELF_ASSESSMENT',
        incomeTaxRegistered: true,
        incomeTaxRegistrationDate: '2025-06-01',
        propertyUseClass: 'COMMERCIAL',
        enabledTaxes: ['NORMAL_INCOME_TAX', 'PRESUMPTIVE_RENTAL']
    }));
    assert_1.default.strictEqual(continuing === null || continuing === void 0 ? void 0 : continuing.amount, 200);
    assert_1.default.strictEqual((_a = amountOf('PRESUMPTIVE_RENTAL', base({
        rentalIncome: 1000,
        rentalTaxRegime: 'SELF_ASSESSMENT',
        incomeTaxRegistered: true,
        incomeTaxRegistrationDate: '2025-06-01',
        propertyUseClass: 'COMMERCIAL',
        enabledTaxes: ['PRESUMPTIVE_RENTAL']
    }))) === null || _a === void 0 ? void 0 : _a.status, 'NOT_APPLICABLE');
    const aids = amountOf('AIDS_LEVY', base({
        rentalIncome: 1000,
        allowableExpenses: 200,
        rentalTaxRegime: 'SELF_ASSESSMENT',
        incomeTaxRegistered: true,
        incomeTaxRegistrationDate: '2025-06-01'
    }));
    assert_1.default.strictEqual(aids === null || aids === void 0 ? void 0 : aids.amount, 6);
    assert_1.default.strictEqual(aids === null || aids === void 0 ? void 0 : aids.rate, publishedRules_1.ZW_AIDS_LEVY_PERCENT);
    assert_1.default.ok(aids === null || aids === void 0 ? void 0 : aids.notes.join(' ').includes('not included in the 25%'));
    results['ZW existing self-assessment and AIDS levy estimate'] = 'PASS';
}
{
    const presumptive = amountOf('PRESUMPTIVE_RENTAL', base({
        rentalIncome: 1000,
        allowableExpenses: 400,
        propertyUseClass: 'COMMERCIAL',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        incomeTaxRegistered: true,
        incomeTaxRegistrationDate: '2026-02-01'
    }));
    assert_1.default.strictEqual(presumptive === null || presumptive === void 0 ? void 0 : presumptive.amount, 150);
    assert_1.default.strictEqual((_b = amountOf('NORMAL_INCOME_TAX', base({
        rentalIncome: 1000,
        allowableExpenses: 400,
        propertyUseClass: 'COMMERCIAL',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        incomeTaxRegistrationDate: '2026-02-01'
    }))) === null || _b === void 0 ? void 0 : _b.status, 'NOT_APPLICABLE');
    assert_1.default.strictEqual((_c = amountOf('PRESUMPTIVE_RENTAL', base({
        rentalIncome: 1000,
        propertyUseClass: 'RESIDENTIAL_DWELLING',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        incomeTaxRegistrationDate: '2026-02-01'
    }))) === null || _c === void 0 ? void 0 : _c.status, 'NOT_APPLICABLE');
    assert_1.default.strictEqual((_d = amountOf('PRESUMPTIVE_RENTAL', base({
        rentalIncome: 1000,
        propertyUseClass: 'MIXED_USE',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        incomeTaxRegistrationDate: '2026-02-01'
    }))) === null || _d === void 0 ? void 0 : _d.status, 'REVIEW_REQUIRED');
    assert_1.default.strictEqual((_e = amountOf('NORMAL_INCOME_TAX', base({
        rentalIncome: 1000,
        rentalTaxRegime: 'ACCOUNTANT_REVIEW'
    }))) === null || _e === void 0 ? void 0 : _e.status, 'REVIEW_REQUIRED');
    results['ZW presumptive, residential exclusion, mixed use, no double tax'] = 'PASS';
}
{
    const registered = amountOf('VAT', base({
        asOf: on('2026-02-01'),
        rentalIncome: 1000,
        propertyUseClass: 'COMMERCIAL',
        vatRegistered: true,
        enabledTaxes: ['VAT'],
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        incomeTaxRegistrationDate: '2026-02-01'
    }));
    assert_1.default.strictEqual(registered === null || registered === void 0 ? void 0 : registered.rate, 15.5);
    assert_1.default.strictEqual(registered === null || registered === void 0 ? void 0 : registered.amount, 155);
    assert_1.default.strictEqual((_f = amountOf('VAT', base({
        rentalIncome: 1000,
        propertyUseClass: 'RESIDENTIAL_DWELLING',
        vatRegistered: false
    }))) === null || _f === void 0 ? void 0 : _f.status, 'NOT_ENABLED');
    results['ZW VAT registered and non-registered'] = 'PASS';
}
{
    assert_1.default.strictEqual((0, calculate_1.saBracketTax)(245100), 44118);
    assert_1.default.strictEqual((0, calculate_1.saBracketTax)(383100), 79998);
    assert_1.default.strictEqual((0, calculate_1.saBracketTax)(530200), 125599);
    assert_1.default.strictEqual((0, calculate_1.saBracketTax)(695800), 185215);
    assert_1.default.strictEqual((0, calculate_1.saBracketTax)(887000), 259783);
    assert_1.default.strictEqual((0, calculate_1.saBracketTax)(1878600), 666339);
    assert_1.default.strictEqual((0, calculate_1.saBracketTax)(1878601), 666339.45);
    const tax = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'ZAR',
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZA',
        residencyJurisdiction: 'ZA',
        enabledTaxes: ['PERSONAL_INCOME_TAX'],
        rentalIncome: 100000,
        allowableExpenses: 20000,
        otherAnnualTaxableIncome: 200000,
        ageCategory: 'UNDER_65',
        propertyUseClass: 'RESIDENTIAL_DWELLING'
    }));
    const personal = tax.lines.find((row) => row.code === 'PERSONAL_INCOME_TAX');
    const without = Math.max(0, (0, calculate_1.saBracketTax)(200000) - publishedRules_1.SA_TAX_YEAR_2027.rebates.primary);
    const withRental = Math.max(0, (0, calculate_1.saBracketTax)(280000) - publishedRules_1.SA_TAX_YEAR_2027.rebates.primary);
    assert_1.default.strictEqual(personal === null || personal === void 0 ? void 0 : personal.amount, Math.round((withRental - without) * 100) / 100);
    assert_1.default.ok(personal === null || personal === void 0 ? void 0 : personal.notes.join(' ').includes('not a SARS assessment'));
    assert_1.default.strictEqual((_g = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'ZAR',
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZA',
        residencyJurisdiction: 'ZA',
        rentalIncome: 50000,
        allowableExpenses: 10000,
        enabledTaxes: ['PERSONAL_INCOME_TAX']
    })).lines.find((row) => row.code === 'PERSONAL_INCOME_TAX')) === null || _g === void 0 ? void 0 : _g.amount, null);
    results['ZA brackets, rebates and rental profit is not a flat rate'] = 'PASS';
}
{
    const loss = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'ZAR',
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZA',
        residencyJurisdiction: 'ZA',
        enabledTaxes: ['PERSONAL_INCOME_TAX'],
        rentalIncome: 10000,
        allowableExpenses: 40000,
        otherAnnualTaxableIncome: 2000000,
        ageCategory: 'UNDER_65',
        propertyUseClass: 'RESIDENTIAL_DWELLING'
    }));
    assert_1.default.strictEqual((_h = loss.lines.find((row) => row.code === 'PERSONAL_INCOME_TAX')) === null || _h === void 0 ? void 0 : _h.amount, 0);
    assert_1.default.ok((_j = loss.lines.find((row) => row.code === 'PERSONAL_INCOME_TAX')) === null || _j === void 0 ? void 0 : _j.reviewReasons.includes('RENTAL_LOSS_RING_FENCED'));
    const profit = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'ZAR',
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZA',
        residencyJurisdiction: 'ZA',
        rentalIncome: 10000,
        allowableExpenses: 0,
        capitalExpenses: 50000,
        privateExpenses: 50000,
        propertyUseClass: 'RESIDENTIAL_DWELLING'
    }));
    assert_1.default.strictEqual(profit.rentalProfit, 10000);
    results['ZA ring-fencing and non-deductible expenses'] = 'PASS';
}
{
    const residential = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'ZAR',
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZA',
        residencyJurisdiction: 'ZA',
        vatRegistered: true,
        enabledTaxes: ['VAT'],
        rentalIncome: 10000,
        propertyUseClass: 'RESIDENTIAL_DWELLING'
    })).lines.find((row) => row.code === 'VAT');
    assert_1.default.strictEqual(residential === null || residential === void 0 ? void 0 : residential.status, 'NOT_APPLICABLE');
    assert_1.default.ok(residential === null || residential === void 0 ? void 0 : residential.notes.join(' ').includes('Input tax cannot be claimed'));
    const commercial = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'ZAR',
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZA',
        residencyJurisdiction: 'ZA',
        vatRegistered: true,
        enabledTaxes: ['VAT'],
        rentalIncome: 10000,
        propertyUseClass: 'COMMERCIAL'
    })).lines.find((row) => row.code === 'VAT');
    assert_1.default.strictEqual(commercial === null || commercial === void 0 ? void 0 : commercial.amount, 1500);
    assert_1.default.strictEqual(commercial === null || commercial === void 0 ? void 0 : commercial.rate, publishedRules_1.SA_VAT.standardPercent);
    const threshold = (0, calculate_1.calculateJurisdictionEstimate)(base({
        asOf: on('2026-05-01'),
        currency: 'ZAR',
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZA',
        residencyJurisdiction: 'ZA',
        vatRegistered: false,
        enabledTaxes: ['VAT'],
        taxableSupplies: 2400000,
        propertyUseClass: 'COMMERCIAL'
    })).lines.find((row) => row.code === 'VAT');
    assert_1.default.ok(threshold === null || threshold === void 0 ? void 0 : threshold.reviewReasons.includes('REGISTRATION_THRESHOLD'));
    const provisional = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'ZAR',
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZA',
        residencyJurisdiction: 'ZA',
        rentalIncome: 1000,
        enabledTaxes: []
    })).lines.find((row) => row.code === 'PROVISIONAL_TAX');
    assert_1.default.notStrictEqual(provisional === null || provisional === void 0 ? void 0 : provisional.status, 'ESTIMATE');
    const turnover = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'ZAR',
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZA',
        residencyJurisdiction: 'ZA',
        rentalIncome: 100000
    })).lines.find((row) => row.code === 'TURNOVER_TAX');
    assert_1.default.strictEqual(turnover === null || turnover === void 0 ? void 0 : turnover.status, 'NOT_ENABLED');
    const elected = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'ZAR',
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZA',
        residencyJurisdiction: 'ZA',
        turnoverTaxElected: true,
        turnoverTaxEligibilityConfirmed: true,
        taxableTurnover: 700000
    }));
    assert_1.default.strictEqual((_k = elected.lines.find((row) => row.code === 'TURNOVER_TAX')) === null || _k === void 0 ? void 0 : _k.amount, 1000);
    assert_1.default.strictEqual((_l = elected.lines.find((row) => row.code === 'PERSONAL_INCOME_TAX')) === null || _l === void 0 ? void 0 : _l.status, 'NOT_APPLICABLE');
    results['ZA VAT, thresholds, provisional tax and turnover tax'] = 'PASS';
}
{
    const missing = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'EUR',
        taxJurisdiction: 'GLOBAL',
        propertyJurisdiction: 'GLOBAL',
        residencyJurisdiction: 'GLOBAL',
        globalTaxes: [{ name: 'Local income tax', category: 'PERSONAL_INCOME_TAX', method: 'PERCENT_OF_NET', rate: null }]
    })).lines[0];
    assert_1.default.strictEqual(missing.amount, null);
    assert_1.default.strictEqual(missing.verified, false);
    const gross = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'EUR',
        taxJurisdiction: 'GLOBAL',
        propertyJurisdiction: 'GLOBAL',
        residencyJurisdiction: 'GLOBAL',
        rentalIncome: 200,
        allowableExpenses: 50,
        globalTaxes: [{ name: 'Rental tax', category: 'RENTAL_INCOME_TAX', method: 'PERCENT_OF_GROSS', rate: 10 }]
    })).lines[0];
    assert_1.default.strictEqual(gross.amount, 20);
    assert_1.default.strictEqual(gross.status, 'USER_CONFIGURED');
    const net = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'EUR',
        taxJurisdiction: 'GLOBAL',
        propertyJurisdiction: 'GLOBAL',
        residencyJurisdiction: 'GLOBAL',
        rentalIncome: 200,
        allowableExpenses: 50,
        globalTaxes: [{ name: 'Income tax', category: 'PERSONAL_INCOME_TAX', method: 'PERCENT_OF_NET', rate: 10 }]
    })).lines[0];
    assert_1.default.strictEqual(net.amount, 15);
    const brackets = (0, calculate_1.calculateJurisdictionEstimate)(base({
        currency: 'EUR',
        taxJurisdiction: 'GLOBAL',
        propertyJurisdiction: 'GLOBAL',
        residencyJurisdiction: 'GLOBAL',
        rentalIncome: 1000,
        globalTaxes: [{
                name: 'Brackets',
                category: 'PERSONAL_INCOME_TAX',
                method: 'PROGRESSIVE',
                brackets: [{ upTo: 500, base: 0, above: 0, rate: 0.1 }, { upTo: null, base: 50, above: 500, rate: 0.2 }]
            }]
    })).lines[0];
    assert_1.default.strictEqual(brackets.amount, 150);
    const cross = (0, calculate_1.calculateJurisdictionEstimate)(base({
        taxJurisdiction: 'ZA',
        propertyJurisdiction: 'ZW',
        residencyJurisdiction: 'ZA',
        rentalIncome: 1000,
        propertyUseClass: 'COMMERCIAL',
        rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
        incomeTaxRegistrationDate: '2026-02-01'
    }));
    assert_1.default.strictEqual(cross.crossBorderReview, true);
    assert_1.default.strictEqual(cross.lines[0].code, 'CROSS_BORDER');
    assert_1.default.strictEqual(cross.lines.find((row) => row.code === 'PERSONAL_INCOME_TAX'), undefined);
    results['Global configuration and cross-border review'] = 'PASS';
}
{
    const converted = (0, operations_1.convertForReporting)({ amount: 100, fromCurrency: 'USD', toCurrency: 'ZAR', rate: 18, rateDate: '2026-06-01', source: 'USER_PROVIDED' });
    assert_1.default.strictEqual(converted.originalAmount, 100);
    assert_1.default.strictEqual(converted.convertedAmount, 1800);
    assert_1.default.strictEqual(converted.originalPreserved, true);
    assert_1.default.strictEqual((0, operations_1.convertForReporting)({ amount: 100, fromCurrency: 'USD', toCurrency: 'ZAR' }).convertedAmount, null);
    assert_1.default.strictEqual((0, operations_1.sumSameCurrency)([{ amount: 1, currency: 'USD' }, { amount: 2, currency: 'ZAR' }]).total, null);
    const overview = (0, operations_1.buildPropertyFinancialOverview)({
        currency: 'ZAR',
        monthlyRent: 1000,
        rentCollected: 400,
        periodStart: on('2026-06-01'),
        periodEnd: on('2026-07-01'),
        transactions: [
            { type: 'expense', category: 'Levies', amount: 100, currency: 'ZAR', date: '2026-06-10', obligationStatus: 'UNSETTLED' },
            { type: 'expense', category: 'Municipal Rates', amount: 50, currency: 'ZAR', date: '2026-06-10', obligationStatus: 'UNSETTLED' },
            { type: 'expense', category: 'Utilities', amount: 20, currency: 'USD', date: '2026-06-10', obligationStatus: 'UNSETTLED' }
        ]
    });
    assert_1.default.strictEqual(overview.outstandingRent, 600);
    assert_1.default.strictEqual(overview.outstandingLevies, 100);
    assert_1.default.strictEqual(overview.municipalCharges, 50);
    assert_1.default.strictEqual(overview.utilities, 0);
    assert_1.default.strictEqual(overview.totalOutstandingBills, 150);
    assert_1.default.strictEqual(overview.mixedCurrency, true);
    assert_1.default.strictEqual(overview.netOperatingIncome, 250);
    results['Currency separation and property financial overview'] = 'PASS';
}
{
    assert_1.default.strictEqual((0, operations_1.settlementForEntry)('Levies', 'unpaid'), 'UNSETTLED');
    assert_1.default.strictEqual((0, operations_1.settlementForEntry)('Repairs', 'unpaid'), 'NOT_AN_OBLIGATION');
    assert_1.default.strictEqual((0, operations_1.sameObligation)({
        propertyId: 'p', category: 'LEVIES', amount: 10, date: '2026-06-01', reference: 'A', settlementStatus: 'UNSETTLED'
    }, { propertyId: 'p', category: 'LEVIES', amount: 10, date: '2026-06-01', reference: 'A' }), true);
    assert_1.default.strictEqual((0, operations_1.sameObligation)({
        propertyId: 'p', category: 'LEVIES', amount: 10, date: '2026-06-01', reference: 'A', settlementStatus: 'SETTLED'
    }, { propertyId: 'p', category: 'LEVIES', amount: 10, date: '2026-06-01', reference: 'A' }), false);
    assert_1.default.strictEqual((0, operations_1.deriveExpenseTaxMetadata)('Repairs').deductibility, 'DEDUCTIBLE');
    assert_1.default.strictEqual((0, operations_1.deriveExpenseTaxMetadata)('Other').deductibility, 'ACCOUNTANT_REVIEW');
    assert_1.default.strictEqual((0, operations_1.individualChannelDecision)({ RENT_PAID: { email: false, inApp: true } }, 'RENT_PAYMENT_RECEIVED', 'EMAIL'), 'skip');
    assert_1.default.strictEqual((0, operations_1.individualChannelDecision)({ RENT_PAID: { email: false, inApp: true } }, 'RENT_PAYMENT_RECEIVED', 'IN_APP'), 'send');
    assert_1.default.strictEqual((0, operations_1.individualChannelDecision)(undefined, 'RENT_PAYMENT_RECEIVED', 'EMAIL'), 'inherit');
    results['Bills, expenses and notification preferences'] = 'PASS';
}
{
    const profile = fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/individualTaxProfileService.ts'), 'utf8');
    const registry = fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/taxRuleRegistry.ts'), 'utf8');
    assert_1.default.ok(profile.includes('historicalSnapshotsPreserved: true'));
    assert_1.default.ok(!profile.includes('TransactionTaxSnapshot.update'));
    assert_1.default.ok(registry.includes('ZW_AIDS_LEVY'));
    assert_1.default.ok(registry.includes('ZA_INDIVIDUAL_BRACKETS_2027'));
    assert_1.default.ok((0, taxRuleRegistry_1.systemTaxRuleSeeds)().some((row) => { var _a; return row.ruleCode === 'ZW_INCOME_TAX_TRADE_INVESTMENT_2024' && ((_a = row.notes) === null || _a === void 0 ? void 0 : _a.includes('AIDS levy is NOT included')); }));
    assert_1.default.ok((0, taxRuleRegistry_1.systemTaxRuleSeeds)().some((row) => row.ruleCode === 'ZA_VAT_COMPULSORY_THRESHOLD' && row.version === 2 && row.rate === 2300000));
    const sidebar = fs_1.default.readFileSync(path_1.default.join(__dirname, '../../../client/src/pages/IndividualDashboard/constants.ts'), 'utf8');
    assert_1.default.ok(sidebar.includes('My Properties'));
    assert_1.default.ok(sidebar.includes('Tax Compliance'));
    assert_1.default.ok(!sidebar.includes("text: 'Accounting'"));
    results['Historical snapshots, rule seeds and individual navigation'] = 'PASS';
}
console.log(JSON.stringify(results, null, 2));
if (Object.values(results).some((value) => value !== 'PASS')) {
    throw new Error('Individual jurisdiction tests failed');
}
console.log('Individual jurisdiction tests: ALL PASS');
