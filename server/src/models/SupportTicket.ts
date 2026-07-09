import mongoose, { Document, Schema, Types } from 'mongoose';

export type SupportTicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type SupportTicketStatus = 'Open' | 'In Progress' | 'Waiting' | 'Resolved' | 'Closed';

export interface ISupportTicket extends Document {
  companyId: Types.ObjectId;
  subject: string;
  description: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  createdBy?: Types.ObjectId;
  assignedTo?: Types.ObjectId;
  resolvedAt?: Date;
  closedAt?: Date;
  lastActivityAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium', index: true },
    status: { type: String, enum: ['Open', 'In Progress', 'Waiting', 'Resolved', 'Closed'], default: 'Open', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    notes: { type: String, trim: true }
  },
  { timestamps: true }
);

SupportTicketSchema.index({ companyId: 1, status: 1, createdAt: -1 });
SupportTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });

export const SupportTicket = mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema, 'supporttickets');
export default SupportTicket;
