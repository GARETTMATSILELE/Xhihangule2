import { Schema, Document } from 'mongoose';
import { mainConnection } from '../config/database';

export interface ISystemSetting extends Document {
  key: string;
  value?: any;
  version?: number;
  startedAt?: Date;
  completedAt?: Date;
  lastError?: string;
  updatedAt?: Date;
  createdAt?: Date;
}

const SystemSettingSchema = new Schema<ISystemSetting>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed },
  version: { type: Number },
  startedAt: { type: Date },
  completedAt: { type: Date },
  lastError: { type: String },
}, { timestamps: true });

SystemSettingSchema.index({ key: 1 }, { unique: true });

export default mainConnection.model<ISystemSetting>('SystemSetting', SystemSettingSchema, 'systemsettings');


