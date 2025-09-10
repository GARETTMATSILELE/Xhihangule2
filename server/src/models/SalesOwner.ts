import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import { COLLECTIONS } from '../config/collections';

export interface ISalesOwner extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyId: mongoose.Types.ObjectId;
  creatorId: mongoose.Types.ObjectId;
  properties?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const salesOwnerSchema = new Schema({
  email: { type: String, required: true, trim: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, immutable: true },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  properties: [{ type: Schema.Types.ObjectId, ref: 'Property' }]
}, { timestamps: true });

salesOwnerSchema.pre('save', async function(next) {
  const owner = this as any;
  if (owner.isModified('password')) {
    owner.password = await bcrypt.hash(owner.password, 8);
  }
  next();
});

salesOwnerSchema.methods.comparePassword = function(candidatePassword: string) {
  return bcrypt.compare(candidatePassword, (this as any).password);
};

export const SalesOwner = mongoose.model<ISalesOwner>('SalesOwner', salesOwnerSchema, COLLECTIONS.SALES_OWNERS);


