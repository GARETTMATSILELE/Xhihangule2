import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { AppError } from '../middleware/errorHandler';
import { hasAnyRole } from '../utils/access';

export const getUserCommissionSummary = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) {
      throw new AppError('Authentication required', 401);
    }

    const targetUserId = req.params.id;
    const { saleOnly, startDate, endDate, limit } = req.query as any;

    // Authorization: allow self, admin, accountant, principal, or prea within same company
    if (String(req.user.userId) !== String(targetUserId) && !hasAnyRole(req, ['admin','accountant','principal','prea'])) {
      throw new AppError('Forbidden', 403);
    }

    const q: any = {
      agentId: new mongoose.Types.ObjectId(targetUserId),
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      status: 'completed'
    };
    if (String(saleOnly) === 'true') {
      q.paymentType = 'sale';
    }

    if (startDate || endDate) {
      q.paymentDate = {} as any;
      if (startDate) q.paymentDate.$gte = new Date(String(startDate));
      if (endDate) q.paymentDate.$lte = new Date(String(endDate));
    }

    // Aggregate totals
    const cursor = Payment.find(q)
      .select('paymentDate commissionDetails referenceNumber manualPropertyAddress propertyId tenantId paymentType')
      .sort({ paymentDate: -1 });

    const docs = await cursor.lean();

    const totalAgentCommission = docs.reduce((s, d: any) => s + Number(d?.commissionDetails?.agentShare || 0), 0);
    const totalAgencyCommission = docs.reduce((s, d: any) => s + Number(d?.commissionDetails?.agencyShare || 0), 0);
    const totalPrea = docs.reduce((s, d: any) => s + Number(d?.commissionDetails?.preaFee || 0), 0);

    const lim = Math.max(0, Math.min(100, Number(limit || 10)));
    const items = lim > 0 ? docs.slice(0, lim).map((d: any) => ({
      id: String(d._id),
      date: d.paymentDate,
      amount: d.amount,
      agentShare: d?.commissionDetails?.agentShare || 0,
      agencyShare: d?.commissionDetails?.agencyShare || 0,
      preaFee: d?.commissionDetails?.preaFee || 0,
      referenceNumber: d.referenceNumber,
      manualPropertyAddress: d.manualPropertyAddress,
      paymentType: d.paymentType
    })) : [];

    return res.json({
      totalAgentCommission,
      totalAgencyCommission,
      totalPrea,
      count: docs.length,
      items
    });
  } catch (err: any) {
    const status = err?.statusCode || 500;
    return res.status(status).json({ message: err?.message || 'Failed to get commission summary' });
  }
};

import { NextFunction } from 'express';
import { User } from '../models/User';
import { UserRole } from '../types/auth';

export const getCurrentUser = async (userId: string) => {
  if (!userId) {
    throw new AppError('User ID is required', 400);
  }

  try {
    const user = await User.findById(userId).select('-password');
    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching user', 500);
  }
};

export const createUser = async (userData: any) => {
  console.log('Creating user with data:', userData);

  // Check if user already exists
  const existingUser = await User.findOne({ email: userData.email, companyId: userData.companyId });
  if (existingUser) {
    throw new AppError('User already exists', 400);
  }

  // Normalize roles: if roles array provided, ensure unique/valid and set primary role
  const VALID_ROLES = ['admin','agent','accountant','owner','sales','principal','prea'];
  let payload: any = { ...userData };
  if (Array.isArray(userData.roles) && userData.roles.length > 0) {
    const roles = Array.from(new Set(userData.roles.map((r: any) => String(r)))).filter((r: any) => VALID_ROLES.includes(r));
    if (roles.length === 0) throw new AppError('At least one valid role is required', 400);
    payload.roles = roles;
    // Set primary role if not provided or not valid
    if (!VALID_ROLES.includes(String(userData.role))) {
      payload.role = roles[0];
    }
  }

  // Create new user
  const user = await User.create(payload);
  console.log('User created successfully:', user);

  // Return user without password
  const { password, ...userWithoutPassword } = user.toObject();
  return userWithoutPassword;
}; 

export const updateUserById = async (id: string, updates: any, currentCompanyId?: string) => {
  if (!id) {
    throw new AppError('User ID is required', 400);
  }

  const user = await User.findById(id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Enforce company scoping if provided
  if (currentCompanyId && user.companyId && user.companyId.toString() !== currentCompanyId) {
    throw new AppError('Forbidden: User does not belong to your company', 403);
  }

  // Apply allowed updates
  if (typeof updates.firstName === 'string') user.firstName = updates.firstName;
  if (typeof updates.lastName === 'string') user.lastName = updates.lastName;
  if (typeof updates.email === 'string') user.email = updates.email;
  if (typeof updates.role === 'string') user.role = updates.role;
  // Update roles array if provided
  const VALID_ROLES = ['admin','agent','accountant','owner','sales','principal','prea'];
  if (Array.isArray(updates.roles)) {
    const roles = Array.from(new Set(updates.roles.map((r: any) => String(r)))).filter((r: any) => VALID_ROLES.includes(r));
    if (roles.length === 0) {
      throw new AppError('At least one valid role is required', 400);
    }
    (user as any).roles = roles as any;
    // Ensure primary role is aligned with roles array
    if (!roles.includes(user.role)) {
      user.role = roles[0] as any;
    }
  }

  // If password provided and non-empty, set it so pre-save hook re-hashes
  if (typeof updates.password === 'string' && updates.password.trim().length > 0) {
    user.password = updates.password;
  }

  await user.save();

  const { password, ...userWithoutPassword } = user.toObject();
  return userWithoutPassword;
};