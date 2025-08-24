import mongoose, { Schema, Document } from 'mongoose';

export interface ILead extends Document {
  name: string;
  source?: string;
  interest?: string;
  email?: string;
  phone?: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Viewing' | 'Offer' | 'Won' | 'Lost';
  createdAt: Date;
  updatedAt: Date;
  companyId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId; // agent user creating/owning this lead
}

const LeadSchema: Schema = new Schema({
  name: { type: String, required: true, trim: true },
  source: { type: String, trim: true, default: '' },
  interest: { type: String, trim: true, default: '' },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  status: { type: String, enum: ['New','Contacted','Qualified','Viewing','Offer','Won','Lost'], default: 'New' },
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

export const Lead = mongoose.model<ILead>('Lead', LeadSchema, 'leads');


