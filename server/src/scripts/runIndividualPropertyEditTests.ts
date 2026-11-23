import assert from 'assert';
import { levyConfiguration, planPropertyEdit, PropertyEditError, dueRentPatch } from '../services/individualPropertyEdit';

const current = {
  name: '12 Arundel Road',
  address: '12 Arundel Road, Harare',
  locationCountry: 'Zimbabwe',
  type: 'house',
  status: 'rented',
  rent: 1200,
  operatingCurrency: 'USD',
  rentFrequency: 'monthly',
  rentDueDay: 1,
  paymentTerms: 'Payable monthly',
  bedrooms: 3,
  bathrooms: 2,
  area: 180,
  amenities: ['Garden'],
  levyOrMunicipalType: 'levy' as const,
  levyOrMunicipalAmount: 80
};

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    name: current.name,
    address: current.address,
    country: 'Zimbabwe',
    type: 'house',
    status: 'rented',
    rent: 1200,
    rentFrequency: 'monthly',
    rentDueDay: 1,
    paymentTerms: 'Payable monthly',
    currency: 'USD',
    bedrooms: 3,
    bathrooms: 2,
    area: 180,
    amenities: ['Garden'],
    charges: [{ description: 'Body corporate levy', category: 'Levy', amount: 80, currency: 'USD', frequency: 'monthly', active: true }],
    ...overrides
  };
}

const same = planPropertyEdit(current, baseInput(), '2026-11-23', true);
assert.strictEqual(same.update.rent, undefined, 'unchanged rent is not rewritten');
assert.strictEqual(same.update.levyOrMunicipalAmount, 80);

const future = planPropertyEdit(current, baseInput({ rent: 1400, rentEffectiveFrom: '2026-12-01' }), '2026-11-23', true);
assert.strictEqual(future.update.rent, undefined, 'future rent does not replace the current amount');
assert.strictEqual(future.update.pendingRent, 1400);
assert.strictEqual((future.update.rentHistory as any[])[0].amount, 1200, 'previous rent is kept in history');

const now = planPropertyEdit(current, baseInput({ rent: 1300, rentEffectiveFrom: '2026-11-23' }), '2026-11-23', true);
assert.strictEqual(now.update.rent, 1300);
assert.strictEqual(now.update.pendingRent, null);
assert.ok(!('transactions' in now.update) && !('payments' in now.update), 'the patch does not include financial records');

assert.throws(
  () => planPropertyEdit(current, baseInput({ currency: 'ZiG' }), '2026-11-23', true),
  (error: any) => error instanceof PropertyEditError && error.code === 'CURRENCY_CONFIRMATION_REQUIRED'
);
const confirmed = planPropertyEdit(current, baseInput({ currency: 'ZiG', confirmCurrencyChange: true }), '2026-11-23', true);
assert.strictEqual(confirmed.update.operatingCurrency, 'ZiG');
assert.ok(!('transactions' in confirmed.update));

const moved = planPropertyEdit(current, baseInput({ city: 'Harare', country: 'Zimbabwe', address: '14 Arundel Road' }), '2026-11-23', false);
assert.strictEqual(moved.update.city, 'Harare');
assert.strictEqual(moved.update.locationCountry, 'Zimbabwe');
assert.ok(!('rentalTaxTreatment' in moved.update), 'location edits do not include tax treatment');

const retired = levyConfiguration([{
  chargeId: '1', description: 'Levy', category: 'Levy', amount: 50, currency: 'USD', frequency: 'monthly', active: false
}], '2026-11-23');
assert.strictEqual(retired.levyOrMunicipalAmount, 0, 'inactive charges do not remain as the current levy');

const applied = dueRentPatch({ pendingRent: 1400, pendingRentEffectiveFrom: '2026-12-01', rent: 1200 }, '2026-12-01');
assert.strictEqual(applied?.rent, 1400);
assert.strictEqual(dueRentPatch({ pendingRent: 1400, pendingRentEffectiveFrom: '2026-12-01', rent: 1200 }, '2026-11-23'), null);

console.log('Individual property edit tests passed');
