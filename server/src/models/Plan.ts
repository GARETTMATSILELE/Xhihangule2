import mongoose, { Document, Schema, Types } from 'mongoose';

export type SaaSPlanCode = 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';

export interface IPlan extends Document {
  code: SaaSPlanCode;
  name: string;
  description?: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: 'USD' | 'ZiG' | 'ZWL';
  limits: {
    maxUsers?: number | null;
    maxProperties?: number | null;
    maxTenants?: number | null;
    maxLeases?: number | null;
    maxStorage?: number | null;
  };
  featureFlags: {
    maintenance: boolean;
    reports: boolean;
    accounting: boolean;
    ownersPortal: boolean;
    whatsappIntegration: boolean;
    apiAccess: boolean;
    commissionEnabled?: boolean;
    agentAccounts?: boolean;
    propertyAccounts?: boolean;
  };
  isActive: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PlanSchema = new Schema<IPlan>(
  {
    code: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    monthlyPrice: { type: Number, required: true, min: 0, default: 0 },
    annualPrice: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, enum: ['USD', 'ZiG', 'ZWL'], default: 'USD' },
    limits: {
      maxUsers: { type: Number, default: null },
      maxProperties: { type: Number, default: null },
      maxTenants: { type: Number, default: null },
      maxLeases: { type: Number, default: null },
      maxStorage: { type: Number, default: null }
    },
    featureFlags: {
      maintenance: { type: Boolean, default: true },
      reports: { type: Boolean, default: true },
      accounting: { type: Boolean, default: true },
      ownersPortal: { type: Boolean, default: true },
      whatsappIntegration: { type: Boolean, default: false },
      apiAccess: { type: Boolean, default: false },
      commissionEnabled: { type: Boolean, default: true },
      agentAccounts: { type: Boolean, default: true },
      propertyAccounts: { type: Boolean, default: true }
    },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

export const Plan = mongoose.model<IPlan>('Plan', PlanSchema, 'plans');
export default Plan;
