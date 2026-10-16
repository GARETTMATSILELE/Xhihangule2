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
const vatCalculation_1 = require("../services/tax/vatCalculation");
const vatApplicability_1 = require("../services/tax/vatApplicability");
const cgtCalculation_1 = require("../services/tax/cgtCalculation");
const principalAgentJournal_1 = require("../services/tax/principalAgentJournal");
const settlementWaterfall_1 = require("../services/tax/settlementWaterfall");
const taxEngine_1 = require("../services/taxEngine");
const chartAccounts_1 = require("../services/tax/chartAccounts");
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const money_1 = require("../utils/money");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        // VAT inclusive / exclusive
        {
            const inclusive = (0, vatCalculation_1.extractInclusiveVat)(115.5, 0.155);
            assert_1.default.strictEqual(inclusive.net, 100);
            assert_1.default.strictEqual(inclusive.vatAmount, 15.5);
            const exclusive = (0, vatCalculation_1.exclusiveVatOn)(142.5, 0.155);
            assert_1.default.strictEqual(exclusive.vatAmount, 22.09);
            const inclCommission = (0, vatCalculation_1.commissionVatFromTreatment)({
                commission: 1000,
                vatRate: 0.155,
                treatment: 'COMMISSION_VAT_INCLUSIVE'
            });
            assert_1.default.strictEqual((0, money_1.roundMoney)(inclCommission.commissionNet + inclCommission.vatAmount), 1000);
            results['VAT inclusive/exclusive math'] = 'PASS';
        }
        // Historical 15% vs 2026 15.5% is rate-table driven (no hardcoded payment default)
        {
            const paymentCtrl = srcFile('controllers/paymentController.ts');
            assert_1.default.ok(!paymentCtrl.includes('?? 0.155'), 'sale VAT must not default to hardcoded 0.155');
            const taxEngineSrc = srcFile('services/taxEngine/index.ts');
            assert_1.default.ok(!taxEngineSrc.includes('cgtRate: 0.2'), 'tax engine must not default CGT to 20% of sale price');
            assert_1.default.ok(!taxEngineSrc.includes('salePrice *'), 'tax engine must not multiply sale price for CGT');
            results['No hardcoded 15.5% / 20% CGT'] = 'PASS';
        }
        // Company VAT registration
        {
            const company = {
                vatRegistered: true,
                vatRegistrationEffectiveDate: new Date('2026-03-01T00:00:00Z'),
                vatRegistrationCancelledAt: new Date('2026-08-31T00:00:00Z')
            };
            assert_1.default.strictEqual((0, vatApplicability_1.isCompanyVatRegisteredOnDate)(company, new Date('2026-02-01T00:00:00Z')), false);
            assert_1.default.strictEqual((0, vatApplicability_1.isCompanyVatRegisteredOnDate)(company, new Date('2026-04-01T00:00:00Z')), true);
            assert_1.default.strictEqual((0, vatApplicability_1.isCompanyVatRegisteredOnDate)(company, new Date('2026-09-01T00:00:00Z')), false);
            const unregistered = (0, vatApplicability_1.evaluateVatApplicability)({
                company: { vatRegistered: false },
                transactionDate: new Date('2026-06-01'),
                supplyTreatment: 'STANDARD_TAXABLE',
                requested: true
            });
            assert_1.default.strictEqual(unregistered.vatApplies, false);
            assert_1.default.strictEqual(unregistered.reviewRequired, true);
            results['VAT registration window'] = 'PASS';
        }
        // Property classification
        {
            assert_1.default.strictEqual((0, vatApplicability_1.defaultSupplyTreatment)('RESIDENTIAL_DWELLING'), 'EXEMPT');
            assert_1.default.strictEqual((0, vatApplicability_1.defaultSupplyTreatment)('AGENCY_COMMISSION'), 'STANDARD_TAXABLE');
            const commercial = (0, vatApplicability_1.evaluateVatApplicability)({
                company: { vatRegistered: true },
                transactionDate: new Date(),
                supplyTreatment: 'ACCOUNTANT_REVIEW',
                useClass: 'COMMERCIAL',
                requested: true
            });
            assert_1.default.strictEqual(commercial.vatApplies, false);
            assert_1.default.ok(commercial.reviewRequired);
            results['Property VAT classification'] = 'PASS';
        }
        // Rental exclusive VAT example from spec
        {
            const result = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
                grossRent: 1000,
                levy: 50,
                commissionPercentage: 15,
                vatOnCommission: true,
                vatTreatment: 'exclusive',
                vatRate: 0.155
            });
            assert_1.default.strictEqual(result.commissionBase, 950);
            assert_1.default.strictEqual(result.commissionNet, 142.5);
            assert_1.default.strictEqual(result.vatAmount, 22.09);
            assert_1.default.strictEqual(result.ownerAmount, 835.41);
            const journal = (0, principalAgentJournal_1.buildAgentReceiptJournal)({
                paymentType: 'rental',
                amount: 1050,
                ownerAmount: result.ownerAmount,
                commissionNet: result.commissionNet,
                vatAmount: result.vatAmount
            });
            assert_1.default.strictEqual(journal.companyRevenue, 142.5);
            assert_1.default.strictEqual(journal.vatLiability, 22.09);
            assert_1.default.strictEqual(journal.ownerLiability, 885.41);
            assert_1.default.notStrictEqual(journal.companyRevenue, 1050);
            assert_1.default.ok(journal.lines.some((l) => l.accountCode === chartAccounts_1.GL.TRUST_BANK && l.debit === 1050));
            assert_1.default.ok(journal.lines.some((l) => l.accountCode === chartAccounts_1.GL.AGENCY_REVENUE && l.credit === 142.5));
            assert_1.default.ok(journal.balanced);
            results['Principal vs agent rental journal'] = 'PASS';
        }
        // CGT from capital gain, not sale price
        {
            const gain = (0, cgtCalculation_1.calculateCapitalGain)({
                salePrice: 200000,
                acquisitionCost: 120000,
                improvementCosts: 10000,
                sellingCosts: 5000,
                cgtRate: 0.2
            });
            assert_1.default.strictEqual(gain.capitalGain, 65000);
            assert_1.default.strictEqual(gain.cgtAmount, 13000);
            assert_1.default.notStrictEqual(gain.cgtAmount, 40000);
            assert_1.default.ok(!(0, cgtCalculation_1.isFlatSalePriceCgt)(200000, gain.cgtAmount));
            const missing = (0, cgtCalculation_1.calculateCapitalGain)({ salePrice: 200000, cgtRate: 0.2 });
            assert_1.default.strictEqual(missing.cgtAmount, 0);
            assert_1.default.strictEqual(missing.reviewRequired, true);
            const loss = (0, cgtCalculation_1.calculateCapitalGain)({ salePrice: 100, acquisitionCost: 150, cgtRate: 0.2 });
            assert_1.default.ok(loss.capitalGain < 0);
            assert_1.default.strictEqual(loss.cgtAmount, 0);
            const zero = (0, cgtCalculation_1.calculateCapitalGain)({ salePrice: 100, acquisitionCost: 100, cgtRate: 0.2 });
            assert_1.default.strictEqual(zero.cgtAmount, 0);
            results['CGT from capital gain'] = 'PASS';
        }
        // CGWT independent of CGT
        {
            const cgwt = (0, cgtCalculation_1.calculateCapitalGainsWithholding)({ saleConsideration: 200000, cgwtRate: 0.15 });
            const cgt = (0, cgtCalculation_1.calculateCapitalGain)({
                salePrice: 200000,
                acquisitionCost: 120000,
                cgtRate: 0.2
            });
            assert_1.default.strictEqual(cgwt.cgwtAmount, 30000);
            assert_1.default.notStrictEqual(cgwt.cgwtAmount, cgt.cgtAmount);
            const unconfigured = (0, cgtCalculation_1.calculateCapitalGainsWithholding)({ saleConsideration: 200000 });
            assert_1.default.strictEqual(unconfigured.cgwtAmount, 0);
            assert_1.default.ok(unconfigured.reviewRequired);
            results['CGT withholding separate'] = 'PASS';
        }
        // Settlement waterfall does not deduct final CGT
        {
            const waterfall = (0, settlementWaterfall_1.buildSettlementWaterfall)({
                grossSaleProceeds: 200000,
                saleVat: 0,
                cgwt: 30000,
                agencyCommission: 10000,
                vatOnCommission: 1550
            });
            assert_1.default.strictEqual(waterfall.sellerNetProceeds, 158450);
            assert_1.default.ok(!waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_TAX'));
            assert_1.default.ok(waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_WITHHOLDING_TAX'));
            const summary = (0, taxEngine_1.generateTaxSummary)({
                salePrice: 200000,
                commissionAmount: 10000,
                vatOnCommissionAmount: 1550,
                acquisitionCost: 120000,
                cgtRate: 0.2,
                cgwtRate: 0.15
            });
            assert_1.default.strictEqual(summary.cgt.cgtAmount, 16000);
            assert_1.default.strictEqual(summary.cgwt.cgwtAmount, 30000);
            assert_1.default.notStrictEqual(summary.sellerNetPayout, (0, money_1.roundMoney)(200000 - summary.cgt.cgtAmount - 10000 - 1550));
            results['Settlement waterfall'] = 'PASS';
        }
        // VAT payment clears 2101
        {
            const lines = (0, principalAgentJournal_1.buildVatPaymentJournal)({ amount: 3500 });
            assert_1.default.deepStrictEqual(lines[0], { accountCode: chartAccounts_1.GL.VAT_PAYABLE, debit: 3500 });
            assert_1.default.deepStrictEqual(lines[1], { accountCode: chartAccounts_1.GL.COMPANY_BANK, credit: 3500 });
            const withhold = (0, principalAgentJournal_1.buildWithholdingJournal)({ amount: 30000, fromPayableAccount: chartAccounts_1.GL.SELLER_PAYABLE });
            assert_1.default.ok(withhold.some((l) => l.accountCode === chartAccounts_1.GL.ZIMRA_WITHHOLDING && l.credit === 30000));
            const remit = (0, principalAgentJournal_1.buildWithholdingRemittanceJournal)({ amount: 30000 });
            assert_1.default.ok(remit.some((l) => l.accountCode === chartAccounts_1.GL.ZIMRA_WITHHOLDING && l.debit === 30000));
            assert_1.default.ok(remit.some((l) => l.accountCode === chartAccounts_1.GL.TRUST_BANK && l.credit === 30000));
            results['VAT / withholding GL movement'] = 'PASS';
        }
        // Orchestrator still canonical
        {
            const orch = srcFile('services/paymentAccountingOrchestrator.ts');
            assert_1.default.ok(orch.includes('syncPaymentReceived'));
            assert_1.default.ok(orch.includes('postCompanyCommission'));
            const integration = srcFile('services/accountingIntegrationService.ts');
            assert_1.default.ok(integration.includes('buildAgentReceiptJournal'));
            assert_1.default.ok(integration.includes('upsertPaymentTaxObligation'));
            assert_1.default.ok(integration.includes('Agent collection'));
            assert_1.default.ok(!integration.includes("accountCode: '1001', debit"));
            results['Orchestrator + agent journal wiring'] = 'PASS';
        }
        // Fiscalisation not claimed from local QR
        {
            const fiscal = srcFile('services/fiscalizationService.ts');
            assert_1.default.ok(fiscal.includes("status: 'NOT_FISCALISED'"));
            assert_1.default.ok(fiscal.includes('FDMS integration is not implemented'));
            const zimra = srcFile('services/zimraPaymentService.ts');
            assert_1.default.ok(zimra.includes('attachTaxPaymentReceipt'));
            assert_1.default.ok(!/attachTaxPaymentReceipt[\s\S]*status:\s*'PAID'/.test(zimra), 'receipt upload must not mark tax paid');
            results['Fiscalisation not falsely claimed'] = 'PASS';
        }
        // Dated 15.5% seed exists for new rate tables
        {
            const rateSvc = srcFile('services/taxRateService.ts');
            assert_1.default.ok(rateSvc.includes('STANDARD_VAT_PERCENT_FROM_2026'));
            const vatCalc = srcFile('services/tax/vatCalculation.ts');
            assert_1.default.ok(vatCalc.includes('STANDARD_VAT_PERCENT_BEFORE_2026'), 'the pre-2026 rate constant lives in the VAT calculation module');
            assert_1.default.ok(vatCalc.includes('15.5'));
            results['Dated VAT rate seed'] = 'PASS';
        }
        // UI does not hardcode sample PAYE/VAT/corporate figures; compliance page exists
        {
            const reports = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'AccountantDashboard', 'ReportsPage.tsx'), 'utf8');
            assert_1.default.ok(!reports.includes('currency(620)'), 'PAYE sample figure must be removed');
            assert_1.default.ok(!reports.includes('currency(1450)'), 'VAT sample figure must be removed');
            assert_1.default.ok(!reports.includes('currency(2100)'), 'Corporate tax sample figure must be removed');
            const taxPage = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'AccountantDashboard', 'TaxCompliancePage.tsx'), 'utf8');
            assert_1.default.ok(taxPage.includes('Record ZIMRA payment'));
            assert_1.default.ok(taxPage.includes('does not file returns with ZIMRA'));
            results['Hardcoded tax report data'] = 'PASS';
        }
        {
            const doc = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', '..', 'PHASE8_TAX_TRUST_COMPLIANCE.md'), 'utf8');
            assert_1.default.ok(doc.includes('submit the return to ZIMRA'));
            assert_1.default.ok(doc.includes('NOT IMPLEMENTED'));
            results['Compliance documentation'] = 'PASS';
        }
        console.log(JSON.stringify({ phase: 8, results }, null, 2));
        const failed = Object.values(results).filter((v) => v !== 'PASS');
        if (failed.length)
            process.exit(1);
    });
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
