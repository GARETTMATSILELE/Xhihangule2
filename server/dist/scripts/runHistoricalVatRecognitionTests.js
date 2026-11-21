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
 * Historical VAT recognition and Fairview confirmation. Local databases only.
 * This script does not connect to production and does not post the ten Benjamins receipts.
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
const accountingService_1 = __importDefault(require("../services/accountingService"));
const accountingIntegrityClassification_1 = require("../services/accountingIntegrityClassification");
const historicalVatRecognitionService_1 = require("../services/historicalVatRecognitionService");
const DB = 'mongodb://127.0.0.1:27017/mantis_historical_vat_recognition';
const ACCOUNTING_DB = 'mongodb://127.0.0.1:27017/mantis_historical_vat_recognition_accounting';
const failures = [];
const check = (condition, message) => {
    if (!condition)
        failures.push(message);
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        if (/cosmos|azure|mantisafrica/i.test(`${DB} ${ACCOUNTING_DB}`)) {
            throw new Error('Refusing to run against a non-local database');
        }
        yield mongoose_1.default.connect(DB);
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB);
        yield database_1.accountingConnection.dropDatabase();
        yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
        const proposed = (0, historicalVatRecognitionService_1.summariseProposedHistoricalVatSchedule)();
        check(proposed.count === 10, 'the review schedule has ten receipts');
        check(proposed.september === 100.37, `September VAT is 100.37 (${proposed.september})`);
        check(proposed.october === 149.59, `October VAT is 149.59 (${proposed.october})`);
        check(proposed.total === 249.96, `reconciled VAT is 249.96 (${proposed.total})`);
        check(proposed.executed === false, 'the review schedule was not executed');
        const user = yield User_1.User.create({
            email: 'historical-vat@example.test',
            password: 'Release-verify-local-1',
            firstName: 'Historical',
            lastName: 'Accountant',
            role: 'accountant',
            roles: ['accountant'],
            isActive: true,
            sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: 'Historical VAT Company',
            address: '1 Test Street',
            phone: '0770000300',
            email: 'historical-vat-co@example.test',
            registrationNumber: 'HVAT-OK',
            tinNumber: 'HVAT-OK-TIN',
            country: 'Zimbabwe',
            ownerId: user._id,
            taxProfile: {
                vatRegistered: true,
                vatNumber: 'ZW-HVAT',
                vatCategory: 'standard',
                vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
            }
        });
        const incomplete = yield Company_1.Company.create({
            name: 'Historical VAT Incomplete',
            address: '2 Test Street',
            phone: '0770000301',
            email: 'historical-vat-inc@example.test',
            registrationNumber: 'HVAT-INC',
            tinNumber: 'HVAT-INC-TIN',
            country: 'Zimbabwe',
            ownerId: user._id,
            taxProfile: {
                vatRegistered: true,
                vatNumber: 'ZW-HVAT-INC',
                vatCategory: '',
                vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
            }
        });
        for (const row of [company, incomplete]) {
            yield (0, accountingPeriodService_1.openExplicitPeriodForDate)({ companyId: String(row._id), date: new Date('2026-09-08T00:00:00.000Z'), createdBy: String(user._id) });
            yield (0, accountingPeriodService_1.openExplicitPeriodForDate)({ companyId: String(row._id), date: new Date('2026-10-01T00:00:00.000Z'), createdBy: String(user._id) });
            yield (0, accountingPeriodService_1.openExplicitPeriodForDate)({ companyId: String(row._id), date: new Date('2026-10-05T00:00:00.000Z'), createdBy: String(user._id) });
        }
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Historical', lastName: 'Tenant', email: 'historical-tenant@example.test', phone: '0770000302',
            companyId: company._id, ownerId: user._id, status: 'Active'
        });
        const property = yield Property_1.Property.create({
            companyId: company._id, ownerId: user._id, name: 'October House', address: 'October Road',
            rentalType: 'management', type: 'house', rent: 2000, commission: 10, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
        });
        const incompleteProperty = yield Property_1.Property.create({
            companyId: incomplete._id, ownerId: user._id, name: 'Incomplete October', address: 'Incomplete Road',
            rentalType: 'management', type: 'house', rent: 600, commission: 10, vatOnCommission: true, vatCommissionTreatment: 'exclusive'
        });
        function makePayment(input) {
            return __awaiter(this, void 0, void 0, function* () {
                return Payment_1.Payment.create({
                    companyId: input.companyId,
                    propertyId: input.propertyId,
                    tenantId: tenant._id,
                    agentId: user._id,
                    processedBy: user._id,
                    propertyType: 'residential',
                    amount: input.amount,
                    rentAllocated: input.amount,
                    depositAmount: 0,
                    paymentType: 'rental',
                    paymentMethod: 'bank_transfer',
                    status: 'completed',
                    paymentDate: new Date(`${input.date}T00:00:00.000Z`),
                    rentalPeriodMonth: input.month,
                    rentalPeriodYear: 2026,
                    transactionDomain: 'RENTAL',
                    commissionFinalized: true,
                    accountingComplete: null,
                    referenceNumber: input.reference,
                    currency: 'USD',
                    commissionDetails: {
                        totalCommission: input.commission,
                        commissionNet: input.commission,
                        ownerAmount: input.owner,
                        agentShare: 1,
                        agencyShare: 1,
                        preaFee: 1,
                        vatOnCommission: input.vat,
                        vatAmount: input.vat,
                        vatRate: 0.155,
                        commissionRate: input.ratePercent,
                        vatTreatment: 'exclusive'
                    },
                    idempotencyKey: `historical-vat:${input.reference}`
                });
            });
        }
        function payableCredits(paymentId) {
            return __awaiter(this, void 0, void 0, function* () {
                const journals = yield JournalEntry_1.JournalEntry.find({
                    status: 'posted',
                    $or: [{ sourceId: String(paymentId) }, { sourceId: `historical-vat:${paymentId}` }]
                }).select('_id sourceModule').lean();
                const lines = yield JournalLine_1.JournalLine.find({ journalEntryId: { $in: journals.map((row) => row._id) } }).select('journalEntryId accountId credit debit').lean();
                const accounts = yield ChartOfAccount_1.ChartOfAccount.find({ _id: { $in: lines.map((line) => line.accountId) } }).select('code').lean();
                const codes = new Map(accounts.map((account) => [String(account._id), account.code]));
                return { journals, lines: lines.map((line) => (Object.assign(Object.assign({}, line), { code: codes.get(String(line.accountId)) }))) };
            });
        }
        const october = yield makePayment({
            companyId: company._id, propertyId: property._id, reference: 'OCT-OK', date: '2026-10-01', month: 10,
            amount: 600, commission: 60, vat: 9.3, owner: 530.7, ratePercent: 10
        });
        yield VatRecord_1.VatRecord.create({
            companyId: company._id, transactionId: String(october._id), sourceType: 'rental',
            vatCollected: 9.3, vatPaid: 0, vatRate: 0, filingPeriod: '2026-10', status: 'pending'
        });
        yield PropertyAccount_1.default.create({
            propertyId: property._id,
            ledgerType: 'rental',
            transactions: [{
                    type: 'income',
                    amount: 530.7,
                    date: october.paymentDate,
                    paymentId: october._id,
                    idempotencyKey: `payment:${october._id}`,
                    description: 'Owner income already net of VAT',
                    status: 'completed'
                }]
        });
        const octoberBefore = JSON.stringify((yield Payment_1.Payment.findById(october._id).select('commissionDetails').lean()).commissionDetails);
        const recognised = yield (0, historicalVatRecognitionService_1.recogniseHistoricalVat)({
            companyId: String(company._id),
            paymentId: String(october._id),
            approvedBy: String(user._id),
            confirm: true,
            reason: 'Recognise the VAT already deducted in the physical books.',
            physicalBookReference: 'PB-OCT-001'
        });
        const octoberAfter = yield Payment_1.Payment.findById(october._id).select('commissionDetails').lean();
        const octoberRecord = yield VatRecord_1.VatRecord.findOne({ transactionId: String(october._id) }).lean();
        const octoberOwner = yield PropertyAccount_1.default.findOne({ propertyId: property._id }).lean();
        const octoberBooks = yield payableCredits(String(october._id));
        const octoberObligation = yield TaxObligation_1.TaxObligation.find({ paymentId: october._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        const octoberVatCredit = octoberBooks.lines.filter((line) => line.code === '2101' && Number(line.credit) > 0);
        const octoberOwnerDebit = octoberBooks.lines.filter((line) => line.code === '2103' && Number(line.debit) > 0);
        check(recognised.status === 'recognised' && Number(recognised.recognitionAmount) === 9.3, `1 October recognition posts 9.30 (${recognised.status} ${recognised.reason})`);
        check(JSON.stringify(octoberAfter.commissionDetails) === octoberBefore, '6 original payment snapshot remains unchanged');
        check(Number(octoberRecord.vatRate) === 0 && Number(octoberRecord.vatCollected) === 9.3, '7 existing zero-rate VAT record remains unchanged');
        check(octoberOwner.transactions.length === 1 && Number(octoberOwner.transactions[0].amount) === 530.7, '8 recognition does not deduct VAT from owner income again');
        check(octoberVatCredit.length === 1 && Number(octoberVatCredit[0].credit) === 9.3 && octoberOwnerDebit.length === 0, '9 VAT adjustment and VAT payable journal agree');
        check(octoberObligation.length === 1 && Number(octoberObligation[0].taxAmount) === 9.3, '10 tax obligation agrees with the approved recognition');
        const repeated = yield (0, historicalVatRecognitionService_1.recogniseHistoricalVat)({
            companyId: String(company._id),
            paymentId: String(october._id),
            approvedBy: String(user._id),
            confirm: true,
            reason: 'Recognise the VAT already deducted in the physical books.',
            physicalBookReference: 'PB-OCT-001'
        });
        const octoberJournalsAfterRepeat = yield JournalEntry_1.JournalEntry.find({ sourceId: `historical-vat:${october._id}` }).lean();
        const octoberObligationsAfterRepeat = yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: october._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null });
        check(repeated.duplicatePrevented === true && octoberJournalsAfterRepeat.length === 1 && octoberObligationsAfterRepeat === 1, '11 duplicate recognition is prevented');
        check(repeated.status === 'recognised' && JSON.stringify((yield Payment_1.Payment.findById(october._id).select('commissionDetails').lean()).commissionDetails) === octoberBefore, '12 repeated execution is idempotent');
        const september = yield makePayment({
            companyId: company._id, propertyId: property._id, reference: 'SEP-OK', date: '2026-09-08', month: 9,
            amount: 2000, commission: 300, vat: 46.5, owner: 1653.5, ratePercent: 15
        });
        yield VatRecord_1.VatRecord.create({
            companyId: company._id, transactionId: String(september._id), sourceType: 'rental',
            vatCollected: 46.5, vatPaid: 0, vatRate: 0, filingPeriod: '2026-09', status: 'pending'
        });
        const septemberResult = yield (0, historicalVatRecognitionService_1.recogniseHistoricalVat)({
            companyId: String(company._id),
            paymentId: String(september._id),
            approvedBy: String(user._id),
            confirm: true,
            reason: 'Recognise September VAT already deducted in the physical books.',
            physicalBookReference: 'PB-SEP-001',
            septemberTaxTreatmentApproved: true,
            taxTreatmentBasis: 'The physical books treated this September receipt as VAT-registered exclusive commission VAT.'
        });
        const septemberObligation = yield TaxObligation_1.TaxObligation.findOne({ paymentId: september._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        check(septemberResult.status === 'recognised' && Number(septemberObligation === null || septemberObligation === void 0 ? void 0 : septemberObligation.taxAmount) === 46.5, `2 September recognition with documented approval posts 46.50 (${septemberResult.reason})`);
        const septemberBlocked = yield makePayment({
            companyId: company._id, propertyId: property._id, reference: 'SEP-NO', date: '2026-09-16', month: 9,
            amount: 1150, commission: 115, vat: 17.83, owner: 1017.17, ratePercent: 10
        });
        const noApproval = yield (0, historicalVatRecognitionService_1.recogniseHistoricalVat)({
            companyId: String(company._id),
            paymentId: String(septemberBlocked._id),
            approvedBy: String(user._id),
            confirm: true,
            reason: 'Attempt September recognition without the tax-treatment approval.',
            physicalBookReference: 'PB-SEP-002'
        });
        check(noApproval.status === 'review' && noApproval.reason === 'SEPTEMBER_TAX_TREATMENT_APPROVAL_REQUIRED', `3 September recognition without approval is blocked (${noApproval.reason})`);
        check((yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: septemberBlocked._id })) === 0 && (yield JournalEntry_1.JournalEntry.countDocuments({ sourceId: `historical-vat:${septemberBlocked._id}` })) === 0, '3 no obligation or journal is created');
        const septemberEvidence = yield makePayment({
            companyId: company._id, propertyId: property._id, reference: 'SEP-SHORT', date: '2026-09-16', month: 9,
            amount: 1100, commission: 100, vat: 15.5, owner: 984.5, ratePercent: 10
        });
        const shortBasis = yield (0, historicalVatRecognitionService_1.recogniseHistoricalVat)({
            companyId: String(company._id),
            paymentId: String(septemberEvidence._id),
            approvedBy: String(user._id),
            confirm: true,
            reason: 'Attempt September recognition with a thin tax-treatment note.',
            physicalBookReference: 'PB-SEP-003',
            septemberTaxTreatmentApproved: true,
            taxTreatmentBasis: 'see file'
        });
        check(shortBasis.status === 'review' && shortBasis.reason === 'SEPTEMBER_TAX_TREATMENT_EVIDENCE_INSUFFICIENT', `4 September recognition without sufficient evidence is blocked (${shortBasis.reason})`);
        check((yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: septemberEvidence._id })) === 0, '4 no unsupported obligation is created');
        const mismatch = yield makePayment({
            companyId: company._id, propertyId: property._id, reference: 'OCT-MISMATCH', date: '2026-10-05', month: 10,
            amount: 600, commission: 60, vat: 20, owner: 520, ratePercent: 10
        });
        const mismatchResult = yield (0, historicalVatRecognitionService_1.recogniseHistoricalVat)({
            companyId: String(company._id),
            paymentId: String(mismatch._id),
            approvedBy: String(user._id),
            confirm: true,
            reason: 'Attempt to recognise a VAT amount that disagrees with the stored calculation.',
            physicalBookReference: 'PB-OCT-MISMATCH',
            septemberTaxTreatmentApproved: true,
            taxTreatmentBasis: 'This approval must not override a failed amount check.'
        });
        check(mismatchResult.status === 'review' && mismatchResult.reason === 'VAT_AMOUNT_DISAGREES_WITH_STORED_CALCULATION', `5 a disagreeing VAT amount is blocked (${mismatchResult.reason})`);
        const withJournal = yield makePayment({
            companyId: company._id, propertyId: property._id, reference: 'OCT-JOURNAL', date: '2026-10-05', month: 10,
            amount: 600, commission: 60, vat: 9.3, owner: 530.7, ratePercent: 10
        });
        yield accountingService_1.default.postTransaction({
            companyId: String(company._id),
            reference: 'PAY-OCT-JOURNAL',
            description: 'Existing historical receipt journal',
            sourceModule: 'payment',
            sourceId: String(withJournal._id),
            transactionDate: withJournal.paymentDate,
            createdBy: String(user._id),
            lines: [
                { accountCode: '1003', debit: 600, credit: 0 },
                { accountCode: '4001', debit: 0, credit: 60 },
                { accountCode: '2103', debit: 0, credit: 540 }
            ]
        });
        yield (0, historicalVatRecognitionService_1.recogniseHistoricalVat)({
            companyId: String(company._id),
            paymentId: String(withJournal._id),
            approvedBy: String(user._id),
            confirm: true,
            reason: 'Recognise VAT beside the existing receipt journal.',
            physicalBookReference: 'PB-OCT-JOURNAL'
        });
        const receiptJournals = yield JournalEntry_1.JournalEntry.countDocuments({ sourceModule: 'payment', sourceId: String(withJournal._id) });
        const recognitionJournals = yield JournalEntry_1.JournalEntry.countDocuments({ sourceModule: 'tax', sourceId: `historical-vat:${withJournal._id}` });
        check(receiptJournals === 1 && recognitionJournals === 1, `13 the existing receipt journal is not duplicated (${receiptJournals} receipt, ${recognitionJournals} recognition)`);
        const alreadyPosted = yield makePayment({
            companyId: company._id, propertyId: property._id, reference: 'OCT-PAYABLE', date: '2026-10-05', month: 10,
            amount: 600, commission: 60, vat: 9.3, owner: 530.7, ratePercent: 10
        });
        yield accountingService_1.default.postTransaction({
            companyId: String(company._id),
            reference: 'PAY-OCT-PAYABLE',
            description: 'Existing journal that already credits VAT payable',
            sourceModule: 'payment',
            sourceId: String(alreadyPosted._id),
            transactionDate: alreadyPosted.paymentDate,
            createdBy: String(user._id),
            lines: [
                { accountCode: '1003', debit: 600, credit: 0 },
                { accountCode: '4001', debit: 0, credit: 60 },
                { accountCode: '2101', debit: 0, credit: 9.3 },
                { accountCode: '2103', debit: 0, credit: 530.7 }
            ]
        });
        const linked = yield (0, historicalVatRecognitionService_1.recogniseHistoricalVat)({
            companyId: String(company._id),
            paymentId: String(alreadyPosted._id),
            approvedBy: String(user._id),
            confirm: true,
            reason: 'Link the obligation to VAT payable that was already posted.',
            physicalBookReference: 'PB-OCT-PAYABLE'
        });
        const linkedBooks = yield payableCredits(String(alreadyPosted._id));
        const linkedCredits = linkedBooks.lines.filter((line) => line.code === '2101').reduce((sum, line) => sum + Number(line.credit || 0), 0);
        check(linked.journalCreated === false && Math.round(linkedCredits * 100) === 930, `13 an existing VAT payable credit is not posted again (${linkedCredits})`);
        const incompletePayment = yield makePayment({
            companyId: incomplete._id, propertyId: incompleteProperty._id, reference: 'OCT-INCOMPLETE', date: '2026-10-01', month: 10,
            amount: 600, commission: 60, vat: 9.3, owner: 530.7, ratePercent: 10
        });
        const incompleteResult = yield (0, historicalVatRecognitionService_1.recogniseHistoricalVat)({
            companyId: String(incomplete._id),
            paymentId: String(incompletePayment._id),
            approvedBy: String(user._id),
            confirm: true,
            reason: 'Attempt October recognition before the VAT category is complete.',
            physicalBookReference: 'PB-OCT-INCOMPLETE'
        });
        check(incompleteResult.reason === 'OCTOBER_VAT_CONFIGURATION_INCOMPLETE' && (yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: incompletePayment._id })) === 0, `October recognition without VAT category is blocked (${incompleteResult.reason})`);
        const fairviewProperty = yield Property_1.Property.create({
            companyId: company._id, ownerId: user._id, name: 'Fairview Close', address: 'Fairview Close',
            rentalType: 'introduction', type: 'commercial', rent: 800, commission: 100, vatOnCommission: false
        });
        const fairview = yield Payment_1.Payment.create({
            companyId: company._id,
            propertyId: fairviewProperty._id,
            tenantId: tenant._id,
            agentId: user._id,
            processedBy: user._id,
            propertyType: 'commercial',
            amount: 800,
            rentAllocated: 800,
            depositAmount: 0,
            paymentType: 'rental',
            paymentMethod: 'bank_transfer',
            status: 'completed',
            paymentDate: new Date('2026-08-13T00:00:00.000Z'),
            rentalPeriodMonth: 8,
            rentalPeriodYear: 2026,
            transactionDomain: 'RENTAL',
            commissionFinalized: true,
            accountingComplete: null,
            referenceNumber: 'RCPT-DCDD37-2026-08',
            currency: 'USD',
            commissionDetails: {
                totalCommission: 800,
                commissionNet: 800,
                ownerAmount: 0,
                agentShare: 465.6,
                agencyShare: 310.4,
                preaFee: 24,
                vatOnCommission: 0,
                vatAmount: 0,
                vatRate: 0,
                commissionRate: 100,
                vatTreatment: 'exclusive'
            },
            idempotencyKey: 'historical-vat:fairview'
        });
        yield AgentAccount_1.AgentAccount.create({
            agentId: user._id,
            transactions: [{ type: 'commission', amount: 465.6, date: fairview.paymentDate, paymentId: fairview._id, description: 'Fairview introduction', status: 'completed' }]
        });
        yield CompanyAccount_1.CompanyAccount.create({
            companyId: company._id,
            transactions: [{ type: 'income', source: 'rental_commission', amount: 310.4, date: fairview.paymentDate, paymentId: fairview._id, description: 'Fairview introduction' }]
        });
        const fairviewClass = (0, accountingIntegrityClassification_1.classifyAccountingIntegrityRow)({
            component: 'HISTORICAL_JOURNAL_GAP',
            payment: fairview.toObject(),
            propertyCommission: 100,
            rentalType: 'introduction',
            presence: { ownerIncome: false, agentCommission: true, companyCommission: true, journal: false }
        });
        check(fairviewClass.classification === 'HISTORICAL JOURNAL GAP' && fairviewClass.commercialArrangement === 'confirmed', `14 Fairview remains a confirmed 100 percent introduction (${fairviewClass.classification})`);
        check(fairviewClass.classification !== 'RATE REVIEW' && fairviewClass.explanation.includes('800.00') && fairviewClass.explanation.includes('465.60') && fairviewClass.explanation.includes('310.40'), '14 the saved commission, agent and company amounts stay visible');
        const fairviewAccounts = yield PropertyAccount_1.default.find({ propertyId: fairviewProperty._id }).lean();
        check(fairviewAccounts.length === 0, '15 Fairview does not generate an owner-income record');
        check(fairviewClass.explanation.toLowerCase().includes('journal') && fairviewClass.classification !== 'COMPLETE', '16 the missing journal remains independently detectable');
        const schedule = yield (0, historicalVatRecognitionService_1.buildHistoricalVatSchedule)(String(company._id));
        check(!schedule.rows.some((row) => row.reference === 'RCPT-DCDD37-2026-08'), '16 Fairview is not pulled into the VAT recognition schedule');
        const fairviewAfter = yield Payment_1.Payment.findById(fairview._id).select('accountingComplete commissionDetails').lean();
        check(fairviewAfter.accountingComplete == null && Number(fairviewAfter.commissionDetails.ownerAmount) === 0, '16 viewing the classification does not mark the receipt accounting-complete');
        const agentAfter = yield AgentAccount_1.AgentAccount.findOne({ agentId: user._id }).lean();
        const companyAfter = yield CompanyAccount_1.CompanyAccount.findOne({ companyId: company._id }).lean();
        const agentAmount = ((agentAfter === null || agentAfter === void 0 ? void 0 : agentAfter.transactions) || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const companyAmount = ((companyAfter === null || companyAfter === void 0 ? void 0 : companyAfter.transactions) || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
        check(Math.round(agentAmount * 100) === 46560 && Math.round(companyAmount * 100) === 31040, `17 historical agent and company balances remain unchanged (${agentAmount} / ${companyAmount})`);
        const serviceSource = fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/historicalVatRecognitionService.ts'), 'utf8');
        const routeSource = fs_1.default.readFileSync(path_1.default.join(__dirname, '../routes/accountantRoutes.ts'), 'utf8');
        const agentRouteSource = fs_1.default.readFileSync(path_1.default.join(__dirname, '../routes/agentRoutes.ts'), 'utf8');
        check(!serviceSource.includes('repairPaymentAccounting') && !serviceSource.includes('postPaymentAccounting'), 'recognition does not use the ordinary repair path');
        check(routeSource.includes("'/historical-vat/:id/recognise', isAccountant"), 'recognition is restricted to an accountant');
        check(!agentRouteSource.includes('historical-vat'), 'recognition is not exposed as an agent action');
        if (failures.length) {
            console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
            yield mongoose_1.default.disconnect();
            yield database_1.accountingConnection.close();
            process.exit(1);
        }
        console.log('Historical VAT recognition tests passed.');
        yield mongoose_1.default.disconnect();
        yield database_1.accountingConnection.close();
        process.exit(0);
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error(error);
    try {
        yield mongoose_1.default.disconnect();
    }
    catch ( /* already closed */_a) { /* already closed */ }
    try {
        yield database_1.accountingConnection.close();
    }
    catch ( /* already closed */_b) { /* already closed */ }
    process.exit(1);
}));
