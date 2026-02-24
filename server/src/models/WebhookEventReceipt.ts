import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IWebhookEventReceipt extends Document {
  provider: string;
  eventId: string;
  companyId?: mongoose.Types.ObjectId;
  paymentId?: mongoose.Types.ObjectId;
  status: 'processing' | 'processed' | 'failed';
  lastError?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEventReceiptSchema = new Schema<IWebhookEventReceipt>(
  {
    provider: { type: String, required: true, index: true },
    eventId: { type: String, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: false, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: false, index: true },
    status: { type: String, enum: ['processing', 'processed', 'failed'], default: 'processing', index: true },
    lastError: { type: String, required: false },
    processedAt: { type: Date, required: false }
  },
  { timestamps: true }
);

WebhookEventReceiptSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const WebhookEventReceipt = mongoose.model<IWebhookEventReceipt>(
  'WebhookEventReceipt',
  WebhookEventReceiptSchema,
  COLLECTIONS.WEBHOOK_EVENT_RECEIPTS
);
