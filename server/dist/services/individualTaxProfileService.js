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
exports.individualTaxProfileService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const IndividualTaxProfile_1 = require("../models/IndividualTaxProfile");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const errorHandler_1 = require("../middleware/errorHandler");
const vatApplicability_1 = require("./tax/vatApplicability");
const taxTypes_1 = require("./tax/taxTypes");
const rentalTaxTypes_1 = require("./tax/rentalTaxTypes");
const taxRuleRegistry_1 = require("./taxRuleRegistry");
function asObjectId(value, label = 'id') {
    if (!mongoose_1.default.Types.ObjectId.isValid(value))
        throw new errorHandler_1.AppError(`Invalid ${label}`, 400);
    return new mongoose_1.default.Types.ObjectId(value);
}
function isoDate(value) {
    if (!value)
        return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    return date.toISOString().slice(0, 10);
}
function optionalDate(value) {
    if (value === undefined)
        return undefined;
    if (value === null || value === '')
        return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        throw new errorHandler_1.AppError('Invalid date', 400);
    return date;
}
function optionalString(value) {
    if (value === undefined)
        return undefined;
    return String(value || '').trim();
}
function isUseClass(value) {
    return typeof value === 'string' && taxTypes_1.PROPERTY_USE_CLASSES.includes(value);
}
function isVatTreatment(value) {
    return typeof value === 'string' && taxTypes_1.VAT_SUPPLY_TREATMENTS.includes(value);
}
function writeAudit(input) {
    return __awaiter(this, void 0, void 0, function* () {
        yield AccountingEventLog_1.AccountingEventLog.create({
            companyId: asObjectId(input.companyId, 'companyId'),
            eventType: input.eventType,
            sourceModule: 'individual_tax_profile',
            sourceId: input.sourceId,
            success: true,
            message: input.message,
            metadata: input.metadata
        });
    });
}
function propertyReviewReasons(input) {
    const reasons = [];
    if (!input.propertyUseClass)
        reasons.push('MISSING_PROPERTY_TAX_CLASSIFICATION');
    if (!input.vatSupplyTreatment || input.vatSupplyTreatment === 'ACCOUNTANT_REVIEW')
        reasons.push('VAT_REVIEW_REQUIRED');
    if (!input.rentalTaxTreatment || input.rentalTaxTreatment === 'ACCOUNTANT_REVIEW')
        reasons.push('TAX_TREATMENT_REVIEW_REQUIRED');
    return reasons;
}
exports.individualTaxProfileService = {
    getOwnerProfile(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const company = yield Company_1.Company.findById(asObjectId(companyId, 'companyId'));
            if (!company)
                throw new errorHandler_1.AppError('Company not found', 404);
            const stored = yield IndividualTaxProfile_1.IndividualTaxProfile.findOne({ companyId: company._id });
            const rules = yield (0, taxRuleRegistry_1.listTaxRules)();
            const taxProfile = company.taxProfile || {};
            return {
                companyId: String(company._id),
                userId: (stored === null || stored === void 0 ? void 0 : stored.userId) ? String(stored.userId) : company.ownerId ? String(company.ownerId) : null,
                taxpayerType: (0, rentalTaxTypes_1.isTaxpayerType)(stored === null || stored === void 0 ? void 0 : stored.taxpayerType) ? stored.taxpayerType : 'INDIVIDUAL',
                legalName: (stored === null || stored === void 0 ? void 0 : stored.legalName) || company.name || '',
                tradingName: (stored === null || stored === void 0 ? void 0 : stored.tradingName) || company.tradingName || '',
                nationalIdOrCompanyRegistrationReference: (stored === null || stored === void 0 ? void 0 : stored.nationalIdOrCompanyRegistrationReference) || company.registrationNumber || '',
                tin: company.tinNumber || '',
                vatRegistered: Boolean(taxProfile.vatRegistered),
                vatNumber: company.vatNumber || '',
                vatRegistrationDate: isoDate(taxProfile.vatRegistrationEffectiveDate),
                vatRegistrationCancelledAt: isoDate(taxProfile.vatRegistrationCancelledAt),
                vatCategory: taxProfile.vatCategory || '',
                incomeTaxRegistered: Boolean(stored === null || stored === void 0 ? void 0 : stored.incomeTaxRegistered),
                incomeTaxRegistrationDate: isoDate(stored === null || stored === void 0 ? void 0 : stored.incomeTaxRegistrationDate),
                rentalTaxRegime: (0, rentalTaxTypes_1.normalizeRentalTaxRegime)(stored === null || stored === void 0 ? void 0 : stored.rentalTaxRegime),
                rentalTaxRegistrationDate: isoDate(stored === null || stored === void 0 ? void 0 : stored.rentalTaxRegistrationDate),
                taxResidence: (stored === null || stored === void 0 ? void 0 : stored.taxResidence) || 'ZW',
                taxYearStartMonth: Number((stored === null || stored === void 0 ? void 0 : stored.taxYearStartMonth) || 1),
                accountantName: (stored === null || stored === void 0 ? void 0 : stored.accountantName) || '',
                accountantContact: (stored === null || stored === void 0 ? void 0 : stored.accountantContact) || '',
                taxNotes: (stored === null || stored === void 0 ? void 0 : stored.taxNotes) || '',
                profileVersion: Number((stored === null || stored === void 0 ? void 0 : stored.version) || 1),
                workspaceType: company.workspaceType || null,
                rentalTaxRegimeInferredFromWorkspace: false,
                configuredTaxRules: rules,
                disclaimer: rentalTaxTypes_1.TAX_DISCLAIMER
            };
        });
    },
    updateOwnerProfile(companyId, userId, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const company = yield Company_1.Company.findById(asObjectId(companyId, 'companyId'));
            if (!company)
                throw new errorHandler_1.AppError('Company not found', 404);
            const before = yield this.getOwnerProfile(companyId);
            const rentalTaxRegime = payload.rentalTaxRegime === undefined
                ? undefined
                : (0, rentalTaxTypes_1.normalizeRentalTaxRegime)(payload.rentalTaxRegime);
            const taxpayerType = payload.taxpayerType === undefined
                ? undefined
                : (0, rentalTaxTypes_1.isTaxpayerType)(payload.taxpayerType)
                    ? payload.taxpayerType
                    : (() => { throw new errorHandler_1.AppError('Invalid taxpayerType', 400); })();
            const taxYearStartMonth = payload.taxYearStartMonth === undefined
                ? undefined
                : Number(payload.taxYearStartMonth);
            if (taxYearStartMonth !== undefined && (!Number.isInteger(taxYearStartMonth) || taxYearStartMonth < 1 || taxYearStartMonth > 12)) {
                throw new errorHandler_1.AppError('taxYearStartMonth must be 1–12', 400);
            }
            const profileSet = {
                userId: asObjectId(userId, 'userId')
            };
            if (taxpayerType !== undefined)
                profileSet.taxpayerType = taxpayerType;
            const legalName = optionalString(payload.legalName);
            if (legalName !== undefined)
                profileSet.legalName = legalName;
            const tradingName = optionalString(payload.tradingName);
            if (tradingName !== undefined)
                profileSet.tradingName = tradingName;
            const nationalId = optionalString(payload.nationalIdOrCompanyRegistrationReference);
            if (nationalId !== undefined)
                profileSet.nationalIdOrCompanyRegistrationReference = nationalId;
            if (payload.incomeTaxRegistered !== undefined)
                profileSet.incomeTaxRegistered = Boolean(payload.incomeTaxRegistered);
            const incomeTaxRegistrationDate = optionalDate(payload.incomeTaxRegistrationDate);
            if (incomeTaxRegistrationDate !== undefined)
                profileSet.incomeTaxRegistrationDate = incomeTaxRegistrationDate;
            if (rentalTaxRegime !== undefined)
                profileSet.rentalTaxRegime = rentalTaxRegime;
            const rentalTaxRegistrationDate = optionalDate(payload.rentalTaxRegistrationDate);
            if (rentalTaxRegistrationDate !== undefined)
                profileSet.rentalTaxRegistrationDate = rentalTaxRegistrationDate;
            const taxResidence = optionalString(payload.taxResidence);
            if (taxResidence !== undefined)
                profileSet.taxResidence = taxResidence;
            if (taxYearStartMonth !== undefined)
                profileSet.taxYearStartMonth = taxYearStartMonth;
            const accountantName = optionalString(payload.accountantName);
            if (accountantName !== undefined)
                profileSet.accountantName = accountantName;
            const accountantContact = optionalString(payload.accountantContact);
            if (accountantContact !== undefined)
                profileSet.accountantContact = accountantContact;
            const taxNotes = optionalString(payload.taxNotes);
            if (taxNotes !== undefined)
                profileSet.taxNotes = taxNotes;
            yield IndividualTaxProfile_1.IndividualTaxProfile.updateOne({ companyId: company._id }, { $set: profileSet, $setOnInsert: { companyId: company._id }, $inc: { version: 1 } }, { upsert: true, setDefaultsOnInsert: true });
            const companySet = {};
            const tin = optionalString(payload.tin);
            if (tin !== undefined)
                companySet.tinNumber = tin;
            const vatNumber = optionalString(payload.vatNumber);
            if (vatNumber !== undefined)
                companySet.vatNumber = vatNumber;
            const trading = optionalString(payload.tradingName);
            if (trading !== undefined)
                companySet.tradingName = trading;
            if (payload.vatRegistered !== undefined)
                companySet['taxProfile.vatRegistered'] = Boolean(payload.vatRegistered);
            const vatRegistrationDate = optionalDate(payload.vatRegistrationDate);
            if (vatRegistrationDate !== undefined)
                companySet['taxProfile.vatRegistrationEffectiveDate'] = vatRegistrationDate;
            const vatCancelled = optionalDate(payload.vatRegistrationCancelledAt);
            if (vatCancelled !== undefined)
                companySet['taxProfile.vatRegistrationCancelledAt'] = vatCancelled;
            const vatCategory = optionalString(payload.vatCategory);
            if (vatCategory !== undefined)
                companySet['taxProfile.vatCategory'] = vatCategory;
            if (Object.keys(companySet).length) {
                yield Company_1.Company.updateOne({ _id: company._id }, { $set: companySet });
            }
            yield (0, taxRuleRegistry_1.ensureSystemTaxRules)();
            const after = yield this.getOwnerProfile(companyId);
            yield writeAudit({
                companyId,
                eventType: 'TAX_PROFILE_UPDATED',
                sourceId: companyId,
                message: 'Updated individual landlord tax profile',
                metadata: { before, after, userId }
            });
            return after;
        });
    },
    getPropertyProfile(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const property = yield Property_1.Property.findOne({
                _id: asObjectId(propertyId, 'propertyId'),
                companyId: asObjectId(companyId, 'companyId'),
                isDeleted: { $ne: true }
            });
            if (!property)
                throw new errorHandler_1.AppError('Property not found', 404);
            const useClass = isUseClass(property.propertyUseClass) ? property.propertyUseClass : null;
            const storedTreatment = isVatTreatment(property.vatSupplyTreatment) ? property.vatSupplyTreatment : null;
            const vatSupplyTreatment = storedTreatment || (useClass ? (0, vatApplicability_1.defaultSupplyTreatment)(useClass) : 'ACCOUNTANT_REVIEW');
            const rentalTaxTreatment = (0, rentalTaxTypes_1.normalizeRentalTaxRegime)(property.rentalTaxTreatment);
            const reviewReasons = propertyReviewReasons({
                propertyUseClass: useClass,
                vatSupplyTreatment: storedTreatment || vatSupplyTreatment,
                rentalTaxTreatment: property.rentalTaxTreatment
            });
            return {
                propertyId: String(property._id),
                ownerUserId: property.ownerId ? String(property.ownerId) : null,
                companyId: String(property.companyId),
                propertyName: property.name,
                propertyUseClass: useClass,
                vatSupplyTreatment,
                vatEffectiveFrom: isoDate(property.vatEffectiveFrom),
                vatEffectiveTo: isoDate(property.vatEffectiveTo),
                rentalTaxTreatment,
                rentalTaxEffectiveFrom: isoDate(property.rentalTaxEffectiveFrom),
                ownershipPercentage: Number((_a = property.ownershipPercentage) !== null && _a !== void 0 ? _a : 100),
                acquisitionDate: isoDate(property.acquisitionDate),
                acquisitionCost: property.acquisitionCost == null ? null : Number(property.acquisitionCost),
                improvementCost: property.improvementCosts == null ? null : Number(property.improvementCosts),
                taxNotes: String(property.taxNotes || ''),
                reviewRequired: reviewReasons.length > 0,
                reviewReasons,
                disclaimer: rentalTaxTypes_1.TAX_DISCLAIMER
            };
        });
    },
    updatePropertyProfile(companyId, userId, propertyId, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const property = yield Property_1.Property.findOne({
                _id: asObjectId(propertyId, 'propertyId'),
                companyId: asObjectId(companyId, 'companyId'),
                isDeleted: { $ne: true }
            });
            if (!property)
                throw new errorHandler_1.AppError('Property not found', 404);
            const before = yield this.getPropertyProfile(companyId, propertyId);
            const $set = {};
            if (payload.propertyUseClass !== undefined) {
                if (payload.propertyUseClass === null || payload.propertyUseClass === '') {
                    // leave unset rather than guessing a class
                }
                else if (!isUseClass(payload.propertyUseClass)) {
                    throw new errorHandler_1.AppError('Invalid propertyUseClass', 400);
                }
                else {
                    $set.propertyUseClass = payload.propertyUseClass;
                }
            }
            if (payload.vatSupplyTreatment !== undefined) {
                if (!isVatTreatment(payload.vatSupplyTreatment))
                    throw new errorHandler_1.AppError('Invalid vatSupplyTreatment', 400);
                $set.vatSupplyTreatment = payload.vatSupplyTreatment;
            }
            const vatEffectiveFrom = optionalDate(payload.vatEffectiveFrom);
            if (vatEffectiveFrom !== undefined)
                $set.vatEffectiveFrom = vatEffectiveFrom;
            if ($set.vatSupplyTreatment &&
                String($set.vatSupplyTreatment) !== String(before.vatSupplyTreatment) &&
                !$set.vatEffectiveFrom &&
                !before.vatEffectiveFrom) {
                throw new errorHandler_1.AppError('vatEffectiveFrom is required when changing VAT treatment', 400);
            }
            const vatEffectiveTo = optionalDate(payload.vatEffectiveTo);
            if (vatEffectiveTo !== undefined)
                $set.vatEffectiveTo = vatEffectiveTo;
            if (payload.rentalTaxTreatment !== undefined) {
                $set.rentalTaxTreatment = (0, rentalTaxTypes_1.normalizeRentalTaxRegime)(payload.rentalTaxTreatment);
            }
            const rentalTaxEffectiveFrom = optionalDate(payload.rentalTaxEffectiveFrom);
            if (rentalTaxEffectiveFrom !== undefined)
                $set.rentalTaxEffectiveFrom = rentalTaxEffectiveFrom;
            if (payload.ownershipPercentage !== undefined) {
                const pct = Number(payload.ownershipPercentage);
                if (!Number.isFinite(pct) || pct < 0 || pct > 100)
                    throw new errorHandler_1.AppError('ownershipPercentage must be 0–100', 400);
                $set.ownershipPercentage = pct;
            }
            const acquisitionDate = optionalDate(payload.acquisitionDate);
            if (acquisitionDate !== undefined)
                $set.acquisitionDate = acquisitionDate;
            if (payload.acquisitionCost !== undefined) {
                const cost = payload.acquisitionCost === null || payload.acquisitionCost === '' ? null : Number(payload.acquisitionCost);
                if (cost != null && (!Number.isFinite(cost) || cost < 0))
                    throw new errorHandler_1.AppError('acquisitionCost cannot be negative', 400);
                $set.acquisitionCost = cost;
            }
            if (payload.improvementCost !== undefined || payload.improvementCosts !== undefined) {
                const raw = payload.improvementCost !== undefined ? payload.improvementCost : payload.improvementCosts;
                const cost = raw === null || raw === '' ? null : Number(raw);
                if (cost != null && (!Number.isFinite(cost) || cost < 0))
                    throw new errorHandler_1.AppError('improvementCost cannot be negative', 400);
                $set.improvementCosts = cost;
            }
            const taxNotes = optionalString(payload.taxNotes);
            if (taxNotes !== undefined)
                $set.taxNotes = taxNotes;
            if (Object.keys($set).length) {
                yield Property_1.Property.updateOne({ _id: property._id }, { $set });
            }
            const after = yield this.getPropertyProfile(companyId, propertyId);
            yield writeAudit({
                companyId,
                eventType: 'PROPERTY_TAX_PROFILE_UPDATED',
                sourceId: propertyId,
                message: `Updated property tax profile for ${property.name}`,
                metadata: { before, after, userId }
            });
            return after;
        });
    }
};
exports.default = exports.individualTaxProfileService;
