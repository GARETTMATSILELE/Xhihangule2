export const PROPERTY_TYPES = ['apartment', 'house', 'commercial', 'land'] as const;
export const PROPERTY_STATUSES = ['available', 'rented', 'maintenance', 'under_offer', 'sold'] as const;
export const RENT_FREQUENCIES = ['monthly', 'weekly', 'quarterly', 'annually'] as const;
export const CHARGE_CATEGORIES = ['Levy', 'Municipal', 'Utilities', 'Insurance', 'Other'] as const;
export const CHARGE_FREQUENCIES = ['monthly', 'quarterly', 'annually'] as const;

export type ChargeCategory = typeof CHARGE_CATEGORIES[number];
export type ChargeFrequency = typeof CHARGE_FREQUENCIES[number];
export type RentFrequency = typeof RENT_FREQUENCIES[number];

export type RecurringChargeInput = {
  chargeId?: string;
  description?: string;
  category?: string;
  amount?: number | string;
  currency?: string;
  frequency?: string;
  effectiveFrom?: string;
  active?: boolean;
};

export type PropertyEditInput = {
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  type?: string;
  description?: string;
  status?: string;
  rent?: number | string;
  rentFrequency?: string;
  rentDueDay?: number | string | null;
  paymentTerms?: string;
  rentEffectiveFrom?: string;
  currency?: string;
  confirmCurrencyChange?: boolean;
  bedrooms?: number | string;
  bathrooms?: number | string;
  parkingSpaces?: number | string;
  area?: number | string;
  amenities?: string[] | string;
  charges?: RecurringChargeInput[];
};

export type StoredCharge = {
  chargeId: string;
  description: string;
  category: ChargeCategory;
  amount: number;
  currency: string;
  frequency: ChargeFrequency;
  effectiveFrom?: Date;
  active: boolean;
};

export type RentHistoryEntry = {
  amount: number;
  currency?: string;
  frequency?: string;
  dueDay?: number;
  effectiveFrom?: Date;
  terms?: string;
  recordedAt: Date;
};

export type EditableProperty = {
  name?: string;
  address?: string;
  city?: string;
  locationCountry?: string;
  type?: string;
  description?: string;
  status?: string;
  rent?: number;
  operatingCurrency?: string;
  rentFrequency?: string;
  rentDueDay?: number;
  paymentTerms?: string;
  rentEffectiveFrom?: Date | string | null;
  pendingRent?: number | null;
  pendingRentFrequency?: string | null;
  pendingRentDueDay?: number | null;
  pendingPaymentTerms?: string | null;
  pendingRentEffectiveFrom?: Date | string | null;
  rentHistory?: RentHistoryEntry[];
  recurringCharges?: StoredCharge[];
  levyOrMunicipalType?: 'levy' | 'municipal' | null;
  levyOrMunicipalAmount?: number;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpaces?: number;
  area?: number;
  amenities?: string[];
};

export class PropertyEditError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 400, code = 'PROPERTY_EDIT_INVALID') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

function whole(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount);
}

export function calendarDay(value?: Date | string | null) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function parseDay(value: unknown, label: string) {
  const day = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new PropertyEditError(`Enter a valid ${label}.`);
  return day;
}

