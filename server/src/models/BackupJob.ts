import { Schema, Document } from 'mongoose';
import { mainConnection } from '../config/database';

export interface IBackupJob extends Document {
  provider: 'local' | 's3';
  key?: string; // s3 key
  path?: string; // local file path
  status: 'pending' | 'running' | 'success' | 'failed';
  sizeBytes?: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const BackupJobSchema = new Schema<IBackupJob>({
  provider: { type: String, enum: ['local', 's3'], required: true },
  key: { type: String },
  path: { type: String },
  status: { type: String, enum: ['pending', 'running', 'success', 'failed'], default: 'pending', index: true },
  sizeBytes: { type: Number },
  startedAt: { type: Date, default: Date.now, required: true },
  completedAt: { type: Date },
  error: { type: String }
}, { timestamps: true });

export default mainConnection.model<IBackupJob>('BackupJob', BackupJobSchema, 'backupjobs');









