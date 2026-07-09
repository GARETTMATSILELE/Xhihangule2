import mongoose, { Schema, Document } from 'mongoose';

export interface IViewing extends Document {
  propertyId: mongoose.Types.ObjectId;
  buyerId?: mongoose.Types.ObjectId; // optional link to buyers collection
  leadId?: mongoose.Types.ObjectId; // optional link to leads collection
  when: Date;
  status: 'Scheduled' | 'Done' | 'No-show' | 'Completed' | 'Rescheduled' | 'Cancelled' | 'No Show';
  outcome?: 'Interested' | 'Not Interested' | 'Need Follow-Up' | 'Applied';
  completedAt?: Date;
  notes?: string;
  companyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId; // agent user
  createdAt: Date;
  updatedAt: Date;
}

const ViewingSchema: Schema = new Schema({
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
  buyerId: { type: Schema.Types.ObjectId, ref: 'Buyer' },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
  when: { type: Date, required: true },
  status: {
    type: String,
    enum: ['Scheduled','Done','No-show','Completed','Rescheduled','Cancelled','No Show'],
    default: 'Scheduled'
  },
  outcome: { type: String, enum: ['Interested','Not Interested','Need Follow-Up','Applied'], required: false },
  completedAt: { type: Date, required: false },
  notes: { type: String, default: '' },
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

ViewingSchema.index({ companyId: 1 });
ViewingSchema.index({ ownerId: 1 });
ViewingSchema.index({ propertyId: 1 });
ViewingSchema.index({ companyId: 1, leadId: 1, when: -1 });

export const Viewing = mongoose.model<IViewing>('Viewing', ViewingSchema, 'viewings');


