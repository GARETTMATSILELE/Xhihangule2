import mongoose, { Schema, Document } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { triggerDashboardKpiRefresh } from '../services/dashboardKpiRefreshTrigger';
import {
  COMPLETED_PAYMENT_IMMUTABLE_MESSAGE,
  isCompletedFinancialPayment,
  PAYMENT_FINANCIAL_FIELDS,
  financialFieldsInQueryUpdate
} from '../services/paymentFinancialImmutability';

export interface IPayment extends Document {
  paymentType: 'sale' | 'rental' | 'introduction';
  /** Snapshot of RENTAL or SALE at acceptance. Absent on legacy rows; do not backfill. */
  transactionDomain?: 'RENTAL' | 'SALE';
  saleMode?: 'quick' | 'installment';
  propertyType: 'residential' | 'commercial';
  propertyId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  paymentDate: Date;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit_card' | 'mobile_money' | 'online_payment' | 'other';
  amount: number;
  depositAmount: number;
  referenceNumber: string;
  // Add rental period fields
  rentalPeriodMonth: number; // 1-12
  rentalPeriodYear: number; // e.g., 2024
  // Advance payment fields
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month: number; year: number };
  advancePeriodEnd?: { month: number; year: number };
  rentUsed?: number;
  /** Portion of `amount` applied to rent (combined rent+levy payments). */
  rentAllocated?: number;
  /** Portion of `amount` applied to levy (combined rent+levy payments). */
  levyAllocated?: number;
  /** Monthly levy baseline at time of payment (like rentUsed). */
  levyUsed?: number;
  /** Linked levy ledger entry when levy is collected with rent. */
  linkedLevyPaymentId?: mongoose.Types.ObjectId;
  chargeTypeCode?: string;
  paymentLines?: Array<{
    chargeTypeCode: string;
    chargeTypeId?: mongoose.Types.ObjectId;
    amount: number;
    description?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
  }>;
  notes: string;
  processedBy: mongoose.Types.ObjectId;
  commissionDetails: {
    totalCommission: number;
    preaFee: number;
    agentShare: number;
    agencyShare: number;
    vatOnCommission?: number;
    ownerAmount: number;
    levy?: number;
    commissionBase?: number;
    commissionRate?: number;
    commissionGross?: number;
    commissionNet?: number;
    vatTreatment?: 'inclusive' | 'exclusive';
    vatRate?: number;
    vatAmount?: number;
    vatDecision?: {
      registrationStatus?: boolean;
      registrationEffectiveDate?: Date | null;
      registrationCancelledAt?: Date | null;
      taxClassification?: string;
      centralVatRate?: number;
      taxRateEffectiveDate?: Date | null;
      propertyVatApplicable?: boolean;
      treatment?: 'inclusive' | 'exclusive' | 'none';
      commissionBase?: number;
      vatAmount?: number;
      reason?: string;
    };
    // Optional breakdown when a collaborator sells in a development
    agentSplit?: {
      ownerAgentShare: number; // portion of agentShare to development owner
      collaboratorAgentShare: number; // portion of agentShare to collaborator
      ownerUserId?: mongoose.Types.ObjectId;
      collaboratorUserId?: mongoose.Types.ObjectId;
      splitPercentOwner?: number; // percent applied to agentShare for owner
      splitPercentCollaborator?: number; // percent applied to agentShare for collaborator
    };
  };
  vatIncluded?: boolean;
  vatRate?: number;
  vatAmount?: number;
  applyVatOnCommission?: boolean;
  vatOnCommissionRate?: number;
  vatCommissionTreatment?: 'inclusive' | 'exclusive';
  status: 'pending' | 'completed' | 'failed' | 'reversed' | 'refunded';
  postingStatus?: 'draft' | 'posted' | 'reversed' | 'voided';
  /**
   * Verified binary accounting projection. Absent on historical documents (untouched).
   * True only after reconcilePayment confirms every required record exists.
   * postingStatus is payment lifecycle (draft/posted/reversed/voided) and is NOT this flag.
   */
  accountingComplete?: boolean;
  /**
   * Diagnostic process state only. Never treat pending/partial/failed as complete.
   */
  accountingStatus?: 'pending' | 'posted' | 'partial' | 'failed' | 'not_applicable' | 'incomplete';
  accountingLastAttemptAt?: Date;
  accountingPostedAt?: Date;
  accountingRetryCount?: number;
  accountingLastError?: string;
  accountingMissing?: string[];
  accountingMismatched?: string[];
  accountingNextAttemptAt?: Date;
  currency: 'USD' | 'ZWL';
  reversalOfPaymentId?: mongoose.Types.ObjectId;
  reversalPaymentId?: mongoose.Types.ObjectId;
  reversalState?: 'reversal_in_progress' | 'reversal_incomplete' | 'reversed';
  reversalLockAt?: Date;
  reversalLockBy?: mongoose.Types.ObjectId;
  correctedPaymentId?: mongoose.Types.ObjectId;
  reversedBy?: mongoose.Types.ObjectId;
  reversedAt?: Date;
  reversalReason?: string;
  voidedBy?: mongoose.Types.ObjectId;
  voidedAt?: Date;
  voidReason?: string;
  isCorrectionEntry?: boolean;
  leaseId?: mongoose.Types.ObjectId;
  recipientId?: mongoose.Types.ObjectId | string;
  recipientType?: string;
  reason?: string;
  idempotencyKey?: string;
  // Manual entry fields for properties/tenants not in database
  manualPropertyAddress?: string;
  manualTenantName?: string;
  // Sales-specific manual fields
  buyerName?: string;
  sellerName?: string;
  // Provisional workflow fields
  isProvisional?: boolean;
  isInSuspense?: boolean;
  commissionFinalized?: boolean;
  provisionalRelationshipType?: 'unknown' | 'management' | 'introduction';
  finalizedAt?: Date;
  finalizedBy?: mongoose.Types.ObjectId;
  // Sales contract linkage (for introduction payments)
  saleId?: mongoose.Types.ObjectId;
  // Optional linkage to development/unit for sales
  developmentId?: mongoose.Types.ObjectId;
  developmentUnitId?: mongoose.Types.ObjectId;
  trustEventEmittedAt?: Date;
  lastTrustEventSource?: string;
  externalProvider?: string;
  externalTransactionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema({
  paymentType: {
    type: String,
    enum: ['sale', 'rental', 'introduction'],
    required: true,
  },
  transactionDomain: {
    type: String,
    enum: ['RENTAL', 'SALE'],
    required: false,
    immutable: true
  },
  saleMode: {
    type: String,
    enum: ['quick', 'installment'],
    required: false,
    default: 'quick'
  },
  propertyType: {
    type: String,
    enum: ['residential', 'commercial'],
    required: true,
  },
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: function requiredProperty(this: { paymentType?: string; developmentId?: unknown; developmentUnitId?: unknown }) {
      if (this.paymentType === 'sale' && (this.developmentId || this.developmentUnitId)) return false;
      return true;
    },
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: function requiredTenant(this: { paymentType?: string }) {
      return this.paymentType !== 'sale';
    },
  },
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    immutable: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    immutable: true
  },
  paymentDate: {
    type: Date,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'credit_card', 'mobile_money', 'online_payment', 'other'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  depositAmount: {
    type: Number,
    required: false,
    default: 0,
  },
  referenceNumber: {
    type: String,
    required: false,
    default: '',
  },
  // Add rental period fields
  rentalPeriodMonth: {
    type: Number,
    required: function(this: any) { return this.paymentType === 'rental'; },
    min: 1,
    max: 12,
  },
  rentalPeriodYear: {
    type: Number,
    required: function(this: any) { return this.paymentType === 'rental'; },
  },
  // Advance payment fields
  advanceMonthsPaid: {
    type: Number,
    required: false,
    min: 1,
    default: 1,
  },
  advancePeriodStart: {
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
  },
  advancePeriodEnd: {
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
  },
  rentUsed: {
    type: Number,
    required: false,
  },
  rentAllocated: {
    type: Number,
    required: false,
  },
  levyAllocated: {
    type: Number,
    required: false,
  },
  levyUsed: {
    type: Number,
    required: false,
  },
  linkedLevyPaymentId: {
    type: Schema.Types.ObjectId,
    ref: 'LevyPayment',
    required: false,
  },
  chargeTypeCode: {
    type: String,
    required: false,
    uppercase: true,
    trim: true
  },
  paymentLines: [{
    chargeTypeCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    chargeTypeId: {
      type: Schema.Types.ObjectId,
      ref: 'ChargeType',
      required: false
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    description: {
      type: String,
      required: false
    },
    referenceId: {
      type: String,
      required: false
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false
    }
  }],
  notes: {
    type: String,
  },
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  commissionDetails: {
    totalCommission: {
      type: Number,
      required: true,
    },
    preaFee: {
      type: Number,
      required: true,
    },
    agentShare: {
      type: Number,
      required: true,
    },
    agencyShare: {
      type: Number,
      required: true,
    },
    vatOnCommission: {
      type: Number,
      required: false,
      default: 0,
    },
    ownerAmount: {
      type: Number,
      required: true,
    },
    levy: { type: Number, required: false, default: 0 },
    commissionBase: { type: Number, required: false },
    commissionRate: { type: Number, required: false },
    commissionGross: { type: Number, required: false },
    commissionNet: { type: Number, required: false },
    vatTreatment: { type: String, enum: ['inclusive', 'exclusive'], required: false },
    vatRate: { type: Number, required: false, min: 0, max: 1 },
    vatAmount: { type: Number, required: false, default: 0 },
    vatJurisdiction: { type: String, required: false },
    vatRuleId: { type: String, required: false },
    vatTaxPoint: { type: Date, required: false },
    vatDecision: {
      registrationStatus: { type: Boolean, required: false },
      registrationEffectiveDate: { type: Date, required: false },
      registrationCancelledAt: { type: Date, required: false },
      taxClassification: { type: String, required: false },
      centralVatRate: { type: Number, required: false },
      taxRateEffectiveDate: { type: Date, required: false },
      propertyVatApplicable: { type: Boolean, required: false },
      treatment: { type: String, enum: ['inclusive', 'exclusive', 'none'], required: false },
      commissionBase: { type: Number, required: false },
      vatAmount: { type: Number, required: false },
      reason: { type: String, required: false }
    },
    agentSplit: {
      ownerAgentShare: { type: Number, required: false, default: 0 },
      collaboratorAgentShare: { type: Number, required: false, default: 0 },
      ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
      collaboratorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
      splitPercentOwner: { type: Number, required: false, min: 0, max: 100 },
      splitPercentCollaborator: { type: Number, required: false, min: 0, max: 100 },
    }
  },
  vatIncluded: {
    type: Boolean,
    required: false,
    default: false
  },
  vatRate: {
    type: Number,
    required: false,
    min: 0,
    max: 1,
    default: 0
  },
  vatAmount: {
    type: Number,
    required: false,
    min: 0,
    default: 0
  },
  applyVatOnCommission: {
    type: Boolean,
    required: false,
    default: false
  },
  vatOnCommissionRate: {
    type: Number,
    required: false,
    min: 0,
    max: 1,
    default: 0
  },
  vatCommissionTreatment: {
    type: String,
    enum: ['inclusive', 'exclusive'],
    required: false
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed', 'refunded'],
    default: 'pending',
  },
  postingStatus: {
    type: String,
    enum: ['draft', 'posted', 'reversed', 'voided'],
    default: 'draft',
    index: true,
  },
  accountingComplete: {
    type: Boolean,
    required: false,
    index: true
  },
  accountingStatus: {
    type: String,
    enum: ['pending', 'posted', 'partial', 'failed', 'not_applicable', 'incomplete'],
    required: false,
    index: true
  },
  accountingLastAttemptAt: { type: Date, required: false },
  accountingPostedAt: { type: Date, required: false },
  accountingRetryCount: { type: Number, required: false, default: undefined },
  accountingLastError: { type: String, required: false },
  accountingMissing: { type: [String], required: false },
  accountingMismatched: { type: [String], required: false },
  accountingNextAttemptAt: { type: Date, required: false },
  currency: {
    type: String,
    enum: ['USD', 'ZWL'],
    default: 'USD',
  },
  leaseId: {
    type: Schema.Types.ObjectId,
    ref: 'Lease',
  },
  recipientId: {
    type: Schema.Types.Mixed, // ObjectId or string
    required: false,
  },
  recipientType: {
    type: String,
    required: false,
  },
  reason: {
    type: String,
    required: false,
  },
  // Manual entry fields for properties/tenants not in database
  manualPropertyAddress: {
    type: String,
    required: false,
  },
  manualTenantName: {
    type: String,
    required: false,
  },
  buyerName: {
    type: String,
    required: false,
  },
  sellerName: {
    type: String,
    required: false,
  },
  // Provisional workflow fields
  isProvisional: {
    type: Boolean,
    default: false
  },
  isInSuspense: {
    type: Boolean,
    default: false
  },
  commissionFinalized: {
    type: Boolean,
    default: true
  },
  provisionalRelationshipType: {
    type: String,
    enum: ['unknown', 'management', 'introduction'],
    default: 'unknown'
  },
  finalizedAt: {
    type: Date,
    required: false
  },
  finalizedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  saleId: {
    type: Schema.Types.ObjectId,
    ref: 'SalesContract',
    required: false
  },
  developmentId: {
    type: Schema.Types.ObjectId,
    ref: 'Development',
    required: false
  },
  developmentUnitId: {
    type: Schema.Types.ObjectId,
    ref: 'DevelopmentUnit',
    required: false
  },
  trustEventEmittedAt: {
    type: Date,
    required: false
  },
  lastTrustEventSource: {
    type: String,
    required: false
  },
  externalProvider: {
    type: String,
    required: false
  },
  externalTransactionId: {
    type: String,
    required: false
  },
  idempotencyKey: {
    type: String,
    required: false,
    index: true
  },
  reversalOfPaymentId: {
    type: Schema.Types.ObjectId,
    ref: 'Payment',
    index: true,
    required: false,
  },
  reversalPaymentId: {
    type: Schema.Types.ObjectId,
    ref: 'Payment',
    required: false,
  },
  reversalState: {
    type: String,
    enum: ['reversal_in_progress', 'reversal_incomplete', 'reversed'],
    required: false,
  },
  reversalLockAt: {
    type: Date,
    required: false,
  },
  reversalLockBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  correctedPaymentId: {
    type: Schema.Types.ObjectId,
    ref: 'Payment',
    required: false,
  },
  reversedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  reversedAt: {
    type: Date,
    required: false,
  },
  reversalReason: {
    type: String,
    required: false,
  },
  voidedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  voidedAt: {
    type: Date,
    required: false,
  },
  voidReason: {
    type: String,
    required: false,
  },
  isCorrectionEntry: {
    type: Boolean,
    default: false,
    index: true,
  },
}, {
  timestamps: true
});

