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
exports.PROPOSED_BENJAMINS_HISTORICAL_VAT_SCHEDULE = void 0;
exports.summariseProposedHistoricalVatSchedule = summariseProposedHistoricalVatSchedule;
exports.buildHistoricalVatSchedule = buildHistoricalVatSchedule;
exports.recogniseHistoricalVat = recogniseHistoricalVat;
exports.rejectHistoricalVat = rejectHistoricalVat;
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../models/Company");
const Payment_1 = require("../models/Payment");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const VatRecord_1 = require("../models/VatRecord");
const TaxObligation_1 = require("../models/TaxObligation");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const HistoricalVatRecognition_1 = require("../models/HistoricalVatRecognition");
const accountingService_1 = __importDefault(require("./accountingService"));
const taxObligationService_1 = require("./taxObligationService");
const chartAccounts_1 = require("./tax/chartAccounts");
const money_1 = require("../utils/money");
const AMOUNT_TOLERANCE = 0.02;
const SEPTEMBER_BASIS_MIN = 20;
/**
 * Receipt-by-receipt schedule from the 11 November 2026 read-only investigation.
 * This is a review schedule. It does not load production and it does not post.
 */
exports.PROPOSED_BENJAMINS_HISTORICAL_VAT_SCHEDULE = [
    { reference: 'REF-1788854164778-25', receiptDate: '2026-09-08', property: '9 Gaynor Road, Highlands', tenant: 'Rudo Nyangulu', gross: 2000, levy: 0, commissionPercent: 15, commission: 300, vatRate: 0.155, vat: 46.5, ownerAfterVat: 1653.5, periodClass: 'before_registration' },
    { reference: 'REF-1789539226259-994', receiptDate: '2026-09-16', property: 'Wild Bloom Cafe, Lanark Road', tenant: 'Tinashe Innocent Muzembe', gross: 1150, levy: 0, commissionPercent: 10, commission: 115, vatRate: 0.155, vat: 17.83, ownerAfterVat: 1017.17, periodClass: 'before_registration' },
    { reference: 'REF-1789539297793-393', receiptDate: '2026-09-16', property: 'Unit 27, 39 Suffolk Road', tenant: 'Aleck Tinashe Chitongo', gross: 1100, levy: 100, commissionPercent: 10, commission: 100, vatRate: 0.155, vat: 15.5, ownerAfterVat: 984.5, periodClass: 'before_registration' },
    { reference: 'REF-1789632237050-371', receiptDate: '2026-09-17', property: "Gentleman's Barber, Lanark Road", tenant: 'Mike Pabvabango', gross: 1325, levy: 0, commissionPercent: 10, commission: 132.5, vatRate: 0.155, vat: 20.54, ownerAfterVat: 1171.96, periodClass: 'before_registration' },
    { reference: 'REF-1790842035381-92', receiptDate: '2026-10-01', property: 'Make up By Gamu, Lanark Road', tenant: 'Gamuchirai Melissa Manyika', gross: 600, levy: 0, commissionPercent: 10, commission: 60, vatRate: 0.155, vat: 9.3, ownerAfterVat: 530.7, periodClass: 'on_or_after_registration' },
    { reference: 'REF-1791193589540-657', receiptDate: '2026-10-05', property: 'Unit 21, 39 Suffolk Road', tenant: 'Gloria Ngwenya', gross: 1000, levy: 100, commissionPercent: 12.5, commission: 112.5, vatRate: 0.155, vat: 17.44, ownerAfterVat: 870.06, periodClass: 'on_or_after_registration' },
    { reference: 'REF-1791202790256-441', receiptDate: '2026-10-05', property: "Gentleman's Barber, Lanark Road", tenant: 'Mike Pabvabango', gross: 1325, levy: 0, commissionPercent: 10, commission: 132.5, vatRate: 0.155, vat: 20.54, ownerAfterVat: 1171.96, periodClass: 'on_or_after_registration' },
    { reference: 'REF-1791267902021-300', receiptDate: '2026-10-06', property: 'Unit 4, Suffolk 1', tenant: 'Farai Christopher Zimbango', gross: 1400, levy: 100, commissionPercent: 15, commission: 195, vatRate: 0.155, vat: 30.23, ownerAfterVat: 1174.77, periodClass: 'on_or_after_registration' },
    { reference: 'REF-1791379734572-423', receiptDate: '2026-10-07', property: '5 Harvey Brown Road, Milton Park', tenant: 'Happy Magadure', gross: 2000, levy: 0, commissionPercent: 15, commission: 300, vatRate: 0.155, vat: 46.5, ownerAfterVat: 1653.5, periodClass: 'on_or_after_registration' },
    { reference: 'REF-1791540222600-562', receiptDate: '2026-10-09', property: 'Unit 8, Suffolk 2', tenant: 'Nyasha Tadiwa Nhukarume', gross: 1200, levy: 100, commissionPercent: 15, commission: 165, vatRate: 0.155, vat: 25.58, ownerAfterVat: 1009.42, periodClass: 'on_or_after_registration' }
];
function summariseProposedHistoricalVatSchedule() {
    const september = (0, money_1.roundMoney)(exports.PROPOSED_BENJAMINS_HISTORICAL_VAT_SCHEDULE.filter((row) => row.periodClass === 'before_registration').reduce((sum, row) => sum + row.vat, 0));
    const october = (0, money_1.roundMoney)(exports.PROPOSED_BENJAMINS_HISTORICAL_VAT_SCHEDULE.filter((row) => row.periodClass === 'on_or_after_registration').reduce((sum, row) => sum + row.vat, 0));
    return {
        count: exports.PROPOSED_BENJAMINS_HISTORICAL_VAT_SCHEDULE.length,
        september,
        october,
        total: (0, money_1.roundMoney)(september + october),
        physicalBookReference: 'required and not on file',
        septemberTaxTreatmentBasis: 'required and not on file',
        octoberVatCategoryAtInvestigation: 'blank',
        executed: false
    };
}
function snapshotVat(details) {
    var _a, _b;
    return (0, money_1.roundMoney)(Number((_b = (_a = details === null || details === void 0 ? void 0 : details.vatOnCommission) !== null && _a !== void 0 ? _a : details === null || details === void 0 ? void 0 : details.vatAmount) !== null && _b !== void 0 ? _b : 0));
}
function snapshotRate(details) {
    const rate = details === null || details === void 0 ? void 0 : details.vatRate;
    return rate == null || rate === '' ? NaN : Number(rate);
}
function periodClassFor(paymentDate, effective) {
    if (!effective || paymentDate.getTime() < effective.getTime())
        return 'before_registration';
    return 'on_or_after_registration';
}
function vatPayableCredits(companyId, paymentId, reference) {
    return __awaiter(this, void 0, void 0, function* () {
        const sourceIds = [paymentId, `historical-vat:${paymentId}`];
        const references = [`PAY-${reference}`, `HVAT-${reference}`].filter(Boolean);
        const journals = yield JournalEntry_1.JournalEntry.find({
            companyId,
            status: 'posted',
            $or: [
                { sourceId: { $in: sourceIds } },
                { reference: { $in: references } }
            ]
        }).select('_id').lean();
        if (!journals.length)
            return { amount: 0, journalEntryId: null };
        const lines = yield JournalLine_1.JournalLine.find({ journalEntryId: { $in: journals.map((row) => row._id) } }).select('journalEntryId accountId credit').lean();
        const accounts = yield ChartOfAccount_1.ChartOfAccount.find({ _id: { $in: lines.map((line) => line.accountId) } }).select('code').lean();
        const codes = new Map(accounts.map((account) => [String(account._id), account.code]));
        let amount = 0;
        let journalEntryId = null;
        for (const line of lines) {
            if (codes.get(String(line.accountId)) === chartAccounts_1.GL.VAT_PAYABLE && Number(line.credit) > 0) {
                amount = (0, money_1.roundMoney)(amount + Number(line.credit));
                journalEntryId = String(line.journalEntryId);
            }
        }
        return { amount, journalEntryId };
    });
}
function ownerIncomeTotal(paymentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield PropertyAccount_1.default.find({ 'transactions.paymentId': paymentId }).select('transactions').lean();
        let total = 0;
        for (const row of rows) {
            for (const tx of row.transactions || []) {
                if (String(tx.paymentId) === String(paymentId) && tx.type === 'income' && tx.status !== 'cancelled') {
                    total += Number(tx.amount || 0);
                }
            }
        }
        return (0, money_1.roundMoney)(total);
    });
}
function evidenceBlockers(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!(input.vat > 0))
        return 'SNAPSHOT_VAT_ABSENT';
    if (!((_a = input.property) === null || _a === void 0 ? void 0 : _a.vatOnCommission))
        return 'PROPERTY_VAT_ON_COMMISSION_DISABLED';
    const treatment = String(((_b = input.details) === null || _b === void 0 ? void 0 : _b.vatTreatment) || ((_c = input.property) === null || _c === void 0 ? void 0 : _c.vatCommissionTreatment) || '').toLowerCase();
    if (treatment !== 'exclusive')
        return 'EXCLUSIVE_VAT_TREATMENT_REQUIRED';
    if (!Number.isFinite(input.rate) || input.rate <= 0)
        return 'STORED_VAT_RATE_REQUIRED';
    const commission = (0, money_1.roundMoney)(Number((_g = (_e = (_d = input.details) === null || _d === void 0 ? void 0 : _d.totalCommission) !== null && _e !== void 0 ? _e : (_f = input.details) === null || _f === void 0 ? void 0 : _f.commissionNet) !== null && _g !== void 0 ? _g : 0));
    const calculated = (0, money_1.roundMoney)(commission * input.rate);
    if (Math.abs(calculated - input.vat) > AMOUNT_TOLERANCE)
        return 'VAT_AMOUNT_DISAGREES_WITH_STORED_CALCULATION';
    if (!input.physicalBookReference || input.physicalBookReference.trim().length < 3)
        return 'PHYSICAL_BOOK_REFERENCE_REQUIRED';
    if (input.obligationAmount != null && Math.abs(input.obligationAmount - input.vat) > AMOUNT_TOLERANCE)
        return 'VAT_OBLIGATION_AMOUNT_DISAGREES';
    if (input.periodClass === 'before_registration') {
        if (input.septemberTaxTreatmentApproved !== true)
            return 'SEPTEMBER_TAX_TREATMENT_APPROVAL_REQUIRED';
        if (input.taxTreatmentBasis.trim().length < SEPTEMBER_BASIS_MIN)
            return 'SEPTEMBER_TAX_TREATMENT_EVIDENCE_INSUFFICIENT';
        return null;
    }
    const profile = ((_h = input.company) === null || _h === void 0 ? void 0 : _h.taxProfile) || {};
    if (profile.vatRegistered !== true)
        return 'COMPANY_NOT_VAT_REGISTERED';
    if (!profile.vatRegistrationEffectiveDate)
        return 'VAT_EFFECTIVE_DATE_REQUIRED';
    if (!String(profile.vatCategory || '').trim())
        return 'OCTOBER_VAT_CONFIGURATION_INCOMPLETE';
    return null;
}
function saveRecognition(payment, fields) {
    return __awaiter(this, void 0, void 0, function* () {
        return HistoricalVatRecognition_1.HistoricalVatRecognition.findOneAndUpdate({ companyId: payment.companyId, paymentId: payment._id }, { $set: fields, $setOnInsert: { companyId: payment.companyId, paymentId: payment._id } }, { upsert: true, new: true });
    });
}
function buildHistoricalVatSchedule(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const company = yield Company_1.Company.findById(companyId).select('taxProfile').lean();
        const effective = ((_a = company === null || company === void 0 ? void 0 : company.taxProfile) === null || _a === void 0 ? void 0 : _a.vatRegistrationEffectiveDate)
            ? new Date(company.taxProfile.vatRegistrationEffectiveDate)
            : null;
        const from = new Date('2026-09-01T00:00:00.000Z');
        const to = new Date('2026-11-01T00:00:00.000Z');
        const payments = yield Payment_1.Payment.find({
            companyId,
            status: 'completed',
            paymentDate: { $gte: from, $lt: to },
            'commissionDetails.vatOnCommission': { $gt: 0.005 }
        }).select('referenceNumber paymentDate propertyId tenantId amount commissionDetails rentalPeriodMonth rentalPeriodYear').lean();
        const rows = [];
        for (const payment of payments) {
            const details = payment.commissionDetails || {};
            const vat = snapshotVat(details);
            const property = payment.propertyId ? yield Property_1.Property.findById(payment.propertyId).select('name').lean() : null;
            const tenant = payment.tenantId ? yield Tenant_1.Tenant.findById(payment.tenantId).select('firstName lastName name').lean() : null;
            const record = yield VatRecord_1.VatRecord.findOne({ companyId, transactionId: String(payment._id) }).select('vatRate vatCollected').lean();
            const obligation = yield TaxObligation_1.TaxObligation.findOne({ companyId, paymentId: payment._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).select('taxAmount').lean();
            const recognition = yield HistoricalVatRecognition_1.HistoricalVatRecognition.findOne({ companyId, paymentId: payment._id }).lean();
            const payable = yield vatPayableCredits(companyId, String(payment._id), String(payment.referenceNumber || ''));
            const receiptJournal = yield JournalEntry_1.JournalEntry.findOne({ companyId, sourceModule: 'payment', sourceId: String(payment._id), status: 'posted' }).select('_id').lean();
            let recognitionStatus = 'awaiting_recognition';
            if ((recognition === null || recognition === void 0 ? void 0 : recognition.status) === 'recognised')
                recognitionStatus = 'recognised';
            else if ((recognition === null || recognition === void 0 ? void 0 : recognition.status) === 'approved')
                recognitionStatus = 'approved';
            else if ((recognition === null || recognition === void 0 ? void 0 : recognition.status) === 'rejected')
                recognitionStatus = 'rejected';
            else if ((recognition === null || recognition === void 0 ? void 0 : recognition.status) === 'review')
                recognitionStatus = 'review';
            else if (obligation)
                recognitionStatus = 'existing_obligation';
            const tenantName = (tenant === null || tenant === void 0 ? void 0 : tenant.name) || [((tenant === null || tenant === void 0 ? void 0 : tenant.firstName) || ''), ((tenant === null || tenant === void 0 ? void 0 : tenant.lastName) || '')].filter(Boolean).join(' ');
            rows.push({
                paymentId: String(payment._id),
                reference: String(payment.referenceNumber || ''),
                property: String((property === null || property === void 0 ? void 0 : property.name) || ''),
                tenant: tenantName,
                receiptDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString() : null,
                rentalPeriod: payment.rentalPeriodYear || payment.rentalPeriodMonth ? `${payment.rentalPeriodYear || '?'}-${payment.rentalPeriodMonth || '?'}` : '',
                gross: (0, money_1.roundMoney)(Number(payment.amount || 0)),
                commissionPercent: details.commissionRate == null && details.commissionPercentage == null ? null : Number((_b = details.commissionPercentage) !== null && _b !== void 0 ? _b : details.commissionRate),
                commission: (0, money_1.roundMoney)(Number((_d = (_c = details.totalCommission) !== null && _c !== void 0 ? _c : details.commissionNet) !== null && _d !== void 0 ? _d : 0)),
                vatRate: snapshotRate(details),
                vat,
                ownerAfterVat: (0, money_1.roundMoney)(Number(details.ownerAmount || 0)),
                vatRecordRate: record ? Number(record.vatRate) : null,
                vatRecordAmount: record ? (0, money_1.roundMoney)(Number(record.vatCollected || 0)) : null,
                obligationAmount: obligation ? (0, money_1.roundMoney)(Number(obligation.taxAmount || 0)) : null,
                receiptJournalPresent: Boolean(receiptJournal),
                vatPayableAmount: payable.amount,
                periodClass: periodClassFor(new Date(payment.paymentDate), effective),
                recognitionStatus,
                blockedReason: String((recognition === null || recognition === void 0 ? void 0 : recognition.blockedReason) || ''),
                duplicateRecognitionBlocked: (recognition === null || recognition === void 0 ? void 0 : recognition.status) === 'recognised'
            });
        }
        const counts = {
            awaiting_recognition: 0,
            approved: 0,
            recognised: 0,
            review: 0,
            rejected: 0,
            existing_obligation: 0
        };
        for (const row of rows)
            counts[row.recognitionStatus] += 1;
        return {
            rows,
            counts,
            totalVat: (0, money_1.roundMoney)(rows.reduce((sum, row) => sum + row.vat, 0))
        };
    });
}
function recogniseHistoricalVat(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        if (input.confirm !== true) {
            return { ok: false, status: 'blocked', reason: 'EXPLICIT_CONFIRMATION_REQUIRED', journalCreated: false, obligationCreated: false };
        }
        const reason = String(input.reason || '').trim();
        if (reason.length < 10) {
            return { ok: false, status: 'blocked', reason: 'RECOGNITION_REASON_REQUIRED', journalCreated: false, obligationCreated: false };
        }
        const payment = yield Payment_1.Payment.findOne({ _id: input.paymentId, companyId: input.companyId }).lean();
        if (!payment)
            return { ok: false, status: 'blocked', reason: 'PAYMENT_NOT_FOUND', journalCreated: false, obligationCreated: false };
        const existing = yield HistoricalVatRecognition_1.HistoricalVatRecognition.findOne({ companyId: input.companyId, paymentId: payment._id }).lean();
        if ((existing === null || existing === void 0 ? void 0 : existing.status) === 'recognised') {
            return {
                ok: true,
                status: 'recognised',
                reason: 'DUPLICATE_RECOGNITION_PREVENTED',
                duplicatePrevented: true,
                recognitionAmount: Number(existing.recognitionAmount || 0),
                journalEntryId: existing.journalEntryId ? String(existing.journalEntryId) : null,
                taxObligationId: existing.taxObligationId ? String(existing.taxObligationId) : null,
                journalCreated: false,
                obligationCreated: false,
                snapshotPreserved: true,
                vatRecordPreserved: true,
                ownerIncomeUnchanged: true
            };
        }
        const company = yield Company_1.Company.findById(input.companyId).lean();
        const property = yield Property_1.Property.findById(payment.propertyId).lean();
        const details = payment.commissionDetails || {};
        const snapshotBefore = JSON.stringify(details);
        const vat = snapshotVat(details);
        const rate = snapshotRate(details);
        const effective = ((_a = company === null || company === void 0 ? void 0 : company.taxProfile) === null || _a === void 0 ? void 0 : _a.vatRegistrationEffectiveDate)
            ? new Date(company.taxProfile.vatRegistrationEffectiveDate)
            : null;
        const receiptDate = new Date(payment.paymentDate);
        const periodClass = periodClassFor(receiptDate, effective);
        const obligation = yield TaxObligation_1.TaxObligation.findOne({
            companyId: input.companyId,
            paymentId: payment._id,
            taxType: 'VAT_ON_COMMISSION',
            reversalOf: null
        }).select('taxAmount').lean();
        const blocker = evidenceBlockers({
            periodClass,
            company,
            property,
            details,
            vat,
            rate,
            physicalBookReference: String(input.physicalBookReference || ''),
            septemberTaxTreatmentApproved: input.septemberTaxTreatmentApproved === true,
            taxTreatmentBasis: String(input.taxTreatmentBasis || ''),
            obligationAmount: obligation ? (0, money_1.roundMoney)(Number(obligation.taxAmount || 0)) : null
        });
        const baseFields = {
            referenceNumber: String(payment.referenceNumber || ''),
            receiptDate,
            periodClass,
            snapshotVatAmount: vat,
            snapshotVatRate: Number.isFinite(rate) ? rate : 0,
            recognitionAmount: vat,
            physicalBookReference: String(input.physicalBookReference || '').trim(),
            taxTreatmentBasis: String(input.taxTreatmentBasis || '').trim(),
            septemberTaxTreatmentApproved: input.septemberTaxTreatmentApproved === true,
            recognitionReason: reason
        };
        if (blocker) {
            yield saveRecognition(payment, Object.assign(Object.assign({}, baseFields), { status: 'review', blockedReason: blocker }));
            return { ok: false, status: 'review', reason: blocker, journalCreated: false, obligationCreated: false, duplicatePrevented: false };
        }
        const approvalFields = Object.assign(Object.assign({}, baseFields), { approvedBy: new mongoose_1.default.Types.ObjectId(input.approvedBy), approvedAt: new Date() });
        const recordBefore = yield VatRecord_1.VatRecord.findOne({ companyId: input.companyId, transactionId: String(payment._id) }).lean();
        const ownerBefore = yield ownerIncomeTotal(String(payment._id));
        const payable = yield vatPayableCredits(input.companyId, String(payment._id), String(payment.referenceNumber || ''));
        let journalEntryId = payable.journalEntryId;
        let journalCreated = false;
        if (Math.abs(payable.amount - vat) <= AMOUNT_TOLERANCE && payable.amount > 0) {
            journalCreated = false;
        }
        else if (payable.amount > 0) {
            yield saveRecognition(payment, Object.assign(Object.assign({}, baseFields), { status: 'review', blockedReason: 'VAT_PAYABLE_ALREADY_POSTED_FOR_A_DIFFERENT_AMOUNT' }));
            return { ok: false, status: 'review', reason: 'VAT_PAYABLE_ALREADY_POSTED_FOR_A_DIFFERENT_AMOUNT', journalCreated: false, obligationCreated: false };
        }
        else {
            try {
                const posted = yield accountingService_1.default.postTransaction({
                    companyId: input.companyId,
                    reference: `HVAT-${payment.referenceNumber}`,
                    description: `Historical VAT recognition ${payment.referenceNumber}. Amount already deducted from owner income. Physical book ${String(input.physicalBookReference).trim()}. No second owner deduction.`,
                    sourceModule: 'tax',
                    sourceId: `historical-vat:${payment._id}`,
                    transactionDate: receiptDate,
                    createdBy: input.approvedBy,
                    lines: [
                        { accountCode: chartAccounts_1.GL.RETAINED_EARNINGS, debit: vat, credit: 0, propertyId: String(payment.propertyId || '') },
                        { accountCode: chartAccounts_1.GL.VAT_PAYABLE, debit: 0, credit: vat, propertyId: String(payment.propertyId || '') }
                    ]
                });
                journalEntryId = posted.journalEntryId;
                journalCreated = true;
            }
            catch (error) {
                const code = String((error === null || error === void 0 ? void 0 : error.code) || '');
                if (code.startsWith('PERIOD_')) {
                    yield saveRecognition(payment, Object.assign(Object.assign({}, approvalFields), { status: 'approved', blockedReason: code }));
                    return { ok: false, status: 'approved', reason: code, journalCreated: false, obligationCreated: false };
                }
                throw error;
            }
        }
        const snapshotAfter = yield Payment_1.Payment.findById(payment._id).select('commissionDetails').lean();
        const recordAfter = yield VatRecord_1.VatRecord.findOne({ companyId: input.companyId, transactionId: String(payment._id) }).lean();
        const ownerAfter = yield ownerIncomeTotal(String(payment._id));
        const snapshotPreserved = JSON.stringify((snapshotAfter === null || snapshotAfter === void 0 ? void 0 : snapshotAfter.commissionDetails) || {}) === snapshotBefore;
        const vatRecordPreserved = JSON.stringify(recordBefore || null) === JSON.stringify(recordAfter || null);
        const ownerIncomeUnchanged = ownerAfter === ownerBefore;
        if (!snapshotPreserved || !vatRecordPreserved || !ownerIncomeUnchanged) {
            yield saveRecognition(payment, Object.assign(Object.assign({}, baseFields), { status: 'review', blockedReason: 'HISTORICAL_RECORD_CHANGED_DURING_RECOGNITION', journalEntryId: journalEntryId ? new mongoose_1.default.Types.ObjectId(journalEntryId) : undefined }));
            return { ok: false, status: 'review', reason: 'HISTORICAL_RECORD_CHANGED_DURING_RECOGNITION', journalCreated, obligationCreated: false, snapshotPreserved, vatRecordPreserved, ownerIncomeUnchanged };
        }
        const obligationId = yield (0, taxObligationService_1.upsertPaymentTaxObligation)({
            companyId: input.companyId,
            taxType: 'VAT_ON_COMMISSION',
            paymentId: String(payment._id),
            propertyId: payment.propertyId ? String(payment.propertyId) : undefined,
            taxPeriod: `${receiptDate.getUTCFullYear()}-${String(receiptDate.getUTCMonth() + 1).padStart(2, '0')}`,
            transactionDate: receiptDate,
            currency: payment.currency || 'USD',
            taxableAmount: (0, money_1.roundMoney)(Number((_c = (_b = details.totalCommission) !== null && _b !== void 0 ? _b : details.commissionNet) !== null && _c !== void 0 ? _c : 0)),
            taxRate: rate,
            taxAmount: vat,
            calculationBasis: 'HISTORICAL_VAT_RECOGNITION',
            calculationSnapshot: {
                physicalBookReference: String(input.physicalBookReference).trim(),
                approvedBy: input.approvedBy,
                periodClass,
                ownerIncomeDeductedAgain: false
            },
            status: 'PAYABLE',
            glAccount: chartAccounts_1.GL.VAT_PAYABLE,
            sourceLedger: 'historical-vat-recognition',
            createdBy: input.approvedBy,
            journalEntryId: journalEntryId || undefined
        });
        const saved = yield saveRecognition(payment, Object.assign(Object.assign({}, approvalFields), { status: 'recognised', blockedReason: '', recognisedAt: new Date(), journalEntryId: journalEntryId ? new mongoose_1.default.Types.ObjectId(journalEntryId) : undefined, taxObligationId: obligationId ? new mongoose_1.default.Types.ObjectId(obligationId) : undefined }));
        return {
            ok: true,
            status: 'recognised',
            reason: 'RECOGNISED',
            duplicatePrevented: false,
            recognitionAmount: vat,
            journalEntryId,
            taxObligationId: obligationId,
            journalCreated,
            obligationCreated: Boolean(obligationId),
            snapshotPreserved,
            vatRecordPreserved,
            ownerIncomeUnchanged,
            recognitionId: (saved === null || saved === void 0 ? void 0 : saved._id) ? String(saved._id) : null
        };
    });
}
function rejectHistoricalVat(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const reason = String(input.reason || '').trim();
        if (reason.length < 10)
            return { ok: false, status: 'blocked', reason: 'REJECTION_REASON_REQUIRED' };
        const payment = yield Payment_1.Payment.findOne({ _id: input.paymentId, companyId: input.companyId }).select('_id companyId referenceNumber paymentDate commissionDetails').lean();
        if (!payment)
            return { ok: false, status: 'blocked', reason: 'PAYMENT_NOT_FOUND' };
        const existing = yield HistoricalVatRecognition_1.HistoricalVatRecognition.findOne({ companyId: input.companyId, paymentId: payment._id }).lean();
        if ((existing === null || existing === void 0 ? void 0 : existing.status) === 'recognised') {
            return { ok: false, status: 'recognised', reason: 'RECOGNISED_AMOUNT_IS_NOT_REJECTED_HERE', duplicatePrevented: true };
        }
        const company = yield Company_1.Company.findById(input.companyId).select('taxProfile.vatRegistrationEffectiveDate').lean();
        const effective = ((_a = company === null || company === void 0 ? void 0 : company.taxProfile) === null || _a === void 0 ? void 0 : _a.vatRegistrationEffectiveDate)
            ? new Date(company.taxProfile.vatRegistrationEffectiveDate)
            : null;
        const details = payment.commissionDetails || {};
        yield saveRecognition(payment, {
            referenceNumber: String(payment.referenceNumber || ''),
            receiptDate: new Date(payment.paymentDate),
            periodClass: periodClassFor(new Date(payment.paymentDate), effective),
            snapshotVatAmount: snapshotVat(details),
            snapshotVatRate: Number.isFinite(snapshotRate(details)) ? snapshotRate(details) : 0,
            recognitionAmount: snapshotVat(details),
            status: 'rejected',
            recognitionReason: reason,
            blockedReason: 'REJECTED',
            rejectedBy: new mongoose_1.default.Types.ObjectId(input.rejectedBy),
            rejectedAt: new Date()
        });
        return { ok: true, status: 'rejected', reason: 'REJECTED', journalCreated: false, obligationCreated: false };
    });
}
