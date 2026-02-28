import mongoose, { Schema, Document } from 'mongoose';

export type MaintenanceJobOperation = 'sync_property_accounts' | 'ensure_development_ledgers';
export type MaintenanceJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface IMaintenanceJob extends Document {
  operation: MaintenanceJobOperation;
  companyId?: string;
  requestedBy?: string;
  status: MaintenanceJobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  leaseExpiresAt?: Date;
  workerId?: string;
  startedAt?: Date;
  finishedAt?: Date;
  lastError?: string;
  result?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

const MaintenanceJobSchema = new Schema<IMaintenanceJob>(
  {
    operation: {
      type: String,
      enum: ['sync_property_accounts', 'ensure_development_ledgers'],
      required: true,
      index: true
    },
    companyId: { type: String, index: true },
    requestedBy: { type: String },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      index: true
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    runAfter: { type: Date, default: () => new Date(), index: true },
    leaseExpiresAt: { type: Date, index: true },
    workerId: { type: String },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    lastError: { type: String },
    result: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

MaintenanceJobSchema.index({ status: 1, runAfter: 1 });
MaintenanceJobSchema.index({ operation: 1, companyId: 1, status: 1, createdAt: -1 });

export const MaintenanceJob = mongoose.model<IMaintenanceJob>('MaintenanceJob', MaintenanceJobSchema, 'maintenancejobs');
