import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { RENTAL_TAX_REGIMES, TAXPAYER_TYPES, type RentalTaxRegime, type TaxpayerType } from '../services/tax/rentalTaxTypes';

export interface IIndividualTaxProfile extends Document {
  companyId: Types.ObjectId;
  userId?: Types.ObjectId | null;
  taxpayerType: TaxpayerType;
  legalName?: string;
  tradingName?: string;
  nationalIdOrCompanyRegistrationReference?: string;
  incomeTaxRegistered: boolean;
  incomeTaxRegistrationDate?: Date | null;
  rentalTaxRegime: RentalTaxRegime;
  rentalTaxRegistrationDate?: Date | null;
  taxResidence?: string;
  taxYearStartMonth: number;
  accountantName?: string;
  accountantContact?: string;
    taxNotes?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const IndividualTaxProfileSchema = new Schema<IIndividualTaxProfile>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null, index: true },
    taxpayerType: { type: String, enum: TAXPAYER_TYPES, default: 'INDIVIDUAL' },
    legalName: { type: String, trim: true, required: false },
    tradingName: { type: String, trim: true, required: false },
    nationalIdOrCompanyRegistrationReference: { type: String, trim: true, required: false },
    incomeTaxRegistered: { type: Boolean, default: false },
    incomeTaxRegistrationDate: { type: Date, required: false, default: null },
    rentalTaxRegime: { type: String, enum: RENTAL_TAX_REGIMES, default: 'ACCOUNTANT_REVIEW', index: true },
    rentalTaxRegistrationDate: { type: Date, required: false, default: null },
    taxResidence: { type: String, trim: true, required: false, default: 'ZW' },
    taxYearStartMonth: { type: Number, min: 1, max: 12, default: 1 },
    accountantName: { type: String, trim: true, required: false },
    accountantContact: { type: String, trim: true, required: false },
    taxNotes: { type: String, trim: true, required: false },
    version: { type: Number, default: 1, min: 1 }
  },
  { timestamps: true }
);

export const IndividualTaxProfile = mongoose.model<IIndividualTaxProfile>(
  'IndividualTaxProfile',
  IndividualTaxProfileSchema,
  COLLECTIONS.INDIVIDUAL_TAX_PROFILES
);
