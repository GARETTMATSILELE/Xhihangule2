"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const taxPosition_1 = require("../services/tax/taxPosition");
const failures = [];
const check = (condition, message) => {
    if (!condition)
        failures.push(message);
};
const baseObligation = {
    id: 'obl-1',
    taxType: 'VAT_ON_COMMISSION',
    propertyId: 'prop-a',
    propertyName: 'Unit 7',
    paymentId: 'pay-1',
    taxPeriod: '2026-10',
    taxAmount: 41.85,
    status: 'PAYABLE',
    transactionDate: new Date('2026-10-13T00:00:00.000Z')
};
const position = (0, taxPosition_1.buildTaxPosition)({
    obligations: [
        baseObligation,
        Object.assign(Object.assign({}, baseObligation), { id: 'obl-2', paymentId: 'pay-2', propertyId: 'prop-b', propertyName: 'Unit 31', taxAmount: 87.3 }),
        Object.assign(Object.assign({}, baseObligation), { id: 'obl-rev', paymentId: 'pay-3', taxAmount: 41.85, status: 'REVERSED' }),
        Object.assign(Object.assign({}, baseObligation), { id: 'obl-rev-mirror', paymentId: 'pay-3', taxAmount: 41.85, status: 'REVERSED', reversalOf: 'obl-rev' })
    ],
    payments: [
        {
            id: 'zimra-1',
            status: 'POSTED',
            amount: 20,
            paymentDate: new Date('2026-10-20T00:00:00.000Z'),
            allocations: [{ taxObligationId: 'obl-1', amount: 20, taxType: 'VAT_ON_COMMISSION' }]
        }
    ],
    legacyRecords: [
        { id: 'legacy-1', taxType: 'VAT_ON_COMMISSION', propertyId: 'prop-c', propertyName: '34 Mantis Close', amount: 1476.19 }
    ],
    glBalances: [{ code: '2101', balance: 0 }]
});
const commission = position.accounts.find((account) => account.taxType === 'VAT_ON_COMMISSION');
check(Boolean(commission), 'VAT on commission account is present');
check((commission === null || commission === void 0 ? void 0 : commission.recognised) === 129.15, `recognised ${commission === null || commission === void 0 ? void 0 : commission.recognised}`);
check((commission === null || commission === void 0 ? void 0 : commission.paid) === 20, `paid ${commission === null || commission === void 0 ? void 0 : commission.paid}`);
check((commission === null || commission === void 0 ? void 0 : commission.outstanding) === 109.15, `outstanding ${commission === null || commission === void 0 ? void 0 : commission.outstanding}`);
check((commission === null || commission === void 0 ? void 0 : commission.reversed) === 41.85, `reversed original kept out of payable, reversed ${commission === null || commission === void 0 ? void 0 : commission.reversed}`);
check(((commission === null || commission === void 0 ? void 0 : commission.properties.length) || 0) === 3, 'two live properties plus the legacy-only property');
const companyOutstanding = (commission === null || commission === void 0 ? void 0 : commission.outstanding) || 0;
const propertyOutstanding = ((commission === null || commission === void 0 ? void 0 : commission.properties) || []).reduce((sum, row) => sum + row.outstanding, 0);
check(Number(companyOutstanding.toFixed(2)) === Number(propertyOutstanding.toFixed(2)), 'company outstanding equals the sum of property outstanding');
const retry = (0, taxPosition_1.buildTaxPosition)({
    obligations: [baseObligation, Object.assign(Object.assign({}, baseObligation), { id: 'obl-dup' })],
    payments: []
});
check(retry.discrepancies.some((item) => item.kind === 'DUPLICATE_OBLIGATION'), 'same payment and tax type twice is a duplicate');
check(retry.accounts[0].recognised === 83.7, 'duplicate rows stay visible and are flagged rather than deleted');
const over = (0, taxPosition_1.buildTaxPosition)({
    obligations: [baseObligation],
    payments: [{
            id: 'zimra-over',
            status: 'POSTED',
            amount: 10,
            allocations: [
                { taxObligationId: 'obl-1', amount: 10 },
                { taxObligationId: 'obl-1', amount: 10 }
            ]
        }]
});
check(over.accounts[0].paid === 10, 'a payment is not applied twice past its amount');
check(over.discrepancies.some((item) => item.kind === 'PAYMENT_OVER_ALLOCATED'), 'over-allocation is reported');
const later = (0, taxPosition_1.buildTaxPosition)({
    asOf: new Date('2026-09-30T00:00:00.000Z'),
    obligations: [baseObligation],
    payments: []
});
check((((_a = later.accounts.find((account) => account.taxType === 'VAT_ON_COMMISSION')) === null || _a === void 0 ? void 0 : _a.recognised) || 0) === 0, 'cutoff excludes a later tax point');
check(!(0, taxPosition_1.isActiveObligation)(Object.assign(Object.assign({}, baseObligation), { status: 'REVERSED' })), 'reversed original is not active');
check(!(0, taxPosition_1.isActiveObligation)(Object.assign(Object.assign({}, baseObligation), { reversalOf: 'obl-rev' })), 'reversal mirror is not active');
check(position.discrepancies.some((item) => item.kind === 'LEGACY_TRUST_RECORD_WITHOUT_OBLIGATION'), 'legacy trust book difference is explicit');
check(position.discrepancies.some((item) => item.kind === 'GL_MISMATCH'), 'GL difference is explicit and not adjusted');
check(position.status !== 'RECONCILED', 'unreconciled history is not reported as clean');
const cgt = (0, taxPosition_1.buildTaxPosition)({
    obligations: [Object.assign(Object.assign({}, baseObligation), { id: 'cgt-1', taxType: 'CAPITAL_GAINS_TAX', taxAmount: 100, paymentId: 'sale-1' })],
    payments: [],
    glBalances: [{ code: '2105', balance: 100 }, { code: '2101', balance: 0 }]
});
check(cgt.accounts.some((account) => account.taxType === 'CAPITAL_GAINS_TAX' && account.outstanding === 100), 'CGT stays on its own account');
check(!cgt.accounts.some((account) => account.taxType === 'VAT_ON_COMMISSION'), 'CGT is not mixed into VAT on commission');
const matchedGl = (0, taxPosition_1.buildTaxPosition)({
    obligations: [baseObligation],
    payments: [],
    glBalances: [{ code: '2101', balance: -41.85 }, { code: '2105', balance: 0 }]
});
check(!matchedGl.discrepancies.some((item) => item.kind === 'GL_MISMATCH'), 'a debit-minus-credit chart balance of -41.85 matches an outstanding VAT liability of 41.85');
if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
}
console.log('Tax position tests passed.');
