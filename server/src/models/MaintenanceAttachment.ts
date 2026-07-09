import mongoose, { Schema, Document } from 'mongoose';

export const MAINTENANCE_PHOTO_TYPES = ['BEFORE', 'AFTER'] as const;
export type MaintenancePhotoType = (typeof MAINTENANCE_PHOTO_TYPES)[number];

export const ALLOWED_ATTACHMENT_MIME = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export interface IMaintenanceAttachment extends Document {
  requestId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  type: MaintenancePhotoType;
  fileUrl: string;
  fileName?: string;
  mimeType?: string;
  uploadedBy?: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

const MaintenanceAttachmentSchema = new Schema<IMaintenanceAttachment>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    type: { type: String, enum: MAINTENANCE_PHOTO_TYPES, required: true, index: true },
    fileUrl: { type: String, required: true },
    fileName: { type: String },
    mimeType: { type: String },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { collection: 'maintenance_attachments' }
);

export const MaintenanceAttachmentRecord = mongoose.model<IMaintenanceAttachment>(
  'MaintenanceAttachmentRecord',
  MaintenanceAttachmentSchema
);
