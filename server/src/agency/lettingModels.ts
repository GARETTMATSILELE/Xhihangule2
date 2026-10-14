import mongoose, { Schema, Document } from 'mongoose';

export interface IPropertyAssessment extends Document {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  assessmentDate: Date;
  recommendedRent: number;
  approvedRent?: number;
  condition?: string;
  marketObservations?: string;
  ownerRecommendation?: string;
  notes?: string;
  status: string;
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
  decisionComment?: string;
}

const assessmentSchema = new Schema<IPropertyAssessment>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  agentId: { type: Schema.Types.ObjectId, ref: 'User' },
  assessmentDate: { type: Date, required: true },
  recommendedRent: { type: Number, required: true, min: 0 },
  approvedRent: { type: Number, min: 0 },
  condition: { type: String },
  marketObservations: { type: String },
  ownerRecommendation: { type: String },
  notes: { type: String },
  status: { type: String, enum: ['ASSESSMENT_DRAFT', 'ASSESSMENT_SUBMITTED', 'OWNER_APPROVED', 'OWNER_REJECTED'], default: 'ASSESSMENT_DRAFT' },
  decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  decidedAt: { type: Date },
  decisionComment: { type: String },
}, { timestamps: true, collection: 'property_assessments' });

export const PropertyAssessment = mongoose.model<IPropertyAssessment>('PropertyAssessment', assessmentSchema);

export interface IRentalMandate extends Document {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  ownerId?: mongoose.Types.ObjectId;
  status: string;
  agreedRent?: number;
  documentUrl?: string;
  signedAt?: Date;
  notes?: string;
}

const mandateSchema = new Schema<IRentalMandate>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'PropertyOwner' },
  status: { type: String, enum: ['DRAFT', 'SENT', 'SIGNED', 'DECLINED', 'EXPIRED'], default: 'DRAFT' },
  agreedRent: { type: Number, min: 0 },
  documentUrl: { type: String },
  signedAt: { type: Date },
  notes: { type: String },
}, { timestamps: true, collection: 'rental_mandates' });

export const RentalMandate = mongoose.model<IRentalMandate>('RentalMandate', mandateSchema);

export interface IListingReference extends Document {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  platform: string;
  reference?: string;
  url?: string;
  status: string;
  listedAt?: Date;
  removedAt?: Date;
  listedBy?: mongoose.Types.ObjectId;
  lastVerifiedAt?: Date;
  notes?: string;
}

const listingSchema = new Schema<IListingReference>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  platform: { type: String, required: true },
  reference: { type: String },
  url: { type: String },
  status: { type: String, enum: ['PRE_LISTING', 'ACTIVE', 'REMOVED'], default: 'PRE_LISTING' },
  listedAt: { type: Date },
  removedAt: { type: Date },
  listedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  lastVerifiedAt: { type: Date },
  notes: { type: String },
}, { timestamps: true, collection: 'listing_references' });

export const ListingReference = mongoose.model<IListingReference>('ListingReference', listingSchema);

const auditSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', index: true },
  actorId: { type: Schema.Types.ObjectId },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  previousState: { type: String },
  newState: { type: String },
  reason: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'agency_workflow_events' });

export const AgencyWorkflowEvent = mongoose.model('AgencyWorkflowEvent', auditSchema);
