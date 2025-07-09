import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { COLLECTIONS } from '../config/collections';
import { JWT_CONFIG } from '../config/jwt';

export interface IPropertyOwner extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyId: mongoose.Types.ObjectId;
  properties: mongoose.Types.ObjectId[];
  tokens: { token: string }[];
  createdAt: Date;
  updatedAt: Date;
  generateAuthToken(): Promise<string>;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const propertyOwnerSchema = new Schema({
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
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  companyId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  properties: [{
    type: Schema.Types.ObjectId,
    ref: 'Property'
  }],
  tokens: [{
    token: {
      type: String,
      required: true
    }
  }]
}, {
  timestamps: true
});

// Hash password before saving
propertyOwnerSchema.pre('save', async function(next) {
  const owner = this;
  if (owner.isModified('password')) {
    owner.password = await bcrypt.hash(owner.password, 8);
  }
  next();
});

// Compare password method
propertyOwnerSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

propertyOwnerSchema.methods.generateAuthToken = async function() {
  const owner = this;
  const token = jwt.sign(
    { _id: owner._id.toString(), role: 'owner' },
    JWT_CONFIG.SECRET,
    { expiresIn: '7d' }
  );
  owner.tokens = owner.tokens.concat({ token });
  await owner.save();
  return token;
};

export const PropertyOwner = mongoose.model<IPropertyOwner>('PropertyOwner', propertyOwnerSchema, COLLECTIONS.PROPERTY_OWNERS); 