import mongoose, { Document, Schema, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface ICompany extends Document {
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  registrationNumber: string;
  taxNumber: string;
  ownerId: Types.ObjectId;
  description?: string;
  logo?: string;
  isActive: boolean;
  subscriptionStatus: 'active' | 'inactive' | 'trial';
  subscriptionEndDate?: Date;
}

const companySchema = new Schema<ICompany>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  website: {
    type: String,
    trim: true
  },
  registrationNumber: {
    type: String,
    required: true,
    trim: true
  },
  taxNumber: {
    type: String,
    required: true,
    trim: true
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  logo: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'inactive', 'trial'],
    default: 'trial'
  },
  subscriptionEndDate: {
    type: Date
  }
}, {
  timestamps: true
});

// Remove index definitions as they are now handled in indexes.ts
export const Company = mongoose.model<ICompany>('Company', companySchema, COLLECTIONS.COMPANIES);
export default Company; 