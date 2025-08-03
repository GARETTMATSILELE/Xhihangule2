import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IMaintenanceAttachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

export interface IMaintenanceRequest extends Document {
  propertyId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'pending_approval' | 'approved' | 'pending_completion' | 'in_progress' | 'completed' | 'cancelled';
  estimatedCost?: number;
  attachments?: IMaintenanceAttachment[];
  messages: {
    sender: mongoose.Types.ObjectId;
    content: string;
    timestamp: Date;
  }[];
  companyId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceAttachmentSchema: Schema = new Schema({
  name: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    required: true
  }
}, { _id: false });

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
    enum: ['pending', 'pending_approval', 'approved', 'pending_completion', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  estimatedCost: {
    type: Number,
    min: 0
  },
  attachments: [MaintenanceAttachmentSchema],
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