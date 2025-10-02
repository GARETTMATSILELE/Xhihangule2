import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IValuation extends Document {
  companyId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  propertyAddress: string;
  country: string;
  city: string;
  suburb: string;
  category: 'residential' | 'commercial_office' | 'industrial';
  propertyType?: 'townhouse' | 'house' | 'apartment' | 'cluster' | 'semidetached';
  bedrooms?: number;
  bathrooms?: number;
  landSize?: number;
  zoning?: string;
  amenitiesResidential?: string[];
  amenitiesCommercial?: string[];
  amenitiesIndustrial?: string[];
  outBuildings?: boolean;
  staffQuarters?: boolean;
  cottage?: boolean;
  estimatedValue?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ValuationSchema: Schema = new Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  propertyAddress: { type: String, required: true, trim: true },
  country: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true, index: true },
  suburb: { type: String, required: false, trim: true, index: true },
  category: { type: String, enum: ['residential', 'commercial_office', 'industrial'], required: true, index: true },
  propertyType: { type: String, enum: ['townhouse', 'house', 'apartment', 'cluster', 'semidetached'], required: false },
  bedrooms: { type: Number, min: 0 },
  bathrooms: { type: Number, min: 0 },
  landSize: { type: Number, min: 0 },
  zoning: { type: String, trim: true },
  amenitiesResidential: [{ type: String, trim: true }],
  amenitiesCommercial: [{ type: String, trim: true }],
  amenitiesIndustrial: [{ type: String, trim: true }],
  outBuildings: { type: Boolean, default: false },
  staffQuarters: { type: Boolean, default: false },
  cottage: { type: Boolean, default: false },
  estimatedValue: { type: Number, min: 0 }
}, { timestamps: true });

export const Valuation = mongoose.model<IValuation>('Valuation', ValuationSchema, COLLECTIONS.VALUATIONS);





