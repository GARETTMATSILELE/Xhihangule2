import mongoose, { Document, Schema } from 'mongoose';

export interface IPublicHoliday extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  date: Date;
  recurring?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PublicHolidaySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    recurring: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PublicHolidaySchema.index({ companyId: 1, date: 1 });

export const PublicHoliday = mongoose.model<IPublicHoliday>(
  'PublicHoliday',
  PublicHolidaySchema,
  'public_holidays'
);

export default PublicHoliday;
