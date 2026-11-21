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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VAT_RECORD_AMOUNT_DISAGREES = exports.HISTORICAL_VAT_RECORD_RATE_UNSUPPORTED = exports.HISTORICAL_VAT_JOURNAL_REVIEW_REQUIRED = exports.HISTORICAL_VAT_OBLIGATION_APPROVAL_REQUIRED = exports.VAT_RATE_UNAVAILABLE_MESSAGE = exports.VAT_RATE_UNAVAILABLE_CODE = void 0;
exports.companyVatRegistrationFromDoc = companyVatRegistrationFromDoc;
exports.loadCompanyVatRegistration = loadCompanyVatRegistration;
exports.stampVatDecision = stampVatDecision;
exports.resolveCommissionVatPolicy = resolveCommissionVatPolicy;
exports.commissionVatConfigurationGap = commissionVatConfigurationGap;
exports.centralVatRateBlock = centralVatRateBlock;
exports.authoritativeSnapshotVatRate = authoritativeSnapshotVatRate;
exports.commissionVatFlagsFromPolicy = commissionVatFlagsFromPolicy;
exports.resolveSaleVatPolicy = resolveSaleVatPolicy;
exports.assessVatObligationCreation = assessVatObligationCreation;
exports.assessVatPayableJournal = assessVatPayableJournal;
exports.commissionVatSnapshotGap = commissionVatSnapshotGap;
exports.loadCgtRates = loadCgtRates;
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const VatRecord_1 = require("../models/VatRecord");
const taxRateService_1 = require("./taxRateService");
const vatApplicability_1 = require("./tax/vatApplicability");
const propertyCommissionCalculator_1 = require("./propertyCommissionCalculator");
const money_1 = require("../utils/money");
function companyVatRegistrationFromDoc(company) {
    var _a;
    const profile = (company === null || company === void 0 ? void 0 : company.taxProfile) || {};
    if (typeof profile.vatRegistered === 'boolean') {
        return {
            vatRegistered: Boolean(profile.vatRegistered),
            vatRegistrationEffectiveDate: profile.vatRegistrationEffectiveDate || null,
            vatRegistrationCancelledAt: profile.vatRegistrationCancelledAt || null,
            vatCategory: (_a = profile.vatCategory) !== null && _a !== void 0 ? _a : null
        };
    }
    // Legacy: a VAT number alone is not treated as registration on a date.
    return {
        vatRegistered: false,
        vatRegistrationEffectiveDate: null,
        vatRegistrationCancelledAt: null
    };
}
function loadCompanyVatRegistration(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!companyId)
            return { vatRegistered: false };
        const company = yield Company_1.Company.findById(companyId).select('taxProfile vatNumber').lean();
        return companyVatRegistrationFromDoc(company);
    });
}
const asDateOrNull = (value) => {
    if (!value)
        return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
};
function stampVatDecision(snapshot, policy) {
    var _a, _b, _c;
    if (!snapshot || !(policy === null || policy === void 0 ? void 0 : policy.decision))
        return snapshot;
    return Object.assign(Object.assign({}, snapshot), { vatDecision: Object.assign(Object.assign({}, policy.decision), { commissionBase: (_a = snapshot.commissionBase) !== null && _a !== void 0 ? _a : policy.decision.commissionBase, vatAmount: (_c = (_b = snapshot.vatAmount) !== null && _b !== void 0 ? _b : snapshot.vatOnCommission) !== null && _c !== void 0 ? _c : policy.decision.vatAmount }) });
}
function resolveCommissionVatPolicy(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const property = input.property || {};
        const requested = input.requestedVatOnCommission != null
            ? Boolean(input.requestedVatOnCommission)
            : Boolean(property.vatOnCommission);
        const company = yield loadCompanyVatRegistration(input.companyId);
        const applicability = (0, vatApplicability_1.evaluateVatApplicability)({
            company,
            transactionDate: input.paymentDate,
            supplyTreatment: 'STANDARD_TAXABLE',
            useClass: 'AGENCY_COMMISSION',
            requested
        });
        let treatment = 'NONE';
        if (input.commissionType === 'introduction' && requested) {
            treatment = 'COMMISSION_VAT_INCLUSIVE';
        }
        else if (requested) {
            const normalized = (0, propertyCommissionCalculator_1.normalizeVatCommissionTreatment)(true, input.requestedTreatment || property.vatCommissionTreatment);
            treatment = normalized === 'inclusive' ? 'COMMISSION_VAT_INCLUSIVE' : 'COMMISSION_VAT_EXCLUSIVE';
        }
        const lookedUp = yield (0, taxRateService_1.getVatRateForDate)(input.companyId, input.paymentDate).catch(() => ({
            percent: 0,
            decimal: 0,
            source: 'none',
            jurisdiction: undefined,
            taxRateId: undefined,
            effectiveFrom: undefined
        }));
        const applied = applicability.vatApplies && lookedUp.decimal > 0 && lookedUp.source !== 'none';
        const appliedTreatment = !applied
            ? 'none'
            : (treatment === 'COMMISSION_VAT_INCLUSIVE' ? 'inclusive' : 'exclusive');
        const reason = applicability.vatApplies && !applied
            ? 'vat_rate_missing_on_transaction_date'
            : applicability.reason;
        const decision = {
            registrationStatus: Boolean(company.vatRegistered),
            registrationEffectiveDate: asDateOrNull(company.vatRegistrationEffectiveDate),
            registrationCancelledAt: asDateOrNull(company.vatRegistrationCancelledAt),
            taxClassification: 'STANDARD_TAXABLE',
            centralVatRate: Number(lookedUp.decimal || 0),
            taxRateEffectiveDate: asDateOrNull(lookedUp.effectiveFrom),
            propertyVatApplicable: Boolean(property.vatOnCommission),
            treatment: appliedTreatment,
            reason
        };
        if (!applicability.vatApplies) {
            return {
                apply: false,
                vatRate: 0,
                treatment: 'NONE',
                reason: applicability.reason,
                reviewRequired: applicability.reviewRequired,
                reviewReason: applicability.reviewReason,
                decision
            };
        }
        if (!applied) {
            return {
                apply: false,
                vatRate: 0,
                treatment: 'NONE',
                reason: 'vat_rate_missing_on_transaction_date',
                reviewRequired: true,
                reviewReason: 'VAT_RATE_MISSING',
                jurisdiction: lookedUp.jurisdiction,
                decision
            };
        }
        const configurationGap = commissionVatConfigurationGap({
            requested,
            vatCategory: company.vatCategory,
            treatment: input.requestedTreatment || property.vatCommissionTreatment
        });
        if (configurationGap) {
            decision.reason = configurationGap.reason;
            decision.treatment = 'none';
            return {
                apply: false,
                vatRate: 0,
                treatment: 'NONE',
                reason: configurationGap.reason,
                reviewRequired: true,
                reviewReason: configurationGap.reviewReason,
                jurisdiction: lookedUp.jurisdiction,
                decision
            };
        }
        return {
            apply: true,
            vatRate: lookedUp.decimal,
            treatment,
            reason: applicability.reason,
            reviewRequired: applicability.reviewRequired,
            reviewReason: applicability.reviewReason,
            taxRateId: lookedUp.taxRateId,
            jurisdiction: lookedUp.jurisdiction,
            decision
        };
    });
}
function commissionVatConfigurationGap(input) {
    if (!input.requested)
        return null;
    const category = String(input.vatCategory || '').trim();
    const treatment = String(input.treatment || '').trim().toLowerCase();
    if (!category) {
        return { reason: 'vat_category_not_configured', reviewReason: 'VAT_CONFIGURATION_INCOMPLETE' };
    }
    if (treatment !== 'inclusive' && treatment !== 'exclusive') {
        return { reason: 'vat_treatment_not_configured', reviewReason: 'VAT_CONFIGURATION_INCOMPLETE' };
    }
    return null;
}
exports.VAT_RATE_UNAVAILABLE_CODE = 'VAT_RATE_UNAVAILABLE';
exports.VAT_RATE_UNAVAILABLE_MESSAGE = 'No centrally managed VAT rate applies on the payment date. The payment was not saved.';
function centralVatRateBlock(policy) {
    if (policy.reason === 'vat_rate_missing_on_transaction_date') {
        return { code: exports.VAT_RATE_UNAVAILABLE_CODE, message: exports.VAT_RATE_UNAVAILABLE_MESSAGE };
    }
    return null;
}
/** The payment snapshot rate is authoritative. An absent snapshot rate may use the payment flag. */
function authoritativeSnapshotVatRate(payment) {
    const details = (payment === null || payment === void 0 ? void 0 : payment.commissionDetails) || {};
    if (details.vatRate != null && details.vatRate !== '') {
        const snapshot = Number(details.vatRate);
        return Number.isFinite(snapshot) ? snapshot : 0;
    }
    const flagged = Number(payment === null || payment === void 0 ? void 0 : payment.vatOnCommissionRate);
    return Number.isFinite(flagged) ? flagged : 0;
}
function commissionVatFlagsFromPolicy(policy) {
    if (!policy.apply || policy.treatment === 'NONE') {
        return { vatOnCommission: false, vatRate: 0 };
    }
    return {
        vatOnCommission: true,
        vatTreatment: policy.treatment === 'COMMISSION_VAT_INCLUSIVE' ? 'inclusive' : 'exclusive',
        vatRate: policy.vatRate
    };
}
function resolveSaleVatPolicy(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const property = input.property || {};
        const useClass = property.propertyUseClass
            || (String(property.type || '').toLowerCase() === 'commercial' ? 'COMMERCIAL' : 'SALE');
        const supplyTreatment = property.saleVatTreatment
            || property.vatSupplyTreatment
            || (0, vatApplicability_1.defaultSupplyTreatment)(useClass);
        const company = yield loadCompanyVatRegistration(input.companyId);
        const applicability = (0, vatApplicability_1.evaluateVatApplicability)({
            company,
            transactionDate: input.paymentDate,
            supplyTreatment,
            useClass,
            requested: input.vatIncludedRequested
        });
        const lookedUp = yield (0, taxRateService_1.getVatRateForDate)(input.companyId, input.paymentDate);
        if (applicability.vatApplies && !(lookedUp.decimal > 0)) {
            return {
                apply: false,
                vatRate: 0,
                reason: 'vat_rate_missing_on_transaction_date',
                reviewRequired: true,
                reviewReason: 'VAT_RATE_MISSING',
                supplyTreatment
            };
        }
        return {
            apply: applicability.vatApplies && lookedUp.decimal > 0,
            vatRate: applicability.vatApplies ? lookedUp.decimal : 0,
            reason: applicability.reason,
            reviewRequired: applicability.reviewRequired,
            reviewReason: applicability.reviewReason,
            supplyTreatment
        };
    });
}
/**
 * Eligible commission (property flag, company registered on the payment date, central rate)
 * must keep its own VAT snapshot. A zero snapshot is a posting gap. Ineligible commission
 * with a positive VAT snapshot is also a gap. This does not recalculate or rewrite amounts.
 */
