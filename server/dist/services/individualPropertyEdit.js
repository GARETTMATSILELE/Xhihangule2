"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PropertyEditError = exports.CHARGE_FREQUENCIES = exports.CHARGE_CATEGORIES = exports.RENT_FREQUENCIES = exports.PROPERTY_STATUSES = exports.PROPERTY_TYPES = void 0;
exports.calendarDay = calendarDay;
exports.normaliseCharges = normaliseCharges;
exports.legacyChargesFromProperty = legacyChargesFromProperty;
exports.levyConfiguration = levyConfiguration;
exports.planPropertyEdit = planPropertyEdit;
exports.dueRentPatch = dueRentPatch;
exports.PROPERTY_TYPES = ['apartment', 'house', 'commercial', 'land'];
exports.PROPERTY_STATUSES = ['available', 'rented', 'maintenance', 'under_offer', 'sold'];
exports.RENT_FREQUENCIES = ['monthly', 'weekly', 'quarterly', 'annually'];
exports.CHARGE_CATEGORIES = ['Levy', 'Municipal', 'Utilities', 'Insurance', 'Other'];
exports.CHARGE_FREQUENCIES = ['monthly', 'quarterly', 'annually'];
class PropertyEditError extends Error {
    constructor(message, statusCode = 400, code = 'PROPERTY_EDIT_INVALID') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}
