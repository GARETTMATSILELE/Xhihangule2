import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type DevelopmentType = 'stands' | 'apartments' | 'houses' | 'semidetached' | 'townhouses';

export interface IDevelopmentVariation {
  id: string;
  label: string;
  count: number;
  price?: number;
  size?: number;
}

export interface IDevelopment extends Document {
  name: string;
  type: DevelopmentType;
  description?: string;
  companyId: mongoose.Types.ObjectId;
  owner?: {
    firstName?: string;
    lastName?: string;
    companyName?: string;
    email?: string;
    idNumber?: string;
    phone?: string;
  };
  variations: IDevelopmentVariation[];
  cachedStats?: {
    totalUnits: number;
    availableUnits: number;
    underOfferUnits: number;
    soldUnits: number;
  };
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DevelopmentSchema: Schema = new Schema({
  name: {
    type: String,
    required: [true, 'Development name is required'],
    trim: true
  },
  type: {
    type: String,
    enum: {
      values: ['stands', 'apartments', 'houses', 'semidetached', 'townhouses'],
      message: 'Type must be one of: stands, apartments, houses, semidetached, townhouses'
    },
    required: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  owner: {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    companyName: { type: String, trim: true },
    email: { type: String, trim: true },
    idNumber: { type: String, trim: true },
    phone: { type: String, trim: true }
  },
  variations: [{
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    count: { type: Number, required: true, min: [1, 'Count must be at least 1'] },
    price: { type: Number, min: [0, 'Price cannot be negative'] },
    size: { type: Number, min: [0, 'Size cannot be negative'] }
  }],
  cachedStats: {
    totalUnits: { type: Number, default: 0, min: 0 },
    availableUnits: { type: Number, default: 0, min: 0 },
    underOfferUnits: { type: Number, default: 0, min: 0 },
    soldUnits: { type: Number, default: 0, min: 0 }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

DevelopmentSchema.index({ companyId: 1 });
DevelopmentSchema.index({ name: 'text' });

export const Development = mongoose.model<IDevelopment>('Development', DevelopmentSchema, COLLECTIONS.DEVELOPMENTS);





