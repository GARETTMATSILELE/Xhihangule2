import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IDashboardKpiSnapshot extends Document {
  companyId: mongoose.Types.ObjectId;
  expenses: number;
  invoices: number;
  outstandingRentals: number;
  outstandingLevies: number;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DashboardKpiSnapshotSchema: Schema = new Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true
    },
    expenses: { type: Number, default: 0 },
    invoices: { type: Number, default: 0 },
    outstandingRentals: { type: Number, default: 0 },
    outstandingLevies: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export const DashboardKpiSnapshot = mongoose.model<IDashboardKpiSnapshot>(
  'DashboardKpiSnapshot',
  DashboardKpiSnapshotSchema,
  COLLECTIONS.DASHBOARD_KPI_SNAPSHOTS
);

export default DashboardKpiSnapshot;
