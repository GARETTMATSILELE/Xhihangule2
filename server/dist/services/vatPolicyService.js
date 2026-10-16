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
exports.VAT_RATE_UNAVAILABLE_MESSAGE = exports.VAT_RATE_UNAVAILABLE_CODE = void 0;
exports.companyVatRegistrationFromDoc = companyVatRegistrationFromDoc;
exports.loadCompanyVatRegistration = loadCompanyVatRegistration;
exports.stampVatDecision = stampVatDecision;
exports.resolveCommissionVatPolicy = resolveCommissionVatPolicy;
exports.centralVatRateBlock = centralVatRateBlock;
exports.commissionVatFlagsFromPolicy = commissionVatFlagsFromPolicy;
exports.resolveSaleVatPolicy = resolveSaleVatPolicy;
exports.commissionVatSnapshotGap = commissionVatSnapshotGap;
exports.loadCgtRates = loadCgtRates;
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const taxRateService_1 = require("./taxRateService");
const vatApplicability_1 = require("./tax/vatApplicability");
const propertyCommissionCalculator_1 = require("./propertyCommissionCalculator");
function companyVatRegistrationFromDoc(company) {
    const profile = (company === null || company === void 0 ? void 0 : company.taxProfile) || {};
    if (typeof profile.vatRegistered === 'boolean') {
        return {
            vatRegistered: Boolean(profile.vatRegistered),
            vatRegistrationEffectiveDate: profile.vatRegistrationEffectiveDate || null,
            vatRegistrationCancelledAt: profile.vatRegistrationCancelledAt || null
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
exports.VAT_RATE_UNAVAILABLE_CODE = 'VAT_RATE_UNAVAILABLE';
exports.VAT_RATE_UNAVAILABLE_MESSAGE = 'No centrally managed VAT rate applies on the payment date. The payment was not saved.';
function centralVatRateBlock(policy) {
    if (policy.reason === 'vat_rate_missing_on_transaction_date') {
        return { code: exports.VAT_RATE_UNAVAILABLE_CODE, message: exports.VAT_RATE_UNAVAILABLE_MESSAGE };
    }
    return null;
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
