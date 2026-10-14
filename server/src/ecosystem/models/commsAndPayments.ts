import mongoose, { Document, Schema } from 'mongoose';

export interface ICommunicationPreference extends Document {
  userId: mongoose.Types.ObjectId;
  emailAvailable: boolean;
  smsAvailable: boolean;
  whatsappAvailable: boolean;
  inAppAvailable: boolean;
  emailOperational: boolean;
  smsOperational: boolean;
  whatsappOperational: boolean;
  emailMarketing: boolean;
  smsMarketing: boolean;
  whatsappMarketing: boolean;
  phone?: string;
  whatsappNumber?: string;
  updatedAt: Date;
}

const CommunicationPreferenceSchema = new Schema<ICommunicationPreference>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    emailAvailable: { type: Boolean, default: true },
    smsAvailable: { type: Boolean, default: false },
    whatsappAvailable: { type: Boolean, default: false },
    inAppAvailable: { type: Boolean, default: true },
    emailOperational: { type: Boolean, default: true },
    smsOperational: { type: Boolean, default: true },
    whatsappOperational: { type: Boolean, default: true },
    emailMarketing: { type: Boolean, default: false },
    smsMarketing: { type: Boolean, default: false },
    whatsappMarketing: { type: Boolean, default: false },
    phone: { type: String },
    whatsappNumber: { type: String },
  },
  { timestamps: true, collection: 'communication_preferences' }
);

export const CommunicationPreference = mongoose.model<ICommunicationPreference>(
  'CommunicationPreference',
  CommunicationPreferenceSchema
);

export interface INotificationDelivery extends Document {
  notificationId?: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  eventType: string;
  channel: string;
  status: string;
  provider?: string;
  providerMessageId?: string;
  templateName?: string;
  idempotencyKey: string;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationDeliverySchema = new Schema<INotificationDelivery>(
  {
    notificationId: { type: Schema.Types.ObjectId, ref: 'Notification', index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventType: { type: String, required: true, index: true },
    channel: { type: String, enum: ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'], required: true, index: true },
    status: { type: String, enum: ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'], default: 'QUEUED', index: true },
    provider: { type: String },
    providerMessageId: { type: String, index: true },
    templateName: { type: String },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String },
    retryCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'notification_deliveries' }
);

export const NotificationDelivery = mongoose.model<INotificationDelivery>(
  'NotificationDelivery',
  NotificationDeliverySchema
);

export interface IEcosystemPaymentIntent extends Document {
  companyId: mongoose.Types.ObjectId;
  tenantUserId: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  leaseId?: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  idempotencyKey: string;
  providerRef?: string;
  paymentId?: mongoose.Types.ObjectId;
  rawProviderResponse?: any;
  createdAt: Date;
  updatedAt: Date;
}

const EcosystemPaymentIntentSchema = new Schema<IEcosystemPaymentIntent>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    tenantUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    leaseId: { type: Schema.Types.ObjectId, ref: 'Lease' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    provider: { type: String, default: 'stub' },
    status: {
      type: String,
      enum: ['pending', 'provider_created', 'paid', 'failed', 'cancelled', 'expired', 'reconciled'],
      default: 'pending',
      index: true,
    },
    idempotencyKey: { type: String, required: true, unique: true },
    providerRef: { type: String, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    rawProviderResponse: { type: Schema.Types.Mixed },
  },
  { timestamps: true, collection: 'ecosystem_payment_intents' }
);

export const EcosystemPaymentIntent = mongoose.model<IEcosystemPaymentIntent>(
  'EcosystemPaymentIntent',
  EcosystemPaymentIntentSchema
);
