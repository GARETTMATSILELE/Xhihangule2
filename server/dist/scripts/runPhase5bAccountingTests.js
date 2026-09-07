"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const accountingPostingPolicy_1 = require("../services/accountingPostingPolicy");
const commissionProjection_1 = require("../services/commissionProjection");
const propertyAccountTotals_1 = require("../services/propertyAccountTotals");
const ledgerMutationPolicy_1 = require("../services/ledgerMutationPolicy");
const ledgerEventStateMachine_1 = require("../services/ledgerEventStateMachine");
const paymentReconciliationQuery_1 = require("../services/paymentReconciliationQuery");
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
    const provisionalDecision = (0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)(provisional);
    assert_1.default.strictEqual(provisionalDecision.allowed, false, 'provisional payments must not post permanently');
    assert_1.default.strictEqual(provisionalDecision.reason, 'provisional');
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.shouldPostOwnerIncome)(provisional), false);
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.shouldPostAgentCommission)(provisional), false);
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.shouldPostTrust)(provisional), false);
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)(provisional), true, 'recon must skip provisional');
    const completedRental = {
        _id: 'pay-rental',
        status: 'completed',
        amount: 1000,
        depositAmount: 0,
        isProvisional: false,
        paymentType: 'rental',
        commissionDetails: { agentShare: 50, agencyShare: 40, ownerAmount: 910, totalCommission: 90 }
    };
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)(completedRental).allowed, true);
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.shouldPostTrust)(completedRental), false, 'rentals do not post buyer trust');
    const completedSale = Object.assign(Object.assign({}, completedRental), { _id: 'pay-sale', paymentType: 'sale' });
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.shouldPostTrust)(completedSale), true);
    const introduction = Object.assign(Object.assign({}, completedRental), { _id: 'intro-1', paymentType: 'introduction', amount: 120000, commissionDetails: { agentShare: 0, agencyShare: 0, ownerAmount: 120000, totalCommission: 0 } });
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)(introduction).allowed, true, 'introduction posts owner income');
    assert_1.default.strictEqual((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)(introduction), false);
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.isDepositOnlyPayment)({ amount: 50, depositAmount: 50 }), true);
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)({ status: 'completed', amount: 50, depositAmount: 50 }).allowed, false);
    // --- Reversal eligibility ---
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.shouldAttemptAccountingReversal)({ status: 'reversed', reversalPaymentId: 'rev-1' }), true);
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.shouldAttemptAccountingReversal)({ reversalOfPaymentId: 'orig' }), false);
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
    const lanes = (0, commissionProjection_1.projectCommissionLanes)(splitSameAgent);
    assert_1.default.strictEqual(lanes.length, 2, 'same person occupying both roles posts two lanes');
    assert_1.default.ok((0, commissionProjection_1.sameAgentOccupiesBothSplitRoles)(lanes));
    assert_1.default.deepStrictEqual(lanes.map((l) => l.reference).sort(), [`${paymentId}-collaborator`, `${paymentId}-owner`].sort());
    assert_1.default.notStrictEqual(lanes[0].identity, lanes[1].identity);
    const laneSum = lanes.reduce((s, l) => s + l.amount, 0);
    assert_1.default.strictEqual(laneSum, 100, 'lanes sum to agentShare, not double it');
    assert_1.default.ok(!lanes.some((l) => l.role === 'agent'), 'undifferentiated agentShare lane is suppressed when split exists');
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
    const differentLanes = (0, commissionProjection_1.projectCommissionLanes)(splitDifferent);
    assert_1.default.strictEqual(differentLanes.length, 2);
    assert_1.default.strictEqual((0, commissionProjection_1.sameAgentOccupiesBothSplitRoles)(differentLanes), false);
    const rentalLanes = (0, commissionProjection_1.projectCommissionLanes)(completedRental);
    assert_1.default.strictEqual(rentalLanes.length, 0, 'rental without agentId posts no agent lane');
    const rentalWithAgent = (0, commissionProjection_1.projectCommissionLanes)(Object.assign(Object.assign({}, completedRental), { agentId: agentA }));
    assert_1.default.strictEqual(rentalWithAgent.length, 1);
    assert_1.default.strictEqual(rentalWithAgent[0].reference, (0, commissionProjection_1.commissionReference)(String(completedRental._id), 'agent'));
    const zeroCommission = (0, commissionProjection_1.projectCommissionLanes)({
        _id: 'z',
        paymentType: 'rental',
        agentId: agentA,
        commissionDetails: { agentShare: 0 }
    });
    assert_1.default.strictEqual(zeroCommission.length, 0);
    // Duplicate retry uses stable reversal refs
    assert_1.default.strictEqual((0, commissionProjection_1.commissionReversalReference)(paymentId, 'owner'), `REV-${paymentId}-owner`);
    assert_1.default.strictEqual((0, commissionProjection_1.commissionReversalReference)(paymentId, 'owner'), (0, commissionProjection_1.commissionReversalReference)(paymentId, 'owner'));
    // --- PropertyAccount totals exclude cancelled (would catch USD 5100 if cancelled rows were counted) ---
    const totals = (0, propertyAccountTotals_1.computePropertyAccountTotals)({
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
    assert_1.default.strictEqual(totals.totalIncome, 1000);
    assert_1.default.strictEqual(totals.totalExpenses, 100);
    assert_1.default.strictEqual(totals.totalOwnerPayouts, 200);
    assert_1.default.strictEqual(totals.runningBalance, 700);
    assert_1.default.strictEqual(totals.passThroughCollected, 50);
    const agentTotals = (0, propertyAccountTotals_1.computeAgentAccountTotals)({
        transactions: [
            { type: 'commission', status: 'completed', amount: 60, date: '2026-01-01', reference: `${paymentId}-owner` },
            { type: 'commission', status: 'completed', amount: 40, date: '2026-01-01', reference: `${paymentId}-collaborator` },
            { type: 'penalty', status: 'completed', amount: 60, date: '2026-01-02', reference: `REV-${paymentId}-owner` },
            { type: 'commission', status: 'cancelled', amount: 999, date: '2026-01-03' }
        ]
    });
    assert_1.default.strictEqual(agentTotals.totalCommissions, 100);
    assert_1.default.strictEqual(agentTotals.totalPenalties, 60);
    assert_1.default.strictEqual(agentTotals.runningBalance, 40);
    // --- Reversal immutability: cancelling income status must be legal ---
    assert_1.default.strictEqual((0, ledgerMutationPolicy_1.isAllowedPropertyAccountSetPath)('transactions.$[t].status'), true);
    assert_1.default.strictEqual((0, ledgerMutationPolicy_1.isIllegalPropertyAccountMutation)({
        $set: { 'transactions.$[t].status': 'cancelled', 'transactions.$[t].updatedAt': new Date() }
    }), false, 'Phase 5A reversal leftover: status cancel must not be blocked');
    assert_1.default.strictEqual((0, ledgerMutationPolicy_1.isIllegalPropertyAccountMutation)({
        $set: { 'transactions.$[t].amount': 0 }
    }), true, 'amounts remain immutable');
    assert_1.default.strictEqual((0, ledgerMutationPolicy_1.isAllowedPropertyAccountPushPath)('passThroughAccounts.$.transactions'), true);
    assert_1.default.strictEqual((0, ledgerMutationPolicy_1.isIllegalPropertyAccountMutation)({
        $push: { 'passThroughAccounts.$.transactions': { type: 'collection', amount: 1 } }
    }), false, 'concurrent levy collections must append, not replace the array');
    assert_1.default.strictEqual((0, ledgerMutationPolicy_1.isIllegalPropertyAccountMutation)({
        $set: { passThroughAccounts: [] }
    }), false, 'full-array replace remains technically legal but is no longer used by recalc');
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
    assert_1.default.strictEqual((0, ledgerMutationPolicy_1.isIllegalPropertyAccountMutation)(recalcUpdate), false);
    assert_1.default.ok(!('passThroughAccounts' in recalcUpdate.$set));
    // --- LedgerEvent state machine; generation 2 ignores 5A pending events ---
    const now = new Date('2026-08-31T12:00:00.000Z');
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.isClaimableLedgerEvent)({
        status: 'pending',
        processorGeneration: undefined,
        now,
        requiredGeneration: ledgerMutationPolicy_1.LEDGER_EVENT_PROCESSOR_GENERATION
    }), false, 'Phase 5A pending events (no generation) must not be processed in 5B');
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.isClaimableLedgerEvent)({
        status: 'pending',
        processorGeneration: 2,
        nextAttemptAt: now,
        now,
        requiredGeneration: 2
    }), true);
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.isClaimableLedgerEvent)({
        status: 'processing',
        claimedAt: new Date(now.getTime() - 6 * 60 * 1000),
        processorGeneration: 2,
        now,
        requiredGeneration: 2
    }), true, 'stale processing after worker crash is reclaimable');
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.isClaimableLedgerEvent)({
        status: 'processing',
        claimedAt: now,
        processorGeneration: 2,
        now,
        requiredGeneration: 2
    }), false);
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.isClaimableLedgerEvent)({
        status: 'completed',
        processorGeneration: 2,
        now,
        requiredGeneration: 2
    }), false);
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.nextLedgerEventStatusAfterClaim)(), 'processing');
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.nextLedgerEventStatusAfterSuccess)(), 'completed');
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.nextLedgerEventStatusAfterFailure)(), 'failed');
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.classifyReversalOutcome)({
        ownerIncome: 'reversed',
        configuredExpense: 'absent',
        companyCommission: 'reversed',
        agentCommission: 'reversed',
        trust: 'reversed',
        journal: 'reversed'
    }), 'already_reversed');
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.classifyReversalOutcome)({
        ownerIncome: 'active',
        configuredExpense: 'absent',
        companyCommission: 'reversed',
        agentCommission: 'failed',
        trust: 'absent',
        journal: 'reversed'
    }), 'partial');
    assert_1.default.strictEqual((0, ledgerEventStateMachine_1.classifyReversalOutcome)({
        ownerIncome: 'failed',
        configuredExpense: 'failed',
        companyCommission: 'failed',
        agentCommission: 'failed',
        trust: 'failed',
        journal: 'failed'
    }), 'failed');
    // Simulated concurrent pass-through: two keys must both survive, last-write-wins $set of whole array is the 5A risk
    const simulateConcurrentPassThrough = () => {
        let buckets = [];
        const pushAtomic = (key, amount) => {
            const exists = buckets.some((b) => b.transactions.some((t) => t.idempotencyKey === key));
            if (exists)
                return 'duplicate';
            let bucket = buckets.find((b) => b.type === 'LEVY');
            if (!bucket) {
                bucket = { type: 'LEVY', transactions: [] };
                buckets = [...buckets, bucket];
            }
            bucket.transactions = [...bucket.transactions, { idempotencyKey: key, amount }];
            return 'inserted';
        };
        assert_1.default.strictEqual(pushAtomic('levy-payment:a:collection', 10), 'inserted');
        assert_1.default.strictEqual(pushAtomic('levy-payment:b:collection', 20), 'inserted');
        assert_1.default.strictEqual(pushAtomic('levy-payment:a:collection', 10), 'duplicate');
        assert_1.default.strictEqual(buckets[0].transactions.length, 2, 'neither concurrent collection disappeared');
    };
    simulateConcurrentPassThrough();
    // Reversal retry must not duplicate penalties
    const penalties = new Set();
    const applyPenalty = (pid, role) => {
        const ref = (0, commissionProjection_1.commissionReversalReference)(pid, role);
        if (penalties.has(ref))
            return 'already_applied';
        penalties.add(ref);
        return 'applied';
    };
    assert_1.default.strictEqual(applyPenalty(paymentId, 'owner'), 'applied');
    assert_1.default.strictEqual(applyPenalty(paymentId, 'owner'), 'already_applied');
    assert_1.default.strictEqual(penalties.size, 1);
    // --- Phase 5B.5: production paths actually route through the orchestrator ---
    const fs = require('fs');
    const path = require('path');
    const srcFile = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');
    const webhookSrc = srcFile('controllers/paymentWebhookController.ts');
    assert_1.default.ok(webhookSrc.includes('postPaymentAccounting'), 'webhook completion must call postPaymentAccounting');
    const syncSrc = srcFile('services/databaseSyncService.ts');
    assert_1.default.ok(syncSrc.includes('postPaymentAccounting'), 'change stream / poll must call postPaymentAccounting');
    assert_1.default.ok(/paymentType === 'introduction'/.test(syncSrc), 'polling/change-stream must include introduction payments');
    assert_1.default.ok(syncSrc.includes('evaluatePermanentAccountingPolicy'), 'verifyAndReconcile must consult the central policy');
    assert_1.default.ok(!/\$push:\s*\{\s*transactions:\s*txDoc/.test(syncSrc), 'verifyAndReconcile must not raw-$push CompanyAccount transactions');
    const reconSrc = srcFile('services/scheduledSyncService.ts');
    assert_1.default.ok(reconSrc.includes('shouldPostCompanyCommission'), 'scheduled recon company pass must use policy');
    assert_1.default.ok(reconSrc.includes('postCompanyCommission'), 'scheduled recon must not raw-write CompanyAccount');
    const getPropertyCtrl = srcFile('controllers/propertyAccountController.ts');
    const getPropertyFn = getPropertyCtrl.slice(getPropertyCtrl.indexOf('export const getPropertyAccount'), getPropertyCtrl.indexOf('export const migrateLegacyLedgerTypes'));
    assert_1.default.ok(!getPropertyFn.includes('recordIncomeFromPayment'), 'GET getPropertyAccount must not post income');
    assert_1.default.ok(!getPropertyFn.includes('.save('), 'GET getPropertyAccount must not save');
    assert_1.default.ok(!getPropertyFn.includes('recalculateBalance'), 'GET getPropertyAccount must not persist recalc');
    const getAgentCtrl = srcFile('controllers/agentAccountController.ts');
    const getAgentFn = getAgentCtrl.slice(getAgentCtrl.indexOf('export const getAgentAccount'), getAgentCtrl.indexOf('export const getCompanyAgentAccounts'));
    assert_1.default.ok(!getAgentFn.includes('syncCommissionTransactions'), 'GET getAgentAccount must not sync commissions');
    assert_1.default.ok(!getAgentFn.includes('backfillMissingForAgent'), 'GET getAgentAccount must not backfill');
    const trustCtrl = srcFile('controllers/trustAccountController.ts');
    const getFullFn = trustCtrl.slice(trustCtrl.indexOf('export const getTrustAccountFull'), trustCtrl.indexOf('export const getTrustAccountByPropertyFull'));
    assert_1.default.ok(!getFullFn.includes('verifyAndRepairAccountInvariants'), 'GET trust full must not repair balances');
    assert_1.default.ok(!getFullFn.includes('ensureForTrustAccount'), 'GET trust full must not upsert TrustMatter');
    assert_1.default.ok(getFullFn.includes('getForTrustAccount'), 'GET trust full must read existing TrustMatter only');
    const getMatterFn = trustCtrl.slice(trustCtrl.indexOf('export const getTrustMatter'), trustCtrl.indexOf('export const updateTrustMatterCustody'));
    assert_1.default.ok(!getMatterFn.includes('ensureForTrustAccount'), 'GET trust matter must not upsert');
    console.log('phase5b accounting tests passed');
};
run();
