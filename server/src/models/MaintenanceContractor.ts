import mongoose, { Schema, Document } from 'mongoose';

export const CONTRACTOR_TRADES = [
  'Plumber',
  'Electrician',
  'Builder',
  'Painter',
  'Pool Technician',
  'Landscaper',
  'Carpenter',
  'General Contractor',
  'Other',
] as const;

export type ContractorTrade = (typeof CONTRACTOR_TRADES)[number];

export interface IMaintenanceContractor extends Document {
  companyId: mongoose.Types.ObjectId;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  trade: ContractorTrade;
  address?: string;
  notes?: string;
  rating: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceContractorSchema = new Schema<IMaintenanceContractor>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    trade: { type: String, enum: CONTRACTOR_TRADES, required: true },
    address: { type: String },
    notes: { type: String },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'maintenance_contractors' }
);

MaintenanceContractorSchema.index({ companyId: 1, companyName: 1 });
MaintenanceContractorSchema.index({ companyId: 1, trade: 1 });

export const MaintenanceContractor = mongoose.model<IMaintenanceContractor>(
  'MaintenanceContractor',
  MaintenanceContractorSchema
);
