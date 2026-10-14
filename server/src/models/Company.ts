import mongoose, { Document, Schema, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { triggerDashboardKpiRefresh } from '../services/dashboardKpiRefreshTrigger';

// Bank Account interface
export interface IBankAccount {
  accountNumber: string;
  accountName: string;
  accountType: 'USD NOSTRO' | 'ZiG';
  bankName: string;
  branchName: string;
  branchCode: string;
}

export interface ICompany extends Document {
  name: string;
  tradingName?: string;
  address: string;
  phone: string;
  email: string;
  country?: string;
  defaultCurrency?: 'USD' | 'ZiG' | 'ZWL' | 'ZAR';
  normalizedEmail?: string;
  website?: string;
  registrationNumber?: string;
  normalizedRegistrationNumber?: string;
  tinNumber?: string;
  normalizedTinNumber?: string;
  vatNumber?: string;
  taxProfile?: {
    vatRegistered?: boolean;
    vatRegistrationEffectiveDate?: Date;
    vatRegistrationCancelledAt?: Date;
    vatCategory?: string;
    fiscalisationEnabled?: boolean;
  };
  ownerId: Types.ObjectId;
  companyType?: 'INDIVIDUAL_LANDLORD' | 'REGISTERED_BUSINESS';
  workspaceType?: 'agency' | 'individual';
  tenantStatus?: 'active' | 'suspended' | 'pending' | 'archived';
  onboardingStatus?: 'PENDING_SETUP' | 'PENDING_PAYMENT' | 'PAYMENT_RECEIVED' | 'INITIALIZING_WORKSPACE' | 'ACTIVE' | 'FAILED_SETUP' | 'SUSPENDED' | 'EXPIRED';
  onboardingSessionId?: Types.ObjectId;
  onboardingCompleted?: boolean;
  workspacePreferences?: {
    currency?: 'USD' | 'ZiG';
    timezone?: string;
    measurementUnits?: 'metric' | 'imperial';
    invoicePrefix?: string;
    invoiceNotes?: string;
  };
  description?: string;
  logo?: string;
  isActive: boolean;
  subscriptionStatus: 'active' | 'inactive' | 'trial' | 'past_due' | 'suspended' | 'cancelled' | 'expired' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
  subscriptionEndDate?: Date;
  bankAccounts: IBankAccount[];
  commissionConfig?: {
    preaPercentOfTotal: number; // 0.0 - 1.0
    agentPercentOfRemaining: number; // 0.0 - 1.0
    agencyPercentOfRemaining: number; // 0.0 - 1.0 (agent + agency should equal 1.0)
    vatPercentOnCommission?: number; // 0.0 - 1.0, e.g., 0.15 for 15%
  };
  plan?: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  propertyLimit?: number | null;
  featureFlags?: {
    commissionEnabled: boolean;
    agentAccounts: boolean;
    propertyAccounts: boolean;
    propertyOwners?: boolean;
    commissions?: boolean;
    trustAccounting?: boolean;
    maintenanceApprovals?: boolean;
    accounting?: boolean;
    tenantPortalEnabled?: boolean;
    contractorPortalEnabled?: boolean;
    propertyMarketplaceEnabled?: boolean;
    maintenanceQuotesEnabled?: boolean;
    onlinePaymentsEnabled?: boolean;
    multichannelNotificationsEnabled?: boolean;
    tenantReferencesEnabled?: boolean;
    contractorRatingsEnabled?: boolean;
  };
  fiscalConfig?: {
    enabled?: boolean;
    providerName?: string;
    agentName?: string;
    deviceSerial?: string;
    fdmsBaseUrl?: string;
    apiKey?: string;
    apiUsername?: string;
    apiPassword?: string;
  };
  // Receivables cutover and opening balances
  receivablesCutover?: {
    year: number; // e.g., 2025
    month: number; // 1-12
  };
  rentReceivableOpeningBalance?: number;
  levyReceivableOpeningBalance?: number;
  revenue?: number;
  storageUsedBytes?: number;
  subscriptionOverride?: {
    enabled?: boolean;
    reason?: string;
    expiresAt?: Date;
    updatedBy?: Types.ObjectId;
    updatedAt?: Date;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const bankAccountSchema = new Schema<IBankAccount>({
  accountNumber: {
    type: String,
    required: true,
    trim: true
  },
  accountName: {
    type: String,
    required: true,
    trim: true
  },
  accountType: {
    type: String,
    enum: ['USD NOSTRO', 'ZiG'],
    required: true
  },
  bankName: {
    type: String,
    required: true,
    trim: true
  },
  branchName: {
    type: String,
    required: true,
    trim: true
  },
  branchCode: {
    type: String,
    required: true,
    trim: true
  }
});

const companySchema = new Schema<ICompany>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  normalizedEmail: {
    type: String,
    trim: true,
    lowercase: true,
    index: true
  },
  website: {
    type: String,
    trim: true
  },
  registrationNumber: {
    type: String,
    trim: true
  },
  normalizedRegistrationNumber: {
    type: String,
    trim: true,
    uppercase: true,
    index: true
  },
  tinNumber: {
    type: String,
    trim: true
  },
  normalizedTinNumber: {
    type: String,
    trim: true,
    uppercase: true,
    index: true
  },
  vatNumber: {
    type: String,
    trim: true
  },
  taxProfile: {
    vatRegistered: { type: Boolean, default: false },
    vatRegistrationEffectiveDate: { type: Date, required: false },
    vatRegistrationCancelledAt: { type: Date, required: false },
    vatCategory: { type: String, trim: true, required: false },
    fiscalisationEnabled: { type: Boolean, default: false }
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyType: {
    type: String,
    enum: ['INDIVIDUAL_LANDLORD', 'REGISTERED_BUSINESS'],
    default: 'REGISTERED_BUSINESS',
    index: true
  },
  workspaceType: {
    type: String,
    enum: ['agency', 'individual'],
    default: 'agency',
    index: true
  },
  tenantStatus: {
    type: String,
    enum: ['active', 'suspended', 'pending', 'archived'],
    default: 'active',
    index: true
  },
  onboardingStatus: {
    type: String,
    enum: ['PENDING_SETUP', 'PENDING_PAYMENT', 'PAYMENT_RECEIVED', 'INITIALIZING_WORKSPACE', 'ACTIVE', 'FAILED_SETUP', 'SUSPENDED', 'EXPIRED'],
    default: 'ACTIVE',
    index: true
  },
  onboardingSessionId: {
    type: Schema.Types.ObjectId,
    ref: 'OnboardingSession',
    required: false,
    index: true
  },
  onboardingCompleted: {
    type: Boolean,
    default: true,
    index: true
  },
  workspacePreferences: {
    currency: { type: String, enum: ['USD', 'ZiG'], default: 'USD' },
    timezone: { type: String, trim: true, default: 'Africa/Harare' },
    measurementUnits: { type: String, enum: ['metric', 'imperial'], default: 'metric' },
    invoicePrefix: { type: String, trim: true, default: 'INV' },
    invoiceNotes: { type: String, trim: true }
  },
  logo: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'inactive', 'trial', 'past_due', 'suspended', 'cancelled', 'expired', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'],
    default: 'trial'
  },
  subscriptionEndDate: {
    type: Date
  },
  bankAccounts: {
    type: [bankAccountSchema],
    default: [],
    validate: {
      validator: function(accounts: IBankAccount[]) {
        return accounts.length <= 2;
      },
      message: 'Company can have a maximum of 2 bank accounts'
    }
  },
  commissionConfig: {
    preaPercentOfTotal: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.03
    },
    agentPercentOfRemaining: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.6
    },
    agencyPercentOfRemaining: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.4
    },
    vatPercentOnCommission: {
      type: Number,
      min: 0,
      max: 1
    }
  },
  plan: {
    type: String,
    enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'],
    default: 'ENTERPRISE'
  },
  propertyLimit: {
    type: Number,
    default: null
  },
  featureFlags: {
    commissionEnabled: {
      type: Boolean,
      default: true
    },
    agentAccounts: {
      type: Boolean,
      default: true
    },
    propertyAccounts: {
      type: Boolean,
      default: true
    },
    propertyOwners: {
      type: Boolean,
      default: true
    },
    commissions: {
      type: Boolean,
      default: true
    },
    trustAccounting: {
      type: Boolean,
      default: true
    },
    maintenanceApprovals: {
      type: Boolean,
      default: true
    },
    accounting: {
      type: Boolean,
      default: true
    },
    agents: {
      type: Boolean,
      default: true
    },
    tenantPortalEnabled: { type: Boolean, default: false },
    contractorPortalEnabled: { type: Boolean, default: false },
    propertyMarketplaceEnabled: { type: Boolean, default: false },
    maintenanceQuotesEnabled: { type: Boolean, default: false },
    onlinePaymentsEnabled: { type: Boolean, default: false },
    multichannelNotificationsEnabled: { type: Boolean, default: false },
    tenantReferencesEnabled: { type: Boolean, default: false },
    contractorRatingsEnabled: { type: Boolean, default: false }
  }
  ,
  fiscalConfig: {
    enabled: { type: Boolean, default: false },
    providerName: { type: String, trim: true },
    agentName: { type: String, trim: true },
    deviceSerial: { type: String, trim: true },
    fdmsBaseUrl: { type: String, trim: true },
    apiKey: { type: String, trim: true },
    apiUsername: { type: String, trim: true },
    apiPassword: { type: String, trim: true }
  },
  // Receivables cutover month/year and opening balances
  receivablesCutover: {
    year: { type: Number, min: 1900, max: 2100 },
    month: { type: Number, min: 1, max: 12 }
  },
  rentReceivableOpeningBalance: { type: Number, default: 0, min: 0 },
  levyReceivableOpeningBalance: { type: Number, default: 0, min: 0 }
  ,
  revenue: { type: Number, default: 0, min: 0 }
}, {
  timestamps: true
});