// Add indexes for common queries
PaymentSchema.index({ companyId: 1, paymentDate: -1 });
PaymentSchema.index({ companyId: 1, paymentType: 1, paymentDate: -1 });
// Optimize sales queries by mode and development linkage
PaymentSchema.index({ companyId: 1, paymentType: 1, saleMode: 1, developmentId: 1, paymentDate: -1 });
// Support accountant dashboard/collections where paid-to-date is grouped by saleId
PaymentSchema.index({ companyId: 1, paymentType: 1, status: 1, saleId: 1 });
// Support rental outstanding aggregation by company + period + tenant/property
PaymentSchema.index({ companyId: 1, paymentType: 1, status: 1, propertyId: 1, tenantId: 1, rentalPeriodYear: 1, rentalPeriodMonth: 1 });
// Support provisional suggestion lookups in accountant workflows
PaymentSchema.index({ companyId: 1, isProvisional: 1, createdAt: -1 });
PaymentSchema.index({ propertyId: 1 });
PaymentSchema.index({ tenantId: 1 });
PaymentSchema.index({ agentId: 1 });
PaymentSchema.index({ status: 1 });
// Add compound index for agent commission queries
PaymentSchema.index({ agentId: 1, status: 1, paymentDate: -1 });
PaymentSchema.index({ saleId: 1 });
PaymentSchema.index({ developmentId: 1 });
PaymentSchema.index({ developmentUnitId: 1 });
PaymentSchema.index({ isProvisional: 1 });
PaymentSchema.index({ reversalOfPaymentId: 1 });
PaymentSchema.index(
  { reversalOfPaymentId: 1 },
  {
    name: 'one_full_reversal_per_payment',
    unique: true,
    partialFilterExpression: { reversalOfPaymentId: { $exists: true }, amount: { $lt: 0 } }
  }
);
PaymentSchema.index({ companyId: 1, postingStatus: 1, paymentDate: -1 });
PaymentSchema.index({ accountingComplete: 1, accountingLastAttemptAt: 1 });
PaymentSchema.index({ accountingStatus: 1, accountingNextAttemptAt: 1 });
PaymentSchema.index({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true, $type: 'string' } } });
PaymentSchema.index(
  { companyId: 1, externalProvider: 1, externalTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalProvider: { $exists: true, $type: 'string', $gt: '' },
      externalTransactionId: { $exists: true, $type: 'string', $gt: '' }
    }
  }
);
// Ensure a payment reference cannot repeat within a company (guards manual edits/imports)
PaymentSchema.index(
  { companyId: 1, referenceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      referenceNumber: { $exists: true, $type: 'string', $gt: '' }
    }
  }
);

