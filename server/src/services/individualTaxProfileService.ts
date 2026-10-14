import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { IndividualTaxProfile } from '../models/IndividualTaxProfile';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { AppError } from '../middleware/errorHandler';
import { defaultSupplyTreatment } from './tax/vatApplicability';
import type { PropertyUseClass, VatSupplyTreatment } from './tax/taxTypes';
import { PROPERTY_USE_CLASSES, VAT_SUPPLY_TREATMENTS } from './tax/taxTypes';
import {
  TAX_DISCLAIMER,
  isTaxpayerType,
  normalizeRentalTaxRegime,
  type RentalTaxRegime,
  type TaxpayerType
} from './tax/rentalTaxTypes';
import { ensureSystemTaxRules, listTaxRules, type TaxRuleRecord } from './taxRuleRegistry';

export type OwnerTaxProfile = {
  companyId: string;
  userId?: string | null;
  taxpayerType: TaxpayerType;
  legalName: string;
  tradingName: string;
  nationalIdOrCompanyRegistrationReference: string;
  tin: string;
  vatRegistered: boolean;
  vatNumber: string;
  vatRegistrationDate: string | null;
  vatRegistrationCancelledAt: string | null;
  vatCategory: string;
  incomeTaxRegistered: boolean;
  incomeTaxRegistrationDate: string | null;
  rentalTaxRegime: RentalTaxRegime;
  rentalTaxRegistrationDate: string | null;
  taxResidence: string;
  taxYearStartMonth: number;
  accountantName: string;
  accountantContact: string;
  taxNotes: string;
  profileVersion: number;
  workspaceType: string | null;
  rentalTaxRegimeInferredFromWorkspace: false;
  configuredTaxRules: TaxRuleRecord[];
  disclaimer: string;
};

export type PropertyTaxProfile = {
  propertyId: string;
  ownerUserId: string | null;
  companyId: string;
  propertyName: string;
  propertyUseClass: PropertyUseClass | null;
  vatSupplyTreatment: VatSupplyTreatment;
  vatEffectiveFrom: string | null;
  vatEffectiveTo: string | null;
  rentalTaxTreatment: RentalTaxRegime;
  rentalTaxEffectiveFrom: string | null;
  ownershipPercentage: number;
  acquisitionDate: string | null;
  acquisitionCost: number | null;
  improvementCost: number | null;
  taxNotes: string;
  reviewRequired: boolean;
  reviewReasons: string[];
  disclaimer: string;
};

