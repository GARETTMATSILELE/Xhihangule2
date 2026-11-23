"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const individualPropertyEdit_1 = require("../services/individualPropertyEdit");
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
    levyOrMunicipalType: 'levy',
    levyOrMunicipalAmount: 80
};
function baseInput(overrides = {}) {
    return Object.assign({ name: current.name, address: current.address, country: 'Zimbabwe', type: 'house', status: 'rented', rent: 1200, rentFrequency: 'monthly', rentDueDay: 1, paymentTerms: 'Payable monthly', currency: 'USD', bedrooms: 3, bathrooms: 2, area: 180, amenities: ['Garden'], charges: [{ description: 'Body corporate levy', category: 'Levy', amount: 80, currency: 'USD', frequency: 'monthly', active: true }] }, overrides);
}
const same = (0, individualPropertyEdit_1.planPropertyEdit)(current, baseInput(), '2026-11-23', true);
assert_1.default.strictEqual(same.update.rent, undefined, 'unchanged rent is not rewritten');
assert_1.default.strictEqual(same.update.levyOrMunicipalAmount, 80);
const future = (0, individualPropertyEdit_1.planPropertyEdit)(current, baseInput({ rent: 1400, rentEffectiveFrom: '2026-12-01' }), '2026-11-23', true);
assert_1.default.strictEqual(future.update.rent, undefined, 'future rent does not replace the current amount');
assert_1.default.strictEqual(future.update.pendingRent, 1400);
assert_1.default.strictEqual(future.update.rentHistory[0].amount, 1200, 'previous rent is kept in history');
const now = (0, individualPropertyEdit_1.planPropertyEdit)(current, baseInput({ rent: 1300, rentEffectiveFrom: '2026-11-23' }), '2026-11-23', true);
assert_1.default.strictEqual(now.update.rent, 1300);
assert_1.default.strictEqual(now.update.pendingRent, null);
assert_1.default.ok(!('transactions' in now.update) && !('payments' in now.update), 'the patch does not include financial records');
assert_1.default.throws(() => (0, individualPropertyEdit_1.planPropertyEdit)(current, baseInput({ currency: 'ZiG' }), '2026-11-23', true), (error) => error instanceof individualPropertyEdit_1.PropertyEditError && error.code === 'CURRENCY_CONFIRMATION_REQUIRED');
const confirmed = (0, individualPropertyEdit_1.planPropertyEdit)(current, baseInput({ currency: 'ZiG', confirmCurrencyChange: true }), '2026-11-23', true);
assert_1.default.strictEqual(confirmed.update.operatingCurrency, 'ZiG');
assert_1.default.ok(!('transactions' in confirmed.update));
const moved = (0, individualPropertyEdit_1.planPropertyEdit)(current, baseInput({ city: 'Harare', country: 'Zimbabwe', address: '14 Arundel Road' }), '2026-11-23', false);
assert_1.default.strictEqual(moved.update.city, 'Harare');
assert_1.default.strictEqual(moved.update.locationCountry, 'Zimbabwe');
assert_1.default.ok(!('rentalTaxTreatment' in moved.update), 'location edits do not include tax treatment');
const retired = (0, individualPropertyEdit_1.levyConfiguration)([{
        chargeId: '1', description: 'Levy', category: 'Levy', amount: 50, currency: 'USD', frequency: 'monthly', active: false
    }], '2026-11-23');
assert_1.default.strictEqual(retired.levyOrMunicipalAmount, 0, 'inactive charges do not remain as the current levy');
const applied = (0, individualPropertyEdit_1.dueRentPatch)({ pendingRent: 1400, pendingRentEffectiveFrom: '2026-12-01', rent: 1200 }, '2026-12-01');
assert_1.default.strictEqual(applied === null || applied === void 0 ? void 0 : applied.rent, 1400);
assert_1.default.strictEqual((0, individualPropertyEdit_1.dueRentPatch)({ pendingRent: 1400, pendingRentEffectiveFrom: '2026-12-01', rent: 1200 }, '2026-11-23'), null);
console.log('Individual property edit tests passed');
