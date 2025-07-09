import mongoose, { Schema, Document } from 'mongoose';

export interface IFile extends Document {
  propertyId: mongoose.Types.ObjectId;
  fileName: string;
  fileType: string;
  fileUrl: string;  // This will store the base64 string
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

const FileSchema: Schema = new Schema({
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileType: {
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
  timestamps: true
});

// Add index for faster queries
FileSchema.index({ propertyId: 1 });
FileSchema.index({ uploadedBy: 1 });
FileSchema.index({ fileType: 1 });
FileSchema.index({ uploadedAt: -1 });

export default mongoose.model<IFile>('File', FileSchema); 