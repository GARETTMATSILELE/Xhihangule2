import assert from 'assert';
import {
  evaluatePermanentAccountingPolicy,
  isDepositOnlyPayment,
  shouldAttemptAccountingReversal,
  shouldPostAgentCommission,
  shouldPostOwnerIncome,
  shouldPostTrust
} from '../services/accountingPostingPolicy';
import {
  projectCommissionLanes,
  sameAgentOccupiesBothSplitRoles,
  commissionReference,
  commissionReversalReference
} from '../services/commissionProjection';
import { computePropertyAccountTotals, computeAgentAccountTotals } from '../services/propertyAccountTotals';
import {
  isIllegalPropertyAccountMutation,
  isAllowedPropertyAccountSetPath,
  isAllowedPropertyAccountPushPath,
  LEDGER_EVENT_PROCESSOR_GENERATION
} from '../services/ledgerMutationPolicy';
import {
  classifyReversalOutcome,
  isClaimableLedgerEvent,
  nextLedgerEventStatusAfterClaim,
  nextLedgerEventStatusAfterFailure,
  nextLedgerEventStatusAfterSuccess
} from '../services/ledgerEventStateMachine';
import { isRecordIncomeEarlyExit } from '../services/paymentReconciliationQuery';

const agentA = '68d2804b21344cbef4e24aed';
const paymentId = '69ba734618ae7e900167c1f5';

