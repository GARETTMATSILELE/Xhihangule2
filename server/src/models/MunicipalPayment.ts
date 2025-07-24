import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IMunicipalPayment extends Document {
  paymentType: 'municipal';
  propertyId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  paymentDate: Date;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit_card' | 'mobile_money';
  amount: number;
  referenceNumber: string;
  notes: string;
  processedBy: mongoose.Types.ObjectId;
  status: 'pending' | 'completed' | 'failed';
  currency: 'USD' | 'ZWL';
  createdAt: Date;
  updatedAt: Date;
  monthlyLevies: number;
}

const MunicipalPaymentSchema: Schema = new Schema({
  paymentType: {
    type: String,
    enum: ['municipal'],
    required: true,
    default: 'municipal',
  },
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    immutable: true
  },
  paymentDate: {
    type: Date,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'credit_card', 'mobile_money'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  referenceNumber: {
    type: String,
    required: false,
    default: '',
  },
  notes: {
    type: String,
  },
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },
  currency: {
    type: String,
    enum: ['USD', 'ZWL'],
    default: 'USD',
  },
  monthlyLevies: {
    type: Number,
    required: false,
  },
}, {
  timestamps: true
});

MunicipalPaymentSchema.index({ companyId: 1, paymentDate: -1 });
MunicipalPaymentSchema.index({ propertyId: 1 });

export const MunicipalPayment = mongoose.model<IMunicipalPayment>('MunicipalPayment', MunicipalPaymentSchema, COLLECTIONS.MUNICIPAL_PAYMENTS); 