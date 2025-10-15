import mongoose, { Schema, Document } from 'mongoose';

export interface IBuyer extends Document {
  name: string;
  email?: string;
  phone?: string;
  idNumber?: string;
  budgetMin?: number;
  budgetMax?: number;
  prefs?: string;
  developmentId?: mongoose.Types.ObjectId;
  developmentUnitId?: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId; // agent user
  createdAt: Date;
  updatedAt: Date;
}

const BuyerSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  idNumber: { type: String, trim: true },
  budgetMin: { type: Number, default: 0, min: 0 },
  budgetMax: { type: Number, default: 0, min: 0 },
  prefs: { type: String, default: '' },
  developmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Development' },
  developmentUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'DevelopmentUnit' },
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
BuyerSchema.index({ developmentId: 1 });
BuyerSchema.index({ developmentUnitId: 1 });

export const Buyer = mongoose.model<IBuyer>('Buyer', BuyerSchema, 'buyers');


