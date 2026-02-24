import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IEventDedupRecord extends Document {
  scope: string;
  eventId: string;
  status: 'processed' | 'failed';
  companyId?: mongoose.Types.ObjectId;
  processedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EventDedupRecordSchema = new Schema<IEventDedupRecord>(
  {
    scope: { type: String, required: true, index: true },
    eventId: { type: String, required: true, index: true },
    status: { type: String, enum: ['processed', 'failed'], default: 'processed', index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: false, index: true },
    processedAt: { type: Date, required: false },
    lastError: { type: String, required: false }
  },
  { timestamps: true }
);

EventDedupRecordSchema.index({ scope: 1, eventId: 1 }, { unique: true });

export const EventDedupRecord = mongoose.model<IEventDedupRecord>(
  'EventDedupRecord',
  EventDedupRecordSchema,
  COLLECTIONS.EVENT_DEDUP_RECORDS
);
