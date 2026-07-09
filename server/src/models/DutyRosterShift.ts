import mongoose, { Document, Schema } from 'mongoose';

export const DUTY_TYPES = [
  'weekend_duty',
  'office_duty',
  'viewing_duty',
  'emergency_maintenance_duty',
  'owner_relations_duty',
  'on_call_duty',
] as const;

export type DutyType = (typeof DUTY_TYPES)[number];

export interface IDutyRosterShift extends Document {
  companyId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  dutyType: DutyType;
  shiftDate: Date;
  startTime?: string;
  endTime?: string;
  coverageArea?: string;
  notes?: string;
  status: 'scheduled' | 'published' | 'completed' | 'cancelled';
  vehicleAvailable?: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DutyRosterShiftSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dutyType: { type: String, enum: DUTY_TYPES, required: true },
    shiftDate: { type: Date, required: true, index: true },
    startTime: { type: String },
    endTime: { type: String },
    coverageArea: { type: String },
    notes: { type: String },
    status: {
      type: String,
      enum: ['scheduled', 'published', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    vehicleAvailable: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

DutyRosterShiftSchema.index({ companyId: 1, shiftDate: 1 });
DutyRosterShiftSchema.index({ companyId: 1, agentId: 1, shiftDate: 1 });

export const DutyRosterShift = mongoose.model<IDutyRosterShift>(
  'DutyRosterShift',
  DutyRosterShiftSchema,
  'duty_roster_shifts'
);

export default DutyRosterShift;
