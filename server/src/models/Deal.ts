import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type DealStage = 'Offer' | 'Due Diligence' | 'Contract' | 'Closing' | 'Won';

export interface IDeal extends Document {
  propertyId: mongoose.Types.ObjectId;
  leadId?: mongoose.Types.ObjectId;
  buyerName: string;
  buyerEmail?: string;
  buyerPhone?: string;
  stage: DealStage;
  offerPrice: number;
  closeDate?: Date | null;
  won: boolean;
  notes?: string;
  companyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId; // agent user creating the deal
  createdAt: Date;
  updatedAt: Date;
}

const DealSchema: Schema = new Schema({
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
  buyerName: { type: String, required: true, trim: true },
  buyerEmail: { type: String, trim: true },
  buyerPhone: { type: String, trim: true },
  stage: { type: String, enum: ['Offer','Due Diligence','Contract','Closing','Won'], default: 'Offer' },
  offerPrice: { type: Number, required: true, min: 0 },
  closeDate: { type: Date, default: null },
  won: { type: Boolean, default: false },
  notes: { type: String, default: '' },
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

DealSchema.index({ companyId: 1 });
DealSchema.index({ ownerId: 1 });
DealSchema.index({ propertyId: 1 });
DealSchema.index({ companyId: 1, stage: 1 });
DealSchema.index({ companyId: 1, ownerId: 1, stage: 1 });

export const Deal = mongoose.model<IDeal>('Deal', DealSchema, 'deals');


