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

import { User } from '../models/User';
import { assertCompanyAssignableRoleSet } from '../utils/companyUserRoles';

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
  const existingUser = await User.findOne({ email: userData.email, companyId: userData.companyId, isArchived: { $ne: true } });
  if (existingUser) {
    throw new AppError('User already exists', 400);
  }

  const assignment = assertCompanyAssignableRoleSet(userData.role, userData.roles);
  const payload: any = {
    email: userData.email,
    password: userData.password,
    firstName: userData.firstName,
    lastName: userData.lastName,
    companyId: userData.companyId,
    isActive: true,
  };
  if (assignment.roles) {
    payload.roles = assignment.roles;
    payload.role = assignment.role;
  } else if (assignment.role) {
    payload.role = assignment.role;
  }

  const user = await User.create(payload);
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
  if ((user as any).isArchived) {
    throw new AppError('Archived users cannot be updated', 400);
  }

  // A missing company on the target is not a grant. Platform users are not editable here.
  if (!currentCompanyId || !user.companyId || user.companyId.toString() !== String(currentCompanyId)) {
    throw new AppError('Forbidden: User does not belong to your company', 403);
  }

  const targetRoles = [
    String(user.role || ''),
    ...(Array.isArray((user as any).roles) ? (user as any).roles.map((role: unknown) => String(role)) : []),
  ];
  if (targetRoles.includes('system_admin')) {
    throw new AppError('Forbidden', 403);
  }

  // Apply allowed updates. companyId, isActive, and platform roles are not accepted.
  if (typeof updates.firstName === 'string') user.firstName = updates.firstName;
  if (typeof updates.lastName === 'string') user.lastName = updates.lastName;
  if (typeof updates.email === 'string') user.email = updates.email;
  if (updates.role !== undefined || updates.roles !== undefined) {
    const assignment = assertCompanyAssignableRoleSet(
      updates.role !== undefined ? updates.role : undefined,
      updates.roles !== undefined ? updates.roles : undefined
    );
    if (assignment.roles) {
      (user as any).roles = assignment.roles;
      if (!assignment.roles.includes(user.role as any)) {
        user.role = assignment.role as any;
      }
    }
    if (updates.role !== undefined && assignment.role) {
      user.role = assignment.role as any;
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

export const deleteUserById = async (id: string, actorUserId?: string, currentCompanyId?: string) => {
  if (!id) {
    throw new AppError('User ID is required', 400);
  }

  const user = await User.findById(id);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (currentCompanyId && user.companyId && user.companyId.toString() !== currentCompanyId) {
    throw new AppError('Forbidden: User does not belong to your company', 403);
  }

  if ((user as any).isArchived) {
    return {
      alreadyArchived: true,
      id: String(user._id),
      isActive: Boolean(user.isActive)
    };
  }

  if (actorUserId && String(user._id) === String(actorUserId)) {
    throw new AppError('You cannot delete your own account', 400);
  }

  (user as any).archivedDetails = {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    roles: Array.isArray((user as any).roles) ? (user as any).roles : undefined
  };
  (user as any).isArchived = true;
  (user as any).archivedAt = new Date();
  (user as any).archivedBy = actorUserId ? new mongoose.Types.ObjectId(actorUserId) : undefined;
  user.isActive = false;

  await user.save();

  return {
    id: String(user._id),
    isArchived: true,
    archivedAt: (user as any).archivedAt
  };
};