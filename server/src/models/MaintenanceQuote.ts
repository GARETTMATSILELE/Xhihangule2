import mongoose, { Schema, Document } from 'mongoose';

export interface IMaintenanceQuote extends Document {
  requestId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  contractorId?: mongoose.Types.ObjectId;
  amount: number;
  description: string;
  fileUrl?: string;
  fileName?: string;
  submittedDate: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MaintenanceQuoteSchema = new Schema<IMaintenanceQuote>(
  {
    requestId: { type: Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    contractorId: { type: Schema.Types.ObjectId, ref: 'MaintenanceContractor', index: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true },
    fileUrl: { type: String },
    fileName: { type: String },
    submittedDate: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'maintenance_quotes' }
);

export const MaintenanceQuote = mongoose.model<IMaintenanceQuote>(
  'MaintenanceQuote',
  MaintenanceQuoteSchema
);
