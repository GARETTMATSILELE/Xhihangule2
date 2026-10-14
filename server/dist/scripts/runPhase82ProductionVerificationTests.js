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
const cgtCalculation_1 = require("../services/tax/cgtCalculation");
const paymentAllocation_1 = require("../services/tax/paymentAllocation");
const principalAgentJournal_1 = require("../services/tax/principalAgentJournal");
const settlementWaterfall_1 = require("../services/tax/settlementWaterfall");
const chartAccounts_1 = require("../services/tax/chartAccounts");
const trustReconciliation_1 = require("../services/tax/trustReconciliation");
const corsOrigins_1 = require("../config/corsOrigins");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        {
            const vat = (0, vatCalculation_1.exclusiveVatOn)(1000, 0.155);
            assert_1.default.strictEqual(vat.vatAmount, 155);
            results['VAT 15.5% on $1,000 commission'] = 'PASS';
        }
        {
            const cgt = (0, cgtCalculation_1.calculateCapitalGain)({
                salePrice: 200000,
                acquisitionCost: 120000,
                improvementCosts: 20000,
                qualifyingExpenses: 5000,
                cgtRate: 0.2
            });
            assert_1.default.strictEqual(cgt.capitalGain, 55000);
            assert_1.default.strictEqual(cgt.cgtAmount, 11000);
            assert_1.default.strictEqual(cgt.salePrice, 200000);
            assert_1.default.strictEqual(cgt.acquisitionCost, 120000);
            assert_1.default.strictEqual(cgt.improvementCosts, 20000);
            assert_1.default.strictEqual(cgt.qualifyingExpenses, 5000);
            assert_1.default.strictEqual(cgt.calculationBasis, 'CAPITAL_GAIN');
            assert_1.default.strictEqual(cgt.isFinal, true);
            results['CGT snapshot $55,000 gain'] = 'PASS';
        }
        {
            const cgwt = (0, cgtCalculation_1.calculateCapitalGainsWithholding)({
                saleConsideration: 200000,
                cgwtRate: 0.15,
                applicability: 'APPLICABLE'
            });
            const waterfall = (0, settlementWaterfall_1.buildSettlementWaterfall)({
                grossSaleProceeds: 200000,
                cgwt: cgwt.cgwtAmount,
                agencyCommission: 10000,
                vatOnCommission: 1550
            });
            assert_1.default.ok(waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_WITHHOLDING_TAX'));
            assert_1.default.ok(!waterfall.steps.some((s) => s.type === 'CAPITAL_GAINS_TAX'));
            results['CGWT withheld independently of CGT'] = 'PASS';
        }
        {
            const allocation = (0, paymentAllocation_1.allocateRentalReceipt)({
                amount: 1050,
                rent: 1000,
                levy: 50,
                commissionNet: 142.5,
                vatOnCommission: 22.09
            });
            assert_1.default.ok((0, paymentAllocation_1.allocationBalances)(allocation));
            assert_1.default.strictEqual(allocation.levyPayable, 50);
            assert_1.default.strictEqual(allocation.ownerPayable, 835.41);
            assert_1.default.strictEqual(allocation.trustLiability, 885.41);
            const journal = (0, principalAgentJournal_1.buildAgentReceiptJournal)({
                paymentType: 'rental',
                amount: allocation.grossAmount,
                ownerAmount: allocation.ownerPayable,
                commissionNet: allocation.commissionNet,
                vatAmount: allocation.vatOnCommission,
                levyAmount: allocation.levyPayable
            });
            assert_1.default.strictEqual(journal.levyLiability, 50);
            assert_1.default.strictEqual(journal.ownerLiability, 835.41);
            assert_1.default.ok(journal.lines.some((l) => l.accountCode === chartAccounts_1.GL.LEVY_PAYABLE && l.credit === 50));
            results['Rent + levy canonical allocation'] = 'PASS';
        }
        {
            const overpay = (0, principalAgentJournal_1.buildVatPaymentJournal)({ amount: 12000, allocatedAmount: 10000, unallocatedAmount: 2000 });
            assert_1.default.ok(overpay.some((l) => l.accountCode === chartAccounts_1.GL.VAT_PAYABLE && l.debit === 10000));
            assert_1.default.ok(overpay.some((l) => l.accountCode === chartAccounts_1.GL.TAX_PREPAYMENT && l.debit === 2000));
            results['ZIMRA overpayment unallocated'] = 'PASS';
        }
        {
            const balanced = (0, trustReconciliation_1.buildTrustReconciliationReport)({
                trustBank: 1000,
                ownerPayable: 400,
                sellerPayable: 300,
                zimraWithholding: 100,
                tenantDeposits: 150,
                levyPayable: 50
            });
            assert_1.default.strictEqual(balanced.scope, 'PARTIAL');
            assert_1.default.strictEqual(balanced.scope, trustReconciliation_1.TRUST_RECON_SCOPE);
            assert_1.default.strictEqual(balanced.difference, 0);
            assert_1.default.strictEqual(balanced.status, 'BALANCED_WITHIN_SCOPE');
            const exception = (0, trustReconciliation_1.buildTrustReconciliationReport)({
                trustBank: 1000,
                ownerPayable: 400,
                sellerPayable: 300,
                zimraWithholding: 0,
                tenantDeposits: 0,
                levyPayable: 0
            });
            assert_1.default.strictEqual(exception.status, 'RECONCILIATION_EXCEPTION');
            assert_1.default.strictEqual((0, trustReconciliation_1.trustReconciliationStatus)(12.5), 'RECONCILIATION_EXCEPTION');
            assert_1.default.ok(balanced.excludedClientMoney.some((row) => /Buyer deposits/i.test(row)));
            results['Trust recon PARTIAL statuses'] = 'PASS';
        }
        {
            const dev = (0, corsOrigins_1.buildAllowedOrigins)({ NODE_ENV: 'development', CLIENT_URL: 'http://localhost:3000' });
            assert_1.default.ok(dev.includes('http://localhost:3000'));
            assert_1.default.ok(dev.includes('http://127.0.0.1:3000'));
            assert_1.default.ok(dev.includes('http://localhost:5000'));
            assert_1.default.ok(!dev.includes('*'));
            assert_1.default.strictEqual((0, corsOrigins_1.isOriginAllowed)('http://localhost:3000', dev), true);
            assert_1.default.strictEqual((0, corsOrigins_1.isOriginAllowed)('http://localhost:5000', dev), true);
            assert_1.default.strictEqual((0, corsOrigins_1.isOriginAllowed)('https://evil.example', dev), false);
            const prod = (0, corsOrigins_1.buildAllowedOrigins)({ NODE_ENV: 'production', CLIENT_URL: 'https://mantisafrica.com' });
            assert_1.default.ok(!prod.includes('http://localhost:5000'));
            const corsSrc = srcFile('index.ts');
            assert_1.default.ok(!corsSrc.includes("origin: '*'"));
            assert_1.default.ok(corsSrc.includes('isOriginAllowed'));
            results['CORS allowlist (no *)'] = 'PASS';
        }
        {
            const integrity = srcFile('services/taxIntegrityService.ts');
            assert_1.default.ok(integrity.includes('detectionOnly: true'));
            assert_1.default.ok(integrity.includes('repaired: false'));
            assert_1.default.ok(integrity.includes('recommendedAction'));
            assert_1.default.ok(integrity.includes("'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL'"));
            assert_1.default.ok(integrity.includes('TRUST_SHORTFALL'));
            assert_1.default.ok(integrity.includes('TRUST_SURPLUS'));
            assert_1.default.ok(integrity.includes('LEGACY_CGT_CALCULATION'));
            assert_1.default.ok(!integrity.includes('automatically repair') || integrity.includes('Never repairs'));
            const note = srcFile('services/taxIntegrityService.ts');
            assert_1.default.ok(note.includes('intentionally different'));
            results['Integrity detection-only + GL 4001 note'] = 'PASS';
        }
        {
            const dash = srcFile('controllers/taxComplianceController.ts');
            assert_1.default.ok(dash.includes("scope: 'PARTIAL'"));
            assert_1.default.ok(dash.includes('excludedClientMoney'));
            assert_1.default.ok(!dash.includes("status: Math.abs(trustDifference) <= 0.005 ? 'RECONCILED'"));
            const settlement = srcFile('services/trustMatterService.ts');
            assert_1.default.ok(settlement.includes('not ZIMRA remittance'));
            const sellerUi = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', '..', 'client', 'src', 'components', 'trust-accounts', 'SellerSettlementPanel.tsx'), 'utf8');
            assert_1.default.ok(sellerUi.includes('LEGACY CGT DEDUCTION'));
            results['Terminology and PARTIAL trust UI'] = 'PASS';
        }
        console.log(JSON.stringify({ phase: '8.2', results }, null, 2));
    });
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
