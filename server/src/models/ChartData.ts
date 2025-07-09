import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export interface IChartData extends Document {
  type: string;
  data: any;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

const chartDataSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['occupancy', 'revenue', 'propertyTypes', 'maintenance', 'monthlyTrend', 'commission', 'metrics']
  },
  data: {
    type: Schema.Types.Mixed,
    required: true
  },
  companyId: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update the updatedAt timestamp before saving
chartDataSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const ChartData = mongoose.model<IChartData>('ChartData', chartDataSchema, COLLECTIONS.CHART_DATA); 