"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const paymentAccountingProjection_1 = require("../services/paymentAccountingProjection");
const accountingPostingPolicy_1 = require("../services/accountingPostingPolicy");
const transactionDomain_1 = require("../services/transactionDomain");
const journalDuplicateKey_1 = require("../services/journalDuplicateKey");
const journalRecoveryAssessment_1 = require("../services/journalRecoveryAssessment");
const src = (rel) => fs_1.default.readFileSync(path_1.default.join(__dirname, '..', rel), 'utf8');
const company = 'company-a';
const paymentId = 'payment-1';
const otherPaymentId = 'payment-2';
const own = (0, journalRecoveryAssessment_1.classifyReceiptJournals)({
    paymentId,
    companyId: company,
    reference: 'PAY-RCPT-2541DC-2026-07',
    sourceModule: 'payment',
    journals: [{
            _id: 'journal-own',
            companyId: company,
            sourceId: paymentId,
            sourceModule: 'payment',
            reference: 'PAY-RCPT-2541DC-2026-07',
            status: 'posted'
        }]
});
assert_1.default.ok(own.ownJournal, 'a posted receipt journal for this company and payment is recognised');
assert_1.default.strictEqual(own.referenceCollision, null);
const commissionOnly = (0, journalRecoveryAssessment_1.classifyReceiptJournals)({
    paymentId,
    companyId: company,
    reference: 'PAY-RCPT-1',
    sourceModule: 'payment',
    journals: [{
            companyId: company,
            sourceId: `${paymentId}:commission`,
            sourceModule: 'commission',
            reference: 'COM-RCPT-1',
            status: 'posted'
        }]
});
assert_1.default.strictEqual(commissionOnly.ownJournal, null, 'a commission journal is not the receipt journal');
const collision = (0, journalRecoveryAssessment_1.classifyReceiptJournals)({
    paymentId,
    companyId: company,
    reference: 'PAY-SHARED',
    sourceModule: 'payment',
    journals: [{
            _id: 'journal-other',
            companyId: company,
            sourceId: otherPaymentId,
            sourceModule: 'payment',
            reference: 'PAY-SHARED',
            status: 'posted'
        }]
});
assert_1.default.strictEqual(collision.ownJournal, null, 'another payment id is not adopted');
assert_1.default.strictEqual((_a = collision.referenceCollision) === null || _a === void 0 ? void 0 : _a.otherPaymentId, otherPaymentId);
const otherCompany = (0, journalRecoveryAssessment_1.classifyReceiptJournals)({
    paymentId,
    companyId: company,
    reference: 'PAY-SHARED',
    sourceModule: 'payment',
    journals: [{
            _id: 'journal-b',
            companyId: 'company-b',
            sourceId: paymentId,
            sourceModule: 'payment',
            reference: 'PAY-SHARED',
            status: 'posted'
        }]
});
assert_1.default.strictEqual(otherCompany.ownJournal, null, 'another company journal is not used');
assert_1.default.strictEqual((_b = otherCompany.otherCompanyReference) === null || _b === void 0 ? void 0 : _b.companyId, 'company-b');
assert_1.default.strictEqual(otherCompany.referenceCollision, null);
const expected = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)({
    _id: paymentId,
    status: 'completed',
    paymentType: 'rental',
    amount: 1150,
    depositAmount: 0,
    commissionDetails: {
        commissionNet: 115,
        totalCommission: 115,
        agentShare: 66.93,
        agencyShare: 44.62,
        ownerAmount: 1035,
        preaFee: 3.45,
        vatOnCommission: 0
    }
});
const collisionRecon = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
    paymentId,
    expected,
    actual: {
        ownerIncome: true,
        agentCommission: true,
        companyCommission: true,
        journal: false,
        vat: false,
        deposit: false,
        amounts: { ownerIncome: 1035, agentCommission: 66.93, companyCommission: 44.62 },
        journalReferenceCollision: { reference: 'PAY-SHARED', otherPaymentId }
    }
});
assert_1.default.strictEqual(collisionRecon.accountingComplete, false);
assert_1.default.ok(!collisionRecon.missing.includes('journal'), 'a reference collision is not treated as a missing journal to recreate');
assert_1.default.ok(collisionRecon.mismatched.includes('journal'));
const collisionPlan = (0, paymentAccountingProjection_1.buildAccountingRepairPlan)(collisionRecon);
assert_1.default.ok(!collisionPlan.wouldCreate.includes('journal'));
assert_1.default.ok(collisionPlan.requiresManualReview.includes('journal'));
const missingRecon = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
    paymentId,
    expected,
    actual: {
        ownerIncome: true,
        agentCommission: true,
        companyCommission: true,
        journal: false,
        vat: false,
        deposit: false,
        amounts: { ownerIncome: 1035, agentCommission: 66.93, companyCommission: 44.62 }
    }
});
assert_1.default.deepStrictEqual(missingRecon.missing, ['journal']);
assert_1.default.ok((0, paymentAccountingProjection_1.buildAccountingRepairPlan)(missingRecon).wouldCreate.includes('journal'));
const prea = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
    grossRent: 1150,
    commissionPercentage: 10,
    vatOnCommission: false,
    commissionEnabled: true
});
assert_1.default.strictEqual(prea.commissionGross, 115);
assert_1.default.strictEqual(prea.preaFee, 3.45);
assert_1.default.strictEqual(prea.agentShare, 66.93);
assert_1.default.strictEqual(prea.agencyShare, 44.62);
assert_1.default.strictEqual(prea.ownerAmount, 1035);
assert_1.default.strictEqual(Number((prea.agentShare + prea.agencyShare + prea.preaFee).toFixed(2)), 115);
const receipt = {
    _id: paymentId,
    status: 'completed',
    paymentType: 'rental',
    amount: 1150,
    referenceNumber: 'RCPT-2541DC-2026-07',
    commissionDetails: {
        commissionNet: 115,
        totalCommission: 115,
        agentShare: 66.93,
        agencyShare: 44.62,
        ownerAmount: 1035,
        preaFee: 3.45,
        vatOnCommission: 0,
        levy: 0
    }
};
const balanced = (0, journalRecoveryAssessment_1.canonicalReceiptJournalBalance)(receipt);
assert_1.default.strictEqual(balanced.debit, 1150);
assert_1.default.strictEqual(balanced.credit, 1150);
assert_1.default.strictEqual(balanced.balanced, true);
const repeated = (0, journalRecoveryAssessment_1.canonicalReceiptJournalBalance)(receipt);
assert_1.default.deepStrictEqual(repeated, balanced, 'a repeated assessment uses the same stored snapshot');
const exclusive = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
    grossRent: 1000,
    commissionPercentage: 10,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate: 0.155
});
assert_1.default.strictEqual(exclusive.commissionNet, 100);
assert_1.default.strictEqual(exclusive.vatAmount, 15.5);
assert_1.default.ok(exclusive.ownerAmount < 900);
const inclusive = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
    grossRent: 1000,
    commissionPercentage: 10,
    vatOnCommission: true,
    vatTreatment: 'inclusive',
    vatRate: 0.155
});
assert_1.default.ok(inclusive.commissionNet < inclusive.commissionGross);
assert_1.default.strictEqual(Number((inclusive.commissionNet + inclusive.vatAmount).toFixed(2)), 100);
const levy = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
    grossRent: 1000,
    levy: 100,
    commissionPercentage: 10,
    vatOnCommission: false
});
assert_1.default.strictEqual(levy.commissionBase, 900);
assert_1.default.strictEqual(levy.ownerAmount, 910);
const depositOnly = (0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)({
    status: 'completed',
    paymentType: 'rental',
    amount: 0,
    depositAmount: 200
});
assert_1.default.strictEqual(depositOnly.skipJournal, true);
const reversed = (0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)({
    status: 'completed',
    paymentType: 'rental',
    amount: 1150,
    reversalOfPaymentId: 'original'
});
assert_1.default.strictEqual(reversed.reason, 'reversal_row');
assert_1.default.strictEqual(reversed.skipJournal, true);
const unbalanced = (0, journalRecoveryAssessment_1.canonicalReceiptJournalBalance)(Object.assign(Object.assign({}, receipt), { amount: 100, commissionDetails: Object.assign(Object.assign({}, receipt.commissionDetails), { commissionNet: 250, vatOnCommission: 0 }) }));
assert_1.default.strictEqual(unbalanced.balanced, false);
const eligible = (0, journalRecoveryAssessment_1.assessControlledRecovery)({
    missingJournal: true,
    journalPresent: false,
    referenceCollision: false,
    otherCompanyReference: false,
    reversed: false,
    companyMatches: true,
    periodStatus: 'OPEN',
    journalBalanced: true,
    otherMismatches: []
});
assert_1.default.strictEqual(eligible.eligible, true);
assert_1.default.strictEqual(eligible.checks.financialWrites, false);
const unmanaged = (0, journalRecoveryAssessment_1.assessControlledRecovery)({
    missingJournal: true,
    journalPresent: false,
    referenceCollision: false,
    otherCompanyReference: false,
    reversed: false,
    companyMatches: true,
    periodStatus: 'UNMANAGED',
    journalBalanced: true,
    otherMismatches: []
});
assert_1.default.strictEqual(unmanaged.eligible, false);
assert_1.default.ok(unmanaged.blockers.includes('period_not_established'));
const closed = (0, journalRecoveryAssessment_1.assessControlledRecovery)(Object.assign(Object.assign({}, eligible.checks), { missingJournal: true, journalPresent: false, referenceCollision: false, otherCompanyReference: false, reversed: false, companyMatches: true, periodStatus: 'CLOSED', journalBalanced: true, otherMismatches: [] }));
assert_1.default.strictEqual(closed.eligible, false);
assert_1.default.ok(closed.blockers.includes('period_closed'));
const collisionRecovery = (0, journalRecoveryAssessment_1.assessControlledRecovery)({
    missingJournal: false,
    journalPresent: false,
    referenceCollision: true,
    otherCompanyReference: false,
    reversed: false,
    companyMatches: true,
    periodStatus: 'UNMANAGED',
    journalBalanced: true,
    otherMismatches: []
});
assert_1.default.strictEqual(collisionRecovery.eligible, false);
assert_1.default.strictEqual(collisionRecovery.manualReview, true);
const again = (0, journalRecoveryAssessment_1.assessControlledRecovery)({
    missingJournal: true,
    journalPresent: false,
    referenceCollision: false,
    otherCompanyReference: false,
    reversed: false,
    companyMatches: true,
    periodStatus: 'OPEN',
    journalBalanced: true,
    otherMismatches: []
});
assert_1.default.deepStrictEqual(again, eligible, 'a repeated recovery decision does not change');
const collisionError = new journalDuplicateKey_1.JournalReferenceCollisionError('PAY-SHARED', otherPaymentId);
assert_1.default.strictEqual((0, transactionDomain_1.isPermanentAccountingFailure)(collisionError), true);
const orchestrator = src('services/paymentAccountingOrchestrator.ts');
assert_1.default.ok(orchestrator.includes('journalResult.receiptJournal === \'posted\''), 'a skipped journal call is not marked posted');
assert_1.default.ok(orchestrator.includes('recordReceiptJournalFailure'));
const integration = src('services/accountingIntegrationService.ts');
assert_1.default.ok(integration.includes('JOURNAL_REFERENCE_COLLISION') || integration.includes('JournalReferenceCollisionError'));
assert_1.default.ok(integration.includes('recordReceiptJournalFailure'));
assert_1.default.ok(!integration.includes('sourceId = other'), 'journals are not reassigned');
const reconciliation = src('services/paymentAccountingReconciliation.ts');
assert_1.default.ok(reconciliation.includes('companyId: companyObjectId'));
assert_1.default.ok(reconciliation.indexOf('if (dryRun)') < reconciliation.indexOf('postPaymentAccounting(paymentId'));
const integrity = src('services/paymentAccountingIntegrity.ts');
assert_1.default.ok(!integrity.includes('postPaymentAccounting'));
assert_1.default.ok(!integrity.includes('repairPaymentAccounting'));
console.log('PASS journal safeguard tests');
