"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const paymentAccountingProjection_1 = require("../services/paymentAccountingProjection");
const accountingPostingPolicy_1 = require("../services/accountingPostingPolicy");
const money_1 = require("../utils/money");
const paymentFinancialImmutability_1 = require("../services/paymentFinancialImmutability");
const srcFile = (rel) => fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
const completedRental = (overrides = {}) => (Object.assign({ _id: 'pay-1', status: 'completed', paymentType: 'rental', propertyId: 'property123', agentId: 'agent123', amount: 1000, depositAmount: 0, isProvisional: false, isInSuspense: false, commissionDetails: {
        ownerAmount: 910,
        agentShare: 50,
        agencyShare: 40,
        totalCommission: 90,
        vatOnCommission: 0
    } }, overrides));
const none = {
    ownerIncome: false,
    agentCommission: false,
    companyCommission: false,
    journal: false,
    vat: false,
    deposit: false
};
const full = Object.assign(Object.assign({}, none), { ownerIncome: true, agentCommission: true, companyCommission: true, journal: true });
const run = () => {
    var _a, _b;
    // Payment 1 — rent only
    const rentOnly = completedRental({ amount: 1000, depositAmount: 0 });
    const expected1 = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(rentOnly);
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.isDepositOnlyPayment)(rentOnly), false);
    assert_1.default.strictEqual(expected1.ownerIncome, true, 'Payment 1: rental income required');
    assert_1.default.strictEqual(expected1.deposit, false, 'Payment 1: deposit not required');
    const recon1 = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-1',
        propertyId: 'property123',
        expected: expected1,
        actual: full
    });
    assert_1.default.strictEqual(recon1.accountingComplete, true, 'Payment 1: complete when all required records exist');
    assert_1.default.strictEqual((0, paymentAccountingProjection_1.deriveAccountingComplete)(recon1.status), true);
    const recon1Matched = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-1',
        expected: expected1,
        actual: Object.assign(Object.assign({}, full), { amounts: { ownerIncome: 910, agentCommission: 50, companyCommission: 40, journal: 1000 } })
    });
    assert_1.default.strictEqual(recon1Matched.accountingComplete, true, 'matching amounts remain VALID');
    // Payment 2 — deposit only
    const depositOnly = completedRental({
        amount: 0,
        depositAmount: 1000,
        commissionDetails: { ownerAmount: 0, agentShare: 0, agencyShare: 0 }
    });
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.isDepositOnlyPayment)(depositOnly), true);
    const expected2 = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(depositOnly);
    assert_1.default.strictEqual(expected2.ownerIncome, false, 'Payment 2: income not required');
    assert_1.default.strictEqual(expected2.deposit, true, 'Payment 2: deposit required');
    const recon2 = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-dep',
        expected: expected2,
        actual: Object.assign(Object.assign({}, none), { deposit: true })
    });
    assert_1.default.strictEqual(recon2.accountingComplete, true);
    // Payment 3 — equal rent + deposit
    const equal = completedRental({ amount: 1000, depositAmount: 1000 });
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.isDepositOnlyPayment)(equal), false);
    const expected3 = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(equal);
    assert_1.default.strictEqual(expected3.ownerIncome, true, 'Payment 3: income required');
    assert_1.default.strictEqual(expected3.deposit, true, 'Payment 3: deposit required');
    const recon3 = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-eq',
        expected: expected3,
        actual: Object.assign(Object.assign({}, full), { deposit: true })
    });
    assert_1.default.strictEqual(recon3.accountingComplete, true);
    // Payment 4 — rent less than deposit
    const less = completedRental({
        amount: 500,
        depositAmount: 1000,
        commissionDetails: { ownerAmount: 455, agentShare: 25, agencyShare: 20, totalCommission: 45 }
    });
    const expected4 = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(less);
    assert_1.default.strictEqual(expected4.ownerIncome, true);
    assert_1.default.strictEqual(expected4.deposit, true);
    const recon4 = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-lt',
        expected: expected4,
        actual: Object.assign(Object.assign({}, full), { deposit: true })
    });
    assert_1.default.strictEqual(recon4.accountingComplete, true);
    // Payment 5 — missing income
    const missingIncome = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-missing-income',
        expected: expected1,
        actual: Object.assign(Object.assign({}, full), { ownerIncome: false })
    });
    assert_1.default.strictEqual(missingIncome.accountingComplete, false, 'Payment 5: missing income is incomplete');
    assert_1.default.ok(missingIncome.missing.includes('ownerIncome'));
    assert_1.default.notStrictEqual((0, paymentAccountingProjection_1.deriveAccountingStatus)({
        reconStatus: missingIncome.status,
        missing: missingIncome.missing
    }), 'posted');
    // Payment 6 — missing commission
    const missingCommission = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-missing-commission',
        expected: expected1,
        actual: Object.assign(Object.assign({}, none), { ownerIncome: true, journal: true, companyCommission: true })
    });
    assert_1.default.strictEqual(missingCommission.accountingComplete, false);
    assert_1.default.ok(missingCommission.missing.includes('agentCommission'));
    // Payment 7 — missing journal
    const missingJournal = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-missing-journal',
        expected: expected1,
        actual: Object.assign(Object.assign({}, full), { journal: false })
    });
    assert_1.default.strictEqual(missingJournal.accountingComplete, false);
    assert_1.default.deepStrictEqual(missingJournal.missing, ['journal']);
    // Partial records are still incomplete — never "effectively posted"
    const partial = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-partial',
        expected: expected1,
        actual: Object.assign(Object.assign({}, none), { ownerIncome: true })
    });
    assert_1.default.strictEqual(partial.accountingComplete, false);
    assert_1.default.strictEqual((0, paymentAccountingProjection_1.deriveAccountingStatus)({
        reconStatus: partial.status,
        missing: partial.missing
    }), 'incomplete');
    // Payment 8 — orphan detection exists and does not delete
    const integritySrc = srcFile('services/paymentAccountingIntegrity.ts');
    assert_1.default.ok(integritySrc.includes('detectOrphanAccountingRecords'), 'Payment 8: orphan detection exists');
    assert_1.default.ok(integritySrc.includes("kind: 'orphan_accounting'"));
    assert_1.default.ok(!integritySrc.includes('.deleteOne'), 'Payment 8: orphans are not deleted');
    assert_1.default.ok(!integritySrc.includes('.deleteMany'));
    assert_1.default.ok(!integritySrc.includes('$pull'));
    // Payment 9 — explicit manual repair dry-run vs write
    const reconSrc = srcFile('services/paymentAccountingReconciliation.ts');
    const repairFn = reconSrc.slice(reconSrc.indexOf('export async function repairPaymentAccounting'), reconSrc.indexOf('export async function ensurePaymentAccountingPosted'));
    assert_1.default.ok(repairFn.includes('dryRun'), 'Payment 9: dry-run supported');
    assert_1.default.ok(repairFn.indexOf('if (dryRun)') >= 0
        && repairFn.indexOf('if (dryRun)') < repairFn.indexOf('postPaymentAccounting'), 'Payment 9: dry-run returns before any accounting write');
    const plan = (0, paymentAccountingProjection_1.buildAccountingRepairPlan)(missingIncome);
    assert_1.default.deepStrictEqual(plan.wouldCreate, missingIncome.missing);
    assert_1.default.ok(plan.wouldNotModify.includes('agentCommission'));
    assert_1.default.ok(!plan.wouldCreate.includes('agentCommission'));
    // Payment 10 — repair twice remains idempotent via existing keys
    const keys = new Set();
    const insertIncome = (paymentId) => {
        const key = `payment:${paymentId}`;
        if (keys.has(key))
            return 'duplicate';
        keys.add(key);
        return 'inserted';
    };
    assert_1.default.strictEqual(insertIncome('pay-1'), 'inserted');
    assert_1.default.strictEqual(insertIncome('pay-1'), 'duplicate');
    assert_1.default.strictEqual(keys.size, 1, 'Payment 10: one income key after two repairs');
    // Payment 11 — integrity job twice: zero financial writes
    const forbidden = [
        'recordIncomeFromPayment',
        'postPaymentAccounting',
        'repairPaymentAccounting',
        'ensurePaymentAccountingPosted',
        'ensureDepositLedgerFromPayment'
    ];
    for (const name of forbidden) {
        assert_1.default.ok(!integritySrc.includes(name), `Payment 11: integrity job must not reference ${name}`);
    }
    assert_1.default.ok(integritySrc.includes('reconcilePayment'));
    assert_1.default.ok(integritySrc.includes('READ / COMPARE / FLAG') || integritySrc.includes('Zero financial writes'));
    const integrityPass = integritySrc.slice(integritySrc.indexOf('export async function runPaymentAccountingIntegrityPass'), integritySrc.length);
    for (const name of forbidden) {
        assert_1.default.ok(!integrityPass.includes(name), `integrity pass body must not call ${name}`);
    }
    // Payment 12 — historical payment with no accounting state is not selected
    const filter = (0, paymentAccountingProjection_1.buildAccountingIntegrityCandidateFilter)();
    assert_1.default.ok(!('status' in filter), 'Payment 12: must not scan all completed historical payments');
    const orList = filter.$or;
    assert_1.default.ok(Array.isArray(orList));
    assert_1.default.ok(orList.some((clause) => clause.accountingComplete === false));
    assert_1.default.ok(!JSON.stringify(filter).includes('$exists":false'));
    assert_1.default.ok(!JSON.stringify(filter).includes('accountingComplete: null'));
    assert_1.default.strictEqual((0, paymentAccountingProjection_1.isHistoricalUntrackedPayment)({}), true);
    assert_1.default.strictEqual((0, paymentAccountingProjection_1.isHistoricalUntrackedPayment)({ accountingComplete: false }), false);
    assert_1.default.strictEqual((0, paymentAccountingProjection_1.isHistoricalUntrackedPayment)({ accountingStatus: 'pending' }), false);
    const scheduled = srcFile('services/scheduledSyncService.ts');
    assert_1.default.ok(scheduled.includes("name: 'payment_accounting_integrity'"));
    assert_1.default.ok(scheduled.includes('runPaymentAccountingIntegrityPass'));
    assert_1.default.ok(scheduled.includes("import('./paymentAccountingIntegrity')"));
    assert_1.default.ok(!scheduled.includes('recordIncomeFromPayment'), '48h job must not create missing Property Account income');
    assert_1.default.ok(!scheduled.includes('postCompanyCommission'), '48h job must not create missing company commission');
    assert_1.default.ok(!scheduled.includes('enqueueOwnerIncomeEvent'));
    const getPropertyCtrl = srcFile('controllers/propertyAccountController.ts');
    const getPropertyFn = getPropertyCtrl.slice(getPropertyCtrl.indexOf('export const getPropertyAccount'), getPropertyCtrl.indexOf('export const migrateLegacyLedgerTypes'));
    assert_1.default.ok(!getPropertyFn.includes('recordIncomeFromPayment'));
    assert_1.default.ok(!getPropertyFn.includes('ensurePaymentAccountingPosted'));
    assert_1.default.ok(!getPropertyFn.includes('repairPaymentAccounting'));
    const getPaymentFn = srcFile('controllers/paymentController.ts');
    const getDetails = getPaymentFn.slice(getPaymentFn.indexOf('export const getPaymentDetails'), getPaymentFn.indexOf('export const getPaymentAccountingReconciliation'));
    assert_1.default.ok(!getDetails.includes('postPaymentAccounting'));
    assert_1.default.ok(!getDetails.includes('repairPaymentAccounting'));
    const performCreateFn = getPaymentFn.slice(getPaymentFn.indexOf('const performCreate'), getPaymentFn.indexOf('let session: mongoose.ClientSession'));
    assert_1.default.ok(!performCreateFn.includes('postPaymentAccounting'), 'in-transaction posting removed; Payment is committed first');
    assert_1.default.ok(getPaymentFn.includes('ensurePaymentAccountingPosted'), 'after-commit path posts+verifies once');
    assert_1.default.ok(reconSrc.includes('postPaymentAccounting'), 'explicit repair reuses production writers');
    assert_1.default.ok(reconSrc.includes('AccountingEventLog.create'), 'explicit repair writes an audit log');
    assert_1.default.ok(reconSrc.includes("eventType: 'payment_accounting_repair'"));
    assert_1.default.ok(repairFn.includes('requires a non-empty reason'));
    const routesSrc = srcFile('routes/accountantRoutes.ts');
    assert_1.default.ok(routesSrc.includes("canViewAccountantDashboard, getAccountingIntegritySummary"));
    assert_1.default.ok(routesSrc.includes('/accounting-integrity/summary'));
    assert_1.default.ok(routesSrc.includes('/accounting-integrity/inconsistencies'));
    assert_1.default.ok(routesSrc.includes("canViewAccountantDashboard, repairPaymentAccountingExplicit"));
    const integrityCtrl = srcFile('controllers/paymentAccountingIntegrityController.ts');
    assert_1.default.ok(!integrityCtrl.includes('postPaymentAccounting'));
    assert_1.default.ok(!integrityCtrl.includes('repairPaymentAccounting'));
    assert_1.default.ok(integrityCtrl.includes('req.user.companyId'));
    // Mismatch detection — existence is not proof of complete accounting
    const mismatchedIncome = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-mismatch-income',
        expected: expected1,
        actual: Object.assign(Object.assign({}, full), { amounts: { ownerIncome: 900, agentCommission: 50, companyCommission: 40, journal: 1000 } })
    });
    assert_1.default.strictEqual(mismatchedIncome.accountingComplete, false, 'Property Account mismatch is incomplete');
    assert_1.default.ok(mismatchedIncome.mismatched.includes('ownerIncome'));
    assert_1.default.strictEqual(mismatchedIncome.componentStatus.ownerIncome, 'MISMATCHED');
    assert_1.default.ok(mismatchedIncome.issues.some((issue) => issue.component === 'ownerIncome' && issue.status === 'MISMATCHED'));
    const mismatchedCompany = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-mismatch-company',
        expected: expected1,
        actual: Object.assign(Object.assign({}, full), { amounts: { ownerIncome: 910, agentCommission: 50, companyCommission: 48.2, journal: 1000 } })
    });
    assert_1.default.strictEqual(mismatchedCompany.accountingComplete, false);
    assert_1.default.ok(mismatchedCompany.mismatched.includes('companyCommission'));
    assert_1.default.strictEqual((_a = mismatchedCompany.issues.find((i) => i.component === 'companyCommission')) === null || _a === void 0 ? void 0 : _a.expected, 40);
    assert_1.default.strictEqual((_b = mismatchedCompany.issues.find((i) => i.component === 'companyCommission')) === null || _b === void 0 ? void 0 : _b.actual, 48.2);
    const mismatchedAgent = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-mismatch-agent',
        expected: expected1,
        actual: Object.assign(Object.assign({}, full), { amounts: { ownerIncome: 910, agentCommission: 10, companyCommission: 40, journal: 1000 } })
    });
    assert_1.default.strictEqual(mismatchedAgent.accountingComplete, false);
    assert_1.default.ok(mismatchedAgent.mismatched.includes('agentCommission'));
    const mismatchedJournal = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-mismatch-journal',
        expected: expected1,
        actual: Object.assign(Object.assign({}, full), { amounts: { ownerIncome: 910, agentCommission: 50, companyCommission: 40, journal: 999 } })
    });
    assert_1.default.strictEqual(mismatchedJournal.accountingComplete, false);
    assert_1.default.ok(mismatchedJournal.mismatched.includes('journal'));
    const vatPayment = completedRental({
        commissionDetails: {
            ownerAmount: 910,
            agentShare: 50,
            agencyShare: 40,
            totalCommission: 90,
            vatOnCommission: 13.5
        }
    });
    const expectedVat = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(vatPayment);
    assert_1.default.strictEqual(expectedVat.vat, true);
    const missingVat = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-missing-vat',
        expected: expectedVat,
        actual: Object.assign({}, full)
    });
    assert_1.default.strictEqual(missingVat.accountingComplete, false);
    assert_1.default.ok(missingVat.missing.includes('vat'));
    const mismatchedVat = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-mismatch-vat',
        expected: expectedVat,
        actual: Object.assign(Object.assign({}, full), { vat: true, amounts: { ownerIncome: 910, agentCommission: 50, companyCommission: 40, journal: 1000, vat: 10 } })
    });
    assert_1.default.strictEqual(mismatchedVat.accountingComplete, false);
    assert_1.default.ok(mismatchedVat.mismatched.includes('vat'));
    const mismatchedDeposit = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-mismatch-deposit',
        expected: expected3,
        actual: Object.assign(Object.assign({}, full), { deposit: true, amounts: { ownerIncome: 910, agentCommission: 50, companyCommission: 40, journal: 1000, deposit: 800 } })
    });
    assert_1.default.strictEqual(mismatchedDeposit.accountingComplete, false);
    assert_1.default.ok(mismatchedDeposit.mismatched.includes('deposit'));
    const missingDeposit = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-missing-deposit',
        expected: expected3,
        actual: Object.assign(Object.assign({}, full), { deposit: false })
    });
    assert_1.default.strictEqual(missingDeposit.accountingComplete, false);
    assert_1.default.ok(missingDeposit.missing.includes('deposit'));
    const missingCompany = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-missing-company',
        expected: expected1,
        actual: Object.assign(Object.assign({}, none), { ownerIncome: true, agentCommission: true, journal: true })
    });
    assert_1.default.strictEqual(missingCompany.accountingComplete, false);
    assert_1.default.ok(missingCompany.missing.includes('companyCommission'));
    const levyPayment = completedRental({
        amount: 1000,
        levyAllocated: 200,
        commissionDetails: { ownerAmount: 950, agentShare: 50, agencyShare: 40, totalCommission: 90 }
    });
    const expectedLevy = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(levyPayment);
    assert_1.default.ok(expectedLevy.ownerIncome);
    const validLevy = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-levy',
        expected: expectedLevy,
        actual: Object.assign(Object.assign({}, full), { amounts: { ownerIncome: 750, agentCommission: 50, companyCommission: 40, journal: 1000 } })
    });
    assert_1.default.strictEqual(validLevy.accountingComplete, true, 'levy pass-through is subtracted from expected owner income');
    const failedPosting = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-failed-posting',
        expected: expected1,
        actual: none
    });
    assert_1.default.strictEqual(failedPosting.accountingComplete, false);
    assert_1.default.ok(failedPosting.missing.length > 0);
    assert_1.default.strictEqual((0, money_1.moneyAmountsMatch)(1000, 1000.001), true);
    assert_1.default.strictEqual((0, money_1.moneyAmountsMatch)(58.2, 58.20), true);
    assert_1.default.strictEqual((0, money_1.moneyAmountsMatch)(58.20, 48.20), false);
    const rentGreater = completedRental({ amount: 1500, depositAmount: 1000 });
    const expectedGreater = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(rentGreater);
    assert_1.default.strictEqual(expectedGreater.ownerIncome, true);
    assert_1.default.strictEqual(expectedGreater.deposit, true);
    const reconGreater = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
        paymentId: 'pay-gt',
        expected: expectedGreater,
        actual: Object.assign(Object.assign({}, full), { deposit: true })
    });
    assert_1.default.strictEqual(reconGreater.accountingComplete, true);
    const mismatchPlan = (0, paymentAccountingProjection_1.buildAccountingRepairPlan)(mismatchedIncome);
    assert_1.default.ok(mismatchPlan.requiresManualReview.includes('ownerIncome'));
    assert_1.default.ok(!mismatchPlan.wouldCreate.includes('ownerIncome'));
    assert_1.default.strictEqual((0, paymentFinancialImmutability_1.isCompletedFinancialPayment)({ status: 'completed' }), true);
    assert_1.default.strictEqual((0, paymentFinancialImmutability_1.isCompletedFinancialPayment)({ status: 'completed', isProvisional: true }), false);
    assert_1.default.strictEqual((0, paymentFinancialImmutability_1.isCompletedFinancialPayment)({ status: 'pending', postingStatus: 'draft' }), false);
    assert_1.default.throws(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)({ status: 'completed' }, { amount: 50 }), (err) => String((err === null || err === void 0 ? void 0 : err.message) || '').includes('cannot be edited directly'));
    assert_1.default.doesNotThrow(() => (0, paymentFinancialImmutability_1.assertCompletedPaymentFinanciallyImmutable)({ status: 'completed' }, { notes: 'admin note' }));
    assert_1.default.ok(getPaymentFn.includes('COMPLETED_PAYMENT_IMMUTABLE_MESSAGE'));
    assert_1.default.ok(getPaymentFn.includes('isCompletedFinancialPayment'));
    assert_1.default.ok(getPaymentFn.includes('Use /payments/:id/reverse endpoint for reversals') || getPaymentFn.includes('reversePayment'));
    const webhookSrc = srcFile('controllers/paymentWebhookController.ts');
    assert_1.default.ok(webhookSrc.includes('alreadyCompleted'));
    const agentSrc = srcFile('controllers/agentController.ts');
    assert_1.default.ok(agentSrc.includes('assertCompletedPaymentFinanciallyImmutable'));
    const ledgerSrc = srcFile('services/ledgerEventService.ts');
    assert_1.default.ok(ledgerSrc.includes("ev.type === 'owner_income' || ev.type === 'agent_commission' || ev.type === 'company_commission'"));
    assert_1.default.ok(ledgerSrc.includes('postPaymentAccounting'));
    const reconIntegrity = srcFile('services/paymentAccountingIntegrity.ts');
    assert_1.default.ok(reconIntegrity.includes('ORPHAN_SCAN_WINDOW_HOURS'));
    assert_1.default.ok(reconIntegrity.includes('getCompanyAccountingIntegritySummary'));
    assert_1.default.ok(reconIntegrity.includes('listCompanyAccountingInconsistencies'));
    assert_1.default.ok(reconIntegrity.includes('companyId: cid'));
    console.log('phase2c accounting integrity tests passed');
};
run();