companySchema.add({
  tradingName: { type: String, trim: true },
  country: { type: String, trim: true, default: 'Zimbabwe' },
  defaultCurrency: { type: String, enum: ['USD', 'ZiG', 'ZWL', 'ZAR'], default: 'USD' },
  storageUsedBytes: { type: Number, default: 0, min: 0 },
  subscriptionOverride: {
    enabled: { type: Boolean, default: false, index: true },
    reason: { type: String, trim: true },
    expiresAt: { type: Date },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date }
  }
});

companySchema.index({ subscriptionStatus: 1, subscriptionEndDate: 1 });
companySchema.index({ tenantStatus: 1, createdAt: -1 });

function normalizeCompanyIdentifier(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized ? normalized.toUpperCase().replace(/\s+/g, '') : undefined;
}

companySchema.pre('validate', function(next) {
  if (this.email) {
    this.email = String(this.email).trim().toLowerCase();
    this.normalizedEmail = this.email;
  }
  const registrationNumber = normalizeCompanyIdentifier(this.registrationNumber);
  const tinNumber = normalizeCompanyIdentifier(this.tinNumber);
  // Blank values must not be stored. The unique sparse indexes treat "" as a real key,
  // so a second landlord with no TIN would be rejected as a duplicate company.
  if (!registrationNumber) this.registrationNumber = undefined;
  if (!tinNumber) this.tinNumber = undefined;
  this.normalizedRegistrationNumber = registrationNumber;
  this.normalizedTinNumber = tinNumber;

  // Legacy companies may have placeholder or missing legal identifiers. Enforce
  // stricter validation only for new/changed registered-business records.
  const shouldEnforceBusinessFields =
    this.isNew ||
    this.isModified('companyType') ||
    this.isModified('registrationNumber') ||
    this.isModified('tinNumber');
  if (shouldEnforceBusinessFields && (this.companyType || 'REGISTERED_BUSINESS') === 'REGISTERED_BUSINESS') {
    if (!this.registrationNumber) {
      this.invalidate('registrationNumber', 'Registration number is required for registered businesses');
    }
    if (!this.tinNumber) {
      this.invalidate('tinNumber', 'TIN number is required for registered businesses');
    }
  }
  next();
});

