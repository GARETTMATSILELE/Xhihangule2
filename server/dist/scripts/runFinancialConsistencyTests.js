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
/**
 * Isolated financial lifecycle checks against persisted records.
 * Uses disposable local databases. Does not verify Cosmos DB and does not
 * recalculate historical VAT independently of the stored payment snapshot.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Payment_1 = require("../models/Payment");
const TaxObligation_1 = require("../models/TaxObligation");
const VatRecord_1 = require("../models/VatRecord");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const CompanyAccount_1 = require("../models/CompanyAccount");
const commissionService_1 = require("../services/commissionService");
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const vatPolicyService_1 = require("../services/vatPolicyService");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const paymentAccountingReconciliation_1 = require("../services/paymentAccountingReconciliation");
const rentalDeposit_1 = require("../models/rentalDeposit");
const paymentAccountingOrchestrator_1 = require("../services/paymentAccountingOrchestrator");
const vatReturnService_1 = require("../services/vatReturnService");
const financialPostingGapService_1 = require("../services/financialPostingGapService");
const paymentAccountingCompleteness_1 = require("../services/paymentAccountingCompleteness");
const financialUniquenessRegistry_1 = require("../services/financialUniquenessRegistry");
const database_1 = require("../config/database");
const DB = process.env.FINANCIAL_CONSISTENCY_DB || 'mongodb://127.0.0.1:27017/mantis_financial_consistency_test';
const ACCOUNTING_DB = process.env.FINANCIAL_CONSISTENCY_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_financial_consistency_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const failures = [];
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        assert(financialUniquenessRegistry_1.FINANCIAL_UNIQUENESS.every((row) => row.productionEnforcement !== 'DECLARED_UNVERIFIED_ON_COSMOS' || row.limitation.length > 0), 'uniqueness registry states the Cosmos limitation');
        assert(financialUniquenessRegistry_1.FINANCIAL_UNIQUENESS.some((row) => row.collection === 'payment_sessions' && row.productionEnforcement === 'NOT_ENFORCED'), 'Paynow providerRef is not described as unique');
        process.env.MANTIS_TEST_SEAM = '1';
        process.env.NODE_ENV = 'development';
        try {
            yield mongoose_1.default.connect(DB, { serverSelectionTimeoutMS: 4000 });
        }
        catch (error) {
            console.log(`INTEGRATION SKIPPED: local MongoDB unavailable (${(error === null || error === void 0 ? void 0 : error.message) || error}). Registry assertions ran. Not a Cosmos DB result.`);
            process.exit(failures.length ? 1 : 0);
        }
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB);
        yield database_1.accountingConnection.dropDatabase();
        yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
        yield JournalEntry_1.JournalEntry.syncIndexes();
        yield TaxObligation_1.TaxObligation.syncIndexes();
        yield VatRecord_1.VatRecord.syncIndexes();
        const user = yield User_1.User.create({
            email: 'consistency@example.test',
            password: 'test-pass-1',
            firstName: 'Consistency',
            lastName: 'Tester',
            role: 'admin',
            roles: ['admin'],
            isActive: true,
            sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: 'Consistency Co',
            address: '1 Consistency Street',
            phone: '0770000091',
            email: 'consistency-co@example.test',
            registrationNumber: 'CONS-1',
            tinNumber: 'CONS-TIN',
            country: 'Zimbabwe',
            ownerId: user._id,
            taxProfile: { vatRegistered: true, vatNumber: 'ZW-CONS', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
        });
        const otherCompany = yield Company_1.Company.create({
            name: 'Other Consistency Co',
            address: '2 Consistency Street',
            phone: '0770000092',
            email: 'other-consistency@example.test',
            registrationNumber: 'CONS-2',
            tinNumber: 'CONS-TIN-2',
            country: 'Zimbabwe',
            ownerId: user._id,
            taxProfile: { vatRegistered: false }
        });
        const exclusive = yield Property_1.Property.create({
            companyId: company._id, ownerId: user._id, name: 'Exclusive House', address: '1 Exclusive Road',
            rentalType: 'management', rent: 1800, commission: 15, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
        });
        const inclusive = yield Property_1.Property.create({
            companyId: company._id, ownerId: user._id, name: 'Inclusive House', address: '1 Inclusive Road',
            rentalType: 'management', rent: 1800, commission: 15, vatOnCommission: true, vatCommissionTreatment: 'inclusive'
        });
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Consistency', lastName: 'Tenant', email: 'consistency-tenant@example.test', phone: '0771111191',
            companyId: company._id, ownerId: user._id, status: 'Active'
        });
        function snapshotFor(property_1, amount_1) {
            return __awaiter(this, arguments, void 0, function* (property, amount, levy = 0) {
                const policy = yield (0, vatPolicyService_1.resolveCommissionVatPolicy)({
                    companyId: String(company._id),
                    paymentDate: PAYMENT_DATE,
                    property,
                    requestedVatOnCommission: Boolean(property.vatOnCommission),
                    requestedTreatment: property.vatCommissionTreatment,
                    commissionType: 'management'
                });
                const flags = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)(policy);
                const calc = yield commissionService_1.CommissionService.calculateForProperty({
                    companyId: company._id,
                    grossRent: amount,
                    levy,
                    commissionPercentage: Number(property.commission || 0),
                    vatOnCommission: flags.vatOnCommission,
                    vatTreatment: flags.vatTreatment,
                    vatRate: flags.vatRate,
                    paymentDate: PAYMENT_DATE,
                    commissionType: 'management'
                });
                return { policy, flags, snapshot: (0, vatPolicyService_1.stampVatDecision)((0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc), policy) };
            });
        }
        let sequence = 0;
        function post(input) {
            return __awaiter(this, void 0, void 0, function* () {
                sequence += 1;
                const built = yield snapshotFor(input.property, input.amount, input.levy || 0);
                const payment = yield Payment_1.Payment.create({
                    companyId: company._id,
                    propertyId: input.property._id,
                    tenantId: tenant._id,
                    agentId: user._id,
                    processedBy: user._id,
                    propertyType: 'residential',
                    amount: input.amount,
                    depositAmount: input.depositAmount || 0,
                    paymentType: 'rental',
                    paymentMethod: 'bank_transfer',
                    status: 'completed',
                    paymentDate: PAYMENT_DATE,
                    rentalPeriodMonth: input.month || sequence,
                    rentalPeriodYear: 2026,
                    advanceMonthsPaid: input.advanceMonthsPaid,
                    transactionDomain: 'RENTAL',
                    commissionFinalized: true,
                    accountingStatus: 'pending',
                    accountingComplete: false,
                    applyVatOnCommission: built.flags.vatOnCommission,
                    vatOnCommissionRate: built.flags.vatRate,
                    vatCommissionTreatment: built.flags.vatTreatment,
                    commissionDetails: built.snapshot,
                    levyAllocated: input.levy || 0,
                    referenceNumber: `CONS-${sequence}`,
                    notes: input.notes,
                    idempotencyKey: `cons:${new mongoose_1.default.Types.ObjectId().toString()}`
                });
                const posted = yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(payment._id), { createdBy: String(user._id) });
                return { payment, built, posted };
            });
        }
        function journalDebit(paymentId) {
            return __awaiter(this, void 0, void 0, function* () {
                const journal = yield JournalEntry_1.JournalEntry.findOne({ sourceId: paymentId, status: 'posted', sourceModule: 'payment' }).lean();
                if (!journal)
                    return { journal: null, debit: 0 };
                const lines = yield JournalLine_1.JournalLine.find({ journalEntryId: journal._id }).select('debit').lean();
                return { journal, debit: lines.reduce((sum, line) => sum + Number(line.debit || 0), 0) };
            });
        }
        const normal = yield post({ property: exclusive, amount: 1800, month: 1 });
        const normalJournal = yield journalDebit(String(normal.payment._id));
        const normalObligation = yield TaxObligation_1.TaxObligation.findOne({ paymentId: normal.payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        const normalVat = yield VatRecord_1.VatRecord.findOne({ transactionId: String(normal.payment._id) }).lean();
        const normalIncome = yield PropertyAccount_1.default.findOne({ 'transactions.idempotencyKey': `payment:${normal.payment._id}` }).lean();
        const incomeTx = ((normalIncome === null || normalIncome === void 0 ? void 0 : normalIncome.transactions) || []).find((tx) => tx.idempotencyKey === `payment:${normal.payment._id}`);
        assert(normal.posted.accountingComplete === true, `normal rental accounting completes, got ${normal.posted.accountingStatus}`);
        assert(Math.abs(normalJournal.debit - 1800) < 0.02, `journal debit matches the payment amount, got ${normalJournal.debit}`);
        assert(Number(normalObligation === null || normalObligation === void 0 ? void 0 : normalObligation.taxAmount) === Number(normal.built.snapshot.vatAmount), 'obligation matches the stored VAT snapshot');
        assert(Number(normalVat === null || normalVat === void 0 ? void 0 : normalVat.vatCollected) === Number(normal.built.snapshot.vatAmount), 'VAT collection matches the stored VAT snapshot');
        assert(Number(incomeTx === null || incomeTx === void 0 ? void 0 : incomeTx.amount) === Number(normal.built.snapshot.ownerAmount), 'property account income matches the stored owner amount');
        assert(Boolean((_a = normal.built.snapshot.vatDecision) === null || _a === void 0 ? void 0 : _a.reason) && ((_b = normal.built.snapshot.vatDecision) === null || _b === void 0 ? void 0 : _b.registrationStatus) === true, 'future snapshot stores the VAT decision evidence');
        assert(((_c = normal.built.snapshot.vatDecision) === null || _c === void 0 ? void 0 : _c.treatment) === 'exclusive', 'exclusive treatment is stored on the decision');
        const repeat = yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(normal.payment._id), { createdBy: String(user._id) });
        assert(repeat.accountingComplete === true, 'repeated posting stays complete');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: String(normal.payment._id), sourceModule: 'payment' })) === 1, 'repeated posting does not add a journal');
        assert((yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: normal.payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null })) === 1, 'repeated posting does not add an obligation');
        const concurrentPayment = yield (() => __awaiter(this, void 0, void 0, function* () {
            const built = yield snapshotFor(exclusive, 1800);
            const payment = yield Payment_1.Payment.create({
                companyId: company._id, propertyId: exclusive._id, tenantId: tenant._id, agentId: user._id, processedBy: user._id,
                propertyType: 'residential', amount: 1800, depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer',
                status: 'completed', paymentDate: PAYMENT_DATE, rentalPeriodMonth: 2, rentalPeriodYear: 2026, transactionDomain: 'RENTAL',
                commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false, applyVatOnCommission: true,
                vatOnCommissionRate: built.flags.vatRate, vatCommissionTreatment: 'exclusive', commissionDetails: built.snapshot,
                referenceNumber: 'CONS-CONCURRENT', idempotencyKey: `cons:${new mongoose_1.default.Types.ObjectId().toString()}`
            });
            yield Promise.all([
                (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(payment._id), { createdBy: String(user._id) }),
                (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(payment._id), { createdBy: String(user._id) })
            ]);
            return payment;
        }))();
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: String(concurrentPayment._id), sourceModule: 'payment' })) === 1, 'concurrent posting leaves one journal');
        assert((yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: concurrentPayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null })) === 1, 'concurrent posting leaves one obligation');
        const partial = yield post({ property: exclusive, amount: 900, month: 3 });
        const partialJournal = yield journalDebit(String(partial.payment._id));
        assert(Math.abs(partialJournal.debit - 900) < 0.02, 'partial receipt journal uses the received amount');
        assert(Number((_d = (yield TaxObligation_1.TaxObligation.findOne({ paymentId: partial.payment._id, reversalOf: null }).lean())) === null || _d === void 0 ? void 0 : _d.taxAmount) === Number(partial.built.snapshot.vatAmount), 'partial obligation matches its own snapshot');
        const advance = yield post({ property: exclusive, amount: 3600, advanceMonthsPaid: 2, month: 4 });
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: String(advance.payment._id), sourceModule: 'payment' })) === 1, 'advance rent posts one journal');
        assert(Math.abs((yield journalDebit(String(advance.payment._id))).debit - 3600) < 0.02, 'advance journal matches the receipt, not a second month');
        const depositBuilt = yield snapshotFor(exclusive, 0);
        const depositPayment = yield Payment_1.Payment.create({
            companyId: company._id, propertyId: exclusive._id, tenantId: tenant._id, agentId: user._id, processedBy: user._id,
            propertyType: 'residential', amount: 0, depositAmount: 500, paymentType: 'rental', paymentMethod: 'bank_transfer',
            status: 'completed', paymentDate: PAYMENT_DATE, rentalPeriodMonth: 5, rentalPeriodYear: 2026, transactionDomain: 'RENTAL',
            commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false, commissionDetails: depositBuilt.snapshot,
            referenceNumber: 'CONS-DEPOSIT', idempotencyKey: `cons:${new mongoose_1.default.Types.ObjectId().toString()}`
        });
        yield (0, paymentAccountingReconciliation_1.ensureDepositLedgerFromPayment)(depositPayment);
        const depositPosted = yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(depositPayment._id), { createdBy: String(user._id) });
        assert((yield rentalDeposit_1.RentalDeposit.countDocuments({ paymentId: depositPayment._id, type: 'payment' })) === 1, 'deposit-only receipt stores one deposit ledger row');
        assert(!(yield JournalEntry_1.JournalEntry.findOne({ sourceId: String(depositPayment._id) }).lean()), 'deposit-only receipt does not create a rental journal');
        assert(depositPosted.accountingComplete === true, `deposit-only receipt is complete once the deposit ledger exists, got ${depositPosted.accountingStatus} missing ${depositPosted.recon.missing.join(',')}`);
        const levy = yield post({ property: exclusive, amount: 1800, levy: 40, month: 6 });
        const levyIncome = yield PropertyAccount_1.default.findOne({ 'transactions.idempotencyKey': `payment:${levy.payment._id}` }).lean();
        const levyTx = ((levyIncome === null || levyIncome === void 0 ? void 0 : levyIncome.transactions) || []).find((tx) => tx.idempotencyKey === `payment:${levy.payment._id}`);
        const expectedLevyOwner = (0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({
            isSale: false,
            ownerAmount: levy.built.snapshot.ownerAmount,
            passThroughTotal: 40
        });
        assert(Number(levyTx === null || levyTx === void 0 ? void 0 : levyTx.amount) === expectedLevyOwner, `levy receipt owner projection follows the stored owner amount less the levy pass-through, got ${levyTx === null || levyTx === void 0 ? void 0 : levyTx.amount} expected ${expectedLevyOwner}`);
        const companyAccount = yield CompanyAccount_1.CompanyAccount.findOne({ companyId: company._id }).lean();
        const companyTx = ((companyAccount === null || companyAccount === void 0 ? void 0 : companyAccount.transactions) || []).find((tx) => String(tx.paymentId) === String(levy.payment._id) && tx.isArchived !== true && !tx.reversesPaymentId);
        assert(Number(companyTx === null || companyTx === void 0 ? void 0 : companyTx.amount) === Number(levy.built.snapshot.agencyShare), 'company commission projection matches the stored agency share');
        const inclusivePayment = yield post({ property: inclusive, amount: 1800, month: 7 });
        assert(((_e = inclusivePayment.built.snapshot.vatDecision) === null || _e === void 0 ? void 0 : _e.treatment) === 'inclusive', 'inclusive treatment is stored');
        assert(Number((_f = (yield TaxObligation_1.TaxObligation.findOne({ paymentId: inclusivePayment.payment._id, reversalOf: null }).lean())) === null || _f === void 0 ? void 0 : _f.taxAmount) === Number(inclusivePayment.built.snapshot.vatAmount), 'inclusive obligation matches the stored snapshot');
        const gap = yield post({ property: exclusive, amount: 1800, notes: 'PHASE_FAIL_OBLIGATION_ONCE', month: 8 });
        assert(gap.posted.accountingComplete === false, 'failure after the journal and before the obligation stays incomplete');
        const gapJournalId = String((_g = (yield JournalEntry_1.JournalEntry.findOne({ sourceId: String(gap.payment._id), sourceModule: 'payment' }).lean())) === null || _g === void 0 ? void 0 : _g._id);
        assert(Boolean(gapJournalId), 'the journal remains after the obligation failure');
        const recovered = yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(gap.payment._id), { createdBy: String(user._id) });
        assert(recovered.accountingComplete === true, `retry after the obligation failure completes, got ${recovered.accountingStatus} ${(_j = (_h = recovered.recon) === null || _h === void 0 ? void 0 : _h.missing) === null || _j === void 0 ? void 0 : _j.join(',')}`);
        assert(String((_k = (yield JournalEntry_1.JournalEntry.findOne({ sourceId: String(gap.payment._id), sourceModule: 'payment' }).lean())) === null || _k === void 0 ? void 0 : _k._id) === gapJournalId, 'retry does not replace the journal');
        const beforeReverse = yield TaxObligation_1.TaxObligation.findOne({ paymentId: normal.payment._id, reversalOf: null }).lean();
        const beforeVat = yield VatRecord_1.VatRecord.findOne({ transactionId: String(normal.payment._id) }).lean();
        const reversed = yield (0, paymentAccountingOrchestrator_1.reversePaymentAccounting)(String(normal.payment._id), { reason: 'consistency reversal' });
        assert(reversed.status === 'reversed' || reversed.status === 'already_reversed', `reversal completes, got ${reversed.status} ${reversed.errors.join('; ')}`);
        const afterReverse = yield TaxObligation_1.TaxObligation.findById(beforeReverse === null || beforeReverse === void 0 ? void 0 : beforeReverse._id).lean();
        const afterVat = yield VatRecord_1.VatRecord.findById(beforeVat === null || beforeVat === void 0 ? void 0 : beforeVat._id).lean();
        assert(Number(afterReverse === null || afterReverse === void 0 ? void 0 : afterReverse.taxAmount) === Number(beforeReverse === null || beforeReverse === void 0 ? void 0 : beforeReverse.taxAmount) && (afterReverse === null || afterReverse === void 0 ? void 0 : afterReverse.status) === 'REVERSED', 'reversal preserves the obligation amount');
        assert(Number(afterVat === null || afterVat === void 0 ? void 0 : afterVat.vatCollected) === Number(beforeVat === null || beforeVat === void 0 ? void 0 : beforeVat.vatCollected), 'reversal preserves the VAT collection amount');
        const unregisteredPolicy = yield (0, vatPolicyService_1.resolveCommissionVatPolicy)({
            companyId: String(otherCompany._id),
            paymentDate: PAYMENT_DATE,
            property: exclusive,
            requestedVatOnCommission: true,
            requestedTreatment: 'exclusive',
            commissionType: 'management'
        });
        assert(unregisteredPolicy.apply === false && unregisteredPolicy.decision.reason === 'company_not_vat_registered_on_date', 'missing registration withholds VAT and records the reason');
        assert(unregisteredPolicy.decision.registrationEffectiveDate == null, 'a missing registration date is not invented');
        const blocked = (0, vatPolicyService_1.centralVatRateBlock)({ reason: 'vat_rate_missing_on_transaction_date' });
        assert((blocked === null || blocked === void 0 ? void 0 : blocked.code) === 'VAT_RATE_UNAVAILABLE', 'missing central VAT rate blocks the payment instead of posting zero VAT as if it were calculated');
        const otherGaps = yield (0, financialPostingGapService_1.detectFinancialPostingGaps)(String(otherCompany._id));
        assert(otherGaps.every((row) => row.companyId === String(otherCompany._id)), 'gap detection stays inside the requested company');
        const recon = yield (0, paymentAccountingReconciliation_1.reconcilePayment)(String(inclusivePayment.payment._id));
        assert(recon.accountingComplete === true, 'accountant reconciliation agrees the inclusive payment is complete');
        const obligationSum = (yield TaxObligation_1.TaxObligation.find({
            companyId: company._id,
            taxPeriod: '2026-10',
            taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] },
            status: { $ne: 'REVERSED' }
        }).lean()).reduce((sum, row) => sum + Number(row.taxAmount || 0), 0);
        const vatReturn = yield (0, vatReturnService_1.prepareVatReturn)(String(company._id), '2026-10', String(user._id));
        assert(Math.abs(Number(vatReturn.outputVat || 0) - obligationSum) < 0.05, `VAT return output follows non-reversed obligations, return ${vatReturn.outputVat} obligations ${obligationSum}`);
        if (failures.length) {
            console.error(failures.map((row) => `FAIL ${row}`).join('\n'));
            process.exit(1);
        }
        console.log('PASS financial consistency cases on local MongoDB. Cosmos DB was not used. VAT return output is the filing-period working paper over non-reversed obligations; reversed snapshots stay on the original payment and are excluded from that return.');
        process.exit(0);
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
