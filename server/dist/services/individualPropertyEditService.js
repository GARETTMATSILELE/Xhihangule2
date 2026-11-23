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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyDueRentChanges = applyDueRentChanges;
exports.getIndividualPropertyEditor = getIndividualPropertyEditor;
exports.updateIndividualProperty = updateIndividualProperty;
exports.listIndividualRecurringCharges = listIndividualRecurringCharges;
const mongoose_1 = __importDefault(require("mongoose"));
const Property_1 = require("../models/Property");
const Payment_1 = require("../models/Payment");
const errorHandler_1 = require("../middleware/errorHandler");
const propertyAccountService_1 = __importDefault(require("./propertyAccountService"));
const individualPropertyEdit_1 = require("./individualPropertyEdit");
function asObjectId(id) {
    if (!mongoose_1.default.Types.ObjectId.isValid(id))
        throw new errorHandler_1.AppError('Choose a valid property', 400);
    return new mongoose_1.default.Types.ObjectId(id);
}
function todayKey() {
    return new Date().toISOString().slice(0, 10);
}
function loadProperty(companyId, propertyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const property = yield Property_1.Property.findOne({
            _id: asObjectId(propertyId),
            companyId: asObjectId(companyId),
            isDeleted: { $ne: true }
        });
        if (!property)
            throw new errorHandler_1.AppError('Property not found', 404);
        return property;
    });
}
function applyDueRentChanges(properties) {
    return __awaiter(this, void 0, void 0, function* () {
        const today = todayKey();
        const due = properties.filter((property) => (0, individualPropertyEdit_1.dueRentPatch)(property, today));
        if (!due.length)
            return false;
        yield Promise.all(due.map((property) => {
            const patch = (0, individualPropertyEdit_1.dueRentPatch)(property, today);
            if (!patch)
                return Promise.resolve();
            return Property_1.Property.updateOne({ _id: property._id }, { $set: patch });
        }));
        return true;
    });
}
function hasFinancialHistory(companyId, propertyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const payments = yield Payment_1.Payment.countDocuments({
            companyId: asObjectId(companyId),
            propertyId: asObjectId(propertyId)
        });
        if (payments > 0)
            return true;
        try {
            const account = yield propertyAccountService_1.default.getPropertyAccount(propertyId);
            return (account.transactions || []).some((entry) => (entry === null || entry === void 0 ? void 0 : entry.type) && entry.type !== 'opening_balance');
        }
        catch (error) {
            if (Number((error === null || error === void 0 ? void 0 : error.statusCode) || (error === null || error === void 0 ? void 0 : error.status) || 0) === 404)
                return false;
            throw error;
        }
    });
}
function present(property, history) {
    var _a, _b;
    const source = typeof property.toObject === 'function' ? property.toObject() : property;
    return {
        propertyId: String(source._id),
        name: source.name || '',
        address: source.address || '',
        city: source.city || '',
        country: source.locationCountry || '',
        type: source.type || 'apartment',
        description: source.description && source.description !== 'N/A' ? source.description : '',
        status: source.status || 'available',
        rent: Number(source.rent || 0),
        rentFrequency: source.rentFrequency || 'monthly',
        rentDueDay: (_a = source.rentDueDay) !== null && _a !== void 0 ? _a : '',
        paymentTerms: source.paymentTerms || '',
        rentEffectiveFrom: (0, individualPropertyEdit_1.calendarDay)(source.rentEffectiveFrom),
        pendingRent: (_b = source.pendingRent) !== null && _b !== void 0 ? _b : null,
        pendingRentEffectiveFrom: (0, individualPropertyEdit_1.calendarDay)(source.pendingRentEffectiveFrom),
        currency: source.operatingCurrency || 'USD',
        bedrooms: Number(source.bedrooms || 0),
        bathrooms: Number(source.bathrooms || 0),
        parkingSpaces: Number(source.parkingSpaces || 0),
        area: Number(source.area || 0),
        amenities: Array.isArray(source.amenities) ? source.amenities : [],
        charges: (0, individualPropertyEdit_1.legacyChargesFromProperty)(source).map((charge) => (Object.assign(Object.assign({}, charge), { effectiveFrom: (0, individualPropertyEdit_1.calendarDay)(charge.effectiveFrom) }))),
        hasFinancialHistory: history,
        vatSupplyTreatment: source.vatSupplyTreatment || null,
        rentalTaxTreatment: source.rentalTaxTreatment || null
    };
}
function getIndividualPropertyEditor(companyId, propertyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const property = yield loadProperty(companyId, propertyId);
        const patch = (0, individualPropertyEdit_1.dueRentPatch)(property.toObject(), todayKey());
        if (patch) {
            property.set(patch);
            yield property.save();
        }
        return present(property, yield hasFinancialHistory(companyId, propertyId));
    });
}
function updateIndividualProperty(companyId, propertyId, input) {
    return __awaiter(this, void 0, void 0, function* () {
        const property = yield loadProperty(companyId, propertyId);
        const due = (0, individualPropertyEdit_1.dueRentPatch)(property.toObject(), todayKey());
        if (due)
            property.set(due);
        let plan;
        try {
            plan = (0, individualPropertyEdit_1.planPropertyEdit)(property.toObject(), input, todayKey(), yield hasFinancialHistory(companyId, propertyId));
        }
        catch (error) {
            if (error instanceof individualPropertyEdit_1.PropertyEditError)
                throw new errorHandler_1.AppError(error.message, error.statusCode, error.code);
            throw error;
        }
        const _a = plan.update, { levyOrMunicipalType, rentDueDay, pendingRentDueDay } = _a, rest = __rest(_a, ["levyOrMunicipalType", "rentDueDay", "pendingRentDueDay"]);
        property.set(rest);
        property.set('levyOrMunicipalType', levyOrMunicipalType || undefined);
        if (rentDueDay != null)
            property.set('rentDueDay', rentDueDay);
        if (pendingRentDueDay != null)
            property.set('pendingRentDueDay', pendingRentDueDay);
        yield property.save();
        return {
            property: present(property, yield hasFinancialHistory(companyId, propertyId)),
            message: 'Property updated.',
            rentNote: plan.rentNote,
            chargeNote: plan.chargeNote,
            currencyNote: plan.currencyChanged
                ? 'The property currency was updated. Existing payments and ledger entries still use the currency they were recorded in.'
                : null
        };
    });
}
function listIndividualRecurringCharges(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const properties = yield Property_1.Property.find({ companyId: asObjectId(companyId), isDeleted: { $ne: true } })
            .select('name recurringCharges levyOrMunicipalType levyOrMunicipalAmount operatingCurrency')
            .lean();
        return properties.flatMap((property) => (0, individualPropertyEdit_1.legacyChargesFromProperty)(property).filter((charge) => charge.active).map((charge) => ({
            propertyId: String(property._id),
            propertyName: property.name,
            description: charge.description,
            category: charge.category,
            amount: charge.amount,
            currency: charge.currency,
            frequency: charge.frequency,
            effectiveFrom: (0, individualPropertyEdit_1.calendarDay)(charge.effectiveFrom)
        })));
    });
}
