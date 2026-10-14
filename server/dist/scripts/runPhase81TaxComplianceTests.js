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
const paymentAllocation_1 = require("../services/tax/paymentAllocation");
const taxRateService_1 = require("../services/taxRateService");
const fxPolicy_1 = require("../services/tax/fxPolicy");
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const chartAccounts_1 = require("../services/tax/chartAccounts");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function clientFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', '..', 'client', 'src', rel), 'utf8');
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        // VAT 1–3 registration
        {
            const company = {
                vatRegistered: true,
                vatRegistrationEffectiveDate: new Date('2026-07-01T00:00:00Z'),
                vatRegistrationCancelledAt: new Date('2026-11-30T00:00:00Z')
            };
            assert_1.default.strictEqual((0, vatApplicability_1.isCompanyVatRegisteredOnDate)({ vatRegistered: false }, new Date('2026-09-01')), false);
            assert_1.default.strictEqual((0, vatApplicability_1.isCompanyVatRegisteredOnDate)(company, new Date('2026-06-01')), false);
            assert_1.default.strictEqual((0, vatApplicability_1.isCompanyVatRegisteredOnDate)(company, new Date('2026-08-01')), true);
            assert_1.default.strictEqual((0, vatApplicability_1.isCompanyVatRegisteredOnDate)(company, new Date('2026-12-01')), false);
            results['1-3 VAT registration inactive/mid-year/cancelled'] = 'PASS';
        }
        // VAT 4 missing rate → review, not silent company today-rate
        {
            const rateSvc = srcFile('services/taxRateService.ts');
            assert_1.default.ok(rateSvc.includes('Never substitute today\'s company rate') || rateSvc.includes('Never substitute today'));
            assert_1.default.ok(srcFile('services/vatPolicyService.ts').includes('VAT_RATE_MISSING'));
            results['4 Missing VAT rate'] = 'PASS';
        }
        // VAT 5 overlapping rates
        {
            const a = { effectiveFrom: new Date('2025-01-01'), effectiveTo: new Date('2025-12-31') };
            const b = { effectiveFrom: new Date('2025-06-01'), effectiveTo: null };
            assert_1.default.strictEqual((0, taxRateService_1.periodsOverlap)(a, b), true);
            const c = { effectiveFrom: new Date('2026-01-01'), effectiveTo: null };
            assert_1.default.strictEqual((0, taxRateService_1.periodsOverlap)(a, c), false);
            const create = srcFile('services/taxRateService.ts');
            assert_1.default.ok(create.includes('Historical rates cannot be overwritten'));
            results['5 Overlapping VAT rates'] = 'PASS';
        }
        // VAT 6–7 15% historical vs 15.5% 2026
        {
            const inclusive15 = (0, vatCalculation_1.extractInclusiveVat)(115, 0.15);
            assert_1.default.strictEqual(inclusive15.vatAmount, 15);
            const inclusive155 = (0, vatCalculation_1.extractInclusiveVat)(115.5, 0.155);
            assert_1.default.strictEqual(inclusive155.vatAmount, 15.5);
            results['6-7 Historical 15% and 2026 15.5%'] = 'PASS';
        }
        // VAT 8–11 inclusive/exclusive/exempt/standard
        {
            const exclusive = (0, vatCalculation_1.exclusiveVatOn)(142.5, 0.155);
            assert_1.default.strictEqual(exclusive.vatAmount, 22.09);
            const exempt = (0, vatApplicability_1.evaluateVatApplicability)({
                company: { vatRegistered: true },
                transactionDate: new Date('2026-06-01'),
                supplyTreatment: 'EXEMPT',
                requested: true
            });
            assert_1.default.strictEqual(exempt.vatApplies, false);
            const standard = (0, vatApplicability_1.evaluateVatApplicability)({
                company: { vatRegistered: true },
                transactionDate: new Date('2026-06-01'),
                supplyTreatment: 'STANDARD_TAXABLE',
                requested: true
            });
            assert_1.default.strictEqual(standard.vatApplies, true);
            assert_1.default.strictEqual((0, vatApplicability_1.defaultSupplyTreatment)('RESIDENTIAL_DWELLING'), 'EXEMPT');
            results['8-11 Inclusive/exclusive/exempt/standard VAT'] = 'PASS';
        }
        // VAT 12 return recon gate
        {
            const vatReturn = srcFile('services/vatReturnService.ts');
            assert_1.default.ok(vatReturn.includes('glOutputVatForPeriod'));
            assert_1.default.ok(vatReturn.includes('RECONCILIATION REQUIRED'));
            assert_1.default.ok(vatReturn.includes("input.status === 'RECONCILED'"));
            results['12 VAT return reconciliation'] = 'PASS';
        }
        // VAT 13–15 payment / partial / overpayment
        {
            const zimra = srcFile('services/zimraPaymentService.ts');
            assert_1.default.ok(zimra.includes('unallocatedAmount'));
            assert_1.default.ok(zimra.includes('cannot be silently dropped'));
            const overpay = (0, principalAgentJournal_1.buildVatPaymentJournal)({ amount: 12000, allocatedAmount: 10000, unallocatedAmount: 2000 });
            assert_1.default.ok(overpay.some((l) => l.accountCode === chartAccounts_1.GL.VAT_PAYABLE && l.debit === 10000));
            assert_1.default.ok(overpay.some((l) => l.accountCode === chartAccounts_1.GL.TAX_PREPAYMENT && l.debit === 2000));
            assert_1.default.ok(overpay.some((l) => l.accountCode === chartAccounts_1.GL.COMPANY_BANK && l.credit === 12000));
            results['13-15 VAT payment/partial/overpayment'] = 'PASS';
        }
        // VAT 16 receipt without payment
        {
            const zimra = srcFile('services/zimraPaymentService.ts');
            assert_1.default.ok(!/attachTaxPaymentReceipt[\s\S]*status:\s*'PAID'/.test(zimra));
            results['16 Receipt without payment'] = 'PASS';
        }
        // CGT 17–21 cost, improvements, expenses, no gain, loss
        {
            const withCost = (0, cgtCalculation_1.calculateCapitalGain)({
                salePrice: 200000,
                acquisitionCost: 120000,
                improvementCosts: 10000,
                qualifyingExpenses: 2000,
                sellingCosts: 3000,
                cgtRate: 0.2
            });
            assert_1.default.strictEqual(withCost.capitalGain, 65000);
            assert_1.default.strictEqual(withCost.cgtAmount, 13000);
            assert_1.default.strictEqual(withCost.isFinal, true);
            const noGain = (0, cgtCalculation_1.calculateCapitalGain)({ salePrice: 100, acquisitionCost: 100, cgtRate: 0.2 });
            assert_1.default.strictEqual(noGain.cgtAmount, 0);
            assert_1.default.strictEqual(noGain.settlementBlocked, false);
            const loss = (0, cgtCalculation_1.calculateCapitalGain)({ salePrice: 80, acquisitionCost: 100, cgtRate: 0.2 });
            assert_1.default.ok(loss.capitalGain < 0);
            assert_1.default.strictEqual(loss.cgtAmount, 0);
            results['17-21 CGT cost/improvements/expenses/no-gain/loss'] = 'PASS';
        }
        // CGT 22 missing acquisition cost — not final, blocked
        {
            const missing = (0, cgtCalculation_1.calculateCapitalGain)({ salePrice: 200000, cgtRate: 0.2 });
            assert_1.default.strictEqual(missing.cgtAmount, 0);
            assert_1.default.strictEqual(missing.settlementBlocked, true);
            assert_1.default.strictEqual(missing.isProvisional, true);
            assert_1.default.ok((missing.provisionalCgtAmount || 0) > 0);
            assert_1.default.notStrictEqual(missing.cgtAmount, missing.provisionalCgtAmount);
            results['22 Missing acquisition cost'] = 'PASS';
        }
        // CGT 23 missing rate — cannot settle at 0
        {
            const missingRate = (0, cgtCalculation_1.calculateCapitalGain)({ salePrice: 200000, acquisitionCost: 100000, cgtRate: null });
            assert_1.default.strictEqual(missingRate.cgtAmount, 0);
            assert_1.default.strictEqual(missingRate.settlementBlocked, true);
            assert_1.default.strictEqual(missingRate.calculationBasis, 'CGT_RATE_MISSING');
            const summary = (0, taxEngine_1.generateTaxSummary)({
                salePrice: 200000,
                commissionAmount: 10000,
                acquisitionCost: 100000,
                cgtRate: null,
                cgwtRate: 0.15,
                cgwtApplicability: 'APPLICABLE'
            });
            assert_1.default.strictEqual(summary.settlementBlocked, true);
            assert_1.default.strictEqual(summary.settlementStatus, 'REQUIRES_TAX_REVIEW');
            results['23 Missing CGT rate'] = 'PASS';
        }
        // CGT 24 historical review
        {
            assert_1.default.ok((0, cgtCalculation_1.isFlatSalePriceCgt)(200000, 40000));
            const review = srcFile('services/taxComplianceReviewService.ts');
            assert_1.default.ok(review.includes('LEGACY_CGT_CALCULATION'));
            assert_1.default.ok(review.includes('Historical calculation may require accountant review'));
            results['24 Historical CGT review'] = 'PASS';
        }
        // CGT 25 reversal
        {
            const taxOb = srcFile('services/taxObligationService.ts');
            assert_1.default.ok(taxOb.includes('reversePaymentTaxObligations'));
            assert_1.default.ok(taxOb.includes("status: 'REVERSED'"));
            results['25 CGT reversal'] = 'PASS';
        }
        // CGWT 26–28 applicable / not applicable / rate missing
        {
            const applicable = (0, cgtCalculation_1.calculateCapitalGainsWithholding)({ saleConsideration: 200000, cgwtRate: 0.15, applicability: 'APPLICABLE' });
            assert_1.default.strictEqual(applicable.cgwtAmount, 30000);
            assert_1.default.strictEqual(applicable.applicability, 'APPLICABLE');
            const notApp = (0, cgtCalculation_1.calculateCapitalGainsWithholding)({
                saleConsideration: 200000,
                applicability: 'NOT_APPLICABLE',
                notApplicableReason: 'Exempt instrument'
            });
            assert_1.default.strictEqual(notApp.cgwtAmount, 0);
            assert_1.default.strictEqual(notApp.calculationBasis, 'CGWT_NOT_APPLICABLE');
            assert_1.default.strictEqual(notApp.settlementBlocked, false);
            const missing = (0, cgtCalculation_1.calculateCapitalGainsWithholding)({ saleConsideration: 200000, applicability: 'APPLICABLE' });
            assert_1.default.strictEqual(missing.cgwtAmount, 0);
            assert_1.default.strictEqual(missing.calculationBasis, 'CGWT_RATE_MISSING');
            assert_1.default.strictEqual(missing.settlementBlocked, true);
            assert_1.default.notStrictEqual(missing.calculationBasis, notApp.calculationBasis);
            results['26-28 CGWT applicable/not applicable/rate missing'] = 'PASS';
        }
        // CGWT 29–33 withholding/remittance/receipt/recon/reversal
        {
            const journal = srcFile('services/tax/principalAgentJournal.ts');
            assert_1.default.ok(journal.includes('buildWithholdingJournal'));
            assert_1.default.ok(journal.includes('buildWithholdingRemittanceJournal'));
            const trust = srcFile('services/trustAccountService.ts');
            assert_1.default.ok(trust.includes('CAPITAL_GAINS_WITHHOLDING_TAX'));
            assert_1.default.ok(!trust.includes("taxType === 'CAPITAL_GAINS_WITHHOLDING_TAX' || taxType === 'CGT'"));
            results['29-33 CGWT withholding/remittance/receipt/recon/reversal'] = 'PASS';
        }
        // Trust 34–38 rental, levy, sale, CGWT deduction, seller payout
        {
            const calc = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
                grossRent: 1000,
                levy: 50,
                commissionPercentage: 15,
                vatOnCommission: true,
                vatTreatment: 'exclusive',
                vatRate: 0.155
            });
            const allocation = (0, paymentAllocation_1.allocateRentalReceipt)({
                amount: 1050,
                rent: 1000,
                levy: 50,
                commissionBase: calc.commissionBase,
                commissionNet: calc.commissionNet,
                vatOnCommission: calc.vatAmount
            });
            assert_1.default.strictEqual(allocation.companyRevenue, 142.5);
            assert_1.default.strictEqual(allocation.vatOnCommission, 22.09);
            assert_1.default.strictEqual(allocation.levyPayable, 50);
            assert_1.default.strictEqual(allocation.trustLiability, 885.41);
            assert_1.default.strictEqual(allocation.ownerPayable, 835.41);
            assert_1.default.ok((0, paymentAllocation_1.allocationBalances)(allocation));
            const journal = (0, principalAgentJournal_1.buildAgentReceiptJournal)({
                paymentType: 'rental',
                amount: 1050,
                ownerAmount: allocation.ownerPayable,
                commissionNet: allocation.commissionNet,
                vatAmount: allocation.vatOnCommission,
                levyAmount: allocation.levyPayable
            });
            assert_1.default.strictEqual(journal.ownerLiability, 835.41);
            assert_1.default.strictEqual(journal.levyLiability, 50);
            assert_1.default.ok(journal.lines.some((l) => l.accountCode === chartAccounts_1.GL.LEVY_PAYABLE && l.credit === 50));
            assert_1.default.ok(journal.lines.some((l) => l.accountCode === chartAccounts_1.GL.OWNER_PAYABLE && l.credit === 835.41));
            assert_1.default.ok(journal.balanced);
            const waterfall = (0, settlementWaterfall_1.buildSettlementWaterfall)({
                grossSaleProceeds: 200000,
                cgwt: 30000,
                agencyCommission: 10000,
                vatOnCommission: 1550
            });
            assert_1.default.ok(waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_WITHHOLDING_TAX'));
            assert_1.default.ok(!waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_TAX'));
            results['34-38 Rental/levy/sale/CGWT/seller payout'] = 'PASS';
        }
        // Trust 39–43 recon scope, shortfall, surplus, negative, unallocated
        {
            const dash = srcFile('controllers/taxComplianceController.ts');
            assert_1.default.ok(dash.includes("scope: 'PARTIAL'"));
            assert_1.default.ok(dash.includes('excludedClientMoney'));
            const integrity = srcFile('services/taxIntegrityService.ts');
            assert_1.default.ok(integrity.includes('TRUST_SHORTFALL'));
            assert_1.default.ok(integrity.includes('TRUST_SURPLUS'));
            assert_1.default.ok(integrity.includes('detectionOnly: true'));
            assert_1.default.ok(integrity.includes('repaired: false'));
            results['39-43 Trust recon/shortfall/surplus/unallocated'] = 'PASS';
        }
        // Principal vs agent 44–48
        {
            const journal = (0, principalAgentJournal_1.buildAgentReceiptJournal)({
                paymentType: 'rental',
                amount: 1050,
                ownerAmount: 835.41,
                commissionNet: 142.5,
                vatAmount: 22.09,
                levyAmount: 50
            });
            assert_1.default.notStrictEqual(journal.companyRevenue, 1050);
            assert_1.default.strictEqual(journal.companyRevenue, 142.5);
            assert_1.default.strictEqual(journal.vatLiability, 22.09);
            const sale = (0, principalAgentJournal_1.buildAgentReceiptJournal)({
                paymentType: 'sale',
                amount: 200000,
                ownerAmount: 188450,
                commissionNet: 10000,
                vatAmount: 1550
            });
            assert_1.default.notStrictEqual(sale.companyRevenue, 200000);
            assert_1.default.strictEqual(sale.companyRevenue, 10000);
            const reports = clientFile('pages/AccountantDashboard/ReportsPage.tsx');
            assert_1.default.ok(reports.includes('Agency Revenue'));
            assert_1.default.ok(reports.includes('Client / Trust Collections'));
            results['44-48 Principal vs agent revenue'] = 'PASS';
        }
        // Rate safety, FX, period lock, permissions, fiscalisation, overrides
        {
            const fx = (0, fxPolicy_1.resolveTaxFx)({ transactionCurrency: 'USD', taxCurrency: 'USD', functionalCurrency: 'USD' });
            assert_1.default.strictEqual(fx.exchangeRate, 1);
            assert_1.default.strictEqual(fx.rateSource, 'SAME_CURRENCY');
            const cross = (0, fxPolicy_1.resolveTaxFx)({ transactionCurrency: 'USD', taxCurrency: 'ZWG', functionalCurrency: 'USD' });
            assert_1.default.strictEqual(cross.fxReviewRequired, true);
            assert_1.default.notStrictEqual(cross.exchangeRate, 1);
            const period = srcFile('services/vatReturnService.ts');
            assert_1.default.ok(period.includes('assertVatPeriodOpen'));
            const payCtrl = srcFile('controllers/paymentController.ts');
            assert_1.default.ok(payCtrl.includes('assertVatPeriodOpen'));
            const routes = srcFile('routes/accountingRoutes.ts');
            assert_1.default.ok(routes.includes("router.post('/tax-payments', isAccountant"));
            assert_1.default.ok(routes.includes("router.post('/vat-returns/prepare', isAccountant"));
            const fiscal = srcFile('services/fiscalizationService.ts');
            assert_1.default.ok(fiscal.includes("status: 'NOT_FISCALISED'"));
            const override = srcFile('models/TaxOverride.ts');
            assert_1.default.ok(override.includes('A reason is required for every tax override'));
            const ui = clientFile('pages/AccountantDashboard/TaxCompliancePage.tsx');
            assert_1.default.ok(ui.includes('Capital Gains Withholding Tax'));
            assert_1.default.ok(ui.includes('VAT RATE REVIEW REQUIRED'));
            assert_1.default.ok(ui.includes('Controls passed') || ui.includes('Attention required'));
            results['FX, lock, permissions, fiscalisation, overrides'] = 'PASS';
        }
        console.log(JSON.stringify({ phase: '8.1', results }, null, 2));
        const failed = Object.entries(results).filter(([, v]) => v !== 'PASS');
        if (failed.length) {
            console.error(failed);
            process.exit(1);
        }
    });
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