function chargeId() {
  return `chg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normaliseCharges(input: RecurringChargeInput[] | undefined, fallbackCurrency: string): StoredCharge[] {
  return (input || []).map((charge) => {
    const category = text(charge.category);
    const frequency = text(charge.frequency || 'monthly');
    if (!CHARGE_CATEGORIES.includes(category as ChargeCategory)) {
      throw new PropertyEditError('Each charge needs a category of Levy, Municipal, Utilities, Insurance, or Other.');
    }
    if (!CHARGE_FREQUENCIES.includes(frequency as ChargeFrequency)) {
      throw new PropertyEditError('Charge frequency must be monthly, quarterly, or annually.');
    }
    const amount = money(charge.amount);
    if (amount == null) throw new PropertyEditError('Each charge needs an amount of zero or more.');
    const description = text(charge.description);
    if (!description) throw new PropertyEditError('Each charge needs a description.');
    return {
      chargeId: text(charge.chargeId) || chargeId(),
      description,
      category: category as ChargeCategory,
      amount,
      currency: (text(charge.currency) || fallbackCurrency || 'USD').toUpperCase(),
      frequency: frequency as ChargeFrequency,
      effectiveFrom: charge.effectiveFrom ? new Date(`${parseDay(charge.effectiveFrom, 'charge effective date')}T00:00:00.000Z`) : undefined,
      active: charge.active !== false
    };
  });
}

export function legacyChargesFromProperty(property: EditableProperty): StoredCharge[] {
  if (property.recurringCharges?.length) return property.recurringCharges;
  const amount = Number(property.levyOrMunicipalAmount || 0);
  if (!amount) return [];
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

export function levyConfiguration(charges: StoredCharge[], today: string) {
  const current = charges.filter((charge) => charge.active && charge.frequency === 'monthly' && (!charge.effectiveFrom || calendarDay(charge.effectiveFrom) <= today));
  const levies = current.filter((charge) => charge.category === 'Levy');
  const municipal = current.filter((charge) => charge.category === 'Municipal');
  const chosen = levies.length ? levies : municipal;
  if (!chosen.length) return { levyOrMunicipalType: null, levyOrMunicipalAmount: 0 };
  const amount = Math.round(chosen.reduce((sum, charge) => sum + charge.amount, 0) * 100) / 100;
  return {
    levyOrMunicipalType: levies.length ? 'levy' as const : 'municipal' as const,
    levyOrMunicipalAmount: amount
  };
}

export function planPropertyEdit(current: EditableProperty, input: PropertyEditInput, today: string, hasFinancialHistory: boolean) {
  const name = text(input.name);
  const address = text(input.address);
  if (!name) throw new PropertyEditError('Property name is required.');
  if (!address) throw new PropertyEditError('Property address is required.');
  const type = text(input.type || current.type || 'apartment');
  const status = text(input.status || current.status || 'available');
  if (!PROPERTY_TYPES.includes(type as typeof PROPERTY_TYPES[number])) throw new PropertyEditError('Choose a supported property type.');
  if (!PROPERTY_STATUSES.includes(status as typeof PROPERTY_STATUSES[number])) throw new PropertyEditError('Choose a supported property status.');
  const frequency = text(input.rentFrequency || current.rentFrequency || 'monthly');
  if (!RENT_FREQUENCIES.includes(frequency as RentFrequency)) throw new PropertyEditError('Choose a supported rental frequency.');
  const rent = money(input.rent);
  if (rent == null) throw new PropertyEditError('Monthly rental amount must be zero or more.');
  let dueDay: number | null = null;
  if (input.rentDueDay != null && text(input.rentDueDay) !== '') {
    dueDay = whole(input.rentDueDay);
    if (dueDay == null || dueDay < 1 || dueDay > 28) throw new PropertyEditError('Rental due day must be between 1 and 28.');
  }
  const bedrooms = whole(input.bedrooms ?? current.bedrooms ?? 0);
  const bathrooms = whole(input.bathrooms ?? current.bathrooms ?? 0);
  const parkingSpaces = whole(input.parkingSpaces ?? current.parkingSpaces ?? 0);
  const area = money(input.area ?? current.area ?? 0);
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
    throw new PropertyEditError(
      'This property already has financial records. Confirm the currency change to continue. Existing transactions keep their original currency.',
      409,
      'CURRENCY_CONFIRMATION_REQUIRED'
    );
  }
  const terms = text(input.paymentTerms);
  const previousRent = Number(current.rent || 0);
  const previousFrequency = current.rentFrequency || 'monthly';
  const previousDue = current.rentDueDay ?? null;
  const previousTerms = text(current.paymentTerms);
  const rentChanged = rent !== previousRent || frequency !== previousFrequency || dueDay !== previousDue || terms !== previousTerms;
  const charges = normaliseCharges(input.charges, normalisedCurrency);
  const update: Record<string, unknown> = {
    name,
    address,
    city: text(input.city),
    locationCountry: text(input.country || current.locationCountry),
    type,
    description: text(input.description),
    status,
    operatingCurrency: normalisedCurrency,
    bedrooms,
    bathrooms,
    parkingSpaces,
    area,
    amenities,
    recurringCharges: charges,
    ...levyConfiguration(charges, today)
  };
  let rentNote = 'The current rental amount is unchanged.';
  if (rentChanged) {
    const effectiveFrom = parseDay(input.rentEffectiveFrom, 'rental effective date');
    const history = [...(current.rentHistory || []), {
      amount: previousRent,
      currency: previousCurrency,
      frequency: previousFrequency,
      dueDay: previousDue ?? undefined,
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
    } else {
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

export function dueRentPatch(property: EditableProperty, today: string) {
  if (property.pendingRent == null || !property.pendingRentEffectiveFrom) return null;
  if (calendarDay(property.pendingRentEffectiveFrom) > today) return null;
  return {
    rent: property.pendingRent,
    rentFrequency: property.pendingRentFrequency || property.rentFrequency || 'monthly',
    rentDueDay: property.pendingRentDueDay ?? property.rentDueDay ?? null,
    paymentTerms: property.pendingPaymentTerms ?? property.paymentTerms ?? '',
    rentEffectiveFrom: new Date(`${calendarDay(property.pendingRentEffectiveFrom)}T00:00:00.000Z`),
    pendingRent: null,
    pendingRentFrequency: null,
    pendingRentDueDay: null,
    pendingPaymentTerms: null,
    pendingRentEffectiveFrom: null
  };
}
