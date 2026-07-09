import mongoose, { Schema, Document } from 'mongoose';

export interface IMaintenanceActivity extends Document {
  requestId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  action: string;
  description: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const MaintenanceActivitySchema = new Schema<IMaintenanceActivity>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    action: { type: String, required: true, index: true },
    description: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: 'maintenance_activities' }
);

MaintenanceActivitySchema.index({ requestId: 1, createdAt: -1 });

export const MaintenanceActivity = mongoose.model<IMaintenanceActivity>(
  'MaintenanceActivity',
  MaintenanceActivitySchema
);
