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
const paymentAllocation_1 = require("../services/tax/paymentAllocation");
const principalAgentJournal_1 = require("../services/tax/principalAgentJournal");
const chartAccounts_1 = require("../services/tax/chartAccounts");
const trustReconciliation_1 = require("../services/tax/trustReconciliation");
const accountingPeriodService_1 = require("../services/accountingPeriodService");
const ownerPropertyReconService_1 = require("../services/ownerPropertyReconService");
const vatCalculation_1 = require("../services/tax/vatCalculation");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function clientFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', '..', 'client', 'src', rel), 'utf8');
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        {
            const orch = srcFile('services/paymentAccountingOrchestrator.ts');
            assert_1.default.ok(orch.includes('export async function postPaymentAccounting'));
            assert_1.default.ok(srcFile('services/accountingIntegrationService.ts').includes('allocateRentalReceipt'));
            results['Phase 7 orchestrator still canonical'] = 'PASS';
        }
        {
            const example = (0, ownerPropertyReconService_1.canonicalRentLevyExample)();
            assert_1.default.ok(example.journalAgrees);
            assert_1.default.ok(example.companyRevenueIsCommission);
            assert_1.default.strictEqual(example.allocation.ownerPayable, 826.75);
            assert_1.default.strictEqual(example.allocation.levyPayable, 50);
            assert_1.default.ok((0, paymentAllocation_1.allocationBalances)(example.allocation));
            results['Canonical rent+levy = GL'] = 'PASS';
        }
        {
            const vat = (0, vatCalculation_1.exclusiveVatOn)(1000, 0.155);
            assert_1.default.strictEqual(vat.vatAmount, 155);
            const alloc = (0, paymentAllocation_1.allocateRentalReceipt)({
                amount: 1050,
                rent: 1000,
                levy: 50,
                commissionNet: 150,
                vatOnCommission: 23.25
            });
            const journal = (0, principalAgentJournal_1.buildAgentReceiptJournal)({
                paymentType: 'rental',
                amount: 1050,
                ownerAmount: alloc.ownerPayable,
                commissionNet: 150,
                vatAmount: 23.25,
                levyAmount: 50
            });
            assert_1.default.ok(!journal.lines.some((l) => l.accountCode === chartAccounts_1.GL.AGENCY_REVENUE && Number(l.credit || 0) === 1050));
            assert_1.default.ok(journal.lines.some((l) => l.accountCode === chartAccounts_1.GL.AGENCY_REVENUE && l.credit === 150));
            results['Gross rent is not company revenue'] = 'PASS';
        }
        {
            const full = (0, ownerPropertyReconService_1.classifyReceiptControlStatus)({ paymentAmount: 1050, rent: 1000, levy: 50 });
            assert_1.default.strictEqual(full.status, 'FULLY_ALLOCATED');
            const over = (0, ownerPropertyReconService_1.classifyReceiptControlStatus)({ paymentAmount: 1200, rent: 1000, levy: 50 });
            assert_1.default.strictEqual(over.status, 'OVERPAYMENT');
            assert_1.default.ok(over.unallocatedAmount >= 0);
            const partial = (0, ownerPropertyReconService_1.classifyReceiptControlStatus)({ paymentAmount: 800, rent: 1000, levy: 50 });
            assert_1.default.strictEqual(partial.status, 'PARTIALLY_ALLOCATED');
            const none = (0, ownerPropertyReconService_1.classifyReceiptControlStatus)({ paymentAmount: 0, rent: 1000, levy: 50 });
            assert_1.default.strictEqual(none.status, 'UNALLOCATED');
            results['Allocation control statuses'] = 'PASS';
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
            assert_1.default.strictEqual(balanced.scope, trustReconciliation_1.TRUST_RECON_SCOPE);
            assert_1.default.strictEqual(balanced.status, 'BALANCED_WITHIN_SCOPE');
            assert_1.default.notStrictEqual(balanced.status, 'RECONCILED');
            assert_1.default.ok(balanced.categories.every((c) => c.inScope === false || c.controlScope === 'IN_SCOPE'));
            assert_1.default.ok(balanced.categories.some((c) => c.controlScope === 'NOT_IMPLEMENTED'));
            assert_1.default.strictEqual((0, trustReconciliation_1.trustReconciliationStatus)(1), 'RECONCILIATION_EXCEPTION');
            results['Trust PARTIAL never FULL/RECONCILED'] = 'PASS';
        }
        {
            const { periodStart, periodEnd } = (0, accountingPeriodService_1.utcMonthBounds)(new Date('2026-09-16T12:00:00Z'));
            assert_1.default.ok(periodStart < periodEnd);
            const periodSrc = srcFile('services/accountingPeriodService.ts');
            assert_1.default.ok(periodSrc.includes("status === 'CLOSED'"));
            assert_1.default.ok(periodSrc.includes('A reopen reason is required'));
            assert_1.default.ok(periodSrc.includes('period_reopened'));
            assert_1.default.ok(!periodSrc.includes('automatically reopen'));
            results['Period close/reopen requires reason'] = 'PASS';
        }
        {
            const entry = srcFile('models/JournalEntry.ts');
            assert_1.default.ok(entry.includes('Journal entries are immutable after posting.'));
            assert_1.default.ok(entry.includes("pre('findOneAndUpdate'"));
            const line = srcFile('models/JournalLine.ts');
            assert_1.default.ok(line.includes('Journal lines are immutable after posting.'));
            const paymentImm = srcFile('services/paymentFinancialImmutability.ts');
            assert_1.default.ok(paymentImm.includes('cannot be edited directly'));
            results['Posted journal/payment immutability'] = 'PASS';
        }
        {
            const zimra = srcFile('services/zimraPaymentService.ts');
            assert_1.default.ok(!zimra.includes('taxpay:${input.companyId}:${Date.now()}'));
            assert_1.default.ok(zimra.includes('sourceId: `taxpay:${identity}`'));
            const manual = srcFile('controllers/accountingController.ts');
            assert_1.default.ok(manual.includes('sourceId: `manual:${reference}`'));
            const acct = srcFile('services/accountingService.ts');
            assert_1.default.ok(acct.includes('assertPeriodAllowsPosting'));
            results['Idempotent sourceIds + period gate on postTransaction'] = 'PASS';
        }
        {
            const routes = srcFile('routes/accountingRoutes.ts');
            assert_1.default.ok(routes.includes("router.post('/financial-integrity/run', isAccountant"));
            assert_1.default.ok(routes.includes("router.post('/periods/:id/reopen', isAccountant"));
            assert_1.default.ok(routes.includes("router.get('/trial-balance', canViewCommissions"));
            const roles = srcFile('middleware/roles.ts');
            assert_1.default.ok(roles.includes("throw new AppError('Authentication required', 401)"));
            assert_1.default.ok(roles.includes("throw new AppError('Access denied. Accountant role required.', 403)"));
            results['Control endpoints authenticated'] = 'PASS';
        }
        {
            const integrity = srcFile('services/financialControlsService.ts');
            assert_1.default.ok(integrity.includes('detectionOnly: true'));
            assert_1.default.ok(integrity.includes('repaired: false'));
            assert_1.default.ok(integrity.includes('TRUST_BANK_LIABILITY_MISMATCH'));
            const zimra = srcFile('services/zimraPaymentService.ts');
            assert_1.default.ok(!/attachTaxPaymentReceipt[\s\S]*status:\s*'PAID'/.test(zimra));
            const seller = clientFile('components/trust-accounts/SellerSettlementPanel.tsx');
            assert_1.default.ok(seller.includes('LEGACY CGT DEDUCTION'));
            results['Detection-only + tax receipt ≠ PAID + legacy CGT label'] = 'PASS';
        }
        {
            const ui = clientFile('pages/AccountantDashboard/FinancialControlsPage.tsx');
            assert_1.default.ok(ui.includes('BALANCED WITHIN SCOPE'));
            assert_1.default.ok(ui.includes('not a full trust-account reconciliation'));
            assert_1.default.ok(ui.includes('Month-end control checklist'));
            assert_1.default.ok(!ui.includes('FULL TRUST ACCOUNT RECONCILIATION'));
            const boot = srcFile('index.ts');
            assert_1.default.ok(boot.includes("phase: '9'"));
            results['Financial Controls UI + Phase 9 boot marker'] = 'PASS';
        }
        console.log(JSON.stringify({ phase: '9', results }, null, 2));
    });
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
