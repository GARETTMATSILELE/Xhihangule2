import { Request } from 'express';
import { Document, Types } from 'mongoose';

export type UserRole = 'admin' | 'agent' | 'accountant' | 'owner' | 'sales' | 'principal' | 'prea' | 'system_admin';

export interface IUser {
  _id: string;
  email: string;
  password: string;
  role: UserRole;
  roles?: UserRole[];
  firstName: string;
  lastName: string;
  companyId?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignUpData {
  email: string;
  password: string;
  name: string;
  company?: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website?: string;
    registrationNumber?: string;
    tinNumber?: string;
    vatNumber?: string;
  };
}

export interface AuthResponse {
  user: Omit<IUser, 'password'>;
  token: string;
}

export interface AuthError {
  message: string;
  code: string;
}

export interface JwtPayload {
  userId: string;
  role: UserRole;
  roles?: UserRole[];
  companyId?: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// Extend Express Request type to include user and owner
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      owner?: IPropertyOwner;
      token?: string;
    }
  }
}

export interface IPropertyOwner extends Document {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyId: Types.ObjectId;
  properties: Types.ObjectId[];
  tokens: Array<{ token: string }>;
  comparePassword(password: string): Promise<boolean>;
  generateAuthToken(): Promise<string>;
}

export interface CompanyData {
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  registrationNumber?: string;
  tinNumber?: string;
  vatNumber?: string;
  ownerId: Types.ObjectId;
}

// Helper function to check if request is authenticated
export const isAuthenticated = (req: Request): boolean => {
  return req.user !== undefined;
}

// Helper function to check if request is owner authenticated
export const isOwnerAuthenticated = (req: Request): boolean => {
  return req.owner !== undefined;
} 