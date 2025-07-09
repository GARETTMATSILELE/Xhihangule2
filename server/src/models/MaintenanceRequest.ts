import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IMaintenanceRequest extends Document {
  propertyId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  estimatedCost?: number;
  attachments?: string[];
  messages: {
    sender: mongoose.Types.ObjectId;
    content: string;
    timestamp: Date;
  }[];
  companyId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceRequestSchema: Schema = new Schema({
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  requestedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'PropertyOwner',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  estimatedCost: {
    type: Number,
    min: 0
  },
  attachments: [{
    type: String
  }],
  messages: [{
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  }
}, {
  timestamps: true
});

export const MaintenanceRequest = mongoose.model<IMaintenanceRequest>('MaintenanceRequest', MaintenanceRequestSchema, COLLECTIONS.MAINTENANCE_REQUESTS); 