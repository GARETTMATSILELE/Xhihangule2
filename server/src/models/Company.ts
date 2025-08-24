import mongoose, { Document, Schema, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

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
  address: string;
  phone: string;
  email: string;
  website?: string;
  registrationNumber: string;
  tinNumber: string;
  vatNumber?: string;
  ownerId: Types.ObjectId;
  description?: string;
  logo?: string;
  isActive: boolean;
  subscriptionStatus: 'active' | 'inactive' | 'trial';
  subscriptionEndDate?: Date;
  bankAccounts: IBankAccount[];
  commissionConfig?: {
    preaPercentOfTotal: number; // 0.0 - 1.0
    agentPercentOfRemaining: number; // 0.0 - 1.0
    agencyPercentOfRemaining: number; // 0.0 - 1.0 (agent + agency should equal 1.0)
  };
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
  website: {
    type: String,
    trim: true
  },
  registrationNumber: {
    type: String,
    required: true,
    trim: true
  },
  tinNumber: {
    type: String,
    required: true,
    trim: true
  },
  vatNumber: {
    type: String,
    trim: true
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
    enum: ['active', 'inactive', 'trial'],
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
    }
  }
}, {
  timestamps: true
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

// Remove index definitions as they are now handled in indexes.ts
export const Company = mongoose.model<ICompany>('Company', companySchema, COLLECTIONS.COMPANIES);
export default Company; 