import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IProperty extends Document {
  name: string;
  address: string;
  type?: 'apartment' | 'house' | 'commercial';
  status?: 'available' | 'rented' | 'maintenance' | 'under_offer' | 'sold';
  rent?: number;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  builtArea?: number;
  landArea?: number;
  description?: string;
  images?: string[];
  amenities?: string[];
  companyId?: mongoose.Types.ObjectId;
  ownerId?: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  propertyOwnerId?: mongoose.Types.ObjectId;
  occupancyRate?: number;
  totalRentCollected?: number;
  currentArrears?: number;
  nextLeaseExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
  units?: number;
  occupiedUnits?: number;
  // New fields
  rentalType?: 'management' | 'introduction' | 'sale';
  commission?: number;
  // New fields for levy/municipal fees
  levyOrMunicipalType?: 'levy' | 'municipal';
  levyOrMunicipalAmount?: number;
  // Sales-specific commission split
  commissionPreaPercent?: number;
  commissionAgencyPercentRemaining?: number;
  commissionAgentPercentRemaining?: number;
  // Sale-specific
  saleType?: 'cash' | 'installment';
}

const PropertySchema: Schema = new Schema({
  name: { 
    type: String, 
    required: [true, 'Property name is required'],
    trim: true
  },
  address: { 
    type: String, 
    required: [true, 'Property address is required'],
    trim: true
  },
  type: { 
    type: String, 
    enum: {
      values: ['apartment', 'house', 'commercial'],
      message: 'Property type must be one of: apartment, house, commercial'
    },
    default: 'apartment'
  },
  status: { 
    type: String, 
    enum: {
      values: ['available', 'rented', 'maintenance', 'under_offer', 'sold'],
      message: 'Status must be one of: available, rented, maintenance, under_offer, sold'
    },
    default: 'available'
  },
  rent: { 
    type: Number, 
    min: [0, 'Rent cannot be negative'],
    default: 0
  },
  price: {
    type: Number,
    min: [0, 'Price cannot be negative'],
    default: 0
  },
  bedrooms: { 
    type: Number, 
    min: [0, 'Number of bedrooms cannot be negative'],
    default: 0
  },
  bathrooms: { 
    type: Number, 
    min: [0, 'Number of bathrooms cannot be negative'],
    default: 0
  },
  area: { 
    type: Number, 
    min: [0, 'Area cannot be negative'],
    default: 0
  },
  builtArea: {
    type: Number,
    min: [0, 'Built area cannot be negative'],
    default: 0
  },
  landArea: {
    type: Number,
    min: [0, 'Land area cannot be negative'],
    default: 0
  },
  description: { 
    type: String, 
    default: 'N/A',
    trim: true
  },
  images: [{ 
    type: String,
    trim: true
  }],
  amenities: [{ 
    type: String,
    trim: true
  }],
  companyId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    immutable: true
  },
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required'],
    immutable: true
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  propertyOwnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PropertyOwner',
    required: false
  },
  occupancyRate: { 
    type: Number, 
    min: [0, 'Occupancy rate cannot be negative'],
    max: [100, 'Occupancy rate cannot exceed 100%'],
    required: false
  },
  totalRentCollected: { 
    type: Number, 
    min: [0, 'Total rent collected cannot be negative'],
    required: false
  },
  currentArrears: { 
    type: Number, 
    min: [0, 'Current arrears cannot be negative'],
    required: false
  },
  nextLeaseExpiry: { 
    type: Date
  },
  units: { 
    type: Number, 
    min: [1, 'Number of units must be at least 1'],
    required: false
  },
  occupiedUnits: { 
    type: Number, 
    min: [0, 'Number of occupied units cannot be negative'],
    required: false
  },
  // New fields
  rentalType: {
    type: String,
    enum: ['management', 'introduction', 'sale'],
    required: false,
  },
  commission: {
    type: Number,
    min: [0, 'Commission cannot be negative'],
    max: [100, 'Commission cannot exceed 100%'],
    default: 15
  },
  commissionPreaPercent: {
    type: Number,
    min: [0, 'PREA percent cannot be negative'],
    max: [100, 'PREA percent cannot exceed 100%'],
    default: 3
  },
  commissionAgencyPercentRemaining: {
    type: Number,
    min: [0, 'Agency percent cannot be negative'],
    max: [100, 'Agency percent cannot exceed 100%'],
    default: 50
  },
  commissionAgentPercentRemaining: {
    type: Number,
    min: [0, 'Agent percent cannot be negative'],
    max: [100, 'Agent percent cannot exceed 100%'],
    default: 50
  },
  // New fields for levy/municipal fees
  levyOrMunicipalType: {
    type: String,
    enum: ['levy', 'municipal'],
    required: false,
  },
  levyOrMunicipalAmount: {
    type: Number,
    required: false,
  },
  saleType: {
    type: String,
    enum: ['cash', 'installment'],
    required: false
  }
}, {
  timestamps: true
});

// Add indexes for common queries
PropertySchema.index({ ownerId: 1 });
PropertySchema.index({ companyId: 1 });
PropertySchema.index({ status: 1 });

export const Property = mongoose.model<IProperty>('Property', PropertySchema, COLLECTIONS.PROPERTIES); 