function asObjectId(value: string, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label}`, 400);
  return new mongoose.Types.ObjectId(value);
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function optionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) throw new AppError('Invalid date', 400);
  return date;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return String(value || '').trim();
}

function isUseClass(value: unknown): value is PropertyUseClass {
  return typeof value === 'string' && (PROPERTY_USE_CLASSES as readonly string[]).includes(value);
}

function isVatTreatment(value: unknown): value is VatSupplyTreatment {
  return typeof value === 'string' && (VAT_SUPPLY_TREATMENTS as readonly string[]).includes(value);
}

async function writeAudit(input: {
  companyId: string;
  eventType: string;
  sourceId: string;
  message: string;
  metadata: Record<string, unknown>;
}) {
  await AccountingEventLog.create({
    companyId: asObjectId(input.companyId, 'companyId'),
    eventType: input.eventType,
    sourceModule: 'individual_tax_profile',
    sourceId: input.sourceId,
    success: true,
    message: input.message,
    metadata: input.metadata
  });
}

function propertyReviewReasons(input: {
  propertyUseClass?: string | null;
  vatSupplyTreatment?: string | null;
  rentalTaxTreatment?: string | null;
}): string[] {
  const reasons: string[] = [];
  if (!input.propertyUseClass) reasons.push('MISSING_PROPERTY_TAX_CLASSIFICATION');
  if (!input.vatSupplyTreatment || input.vatSupplyTreatment === 'ACCOUNTANT_REVIEW') reasons.push('VAT_REVIEW_REQUIRED');
  if (!input.rentalTaxTreatment || input.rentalTaxTreatment === 'ACCOUNTANT_REVIEW') reasons.push('TAX_TREATMENT_REVIEW_REQUIRED');
  return reasons;
}

export const individualTaxProfileService = {
  async getOwnerProfile(companyId: string): Promise<OwnerTaxProfile> {
    const company = await Company.findById(asObjectId(companyId, 'companyId'));
    if (!company) throw new AppError('Company not found', 404);
    const stored = await IndividualTaxProfile.findOne({ companyId: company._id });
    const rules = await listTaxRules();
    const taxProfile = (company as any).taxProfile || {};

    return {
      companyId: String(company._id),
      userId: stored?.userId ? String(stored.userId) : company.ownerId ? String(company.ownerId) : null,
      taxpayerType: isTaxpayerType(stored?.taxpayerType) ? stored!.taxpayerType : 'INDIVIDUAL',
      legalName: stored?.legalName || company.name || '',
      tradingName: stored?.tradingName || company.tradingName || '',
      nationalIdOrCompanyRegistrationReference:
        stored?.nationalIdOrCompanyRegistrationReference || company.registrationNumber || '',
      tin: company.tinNumber || '',
      vatRegistered: Boolean(taxProfile.vatRegistered),
      vatNumber: company.vatNumber || '',
      vatRegistrationDate: isoDate(taxProfile.vatRegistrationEffectiveDate),
      vatRegistrationCancelledAt: isoDate(taxProfile.vatRegistrationCancelledAt),
      vatCategory: taxProfile.vatCategory || '',
      incomeTaxRegistered: Boolean(stored?.incomeTaxRegistered),
      incomeTaxRegistrationDate: isoDate(stored?.incomeTaxRegistrationDate),
      rentalTaxRegime: normalizeRentalTaxRegime(stored?.rentalTaxRegime),
      rentalTaxRegistrationDate: isoDate(stored?.rentalTaxRegistrationDate),
      taxResidence: stored?.taxResidence || 'ZW',
      taxYearStartMonth: Number(stored?.taxYearStartMonth || 1),
      accountantName: stored?.accountantName || '',
      accountantContact: stored?.accountantContact || '',
      taxNotes: stored?.taxNotes || '',
      profileVersion: Number(stored?.version || 1),
      workspaceType: company.workspaceType || null,
      rentalTaxRegimeInferredFromWorkspace: false,
      configuredTaxRules: rules,
      disclaimer: TAX_DISCLAIMER
    };
  },

  async updateOwnerProfile(companyId: string, userId: string, payload: Record<string, unknown>): Promise<OwnerTaxProfile> {
    const company = await Company.findById(asObjectId(companyId, 'companyId'));
    if (!company) throw new AppError('Company not found', 404);
    const before = await this.getOwnerProfile(companyId);

    const rentalTaxRegime = payload.rentalTaxRegime === undefined
      ? undefined
      : normalizeRentalTaxRegime(payload.rentalTaxRegime);
    const taxpayerType = payload.taxpayerType === undefined
      ? undefined
      : isTaxpayerType(payload.taxpayerType)
        ? payload.taxpayerType
        : (() => { throw new AppError('Invalid taxpayerType', 400); })();

    const taxYearStartMonth = payload.taxYearStartMonth === undefined
      ? undefined
      : Number(payload.taxYearStartMonth);
    if (taxYearStartMonth !== undefined && (!Number.isInteger(taxYearStartMonth) || taxYearStartMonth < 1 || taxYearStartMonth > 12)) {
      throw new AppError('taxYearStartMonth must be 1–12', 400);
    }

    const profileSet: Record<string, unknown> = {
      userId: asObjectId(userId, 'userId')
    };
    if (taxpayerType !== undefined) profileSet.taxpayerType = taxpayerType;
    const legalName = optionalString(payload.legalName);
    if (legalName !== undefined) profileSet.legalName = legalName;
    const tradingName = optionalString(payload.tradingName);
    if (tradingName !== undefined) profileSet.tradingName = tradingName;
    const nationalId = optionalString(payload.nationalIdOrCompanyRegistrationReference);
    if (nationalId !== undefined) profileSet.nationalIdOrCompanyRegistrationReference = nationalId;
    if (payload.incomeTaxRegistered !== undefined) profileSet.incomeTaxRegistered = Boolean(payload.incomeTaxRegistered);
    const incomeTaxRegistrationDate = optionalDate(payload.incomeTaxRegistrationDate);
    if (incomeTaxRegistrationDate !== undefined) profileSet.incomeTaxRegistrationDate = incomeTaxRegistrationDate;
    if (rentalTaxRegime !== undefined) profileSet.rentalTaxRegime = rentalTaxRegime;
    const rentalTaxRegistrationDate = optionalDate(payload.rentalTaxRegistrationDate);
    if (rentalTaxRegistrationDate !== undefined) profileSet.rentalTaxRegistrationDate = rentalTaxRegistrationDate;
    const taxResidence = optionalString(payload.taxResidence);
    if (taxResidence !== undefined) profileSet.taxResidence = taxResidence;
    if (taxYearStartMonth !== undefined) profileSet.taxYearStartMonth = taxYearStartMonth;
    const accountantName = optionalString(payload.accountantName);
    if (accountantName !== undefined) profileSet.accountantName = accountantName;
    const accountantContact = optionalString(payload.accountantContact);
    if (accountantContact !== undefined) profileSet.accountantContact = accountantContact;
    const taxNotes = optionalString(payload.taxNotes);
    if (taxNotes !== undefined) profileSet.taxNotes = taxNotes;

    await IndividualTaxProfile.updateOne(
      { companyId: company._id },
      { $set: profileSet, $setOnInsert: { companyId: company._id }, $inc: { version: 1 } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const companySet: Record<string, unknown> = {};
    const tin = optionalString(payload.tin);
    if (tin !== undefined) companySet.tinNumber = tin;
    const vatNumber = optionalString(payload.vatNumber);
    if (vatNumber !== undefined) companySet.vatNumber = vatNumber;
    const trading = optionalString(payload.tradingName);
    if (trading !== undefined) companySet.tradingName = trading;
    if (payload.vatRegistered !== undefined) companySet['taxProfile.vatRegistered'] = Boolean(payload.vatRegistered);
    const vatRegistrationDate = optionalDate(payload.vatRegistrationDate);
    if (vatRegistrationDate !== undefined) companySet['taxProfile.vatRegistrationEffectiveDate'] = vatRegistrationDate;
    const vatCancelled = optionalDate(payload.vatRegistrationCancelledAt);
    if (vatCancelled !== undefined) companySet['taxProfile.vatRegistrationCancelledAt'] = vatCancelled;
    const vatCategory = optionalString(payload.vatCategory);
    if (vatCategory !== undefined) companySet['taxProfile.vatCategory'] = vatCategory;

    if (Object.keys(companySet).length) {
      await Company.updateOne({ _id: company._id }, { $set: companySet });
    }

    await ensureSystemTaxRules();
    const after = await this.getOwnerProfile(companyId);
    await writeAudit({
      companyId,
      eventType: 'TAX_PROFILE_UPDATED',
      sourceId: companyId,
      message: 'Updated individual landlord tax profile',
      metadata: { before, after, userId }
    });
    return after;
  },

  async getPropertyProfile(companyId: string, propertyId: string): Promise<PropertyTaxProfile> {
    const property = await Property.findOne({
      _id: asObjectId(propertyId, 'propertyId'),
      companyId: asObjectId(companyId, 'companyId'),
      isDeleted: { $ne: true }
    });
    if (!property) throw new AppError('Property not found', 404);

    const useClass = isUseClass(property.propertyUseClass) ? property.propertyUseClass : null;
    const storedTreatment = isVatTreatment(property.vatSupplyTreatment) ? property.vatSupplyTreatment : null;
    const vatSupplyTreatment = storedTreatment || (useClass ? defaultSupplyTreatment(useClass) : 'ACCOUNTANT_REVIEW');
    const rentalTaxTreatment = normalizeRentalTaxRegime((property as any).rentalTaxTreatment);
    const reviewReasons = propertyReviewReasons({
      propertyUseClass: useClass,
      vatSupplyTreatment: storedTreatment || vatSupplyTreatment,
      rentalTaxTreatment: (property as any).rentalTaxTreatment
    });

    return {
      propertyId: String(property._id),
      ownerUserId: property.ownerId ? String(property.ownerId) : null,
      companyId: String(property.companyId),
      propertyName: property.name,
      propertyUseClass: useClass,
      vatSupplyTreatment,
      vatEffectiveFrom: isoDate((property as any).vatEffectiveFrom),
      vatEffectiveTo: isoDate((property as any).vatEffectiveTo),
      rentalTaxTreatment,
      rentalTaxEffectiveFrom: isoDate((property as any).rentalTaxEffectiveFrom),
      ownershipPercentage: Number((property as any).ownershipPercentage ?? 100),
      acquisitionDate: isoDate(property.acquisitionDate),
      acquisitionCost: property.acquisitionCost == null ? null : Number(property.acquisitionCost),
      improvementCost: property.improvementCosts == null ? null : Number(property.improvementCosts),
      taxNotes: String((property as any).taxNotes || ''),
      reviewRequired: reviewReasons.length > 0,
      reviewReasons,
      disclaimer: TAX_DISCLAIMER
    };
  },

  async updatePropertyProfile(
    companyId: string,
    userId: string,
    propertyId: string,
    payload: Record<string, unknown>
  ): Promise<PropertyTaxProfile> {
    const property = await Property.findOne({
      _id: asObjectId(propertyId, 'propertyId'),
      companyId: asObjectId(companyId, 'companyId'),
      isDeleted: { $ne: true }
    });
    if (!property) throw new AppError('Property not found', 404);
    const before = await this.getPropertyProfile(companyId, propertyId);

    const $set: Record<string, unknown> = {};
    if (payload.propertyUseClass !== undefined) {
      if (payload.propertyUseClass === null || payload.propertyUseClass === '') {
        // leave unset rather than guessing a class
      } else if (!isUseClass(payload.propertyUseClass)) {
        throw new AppError('Invalid propertyUseClass', 400);
      } else {
        $set.propertyUseClass = payload.propertyUseClass;
      }
    }
    if (payload.vatSupplyTreatment !== undefined) {
      if (!isVatTreatment(payload.vatSupplyTreatment)) throw new AppError('Invalid vatSupplyTreatment', 400);
      $set.vatSupplyTreatment = payload.vatSupplyTreatment;
    }
    const vatEffectiveFrom = optionalDate(payload.vatEffectiveFrom);
    if (vatEffectiveFrom !== undefined) $set.vatEffectiveFrom = vatEffectiveFrom;
    if (
      $set.vatSupplyTreatment &&
      String($set.vatSupplyTreatment) !== String(before.vatSupplyTreatment) &&
      !$set.vatEffectiveFrom &&
      !before.vatEffectiveFrom
    ) {
      throw new AppError('vatEffectiveFrom is required when changing VAT treatment', 400);
    }
    const vatEffectiveTo = optionalDate(payload.vatEffectiveTo);
    if (vatEffectiveTo !== undefined) $set.vatEffectiveTo = vatEffectiveTo;
    if (payload.rentalTaxTreatment !== undefined) {
      $set.rentalTaxTreatment = normalizeRentalTaxRegime(payload.rentalTaxTreatment);
    }
    const rentalTaxEffectiveFrom = optionalDate(payload.rentalTaxEffectiveFrom);
    if (rentalTaxEffectiveFrom !== undefined) $set.rentalTaxEffectiveFrom = rentalTaxEffectiveFrom;
    if (payload.ownershipPercentage !== undefined) {
      const pct = Number(payload.ownershipPercentage);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new AppError('ownershipPercentage must be 0–100', 400);
      $set.ownershipPercentage = pct;
    }
    const acquisitionDate = optionalDate(payload.acquisitionDate);
    if (acquisitionDate !== undefined) $set.acquisitionDate = acquisitionDate;
    if (payload.acquisitionCost !== undefined) {
      const cost = payload.acquisitionCost === null || payload.acquisitionCost === '' ? null : Number(payload.acquisitionCost);
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new AppError('acquisitionCost cannot be negative', 400);
      $set.acquisitionCost = cost;
    }
    if (payload.improvementCost !== undefined || payload.improvementCosts !== undefined) {
      const raw = payload.improvementCost !== undefined ? payload.improvementCost : payload.improvementCosts;
      const cost = raw === null || raw === '' ? null : Number(raw);
      if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new AppError('improvementCost cannot be negative', 400);
      $set.improvementCosts = cost;
    }
    const taxNotes = optionalString(payload.taxNotes);
    if (taxNotes !== undefined) $set.taxNotes = taxNotes;

    if (Object.keys($set).length) {
      await Property.updateOne({ _id: property._id }, { $set });
    }

    const after = await this.getPropertyProfile(companyId, propertyId);
    await writeAudit({
      companyId,
      eventType: 'PROPERTY_TAX_PROFILE_UPDATED',
      sourceId: propertyId,
      message: `Updated property tax profile for ${property.name}`,
      metadata: { before, after, userId }
    });
    return after;
  }
};

export default individualTaxProfileService;