// Prevent history-changing bulk updates on core fields; use document.save() with workflows instead
function isIllegalPaymentUpdate(update: Record<string, any>): boolean {
  const setOps = ['$set', '$unset'];
  const protectedKeys = new Set([
    'amount','paymentDate','paymentMethod','propertyId','tenantId','agentId','companyId',
    'referenceNumber','currency','rentalPeriodMonth','rentalPeriodYear','advanceMonthsPaid',
    'advancePeriodStart','advancePeriodEnd','processedBy','recipientId','recipientType','reason'
  ]);
  for (const op of setOps) {
    const payload = (update as any)[op];
    if (!payload || typeof payload !== 'object') continue;
    for (const key of Object.keys(payload)) {
      // Allow operational flags and enrichment fields
      if (key.startsWith('commissionDetails')) continue;
      if ([
        'status','isProvisional','isInSuspense','commissionFinalized','provisionalRelationshipType',
        'finalizedAt','finalizedBy','idempotencyKey','manualPropertyAddress','manualTenantName',
        'buyerName','sellerName','saleId','developmentId','developmentUnitId','notes',
        'postingStatus','accountingComplete','accountingStatus','accountingLastAttemptAt','accountingPostedAt','accountingRetryCount',
        'accountingLastError','accountingMissing','accountingMismatched','accountingNextAttemptAt',
        'vatIncluded','vatRate','vatAmount','applyVatOnCommission','vatOnCommissionRate','vatCommissionTreatment',
        'reversalOfPaymentId','reversalPaymentId','correctedPaymentId',
        'reversedBy','reversedAt','reversalReason','voidedBy','voidedAt','voidReason','isCorrectionEntry'
      ].includes(key)) continue;
      if (protectedKeys.has(key)) return true;
    }
  }
  return false;
}

