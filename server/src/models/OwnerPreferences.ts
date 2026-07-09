import mongoose, { Schema, Document } from 'mongoose';

export interface IOwnerPreferences extends Document {
  ownerId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  emailStatements: boolean;
  smsNotifications: boolean;
  maintenanceAlerts: boolean;
  monthlyReports: boolean;
  leaseExpiryAlerts: boolean;
  updatedAt: Date;
  createdAt: Date;
}

const OwnerPreferencesSchema = new Schema<IOwnerPreferences>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'PropertyOwner', required: true, unique: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    emailStatements: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false },
    maintenanceAlerts: { type: Boolean, default: true },
    monthlyReports: { type: Boolean, default: true },
    leaseExpiryAlerts: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'owner_preferences' }
);

export const OwnerPreferences = mongoose.model<IOwnerPreferences>(
  'OwnerPreferences',
  OwnerPreferencesSchema
);
