import mongoose, { Schema, Document } from 'mongoose';

export interface ILead extends Document {
  name: string;
  source?: string;
  interest?: string;
  notes?: string;
  email?: string;
  phone?: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Viewing' | 'Offer' | 'Won' | 'Lost';
  pipelineStage?: 'NEW' | 'CONTACTED' | 'VIEWING_SCHEDULED' | 'VIEWED' | 'APPLICATION_RECEIVED' | 'APPROVED' | 'LEASE_PENDING' | 'CONVERTED' | 'LOST';
  leadScore?: number;
  nextFollowUpDate?: Date;
  lastContactDate?: Date;
  followUpStatus?: 'pending' | 'due' | 'overdue' | 'completed' | 'snoozed';
  assignedAgent?: mongoose.Types.ObjectId;
  interestedPropertyIds?: mongoose.Types.ObjectId[];
  convertedTenantId?: mongoose.Types.ObjectId;
  convertedLeaseId?: mongoose.Types.ObjectId;
  convertedAt?: Date;
  archivedAt?: Date;
  activityTimeline?: Array<{
    type: string;
    label: string;
    notes?: string;
    createdAt: Date;
    createdBy?: mongoose.Types.ObjectId;
  }>;
  followUpTasks?: Array<{
    type: string;
    title: string;
    dueDate?: Date;
    status?: 'pending' | 'completed' | 'cancelled';
    notes?: string;
    createdAt?: Date;
  }>;
  // Optional lead requirements (all optional; used for suggestions only)
  budgetMin?: number;
  budgetMax?: number;
  preferredSuburbs?: string[];
  propertyType?: 'apartment' | 'house' | 'commercial' | 'land' | string;
  minBedrooms?: number;
  features?: string[]; // e.g. ['Borehole','Solar','Security']
  createdAt: Date;
  updatedAt: Date;
  companyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId; // agent user creating/owning this lead
}

const LeadSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  source: { type: String, trim: true, default: '' },
  interest: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  status: { type: String, enum: ['New','Contacted','Qualified','Viewing','Offer','Won','Lost'], default: 'New' },
  pipelineStage: {
    type: String,
    enum: ['NEW','CONTACTED','VIEWING_SCHEDULED','VIEWED','APPLICATION_RECEIVED','APPROVED','LEASE_PENDING','CONVERTED','LOST'],
    default: 'NEW'
  },
  leadScore: { type: Number, min: 0, max: 100, required: false },
  nextFollowUpDate: { type: Date, required: false },
  lastContactDate: { type: Date, required: false },
  followUpStatus: {
    type: String,
    enum: ['pending','due','overdue','completed','snoozed'],
    default: 'pending'
  },
  assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  interestedPropertyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Property' }],
  convertedTenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  convertedLeaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lease' },
  convertedAt: { type: Date, required: false },
  archivedAt: { type: Date, required: false },
  activityTimeline: [{
    type: { type: String, trim: true },
    label: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  followUpTasks: [{
    type: { type: String, trim: true },
    title: { type: String, trim: true },
    dueDate: { type: Date },
    status: { type: String, enum: ['pending','completed','cancelled'], default: 'pending' },
    notes: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now }
  }],
  // Requirements (optional)
  budgetMin: { type: Number, min: 0, required: false },
  budgetMax: { type: Number, min: 0, required: false },
  preferredSuburbs: [{ type: String, trim: true }],
  propertyType: { type: String, trim: true, required: false },
  minBedrooms: { type: Number, min: 0, required: false },
  features: [{ type: String, trim: true }],
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    immutable: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true
  }
}, { timestamps: true });

LeadSchema.index({ companyId: 1 });
LeadSchema.index({ ownerId: 1 });
LeadSchema.index({ companyId: 1, pipelineStage: 1, createdAt: -1 });
LeadSchema.index({ companyId: 1, nextFollowUpDate: 1 });

export const Lead = mongoose.model<ILead>('Lead', LeadSchema, 'leads');


