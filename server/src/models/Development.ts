import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type DevelopmentType = 'stands' | 'apartments' | 'houses' | 'semidetached' | 'townhouses' | 'land';

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
  address?: string;
  companyId: mongoose.Types.ObjectId;
  collaborators?: mongoose.Types.ObjectId[]; // additional agent users who can access this development
  owner?: {
    firstName?: string;
    lastName?: string;
    companyName?: string;
    email?: string;
    idNumber?: string;
    phone?: string;
  };
  variations: IDevelopmentVariation[];
  // Commission structure applied across all variations/units in this development
  commissionPercent?: number;
  commissionPreaPercent?: number;
  commissionAgencyPercentRemaining?: number;
  commissionAgentPercentRemaining?: number;
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
      values: ['stands', 'apartments', 'houses', 'semidetached', 'townhouses', 'land'],
      message: 'Type must be one of: stands, apartments, houses, semidetached, townhouses, land'
    },
    required: true,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
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
  commissionPercent: { type: Number, min: 0 },
  commissionPreaPercent: { type: Number, min: 0 },
  commissionAgencyPercentRemaining: { type: Number, min: 0, max: 100 },
  commissionAgentPercentRemaining: { type: Number, min: 0, max: 100 },
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





