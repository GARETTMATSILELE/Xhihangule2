"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
 * Isolated release verification. Refuses any non-local database.
 * Leaves the local database in place for browser verification.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const Payment_1 = require("../models/Payment");
const JournalEntry_1 = require("../models/JournalEntry");
const VatRecord_1 = require("../models/VatRecord");
const TaxObligation_1 = require("../models/TaxObligation");
const AccountingException_1 = require("../models/AccountingException");
const TaxReviewItem_1 = require("../models/TaxReviewItem");
const AgentAccount_1 = require("../models/AgentAccount");
const CompanyAccount_1 = require("../models/CompanyAccount");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const database_1 = require("../config/database");
const taxRuleRegistry_1 = require("../services/taxRuleRegistry");
const accountingPeriodService_1 = require("../services/accountingPeriodService");
const introductionCommissionService_1 = require("../services/introductionCommissionService");
const paymentAccountingReconciliation_1 = require("../services/paymentAccountingReconciliation");
const paymentAccountingIntegrity_1 = require("../services/paymentAccountingIntegrity");
const vatPolicyService_1 = require("../services/vatPolicyService");
const commissionService_1 = require("../services/commissionService");
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const money_1 = require("../utils/money");
const DB = 'mongodb://127.0.0.1:27017/mantis_release_verification';
const ACCOUNTING_DB = 'mongodb://127.0.0.1:27017/mantis_release_verification_accounting';
const failures = [];
const check = (condition, message) => {
    if (!condition)
        failures.push(message);
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        if (/cosmos|azure|mantisafrica/i.test(`${DB} ${ACCOUNTING_DB}`)) {
            throw new Error('Refusing to run release verification against a non-local database');
        }
        yield mongoose_1.default.connect(DB);
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB);
        yield database_1.accountingConnection.dropDatabase();
        yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
        const user = yield User_1.User.create({
            email: 'release-verify@example.test',
            password: 'Release-verify-local-1',
            firstName: 'Release',
            lastName: 'Verifier',
            role: 'accountant',
            roles: ['accountant', 'admin'],
            isActive: true,
            sessionVersion: 1
        });
        function company(name, taxProfile) {
            return __awaiter(this, void 0, void 0, function* () {
                return Company_1.Company.create({
                    name,
                    address: '1 Verification Street',
                    phone: '0770000100',
                    email: `${name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
                    registrationNumber: name.slice(0, 12),
                    tinNumber: `${name.slice(0, 8)}-TIN`,
                    country: 'Zimbabwe',
                    ownerId: user._id,
                    subscriptionStatus: 'active',
                    tenantStatus: 'active',
                    taxProfile
                });
            });
        }
        const dashboard = yield company('Release Dashboard', {
            vatRegistered: true,
            vatNumber: 'ZW-REL',
            vatCategory: 'standard',
            vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
        });
        user.companyId = dashboard._id;
        yield user.save();
        const unregistered = yield company('Release Unregistered', { vatRegistered: false });
        const incomplete = yield company('Release Incomplete VAT', {
            vatRegistered: true,
            vatNumber: 'ZW-INC',
            vatCategory: '',
            vatRegistrationEffectiveDate: new Date('2026-10-01T00:00:00.000Z')
        });
        for (const row of [dashboard, unregistered, incomplete]) {
            yield (0, accountingPeriodService_1.openExplicitPeriodForDate)({ companyId: String(row._id), date: new Date('2026-09-08T00:00:00.000Z'), createdBy: String(user._id) });
            yield (0, accountingPeriodService_1.openExplicitPeriodForDate)({ companyId: String(row._id), date: new Date('2026-10-05T00:00:00.000Z'), createdBy: String(user._id) });
            yield (0, accountingPeriodService_1.openExplicitPeriodForDate)({ companyId: String(row._id), date: new Date('2026-11-03T00:00:00.000Z'), createdBy: String(user._id) });
        }
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Release', lastName: 'Tenant', email: 'release-tenant@example.test', phone: '0770000101',
            companyId: dashboard._id, ownerId: user._id, status: 'Active'
        });
        function property(input) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a;
                return Property_1.Property.create({
                    companyId: input.companyId,
                    ownerId: user._id,
                    name: input.name,
                    address: `${input.name} Road`,
                    rentalType: input.rentalType,
                    type: 'house',
                    rent: (_a = input.rent) !== null && _a !== void 0 ? _a : 1000,
                    commission: input.commission,
                    vatOnCommission: Boolean(input.vat),
                    vatCommissionTreatment: input.treatment
                });
            });
        }
        function leaseFor(prop_1) {
            return __awaiter(this, arguments, void 0, function* (prop, rent = 1000) {
                return Lease_1.Lease.create({
                    propertyId: prop._id,
                    tenantId: tenant._id,
                    companyId: prop.companyId,
                    ownerId: user._id,
                    startDate: new Date('2026-10-01T00:00:00.000Z'),
                    endDate: new Date('2027-09-30T00:00:00.000Z'),
                    rentAmount: rent,
                    depositAmount: 0,
                    status: 'active',
                    billingStatus: 'current'
                });
            });
        }
        function postIntroduction(prop, reference) {
            return __awaiter(this, void 0, void 0, function* () {
                const lease = yield leaseFor(prop);
                const prepared = yield (0, introductionCommissionService_1.prepareIntroductionRentalCommission)({
                    companyId: prop.companyId,
                    propertyId: prop._id,
                    tenantId: tenant._id,
                    leaseId: lease._id,
                    rentAllocated: 1000,
                    levyAllocated: 0,
                    commissionPercentage: prop.commission,
                    vatOnCommission: false,
                    paymentDate: new Date('2026-11-03T00:00:00.000Z'),
                    propertyRent: 1000,
                    rentUsed: 1000
                });
                if (!prepared.ok)
                    throw new Error(prepared.message);
                const payment = yield Payment_1.Payment.create({
                    companyId: prop.companyId,
                    propertyId: prop._id,
                    tenantId: tenant._id,
                    leaseId: lease._id,
                    agentId: user._id,
                    processedBy: user._id,
                    propertyType: 'residential',
                    amount: 1000,
                    rentAllocated: 1000,
                    depositAmount: 0,
                    paymentType: 'rental',
                    paymentMethod: 'bank_transfer',
                    status: 'completed',
                    paymentDate: new Date('2026-11-03T00:00:00.000Z'),
                    rentalPeriodMonth: 11,
                    rentalPeriodYear: 2026,
                    transactionDomain: 'RENTAL',
                    commissionFinalized: true,
                    accountingStatus: 'pending',
                    accountingComplete: false,
                    referenceNumber: reference,
                    commissionDetails: prepared.snapshot,
                    idempotencyKey: `release:${reference}`
                });
                const posted = yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(payment._id), { createdBy: String(user._id) });
                const saved = yield Payment_1.Payment.findById(payment._id).lean();
                return { saved, posted };
            });
        }
        const intro50 = yield property({ name: 'Introduction Fifty', companyId: dashboard._id, rentalType: 'introduction', commission: 50 });
        const intro100 = yield property({ name: 'Introduction Hundred', companyId: dashboard._id, rentalType: 'introduction', commission: 100 });
        const fifty = yield postIntroduction(intro50, 'REL-INTRO-50');
        const hundred = yield postIntroduction(intro100, 'REL-INTRO-100');
        const fiftyDetails = fifty.saved.commissionDetails;
        const hundredDetails = hundred.saved.commissionDetails;
        check((0, money_1.roundMoney)(fiftyDetails.totalCommission) === 500, `50% commission snapshot is ${fiftyDetails.totalCommission}`);
        check((0, money_1.roundMoney)(fiftyDetails.ownerAmount) === 500, `50% owner snapshot is ${fiftyDetails.ownerAmount}`);
        check((0, money_1.roundMoney)(fiftyDetails.agentShare) === 291, `50% agent snapshot is ${fiftyDetails.agentShare}`);
        check((0, money_1.roundMoney)(fiftyDetails.agencyShare) === 194, `50% company snapshot is ${fiftyDetails.agencyShare}`);
        check((0, money_1.roundMoney)(fiftyDetails.preaFee) === 15, `50% PREA snapshot is ${fiftyDetails.preaFee}`);
        check(fifty.posted.accountingComplete === true, '50% introduction accounting completed');
        check((0, money_1.roundMoney)(hundredDetails.totalCommission) === 1000, `100% commission snapshot is ${hundredDetails.totalCommission}`);
        check((0, money_1.roundMoney)(hundredDetails.ownerAmount) === 0, `100% owner snapshot is ${hundredDetails.ownerAmount}`);
        check((0, money_1.roundMoney)(hundredDetails.agentShare) === 582, `100% agent snapshot is ${hundredDetails.agentShare}`);
        check((0, money_1.roundMoney)(hundredDetails.agencyShare) === 388, `100% company snapshot is ${hundredDetails.agencyShare}`);
        const fiftyJournal = yield JournalEntry_1.JournalEntry.findOne({ companyId: dashboard._id, sourceId: String(fifty.saved._id), status: 'posted' }).lean();
        const hundredJournal = yield JournalEntry_1.JournalEntry.findOne({ companyId: dashboard._id, sourceId: String(hundred.saved._id), status: 'posted' }).lean();
        check(Boolean(fiftyJournal), '50% receipt journal exists');
        check(Boolean(hundredJournal), '100% receipt journal exists');
        const fiftyIncome = yield PropertyAccount_1.default.findOne({ 'transactions.idempotencyKey': `payment:${fifty.saved._id}` }).lean();
        const hundredIncome = yield PropertyAccount_1.default.findOne({ 'transactions.idempotencyKey': `payment:${hundred.saved._id}` }).lean();
        check(Boolean(fiftyIncome), '50% owner income was posted');
        check(!hundredIncome, '100% introduction did not create an owner-income row');
        const agent = yield AgentAccount_1.AgentAccount.findOne({ agentId: user._id }).lean();
        const agentAmounts = ((agent === null || agent === void 0 ? void 0 : agent.transactions) || []).map((tx) => (0, money_1.roundMoney)(tx.amount));
        check(agentAmounts.includes(291) && agentAmounts.includes(582), `agent allocations are ${agentAmounts.join(',')}`);
        const companyAccount = yield CompanyAccount_1.CompanyAccount.findOne({ companyId: dashboard._id }).lean();
        const companyAmounts = ((companyAccount === null || companyAccount === void 0 ? void 0 : companyAccount.transactions) || []).map((tx) => (0, money_1.roundMoney)(tx.amount));
        check(companyAmounts.includes(194) && companyAmounts.includes(388), `company allocations are ${companyAmounts.join(',')}`);
        const unpostedHundred = yield Payment_1.Payment.create({
            companyId: dashboard._id,
            propertyId: intro100._id,
            tenantId: tenant._id,
            agentId: user._id,
            processedBy: user._id,
            propertyType: 'residential',
            amount: 1000,
            rentAllocated: 1000,
            depositAmount: 0,
            paymentType: 'rental',
            paymentMethod: 'bank_transfer',
            status: 'completed',
            paymentDate: new Date('2026-11-04T00:00:00.000Z'),
            rentalPeriodMonth: 11,
            rentalPeriodYear: 2026,
            transactionDomain: 'RENTAL',
            commissionFinalized: true,
            accountingComplete: null,
            referenceNumber: 'REL-INTRO-100-UNPOSTED',
            commissionDetails: hundredDetails,
            idempotencyKey: 'release:intro-100-unposted'
        });
        const agentAccount = yield AgentAccount_1.AgentAccount.findOne({ agentId: user._id });
        agentAccount === null || agentAccount === void 0 ? void 0 : agentAccount.transactions.push({
            type: 'commission', amount: 582, date: unpostedHundred.paymentDate, paymentId: unpostedHundred._id, description: 'Unposted introduction', status: 'completed'
        });
        yield (agentAccount === null || agentAccount === void 0 ? void 0 : agentAccount.save());
        const companyLedger = yield CompanyAccount_1.CompanyAccount.findOne({ companyId: dashboard._id });
        companyLedger === null || companyLedger === void 0 ? void 0 : companyLedger.transactions.push({ paymentId: unpostedHundred._id, amount: 388, isArchived: false, description: 'Unposted introduction', date: unpostedHundred.paymentDate, type: 'income' });
        yield (companyLedger === null || companyLedger === void 0 ? void 0 : companyLedger.save());
        const beforeFlag = (_a = (yield Payment_1.Payment.findById(hundred.saved._id).select('accountingComplete').lean())) === null || _a === void 0 ? void 0 : _a.accountingComplete;
        yield (0, paymentAccountingIntegrity_1.listCompanyAccountingInconsistencies)(String(dashboard._id), { paymentReference: 'REL-INTRO-100', limit: 10 });
        const afterFlag = (_b = (yield Payment_1.Payment.findById(hundred.saved._id).select('accountingComplete').lean())) === null || _b === void 0 ? void 0 : _b.accountingComplete;
        check(beforeFlag === afterFlag, 'listing integrity rows did not change the accounting-complete flag');
        const { classifyAccountingIntegrityRow } = yield Promise.resolve().then(() => __importStar(require('../services/accountingIntegrityClassification')));
        const presence = yield (0, paymentAccountingReconciliation_1.loadAccountingActualSnapshot)(unpostedHundred.toObject());
        const hidden = classifyAccountingIntegrityRow({
            component: 'MISSING_JOURNAL',
            payment: unpostedHundred,
            propertyCommission: 100,
            presence: { ownerIncome: presence.ownerIncome, agentCommission: presence.agentCommission, companyCommission: presence.companyCommission, journal: presence.journal }
        });
        check(hidden.classification === 'HISTORICAL JOURNAL GAP', `100% with a missing journal is ${hidden.classification}`);
        check(hidden.explanation.includes('0.00') && hidden.explanation.includes('journal'), 'zero owner income does not hide the missing journal');
        function vatSnapshot(owner_1, prop_1, date_1) {
            return __awaiter(this, arguments, void 0, function* (owner, prop, date, amount = 2000) {
                const policy = yield (0, vatPolicyService_1.resolveCommissionVatPolicy)({
                    companyId: String(owner._id),
                    paymentDate: date,
                    property: prop,
                    requestedVatOnCommission: Boolean(prop.vatOnCommission),
                    requestedTreatment: prop.vatCommissionTreatment,
                    commissionType: 'management'
                });
                const flags = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)(policy);
                const calc = yield commissionService_1.CommissionService.calculateForProperty({
                    companyId: owner._id,
                    grossRent: amount,
                    levy: 0,
                    commissionPercentage: prop.commission,
                    vatOnCommission: flags.vatOnCommission,
                    vatTreatment: flags.vatTreatment,
                    vatRate: flags.vatRate,
                    paymentDate: date,
                    commissionType: 'management'
                });
                return { policy, flags, snapshot: (0, vatPolicyService_1.stampVatDecision)((0, propertyCommissionCalculator_1.toPaymentCommissionSnapshot)(calc), policy) };
            });
        }
        const enabled = yield property({ name: 'VAT Enabled', companyId: dashboard._id, rentalType: 'management', commission: 15, vat: true, treatment: 'exclusive', rent: 2000 });
        const disabled = yield property({ name: 'VAT Disabled', companyId: dashboard._id, rentalType: 'management', commission: 15, vat: false, rent: 2000 });
        const unregProp = yield property({ name: 'VAT Unregistered Property', companyId: unregistered._id, rentalType: 'management', commission: 15, vat: true, treatment: 'exclusive', rent: 2000 });
        const incompleteProp = yield property({ name: 'VAT Incomplete Property', companyId: incomplete._id, rentalType: 'management', commission: 15, vat: true, treatment: 'exclusive', rent: 2000 });
        const date = new Date('2026-11-03T00:00:00.000Z');
        const valid = yield vatSnapshot(dashboard, enabled, date);
        const off = yield vatSnapshot(dashboard, disabled, date);
        const unreg = yield vatSnapshot(unregistered, unregProp, date);
        const partial = yield vatSnapshot(incomplete, incompleteProp, date);
        check(valid.policy.apply === true && (0, money_1.roundMoney)(valid.snapshot.vatAmount) === 46.5, `complete VAT is ${valid.snapshot.vatAmount}`);
        check(off.policy.apply === false && (0, money_1.roundMoney)(off.snapshot.vatAmount) === 0, 'disabled property produces zero VAT');
        check(unreg.policy.apply === false && (0, money_1.roundMoney)(unreg.snapshot.vatAmount) === 0, 'unregistered company produces zero VAT');
        check(partial.policy.apply === false && partial.policy.reviewReason === 'VAT_CONFIGURATION_INCOMPLETE', 'incomplete VAT configuration blocks VAT');
        const validLease = yield leaseFor(enabled, 2000);
        const validPayment = yield Payment_1.Payment.create({
            companyId: dashboard._id, propertyId: enabled._id, tenantId: tenant._id, leaseId: validLease._id,
            agentId: user._id, processedBy: user._id, propertyType: 'residential', amount: 2000, rentAllocated: 2000,
            depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed',
            paymentDate: date, rentalPeriodMonth: 11, rentalPeriodYear: 2026, transactionDomain: 'RENTAL',
            commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false,
            referenceNumber: 'REL-VAT-VALID', applyVatOnCommission: true, vatOnCommissionRate: valid.flags.vatRate,
            vatCommissionTreatment: 'exclusive', commissionDetails: valid.snapshot, idempotencyKey: 'release:vat-valid'
        });
        yield (0, paymentAccountingReconciliation_1.ensurePaymentAccountingPosted)(String(validPayment._id), { createdBy: String(user._id) });
        const validSaved = yield Payment_1.Payment.findById(validPayment._id).lean();
        const validRecord = yield VatRecord_1.VatRecord.findOne({ transactionId: String(validPayment._id) }).lean();
        const validObligations = yield TaxObligation_1.TaxObligation.find({ paymentId: validPayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        const snapshotVat = (0, money_1.roundMoney)(Number(validSaved.commissionDetails.vatOnCommission || validSaved.commissionDetails.vatAmount));
        check(validObligations.length === 1, `valid VAT created ${validObligations.length} obligations`);
        check((0, money_1.roundMoney)(validRecord === null || validRecord === void 0 ? void 0 : validRecord.vatCollected) === snapshotVat, 'VAT record amount matches the snapshot');
        check(Number(validRecord === null || validRecord === void 0 ? void 0 : validRecord.vatRate) === (0, vatPolicyService_1.authoritativeSnapshotVatRate)(validSaved), 'VAT record rate matches the snapshot');
        check((0, money_1.roundMoney)((_c = validObligations[0]) === null || _c === void 0 ? void 0 : _c.taxAmount) === (0, money_1.roundMoney)(validRecord === null || validRecord === void 0 ? void 0 : validRecord.vatCollected), 'tax obligation matches the VAT record');
        const historical = yield Payment_1.Payment.create({
            companyId: incomplete._id, propertyId: incompleteProp._id, tenantId: tenant._id,
            agentId: user._id, processedBy: user._id, propertyType: 'residential', amount: 2000, rentAllocated: 2000,
            depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed',
            paymentDate: new Date('2026-10-05T00:00:00.000Z'), rentalPeriodMonth: 10, rentalPeriodYear: 2026,
            transactionDomain: 'RENTAL', commissionFinalized: true, accountingComplete: null,
            referenceNumber: 'REL-VAT-HIST', commissionDetails: {
                totalCommission: 300, commissionNet: 300, ownerAmount: 1653.5, agentShare: 174.6, agencyShare: 116.4,
                preaFee: 9, vatOnCommission: 46.5, vatAmount: 46.5, vatRate: 0.155, commissionRate: 15, vatTreatment: 'exclusive'
            },
            idempotencyKey: 'release:vat-hist'
        });
        yield VatRecord_1.VatRecord.create({
            companyId: incomplete._id, transactionId: String(historical._id), sourceType: 'rental',
            vatCollected: 46.5, vatPaid: 0, vatRate: 0, filingPeriod: '2026-10', status: 'pending'
        });
        const beforeRate = 0;
        const beforeObligations = yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: historical._id });
        const blocked = yield (0, paymentAccountingReconciliation_1.repairPaymentAccounting)(String(historical._id), {
            dryRun: false,
            reason: 'Repair the missing receipt journal',
            userId: String(user._id),
            createdBy: String(user._id)
        });
        const approvedButIneligible = yield (0, paymentAccountingReconciliation_1.repairPaymentAccounting)(String(historical._id), {
            dryRun: false,
            reason: 'approve historical VAT obligation',
            userId: String(user._id),
            createdBy: String(user._id),
            approveHistoricalVatObligation: true
        });
        const afterRecord = yield VatRecord_1.VatRecord.findOne({ transactionId: String(historical._id) }).lean();
        const afterObligations = yield TaxObligation_1.TaxObligation.countDocuments({ paymentId: historical._id });
        const afterPayment = yield Payment_1.Payment.findById(historical._id).lean();
        check(beforeObligations === 0 && afterObligations === 0, 'historical repair created no VAT obligation');
        check(Number(afterRecord === null || afterRecord === void 0 ? void 0 : afterRecord.vatRate) === beforeRate, 'historical VAT record rate was not rewritten');
        check((0, money_1.roundMoney)(afterPayment.commissionDetails.vatOnCommission) === 46.5, 'historical snapshot was not rewritten');
        check(Boolean(blocked.vatObligationSkipped || approvedButIneligible.vatObligationSkipped), `repair reports that the historical VAT obligation was not created (${blocked.vatObligationSkipped || approvedButIneligible.vatObligationSkipped || blocked.accountingStatus})`);
        const eligibility = yield (0, vatPolicyService_1.assessVatObligationCreation)({ payment: historical, approveHistoricalVatObligation: true });
        check(eligibility.create === false, `approval cannot override incomplete receipt-date eligibility (${eligibility.reason})`);
        const prospectivePayment = yield Payment_1.Payment.create({
            companyId: dashboard._id, propertyId: enabled._id, tenantId: tenant._id, leaseId: validLease._id,
            agentId: user._id, processedBy: user._id, propertyType: 'residential', amount: 2000, rentAllocated: 2000,
            depositAmount: 0, paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed',
            paymentDate: date, rentalPeriodMonth: 11, rentalPeriodYear: 2026, transactionDomain: 'RENTAL',
            commissionFinalized: true, accountingStatus: 'pending', accountingComplete: false,
            referenceNumber: 'REL-VAT-REPAIR', applyVatOnCommission: true, vatOnCommissionRate: valid.flags.vatRate,
            vatCommissionTreatment: 'exclusive', commissionDetails: valid.snapshot, idempotencyKey: 'release:vat-repair'
        });
        const prospective = yield (0, paymentAccountingReconciliation_1.repairPaymentAccounting)(String(prospectivePayment._id), {
            dryRun: false,
            reason: 'Post the current receipt and its VAT obligation',
            userId: String(user._id),
            approveHistoricalVatObligation: false
        });
        const restored = yield TaxObligation_1.TaxObligation.find({ paymentId: prospectivePayment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
        const restoredRecord = yield VatRecord_1.VatRecord.findOne({ transactionId: String(prospectivePayment._id) }).lean();
        check(restored.length === 1, `prospective repair restored ${restored.length} obligations`);
        check((0, money_1.roundMoney)((_d = restored[0]) === null || _d === void 0 ? void 0 : _d.taxAmount) === (0, money_1.roundMoney)(restoredRecord === null || restoredRecord === void 0 ? void 0 : restoredRecord.vatCollected), 'prospective obligation matches its VAT record');
        check(!prospective.vatObligationSkipped, 'a valid receipt-date decision does not need historical approval');
        yield seedDashboard(dashboard._id, user._id, tenant._id);
        if (failures.length) {
            console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
            process.exitCode = 1;
        }
        else {
            console.log('Release verification data checks passed.');
            console.log('Local login: release-verify@example.test');
        }
        yield mongoose_1.default.disconnect();
        yield database_1.accountingConnection.close();
    });
}
function seedDashboard(companyId, userId, tenantId) {
    return __awaiter(this, void 0, void 0, function* () {
        const suffolk = yield Property_1.Property.create({
            companyId, ownerId: userId, name: 'Suffolk 2 Unit 8', address: 'Suffolk 2', rentalType: 'management', rent: 1100, commission: 15, type: 'apartment'
        });
        const shine = yield Property_1.Property.create({
            companyId, ownerId: userId, name: 'Shineplus', address: 'Shineplus', rentalType: 'introduction', rent: 1000, commission: 50, type: 'house'
        });
        const fairview = yield Property_1.Property.create({
            companyId, ownerId: userId, name: 'Fairview Close', address: 'Fairview Close', rentalType: 'introduction', rent: 800, commission: 100, type: 'commercial'
        });
        const staleProperty = yield Property_1.Property.create({
            companyId, ownerId: userId, name: 'Stale Estate', address: 'Stale Estate', rentalType: 'management', rent: 750, commission: 15, type: 'house'
        });
        const base = {
            companyId, tenantId, agentId: userId, processedBy: userId, propertyType: 'residential', depositAmount: 0,
            paymentType: 'rental', paymentMethod: 'bank_transfer', status: 'completed', transactionDomain: 'RENTAL', commissionFinalized: true
        };
        const suffolkPayment = yield Payment_1.Payment.create(Object.assign(Object.assign({}, base), { propertyId: suffolk._id, amount: 1100, rentAllocated: 1100, referenceNumber: 'RCPT-7DD47A-2026-09', paymentDate: new Date('2026-09-07T00:00:00.000Z'), rentalPeriodMonth: 9, rentalPeriodYear: 2026, accountingComplete: null, commissionDetails: { totalCommission: 165, ownerAmount: 1035, agentShare: 96.03, agencyShare: 64.02, preaFee: 4.95, commissionRate: 15, vatOnCommission: 0 }, idempotencyKey: 'release:suffolk' }));
        const shinePayment = yield Payment_1.Payment.create(Object.assign(Object.assign({}, base), { propertyId: shine._id, amount: 1000, rentAllocated: 1000, referenceNumber: 'REF-1793687077258-534', paymentDate: new Date('2026-11-03T00:00:00.000Z'), rentalPeriodMonth: 11, rentalPeriodYear: 2026, accountingComplete: false, accountingStatus: 'incomplete', accountingMissing: ['ownerIncome'], commissionDetails: { totalCommission: 1000, ownerAmount: 0, agentShare: 582, agencyShare: 388, preaFee: 30, commissionRate: 100, vatOnCommission: 0 }, idempotencyKey: 'release:shine' }));
        const fairviewPayment = yield Payment_1.Payment.create(Object.assign(Object.assign({}, base), { propertyId: fairview._id, amount: 800, rentAllocated: 800, referenceNumber: 'RCPT-DCDD37-2026-08', paymentDate: new Date('2026-08-13T00:00:00.000Z'), rentalPeriodMonth: 8, rentalPeriodYear: 2026, accountingComplete: null, commissionDetails: { totalCommission: 800, ownerAmount: 0, agentShare: 465.6, agencyShare: 310.4, preaFee: 24, commissionRate: 100, vatOnCommission: 0 }, idempotencyKey: 'release:fairview' }));
        const stalePayment = yield Payment_1.Payment.create(Object.assign(Object.assign({}, base), { propertyId: staleProperty._id, amount: 750, rentAllocated: 700, referenceNumber: 'REL-STALE', paymentDate: new Date('2026-11-06T00:00:00.000Z'), rentalPeriodMonth: 11, rentalPeriodYear: 2026, accountingComplete: true, commissionDetails: { totalCommission: 105, ownerAmount: 645, agentShare: 61.11, agencyShare: 40.74, preaFee: 3.15, commissionRate: 15, vatOnCommission: 0 }, idempotencyKey: 'release:stale' }));
        yield JournalEntry_1.JournalEntry.create({
            companyId, reference: 'PAY-REF-1793687077258-534', description: 'Fixture receipt', sourceModule: 'payment',
            sourceId: String(shinePayment._id), status: 'posted', transactionDate: shinePayment.paymentDate, createdBy: userId
        });
        yield JournalEntry_1.JournalEntry.create({
            companyId, reference: 'PAY-REL-STALE', description: 'Fixture receipt', sourceModule: 'payment',
            sourceId: String(stalePayment._id), status: 'posted', transactionDate: stalePayment.paymentDate, createdBy: userId
        });
        const agentAccount = yield AgentAccount_1.AgentAccount.findOne({ agentId: userId });
        const agentRows = [
            { type: 'commission', amount: 465.6, date: fairviewPayment.paymentDate, paymentId: fairviewPayment._id, description: 'Fairview', status: 'completed' },
            { type: 'commission', amount: 61.11, date: stalePayment.paymentDate, paymentId: stalePayment._id, description: 'Stale', status: 'completed' }
        ];
        if (agentAccount) {
            agentAccount.transactions.push(...agentRows);
            yield agentAccount.save();
        }
        else {
            yield AgentAccount_1.AgentAccount.create({ agentId: userId, companyId, transactions: agentRows });
        }
        const existingCompany = yield CompanyAccount_1.CompanyAccount.findOne({ companyId });
        const extra = [
            { paymentId: fairviewPayment._id, amount: 310.4, isArchived: false, description: 'Fairview', date: fairviewPayment.paymentDate, type: 'income' },
            { paymentId: stalePayment._id, amount: 40.74, isArchived: false, description: 'Stale', date: stalePayment.paymentDate, type: 'income' }
        ];
        if (existingCompany) {
            existingCompany.transactions.push(...extra);
            yield existingCompany.save();
        }
        else {
            yield CompanyAccount_1.CompanyAccount.create({ companyId, transactions: extra });
        }
        yield PropertyAccount_1.default.create({
            propertyId: staleProperty._id, companyId, ledgerType: 'rental', isArchived: false, isActive: true,
            transactions: [{ type: 'income', status: 'completed', amount: 645, paymentId: stalePayment._id, idempotencyKey: `payment:${stalePayment._id}`, date: stalePayment.paymentDate, description: 'Stale income' }]
        });
        const now = new Date();
        yield AccountingException_1.AccountingException.create([
            { kind: 'financial_review', status: 'open', issueType: 'missing', component: 'MISSING_JOURNAL', paymentId: suffolkPayment._id, companyId, error: 'accounting journal', detectedAt: now, lastCheckedAt: now },
            { kind: 'incomplete_projection', status: 'open', issueType: 'missing', component: 'ownerIncome', paymentId: shinePayment._id, companyId, error: 'ownerIncome', detectedAt: now, lastCheckedAt: now },
            { kind: 'financial_review', status: 'open', issueType: 'missing', component: 'MISSING_JOURNAL', paymentId: fairviewPayment._id, companyId, error: 'accounting journal', detectedAt: now, lastCheckedAt: now },
            { kind: 'financial_review', status: 'open', issueType: 'missing', component: 'MISSING_JOURNAL', paymentId: stalePayment._id, companyId, error: 'accounting journal', detectedAt: now, lastCheckedAt: now }
        ]);
        yield TaxReviewItem_1.TaxReviewItem.create({
            companyId, kind: 'VAT_CONFIGURATION_INCOMPLETE', status: 'OPEN', title: 'VAT category is blank',
            detail: 'VAT was not applied because the company VAT category is blank.', detectedAt: now
        });
        for (let index = 0; index < 3; index += 1) {
            yield Payment_1.Payment.create(Object.assign(Object.assign({}, base), { propertyId: suffolk._id, amount: 100 + index, referenceNumber: `REL-UNJOURNALLED-${index}`, paymentDate: new Date('2026-07-01T00:00:00.000Z'), rentalPeriodMonth: 7, rentalPeriodYear: 2026, accountingComplete: null, commissionDetails: { totalCommission: 15, ownerAmount: 85 + index, agentShare: 8, agencyShare: 6, preaFee: 1, commissionRate: 15, vatOnCommission: 0 }, idempotencyKey: `release:unjournalled:${index}` }));
        }
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
