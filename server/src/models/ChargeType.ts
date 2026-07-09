import mongoose, { Document, Schema } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type ChargeTypeCategory =
  | 'PROPERTY_INCOME'
  | 'PASS_THROUGH'
  | 'PROPERTY_EXPENSE'
  | 'LIABILITY'
  | 'OWNER_WITHDRAWAL'
  | 'SYSTEM';

export interface IChargeType extends Document {
  companyId?: mongoose.Types.ObjectId;
  name: string;
  code: string;
  category: ChargeTypeCategory;
  ownerIncome: boolean;
  requiresPayout: boolean;
  requiresThirdPartyPayment: boolean;
  defaultLedger: string;
  active: boolean;
  isSystemDefault?: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ChargeTypeSchema = new Schema<IChargeType>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: false,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    category: {
      type: String,
      enum: ['PROPERTY_INCOME', 'PASS_THROUGH', 'PROPERTY_EXPENSE', 'LIABILITY', 'OWNER_WITHDRAWAL', 'SYSTEM'],
      required: true
    },
    ownerIncome: {
      type: Boolean,
      default: false
    },
    requiresPayout: {
      type: Boolean,
      default: false
    },
    requiresThirdPartyPayment: {
      type: Boolean,
      default: false
    },
    defaultLedger: {
      type: String,
      required: true,
      trim: true
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    isSystemDefault: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

ChargeTypeSchema.index({ companyId: 1, code: 1 }, { unique: true });

export const ChargeType = mongoose.model<IChargeType>('ChargeType', ChargeTypeSchema, COLLECTIONS.CHARGE_TYPES);
export default ChargeType;
