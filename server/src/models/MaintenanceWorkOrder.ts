import mongoose, { Schema, Document } from 'mongoose';

export const WORK_ORDER_STATUSES = ['Assigned', 'In Progress', 'Completed', 'Cancelled'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export interface IMaintenanceWorkOrder extends Document {
  workOrderNumber: string;
  maintenanceRequestId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  contractorId?: mongoose.Types.ObjectId;
  assignedBy?: mongoose.Types.ObjectId;
  assignedDate?: Date;
  targetCompletionDate?: Date;
  completionDate?: Date;
  status: WorkOrderStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceWorkOrderSchema = new Schema<IMaintenanceWorkOrder>(
  {
    workOrderNumber: { type: String, required: true, unique: true, index: true },
    maintenanceRequestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    contractorId: { type: Schema.Types.ObjectId, ref: 'MaintenanceContractor', index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedDate: { type: Date },
    targetCompletionDate: { type: Date },
    completionDate: { type: Date },
    status: { type: String, enum: WORK_ORDER_STATUSES, default: 'Assigned', index: true },
    notes: { type: String },
  },
  { timestamps: true, collection: 'maintenance_work_orders' }
);

MaintenanceWorkOrderSchema.index({ companyId: 1, maintenanceRequestId: 1 }, { unique: true });

export const MaintenanceWorkOrder = mongoose.model<IMaintenanceWorkOrder>(
  'MaintenanceWorkOrder',
  MaintenanceWorkOrderSchema
);
