import mongoose, { Document, Schema } from 'mongoose';

export interface IAgentAvailability extends Document {
  companyId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  dayOfWeek: number;
  available: boolean;
  startTime?: string;
  endTime?: string;
  coverageAreas?: string[];
  skillLevel?: 'junior' | 'mid' | 'senior';
  vehicleAvailable?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AgentAvailabilitySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    available: { type: Boolean, default: true },
    startTime: { type: String },
    endTime: { type: String },
    coverageAreas: [{ type: String }],
    skillLevel: { type: String, enum: ['junior', 'mid', 'senior'], default: 'mid' },
    vehicleAvailable: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AgentAvailabilitySchema.index({ companyId: 1, agentId: 1, dayOfWeek: 1 }, { unique: true });

export const AgentAvailability = mongoose.model<IAgentAvailability>(
  'AgentAvailability',
  AgentAvailabilitySchema,
  'agent_availabilities'
);

export default AgentAvailability;
