import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  companyId: string;
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  payload?: any;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  companyId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: { type: String },
  read: { type: Boolean, default: false },
  payload: { type: Schema.Types.Mixed }
}, { timestamps: true });

NotificationSchema.index({ companyId: 1, userId: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);


