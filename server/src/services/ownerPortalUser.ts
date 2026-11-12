import mongoose from 'mongoose';
import { User } from '../models/User';

export type OwnerPortalDecision = 'create' | 'already_owner' | 'blocked';

export function decideOwnerPortalAccess(
  existing: { companyId?: unknown; role?: string; roles?: string[] } | null,
  companyId: string,
): OwnerPortalDecision {
  if (!existing) return 'create';
  const sameCompany = String(existing.companyId || '') === String(companyId);
  const roles = Array.isArray(existing.roles) && existing.roles.length ? existing.roles : [existing.role || ''];
  const ownerOnly = roles.length > 0 && roles.every((role) => role === 'owner');
  if (sameCompany && ownerOnly) return 'already_owner';
  return 'blocked';
}

export async function provisionOwnerPortalUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyId: string;
}): Promise<{ portalAccess: 'created' | 'already_available' | 'unavailable'; portalMessage: string }> {
  const email = String(input.email || '').trim().toLowerCase();
  const companyId = String(input.companyId);
  const existing = await User.findOne({ email }).select('companyId role roles');
  const decision = decideOwnerPortalAccess(existing, companyId);

  if (decision === 'already_owner') {
    return {
      portalAccess: 'already_available',
      portalMessage: 'Owner portal access already exists for this email.',
    };
  }
  if (decision === 'blocked') {
    return {
      portalAccess: 'unavailable',
      portalMessage: 'The owner was saved, but portal access was not created because this email already belongs to another account.',
    };
  }

  try {
    await new User({
      email,
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
      role: 'owner',
      roles: ['owner'],
      companyId: new mongoose.Types.ObjectId(companyId),
      isActive: true,
    }).save();
    return {
      portalAccess: 'created',
      portalMessage: 'Owner portal access was created.',
    };
  } catch (error: any) {
    if (error?.code === 11000) {
      return {
        portalAccess: 'unavailable',
        portalMessage: 'The owner was saved, but portal access was not created because this email already belongs to another account.',
      };
    }
    throw error;
  }
}
