import mongoose from 'mongoose';
import { Property } from '../models/Property';
import { Payment } from '../models/Payment';
import { AppError } from '../middleware/errorHandler';
import propertyAccountService from './propertyAccountService';
import {
  EditableProperty,
  PropertyEditError,
  PropertyEditInput,
  calendarDay,
  dueRentPatch,
  legacyChargesFromProperty,
  planPropertyEdit
} from './individualPropertyEdit';

function asObjectId(id: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new AppError('Choose a valid property', 400);
  return new mongoose.Types.ObjectId(id);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function loadProperty(companyId: string, propertyId: string) {
  const property = await Property.findOne({
    _id: asObjectId(propertyId),
    companyId: asObjectId(companyId),
    isDeleted: { $ne: true }
  });
  if (!property) throw new AppError('Property not found', 404);
  return property;
}

export async function applyDueRentChanges(properties: Array<Record<string, any>>) {
  const today = todayKey();
  const due = properties.filter((property) => dueRentPatch(property, today));
  if (!due.length) return false;
  await Promise.all(due.map((property) => {
    const patch = dueRentPatch(property, today);
    if (!patch) return Promise.resolve();
    return Property.updateOne({ _id: property._id }, { $set: patch as any });
  }));
  return true;
}

async function hasFinancialHistory(companyId: string, propertyId: string) {
  const payments = await Payment.countDocuments({
    companyId: asObjectId(companyId),
    propertyId: asObjectId(propertyId)
  });
  if (payments > 0) return true;
  try {
    const account = await propertyAccountService.getPropertyAccount(propertyId);
    return (account.transactions || []).some((entry: any) => entry?.type && entry.type !== 'opening_balance');
  } catch (error: any) {
    if (Number(error?.statusCode || error?.status || 0) === 404) return false;
    throw error;
  }
}

function present(property: any, history: boolean) {
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
    rentDueDay: source.rentDueDay ?? '',
    paymentTerms: source.paymentTerms || '',
    rentEffectiveFrom: calendarDay(source.rentEffectiveFrom),
    pendingRent: source.pendingRent ?? null,
    pendingRentEffectiveFrom: calendarDay(source.pendingRentEffectiveFrom),
    currency: source.operatingCurrency || 'USD',
    bedrooms: Number(source.bedrooms || 0),
    bathrooms: Number(source.bathrooms || 0),
    parkingSpaces: Number(source.parkingSpaces || 0),
    area: Number(source.area || 0),
    amenities: Array.isArray(source.amenities) ? source.amenities : [],
    charges: legacyChargesFromProperty(source).map((charge) => ({
      ...charge,
      effectiveFrom: calendarDay(charge.effectiveFrom)
    })),
    hasFinancialHistory: history,
    vatSupplyTreatment: source.vatSupplyTreatment || null,
    rentalTaxTreatment: source.rentalTaxTreatment || null
  };
}

export async function getIndividualPropertyEditor(companyId: string, propertyId: string) {
  const property = await loadProperty(companyId, propertyId);
  const patch = dueRentPatch(property.toObject(), todayKey());
  if (patch) {
    property.set(patch);
    await property.save();
  }
  return present(property, await hasFinancialHistory(companyId, propertyId));
}

export async function updateIndividualProperty(companyId: string, propertyId: string, input: PropertyEditInput) {
  const property = await loadProperty(companyId, propertyId);
  const due = dueRentPatch(property.toObject(), todayKey());
  if (due) property.set(due);
  let plan;
  try {
    plan = planPropertyEdit(property.toObject() as EditableProperty, input, todayKey(), await hasFinancialHistory(companyId, propertyId));
  } catch (error) {
    if (error instanceof PropertyEditError) throw new AppError(error.message, error.statusCode, error.code);
    throw error;
  }
  const { levyOrMunicipalType, rentDueDay, pendingRentDueDay, ...rest } = plan.update as Record<string, any>;
  property.set(rest);
  property.set('levyOrMunicipalType', levyOrMunicipalType || undefined);
  if (rentDueDay != null) property.set('rentDueDay', rentDueDay);
  if (pendingRentDueDay != null) property.set('pendingRentDueDay', pendingRentDueDay);
  await property.save();
  return {
    property: present(property, await hasFinancialHistory(companyId, propertyId)),
    message: 'Property updated.',
    rentNote: plan.rentNote,
    chargeNote: plan.chargeNote,
    currencyNote: plan.currencyChanged
      ? 'The property currency was updated. Existing payments and ledger entries still use the currency they were recorded in.'
      : null
  };
}

export async function listIndividualRecurringCharges(companyId: string) {
  const properties = await Property.find({ companyId: asObjectId(companyId), isDeleted: { $ne: true } })
    .select('name recurringCharges levyOrMunicipalType levyOrMunicipalAmount operatingCurrency')
    .lean();
  return properties.flatMap((property: any) => legacyChargesFromProperty(property).filter((charge) => charge.active).map((charge) => ({
    propertyId: String(property._id),
    propertyName: property.name,
    description: charge.description,
    category: charge.category,
    amount: charge.amount,
    currency: charge.currency,
    frequency: charge.frequency,
    effectiveFrom: calendarDay(charge.effectiveFrom)
  })));
}
