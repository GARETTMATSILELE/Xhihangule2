"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const newTaxIntegrity_1 = require("../services/tax/newTaxIntegrity");
const taxPosition_1 = require("../services/tax/taxPosition");
const goLivePayment = {
    id: 'pay-new',
    kind: 'rental',
    status: 'completed',
    amount: 1900,
    paymentDate: '2026-10-13T10:07:58.777Z',
    vatOnCommission: 41.85,
    outputVat: 0,
    taxRate: 0.155,
    propertyId: 'unit-7'
};
const obligation = {
    id: 'obl-new',
    paymentId: 'pay-new',
    taxType: 'VAT_ON_COMMISSION',
    taxAmount: 41.85,
    status: 'PAYABLE',
    createdAt: '2026-10-13T10:08:37.111Z',
    taxPeriod: '2026-10',
    taxRate: 0.155,
    propertyId: 'unit-7'
};
const legacy = (0, newTaxIntegrity_1.assessNewTaxIntegrity)({
    sources: [
        goLivePayment,
        {
            id: 'pay-sept',
            kind: 'rental',
            status: 'completed',
            amount: 2000,
            paymentDate: '2026-09-14T13:20:30.391Z',
            vatOnCommission: 41.85,
            outputVat: 0,
            taxRate: 0.155,
            propertyId: 'unit-242'
        },
        {
            id: 'sale-old',
            kind: 'sale',
            status: 'completed',
            amount: 190000,
            paymentDate: '2026-02-23T00:00:00.000Z',
            vatOnCommission: 1274.89,
            outputVat: 25497.84,
            propertyId: 'chimes'
        }
    ],
    obligations: [obligation],
    gl: [
        { sourceId: 'pay-new', debit: 0, credit: 41.85 },
        { sourceId: 'pay-sept', debit: 0, credit: 41.85 },
        { sourceId: 'sale-old', debit: 0, credit: 26772.73 }
    ]
});
assert_1.default.strictEqual(legacy.status, 'RECONCILED');
assert_1.default.strictEqual(legacy.activeOutstanding, 41.85);
assert_1.default.strictEqual(legacy.newGlCreditNormal, 41.85);
assert_1.default.strictEqual(legacy.glDifference, 0);
assert_1.default.ok(legacy.legacyFindings.some((item) => item.sourceId === 'pay-sept'));
assert_1.default.ok(legacy.legacyFindings.some((item) => item.sourceId === 'sale-old'));
assert_1.default.ok(!legacy.findings.some((item) => item.code === 'MISSING_OBLIGATION'));
const position = (0, taxPosition_1.buildTaxPosition)({
    obligations: [{
            id: 'obl-new',
            taxType: 'VAT_ON_COMMISSION',
            propertyId: 'unit-7',
            propertyName: 'Unit 7',
            paymentId: 'pay-new',
            taxPeriod: '2026-10',
            taxAmount: 41.85,
            status: 'PAYABLE',
            transactionDate: '2026-10-13T10:07:58.777Z'
        }],
    payments: [{
            id: 'zimra',
            status: 'POSTED',
            amount: 20,
            paymentDate: '2026-10-20T00:00:00.000Z',
            allocations: [{ taxObligationId: 'obl-new', amount: 20, taxType: 'VAT_ON_COMMISSION' }]
        }],
    legacyRecords: [{ id: 'trust', taxType: 'VAT', propertyId: 'chimes', propertyName: 'Chimes', amount: 25497.84 }],
    glBalances: [{ code: '2101', balance: -41.85 }]
});
const commission = position.accounts.find((account) => account.taxType === 'VAT_ON_COMMISSION');
assert_1.default.strictEqual(commission === null || commission === void 0 ? void 0 : commission.outstanding, 21.85);
assert_1.default.ok(position.discrepancies.some((item) => item.kind === 'LEGACY_TRUST_RECORD_WITHOUT_OBLIGATION'));
assert_1.default.strictEqual(legacy.status, 'RECONCILED', 'legacy trust and pre-go-live journals do not fail the new period');
const missing = (0, newTaxIntegrity_1.assessNewTaxIntegrity)({
    sources: [
        goLivePayment,
        Object.assign(Object.assign({}, goLivePayment), { id: 'pay-gap', paymentDate: '2026-10-22T13:36:11.477Z', vatOnCommission: 41.85 })
    ],
    obligations: [obligation],
    gl: [
        { sourceId: 'pay-new', debit: 0, credit: 41.85 },
        { sourceId: 'pay-gap', debit: 0, credit: 41.85 }
    ]
});
assert_1.default.strictEqual(missing.status, 'RECONCILIATION_REQUIRED');
assert_1.default.ok(missing.findings.some((item) => item.code === 'MISSING_OBLIGATION' && item.sourceId === 'pay-gap'));
const reversed = (0, newTaxIntegrity_1.assessNewTaxIntegrity)({
    sources: [Object.assign(Object.assign({}, goLivePayment), { id: 'pay-rev', status: 'completed' })],
    obligations: [
        Object.assign(Object.assign({}, obligation), { id: 'obl-rev', paymentId: 'pay-rev', status: 'REVERSED' }),
        Object.assign(Object.assign({}, obligation), { id: 'obl-mirror', paymentId: 'pay-rev', status: 'REVERSED', reversalOf: 'obl-rev' })
    ],
    gl: [
        { sourceId: 'pay-rev', debit: 0, credit: 41.85 },
        { sourceId: 'pay-rev:reversal', debit: 41.85, credit: 0 }
    ]
});
assert_1.default.strictEqual(reversed.status, 'RECONCILED');
assert_1.default.strictEqual(reversed.activeOutstanding, 0);
assert_1.default.strictEqual(reversed.newGlCreditNormal, 0);
const duplicate = (0, newTaxIntegrity_1.assessNewTaxIntegrity)({
    sources: [goLivePayment],
    obligations: [obligation, Object.assign(Object.assign({}, obligation), { id: 'obl-dup' })],
    gl: [{ sourceId: 'pay-new', debit: 0, credit: 41.85 }]
});
assert_1.default.ok(duplicate.findings.some((item) => item.code === 'DUPLICATE_OBLIGATION'));
assert_1.default.notStrictEqual(duplicate.status, 'RECONCILED');
const isolated = (0, newTaxIntegrity_1.assessNewTaxIntegrity)({
    sources: [goLivePayment],
    obligations: [obligation],
    gl: [{ sourceId: 'pay-new', debit: 0, credit: 41.85 }]
});
assert_1.default.strictEqual(isolated.eligibleSources, 1);
assert_1.default.ok(!isolated.findings.some((item) => item.sourceId === 'other-company'));
console.log('New tax integrity tests passed.');