exports.HISTORICAL_VAT_OBLIGATION_APPROVAL_REQUIRED = 'HISTORICAL_VAT_OBLIGATION_APPROVAL_REQUIRED';
exports.HISTORICAL_VAT_JOURNAL_REVIEW_REQUIRED = 'HISTORICAL_VAT_JOURNAL_REVIEW_REQUIRED';
exports.HISTORICAL_VAT_RECORD_RATE_UNSUPPORTED = 'HISTORICAL_VAT_RECORD_RATE_UNSUPPORTED';
exports.VAT_RECORD_AMOUNT_DISAGREES = 'VAT_RECORD_AMOUNT_DISAGREES';
const CONTEMPORANEOUS_VAT_DECISION = 'standard_taxable_registered';
/**
 * A VAT obligation is created only when the receipt date is eligible under the
 * company registration, VAT category, property flag, and treatment.
 * A stored snapshot amount is not enough. A historical receipt whose own VAT
 * decision does not record that eligibility also needs an explicit accountant
 * approval. This function does not write a snapshot, VAT record, or obligation.
 */
function assessVatObligationCreation(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const payment = input.payment;
        const vat = Number((_d = (_b = (_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) !== null && _b !== void 0 ? _b : (_c = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.vatAmount) !== null && _d !== void 0 ? _d : 0);
        if (!(vat > 0.005))
            return { create: false, reason: 'no_commission_vat' };
        if (!(payment === null || payment === void 0 ? void 0 : payment.companyId) || !(payment === null || payment === void 0 ? void 0 : payment.propertyId)) {
            return { create: false, reason: 'vat_context_incomplete' };
        }
        const property = yield Property_1.Property.findById(payment.propertyId)
            .select('vatOnCommission vatCommissionTreatment rentalType')
            .lean();
        const policy = yield resolveCommissionVatPolicy({
            companyId: String(payment.companyId),
            paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
            property: property || {},
            requestedVatOnCommission: Boolean(property === null || property === void 0 ? void 0 : property.vatOnCommission),
            requestedTreatment: property === null || property === void 0 ? void 0 : property.vatCommissionTreatment,
            commissionType: String((property === null || property === void 0 ? void 0 : property.rentalType) || payment.paymentType || '').toLowerCase() === 'introduction'
                ? 'introduction'
                : 'management'
        });
        if (!policy.apply) {
            return { create: false, reason: policy.reason || 'vat_not_eligible_on_receipt_date' };
        }
        const decisionReason = String(((_f = (_e = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _e === void 0 ? void 0 : _e.vatDecision) === null || _f === void 0 ? void 0 : _f.reason) || '');
        if (decisionReason === CONTEMPORANEOUS_VAT_DECISION) {
            return { create: true, reason: 'receipt_date_eligibility_established' };
        }
        if (input.approveHistoricalVatObligation === true) {
            return { create: true, reason: 'accountant_approved_historical_vat_obligation' };
        }
        return { create: false, reason: exports.HISTORICAL_VAT_OBLIGATION_APPROVAL_REQUIRED };
    });
}
/**
 * A VAT payable journal line needs the same eligibility as an obligation, and
 * the amount must already agree with any VAT record. A snapshot amount is not
 * authority. A stored rate of zero is not replaced by the snapshot rate.
 * This function does not write a journal, VAT record, snapshot, or obligation.
 */
function assessVatPayableJournal(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const payment = input.payment;
        const snapshotAmount = (0, money_1.roundMoney)(Number((_d = (_b = (_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) !== null && _b !== void 0 ? _b : (_c = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.vatAmount) !== null && _d !== void 0 ? _d : 0));
        const decision = yield assessVatObligationCreation(input);
        if (!decision.create) {
            return { recognise: false, reason: decision.reason || exports.HISTORICAL_VAT_JOURNAL_REVIEW_REQUIRED, amount: 0, rate: 0 };
        }
        const snapshotRate = authoritativeSnapshotVatRate(payment);
        const record = yield VatRecord_1.VatRecord.findOne({
            companyId: payment.companyId,
            transactionId: String(payment._id)
        }).select('vatCollected vatRate').lean();
        if (record) {
            const recordRate = Number(record.vatRate);
            const recordAmount = (0, money_1.roundMoney)(Number(record.vatCollected || 0));
            if (!Number.isFinite(recordRate) || recordRate <= 0) {
                return { recognise: false, reason: exports.HISTORICAL_VAT_RECORD_RATE_UNSUPPORTED, amount: 0, rate: 0 };
            }
            if (Math.abs(recordAmount - snapshotAmount) > 0.009 || Math.abs(recordRate - snapshotRate) > 0.0001) {
                return { recognise: false, reason: exports.VAT_RECORD_AMOUNT_DISAGREES, amount: 0, rate: 0 };
            }
            return { recognise: true, reason: decision.reason, amount: recordAmount, rate: recordRate };
        }
        return { recognise: true, reason: decision.reason, amount: snapshotAmount, rate: snapshotRate };
    });
}
function commissionVatSnapshotGap(payment) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        if (!payment || payment.reversalOfPaymentId)
            return null;
        if (String(payment.status || '') !== 'completed' || payment.isProvisional === true)
            return null;
        const paymentType = String(payment.paymentType || '');
        if (paymentType === 'sale')
            return null;
        const details = payment.commissionDetails || {};
        const commission = Number((_b = (_a = details.commissionNet) !== null && _a !== void 0 ? _a : details.totalCommission) !== null && _b !== void 0 ? _b : 0);
        const vat = Number((_d = (_c = details.vatOnCommission) !== null && _c !== void 0 ? _c : details.vatAmount) !== null && _d !== void 0 ? _d : 0);
        if (!(commission > 0) || !payment.propertyId || !payment.companyId)
            return null;
        const property = yield Property_1.Property.findById(payment.propertyId).select('vatOnCommission vatCommissionTreatment rentalType').lean();
        if (!property || !property.vatOnCommission) {
            if (vat > 0.005) {
                return {
                    code: 'VAT_ON_INELIGIBLE_COMMISSION',
                    detail: 'VAT on commission is stored on a property that does not have VAT on commission enabled.'
                };
            }
            return null;
        }
        const policy = yield resolveCommissionVatPolicy({
            companyId: String(payment.companyId),
            paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
            property,
            requestedVatOnCommission: true,
            requestedTreatment: property.vatCommissionTreatment,
            commissionType: String(property.rentalType || '').toLowerCase() === 'introduction' ? 'introduction' : 'management'
        });
        if (!policy.apply) {
            if (vat > 0.005) {
                return {
                    code: 'VAT_CHARGED_WHILE_NOT_APPLICABLE',
                    detail: `VAT on commission ${vat.toFixed(2)} was stored while applicability is ${policy.reason}.`
                };
            }
            return null;
        }
        if (!(vat > 0.005)) {
            return {
                code: 'MISSING_VAT_ON_ELIGIBLE_COMMISSION',
                detail: 'This payment has commission and VAT on commission is applicable, but the VAT snapshot is missing.'
            };
        }
        return null;
    });
}
function loadCgtRates(companyId, onDate) {
    return __awaiter(this, void 0, void 0, function* () {
        const [cgt, cgwt] = yield Promise.all([
            (0, taxRateService_1.getTaxRateForDate)(companyId, 'CGT', onDate).catch(() => ({ decimal: 0 })),
            (0, taxRateService_1.getTaxRateForDate)(companyId, 'CGWT', onDate).catch(() => ({ decimal: 0 }))
        ]);
        return { cgtRate: Number(cgt.decimal || 0), cgwtRate: Number(cgwt.decimal || 0) };
    });
}
