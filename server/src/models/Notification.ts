import mongoose, { Schema, Document } from 'mongoose';
import { User } from './User';
import { sendMail } from '../services/emailService';

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

async function sendNotificationEmail(doc: INotification): Promise<void> {
  try {
    const user = await User.findById(doc.userId).select('email firstName lastName').lean();
    if (!user || !user.email) return;

    const subject = doc.title || 'New notification';
    const linkBase = process.env.CLIENT_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
    const path = doc.link && doc.link.trim().length > 0 ? doc.link.trim() : '/sales-dashboard/notifications';
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${linkBase}${normalizedPath}`;

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const greeting = fullName ? `Hi ${fullName},` : 'Hello,';

    const plain = `${greeting}\n\n${doc.message}\n\nView details: ${url}`;
    const html = [
      `<p>${greeting}</p>`,
      `<p>${doc.message}</p>`,
      `<p><a href="${url}" target="_blank" rel="noopener noreferrer">View details</a></p>`
    ].join('');

    await sendMail({ to: user.email, subject, html, text: plain });
  } catch (e) {
    // Non-fatal: email failures must not block app flows
    console.warn('[notification-email] Failed to send email for notification:', (e as any)?.message || e);
  }
}

NotificationSchema.post('save', function(doc: INotification) {
  // Fire and forget to avoid blocking the request lifecycle
  void sendNotificationEmail(doc);
});

NotificationSchema.post('insertMany', function(docs: INotification[]) {
  for (const d of docs) {
    void sendNotificationEmail(d);
  }
});

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);


