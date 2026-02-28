import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { triggerDashboardKpiRefresh } from '../services/dashboardKpiRefreshTrigger';

export interface ILevyPayment extends Document {
  paymentType: 'levy';
  propertyId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  paymentDate: Date;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit_card' | 'mobile_money';
  amount: number;
  referenceNumber: string;
  notes: string;
  processedBy: mongoose.Types.ObjectId;
  status: 'pending' | 'completed' | 'failed' | 'paid_out';
  currency: 'USD' | 'ZWL';
  createdAt: Date;
  updatedAt: Date;
  monthlyLevies: number;
  // Period fields to identify which month/year this levy covers
  levyPeriodMonth?: number; // 1-12
  levyPeriodYear?: number; // YYYY
  // Optional advance coverage (UI may pay multiple months at once)
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month: number; year: number };
  advancePeriodEnd?: { month: number; year: number };
  // payout fields
  payout?: {
    paidOut: boolean;
    paidToName?: string;
    paidToAccount?: string;
    paidToContact?: string;
    payoutDate?: Date;
    payoutMethod?: 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque';
    payoutReference?: string;
    acknowledgedBy?: string; // signature name captured
    acknowledgedAt?: Date;
    notes?: string;
    processedBy?: mongoose.Types.ObjectId;
  };
}

const LevyPaymentSchema: Schema = new Schema({
  paymentType: {
    type: String,
    enum: ['levy'],
    required: true,
    default: 'levy',
  },
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    immutable: true
  },
  paymentDate: {
    type: Date,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'credit_card', 'mobile_money'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  referenceNumber: {
    type: String,
    required: false,
    default: '',
  },
  notes: {
    type: String,
  },
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'paid_out'],
    default: 'pending',
  },
  currency: {
    type: String,
    enum: ['USD', 'ZWL'],
    default: 'USD',
  },
  monthlyLevies: {
    type: Number,
    required: false,
  },
  // Period fields: default to month/year derived from paymentDate when not provided
  levyPeriodMonth: {
    type: Number,
    min: 1,
    max: 12,
    default: function(this: any) {
      try {
        const d = this.paymentDate instanceof Date ? this.paymentDate : (this.paymentDate ? new Date(this.paymentDate) : new Date());
        return (d.getMonth() + 1);
      } catch {
        return (new Date().getMonth() + 1);
      }
    }
  },
  levyPeriodYear: {
    type: Number,
    min: 1900,
    max: 2100,
    default: function(this: any) {
      try {
        const d = this.paymentDate instanceof Date ? this.paymentDate : (this.paymentDate ? new Date(this.paymentDate) : new Date());
        return d.getFullYear();
      } catch {
        return (new Date().getFullYear());
      }
    }
  },
  // Advance fields (optional)
  advanceMonthsPaid: {
    type: Number,
    required: false,
    min: 1,
    default: 1
  },
  advancePeriodStart: {
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number }
  },
  advancePeriodEnd: {
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number }
  },
  payout: {
    paidOut: { type: Boolean, default: false },
    paidToName: { type: String },
    paidToAccount: { type: String },
    paidToContact: { type: String },
    payoutDate: { type: Date },
    payoutMethod: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'cheque'] },
    payoutReference: { type: String },
    acknowledgedBy: { type: String },
    acknowledgedAt: { type: Date },
    notes: { type: String },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
}, {
  timestamps: true
});

LevyPaymentSchema.index({ companyId: 1, paymentDate: -1 });
LevyPaymentSchema.index({ propertyId: 1 });
// Speed up per-month enforcement queries
LevyPaymentSchema.index({ companyId: 1, propertyId: 1, levyPeriodYear: 1, levyPeriodMonth: 1 });

// Enforce immutability of levy payment core fields on bulk updates; allow only status/payout/notes changes
function isIllegalLevyUpdate(update: Record<string, any>): boolean {
  const setOps = ['$set', '$unset'];
  const allowedPrefixes = ['payout', 'payout.', 'notes', 'status'];
  const protectedKeys = new Set([
    'amount','paymentDate','paymentMethod','propertyId','companyId','referenceNumber',
    'currency','processedBy','levyPeriodMonth','levyPeriodYear','advanceMonthsPaid',
    'advancePeriodStart','advancePeriodEnd'
  ]);
  const isAllowedKey = (k: string) =>
    allowedPrefixes.some(p => k === p || k.startsWith(`${p}`));
  for (const op of setOps) {
    const payload = (update as any)[op];
    if (!payload || typeof payload !== 'object') continue;
    for (const key of Object.keys(payload)) {
      if (isAllowedKey(key)) continue;
      if (protectedKeys.has(key)) return true;
    }
  }
  return false;
}

LevyPaymentSchema.pre(['updateOne','updateMany','findOneAndUpdate'], function(next) {
  try {
    const update = (this as any).getUpdate?.() || {};
    if (isIllegalLevyUpdate(update)) {
      return next(new Error('Levy payments are immutable. Only status and payout information may be updated.'));
    }
    return next();
  } catch (e) {
    return next(e as any);
  }
});

const resolveCompanyId = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toString === 'function') return value.toString();
  return null;
};

LevyPaymentSchema.post('save', function () {
  triggerDashboardKpiRefresh(resolveCompanyId((this as any).companyId));
});

LevyPaymentSchema.post('findOneAndUpdate', function (doc: any) {
  const queryCompanyId = (this as any)?.getQuery?.()?.companyId;
  triggerDashboardKpiRefresh(resolveCompanyId(doc?.companyId || queryCompanyId));
});

export const LevyPayment = mongoose.model<ILevyPayment>('LevyPayment', LevyPaymentSchema, COLLECTIONS.LEVY_PAYMENTS); 