PaymentSchema.pre('save', function(next) {
  try {
    if (!this.isNew) {
      const stillProvisional = (this as any).isProvisional === true || (this as any).isInSuspense === true;
      const finalizing = this.isModified('isProvisional') || this.isModified('isInSuspense');
      const statusChanging = this.isModified('status');
      if (!stillProvisional && !finalizing && !statusChanging && isCompletedFinancialPayment(this as any)) {
        const modifiedFinancial = PAYMENT_FINANCIAL_FIELDS.filter((field) => this.isModified(field));
        if (modifiedFinancial.length) {
          return next(new Error(COMPLETED_PAYMENT_IMMUTABLE_MESSAGE));
        }
      }
    }
    const lines = Array.isArray((this as any).paymentLines) ? (this as any).paymentLines : [];
    if (lines.length > 0) {
      (this as any).amount = Number(lines.reduce((sum: number, line: any) => sum + Number(line?.amount || 0), 0).toFixed(2));
    }
    // Keep postingStatus consistent with status to avoid "completed but draft" conflicts.
    // This is critical for reversal eligibility and ledger posting correctness.
    const status = String((this as any).status || '').toLowerCase();
    if (status === 'completed') (this as any).postingStatus = 'posted';
    else if (status === 'reversed') (this as any).postingStatus = 'reversed';
    else if (status === 'failed') (this as any).postingStatus = 'voided';
    else (this as any).postingStatus = 'draft';
    return next();
  } catch (e) {
    return next(e as any);
  }
});