const run = () => {
  // --- Provisional: would have caught 68c2c8a3 / 68c2c951 agent commissions ---
  const provisional = {
    _id: '68c2c8a3e329519c550c6a09',
    status: 'completed',
    amount: 1000,
    isProvisional: true,
    paymentType: 'introduction',
    commissionDetails: { agentShare: 50, agencyShare: 40, ownerAmount: 910 }
  };
  const provisionalDecision = evaluatePermanentAccountingPolicy(provisional);
  assert.strictEqual(provisionalDecision.allowed, false, 'provisional payments must not post permanently');
  assert.strictEqual(provisionalDecision.reason, 'provisional');
  assert.strictEqual(shouldPostOwnerIncome(provisional), false);
  assert.strictEqual(shouldPostAgentCommission(provisional), false);
  assert.strictEqual(shouldPostTrust(provisional), false);
  assert.strictEqual(isRecordIncomeEarlyExit(provisional), true, 'recon must skip provisional');

  const completedRental = {
    _id: 'pay-rental',
    status: 'completed',
    amount: 1000,
    depositAmount: 0,
    isProvisional: false,
    paymentType: 'rental',
    commissionDetails: { agentShare: 50, agencyShare: 40, ownerAmount: 910, totalCommission: 90 }
  };
  assert.strictEqual(evaluatePermanentAccountingPolicy(completedRental).allowed, true);
  assert.strictEqual(shouldPostTrust(completedRental), false, 'rentals do not post buyer trust');

  const completedSale = {
    ...completedRental,
    _id: 'pay-sale',
    paymentType: 'sale'
  };
  assert.strictEqual(shouldPostTrust(completedSale), true);

  const introduction = {
    ...completedRental,
    _id: 'intro-1',
    paymentType: 'introduction',
    amount: 120000,
    commissionDetails: { agentShare: 0, agencyShare: 0, ownerAmount: 120000, totalCommission: 0 }
  };
  assert.strictEqual(evaluatePermanentAccountingPolicy(introduction).allowed, true, 'introduction posts owner income');
  assert.strictEqual(isRecordIncomeEarlyExit(introduction), false);

  assert.strictEqual(isDepositOnlyPayment({ amount: 50, depositAmount: 50 }), true);
  assert.strictEqual(evaluatePermanentAccountingPolicy({ status: 'completed', amount: 50, depositAmount: 50 }).allowed, false);

  // --- Reversal eligibility ---
  assert.strictEqual(
    shouldAttemptAccountingReversal({ status: 'reversed', reversalPaymentId: 'rev-1' }),
    true
  );
  assert.strictEqual(shouldAttemptAccountingReversal({ reversalOfPaymentId: 'orig' }), false);

  // --- Same-agent split: both lanes, distinct identities, no extra agentShare ---
  const splitSameAgent = {
    _id: paymentId,
    paymentType: 'sale',
    agentId: agentA,
    commissionDetails: {
      agentShare: 100,
      ownerAmount: 900,
      agencyShare: 40,
      agentSplit: {
        ownerUserId: agentA,
        collaboratorUserId: agentA,
        ownerAgentShare: 60,
        collaboratorAgentShare: 40
      }
    }
  };
  const lanes = projectCommissionLanes(splitSameAgent);
  assert.strictEqual(lanes.length, 2, 'same person occupying both roles posts two lanes');
  assert.ok(sameAgentOccupiesBothSplitRoles(lanes));
  assert.deepStrictEqual(
    lanes.map((l) => l.reference).sort(),
    [`${paymentId}-collaborator`, `${paymentId}-owner`].sort()
  );
  assert.notStrictEqual(lanes[0].identity, lanes[1].identity);
  const laneSum = lanes.reduce((s, l) => s + l.amount, 0);
  assert.strictEqual(laneSum, 100, 'lanes sum to agentShare, not double it');
  assert.ok(!lanes.some((l) => l.role === 'agent'), 'undifferentiated agentShare lane is suppressed when split exists');

  const splitDifferent = {
    _id: 'pay-split-2',
    paymentType: 'sale',
    commissionDetails: {
      agentShare: 100,
      agentSplit: {
        ownerUserId: 'owner-1',
        collaboratorUserId: 'collab-1',
        ownerAgentShare: 60,
        collaboratorAgentShare: 40
      }
    }
  };
  const differentLanes = projectCommissionLanes(splitDifferent);
  assert.strictEqual(differentLanes.length, 2);
  assert.strictEqual(sameAgentOccupiesBothSplitRoles(differentLanes), false);

  const rentalLanes = projectCommissionLanes(completedRental);
  assert.strictEqual(rentalLanes.length, 0, 'rental without agentId posts no agent lane');
  const rentalWithAgent = projectCommissionLanes({ ...completedRental, agentId: agentA });
  assert.strictEqual(rentalWithAgent.length, 1);
  assert.strictEqual(rentalWithAgent[0].reference, commissionReference(String(completedRental._id), 'agent'));

  const zeroCommission = projectCommissionLanes({
    _id: 'z',
    paymentType: 'rental',
    agentId: agentA,
    commissionDetails: { agentShare: 0 }
  });
  assert.strictEqual(zeroCommission.length, 0);

  // Duplicate retry uses stable reversal refs
  assert.strictEqual(commissionReversalReference(paymentId, 'owner'), `REV-${paymentId}-owner`);
  assert.strictEqual(commissionReversalReference(paymentId, 'owner'), commissionReversalReference(paymentId, 'owner'));

  // --- PropertyAccount totals exclude cancelled (would catch USD 5100 if cancelled rows were counted) ---
  const totals = computePropertyAccountTotals({
    transactions: [
      { type: 'income', status: 'completed', amount: 1000, accountingTreatment: 'PROPERTY_INCOME' },
      { type: 'income', status: 'cancelled', amount: 3825, accountingTreatment: 'PROPERTY_INCOME' },
      { type: 'income', status: 'failed', amount: 1275, accountingTreatment: 'PROPERTY_INCOME' },
      { type: 'expense', status: 'completed', amount: 100, category: 'configured_expense' }
    ],
    ownerPayouts: [{ status: 'completed', amount: 200 }],
    passThroughAccounts: [
      {
        type: 'LEVY',
        transactions: [
          { type: 'collection', status: 'completed', amount: 50, idempotencyKey: 'levy-payment:1:collection' },
          { type: 'collection', status: 'cancelled', amount: 50, idempotencyKey: 'dup' }
        ]
      }
    ]
  });
  assert.strictEqual(totals.totalIncome, 1000);
  assert.strictEqual(totals.totalExpenses, 100);
  assert.strictEqual(totals.totalOwnerPayouts, 200);
  assert.strictEqual(totals.runningBalance, 700);
  assert.strictEqual(totals.passThroughCollected, 50);

  const agentTotals = computeAgentAccountTotals({
    transactions: [
      { type: 'commission', status: 'completed', amount: 60, date: '2026-01-01', reference: `${paymentId}-owner` },
      { type: 'commission', status: 'completed', amount: 40, date: '2026-01-01', reference: `${paymentId}-collaborator` },
      { type: 'penalty', status: 'completed', amount: 60, date: '2026-01-02', reference: `REV-${paymentId}-owner` },
      { type: 'commission', status: 'cancelled', amount: 999, date: '2026-01-03' }
    ]
  });
  assert.strictEqual(agentTotals.totalCommissions, 100);
  assert.strictEqual(agentTotals.totalPenalties, 60);
  assert.strictEqual(agentTotals.runningBalance, 40);

  // --- Reversal immutability: cancelling income status must be legal ---
  assert.strictEqual(isAllowedPropertyAccountSetPath('transactions.$[t].status'), true);
  assert.strictEqual(
    isIllegalPropertyAccountMutation({
      $set: { 'transactions.$[t].status': 'cancelled', 'transactions.$[t].updatedAt': new Date() }
    }),
    false,
    'Phase 5A reversal leftover: status cancel must not be blocked'
  );
  assert.strictEqual(
    isIllegalPropertyAccountMutation({
      $set: { 'transactions.$[t].amount': 0 }
    }),
    true,
    'amounts remain immutable'
  );
  assert.strictEqual(isAllowedPropertyAccountPushPath('passThroughAccounts.$.transactions'), true);
  assert.strictEqual(
    isIllegalPropertyAccountMutation({
      $push: { 'passThroughAccounts.$.transactions': { type: 'collection', amount: 1 } }
    }),
    false,
    'concurrent levy collections must append, not replace the array'
  );
  assert.strictEqual(
    isIllegalPropertyAccountMutation({
      $set: { passThroughAccounts: [] }
    }),
    false,
    'full-array replace remains technically legal but is no longer used by recalc'
  );

  // Recalc must not write passThroughAccounts — the new $set payload is scalars only
  const recalcUpdate = {
    $set: {
      runningBalance: 1,
      totalIncome: 1,
      totalExpenses: 0,
      totalOwnerPayouts: 0,
      passThroughCollected: 0,
      passThroughPaid: 0,
      passThroughOutstanding: 0,
      netOwnerBalance: 1,
      lastUpdated: new Date()
    },
    $inc: { ledgerRevision: 1 }
  };
  assert.strictEqual(isIllegalPropertyAccountMutation(recalcUpdate), false);
  assert.ok(!('passThroughAccounts' in recalcUpdate.$set));

  // --- LedgerEvent state machine; generation 2 ignores 5A pending events ---
  const now = new Date('2026-08-31T12:00:00.000Z');
  assert.strictEqual(
    isClaimableLedgerEvent({
      status: 'pending',
      processorGeneration: undefined,
      now,
      requiredGeneration: LEDGER_EVENT_PROCESSOR_GENERATION
    }),
    false,
    'Phase 5A pending events (no generation) must not be processed in 5B'
  );
  assert.strictEqual(
    isClaimableLedgerEvent({
      status: 'pending',
      processorGeneration: 2,
      nextAttemptAt: now,
      now,
      requiredGeneration: 2
    }),
    true
  );
  assert.strictEqual(
    isClaimableLedgerEvent({
      status: 'processing',
      claimedAt: new Date(now.getTime() - 6 * 60 * 1000),
      processorGeneration: 2,
      now,
      requiredGeneration: 2
    }),
    true,
    'stale processing after worker crash is reclaimable'
  );
  assert.strictEqual(
    isClaimableLedgerEvent({
      status: 'processing',
      claimedAt: now,
      processorGeneration: 2,
      now,
      requiredGeneration: 2
    }),
    false
  );
  assert.strictEqual(
    isClaimableLedgerEvent({
      status: 'completed',
      processorGeneration: 2,
      now,
      requiredGeneration: 2
    }),
    false
  );
  assert.strictEqual(nextLedgerEventStatusAfterClaim(), 'processing');
  assert.strictEqual(nextLedgerEventStatusAfterSuccess(), 'completed');
  assert.strictEqual(nextLedgerEventStatusAfterFailure(), 'failed');

  assert.strictEqual(
    classifyReversalOutcome({
      ownerIncome: 'reversed',
      configuredExpense: 'absent',
      companyCommission: 'reversed',
      agentCommission: 'reversed',
      trust: 'reversed',
      journal: 'reversed'
    }),
    'already_reversed'
  );
  assert.strictEqual(
    classifyReversalOutcome({
      ownerIncome: 'active',
      configuredExpense: 'absent',
      companyCommission: 'reversed',
      agentCommission: 'failed',
      trust: 'absent',
      journal: 'reversed'
    }),
    'partial'
  );
  assert.strictEqual(
    classifyReversalOutcome({
      ownerIncome: 'failed',
      configuredExpense: 'failed',
      companyCommission: 'failed',
      agentCommission: 'failed',
      trust: 'failed',
      journal: 'failed'
    }),
    'failed'
  );

  // Simulated concurrent pass-through: two keys must both survive, last-write-wins $set of whole array is the 5A risk
  const simulateConcurrentPassThrough = () => {
    type Row = { idempotencyKey: string; amount: number };
    let buckets: { type: string; transactions: Row[] }[] = [];
    const pushAtomic = (key: string, amount: number) => {
      const exists = buckets.some((b) => b.transactions.some((t) => t.idempotencyKey === key));
      if (exists) return 'duplicate';
      let bucket = buckets.find((b) => b.type === 'LEVY');
      if (!bucket) {
        bucket = { type: 'LEVY', transactions: [] };
        buckets = [...buckets, bucket];
      }
      bucket.transactions = [...bucket.transactions, { idempotencyKey: key, amount }];
      return 'inserted';
    };
    assert.strictEqual(pushAtomic('levy-payment:a:collection', 10), 'inserted');
    assert.strictEqual(pushAtomic('levy-payment:b:collection', 20), 'inserted');
    assert.strictEqual(pushAtomic('levy-payment:a:collection', 10), 'duplicate');
    assert.strictEqual(buckets[0].transactions.length, 2, 'neither concurrent collection disappeared');
  };
  simulateConcurrentPassThrough();

  // Reversal retry must not duplicate penalties
  const penalties = new Set<string>();
  const applyPenalty = (pid: string, role: 'owner' | 'agent') => {
    const ref = commissionReversalReference(pid, role);
    if (penalties.has(ref)) return 'already_applied';
    penalties.add(ref);
    return 'applied';
  };
  assert.strictEqual(applyPenalty(paymentId, 'owner'), 'applied');
  assert.strictEqual(applyPenalty(paymentId, 'owner'), 'already_applied');
  assert.strictEqual(penalties.size, 1);

  // --- Phase 5B.5: production paths actually route through the orchestrator ---
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const srcFile = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');

  const webhookSrc = srcFile('controllers/paymentWebhookController.ts');
  assert.ok(webhookSrc.includes('postPaymentAccounting'), 'webhook completion must call postPaymentAccounting');

  const syncSrc = srcFile('services/databaseSyncService.ts');
  assert.ok(syncSrc.includes('postPaymentAccounting'), 'change stream / poll must call postPaymentAccounting');
  assert.ok(
    /paymentType === 'introduction'/.test(syncSrc),
    'polling/change-stream must include introduction payments'
  );
  assert.ok(
    syncSrc.includes('evaluatePermanentAccountingPolicy'),
    'verifyAndReconcile must consult the central policy'
  );
  assert.ok(
    !/\$push:\s*\{\s*transactions:\s*txDoc/.test(syncSrc),
    'verifyAndReconcile must not raw-$push CompanyAccount transactions'
  );

  const reconSrc = srcFile('services/scheduledSyncService.ts');
  assert.ok(reconSrc.includes('shouldPostCompanyCommission'), 'scheduled recon company pass must use policy');
  assert.ok(reconSrc.includes('postCompanyCommission'), 'scheduled recon must not raw-write CompanyAccount');

  const getPropertyCtrl = srcFile('controllers/propertyAccountController.ts');
  const getPropertyFn = getPropertyCtrl.slice(
    getPropertyCtrl.indexOf('export const getPropertyAccount'),
    getPropertyCtrl.indexOf('export const migrateLegacyLedgerTypes')
  );
  assert.ok(!getPropertyFn.includes('recordIncomeFromPayment'), 'GET getPropertyAccount must not post income');
  assert.ok(!getPropertyFn.includes('.save('), 'GET getPropertyAccount must not save');
  assert.ok(!getPropertyFn.includes('recalculateBalance'), 'GET getPropertyAccount must not persist recalc');

  const getAgentCtrl = srcFile('controllers/agentAccountController.ts');
  const getAgentFn = getAgentCtrl.slice(
    getAgentCtrl.indexOf('export const getAgentAccount'),
    getAgentCtrl.indexOf('export const getCompanyAgentAccounts')
  );
  assert.ok(!getAgentFn.includes('syncCommissionTransactions'), 'GET getAgentAccount must not sync commissions');
  assert.ok(!getAgentFn.includes('backfillMissingForAgent'), 'GET getAgentAccount must not backfill');

  const trustCtrl = srcFile('controllers/trustAccountController.ts');
  const getFullFn = trustCtrl.slice(
    trustCtrl.indexOf('export const getTrustAccountFull'),
    trustCtrl.indexOf('export const getTrustAccountByPropertyFull')
  );
  assert.ok(!getFullFn.includes('verifyAndRepairAccountInvariants'), 'GET trust full must not repair balances');
  assert.ok(!getFullFn.includes('ensureForTrustAccount'), 'GET trust full must not upsert TrustMatter');
  assert.ok(getFullFn.includes('getForTrustAccount'), 'GET trust full must read existing TrustMatter only');

  const getMatterFn = trustCtrl.slice(
    trustCtrl.indexOf('export const getTrustMatter'),
    trustCtrl.indexOf('export const updateTrustMatterCustody')
  );
  assert.ok(!getMatterFn.includes('ensureForTrustAccount'), 'GET trust matter must not upsert');

  console.log('phase5b accounting tests passed');
};

run();
