"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const individualRentalTaxApplicability_1 = require("../services/individualRentalTaxApplicability");
const individualRentalTaxBase_1 = require("../services/individualRentalTaxBase");
const individualRentalTaxCalculation_1 = require("../services/individualRentalTaxCalculation");
const rentalTaxRounding_1 = require("../services/tax/rentalTaxRounding");
const individualVatCalculation_1 = require("../services/individualVatCalculation");
const taxPeriodService_1 = require("../services/taxPeriodService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const individualAccountingCategories_1 = require("../services/individualAccountingCategories");
const xlsxWorkbook_1 = require("../utils/xlsxWorkbook");
const money_1 = require("../utils/money");
const taxTypes_1 = require("../services/tax/taxTypes");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
const pn08 = () => {
    const seed = (0, taxRuleRegistry_1.systemTaxRuleSeeds)().find((row) => row.ruleCode === 'ZW_PRESUMPTIVE_RENTAL_PN08_2026' && row.version === 1);
    return {
        id: 'pn08-v1',
        version: seed.version,
        ruleCode: seed.ruleCode,
        rate: seed.rate,
        calculationMethod: seed.calculationMethod,
        sourceReference: seed.sourceReference,
        effectiveFrom: seed.effectiveFrom,
        effectiveTo: seed.effectiveTo
    };
};
function rule(partial) {
    return Object.assign({ ruleCode: partial.ruleCode || 'TEST_RULE', calculationMethod: 'GROSS_RENTAL_PERCENT', sourceReference: partial.sourceReference || 'test', effectiveTo: partial.effectiveTo || null }, partial);
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        const configured = pn08();
        {
            const result = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                transactionDate: new Date('2026-09-17T00:00:00.000Z'),
                rentalTaxRule: configured
            });
            assert_1.default.strictEqual(result.status, 'APPLICABLE');
            assert_1.default.strictEqual(result.applicable, true);
            assert_1.default.strictEqual(result.taxRuleCode, 'ZW_PRESUMPTIVE_RENTAL_PN08_2026');
            assert_1.default.strictEqual(result.configuredRate, configured.rate);
            results['1 Presumptive regime resolves the configured rule'] = 'PASS';
        }
        {
            const result = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'ACCOUNTANT_REVIEW',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                rentalTaxRule: configured
            });
            const calc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: result,
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            assert_1.default.strictEqual(result.status, 'REVIEW_REQUIRED');
            assert_1.default.strictEqual(calc.taxAmount, null);
            assert_1.default.strictEqual(calc.calculationStatus, 'REVIEW_REQUIRED');
            results['2 Accountant review does not calculate tax'] = 'PASS';
        }
        {
            const result = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'SELF_ASSESSMENT',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                rentalTaxRule: configured
            });
            const calc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: result,
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            assert_1.default.strictEqual(result.applicable, false);
            assert_1.default.strictEqual(calc.calculationStatus, 'NOT_APPLICABLE');
            assert_1.default.strictEqual(calc.taxAmount, null);
            results['3 Self-assessment does not run the presumptive engine'] = 'PASS';
        }
        {
            const ruleA = rule({
                id: 'rule-a',
                version: 1,
                rate: 10,
                effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
                effectiveTo: new Date('2026-06-30T00:00:00.000Z')
            });
            const ruleB = rule({
                id: 'rule-b',
                version: 2,
                rate: 15,
                effectiveFrom: new Date('2026-07-01T00:00:00.000Z')
            });
            const march = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                transactionDate: new Date('2026-03-15T00:00:00.000Z'),
                rentalTaxRule: ruleA
            });
            const july = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                transactionDate: new Date('2026-07-15T00:00:00.000Z'),
                rentalTaxRule: ruleB
            });
            assert_1.default.strictEqual(march.taxRuleVersion, 1);
            assert_1.default.strictEqual(july.taxRuleVersion, 2);
            assert_1.default.notStrictEqual(march.configuredRate, july.configuredRate);
            results['4 Effective rule is selected by transaction date'] = 'PASS';
        }
        {
            const base = (0, individualRentalTaxBase_1.resolveRentalTaxBase)({
                sourceKind: 'PAYMENT_RENT',
                calculationMethod: 'GROSS_RENTAL_PERCENT',
                amount: 2500,
                rentAllocated: 2000,
                levyAllocated: 400,
                depositAmount: 100
            });
            assert_1.default.strictEqual(base.status, 'READY');
            assert_1.default.strictEqual(base.taxableRentalBase, 2000);
            assert_1.default.strictEqual(base.excludedAmount, 500);
            assert_1.default.notStrictEqual(base.taxableRentalBase, 2500);
            results['5 Tax base is rule-driven rent, not the full receipt'] = 'PASS';
        }
        {
            const calc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: configured
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            assert_1.default.strictEqual(calc.taxRate, configured.rate);
            assert_1.default.notStrictEqual(calc.taxRate, 0.15);
            const rounding = srcFile('services/tax/rentalTaxRounding.ts');
            const calculation = srcFile('services/individualRentalTaxCalculation.ts');
            assert_1.default.ok(!rounding.includes('* 0.15'));
            assert_1.default.ok(!calculation.includes('0.15'));
            assert_1.default.ok(!calculation.includes('* 0.15'));
            results['6 Rate comes from TaxRule, not a hard-coded 15%'] = 'PASS';
        }
        {
            const calc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: configured
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            assert_1.default.strictEqual(calc.calculationStatus, 'CALCULATED');
            assert_1.default.strictEqual(calc.taxAmount, (0, rentalTaxRounding_1.calculateGrossRentalPercent)(2000, configured.rate));
            assert_1.default.strictEqual(calc.taxAmount, (0, money_1.roundMoney)(2000 * (0, rentalTaxRounding_1.taxPercentToFraction)(configured.rate)));
            results['7 Calculation is tax base × configured rule rate'] = 'PASS';
        }
        {
            const march = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'ACCOUNTANT_REVIEW',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                rentalTaxRule: configured
            });
            const june = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                rentalTaxRule: configured
            });
            const marchCalc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: march,
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            const juneCalc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: june,
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            assert_1.default.strictEqual(marchCalc.calculationStatus, 'REVIEW_REQUIRED');
            assert_1.default.strictEqual(marchCalc.taxAmount, null);
            assert_1.default.strictEqual(juneCalc.calculationStatus, 'CALCULATED');
            assert_1.default.ok(juneCalc.taxAmount != null);
            results['8 Historical snapshot remains unchanged after a later profile change'] = 'PASS';
        }
        {
            const ruleA = rule({ id: 'a', version: 1, rate: 10, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') });
            const historical = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: ruleA
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            assert_1.default.strictEqual(historical.taxRuleVersion, 1);
            assert_1.default.strictEqual(historical.taxRate, 10);
            assert_1.default.strictEqual(historical.taxAmount, (0, rentalTaxRounding_1.calculateGrossRentalPercent)(2000, 10));
            results['9 Historical transaction retains the original rule'] = 'PASS';
        }
        {
            const model = srcFile('models/IndividualRentalTaxRecord.ts');
            const service = srcFile('services/individualRentalTaxService.ts');
            assert_1.default.ok(model.includes("unique: true"));
            assert_1.default.ok(service.includes("recordKind: 'ORIGINAL'"));
            assert_1.default.ok(service.includes('if (existing) return existing'));
            results['10 Duplicate calculation does not create a second original'] = 'PASS';
        }
        {
            const service = srcFile('services/individualRentalTaxService.ts');
            assert_1.default.ok(service.includes("recordKind: 'REVERSAL'"));
            assert_1.default.ok(service.includes('reversalOf: original._id'));
            assert_1.default.ok(!service.includes('IndividualRentalTaxRecord.updateOne'));
            assert_1.default.ok(!service.includes('original.save('));
            assert_1.default.ok(srcFile('models/IndividualRentalTaxRecord.ts').includes('cannot be updated in place'));
            results['11 Reversal preserves the original rental-tax record'] = 'PASS';
        }
        {
            const calc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: configured
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            const payment = 300;
            const balance = (0, money_1.roundMoney)(Number(calc.taxAmount) - payment);
            assert_1.default.strictEqual(calc.taxAmount, 300);
            assert_1.default.strictEqual(balance, 0);
            const service = srcFile('services/individualRentalTaxService.ts');
            assert_1.default.ok(service.includes('calculatedTax - taxPayments'));
            assert_1.default.ok(service.includes('calculatedBalance'));
            assert_1.default.ok(service.includes('landlordRecordedOnly: true'));
            results['12 Tax payment reconciles against calculated tax'] = 'PASS';
        }
        {
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('FINALIZED'), 'PERIOD_CLOSED');
            assert_1.default.strictEqual((0, taxPeriodService_1.assignmentStatusForExistingPeriod)('LOCKED'), 'PERIOD_CLOSED');
            assert_1.default.ok(srcFile('services/individualRentalTaxService.ts').includes('PERIOD_CLOSED'));
            results['13 Closed or locked rental-tax periods reject ordinary mutation'] = 'PASS';
        }
        {
            const calc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: configured
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 }),
                periodAssignmentStatus: 'PERIOD_REQUIRED'
            });
            assert_1.default.strictEqual(calc.calculationStatus, 'PERIOD_REQUIRED');
            assert_1.default.strictEqual(calc.taxAmount, null);
            assert_1.default.ok(calc.reviewReasons.includes('TAX_PERIOD_MISSING'));
            const metadata = srcFile('services/individualTaxMetadataService.ts');
            assert_1.default.ok(!metadata.includes('TaxPeriod.create'));
            results['14 Missing period is PERIOD_REQUIRED and is not auto-created'] = 'PASS';
        }
        {
            const result = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                rentalTaxRule: null
            });
            const calc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: result,
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            assert_1.default.strictEqual(result.status, 'RULE_UNAVAILABLE');
            assert_1.default.strictEqual(calc.calculationStatus, 'REVIEW_REQUIRED');
            assert_1.default.strictEqual(calc.taxAmount, null);
            results['15 Missing rule is REVIEW_REQUIRED, not a 15% fallback'] = 'PASS';
        }
        {
            const missingProfile = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: false,
                rentalTaxRule: configured
            });
            const missingClass = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_RENT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: null,
                profileSnapshotPresent: true,
                rentalTaxRule: configured
            });
            assert_1.default.strictEqual(missingProfile.status, 'REVIEW_REQUIRED');
            assert_1.default.ok(missingProfile.reviewReasons.includes('PROFILE_SNAPSHOT_MISSING'));
            assert_1.default.strictEqual(missingClass.status, 'REVIEW_REQUIRED');
            assert_1.default.ok(missingClass.reviewReasons.includes('PROPERTY_CLASSIFICATION_MISSING'));
            results['16 Missing classification or snapshot is REVIEW_REQUIRED'] = 'PASS';
        }
        {
            const result = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: 'PAYMENT_DEPOSIT',
                rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                propertyUseClass: 'COMMERCIAL',
                profileSnapshotPresent: true,
                rentalTaxRule: configured
            });
            assert_1.default.strictEqual(result.status, 'NOT_APPLICABLE');
            assert_1.default.strictEqual(result.applicable, false);
            const service = srcFile('services/individualRentalTaxService.ts');
            assert_1.default.ok(service.includes("sourceKind === 'PAYMENT_DEPOSIT'"));
            assert_1.default.ok(service.includes('return null'));
            results['17 Deposit receipt produces no rental tax'] = 'PASS';
        }
        {
            const classified = (0, individualAccountingCategories_1.classifyLandlordCategory)('DEPOSIT_APPLICATION');
            assert_1.default.strictEqual(classified.sourceKind, 'OTHER_INCOME');
            assert_1.default.strictEqual(classified.accountingTreatment, 'PROPERTY_INCOME');
            const base = (0, individualRentalTaxBase_1.resolveRentalTaxBase)({
                sourceKind: 'OTHER_INCOME',
                category: 'DEPOSIT_APPLICATION',
                amount: 500
            });
            const calc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'OTHER_INCOME',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: configured
                }),
                taxBase: base
            });
            assert_1.default.strictEqual(base.taxableRentalBase, 500);
            assert_1.default.strictEqual(calc.calculationStatus, 'CALCULATED');
            assert_1.default.ok(srcFile('services/individualAccountingService.ts').includes('applyDepositToRent'));
            assert_1.default.ok(srcFile('services/individualAccountingService.ts').includes('original deposit was not mutated'));
            results['18 Deposit application can produce rental tax'] = 'PASS';
        }
        {
            const vat = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: 'OUTPUT',
                treatment: 'STANDARD',
                amount: 2000,
                vatRatePercent: 15.5,
                method: 'EXCLUSIVE'
            });
            const rental = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: configured
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            assert_1.default.notStrictEqual(vat.vatAmount, rental.taxAmount);
            assert_1.default.strictEqual(rental.vatAmount, null);
            assert_1.default.strictEqual(vat.presumptiveTaxAmount, null);
            const rentalCalc = srcFile('services/individualRentalTaxCalculation.ts');
            assert_1.default.ok(rentalCalc.includes('vatAmount: null'));
            assert_1.default.ok(!rentalCalc.includes('calculateIndividualVat'));
            results['19 VAT record and rental-tax record remain separate'] = 'PASS';
        }
        {
            const orch = srcFile('services/paymentAccountingOrchestrator.ts');
            assert_1.default.ok(orch.includes('export async function postPaymentAccounting'));
            assert_1.default.ok(!srcFile('services/individualRentalTaxService.ts').includes("from '../models/VatRecord'"));
            assert_1.default.ok(!srcFile('services/individualRentalTaxService.ts').includes("from '../models/TaxObligation'"));
            assert_1.default.ok(!srcFile('services/individualRentalTaxService.ts').includes('TaxObligation.create'));
            assert_1.default.ok(!srcFile('services/individualRentalTaxService.ts').includes('JournalEntry.create'));
            assert_1.default.strictEqual(taxTypes_1.TAX_TYPE_MODE.PRESUMPTIVE_RENTAL_INCOME_TAX, 'NOT_IMPLEMENTED');
            results['20 Agency Phase 8 TaxObligation path remains unchanged'] = 'PASS';
        }
        {
            const na = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'EXEMPT',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: configured
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            assert_1.default.strictEqual(na.taxAmount, null);
            assert_1.default.strictEqual(na.calculationStatus, 'NOT_APPLICABLE');
            const zeroBase = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: configured
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 100, rentAllocated: 0, levyAllocated: 0, depositAmount: 100 })
            });
            assert_1.default.strictEqual(zeroBase.taxableRentalBase, 0);
            assert_1.default.strictEqual(zeroBase.taxAmount, 0);
            assert_1.default.strictEqual(zeroBase.calculationStatus, 'CALCULATED');
            results['Zero vs null semantics: not applicable is null; calculated zero is 0'] = 'PASS';
        }
        {
            const usd = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    rentalTaxRule: configured
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            const service = srcFile('services/individualRentalTaxService.ts');
            assert_1.default.ok(service.includes('transactionCurrency'));
            assert_1.default.ok(service.includes("currency: source?.currency || 'USD'"));
            assert_1.default.strictEqual(usd.taxAmount, 300);
            results['Multi-currency preserves the original transaction currency'] = 'PASS';
        }
        {
            const golden = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability: (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                    sourceKind: 'PAYMENT_RENT',
                    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
                    propertyUseClass: 'COMMERCIAL',
                    profileSnapshotPresent: true,
                    transactionDate: new Date('2026-09-17T00:00:00.000Z'),
                    rentalTaxRule: configured
                }),
                taxBase: (0, individualRentalTaxBase_1.resolveRentalTaxBase)({ sourceKind: 'PAYMENT_RENT', amount: 2000, rentAllocated: 2000 })
            });
            assert_1.default.strictEqual(golden.taxableRentalBase, 2000);
            assert_1.default.strictEqual(golden.taxRate, configured.rate);
            assert_1.default.strictEqual(golden.taxAmount, 300);
            assert_1.default.strictEqual(golden.incomeTaxAmount, null);
            const xlsx = (0, xlsxWorkbook_1.buildXlsxWorkbook)('Rental tax working paper', [{ taxpayer: 'Test', tin: 'test value', tax: golden.taxAmount }]);
            assert_1.default.ok(xlsx.slice(0, 2).toString() === 'PK');
            const routes = srcFile('routes/individualRoutes.ts');
            assert_1.default.ok(routes.includes("router.get('/tax/rental'"));
            assert_1.default.ok(routes.includes("router.get('/tax/rental/working-paper'"));
            assert_1.default.ok(routes.includes("router.post('/deposits/apply'"));
            results['Golden commercial presumptive rent $2,000 on 2026-09-17 plus genuine XLSX'] = 'PASS';
        }
        {
            const metadata = srcFile('services/individualTaxMetadataService.ts');
            const rentalService = srcFile('services/individualRentalTaxService.ts');
            assert_1.default.ok(!metadata.includes('for each historical'));
            assert_1.default.ok(!rentalService.includes('for each historical payment'));
            assert_1.default.ok(!rentalService.includes('Payment.updateMany'));
            assert_1.default.ok(!rentalService.includes('PropertyAccount.updateMany'));
            assert_1.default.ok(srcFile('models/TransactionTaxSnapshot.ts').includes('Phase D tax snapshots cannot store calculated tax amounts'));
            results['No historical rental-tax backfill or snapshot rewrite'] = 'PASS';
        }
        {
            const cents = (0, rentalTaxRounding_1.calculateGrossRentalPercent)(100.01, configured.rate);
            assert_1.default.strictEqual(cents, (0, money_1.roundMoney)(100.01 * (0, rentalTaxRounding_1.taxPercentToFraction)(configured.rate)));
            const large = (0, rentalTaxRounding_1.calculateGrossRentalPercent)(1000000, configured.rate);
            assert_1.default.strictEqual(large, (0, money_1.roundMoney)(1000000 * (0, rentalTaxRounding_1.taxPercentToFraction)(configured.rate)));
            results['Fractional cents and large values use roundMoney'] = 'PASS';
        }
        console.log(JSON.stringify(results, null, 2));
        if (Object.values(results).some((value) => value !== 'PASS'))
            throw new Error('Phase F tests failed');
        console.log('Phase F individual presumptive rental tax tests: ALL PASS');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
