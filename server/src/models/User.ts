import mongoose, { Document, Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserRole } from '../types/auth';
import { COLLECTIONS } from '../config/collections';

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  roles?: UserRole[];
  companyId?: Types.ObjectId;
  isActive: boolean;
  lastLogin?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  // Running totals for accounting and commissions
  commission?: number;
  balance?: number;
  // Avatar fields
  avatar?: string;
  avatarMimeType?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['admin', 'agent', 'accountant', 'owner', 'sales', 'principal', 'prea'] as UserRole[],
    default: 'agent'
  },
  roles: {
    type: [String],
    enum: ['admin', 'agent', 'accountant', 'owner', 'sales', 'principal', 'prea'] as UserRole[],
    required: false,
    default: undefined
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  resetPasswordToken: {
    type: String,
    required: false,
    index: true
  },
  resetPasswordExpires: {
    type: Date,
    required: false
  }
}, {
  timestamps: true
});

// Numeric fields for balances/commissions with safe defaults
// Using separate definitions to avoid changing ordering of existing schema fields
userSchema.add({
  commission: { type: Number, default: 0, min: 0 },
  balance: { type: Number, default: 0 }
});

// Avatar fields (stored as base64 + mimetype)
userSchema.add({
  avatar: { type: String, required: false },
  avatarMimeType: { type: String, required: false }
});

// Hash password before saving
userSchema.pre('save', async function(this: IUser, next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user can access a specific role's dashboard
userSchema.methods.canAccessRole = function(role: UserRole): boolean {
  const list: UserRole[] = Array.isArray((this as any).roles) && (this as any).roles!.length > 0
    ? (this as any).roles as UserRole[]
    : [this.role];
  return list.includes(role);
};

// Create and export the model
export const User = mongoose.model<IUser>('User', userSchema, COLLECTIONS.USERS); 