"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Phase 2 financial hardening regressions.
 * Pure checks. They do not open a database and they do not replay payments.
 */
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const accountingPostingPolicy_1 = require("../services/accountingPostingPolicy");
const paymentAccountingProjection_1 = require("../services/paymentAccountingProjection");
const paymentAccountingCompleteness_1 = require("../services/paymentAccountingCompleteness");
const propertyAccountDuplicateInventory_1 = require("../services/propertyAccountDuplicateInventory");
const transactionDomain_1 = require("../services/transactionDomain");
const read = (rel) => fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
const run = () => {
    // REAL-001 healthy rental domain
    const healthy = (0, transactionDomain_1.resolveCreateTransactionDomain)({
        paymentType: 'rental',
        entity: { kind: 'property', rentalType: 'management' }
    });
    assert_1.default.strictEqual(healthy.transactionDomain, 'RENTAL');
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({ isSale: false, ownerAmount: 425, passThroughTotal: 0 }), 425);
    // REAL-004 sale against a rental property
    assert_1.default.throws(() => (0, transactionDomain_1.resolveCreateTransactionDomain)({
        paymentType: 'sale',
        entity: { kind: 'property', rentalType: 'management' }
    }), (error) => {
        assert_1.default.ok(error instanceof transactionDomain_1.AccountingClassificationConflictError);
        assert_1.default.strictEqual(error.code, 'ACCOUNTING_CLASSIFICATION_CONFLICT');
        assert_1.default.strictEqual(error.transactionDomain, 'SALE');
        assert_1.default.strictEqual(error.resolvedDomain, 'RENTAL');
        return true;
    });
    // REAL-006 combined rent and equal deposit still posts rent accounting
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.isDepositOnlyPayment)({ amount: 500, depositAmount: 500 }), false);
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.isDepositOnlyPayment)({ amount: 0, depositAmount: 500 }), true);
    // REAL-007 sale with no property, development, or unit
    assert_1.default.throws(() => (0, transactionDomain_1.resolveCreateTransactionDomain)({ paymentType: 'sale', entity: { kind: 'missing' } }), (error) => error instanceof transactionDomain_1.SaleContextRequiredError);
    // REAL-008 zero owner amount is not posted as income and cannot look complete
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({ isSale: false, ownerAmount: 0, passThroughTotal: 0 }), 0);
    assert_1.default.ok(read('services/propertyAccountService.ts').includes('OwnerIncomeAmountMissingError'));
    const zeroOwnerCash = {
        status: 'completed',
        paymentType: 'rental',
        transactionDomain: 'RENTAL',
        amount: 800,
        depositAmount: 0,
        isProvisional: false,
        commissionDetails: { ownerAmount: 0, agentShare: 0, agencyShare: 800, totalCommission: 800 }
    };
    const zeroOwnerExpected = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(zeroOwnerCash);
    assert_1.default.strictEqual(zeroOwnerExpected.ownerIncome, true);
    const zeroOwnerRecon = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
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
    assert_1.default.strictEqual(zeroOwnerRecon.accountingComplete, false);
    // REAL-009 / REAL-010 historical domain survives a later property change
    const rentalThenSale = (0, transactionDomain_1.historicalTransactionDomain)({ transactionDomain: 'RENTAL', paymentType: 'rental' });
    assert_1.default.strictEqual(rentalThenSale, 'RENTAL');
    assert_1.default.strictEqual((0, transactionDomain_1.journalPaymentType)({ transactionDomain: 'RENTAL', paymentType: 'sale' }), 'rental');
    const saleThenRental = (0, transactionDomain_1.historicalTransactionDomain)({ transactionDomain: 'SALE', paymentType: 'sale' });
    assert_1.default.strictEqual(saleThenRental, 'SALE');
    assert_1.default.strictEqual((0, transactionDomain_1.journalPaymentType)({ transactionDomain: 'SALE', paymentType: 'rental' }), 'sale');
    // Legacy rows use payment type, never today's property type
    assert_1.default.strictEqual((0, transactionDomain_1.historicalTransactionDomain)({ paymentType: 'introduction' }), 'RENTAL');
    assert_1.default.strictEqual((0, transactionDomain_1.historicalTransactionDomain)({ paymentType: 'sale' }), 'SALE');
    assert_1.default.strictEqual((0, transactionDomain_1.historicalTransactionDomain)({}), null);
    // Introduction cannot bypass a sale property
    assert_1.default.throws(() => (0, transactionDomain_1.resolveCreateTransactionDomain)({
        paymentType: 'introduction',
        entity: { kind: 'property', rentalType: 'sale' }
    }), (error) => error instanceof transactionDomain_1.AccountingClassificationConflictError);
    const introductionLet = (0, transactionDomain_1.resolveCreateTransactionDomain)({
        paymentType: 'introduction',
        entity: { kind: 'property', rentalType: 'introduction' }
    });
    assert_1.default.strictEqual(introductionLet.transactionDomain, 'RENTAL');
    assert_1.default.strictEqual(introductionLet.paymentType, 'introduction');
    // REAL-003 rental must not enter sale trust. REAL sale may.
    assert_1.default.strictEqual((0, transactionDomain_1.mayPostSaleTrust)({ transactionDomain: 'RENTAL', paymentType: 'rental' }), false);
    assert_1.default.strictEqual((0, transactionDomain_1.mayPostSaleTrust)({ paymentType: 'rental' }), false);
    assert_1.default.strictEqual((0, transactionDomain_1.mayPostSaleTrust)({ paymentType: 'introduction' }), false);
    assert_1.default.strictEqual((0, transactionDomain_1.mayPostSaleTrust)({ transactionDomain: 'SALE', paymentType: 'sale' }), true);
    const trustWriter = read('services/trustPaymentPostingService.ts');
    assert_1.default.ok(trustWriter.includes('mayPostSaleTrust'));
    assert_1.default.ok(trustWriter.includes("reason: 'not_sale_domain'"));
    assert_1.default.ok(read('controllers/paymentController.ts').includes('if (!mayPostSaleTrust(payment)) return;'));
    // REAL-002 concurrent create resolves to the existing account and does not archive
    assert_1.default.strictEqual((0, transactionDomain_1.resolveDuplicateKeyRace)(1), 'use_existing');
    assert_1.default.strictEqual((0, transactionDomain_1.resolveDuplicateKeyRace)(2), 'ambiguous');
    assert_1.default.ok(!read('services/propertyAccountService.ts').includes('archived ${archived} duplicate active ledger records'));
    // REAL-001b / REAL-005 duplicate classification does not treat rental+sale as duplicates
    assert_1.default.strictEqual((0, propertyAccountDuplicateInventory_1.rentalAndSaleAreNotDuplicates)({ ledgerType: 'rental' }, { ledgerType: 'sale' }), true);
    const safe = (0, propertyAccountDuplicateInventory_1.classifyDuplicateGroup)('p1', 'rental', [
        { id: 'a', propertyId: 'p1', ledgerType: 'rental', isArchived: false, isActive: true, transactions: [{ type: 'income', amount: 100, status: 'completed', paymentId: 'pay' }], ownerPayouts: [], createdAt: '2024-01-01' },
        { id: 'b', propertyId: 'p1', ledgerType: 'rental', isArchived: false, isActive: true, transactions: [], ownerPayouts: [], createdAt: '2024-02-01' }
    ]);
    assert_1.default.strictEqual(safe.classification, 'SAFE_DUPLICATE');
    assert_1.default.strictEqual(safe.keeperId, 'a');
    assert_1.default.strictEqual(safe.automaticMergeAllowed, true);
    const conflict = (0, propertyAccountDuplicateInventory_1.classifyDuplicateGroup)('p1', 'rental', [
        { id: 'a', propertyId: 'p1', ledgerType: 'rental', isArchived: false, isActive: true, transactions: [{ type: 'income', amount: 100, status: 'completed', paymentId: 'pay-1' }], ownerPayouts: [] },
        { id: 'b', propertyId: 'p1', ledgerType: 'rental', isArchived: false, isActive: true, transactions: [{ type: 'income', amount: 80, status: 'completed', paymentId: 'pay-2' }], ownerPayouts: [] }
    ]);
    assert_1.default.strictEqual(conflict.classification, 'CONFLICTING_HISTORY');
    assert_1.default.strictEqual(conflict.automaticMergeAllowed, false);
    // Reports require an explicit ledger
    const readModel = read('reporting/readModels/index.ts');
    assert_1.default.ok(readModel.includes("ledgerType !== 'rental' && ledgerType !== 'sale'"));
    assert_1.default.ok(!/PropertyAccount\.findOne\(\{[\s\S]{0,400}\}\)\.sort\(\{ updatedAt: -1 \}\)/.test(readModel));
    assert_1.default.ok(read('reporting/api/index.ts').includes('LEDGER_REQUIRED'));
    assert_1.default.ok(!read('services/propertyAccountService.ts').includes('does not match Property.rentalType'));
    assert_1.default.ok(!read('controllers/paymentWebhookController.ts').includes(': new mongoose.Types.ObjectId();'));
    assert_1.default.ok(read('controllers/paymentWebhookController.ts').includes('WEBHOOK_TENANT_REQUIRED'));
    // Sales create no longer mints property or tenant ids
    const salesSlice = read('controllers/paymentController.ts');
    assert_1.default.ok(!salesSlice.includes('propertyId: propId || new mongoose.Types.ObjectId()'));
    assert_1.default.ok(!salesSlice.includes('tenantId: tenId || new mongoose.Types.ObjectId()'));
    assert_1.default.ok(salesSlice.includes('SALE_CONTEXT_REQUIRED'));
    // Historical replay and current-type sale migration are not on the sync job
    const job = read('services/maintenanceJobQueueService.ts');
    assert_1.default.ok(!job.includes('syncPropertyAccountsWithPayments'));
    assert_1.default.ok(!job.includes('migrateSalesLedgerForCompany'));
    assert_1.default.ok(read('services/propertyAccountService.ts').includes('HISTORICAL_REPLAY_DISABLED'));
    assert_1.default.ok(read('services/propertyAccountService.ts').includes("getOrCreatePropertyAccount(rental.propertyId.toString(), 'sale')"));
    // Journal failure has a durable retry. Owner-income amount gaps do not loop.
    assert_1.default.ok(read('services/paymentAccountingOrchestrator.ts').includes("enqueueEvent('journal'"));
    assert_1.default.ok(read('services/ledgerEventService.ts').includes("ev.type === 'journal'"));
    assert_1.default.ok(read('models/LedgerEvent.ts').includes("'journal'"));
    // Golden rental and sale expectations
    const golden = [
        { name: 'normal rent', depositOnly: false, owner: 850, domain: 'RENTAL' },
        { name: 'rent plus deposit', depositOnly: false, owner: 850, domain: 'RENTAL' },
        { name: 'deposit only', depositOnly: true, owner: 0, domain: 'RENTAL' }
    ];
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.isDepositOnlyPayment)({ amount: 1000, depositAmount: 0 }), golden[0].depositOnly);
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({ isSale: false, ownerAmount: 850, passThroughTotal: 0 }), golden[0].owner);
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.isDepositOnlyPayment)({ amount: 1000, depositAmount: 1000 }), golden[1].depositOnly);
    assert_1.default.strictEqual((0, accountingPostingPolicy_1.isDepositOnlyPayment)({ amount: 0, depositAmount: 1000 }), golden[2].depositOnly);
    assert_1.default.strictEqual((0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({ isSale: true, ownerAmount: 90000, passThroughTotal: 500 }), 90000);
    console.log('Phase 2 financial hardening tests passed');
};
run();
