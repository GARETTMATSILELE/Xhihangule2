/**
 * Phase 2 financial hardening regressions.
 * Pure checks. They do not open a database and they do not replay payments.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { isDepositOnlyPayment } from '../services/accountingPostingPolicy';
import { buildExpectedAccountingProjection, evaluateAccountingReconciliation } from '../services/paymentAccountingProjection';
import { computeOwnerIncomeAmount } from '../services/paymentAccountingCompleteness';
import {
  classifyDuplicateGroup,
  rentalAndSaleAreNotDuplicates
} from '../services/propertyAccountDuplicateInventory';
import {
  AccountingClassificationConflictError,
  historicalTransactionDomain,
  journalPaymentType,
  mayPostSaleTrust,
  resolveCreateTransactionDomain,
  resolveDuplicateKeyRace,
  SaleContextRequiredError
} from '../services/transactionDomain';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', rel), 'utf8');

const run = () => {
  // REAL-001 healthy rental domain
  const healthy = resolveCreateTransactionDomain({
    paymentType: 'rental',
    entity: { kind: 'property', rentalType: 'management' }
  });
  assert.strictEqual(healthy.transactionDomain, 'RENTAL');
  assert.strictEqual(computeOwnerIncomeAmount({ isSale: false, ownerAmount: 425, passThroughTotal: 0 }), 425);

  // REAL-004 sale against a rental property
  assert.throws(
    () => resolveCreateTransactionDomain({
      paymentType: 'sale',
      entity: { kind: 'property', rentalType: 'management' }
    }),
    (error: unknown) => {
      assert.ok(error instanceof AccountingClassificationConflictError);
      assert.strictEqual(error.code, 'ACCOUNTING_CLASSIFICATION_CONFLICT');
      assert.strictEqual(error.transactionDomain, 'SALE');
      assert.strictEqual(error.resolvedDomain, 'RENTAL');
      return true;
    }
  );

  // REAL-006 combined rent and equal deposit still posts rent accounting
  assert.strictEqual(isDepositOnlyPayment({ amount: 500, depositAmount: 500 }), false);
  assert.strictEqual(isDepositOnlyPayment({ amount: 0, depositAmount: 500 }), true);

  // REAL-007 sale with no property, development, or unit
  assert.throws(
    () => resolveCreateTransactionDomain({ paymentType: 'sale', entity: { kind: 'missing' } }),
    (error: unknown) => error instanceof SaleContextRequiredError
  );

  // REAL-008 zero owner amount is not posted as income and cannot look complete
  assert.strictEqual(computeOwnerIncomeAmount({ isSale: false, ownerAmount: 0, passThroughTotal: 0 }), 0);
  assert.ok(read('services/propertyAccountService.ts').includes('OwnerIncomeAmountMissingError'));
  const zeroOwnerCash = {
    status: 'completed',
    paymentType: 'rental',
    transactionDomain: 'RENTAL',
    amount: 800,
    depositAmount: 0,
    isProvisional: false,
    commissionDetails: { ownerAmount: 0, agentShare: 0, agencyShare: 800, totalCommission: 800 }
  };
  const zeroOwnerExpected = buildExpectedAccountingProjection(zeroOwnerCash);
  assert.strictEqual(zeroOwnerExpected.ownerIncome, true);
  const zeroOwnerRecon = evaluateAccountingReconciliation({
    paymentId: 'zero-owner-cash',
    expected: zeroOwnerExpected,
    actual: {
      ownerIncome: false,
      agentCommission: false,
      companyCommission: true,
      journal: true,
      vat: false,
      deposit: false
    }
  });
  assert.strictEqual(zeroOwnerRecon.accountingComplete, false);

  // REAL-009 / REAL-010 historical domain survives a later property change
  const rentalThenSale = historicalTransactionDomain({ transactionDomain: 'RENTAL', paymentType: 'rental' });
  assert.strictEqual(rentalThenSale, 'RENTAL');
  assert.strictEqual(journalPaymentType({ transactionDomain: 'RENTAL', paymentType: 'sale' }), 'rental');
  const saleThenRental = historicalTransactionDomain({ transactionDomain: 'SALE', paymentType: 'sale' });
  assert.strictEqual(saleThenRental, 'SALE');
  assert.strictEqual(journalPaymentType({ transactionDomain: 'SALE', paymentType: 'rental' }), 'sale');

  // Legacy rows use payment type, never today's property type
  assert.strictEqual(historicalTransactionDomain({ paymentType: 'introduction' }), 'RENTAL');
  assert.strictEqual(historicalTransactionDomain({ paymentType: 'sale' }), 'SALE');
  assert.strictEqual(historicalTransactionDomain({}), null);

  // Introduction cannot bypass a sale property
  assert.throws(
    () => resolveCreateTransactionDomain({
      paymentType: 'introduction',
      entity: { kind: 'property', rentalType: 'sale' }
    }),
    (error: unknown) => error instanceof AccountingClassificationConflictError
  );
  const introductionLet = resolveCreateTransactionDomain({
    paymentType: 'introduction',
    entity: { kind: 'property', rentalType: 'introduction' }
  });
  assert.strictEqual(introductionLet.transactionDomain, 'RENTAL');
  assert.strictEqual(introductionLet.paymentType, 'introduction');

  // REAL-003 rental must not enter sale trust. REAL sale may.
  assert.strictEqual(mayPostSaleTrust({ transactionDomain: 'RENTAL', paymentType: 'rental' }), false);
  assert.strictEqual(mayPostSaleTrust({ paymentType: 'rental' }), false);
  assert.strictEqual(mayPostSaleTrust({ paymentType: 'introduction' }), false);
  assert.strictEqual(mayPostSaleTrust({ transactionDomain: 'SALE', paymentType: 'sale' }), true);
  const trustWriter = read('services/trustPaymentPostingService.ts');
  assert.ok(trustWriter.includes('mayPostSaleTrust'));
  assert.ok(trustWriter.includes("reason: 'not_sale_domain'"));
  assert.ok(read('controllers/paymentController.ts').includes('if (!mayPostSaleTrust(payment)) return;'));

  // REAL-002 concurrent create resolves to the existing account and does not archive
  assert.strictEqual(resolveDuplicateKeyRace(1), 'use_existing');
  assert.strictEqual(resolveDuplicateKeyRace(2), 'ambiguous');
  assert.ok(!read('services/propertyAccountService.ts').includes('archived ${archived} duplicate active ledger records'));

  // REAL-001b / REAL-005 duplicate classification does not treat rental+sale as duplicates
  assert.strictEqual(rentalAndSaleAreNotDuplicates({ ledgerType: 'rental' }, { ledgerType: 'sale' }), true);
  const safe = classifyDuplicateGroup('p1', 'rental', [
    { id: 'a', propertyId: 'p1', ledgerType: 'rental', isArchived: false, isActive: true, transactions: [{ type: 'income', amount: 100, status: 'completed', paymentId: 'pay' }], ownerPayouts: [], createdAt: '2024-01-01' },
    { id: 'b', propertyId: 'p1', ledgerType: 'rental', isArchived: false, isActive: true, transactions: [], ownerPayouts: [], createdAt: '2024-02-01' }
  ]);
  assert.strictEqual(safe.classification, 'SAFE_DUPLICATE');
  assert.strictEqual(safe.keeperId, 'a');
  assert.strictEqual(safe.automaticMergeAllowed, true);
  const conflict = classifyDuplicateGroup('p1', 'rental', [
    { id: 'a', propertyId: 'p1', ledgerType: 'rental', isArchived: false, isActive: true, transactions: [{ type: 'income', amount: 100, status: 'completed', paymentId: 'pay-1' }], ownerPayouts: [] },
    { id: 'b', propertyId: 'p1', ledgerType: 'rental', isArchived: false, isActive: true, transactions: [{ type: 'income', amount: 80, status: 'completed', paymentId: 'pay-2' }], ownerPayouts: [] }
  ]);
  assert.strictEqual(conflict.classification, 'CONFLICTING_HISTORY');
  assert.strictEqual(conflict.automaticMergeAllowed, false);

  // Reports require an explicit ledger
  const readModel = read('reporting/readModels/index.ts');
  assert.ok(readModel.includes("ledgerType !== 'rental' && ledgerType !== 'sale'"));
  assert.ok(!/PropertyAccount\.findOne\(\{[\s\S]{0,400}\}\)\.sort\(\{ updatedAt: -1 \}\)/.test(readModel));
  assert.ok(read('reporting/api/index.ts').includes('LEDGER_REQUIRED'));
  assert.ok(!read('services/propertyAccountService.ts').includes('does not match Property.rentalType'));
  assert.ok(!read('controllers/paymentWebhookController.ts').includes(': new mongoose.Types.ObjectId();'));
  assert.ok(read('controllers/paymentWebhookController.ts').includes('WEBHOOK_TENANT_REQUIRED'));

  // Sales create no longer mints property or tenant ids
  const salesSlice = read('controllers/paymentController.ts');
  assert.ok(!salesSlice.includes('propertyId: propId || new mongoose.Types.ObjectId()'));
  assert.ok(!salesSlice.includes('tenantId: tenId || new mongoose.Types.ObjectId()'));
  assert.ok(salesSlice.includes('SALE_CONTEXT_REQUIRED'));

  // Historical replay and current-type sale migration are not on the sync job
  const job = read('services/maintenanceJobQueueService.ts');
  assert.ok(!job.includes('syncPropertyAccountsWithPayments'));
  assert.ok(!job.includes('migrateSalesLedgerForCompany'));
  assert.ok(read('services/propertyAccountService.ts').includes('HISTORICAL_REPLAY_DISABLED'));
  assert.ok(read('services/propertyAccountService.ts').includes("getOrCreatePropertyAccount(rental.propertyId.toString(), 'sale')"));

  // Journal failure has a durable retry. Owner-income amount gaps do not loop.
  assert.ok(read('services/paymentAccountingOrchestrator.ts').includes("enqueueEvent('journal'"));
  assert.ok(read('services/ledgerEventService.ts').includes("ev.type === 'journal'"));
  assert.ok(read('models/LedgerEvent.ts').includes("'journal'"));

  // Golden rental and sale expectations
  const golden = [
    { name: 'normal rent', depositOnly: false, owner: 850, domain: 'RENTAL' as const },
    { name: 'rent plus deposit', depositOnly: false, owner: 850, domain: 'RENTAL' as const },
    { name: 'deposit only', depositOnly: true, owner: 0, domain: 'RENTAL' as const }
  ];
  assert.strictEqual(isDepositOnlyPayment({ amount: 1000, depositAmount: 0 }), golden[0].depositOnly);
  assert.strictEqual(computeOwnerIncomeAmount({ isSale: false, ownerAmount: 850, passThroughTotal: 0 }), golden[0].owner);
  assert.strictEqual(isDepositOnlyPayment({ amount: 1000, depositAmount: 1000 }), golden[1].depositOnly);
  assert.strictEqual(isDepositOnlyPayment({ amount: 0, depositAmount: 1000 }), golden[2].depositOnly);
  assert.strictEqual(computeOwnerIncomeAmount({ isSale: true, ownerAmount: 90000, passThroughTotal: 500 }), 90000);

  console.log('Phase 2 financial hardening tests passed');
};

run();