exports.PropertyEditError = PropertyEditError;
function text(value) {
    return String(value !== null && value !== void 0 ? value : '').trim();
}
function money(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0)
        return null;
    return Math.round(amount * 100) / 100;
}
function whole(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0)
        return null;
    return Math.round(amount);
}
function calendarDay(value) {
    if (!value)
        return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
        return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '';
    return date.toISOString().slice(0, 10);
}
function parseDay(value, label) {
    const day = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
        throw new PropertyEditError(`Enter a valid ${label}.`);
    return day;
}
function chargeId() {
    return `chg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function normaliseCharges(input, fallbackCurrency) {
    return (input || []).map((charge) => {
        const category = text(charge.category);
        const frequency = text(charge.frequency || 'monthly');
        if (!exports.CHARGE_CATEGORIES.includes(category)) {
            throw new PropertyEditError('Each charge needs a category of Levy, Municipal, Utilities, Insurance, or Other.');
        }
        if (!exports.CHARGE_FREQUENCIES.includes(frequency)) {
            throw new PropertyEditError('Charge frequency must be monthly, quarterly, or annually.');
        }
        const amount = money(charge.amount);
        if (amount == null)
            throw new PropertyEditError('Each charge needs an amount of zero or more.');
        const description = text(charge.description);
        if (!description)
            throw new PropertyEditError('Each charge needs a description.');
        return {
            chargeId: text(charge.chargeId) || chargeId(),
            description,
            category: category,
            amount,
            currency: (text(charge.currency) || fallbackCurrency || 'USD').toUpperCase(),
            frequency: frequency,
            effectiveFrom: charge.effectiveFrom ? new Date(`${parseDay(charge.effectiveFrom, 'charge effective date')}T00:00:00.000Z`) : undefined,
            active: charge.active !== false
        };
    });
}
function legacyChargesFromProperty(property) {
    var _a;
    if ((_a = property.recurringCharges) === null || _a === void 0 ? void 0 : _a.length)
        return property.recurringCharges;
    const amount = Number(property.levyOrMunicipalAmount || 0);
    if (!amount)
        return [];
    const category = property.levyOrMunicipalType === 'municipal' ? 'Municipal' : 'Levy';
    return [{
            chargeId: 'legacy-property-charge',
            description: category === 'Municipal' ? 'Municipal charge' : 'Monthly levy',
            category,
            amount,
            currency: property.operatingCurrency || 'USD',
            frequency: 'monthly',
            active: true
        }];
}
function levyConfiguration(charges, today) {
    const current = charges.filter((charge) => charge.active && charge.frequency === 'monthly' && (!charge.effectiveFrom || calendarDay(charge.effectiveFrom) <= today));
    const levies = current.filter((charge) => charge.category === 'Levy');
    const municipal = current.filter((charge) => charge.category === 'Municipal');
    const chosen = levies.length ? levies : municipal;
    if (!chosen.length)
        return { levyOrMunicipalType: null, levyOrMunicipalAmount: 0 };
    const amount = Math.round(chosen.reduce((sum, charge) => sum + charge.amount, 0) * 100) / 100;
    return {
        levyOrMunicipalType: levies.length ? 'levy' : 'municipal',
        levyOrMunicipalAmount: amount
    };
}
function planPropertyEdit(current, input, today, hasFinancialHistory) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const name = text(input.name);
    const address = text(input.address);
    if (!name)
        throw new PropertyEditError('Property name is required.');
    if (!address)
        throw new PropertyEditError('Property address is required.');
    const type = text(input.type || current.type || 'apartment');
    const status = text(input.status || current.status || 'available');
    if (!exports.PROPERTY_TYPES.includes(type))
        throw new PropertyEditError('Choose a supported property type.');
    if (!exports.PROPERTY_STATUSES.includes(status))
        throw new PropertyEditError('Choose a supported property status.');
    const frequency = text(input.rentFrequency || current.rentFrequency || 'monthly');
    if (!exports.RENT_FREQUENCIES.includes(frequency))
        throw new PropertyEditError('Choose a supported rental frequency.');
    const rent = money(input.rent);
    if (rent == null)
        throw new PropertyEditError('Monthly rental amount must be zero or more.');
    let dueDay = null;
    if (input.rentDueDay != null && text(input.rentDueDay) !== '') {
        dueDay = whole(input.rentDueDay);
        if (dueDay == null || dueDay < 1 || dueDay > 28)
            throw new PropertyEditError('Rental due day must be between 1 and 28.');
    }
    const bedrooms = whole((_b = (_a = input.bedrooms) !== null && _a !== void 0 ? _a : current.bedrooms) !== null && _b !== void 0 ? _b : 0);
    const bathrooms = whole((_d = (_c = input.bathrooms) !== null && _c !== void 0 ? _c : current.bathrooms) !== null && _d !== void 0 ? _d : 0);
    const parkingSpaces = whole((_f = (_e = input.parkingSpaces) !== null && _e !== void 0 ? _e : current.parkingSpaces) !== null && _f !== void 0 ? _f : 0);
    const area = money((_h = (_g = input.area) !== null && _g !== void 0 ? _g : current.area) !== null && _h !== void 0 ? _h : 0);
    if (bedrooms == null || bathrooms == null || parkingSpaces == null || area == null) {
        throw new PropertyEditError('Bedrooms, bathrooms, parking and floor area must be zero or more.');
    }
    const amenities = Array.isArray(input.amenities)
        ? input.amenities.map((item) => text(item)).filter(Boolean)
        : text(input.amenities).split(',').map((item) => item.trim()).filter(Boolean);
    const currency = (text(input.currency || current.operatingCurrency || 'USD') || 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
        throw new PropertyEditError('Currency must be a three-letter code such as USD or ZiG.');
    }
    const normalisedCurrency = currency === 'ZIG' ? 'ZiG' : currency;
    const previousCurrency = current.operatingCurrency || 'USD';
    const currencyChanged = normalisedCurrency !== previousCurrency;
    if (currencyChanged && hasFinancialHistory && input.confirmCurrencyChange !== true) {
        throw new PropertyEditError('This property already has financial records. Confirm the currency change to continue. Existing transactions keep their original currency.', 409, 'CURRENCY_CONFIRMATION_REQUIRED');
    }
    const terms = text(input.paymentTerms);
    const previousRent = Number(current.rent || 0);
    const previousFrequency = current.rentFrequency || 'monthly';
    const previousDue = (_j = current.rentDueDay) !== null && _j !== void 0 ? _j : null;
    const previousTerms = text(current.paymentTerms);
    const rentChanged = rent !== previousRent || frequency !== previousFrequency || dueDay !== previousDue || terms !== previousTerms;
    const charges = normaliseCharges(input.charges, normalisedCurrency);
    const update = Object.assign({ name,
        address, city: text(input.city), locationCountry: text(input.country || current.locationCountry), type, description: text(input.description), status, operatingCurrency: normalisedCurrency, bedrooms,
        bathrooms,
        parkingSpaces,
        area,
        amenities, recurringCharges: charges }, levyConfiguration(charges, today));
    let rentNote = 'The current rental amount is unchanged.';
    if (rentChanged) {
        const effectiveFrom = parseDay(input.rentEffectiveFrom, 'rental effective date');
        const history = [...(current.rentHistory || []), {
                amount: previousRent,
                currency: previousCurrency,
                frequency: previousFrequency,
                dueDay: previousDue !== null && previousDue !== void 0 ? previousDue : undefined,
                effectiveFrom: current.rentEffectiveFrom ? new Date(current.rentEffectiveFrom) : undefined,
                terms: previousTerms,
                recordedAt: new Date(`${today}T00:00:00.000Z`)
            }];
        update.rentHistory = history;
        if (effectiveFrom > today) {
            update.pendingRent = rent;
            update.pendingRentFrequency = frequency;
            update.pendingRentDueDay = dueDay;
            update.pendingPaymentTerms = terms;
            update.pendingRentEffectiveFrom = new Date(`${effectiveFrom}T00:00:00.000Z`);
            rentNote = `The new rental amount starts on ${effectiveFrom}. Current rent and existing payments stay as they are until then.`;
        }
        else {
            update.rent = rent;
            update.rentFrequency = frequency;
            update.rentDueDay = dueDay;
            update.paymentTerms = terms;
            update.rentEffectiveFrom = new Date(`${effectiveFrom}T00:00:00.000Z`);
            update.pendingRent = null;
            update.pendingRentFrequency = null;
            update.pendingRentDueDay = null;
            update.pendingPaymentTerms = null;
            update.pendingRentEffectiveFrom = null;
            rentNote = `The rental amount applies from ${effectiveFrom}. Recorded payments and earlier bills were not changed.`;
        }
    }
    return {
        update,
        currencyChanged,
        rentNote,
        chargeNote: 'Recurring charge settings apply to future bills only. Previously recorded bills were not changed.'
    };
}
function dueRentPatch(property, today) {
    var _a, _b, _c, _d;
    if (property.pendingRent == null || !property.pendingRentEffectiveFrom)
        return null;
    if (calendarDay(property.pendingRentEffectiveFrom) > today)
        return null;
    return {
        rent: property.pendingRent,
        rentFrequency: property.pendingRentFrequency || property.rentFrequency || 'monthly',
        rentDueDay: (_b = (_a = property.pendingRentDueDay) !== null && _a !== void 0 ? _a : property.rentDueDay) !== null && _b !== void 0 ? _b : null,
        paymentTerms: (_d = (_c = property.pendingPaymentTerms) !== null && _c !== void 0 ? _c : property.paymentTerms) !== null && _d !== void 0 ? _d : '',
        rentEffectiveFrom: new Date(`${calendarDay(property.pendingRentEffectiveFrom)}T00:00:00.000Z`),
        pendingRent: null,
        pendingRentFrequency: null,
        pendingRentDueDay: null,
        pendingPaymentTerms: null,
        pendingRentEffectiveFrom: null
    };
}
