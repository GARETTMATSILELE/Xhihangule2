import mongoose, { Schema, Document } from 'mongoose';

export const OWNER_DOCUMENT_TYPES = [
  'Management Agreement',
  'Title Deed',
  'National ID',
  'Passport',
  'Tax Document',
  'Banking Document',
  'Other',
] as const;

export type OwnerDocumentType = (typeof OWNER_DOCUMENT_TYPES)[number];

export interface IOwnerDocument extends Document {
  ownerId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  documentType: OwnerDocumentType;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  version: number;
  uploadedBy?: mongoose.Types.ObjectId;
  uploadedAt: Date;
  notes?: string;
}

const OwnerDocumentSchema = new Schema<IOwnerDocument>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'PropertyOwner', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    documentType: { type: String, enum: OWNER_DOCUMENT_TYPES, required: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    mimeType: { type: String },
    fileSize: { type: Number },
    version: { type: Number, default: 1 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
    notes: { type: String },
  },
  { collection: 'owner_documents' }
);

OwnerDocumentSchema.index({ ownerId: 1, documentType: 1, version: -1 });

export const OwnerDocument = mongoose.model<IOwnerDocument>('OwnerDocument', OwnerDocumentSchema);
