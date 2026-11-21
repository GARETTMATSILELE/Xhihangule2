"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const taxPosition_1 = require("../services/tax/taxPosition");
const taxDashboard_1 = require("../services/tax/taxDashboard");
const failures = [];
const check = (condition, message) => {
    if (!condition)
        failures.push(message);
};
const vat = {
    id: 'obl-vat',
    taxType: 'VAT_ON_COMMISSION',
    propertyId: 'prop-a',
    propertyName: 'Borrowdale Residence',
    paymentId: 'pay-1',
    taxPeriod: '2026-10',
    taxAmount: 100,
    status: 'PAYABLE',
    transactionDate: new Date('2026-10-13T00:00:00.000Z')
};
const position = (0, taxPosition_1.buildTaxPosition)({
    obligations: [
        vat,
        Object.assign(Object.assign({}, vat), { id: 'obl-vat-2', paymentId: 'pay-2', propertyId: 'prop-b', propertyName: 'Avondale Cottage', taxAmount: 40, taxPeriod: '2026-11' }),
        Object.assign(Object.assign({}, vat), { id: 'obl-cgt', taxType: 'CAPITAL_GAINS_TAX', paymentId: 'pay-3', taxAmount: 25, taxPeriod: '2026-10' }),
        Object.assign(Object.assign({}, vat), { id: 'obl-cgwt', taxType: 'CAPITAL_GAINS_WITHHOLDING_TAX', paymentId: 'pay-4', taxAmount: 15, taxPeriod: '2026-10' }),
        Object.assign(Object.assign({}, vat), { id: 'obl-wh', taxType: 'VAT_WITHHOLDING', paymentId: 'pay-5', taxAmount: 8, taxPeriod: '2026-10' }),
        Object.assign(Object.assign({}, vat), { id: 'obl-out', taxType: 'VAT_OUTPUT', paymentId: 'pay-6', taxAmount: 12, taxPeriod: '2026-10' }),
        Object.assign(Object.assign({}, vat), { id: 'obl-rev', paymentId: 'pay-7', taxAmount: 41.85, status: 'REVERSED' }),
        Object.assign(Object.assign({}, vat), { id: 'obl-rev-mirror', paymentId: 'pay-7', taxAmount: 41.85, status: 'REVERSED', reversalOf: 'obl-rev' })
    ],
    payments: [
        {
            id: 'zimra-1',
            status: 'POSTED',
            amount: 70,
            unallocatedAmount: 20,
            paymentDate: new Date('2026-10-20T00:00:00.000Z'),
            allocations: [{ taxObligationId: 'obl-vat', amount: 30, taxType: 'VAT_ON_COMMISSION' }]
        },
        {
            id: 'zimra-draft',
            status: 'DRAFT',
            amount: 100,
            allocations: [{ taxObligationId: 'obl-vat', amount: 100, taxType: 'VAT_ON_COMMISSION' }]
        }
    ]
});
const dashboard = (0, taxDashboard_1.buildTaxDashboard)(position);
const category = (key) => dashboard.categories.find((row) => row.key === key);
check(dashboard.recognised === 200, `recognised stays on active obligations (${dashboard.recognised})`);
check(dashboard.paid === 30, `paid uses posted allocations only (${dashboard.paid})`);
check(dashboard.outstanding === 170, `outstanding excludes reversed and unallocated cash (${dashboard.outstanding})`);
check(dashboard.unallocatedPayments === 20, 'unallocated ZIMRA cash stays outside paid tax');
check(dashboard.paid + dashboard.outstanding === dashboard.recognised, 'paid plus outstanding equals recognised for unsettled active rows');
check(((_a = category('VAT_ON_COMMISSION')) === null || _a === void 0 ? void 0 : _a.recognised) === 140, 'VAT on commission is not merged with output VAT');
check(((_b = category('CGT')) === null || _b === void 0 ? void 0 : _b.recognised) === 25, 'CGT stays in its own category');
check(((_c = category('CGWT')) === null || _c === void 0 ? void 0 : _c.recognised) === 15, 'CGWT stays in its own category');
check(((_d = category('OTHER_WITHHOLDING')) === null || _d === void 0 ? void 0 : _d.recognised) === 8, 'other withholding is separate from CGT and CGWT');
check(((_e = category('OTHER')) === null || _e === void 0 ? void 0 : _e.recognised) === 12, 'output VAT stays in other tax obligations');
check(Number(dashboard.categories.reduce((sum, row) => sum + row.recognised, 0).toFixed(2)) === dashboard.recognised, 'category recognised totals equal the tax position');
check(Number(dashboard.categories.reduce((sum, row) => sum + row.outstanding, 0).toFixed(2)) === dashboard.outstanding, 'category outstanding totals equal the tax position');
check(!dashboard.chart.some((row) => row.key === 'CGT' && row.recognised === 0), 'chart uses recognised amounts only');
check(dashboard.chart.reduce((sum, row) => sum + row.recognised, 0) === dashboard.recognised, 'chart total equals recognised tax');
const propertyOutstanding = position.accounts.reduce((sum, account) => sum + account.properties.reduce((inner, row) => inner + row.outstanding, 0), 0);
check(Number(propertyOutstanding.toFixed(2)) === dashboard.outstanding, 'dashboard outstanding agrees with property ledgers');
const propertyRecognised = position.accounts.reduce((sum, account) => sum + account.properties.reduce((inner, row) => inner + row.recognised, 0), 0);
check(Number(propertyRecognised.toFixed(2)) === dashboard.recognised, 'dashboard recognised agrees with property ledgers');
check(dashboard.fundsHeld.status === 'NOT_RECONCILED', 'canonical outstanding is not treated as cash held');
check(dashboard.fundsHeld.amount == null, 'unreconciled funds are not given an invented amount');
check(dashboard.fundsHeld.amount !== dashboard.outstanding, 'funds held are not outstanding tax');
const held = (0, taxPosition_1.buildTaxPosition)({
    obligations: [Object.assign(Object.assign({}, vat), { id: 'obl-held', taxType: 'CAPITAL_GAINS_WITHHOLDING_TAX', taxAmount: 100 })],
    payments: [],
    legacyRecords: [{ id: 'trust-1', taxType: 'CGWT', propertyId: 'prop-a', propertyName: 'Borrowdale Residence', amount: 100 }]
});
const heldDash = (0, taxDashboard_1.buildTaxDashboard)(held);
check(((_f = heldDash.categories.find((row) => row.key === 'CGWT')) === null || _f === void 0 ? void 0 : _f.fundsHeld.amount) === 100, 'reconciled trust book is the held balance');
check(heldDash.fundsHeld.amount === 100, 'company held balance sums only reconciled categories');
check(((_g = heldDash.categories.find((row) => row.key === 'CGT')) === null || _g === void 0 ? void 0 : _g.recognised) === 0, 'a CGWT trust book does not create CGT');
const historical = (0, taxPosition_1.buildTaxPosition)({
    obligations: [],
    payments: [],
    legacyRecords: [{ id: 'old-cgt', taxType: 'CGT', propertyId: 'prop-z', propertyName: 'Historical Plot', amount: 5000 }]
});
const historicalDash = (0, taxDashboard_1.buildTaxDashboard)(historical);
check(historicalDash.outstanding === 0, 'historical CGT is not an active liability');
check(historicalDash.recognised === 0, 'historical CGT is not recognised tax');
check(((_h = historicalDash.categories.find((row) => row.key === 'CGT')) === null || _h === void 0 ? void 0 : _h.fundsHeld.status) === 'NOT_RECONCILED', 'historical CGT is not shown as cash held');
check(!historicalDash.chart.some((row) => row.key === 'CGT'), 'historical CGT is absent from the recognised chart');
const mismatched = (0, taxPosition_1.buildTaxPosition)({
    obligations: [Object.assign(Object.assign({}, vat), { id: 'obl-mis', taxAmount: 60 })],
    payments: [],
    legacyRecords: [{ id: 'trust-mis', taxType: 'VAT_ON_COMMISSION', propertyId: 'prop-a', propertyName: 'Borrowdale Residence', amount: 10 }]
});
const mismatchedDash = (0, taxDashboard_1.buildTaxDashboard)(mismatched);
check(mismatchedDash.fundsHeld.status === 'NOT_RECONCILED', 'a trust mismatch is not presented as cash');
check(mismatchedDash.fundsHeld.amount !== 50 && mismatchedDash.fundsHeld.amount !== 60, 'funds held are not recognised minus paid');
const before = JSON.stringify(position);
const october = (0, taxDashboard_1.buildTaxDashboard)(position, { taxPeriod: '2026-10' });
check(JSON.stringify(position) === before, 'a tax period filter does not change the tax position');
check(october.recognised === 160, `October recognised excludes November VAT (${october.recognised})`);
check(october.paid === 30, 'October paid keeps the posted allocation');
check(october.fundsHeld.status === 'NOT_RECONCILED', 'a tax period cannot invent a split of trust cash');
check(((_j = position.accounts.find((account) => account.taxType === 'VAT_ON_COMMISSION')) === null || _j === void 0 ? void 0 : _j.recognised) === 140, 'the ledger total remains after the period filter');
const property = (0, taxDashboard_1.presentObligationProperty)({
    propertyId: 'prop-a',
    propertyName: 'Borrowdale Residence',
    propertyAddress: '12 Example Road, Borrowdale, Harare'
});
check(property.propertyAvailable && property.propertyLabel === 'Borrowdale Residence', 'VAT obligation keeps the property name');
check(property.propertyAddress === '12 Example Road, Borrowdale, Harare', 'VAT obligation keeps the property address');
const missing = (0, taxDashboard_1.presentObligationProperty)({ propertyId: null, propertyName: null, propertyAddress: null });
check(!missing.propertyAvailable && missing.propertyLabel === 'Property information unavailable', 'a missing property is not guessed');
const addressOnly = (0, taxDashboard_1.presentObligationProperty)({ propertyId: 'prop-a', propertyName: '', propertyAddress: '12 Example Road, Borrowdale, Harare' });
check(addressOnly.propertyAvailable && addressOnly.propertyAddress === '12 Example Road, Borrowdale, Harare', 'a property address is kept when the name is blank');
check((0, taxDashboard_1.resolveLinkedPropertyId)({ obligationPropertyId: 'prop-own', paymentPropertyId: 'prop-pay' }) === 'prop-own', 'the obligation property stays ahead of the payment property');
check((0, taxDashboard_1.resolveLinkedPropertyId)({ obligationPropertyId: null, paymentPropertyId: 'prop-pay' }) === 'prop-pay', 'VAT uses the source payment property when the obligation has none');
check((0, taxDashboard_1.formatPropertyAddress)({ street: '12 Example Road', suburb: 'Borrowdale', city: 'Harare' }) === '12 Example Road, Borrowdale, Harare', 'a structured address is shown as one line');
const addressed = (0, taxPosition_1.buildTaxPosition)({
    obligations: [Object.assign(Object.assign({}, vat), { propertyAddress: '12 Example Road, Borrowdale, Harare' })],
    payments: []
});
check(((_l = (_k = addressed.accounts.find((account) => account.taxType === 'VAT_ON_COMMISSION')) === null || _k === void 0 ? void 0 : _k.properties[0]) === null || _l === void 0 ? void 0 : _l.propertyAddress) === '12 Example Road, Borrowdale, Harare', 'VAT on commission carries the property address into the ledger');
const reversed = (0, taxDashboard_1.presentObligationAmounts)({
    taxType: 'VAT_ON_COMMISSION',
    taxAmount: 41.85,
    status: 'REVERSED',
    allocatedPaid: 41.85
});
check(reversed.outstanding === 0 && reversed.amountPaid === 0, 'reversed rows do not remain payable');
const payment = (0, taxDashboard_1.summariseTaxPayment)({
    status: 'POSTED',
    amount: 70,
    unallocatedAmount: 20,
    allocations: [{ amount: 30, taxType: 'VAT_ON_COMMISSION' }, { amount: 20, taxType: 'CAPITAL_GAINS_TAX' }]
});
check(payment.confirmedPaidAmount === 50, 'confirmed paid tax is the allocated amount');
check(payment.unallocatedAmount === 20, 'unallocated cash stays unallocated');
check(payment.categories.includes('VAT on Agency Commission') && payment.categories.includes('Capital Gains Tax (CGT)'), 'payment categories stay separate');
check((0, taxDashboard_1.summariseTaxPayment)({ status: 'DRAFT', amount: 80, allocations: [{ amount: 80, taxType: 'VAT_ON_COMMISSION' }] }).confirmedPaidAmount === 0, 'a draft or receipt-only record is not paid tax');
check((0, taxDashboard_1.categoryForTaxType)('CAPITAL_GAINS_TAX').key !== (0, taxDashboard_1.categoryForTaxType)('CAPITAL_GAINS_WITHHOLDING_TAX').key, 'CGT and CGWT are different categories');
check((0, taxDashboard_1.resolveComplianceIndicator)({ status: 'RECONCILED' }).indicator === 'COMPLIANT', 'a clear position can be compliant');
check((0, taxDashboard_1.resolveComplianceIndicator)({ status: 'RECONCILED' }, { trustStatus: 'RECONCILIATION_EXCEPTION' }).indicator === 'RECONCILIATION_REQUIRED', 'a trust exception is not labelled compliant');
check((0, taxDashboard_1.resolveComplianceIndicator)({ status: 'RECONCILED' }, { openReviews: 2, vatRateReview: true }).indicator !== 'COMPLIANT', 'open reviews and missing rates block a compliant label');
check((0, taxDashboard_1.resolveComplianceIndicator)({ status: 'HISTORICAL_REVIEW_REQUIRED' }).indicator === 'ATTENTION_REQUIRED', 'historical review is attention, not a fabricated compliant state');
check((0, taxDashboard_1.resolveComplianceIndicator)({ status: 'RECONCILIATION_REQUIRED' }).indicator === 'RECONCILIATION_REQUIRED', 'blocking reconciliation stays reconciliation required');
const read = fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../services/tax/taxDashboard.ts'), 'utf8');
const reader = fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../services/tax/taxDashboardRead.ts'), 'utf8');
const controller = fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../controllers/taxComplianceController.ts'), 'utf8');
const positionStart = controller.indexOf('export const getTaxPosition');
const positionFn = controller.slice(positionStart, controller.indexOf('export const listTaxObligations'));
const listStart = controller.indexOf('export const listTaxObligations');
const listFn = controller.slice(listStart, controller.indexOf('export const getTaxReconciliation'));
const helperStart = controller.indexOf('async function loadLinkedProperties');
const helperFn = controller.slice(helperStart, controller.indexOf('const asyncHandler'));
check(!read.includes('.save(') && !read.includes('JournalEntry') && !read.includes('.create('), 'dashboard aggregation does not write accounting records');
check(!reader.includes('.save(') && !reader.includes('TaxObligation.create') && !reader.includes('new JournalEntry'), 'dashboard loading does not post journals');
check(positionFn.includes('loadTaxPositionResponse'), 'tax position response includes the dashboard projection');
check(!positionFn.includes('.save(') && !positionFn.includes('TaxObligation.create'), 'reporting cutoff handling does not write obligations');
check(listFn.includes('loadLinkedProperties') && helperFn.includes('presentObligationProperty') && helperFn.includes("select('name address')") && helperFn.includes('resolveLinkedPropertyId'), 'obligation property name and address are read from the property record');
check(!listFn.includes('.save('), 'listing obligations does not update them');
const ui = fs_1.default.readFileSync(path_1.default.resolve(__dirname, '../../../client/src/pages/AccountantDashboard/TaxCompliancePage.tsx'), 'utf8');
for (const snippet of [
    'Total Tax Recognised',
    'Tax Paid to ZIMRA',
    'Tax Outstanding',
    'Tax Funds Held',
    'Not reconciled',
    'Property information unavailable',
    'Capital Gains Withholding Tax',
    'VAT RATE REVIEW REQUIRED',
    'Controls passed',
    'Attention required',
    'TRUST RECONCILIATION SCOPE',
    'BALANCED WITHIN SCOPE',
    'RECONCILIATION EXCEPTION',
    'not a full trust-account reconciliation',
    'Owner rental funds (2103)',
    'Seller proceeds (2104)',
    'Tax withheld (2105)',
    'Tenant deposits (2106)',
    'Levies (2107)',
    'Buyer deposits held only in sales subledgers',
    'Maintenance funds',
    'Unallocated receipts',
    'Other refundable balances',
    'Per-owner historical rental subledgers',
    'External lawyer/escrow/developer custody',
    'NO LIVE VAT OBLIGATIONS',
    'No live Capital Gains Tax obligation',
    'Record ZIMRA payment',
    'does not file returns with ZIMRA',
    '<TaxAccountsPage position={taxPosition}'
]) {
    check(ui.includes(snippet), `tax page keeps ${snippet}`);
}
check(!ui.includes('FULL TRUST ACCOUNT RECONCILIATION'), 'partial trust scope is not described as a full reconciliation');
check(!ui.includes('TaxPositionPanel'), 'the standalone tax-position account list is not rendered again');
assert_1.default.strictEqual(failures.length, 0, failures.join('\n'));
console.log('Tax dashboard tests passed.');
