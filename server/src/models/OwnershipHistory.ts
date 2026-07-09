import mongoose, { Schema, Document } from 'mongoose';

export interface IOwnershipHistory extends Document {
  propertyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate?: Date;
  ownershipPercentage: number;
  notes?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const OwnershipHistorySchema = new Schema<IOwnershipHistory>(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'PropertyOwner', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    ownershipPercentage: { type: Number, default: 100, min: 0, max: 100 },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'ownership_history' }
);

OwnershipHistorySchema.index({ propertyId: 1, startDate: -1 });

export const OwnershipHistory = mongoose.model<IOwnershipHistory>(
  'OwnershipHistory',
  OwnershipHistorySchema
);
