import mongoose, { Schema, Document } from 'mongoose';
import { OWNER_COLLECTION_STATUSES } from '../services/ownerCollectionService';

export interface IOwnerCollection extends Document {
  companyId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  operationalAmount: number;
  authoritativeAmount?: number;
  amountSource?: 'OWNER_WATERFALL' | 'OPERATIONAL_OVERRIDE';
  overrideReason?: string;
  currency: string;
  status: string;
  notes?: string;
  acknowledgementReference?: string;
  requestedBy?: mongoose.Types.ObjectId;
  preparedBy?: mongoose.Types.ObjectId;
  collectedBy?: mongoose.Types.ObjectId;
}

const schema = new Schema<IOwnerCollection>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'PropertyOwner', required: true, index: true },
  operationalAmount: { type: Number, required: true, min: 0 },
  authoritativeAmount: { type: Number, min: 0 },
  amountSource: { type: String, enum: ['OWNER_WATERFALL', 'OPERATIONAL_OVERRIDE'], default: 'OWNER_WATERFALL' },
  overrideReason: { type: String },
  currency: { type: String, default: 'USD' },
  status: { type: String, enum: OWNER_COLLECTION_STATUSES, default: 'OWNER_REQUESTED', index: true },
  notes: { type: String },
  acknowledgementReference: { type: String },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  preparedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  collectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, collection: 'owner_collections' });

export const OwnerCollection = mongoose.model<IOwnerCollection>('OwnerCollection', schema);
