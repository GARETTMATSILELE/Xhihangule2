import mongoose, { Schema, Document } from 'mongoose';

export interface IOwnerRentNotice extends Document {
  companyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  paymentId: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  idempotencyKey: string;
  status: 'PENDING' | 'SENT' | 'SKIPPED_OPT_OUT' | 'FAILED';
  failureReason?: string;
}

const schema = new Schema<IOwnerRentNotice>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'PropertyOwner', required: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property' },
  idempotencyKey: { type: String, required: true, unique: true },
  status: { type: String, enum: ['PENDING', 'SENT', 'SKIPPED_OPT_OUT', 'FAILED'], required: true },
  failureReason: { type: String },
}, { timestamps: true, collection: 'owner_rent_notices' });

export const OwnerRentNotice = mongoose.model<IOwnerRentNotice>('OwnerRentNotice', schema);
