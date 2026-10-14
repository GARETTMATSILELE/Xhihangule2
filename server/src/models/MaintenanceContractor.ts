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
  userId?: mongoose.Types.ObjectId;
  skills?: string[];
  serviceAreas?: string[];
  availability?: string;
  description?: string;
  verificationStatus?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'SUSPENDED';
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
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    skills: [{ type: String, trim: true }],
    serviceAreas: [{ type: String, trim: true }],
    availability: { type: String, trim: true },
    description: { type: String },
    verificationStatus: {
      type: String,
      enum: ['UNVERIFIED', 'PENDING', 'VERIFIED', 'SUSPENDED'],
      default: 'UNVERIFIED',
      index: true
    },
  },
  { timestamps: true, collection: 'maintenance_contractors' }
);

MaintenanceContractorSchema.index({ companyId: 1, companyName: 1 });
MaintenanceContractorSchema.index({ companyId: 1, trade: 1 });

export const MaintenanceContractor = mongoose.model<IMaintenanceContractor>(
  'MaintenanceContractor',
  MaintenanceContractorSchema
);

/** Agency-owned vendors plus every active self-registered contractor, so any agency can offer them work. */
export function contractorDirectoryFilter(agencyCompanyId?: string) {
  return {
    verificationStatus: { $ne: 'SUSPENDED' as const },
    $or: [
      ...(agencyCompanyId ? [{ companyId: agencyCompanyId }] : []),
      { userId: { $exists: true, $ne: null }, active: true },
    ],
  };
}
