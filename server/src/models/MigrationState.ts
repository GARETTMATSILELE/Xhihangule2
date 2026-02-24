import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IMigrationState extends Document {
  migrationName: string;
  lastProcessedId?: string;
  processedCount: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  leaseExpiresAt?: Date;
  lockToken?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MigrationStateSchema = new Schema<IMigrationState>(
  {
    migrationName: { type: String, required: true, unique: true, index: true },
    lastProcessedId: { type: String, required: false },
    processedCount: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ['idle', 'running', 'completed', 'failed'], default: 'idle', index: true },
    startedAt: { type: Date, required: false },
    completedAt: { type: Date, required: false },
    leaseExpiresAt: { type: Date, required: false, index: true },
    lockToken: { type: String, required: false },
    error: { type: String, required: false }
  },
  { timestamps: true }
);

export const MigrationState = mongoose.model<IMigrationState>('MigrationState', MigrationStateSchema, COLLECTIONS.MIGRATION_STATE);
