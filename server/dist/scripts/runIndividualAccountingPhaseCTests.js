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
const vatApplicability_1 = require("../services/tax/vatApplicability");
const rentalTaxTypes_1 = require("../services/tax/rentalTaxTypes");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const taxTypes_1 = require("../services/tax/taxTypes");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        {
            assert_1.default.strictEqual((0, rentalTaxTypes_1.normalizeRentalTaxRegime)(undefined), 'ACCOUNTANT_REVIEW');
            assert_1.default.strictEqual((0, rentalTaxTypes_1.normalizeRentalTaxRegime)('individual'), 'ACCOUNTANT_REVIEW');
            assert_1.default.strictEqual((0, rentalTaxTypes_1.normalizeRentalTaxRegime)('PRESUMPTIVE_RENTAL'), 'PRESUMPTIVE_RENTAL');
            assert_1.default.strictEqual((0, rentalTaxTypes_1.normalizeRentalTaxRegime)('SELF_ASSESSMENT'), 'SELF_ASSESSMENT');
            const service = srcFile('services/individualTaxProfileService.ts');
            assert_1.default.ok(!service.includes('workspaceType === \'individual\''));
            assert_1.default.ok(!service.includes("plan === 'INDIVIDUAL'"));
            assert_1.default.ok(service.includes('rentalTaxRegimeInferredFromWorkspace: false'));
            results['Rental tax regime is not inferred from workspace'] = 'PASS';
        }
        {
            assert_1.default.strictEqual((0, vatApplicability_1.defaultSupplyTreatment)('RESIDENTIAL_DWELLING'), 'EXEMPT');
            assert_1.default.strictEqual((0, vatApplicability_1.defaultSupplyTreatment)('COMMERCIAL'), 'ACCOUNTANT_REVIEW');
            assert_1.default.strictEqual((0, vatApplicability_1.defaultSupplyTreatment)('SHORT_TERM_ACCOMMODATION'), 'ACCOUNTANT_REVIEW');
            assert_1.default.strictEqual((0, vatApplicability_1.defaultSupplyTreatment)('MIXED_USE'), 'ACCOUNTANT_REVIEW');
            results['Commercial and short-term rentals are not auto-classified for VAT'] = 'PASS';
        }
        {
            const seeds = (0, taxRuleRegistry_1.systemTaxRuleSeeds)();
            const vat2026 = seeds.find((r) => r.ruleCode === 'ZW_VAT_STANDARD' && r.version === 2);
            const vatPrior = seeds.find((r) => r.ruleCode === 'ZW_VAT_STANDARD' && r.version === 1);
            const presumptive = seeds.find((r) => r.ruleCode === 'ZW_PRESUMPTIVE_RENTAL_PN08_2026');
            assert_1.default.ok(vat2026 && vatPrior && presumptive);
            assert_1.default.strictEqual(vatPrior.rate, 15);
            assert_1.default.strictEqual(vat2026.rate, 15.5);
            assert_1.default.strictEqual(presumptive.rate, 15);
            assert_1.default.strictEqual(presumptive.sourceReference, 'ZIMRA Public Notice 08 of 2026');
            assert_1.default.ok((0, taxRuleRegistry_1.isRuleEffectiveOn)(vatPrior, new Date('2025-12-31T00:00:00.000Z')));
            assert_1.default.ok(!(0, taxRuleRegistry_1.isRuleEffectiveOn)(vatPrior, new Date('2026-01-01T00:00:00.000Z')));
            assert_1.default.ok((0, taxRuleRegistry_1.isRuleEffectiveOn)(vat2026, new Date('2026-01-01T00:00:00.000Z')));
            assert_1.default.ok(!(0, taxRuleRegistry_1.isRuleEffectiveOn)(vat2026, new Date('2025-12-31T00:00:00.000Z')));
            assert_1.default.ok((0, taxRuleRegistry_1.isRuleEffectiveOn)(presumptive, new Date('2026-09-17T00:00:00.000Z')));
            assert_1.default.ok(!(0, taxRuleRegistry_1.isRuleEffectiveOn)(presumptive, new Date('2025-12-01T00:00:00.000Z')));
            results['Effective-dated VAT and presumptive rules preserve historical rates'] = 'PASS';
        }
        {
            assert_1.default.strictEqual(taxTypes_1.TAX_TYPE_MODE.PRESUMPTIVE_RENTAL_INCOME_TAX, 'NOT_IMPLEMENTED');
            assert_1.default.strictEqual(taxTypes_1.TAX_TYPE_MODE.INCOME_TAX, 'NOT_IMPLEMENTED');
            const service = srcFile('services/individualTaxProfileService.ts');
            assert_1.default.ok(!service.includes('PropertyAccount'));
            assert_1.default.ok(!service.includes('postPaymentAccounting'));
            assert_1.default.ok(service.includes('TAX_PROFILE_UPDATED'));
            results['Profiles do not calculate or rewrite financial amounts'] = 'PASS';
        }
        {
            const routes = srcFile('routes/individualRoutes.ts');
            assert_1.default.ok(routes.includes("router.get('/tax-profile'"));
            assert_1.default.ok(routes.includes("router.put('/tax-profile'"));
            assert_1.default.ok(routes.includes("router.get('/properties/:id/tax-profile'"));
            assert_1.default.ok(routes.includes("router.put('/properties/:id/tax-profile'"));
            const orch = srcFile('services/paymentAccountingOrchestrator.ts');
            assert_1.default.ok(orch.includes('export async function postPaymentAccounting'));
            results['Tax profile APIs exist; rent orchestrator unchanged'] = 'PASS';
        }
        {
            const form = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', '..', 'client', 'src', 'components', 'properties', 'PropertyForm.tsx'), 'utf8');
            assert_1.default.ok(form.includes("commission: individualMode ? 0"));
            assert_1.default.ok(form.includes('SHORT_TERM_ACCOMMODATION'));
            assert_1.default.ok(form.includes('rentalTaxTreatment'));
            results['Individual property form keeps commission 0 and exposes tax classification'] = 'PASS';
        }
        console.log(JSON.stringify(results, null, 2));
        const failed = Object.values(results).filter((v) => v !== 'PASS');
        if (failed.length) {
            throw new Error('Phase C individual tax profile tests failed');
        }
        console.log('Phase C individual tax profile tests: ALL PASS');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
