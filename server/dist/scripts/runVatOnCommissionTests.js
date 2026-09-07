"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const VAT_RATE = 0.155;
const nearlyEqual = (actual, expected, digits = 2) => {
    const factor = Math.pow(10, digits);
    assert_1.default.strictEqual(Math.round(actual * factor) / factor, Math.round(expected * factor) / factor);
};
const run = () => {
    const levyExclusive = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 100,
        commissionPercentage: 10,
        vatOnCommission: true,
        vatTreatment: 'exclusive',
        vatRate: VAT_RATE
    });
    nearlyEqual(levyExclusive.commissionBase, 1000);
    nearlyEqual(levyExclusive.commissionGross, 100);
    nearlyEqual(levyExclusive.vatAmount, 15.5);
    nearlyEqual(levyExclusive.ownerPayable, 884.5);
    const noLevyExclusive = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 0,
        commissionPercentage: 10,
        vatOnCommission: true,
        vatTreatment: 'exclusive',
        vatRate: VAT_RATE
    });
    nearlyEqual(noLevyExclusive.commissionGross, 110);
    nearlyEqual(noLevyExclusive.vatAmount, 17.05);
    nearlyEqual(noLevyExclusive.ownerPayable, 972.95);
    const levyOff = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 100,
        commissionPercentage: 10,
        vatOnCommission: false,
        vatRate: VAT_RATE
    });
    nearlyEqual(levyOff.commissionBase, 1000);
    nearlyEqual(levyOff.commissionGross, 100);
    nearlyEqual(levyOff.vatAmount, 0);
    nearlyEqual(levyOff.ownerPayable, 900);
    const noLevyOff = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 0,
        commissionPercentage: 10,
        vatOnCommission: false,
        vatRate: VAT_RATE
    });
    nearlyEqual(noLevyOff.commissionGross, 110);
    nearlyEqual(noLevyOff.vatAmount, 0);
    nearlyEqual(noLevyOff.ownerPayable, 990);
    const inclusive = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1000,
        levy: 0,
        commissionPercentage: 10,
        vatOnCommission: true,
        vatTreatment: 'inclusive',
        vatRate: VAT_RATE
    });
    nearlyEqual(inclusive.commissionGross, 100);
    nearlyEqual(inclusive.commissionNet, 86.58);
    nearlyEqual(inclusive.vatAmount, 13.42);
    nearlyEqual(inclusive.ownerPayable, 900);
    const january = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 100,
        commissionPercentage: 10,
        vatOnCommission: true,
        vatTreatment: 'exclusive',
        vatRate: 0.155
    });
    const afterRateChange = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 100,
        commissionPercentage: 10,
        vatOnCommission: true,
        vatTreatment: 'exclusive',
        vatRate: 0.16
    });
    nearlyEqual(january.vatRate || 0, 0.155);
    nearlyEqual(january.vatAmount, 15.5);
    nearlyEqual(afterRateChange.vatRate || 0, 0.16);
    nearlyEqual(afterRateChange.vatAmount, 16);
    assert_1.default.notStrictEqual(january.vatAmount, afterRateChange.vatAmount);
    const legacyProperty = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: 1100,
        levy: 100,
        commissionPercentage: 10
    });
    nearlyEqual(legacyProperty.vatAmount, 0);
    nearlyEqual(legacyProperty.ownerPayable, 900);
    assert_1.default.strictEqual(legacyProperty.vatOnCommission, false);
    console.log('vat on commission tests passed');
};
run();
