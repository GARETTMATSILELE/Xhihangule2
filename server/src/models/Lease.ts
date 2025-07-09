import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface ILease extends Document {
  propertyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  rentAmount: number;
  depositAmount: number;
  status: 'active' | 'expired' | 'terminated';
  companyId: mongoose.Types.ObjectId;
  
  // Additional lease details
  monthlyRent: number;
  securityDeposit: number;
  petDeposit: number;
  isPetAllowed: boolean;
  maxOccupants: number;
  isUtilitiesIncluded: boolean;
  utilitiesDetails: string;
  rentDueDay: number;
  lateFee: number;
  gracePeriod: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const LeaseSchema: Schema = new Schema({
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  rentAmount: { type: Number, required: true, min: 0 },
  depositAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['active', 'expired', 'terminated'], default: 'active' },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  
  // Additional lease details
  monthlyRent: { type: Number, default: 0, min: 0 },
  securityDeposit: { type: Number, default: 0, min: 0 },
  petDeposit: { type: Number, default: 0, min: 0 },
  isPetAllowed: { type: Boolean, default: false },
  maxOccupants: { type: Number, default: 1, min: 1 },
  isUtilitiesIncluded: { type: Boolean, default: false },
  utilitiesDetails: { type: String, default: '' },
  rentDueDay: { type: Number, default: 1, min: 1, max: 31 },
  lateFee: { type: Number, default: 0, min: 0 },
  gracePeriod: { type: Number, default: 0, min: 0 },
}, {
  timestamps: true
});

export const Lease = mongoose.model<ILease>('Lease', LeaseSchema, COLLECTIONS.LEASES); 