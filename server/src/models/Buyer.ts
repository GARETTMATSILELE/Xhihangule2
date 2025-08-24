import mongoose, { Schema, Document } from 'mongoose';

export interface IBuyer extends Document {
  name: string;
  email?: string;
  phone?: string;
  budgetMin?: number;
  budgetMax?: number;
  prefs?: string;
  companyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId; // agent user
  createdAt: Date;
  updatedAt: Date;
}

const BuyerSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  budgetMin: { type: Number, default: 0, min: 0 },
  budgetMax: { type: Number, default: 0, min: 0 },
  prefs: { type: String, default: '' },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    immutable: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true
  }
}, { timestamps: true });

BuyerSchema.index({ companyId: 1 });
BuyerSchema.index({ ownerId: 1 });

export const Buyer = mongoose.model<IBuyer>('Buyer', BuyerSchema, 'buyers');


