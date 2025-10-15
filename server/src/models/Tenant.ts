import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface ITenant extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyId: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  // Optional: link a tenant to multiple properties
  propertyIds?: mongoose.Types.ObjectId[];
  ownerId?: mongoose.Types.ObjectId; // Agent who created this tenant
  status: string;
  idNumber?: string;
  emergencyContact?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    immutable: true
  },
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property'
  },
  // Optional: multiple properties linkage
  propertyIds: [{ type: Schema.Types.ObjectId, ref: 'Property' }],
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Pending'],
    default: 'Active'
  },
  idNumber: {
    type: String
  },
  emergencyContact: {
    type: String
  }
}, {
  timestamps: true
});

// Create compound index for email uniqueness per company
tenantSchema.index({ email: 1, companyId: 1 }, { unique: true });
// Add index for ownerId for faster filtering
tenantSchema.index({ ownerId: 1 });

export const Tenant = mongoose.model<ITenant>('Tenant', tenantSchema, COLLECTIONS.TENANTS); 