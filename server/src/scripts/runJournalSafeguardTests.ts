import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { calculatePropertyCommission } from '../services/propertyCommissionCalculator';
import { evaluateAccountingReconciliation, buildAccountingRepairPlan, buildExpectedAccountingProjection } from '../services/paymentAccountingProjection';
import { evaluatePermanentAccountingPolicy } from '../services/accountingPostingPolicy';
import { isPermanentAccountingFailure } from '../services/transactionDomain';
import { JournalReferenceCollisionError } from '../services/journalDuplicateKey';
import {
  assessControlledRecovery,
  canonicalReceiptJournalBalance,
  classifyReceiptJournals
} from '../services/journalRecoveryAssessment';

const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const company = 'company-a';
const paymentId = 'payment-1';
const otherPaymentId = 'payment-2';

const own = classifyReceiptJournals({
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
assert.ok(own.ownJournal, 'a posted receipt journal for this company and payment is recognised');
assert.strictEqual(own.referenceCollision, null);

const commissionOnly = classifyReceiptJournals({
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
assert.strictEqual(commissionOnly.ownJournal, null, 'a commission journal is not the receipt journal');

const collision = classifyReceiptJournals({
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
assert.strictEqual(collision.ownJournal, null, 'another payment id is not adopted');
assert.strictEqual(collision.referenceCollision?.otherPaymentId, otherPaymentId);

const otherCompany = classifyReceiptJournals({
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
assert.strictEqual(otherCompany.ownJournal, null, 'another company journal is not used');
assert.strictEqual(otherCompany.otherCompanyReference?.companyId, 'company-b');
assert.strictEqual(otherCompany.referenceCollision, null);

const expected = buildExpectedAccountingProjection({
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
const collisionRecon = evaluateAccountingReconciliation({
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
assert.strictEqual(collisionRecon.accountingComplete, false);
assert.ok(!collisionRecon.missing.includes('journal'), 'a reference collision is not treated as a missing journal to recreate');
assert.ok(collisionRecon.mismatched.includes('journal'));
const collisionPlan = buildAccountingRepairPlan(collisionRecon);
assert.ok(!collisionPlan.wouldCreate.includes('journal'));
assert.ok(collisionPlan.requiresManualReview.includes('journal'));

const missingRecon = evaluateAccountingReconciliation({
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
assert.deepStrictEqual(missingRecon.missing, ['journal']);
assert.ok(buildAccountingRepairPlan(missingRecon).wouldCreate.includes('journal'));

const prea = calculatePropertyCommission({
  grossRent: 1150,
  commissionPercentage: 10,
  vatOnCommission: false,
  commissionEnabled: true
});
assert.strictEqual(prea.commissionGross, 115);
assert.strictEqual(prea.preaFee, 3.45);
assert.strictEqual(prea.agentShare, 66.93);
assert.strictEqual(prea.agencyShare, 44.62);
assert.strictEqual(prea.ownerAmount, 1035);
assert.strictEqual(Number((prea.agentShare + prea.agencyShare + prea.preaFee).toFixed(2)), 115);

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
const balanced = canonicalReceiptJournalBalance(receipt);
assert.strictEqual(balanced.debit, 1150);
assert.strictEqual(balanced.credit, 1150);
assert.strictEqual(balanced.balanced, true);
const repeated = canonicalReceiptJournalBalance(receipt);
assert.deepStrictEqual(repeated, balanced, 'a repeated assessment uses the same stored snapshot');

const exclusive = calculatePropertyCommission({
  grossRent: 1000,
  commissionPercentage: 10,
  vatOnCommission: true,
  vatTreatment: 'exclusive',
  vatRate: 0.155
});
assert.strictEqual(exclusive.commissionNet, 100);
assert.strictEqual(exclusive.vatAmount, 15.5);
assert.ok(exclusive.ownerAmount < 900);

const inclusive = calculatePropertyCommission({
  grossRent: 1000,
  commissionPercentage: 10,
  vatOnCommission: true,
  vatTreatment: 'inclusive',
  vatRate: 0.155
});
assert.ok(inclusive.commissionNet < inclusive.commissionGross);
assert.strictEqual(Number((inclusive.commissionNet + inclusive.vatAmount).toFixed(2)), 100);

const levy = calculatePropertyCommission({
  grossRent: 1000,
  levy: 100,
  commissionPercentage: 10,
  vatOnCommission: false
});
assert.strictEqual(levy.commissionBase, 900);
assert.strictEqual(levy.ownerAmount, 910);

const depositOnly = evaluatePermanentAccountingPolicy({
  status: 'completed',
  paymentType: 'rental',
  amount: 0,
  depositAmount: 200
});
assert.strictEqual(depositOnly.skipJournal, true);

const reversed = evaluatePermanentAccountingPolicy({
  status: 'completed',
  paymentType: 'rental',
  amount: 1150,
  reversalOfPaymentId: 'original'
});
assert.strictEqual(reversed.reason, 'reversal_row');
assert.strictEqual(reversed.skipJournal, true);

const unbalanced = canonicalReceiptJournalBalance({
  ...receipt,
  amount: 100,
  commissionDetails: { ...receipt.commissionDetails, commissionNet: 250, vatOnCommission: 0 }
});
assert.strictEqual(unbalanced.balanced, false);

const eligible = assessControlledRecovery({
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
assert.strictEqual(eligible.eligible, true);
assert.strictEqual(eligible.checks.financialWrites, false);

const unmanaged = assessControlledRecovery({
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
assert.strictEqual(unmanaged.eligible, false);
assert.ok(unmanaged.blockers.includes('period_not_established'));

const closed = assessControlledRecovery({ ...eligible.checks, missingJournal: true, journalPresent: false, referenceCollision: false, otherCompanyReference: false, reversed: false, companyMatches: true, periodStatus: 'CLOSED', journalBalanced: true, otherMismatches: [] });
assert.strictEqual(closed.eligible, false);
assert.ok(closed.blockers.includes('period_closed'));

const collisionRecovery = assessControlledRecovery({
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
assert.strictEqual(collisionRecovery.eligible, false);
assert.strictEqual(collisionRecovery.manualReview, true);

const again = assessControlledRecovery({
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
assert.deepStrictEqual(again, eligible, 'a repeated recovery decision does not change');

const collisionError = new JournalReferenceCollisionError('PAY-SHARED', otherPaymentId);
assert.strictEqual(isPermanentAccountingFailure(collisionError), true);

const orchestrator = src('services/paymentAccountingOrchestrator.ts');
assert.ok(orchestrator.includes('journalResult.receiptJournal === \'posted\''), 'a skipped journal call is not marked posted');
assert.ok(orchestrator.includes('recordReceiptJournalFailure'));
const integration = src('services/accountingIntegrationService.ts');
assert.ok(integration.includes('JOURNAL_REFERENCE_COLLISION') || integration.includes('JournalReferenceCollisionError'));
assert.ok(integration.includes('recordReceiptJournalFailure'));
assert.ok(!integration.includes('sourceId = other'), 'journals are not reassigned');
const reconciliation = src('services/paymentAccountingReconciliation.ts');
assert.ok(reconciliation.includes('companyId: companyObjectId'));
assert.ok(reconciliation.indexOf('if (dryRun)') < reconciliation.indexOf('postPaymentAccounting(paymentId'));
const integrity = src('services/paymentAccountingIntegrity.ts');
assert.ok(!integrity.includes('postPaymentAccounting'));
assert.ok(!integrity.includes('repairPaymentAccounting'));

console.log('PASS journal safeguard tests');
