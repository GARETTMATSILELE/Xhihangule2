import { Schema, Document } from 'mongoose';
import { mainConnection } from '../config/database';

export interface IAdminAuditLog extends Document {
  actorId: string;
  actorEmail?: string;
  action: string;
  payload?: any;
  result?: any;
  success: boolean;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>({
  actorId: { type: String, required: true, index: true },
  actorEmail: { type: String },
  action: { type: String, required: true, index: true },
  payload: { type: Schema.Types.Mixed },
  result: { type: Schema.Types.Mixed },
  success: { type: Boolean, default: false, index: true },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  durationMs: { type: Number },
  error: { type: String }
}, { timestamps: true });

export default mainConnection.model<IAdminAuditLog>('AdminAuditLog', AdminAuditLogSchema, 'adminauditlogs');











