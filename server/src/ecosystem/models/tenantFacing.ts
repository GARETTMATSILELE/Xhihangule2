import mongoose, { Document, Schema } from 'mongoose';

export interface ITenantProfile extends Document {
  userId: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  fullName: string;
  phone?: string;
  email: string;
  idNumber?: string;
  passportNumber?: string;
  address?: string;
  employmentStatus?: string;
  employer?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  householdSize?: number;
  pets?: string;
  rentalPreferences?: string;
  preferredLocations?: string[];
  previousRentalInfo?: string;
  documents?: Array<{ type: string; url: string; name: string }>;
  profileCompletionPercent: number;
  createdAt: Date;
  updatedAt: Date;
}

const TenantProfileSchema = new Schema<ITenantProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    idNumber: { type: String, trim: true },
    passportNumber: { type: String, trim: true },
    address: { type: String },
    employmentStatus: { type: String },
    employer: { type: String },
    emergencyContactName: { type: String },
    emergencyContactPhone: { type: String },
    householdSize: { type: Number, min: 1 },
    pets: { type: String },
    rentalPreferences: { type: String },
    preferredLocations: [{ type: String }],
    previousRentalInfo: { type: String },
    documents: [{ type: { type: String }, url: { type: String }, name: { type: String }, _id: false }],
    profileCompletionPercent: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true, collection: 'tenant_profiles' }
);

export const TenantProfile = mongoose.model<ITenantProfile>('TenantProfile', TenantProfileSchema);

export interface IViewingRequest extends Document {
  tenantUserId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  requestedDate: Date;
  preferredTime?: string;
  attendees?: number;
  message?: string;
  status: string;
  agentNotes?: string;
  proposedDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ViewingRequestSchema = new Schema<IViewingRequest>(
  {
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    requestedDate: { type: Date, required: true },
    preferredTime: { type: String },
    attendees: { type: Number, min: 1, default: 1 },
    message: { type: String },
    status: {
      type: String,
      enum: ['REQUESTED', 'UNDER_REVIEW', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'DECLINED'],
      default: 'REQUESTED',
      index: true,
    },
    agentNotes: { type: String },
    proposedDate: { type: Date },
  },
  { timestamps: true, collection: 'viewing_requests' }
);

ViewingRequestSchema.index({ companyId: 1, status: 1, createdAt: -1 });

export const ViewingRequest = mongoose.model<IViewingRequest>('ViewingRequest', ViewingRequestSchema);

export interface IRentalApplication extends Document {
  tenantUserId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  ownerId?: mongoose.Types.ObjectId;
  status: string;
  notes?: string;
  agentNotes?: string;
  submittedAt?: Date;
  snapshot: Record<string, any>;
  documents?: Array<{ type: string; url: string; name: string }>;
  statusHistory: Array<{ status: string; at: Date; by?: mongoose.Types.ObjectId; note?: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const RentalApplicationSchema = new Schema<IRentalApplication>(
  {
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'PropertyOwner' },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'SENT_TO_OWNER', 'OWNER_APPROVED', 'OWNER_DECLINED', 'MORE_INFORMATION_REQUIRED', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'LEASE_PREPARATION', 'LEASE_SIGNED'],
      default: 'DRAFT',
      index: true,
    },
    notes: { type: String },
    agentNotes: { type: String },
    submittedAt: { type: Date },
    snapshot: { type: Schema.Types.Mixed, default: {} },
    documents: [{ type: { type: String }, url: { type: String }, name: { type: String }, _id: false }],
    statusHistory: [{
      status: { type: String, required: true },
      at: { type: Date, default: Date.now },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      note: { type: String },
      _id: false,
    }],
  },
  { timestamps: true, collection: 'rental_applications' }
);

RentalApplicationSchema.index({ companyId: 1, propertyId: 1, tenantUserId: 1 });

export const RentalApplication = mongoose.model<IRentalApplication>('RentalApplication', RentalApplicationSchema);
