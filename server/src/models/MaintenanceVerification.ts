import mongoose, { Schema, Document } from 'mongoose';

export const VERIFICATION_OUTCOMES = ['Tenant Confirmed', 'Tenant Rejected', 'Unable To Reach'] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

export interface IMaintenanceVerification extends Document {
  requestId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  outcome: VerificationOutcome;
  comments?: string;
  recordedBy?: mongoose.Types.ObjectId;
  recordedAt: Date;
}

const MaintenanceVerificationSchema = new Schema<IMaintenanceVerification>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    outcome: { type: String, enum: VERIFICATION_OUTCOMES, required: true },
    comments: { type: String },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    recordedAt: { type: Date, default: Date.now },
  },
  { collection: 'maintenance_verifications' }
);

export const MaintenanceVerification = mongoose.model<IMaintenanceVerification>(
  'MaintenanceVerification',
  MaintenanceVerificationSchema
);
