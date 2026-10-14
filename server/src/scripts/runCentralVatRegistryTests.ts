import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  isRuleEffectiveOn,
  jurisdictionCodeFromCountry,
  planStandardVatRateChange,
  systemTaxRuleSeeds
} from '../services/taxRuleRegistry';
import { calculateTaxBreakdown } from '../utils/money';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(path.resolve(__dirname, '../../..'), relativePath), 'utf8');

const vatSeeds = systemTaxRuleSeeds().filter((row) => row.taxType === 'VAT');
const before = vatSeeds.find((row) => row.version === 1);
const current = vatSeeds.find((row) => row.version === 2);
assert.ok(before && current);
assert.strictEqual(before.jurisdiction, 'ZW');
assert.strictEqual(before.rate, 15);
assert.strictEqual(current.rate, 15.5);
assert.strictEqual(isRuleEffectiveOn(before, new Date('2025-12-31T00:00:00.000Z')), true);
assert.strictEqual(isRuleEffectiveOn(current, new Date('2025-12-31T00:00:00.000Z')), false);
assert.strictEqual(isRuleEffectiveOn(current, new Date('2026-01-01T00:00:00.000Z')), true);
assert.strictEqual(isRuleEffectiveOn(before, new Date('2026-01-01T00:00:00.000Z')), false);
assert.strictEqual(isRuleEffectiveOn({
  effectiveFrom: new Date('2027-01-01T00:00:00.000Z'),
  effectiveTo: null,
  status: 'ACTIVE'
}, new Date('2026-10-13T00:00:00.000Z')), false);

const existingRates = [
  { version: 1, rate: 15, effectiveFrom: new Date('1970-01-01T00:00:00.000Z'), effectiveTo: new Date('2025-12-31T00:00:00.000Z'), status: 'ACTIVE' },
  { version: 2, rate: 15.5, effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: null, status: 'ACTIVE' }
];
assert.throws(() => planStandardVatRateChange(existingRates, { rate: 16, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }), /cannot be overwritten/);

const planned = planStandardVatRateChange(existingRates, { rate: 16, effectiveFrom: new Date('2027-01-01T00:00:00.000Z') });
assert.strictEqual(planned.nextVersion, 3);
assert.strictEqual(planned.closures.length, 1);
assert.strictEqual(planned.closures[0].version, 2);
assert.strictEqual(planned.closures[0].rate, 15.5);
assert.strictEqual(planned.closures[0].effectiveTo.toISOString().slice(0, 10), '2026-12-31');

assert.throws(() => planStandardVatRateChange([], { rate: 0, effectiveFrom: new Date('2027-01-01T00:00:00.000Z') }), /greater than 0/);
assert.strictEqual(jurisdictionCodeFromCountry('Zimbabwe'), 'ZW');
assert.strictEqual(jurisdictionCodeFromCountry(''), 'ZW');
assert.strictEqual(jurisdictionCodeFromCountry('South Africa'), '');

const paymentController = read('server/src/controllers/paymentController.ts');
const companyController = read('server/src/controllers/companyController.ts');
const taxRateController = read('server/src/controllers/taxRateController.ts');
const settingsPage = read('client/src/pages/AccountantDashboard/SettingsPage.tsx');
const salesForm = read('client/src/components/payments/SalesPaymentForm.tsx');
const propertyForm = read('client/src/components/properties/PropertyForm.tsx');
const posting = read('server/src/services/paymentAccountingReconciliation.ts');
assert.ok(taxRateController.includes('VAT_RATE_CENTRALLY_MANAGED'));
assert.ok(taxRateController.includes('requireSystemAdmin'));
assert.ok(companyController.includes('delete nextCommission.vatPercentOnCommission'));
assert.strictEqual(settingsPage.includes('New VAT rate'), false);
assert.strictEqual(settingsPage.includes('vatPercentOnCommission: Number'), false);
assert.strictEqual(salesForm.includes('0.155'), false);
assert.strictEqual(salesForm.includes('vatOnCommissionRate'), false);
assert.ok(propertyForm.includes('centrally managed by Mantis'));
assert.ok(propertyForm.includes('vatOnCommission'));
assert.ok(posting.includes('idempotencyKey: `payment:${paymentId}`'));
const invoiceController = read('server/src/controllers/invoiceController.ts');
const writtenInvoices = read('client/src/pages/AccountantDashboard/WrittenInvoicesPage.tsx');
assert.ok(invoiceController.includes('getVatRateForDate'));
assert.strictEqual(invoiceController.includes('taxPercentage = 15'), false);
assert.ok(invoiceController.includes('item?.taxable === false'));
assert.strictEqual(writtenInvoices.includes('label="Tax Percentage (%)"'), false);
assert.ok(writtenInvoices.includes('Centrally managed by Mantis'));
assert.ok(writtenInvoices.includes('setItemTaxable'));
const mixed = calculateTaxBreakdown([
  { netPrice: 1000, taxPercentage: 15.5 },
  { netPrice: 500, taxPercentage: 0 }
], 0, 15.5);
assert.strictEqual(mixed.subtotal, 1500);
assert.strictEqual(mixed.taxAmount, 155);
assert.strictEqual(mixed.totalAmount, 1655);
const uniform = calculateTaxBreakdown([
  { netPrice: 1000, taxPercentage: 15.5 },
  { netPrice: 500, taxPercentage: 15.5 }
], 100, 15.5);
assert.strictEqual(uniform.taxAmount, 217);
assert.ok(paymentController.includes('centralVatRateBlock'));
for (const id of ['6ace0324c450bcc97524003c', '6ace0e18f4e4f25bbaddd77c']) {
  assert.strictEqual(paymentController.includes(id), false);
  assert.strictEqual(taxRateController.includes(id), false);
}

console.log('central vat registry tests passed');