// Ensure agent + agency percentages of remaining equal 1.0
companySchema.pre('validate', function(next) {
  // @ts-ignore
  const cfg = this.commissionConfig as any;
  if (cfg) {
    const sum = Number(cfg.agentPercentOfRemaining || 0) + Number(cfg.agencyPercentOfRemaining || 0);
    // allow small floating errors
    if (Math.abs(sum - 1) > 1e-6) {
      this.invalidate('commissionConfig.agencyPercentOfRemaining', 'Agent and Agency percentages of remaining must sum to 1.0');
    }
    if (cfg.preaPercentOfTotal < 0 || cfg.preaPercentOfTotal > 1) {
      this.invalidate('commissionConfig.preaPercentOfTotal', 'PREA percent must be between 0 and 1');
    }
  }
  next();
});

companySchema.post('save', function () {
  triggerDashboardKpiRefresh((this as any)?._id?.toString?.());
});

companySchema.post('findOneAndUpdate', function (doc: any) {
  const queryId = (this as any)?.getQuery?.()?._id;
  const id = doc?._id || queryId;
  triggerDashboardKpiRefresh(id?.toString?.());
});

// Remove index definitions as they are now handled in indexes.ts
export const Company = mongoose.model<ICompany>('Company', companySchema, COLLECTIONS.COMPANIES);
export default Company; 