import mongoose, { Schema, Document } from 'mongoose';

export interface IInstallmentPlan extends Document {
  companyId: mongoose.Types.ObjectId;
  saleId?: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  currency: string;
  principalAmount: number;
  interestAmount?: number;
  totalAmount: number;
  frequency: 'monthly' | 'quarterly' | 'once';
  numInstallments: number;
  startDate: Date;
  graceDays?: number;
  penaltyPolicy?: {
    percentPerPeriod?: number;
    fixedAmount?: number;
  };
  status: 'open' | 'closed' | 'written_off';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InstallmentPlanSchema: Schema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  saleId: { type: Schema.Types.ObjectId, ref: 'SalesContract', index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property' },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
  currency: { type: String, default: 'USD' },
  principalAmount: { type: Number, required: true },
  interestAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  frequency: { type: String, enum: ['monthly', 'quarterly', 'once'], default: 'monthly' },
  numInstallments: { type: Number, required: true, min: 1 },
  startDate: { type: Date, required: true },
  graceDays: { type: Number, default: 0 },
  penaltyPolicy: {
    percentPerPeriod: { type: Number },
    fixedAmount: { type: Number }
  },
  status: { type: String, enum: ['open', 'closed', 'written_off'], default: 'open', index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

InstallmentPlanSchema.index({ companyId: 1, saleId: 1 }, { unique: false });

export const InstallmentPlan = mongoose.model<IInstallmentPlan>('InstallmentPlan', InstallmentPlanSchema, 'installmentplans');




