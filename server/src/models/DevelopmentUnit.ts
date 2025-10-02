import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type UnitStatus = 'available' | 'under_offer' | 'sold';

export interface IDevelopmentUnit extends Document {
  developmentId: mongoose.Types.ObjectId;
  variationId: string;
  status: UnitStatus;
  unitNumber: number;
  unitCode?: string;
  price?: number;
  buyerId?: mongoose.Types.ObjectId;
  buyerName?: string;
  meta?: {
    block?: string;
    floor?: string;
    bedrooms?: number;
    bathrooms?: number;
    standSize?: number;
  };
  statusHistory?: Array<{
    from?: UnitStatus;
    to: UnitStatus;
    at: Date;
    by?: mongoose.Types.ObjectId;
  }>;
  reservedBy?: mongoose.Types.ObjectId;
  reservedAt?: Date;
  reservationExpiresAt?: Date;
  soldAt?: Date;
  dealId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DevelopmentUnitSchema: Schema = new Schema({
  developmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Development',
    required: true,
    index: true
  },
  variationId: { type: String, required: true, index: true },
  status: { type: String, enum: ['available', 'under_offer', 'sold'], default: 'available', index: true },
  unitNumber: { type: Number, required: true, min: [1, 'Unit number must be >= 1'] },
  unitCode: { type: String, trim: true },
  price: { type: Number, min: [0, 'Price cannot be negative'] },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer' },
  buyerName: { type: String, trim: true },
  meta: {
    block: { type: String, trim: true },
    floor: { type: String, trim: true },
    bedrooms: { type: Number, min: 0 },
    bathrooms: { type: Number, min: 0 },
    standSize: { type: Number, min: 0 }
  },
  statusHistory: [{
    from: { type: String, enum: ['available', 'under_offer', 'sold'] },
    to: { type: String, enum: ['available', 'under_offer', 'sold'], required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  reservedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reservedAt: { type: Date },
  reservationExpiresAt: { type: Date },
  soldAt: { type: Date },
  dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' }
}, {
  timestamps: true
});

DevelopmentUnitSchema.index({ developmentId: 1, status: 1 });
DevelopmentUnitSchema.index({ developmentId: 1, variationId: 1 });
DevelopmentUnitSchema.index({ developmentId: 1, variationId: 1, unitNumber: 1 }, { unique: true });

export const DevelopmentUnit = mongoose.model<IDevelopmentUnit>('DevelopmentUnit', DevelopmentUnitSchema, COLLECTIONS.DEVELOPMENT_UNITS);


