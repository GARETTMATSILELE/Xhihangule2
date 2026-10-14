"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const money_1 = require("../utils/money");
const read = (relativePath) => fs_1.default.readFileSync(path_1.default.join(path_1.default.resolve(__dirname, '../../..'), relativePath), 'utf8');
const vatSeeds = (0, taxRuleRegistry_1.systemTaxRuleSeeds)().filter((row) => row.taxType === 'VAT');
const before = vatSeeds.find((row) => row.version === 1);
const current = vatSeeds.find((row) => row.version === 2);
assert_1.default.ok(before && current);
assert_1.default.strictEqual(before.jurisdiction, 'ZW');
assert_1.default.strictEqual(before.rate, 15);
assert_1.default.strictEqual(current.rate, 15.5);
assert_1.default.strictEqual((0, taxRuleRegistry_1.isRuleEffectiveOn)(before, new Date('2025-12-31T00:00:00.000Z')), true);
assert_1.default.strictEqual((0, taxRuleRegistry_1.isRuleEffectiveOn)(current, new Date('2025-12-31T00:00:00.000Z')), false);
assert_1.default.strictEqual((0, taxRuleRegistry_1.isRuleEffectiveOn)(current, new Date('2026-01-01T00:00:00.000Z')), true);
assert_1.default.strictEqual((0, taxRuleRegistry_1.isRuleEffectiveOn)(before, new Date('2026-01-01T00:00:00.000Z')), false);
assert_1.default.strictEqual((0, taxRuleRegistry_1.isRuleEffectiveOn)({
    effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
    effectiveTo: null,
    status: 'ACTIVE'
}, new Date('2026-10-13T00:00:00.000Z')), false);
const existingRates = [
    { version: 1, rate: 15, effectiveFrom: new Date('1970-01-01T00:00:00.000Z'), effectiveTo: new Date('2025-12-31T00:00:00.000Z'), status: 'ACTIVE' },
    { version: 2, rate: 15.5, effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: null, status: 'ACTIVE' }
];
assert_1.default.throws(() => (0, taxRuleRegistry_1.planStandardVatRateChange)(existingRates, { rate: 16, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }), /cannot be overwritten/);
const planned = (0, taxRuleRegistry_1.planStandardVatRateChange)(existingRates, { rate: 16, effectiveFrom: new Date('2027-01-01T00:00:00.000Z') });
assert_1.default.strictEqual(planned.nextVersion, 3);
assert_1.default.strictEqual(planned.closures.length, 1);
assert_1.default.strictEqual(planned.closures[0].version, 2);
assert_1.default.strictEqual(planned.closures[0].rate, 15.5);
assert_1.default.strictEqual(planned.closures[0].effectiveTo.toISOString().slice(0, 10), '2026-12-31');
assert_1.default.throws(() => (0, taxRuleRegistry_1.planStandardVatRateChange)([], { rate: 0, effectiveFrom: new Date('2027-01-01T00:00:00.000Z') }), /greater than 0/);
assert_1.default.strictEqual((0, taxRuleRegistry_1.jurisdictionCodeFromCountry)('Zimbabwe'), 'ZW');
assert_1.default.strictEqual((0, taxRuleRegistry_1.jurisdictionCodeFromCountry)(''), 'ZW');
assert_1.default.strictEqual((0, taxRuleRegistry_1.jurisdictionCodeFromCountry)('South Africa'), '');
const paymentController = read('server/src/controllers/paymentController.ts');
const companyController = read('server/src/controllers/companyController.ts');
const taxRateController = read('server/src/controllers/taxRateController.ts');
const settingsPage = read('client/src/pages/AccountantDashboard/SettingsPage.tsx');
const salesForm = read('client/src/components/payments/SalesPaymentForm.tsx');
const propertyForm = read('client/src/components/properties/PropertyForm.tsx');
const posting = read('server/src/services/paymentAccountingReconciliation.ts');
assert_1.default.ok(taxRateController.includes('VAT_RATE_CENTRALLY_MANAGED'));
assert_1.default.ok(taxRateController.includes('requireSystemAdmin'));
assert_1.default.ok(companyController.includes('delete nextCommission.vatPercentOnCommission'));
assert_1.default.strictEqual(settingsPage.includes('New VAT rate'), false);
assert_1.default.strictEqual(settingsPage.includes('vatPercentOnCommission: Number'), false);
assert_1.default.strictEqual(salesForm.includes('0.155'), false);
assert_1.default.strictEqual(salesForm.includes('vatOnCommissionRate'), false);
assert_1.default.ok(propertyForm.includes('centrally managed by Mantis'));
assert_1.default.ok(propertyForm.includes('vatOnCommission'));
assert_1.default.ok(posting.includes('idempotencyKey: `payment:${paymentId}`'));
const invoiceController = read('server/src/controllers/invoiceController.ts');
const writtenInvoices = read('client/src/pages/AccountantDashboard/WrittenInvoicesPage.tsx');
assert_1.default.ok(invoiceController.includes('getVatRateForDate'));
assert_1.default.strictEqual(invoiceController.includes('taxPercentage = 15'), false);
assert_1.default.ok(invoiceController.includes('item?.taxable === false'));
assert_1.default.strictEqual(writtenInvoices.includes('label="Tax Percentage (%)"'), false);
assert_1.default.ok(writtenInvoices.includes('Centrally managed by Mantis'));
assert_1.default.ok(writtenInvoices.includes('setItemTaxable'));
const mixed = (0, money_1.calculateTaxBreakdown)([
    { netPrice: 1000, taxPercentage: 15.5 },
    { netPrice: 500, taxPercentage: 0 }
], 0, 15.5);
assert_1.default.strictEqual(mixed.subtotal, 1500);
assert_1.default.strictEqual(mixed.taxAmount, 155);
assert_1.default.strictEqual(mixed.totalAmount, 1655);
const uniform = (0, money_1.calculateTaxBreakdown)([
    { netPrice: 1000, taxPercentage: 15.5 },
    { netPrice: 500, taxPercentage: 15.5 }
], 100, 15.5);
assert_1.default.strictEqual(uniform.taxAmount, 217);
assert_1.default.ok(paymentController.includes('centralVatRateBlock'));
for (const id of ['6ace0324c450bcc97524003c', '6ace0e18f4e4f25bbaddd77c']) {
    assert_1.default.strictEqual(paymentController.includes(id), false);
    assert_1.default.strictEqual(taxRateController.includes(id), false);
}
console.log('central vat registry tests passed');
