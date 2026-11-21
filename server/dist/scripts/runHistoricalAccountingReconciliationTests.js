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
 * Historical accounting reconciliation. Local databases only.
 * This script does not connect to production and does not repair production receipts.
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
const TaxObligation_1 = require("../models/TaxObligation");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const database_1 = require("../config/database");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const accountingPeriodService_1 = require("../services/accountingPeriodService");
const propertyAccountService_1 = __importDefault(require("../services/propertyAccountService"));
const agentAccountService_1 = __importDefault(require("../services/agentAccountService"));
const accountingIntegrationService_1 = __importDefault(require("../services/accountingIntegrationService"));
const historicalAccountingReconciliation_1 = require("../services/historicalAccountingReconciliation");
const paymentAccountingProjection_1 = require("../services/paymentAccountingProjection");
const DB = 'mongodb://127.0.0.1:27017/mantis_historical_accounting_reconciliation';
const ACCOUNTING_DB = 'mongodb://127.0.0.1:27017/mantis_historical_accounting_reconciliation_accounting';
const failures = [];
const check = (condition, message) => {
    if (!condition)
        failures.push(message);
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (/cosmos|azure|mantisafrica/i.test(`${DB} ${ACCOUNTING_DB}`))
            throw new Error('Refusing to run against a non-local database');
        yield mongoose_1.default.connect(DB);
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB);
        yield database_1.accountingConnection.dropDatabase();
        yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
        const user = yield User_1.User.create({
            email: 'historical-accounting@example.test', password: 'Release-verify-local-1',
            firstName: 'Historical', lastName: 'Accountant', role: 'accountant', roles: ['accountant'], isActive: true, sessionVersion: 1
        });
        const company = yield Company_1.Company.create({
            name: 'Reconciliation Company', address: '1 Test Street', phone: '0770000400', email: 'recon@example.test',
            registrationNumber: 'RECON-1', tinNumber: 'RECON-1-TIN', country: 'Zimbabwe', ownerId: user._id,
            taxProfile: { vatRegistered: false }
        });
        yield (0, accountingPeriodService_1.openExplicitPeriodForDate)({ companyId: String(company._id), date: new Date('2026-11-03T00:00:00.000Z'), createdBy: String(user._id) });
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Recon', lastName: 'Tenant', email: 'recon-tenant@example.test', phone: '0770000401',
            companyId: company._id, ownerId: user._id, status: 'Active'
        });
        const property = yield Property_1.Property.create({
            companyId: company._id, ownerId: user._id, name: 'Management House', address: 'Management Road',
            rentalType: 'management', type: 'house', rent: 2000, commission: 15, vatOnCommission: false
        });
        const introduction = yield Property_1.Property.create({
            companyId: company._id, ownerId: user._id, name: 'Fairview Close', address: 'Fairview Close',
            rentalType: 'introduction', type: 'commercial', rent: 800, commission: 100, vatOnCommission: false
        });
        const shineplus = yield Property_1.Property.create({
            companyId: company._id, ownerId: user._id, name: 'Shineplus', address: 'Haydon',
            rentalType: 'introduction', type: 'house', rent: 1000, commission: 50, vatOnCommission: false
        });
        function makePayment(input) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c, _d, _e, _f, _g;
                const amount = (_a = input.amount) !== null && _a !== void 0 ? _a : 2000;
                const commission = (_b = input.commission) !== null && _b !== void 0 ? _b : 300;
                const owner = (_c = input.owner) !== null && _c !== void 0 ? _c : 1700;
                return Payment_1.Payment.create({
                    companyId: company._id,
                    propertyId: input.propertyId || property._id,
                    tenantId: tenant._id,
                    agentId: user._id,
                    processedBy: user._id,
                    propertyType: 'residential',
                    amount,
                    rentAllocated: Math.max(0, amount - Number(input.levy || 0)),
                    depositAmount: input.deposit || 0,
                    levyAllocated: input.levy || 0,
                    paymentType: 'rental',
                    paymentMethod: 'bank_transfer',
                    status: input.status || 'completed',
                    paymentDate: new Date(`${input.date || '2026-11-03'}T00:00:00.000Z`),
                    rentalPeriodMonth: Number((input.date || '2026-11-03').slice(5, 7)),
                    rentalPeriodYear: 2026,
                    transactionDomain: 'RENTAL',
                    commissionFinalized: true,
                    accountingComplete: null,
                    referenceNumber: input.reference,
                    currency: 'USD',
                    reversalOfPaymentId: input.reversalOf,
                    commissionDetails: {
                        totalCommission: commission,
                        commissionNet: commission,
                        ownerAmount: owner,
                        agentShare: (_d = input.agent) !== null && _d !== void 0 ? _d : 174.6,
                        agencyShare: (_e = input.companyShare) !== null && _e !== void 0 ? _e : 116.4,
                        preaFee: (_f = input.prea) !== null && _f !== void 0 ? _f : 9,
                        vatOnCommission: input.vat || 0,
                        vatAmount: input.vat || 0,
                        vatRate: input.vat ? 0.155 : 0,
                        commissionRate: (_g = input.rate) !== null && _g !== void 0 ? _g : 15,
                        vatTreatment: 'exclusive',
                        levy: input.levy || 0
                    },
                    idempotencyKey: `recon:${input.reference}`
                });
            });
        }
        function journalCount(paymentId) {
            return __awaiter(this, void 0, void 0, function* () {
                return JournalEntry_1.JournalEntry.countDocuments({ sourceModule: 'payment', sourceId: String(paymentId), status: 'posted' });
            });
        }
        function incomeCount(paymentId) {
            return __awaiter(this, void 0, void 0, function* () {
                const rows = yield PropertyAccount_1.default.find({ 'transactions.idempotencyKey': `payment:${paymentId}` }).lean();
                return rows.reduce((sum, row) => sum + (row.transactions || []).filter((tx) => tx.idempotencyKey === `payment:${paymentId}` && tx.type === 'income').length, 0);
            });
        }
        const duplicate = (0, historicalAccountingReconciliation_1.classifyHistoricalAccountingCase)({
            payment: { _id: 'dup', referenceNumber: 'DUP', amount: 2000, commissionDetails: { totalCommission: 300, ownerAmount: 1700, agentShare: 1, agencyShare: 1, vatOnCommission: 0 } },
            expected: (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)({ amount: 2000, status: 'completed', paymentType: 'rental', commissionFinalized: true, commissionDetails: { totalCommission: 300, ownerAmount: 1700, agentShare: 174.6, agencyShare: 116.4, vatOnCommission: 0 } }),
            actual: { ownerIncome: true, agentCommission: true, companyCommission: true, journal: true, vat: false, deposit: false, duplicates: { journal: 2 } },
            vatRecognise: false, vatReason: 'not_applicable', periodCode: 'OPEN', rateDisagrees: false
        });
        check(duplicate.classification === 'DUPLICATE SUSPECTED' && duplicate.recordsToCreate.length === 0, 'duplicate journal evidence blocks creation');
        const mismatchCase = (0, historicalAccountingReconciliation_1.classifyHistoricalAccountingCase)({
            payment: { _id: 'bad', referenceNumber: 'BAD', amount: 2000, commissionDetails: { totalCommission: 300, ownerAmount: 1700, vatOnCommission: 0 } },
            expected: (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)({ amount: 2000, status: 'completed', paymentType: 'rental', commissionFinalized: true, commissionDetails: { totalCommission: 300, ownerAmount: 1700, agentShare: 174.6, agencyShare: 116.4, vatOnCommission: 0 } }),
            actual: { ownerIncome: true, agentCommission: true, companyCommission: true, journal: true, vat: false, deposit: false, amounts: { ownerIncome: 100, agentCommission: 174.6, companyCommission: 116.4, journal: 2000 } },
            vatRecognise: false, vatReason: 'not_applicable', periodCode: 'OPEN', rateDisagrees: false
        });
        check(mismatchCase.classification === 'FINANCIAL MISMATCH' && mismatchCase.recordsToCreate.length === 0, 'an existing incorrect amount is not replaced');
        const closed = yield makePayment({ reference: 'CLOSED-SEP', date: '2026-09-07' });
        const closedAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(closed._id));
        const closedExecute = yield (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId: String(company._id), paymentId: String(closed._id), authorisedBy: String(user._id),
            confirm: true, reason: 'Attempt a September repair while September is not open.', fingerprint: closedAssessment.fingerprint
        });
        check(closedAssessment.classification === 'REQUIRES ACCOUNTANT APPROVAL' && closedAssessment.periodCode !== 'OPEN', `closed period requires approval (${closedAssessment.classification} ${closedAssessment.periodCode})`);
        check(closedExecute.result === 'aborted' && (yield journalCount(String(closed._id))) === 0, 'closed period execution creates nothing');
        const vatPayment = yield makePayment({ reference: 'VAT-REVIEW', vat: 46.5, owner: 1653.5 });
        const vatAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(vatPayment._id));
        const vatExecute = yield (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId: String(company._id), paymentId: String(vatPayment._id), authorisedBy: String(user._id),
            confirm: true, reason: 'Attempt to repair unsupported historical VAT.', fingerprint: vatAssessment.fingerprint
        });
        check(vatAssessment.classification === 'HISTORICAL VAT REVIEW' && vatExecute.result === 'aborted', `historical VAT is rejected by this repair (${vatAssessment.vatEligibility})`);
        check((yield journalCount(String(vatPayment._id))) === 0 && (yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: vatPayment._id })) === 0, 'historical VAT repair creates no journal or obligation');
        const reversal = yield makePayment({ reference: 'REVERSAL', amount: -2000, owner: -1700, commission: -300, reversalOf: new mongoose_1.default.Types.ObjectId() });
        const reversalAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(reversal._id));
        check(reversalAssessment.classification === 'REQUIRES MANUAL INVESTIGATION' && reversalAssessment.recordsToCreate.length === 0, 'a reversal is not treated as a new rental receipt');
        const deposit = yield makePayment({ reference: 'DEPOSIT', amount: 0, deposit: 500, commission: 0, owner: 0, agent: 0, companyShare: 0, prea: 0 });
        const depositAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(deposit._id));
        check(depositAssessment.recordsToCreate.length === 0 && !depositAssessment.recordsToCreate.includes('ownerIncome'), 'a deposit-only receipt does not propose rental income');
        const shine = yield makePayment({
            reference: 'SHINEPLUS', propertyId: shineplus._id, amount: 1000, commission: 1000, owner: 0, agent: 582, companyShare: 388, prea: 30, rate: 100
        });
        const shineAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(shine._id));
        const shineSnapshot = JSON.stringify((yield Payment_1.Payment.findById(shine._id).select('commissionDetails').lean()).commissionDetails);
        check(shineAssessment.classification === 'REQUIRES MANUAL INVESTIGATION', `Shineplus rate disagreement is not repaired (${shineAssessment.classification})`);
        check(JSON.stringify((yield Payment_1.Payment.findById(shine._id).select('commissionDetails').lean()).commissionDetails) === shineSnapshot, 'Shineplus snapshot is not rewritten');
        const fairview = yield makePayment({
            reference: 'FAIRVIEW', propertyId: introduction._id, date: '2026-08-13', amount: 800, commission: 800, owner: 0,
            agent: 465.6, companyShare: 310.4, prea: 24, rate: 100
        });
        const fairviewAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(fairview._id));
        check(fairviewAssessment.classification === 'REQUIRES ACCOUNTANT APPROVAL' && !fairviewAssessment.recordsToCreate.includes('ownerIncome'), 'Fairview keeps zero owner income and waits for period approval');
        check(fairviewAssessment.recordsToCreate.includes('journal'), 'Fairview missing journal remains visible');
        const openIntro = yield makePayment({
            reference: 'INTRO-100', propertyId: introduction._id, amount: 800, commission: 800, owner: 0, agent: 465.6, companyShare: 310.4, prea: 24, rate: 100
        });
        const introAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(openIntro._id));
        const introExecute = yield (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId: String(company._id), paymentId: String(openIntro._id), authorisedBy: String(user._id),
            confirm: true, reason: 'Post the missing introduction records for an open period.', fingerprint: introAssessment.fingerprint
        });
        check(introAssessment.classification === 'SAFE TO REPAIR' && !introAssessment.recordsToCreate.includes('ownerIncome'), 'introduction zero owner income is not proposed');
        check(introExecute.ok === true && (yield incomeCount(String(openIntro._id))) === 0 && (yield journalCount(String(openIntro._id))) === 1, 'introduction repair creates no artificial owner income');
        const management = yield makePayment({ reference: 'MANAGEMENT' });
        const managementAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(management._id));
        check(managementAssessment.classification === 'SAFE TO REPAIR' && managementAssessment.recordsToCreate.includes('ownerIncome'), 'management commission expects owner income');
        const managementExecute = yield (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId: String(company._id), paymentId: String(management._id), authorisedBy: String(user._id),
            confirm: true, reason: 'Post the missing management receipt records.', fingerprint: managementAssessment.fingerprint
        });
        const managementLines = yield JournalLine_1.JournalLine.countDocuments({ journalEntryId: (_a = (yield JournalEntry_1.JournalEntry.findOne({ sourceId: String(management._id), sourceModule: 'payment' }).select('_id').lean())) === null || _a === void 0 ? void 0 : _a._id });
        const repeat = yield (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId: String(company._id), paymentId: String(management._id), authorisedBy: String(user._id),
            confirm: true, reason: 'Repeat the same management repair.', fingerprint: managementAssessment.fingerprint
        });
        check(managementExecute.ok === true && (yield journalCount(String(management._id))) === 1 && (yield incomeCount(String(management._id))) === 1, 'missing journal and owner income are created once');
        check(repeat.result === 'aborted' && (yield journalCount(String(management._id))) === 1 && managementLines > 0, 'repeated execution does not add a journal or rewrite a balanced journal');
        const partial = yield makePayment({ reference: 'PARTIAL' });
        yield propertyAccountService_1.default.recordIncomeFromPayment(String(partial._id));
        yield agentAccountService_1.default.syncCommissionForPayment(String(partial._id));
        yield accountingIntegrationService_1.default.postCompanyCommission(partial);
        const partialAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(partial._id));
        check(partialAssessment.recordsToCreate.includes('journal') && !partialAssessment.recordsToCreate.includes('ownerIncome'), `existing owner, agent and company records are detected (${partialAssessment.recordsToCreate.join(',')})`);
        const partialExecute = yield (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId: String(company._id), paymentId: String(partial._id), authorisedBy: String(user._id),
            confirm: true, reason: 'Retry after owner income already exists.', fingerprint: partialAssessment.fingerprint
        });
        check(partialExecute.ok === true && (yield incomeCount(String(partial._id))) === 1 && (yield journalCount(String(partial._id))) === 1, 'retry creates the missing journal without a second owner income');
        const levy = yield makePayment({
            reference: 'LEVY', amount: 1200, levy: 100, commission: 165, owner: 1035, agent: 96.03, companyShare: 64.02, prea: 4.95
        });
        const levyAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(levy._id));
        yield (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId: String(company._id), paymentId: String(levy._id), authorisedBy: String(user._id),
            confirm: true, reason: 'Post the levy receipt once.', fingerprint: levyAssessment.fingerprint
        });
        const levyAccount = yield PropertyAccount_1.default.findOne({ propertyId: property._id }).lean();
        const levyRows = JSON.stringify(levyAccount).split(`payment:${levy._id}:pass-through:LEVY`).length - 1;
        check(levyRows === 1, `levy pass-through is posted once (${levyRows})`);
        const wrongProperty = yield Property_1.Property.create({
            companyId: company._id, ownerId: user._id, name: 'Wrong Income House', address: 'Wrong Road',
            rentalType: 'management', type: 'house', rent: 2000, commission: 15, vatOnCommission: false
        });
        const wrong = yield makePayment({ reference: 'WRONG-AMOUNT', propertyId: wrongProperty._id });
        yield PropertyAccount_1.default.create({
            propertyId: wrongProperty._id, ledgerType: 'rental',
            transactions: [{ type: 'income', amount: 100, date: wrong.paymentDate, paymentId: wrong._id, idempotencyKey: `payment:${wrong._id}`, description: 'Wrong historical income', status: 'completed' }]
        });
        const wrongAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(wrong._id));
        const wrongExecute = yield (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId: String(company._id), paymentId: String(wrong._id), authorisedBy: String(user._id),
            confirm: true, reason: 'Attempt to overwrite an incorrect owner amount.', fingerprint: wrongAssessment.fingerprint
        });
        const wrongIncome = yield PropertyAccount_1.default.findOne({ 'transactions.idempotencyKey': `payment:${wrong._id}` }).lean();
        check(wrongAssessment.classification === 'FINANCIAL MISMATCH' && wrongExecute.result === 'aborted', 'existing incorrect income blocks repair');
        check(Number(wrongIncome.transactions.find((tx) => tx.idempotencyKey === `payment:${wrong._id}`).amount) === 100, 'the incorrect income amount is left unchanged');
        const changed = yield makePayment({ reference: 'CHANGED' });
        const changedAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(changed._id));
        yield Payment_1.Payment.updateOne({ _id: changed._id }, { $set: { notes: 'Source note changed after the dry run.' } });
        const changedExecute = yield (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId: String(company._id), paymentId: String(changed._id), authorisedBy: String(user._id),
            confirm: true, reason: 'Execute after the source amount changed.', fingerprint: changedAssessment.fingerprint
        });
        check(changedExecute.reason === 'SOURCE_CHANGED' && (yield journalCount(String(changed._id))) === 0, 'changed source data aborts execution');
        const concurrent = yield makePayment({ reference: 'CONCURRENT' });
        const concurrentAssessment = yield (0, historicalAccountingReconciliation_1.assessHistoricalAccountingPayment)(String(concurrent._id));
        yield Promise.all([0, 1].map(() => (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId: String(company._id), paymentId: String(concurrent._id), authorisedBy: String(user._id),
            confirm: true, reason: 'Concurrent repair of the same receipt.', fingerprint: concurrentAssessment.fingerprint
        })));
        check((yield journalCount(String(concurrent._id))) === 1 && (yield incomeCount(String(concurrent._id))) === 1, 'concurrent repair attempts do not duplicate the journal or owner income');
        const routeSource = fs_1.default.readFileSync(path_1.default.join(__dirname, '../routes/accountantRoutes.ts'), 'utf8');
        const serviceSource = fs_1.default.readFileSync(path_1.default.join(__dirname, '../services/historicalAccountingReconciliation.ts'), 'utf8');
        check(routeSource.includes("'/historical-accounting/:id/repair', isAccountant"), 'repair execution is restricted to an accountant');
        check(!serviceSource.includes('approveHistoricalVatObligation'), 'this repair cannot approve historical VAT');
        check(!serviceSource.includes('recogniseHistoricalVat'), 'this repair does not call historical VAT recognition');
        if (failures.length) {
            console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
            yield mongoose_1.default.disconnect();
            yield database_1.accountingConnection.close();
            process.exit(1);
        }
        console.log('Historical accounting reconciliation tests passed.');
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