PaymentSchema.pre(['updateOne','updateMany','findOneAndUpdate','findOneAndReplace','replaceOne'], async function() {
  const update = (this as any).getUpdate?.() || {};
  if (isIllegalPaymentUpdate(update)) {
    throw new Error('Payment records are immutable. Create a correcting payment instead of editing core fields.');
  }
  const attemptedFinancial = financialFieldsInQueryUpdate(update);
  if (attemptedFinancial.length === 0) return;
  const query = (this as any).getQuery?.() || {};
  const matched = await (this as any).model.find(query)
    .select('status postingStatus isProvisional isInSuspense')
    .limit(50)
    .lean();
  if (matched.some((doc: any) => isCompletedFinancialPayment(doc))) {
    throw new Error(COMPLETED_PAYMENT_IMMUTABLE_MESSAGE);
  }
});

const resolveCompanyId = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.toString === 'function') return value.toString();
  return null;
};

PaymentSchema.post('save', function () {
  triggerDashboardKpiRefresh(resolveCompanyId((this as any).companyId));
});

PaymentSchema.post('findOneAndUpdate', function (doc: any) {
  const queryCompanyId = (this as any)?.getQuery?.()?.companyId;
  triggerDashboardKpiRefresh(resolveCompanyId(doc?.companyId || queryCompanyId));
});

PaymentSchema.post('updateOne', function () {
  const queryCompanyId = (this as any)?.getQuery?.()?.companyId;
  triggerDashboardKpiRefresh(resolveCompanyId(queryCompanyId));
});

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema, COLLECTIONS.PAYMENTS); 