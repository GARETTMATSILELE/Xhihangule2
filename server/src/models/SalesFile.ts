import mongoose, { Schema, Document } from 'mongoose';

export interface ISalesFile extends Document {
  propertyId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  fileName: string;
  docType: string;
  fileUrl: string; // base64
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

const SalesFileSchema: Schema = new Schema({
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    immutable: true
  },
  fileName: {
    type: String,
    required: true
  },
  docType: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  // Store in the same physical collection as rentals (files) but different schema
  collection: 'files'
});

SalesFileSchema.index({ propertyId: 1 });
SalesFileSchema.index({ companyId: 1 });
SalesFileSchema.index({ uploadedBy: 1 });
SalesFileSchema.index({ docType: 1 });
SalesFileSchema.index({ uploadedAt: -1 });

export default mongoose.model<ISalesFile>('SalesFile', SalesFileSchema);


