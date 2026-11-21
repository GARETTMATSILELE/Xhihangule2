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
 * Historical VAT payable journal safeguard. Local databases only.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Payment_1 = require("../models/Payment");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const VatRecord_1 = require("../models/VatRecord");
const TaxObligation_1 = require("../models/TaxObligation");
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const AgentAccount_1 = require("../models/AgentAccount");
const CompanyAccount_1 = require("../models/CompanyAccount");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const database_1 = require("../config/database");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const accountingPeriodService_1 = require("../services/accountingPeriodService");
const paymentAccountingReconciliation_1 = require("../services/paymentAccountingReconciliation");
const paymentAccountingIntegrity_1 = require("../services/paymentAccountingIntegrity");
const vatPolicyService_1 = require("../services/vatPolicyService");
const DB = 'mongodb://127.0.0.1:27017/mantis_vat_journal_safeguard';
const ACCOUNTING_DB = 'mongodb://127.0.0.1:27017/mantis_vat_journal_safeguard_accounting';
const failures = [];
const check = (condition, message) => {
    if (!condition)
        failures.push(message);
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (/cosmos|azure|mantisafrica/i.test(`${DB} ${ACCOUNTING_DB}`)) {
            throw new Error('Refusing to run against a non-local database');
        }
        yield mongoose_1.default.connect(DB);
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB);
        yield database_1.accountingConnection.dropDatabase();
        yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
        const user = yield User_1.User.create({
            email: 'vat-journal-safeguard@example.test',
            password: 'Release-verify-local-1',
            firstName: 'VAT',
            lastName: 'Safeguard',
            role: 'accountant',
            roles: ['accountant'],
            isActive: true,
            sessionVersion: 1
        });
        const incomplete = yield Company_1.Company.create({
            name: 'Journal Safeguard Incomplete',
            address: '1 Test Street',
            phone: '0770000200',
            email: 'journal-incomplete@example.test',
            registrationNumber: 'JRN-INC',
            tinNumber: 'JRN-INC-TIN',
            country: 'Zimbabwe',
            ownerId: user._id,
            taxProfile: {
                vatRegistered: true,
                vatNumber: 'ZW-INC',
                vatCategory: '',
                vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
            }
        });
        const complete = yield Company_1.Company.create({
            name: 'Journal Safeguard Complete',
            address: '2 Test Street',
            phone: '0770000201',
            email: 'journal-complete@example.test',
            registrationNumber: 'JRN-OK',
            tinNumber: 'JRN-OK-TIN',
            country: 'Zimbabwe',
            ownerId: user._id,
            taxProfile: {
                vatRegistered: true,
                vatNumber: 'ZW-OK',
                vatCategory: 'standard',
                vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
            }
        });
        for (const row of [incomplete, complete]) {
            yield (0, accountingPeriodService_1.openExplicitPeriodForDate)({ companyId: String(row._id), date: new Date('2026-11-03T00:00:00.000Z'), createdBy: String(user._id) });
        }
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'VAT', lastName: 'Tenant', email: 'vat-tenant@example.test', phone: '0770000202',
            companyId: complete._id, ownerId: user._id, status: 'Active'
        });
        const incompleteProperty = yield Property_1.Property.create({
            companyId: incomplete._id, ownerId: user._id, name: 'Incomplete VAT Property', address: 'Incomplete Road',
            rentalType: 'management', type: 'house', rent: 2000, commission: 15, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
        });
        const completeProperty = yield Property_1.Property.create({
            companyId: complete._id, ownerId: user._id, name: 'Complete VAT Property', address: 'Complete Road',
            rentalType: 'management', type: 'house', rent: 2000, commission: 15, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
        });
        function makePayment(input) {
            return __awaiter(this, void 0, void 0, function* () {
                return Payment_1.Payment.create({
                    companyId: input.company._id,
                    propertyId: input.property._id,
                    tenantId: tenant._id,
                    agentId: user._id,
                    processedBy: user._id,
                    propertyType: 'residential',
                    amount: 2000,
                    rentAllocated: 2000,
                    depositAmount: 0,
                    paymentType: 'rental',
                    paymentMethod: 'bank_transfer',
                    status: 'completed',
                    paymentDate: new Date('2026-11-03T00:00:00.000Z'),
                    rentalPeriodMonth: 11,
                    rentalPeriodYear: 2026,
                    transactionDomain: 'RENTAL',
                    commissionFinalized: true,
                    accountingComplete: input.accountingComplete === undefined ? null : input.accountingComplete,
                    referenceNumber: input.reference,
                    commissionDetails: Object.assign({ totalCommission: 300, commissionNet: 300, ownerAmount: 1653.5, agentShare: 174.6, agencyShare: 116.4, preaFee: 9, vatOnCommission: 46.5, vatAmount: 46.5, vatRate: 0.155, commissionRate: 15, vatTreatment: 'exclusive' }, (input.decision ? { vatDecision: { reason: input.decision } } : {})),
                    idempotencyKey: `vat-journal:${input.reference}`
                });
            });
        }
        function vatCredits(paymentId) {
            return __awaiter(this, void 0, void 0, function* () {
                const journals = yield JournalEntry_1.JournalEntry.find({ sourceId: String(paymentId), sourceModule: 'payment', status: 'posted' }).select('_id').lean();
                const lines = yield JournalLine_1.JournalLine.find({ journalEntryId: { $in: journals.map((row) => row._id) } }).select('accountId credit debit').lean();
                const accounts = yield ChartOfAccount_1.ChartOfAccount.find({ _id: { $in: lines.map((line) => line.accountId) } }).select('code').lean();
                const codes = new Map(accounts.map((account) => [String(account._id), account.code]));
                return lines
                    .filter((line) => codes.get(String(line.accountId)) === '2101' && Number(line.credit) > 0)
                    .map((line) => Number(line.credit));
            });
        }
        const unsupported = yield makePayment({ company: incomplete, property: incompleteProperty, reference: 'VAT-A' });
        yield VatRecord_1.VatRecord.create({
            companyId: incomplete._id, transactionId: String(unsupported._id), sourceType: 'rental',
            vatCollected: 46.5, vatPaid: 0, vatRate: 0, filingPeriod: '2026-11', status: 'pending'
        });
        const blocked = yield (0, paymentAccountingReconciliation_1.repairPaymentAccounting)(String(unsupported._id), {
            dryRun: false,
            reason: 'Repair the missing receipt journal',
            userId: String(user._id)
        });
        const blockedRecord = yield VatRecord_1.VatRecord.findOne({ transactionId: String(unsupported._id) }).lean();
        const blockedSnapshot = yield Payment_1.Payment.findById(unsupported._id).select('commissionDetails accountingComplete').lean();
        const blockedOwner = yield PropertyAccount_1.default.findOne({ 'transactions.idempotencyKey': `payment:${unsupported._id}` }).lean();
        const blockedAgent = yield AgentAccount_1.AgentAccount.findOne({ 'transactions.paymentId': unsupported._id }).lean();
        check((yield vatCredits(String(unsupported._id))).length === 0, 'A no VAT payable journal line');
        check((yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: unsupported._id })) === 0, 'A no VAT obligation');
        check(Number(blockedRecord.vatRate) === 0 && Number(blockedRecord.vatCollected) === 46.5, 'A VAT record was not rewritten');
        check(Number(blockedSnapshot.commissionDetails.vatOnCommission) === 46.5, 'A snapshot was not rewritten');
        check(Boolean(blocked.historicalVatReview), `A repair is classified for historical VAT review (${blocked.historicalVatReview || blocked.vatObligationSkipped})`);
        check(!blockedOwner && !blockedAgent, 'A owner and agent balances were not changed');
        const zeroRate = yield makePayment({ company: complete, property: completeProperty, reference: 'VAT-B', decision: 'standard_taxable_registered' });
        yield VatRecord_1.VatRecord.create({
            companyId: complete._id, transactionId: String(zeroRate._id), sourceType: 'rental',
            vatCollected: 46.5, vatPaid: 0, vatRate: 0, filingPeriod: '2026-11', status: 'pending'
        });
        const approvedZero = yield (0, paymentAccountingReconciliation_1.repairPaymentAccounting)(String(zeroRate._id), {
            dryRun: false,
            reason: 'approve historical VAT obligation',
            userId: String(user._id),
            approveHistoricalVatObligation: true
        });
        const zeroRecord = yield VatRecord_1.VatRecord.findOne({ transactionId: String(zeroRate._id) }).lean();
        check(Number(zeroRecord.vatRate) === 0, 'B snapshot rate did not replace the zero VAT record rate');
        check((yield vatCredits(String(zeroRate._id))).length === 0, 'B no VAT payable liability was recognised');
        check(Boolean(approvedZero.historicalVatReview), 'B approval does not turn a zero-rate record into a liability');
        const assessed = yield makePayment({ company: complete, property: completeProperty, reference: 'VAT-C', decision: 'standard_taxable_registered' });
        yield VatRecord_1.VatRecord.create({
            companyId: complete._id, transactionId: String(assessed._id), sourceType: 'rental',
            vatCollected: 46.5, vatPaid: 0, vatRate: 0.155, filingPeriod: '2026-11', status: 'pending'
        });
        yield (0, paymentAccountingReconciliation_1.repairPaymentAccounting)(String(assessed._id), {
            dryRun: false,
            reason: 'Post the assessed historical VAT',
            userId: String(user._id)
        });
        const assessedRecord = yield VatRecord_1.VatRecord.findOne({ transactionId: String(assessed._id) }).lean();
        const assessedObligations = yield TaxObligation_1.TaxObligation.find({ paymentId: assessed._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        const assessedCredits = yield vatCredits(String(assessed._id));
        check(Number(assessedRecord.vatRate) === 0.155 && Number(assessedRecord.vatCollected) === 46.5, 'C existing VAT record was respected');
        check(assessedCredits.length === 1 && assessedCredits[0] === 46.5, `C VAT payable journal line is ${assessedCredits.join(',')}`);
        check(assessedObligations.length === 1 && Number(assessedObligations[0].taxAmount) === 46.5, 'C obligation agrees with the VAT record');
        const prospective = yield makePayment({
            company: complete,
            property: completeProperty,
            reference: 'VAT-D',
            decision: 'standard_taxable_registered',
            accountingComplete: false
        });
        yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(prospective._id), { createdBy: String(user._id) });
        yield (0, paymentAccountingReconciliation_1.repairPaymentAccounting)(String(prospective._id), {
            dryRun: false,
            reason: 'Repeat the prospective repair',
            userId: String(user._id)
        });
        const prospectiveJournals = yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: String(prospective._id), sourceModule: 'payment', status: 'posted' });
        const prospectiveRecords = yield VatRecord_1.VatRecord.find({ transactionId: String(prospective._id) }).lean();
        const prospectiveObligations = yield TaxObligation_1.TaxObligation.find({ paymentId: prospective._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        const prospectiveCredits = yield vatCredits(String(prospective._id));
        check(prospectiveJournals === 1, `D one receipt journal, got ${prospectiveJournals}`);
        check(prospectiveRecords.length === 1 && Number(prospectiveRecords[0].vatCollected) === 46.5 && Number(prospectiveRecords[0].vatRate) === 0.155, 'D VAT record agrees');
        check(prospectiveObligations.length === 1 && Number(prospectiveObligations[0].taxAmount) === 46.5, 'D obligation agrees');
        check(prospectiveCredits.length === 1 && prospectiveCredits[0] === 46.5, 'D VAT payable journal line agrees');
        const existing = yield makePayment({ company: incomplete, property: incompleteProperty, reference: 'VAT-E' });
        const bank = yield ChartOfAccount_1.ChartOfAccount.create({ companyId: incomplete._id, code: '1003', name: 'Trust bank', type: 'asset', balance: 0, currency: 'USD' });
        const owner = yield ChartOfAccount_1.ChartOfAccount.create({ companyId: incomplete._id, code: '2103', name: 'Owner payable', type: 'liability', balance: 0, currency: 'USD' });
        const existingJournal = yield JournalEntry_1.JournalEntry.create({
            companyId: incomplete._id,
            reference: 'PAY-VAT-E',
            description: 'Existing historical journal',
            sourceModule: 'payment',
            sourceId: String(existing._id),
            status: 'posted',
            transactionDate: existing.paymentDate,
            createdBy: user._id
        });
        yield JournalLine_1.JournalLine.create([
            { companyId: incomplete._id, journalEntryId: existingJournal._id, accountId: bank._id, debit: 2000, credit: 0, runningBalanceSnapshot: 2000 },
            { companyId: incomplete._id, journalEntryId: existingJournal._id, accountId: owner._id, debit: 0, credit: 2000, runningBalanceSnapshot: 0 }
        ]);
        const beforeLines = yield JournalLine_1.JournalLine.find({ journalEntryId: existingJournal._id }).select('debit credit accountId').lean();
        yield (0, paymentAccountingReconciliation_1.repairPaymentAccounting)(String(existing._id), {
            dryRun: false,
            reason: 'Do not rewrite the existing journal',
            userId: String(user._id)
        });
        const afterJournals = yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: String(existing._id), status: 'posted' });
        const afterLines = yield JournalLine_1.JournalLine.find({ journalEntryId: existingJournal._id }).select('debit credit accountId').lean();
        check(afterJournals === 1, `E no duplicate journal, got ${afterJournals}`);
        check(JSON.stringify(beforeLines) === JSON.stringify(afterLines), 'E existing journal lines were not rewritten');
        check((yield vatCredits(String(existing._id))).length === 0, 'E no VAT payable line was added');
        const approval = yield (0, vatPolicyService_1.assessVatPayableJournal)({ payment: unsupported, approveHistoricalVatObligation: true });
        check(approval.recognise === false, `F approval does not override failed eligibility (${approval.reason})`);
        const controller = fs_1.default.readFileSync(path_1.default.join(__dirname, '../controllers/paymentController.ts'), 'utf8');
        check(controller.includes("indexOf('approve historical vat')"), 'F approval still requires the existing explicit reason');
        const gapProperty = yield Property_1.Property.create({
            companyId: complete._id, ownerId: user._id, name: 'Gap Property', address: 'Gap Road',
            rentalType: 'introduction', type: 'house', rent: 800, commission: 100
        });
        const gap = yield Payment_1.Payment.create({
            companyId: complete._id, propertyId: gapProperty._id, tenantId: tenant._id, agentId: user._id, processedBy: user._id,
            propertyType: 'residential', amount: 800, rentAllocated: 800, depositAmount: 0, paymentType: 'rental',
            paymentMethod: 'bank_transfer', status: 'completed', paymentDate: new Date('2026-08-13T00:00:00.000Z'),
            rentalPeriodMonth: 8, rentalPeriodYear: 2026,
            transactionDomain: 'RENTAL', commissionFinalized: true, accountingComplete: null, referenceNumber: 'GAP-1',
            commissionDetails: { totalCommission: 800, commissionNet: 800, ownerAmount: 0, agentShare: 465.6, agencyShare: 310.4, preaFee: 24, vatOnCommission: 0, commissionRate: 100 },
            idempotencyKey: 'vat-journal:gap'
        });
        const gapAgent = yield AgentAccount_1.AgentAccount.findOne({ agentId: user._id });
        const gapAgentRow = { type: 'commission', amount: 465.6, date: gap.paymentDate, paymentId: gap._id, description: 'Gap', status: 'completed' };
        if (gapAgent) {
            gapAgent.transactions.push(gapAgentRow);
            yield gapAgent.save();
        }
        else {
            yield AgentAccount_1.AgentAccount.create({ agentId: user._id, companyId: complete._id, transactions: [gapAgentRow] });
        }
        const gapCompany = yield CompanyAccount_1.CompanyAccount.findOne({ companyId: complete._id });
        const gapCompanyRow = { paymentId: gap._id, amount: 310.4, isArchived: false, description: 'Gap', date: gap.paymentDate, type: 'income' };
        if (gapCompany) {
            gapCompany.transactions.push(gapCompanyRow);
            yield gapCompany.save();
        }
        else {
            yield CompanyAccount_1.CompanyAccount.create({ companyId: complete._id, transactions: [gapCompanyRow] });
        }
        const beforeFlag = (_a = (yield Payment_1.Payment.findById(gap._id).select('accountingComplete').lean())) === null || _a === void 0 ? void 0 : _a.accountingComplete;
        const summary = yield (0, paymentAccountingIntegrity_1.getCompanyAccountingIntegritySummary)(String(complete._id));
        const afterFlag = (_b = (yield Payment_1.Payment.findById(gap._id).select('accountingComplete').lean())) === null || _b === void 0 ? void 0 : _b.accountingComplete;
        check(summary.historicalUnjournalledReceipts === summary.historicalJournalGaps + summary.unpostedRentals, 'unjournalled total equals the two populations');
        check(summary.historicalJournalGaps >= 1, `historical journal gaps are visible (${summary.historicalJournalGaps})`);
        check(summary.unpostedRentals >= 1, `unposted rentals are visible (${summary.unpostedRentals})`);
        check(beforeFlag === afterFlag, 'the population count did not change an accounting-complete flag');
        if (failures.length) {
            console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
            process.exitCode = 1;
        }
        else {
            console.log('Historical VAT journal safeguard tests passed.');
        }
        yield mongoose_1.default.disconnect();
        yield database_1.accountingConnection.close();
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
