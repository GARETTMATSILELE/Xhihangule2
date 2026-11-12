import mongoose from 'mongoose';
import { PropertyOwner } from '../models/PropertyOwner';
import { Property } from '../models/Property';
import { Lease } from '../models/Lease';
import { Payment } from '../models/Payment';
import { OwnershipHistory } from '../models/OwnershipHistory';
import { OwnerDocument } from '../models/OwnerDocument';
import { User } from '../models/User';
import PropertyAccount from '../models/PropertyAccount';
import { AppError } from '../middleware/errorHandler';
import { ownerRetirementMode } from './propertyOwnerGuards';
import { resolveOwnerPropertyIds } from './ownerManagementService';

export interface OwnerRetirementResult {
  mode: 'deactivated' | 'deleted';
  message: string;
}

async function setOwnerPortalActive(email: string, companyId: string, active: boolean): Promise<void> {
  const user = await User.findOne({
    email: String(email || '').toLowerCase(),
    companyId,
    role: 'owner',
  });
  if (!user) return;
  const roles = Array.isArray((user as any).roles) && (user as any).roles.length
    ? (user as any).roles as string[]
    : [user.role];
  if (!roles.every((role) => role === 'owner')) return;
  user.isActive = active;
  await user.save();
}

export async function syncOwnerPortalProfile(input: {
  previousEmail: string;
  companyId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}): Promise<void> {
  const user = await User.findOne({
    email: String(input.previousEmail || '').toLowerCase(),
    companyId: input.companyId,
    role: 'owner',
  });
  if (!user) return;
  if (input.firstName) user.firstName = input.firstName;
  if (input.lastName) user.lastName = input.lastName;
  if (input.email) {
    const nextEmail = String(input.email).trim().toLowerCase();
    if (nextEmail && nextEmail !== user.email) {
      const clash = await User.findOne({
        email: nextEmail,
        companyId: input.companyId,
        _id: { $ne: user._id },
      }).select('_id');
      if (clash) throw new AppError('Email already in use by another user', 400);
      user.email = nextEmail;
    }
  }
  await user.save();
}

/**
 * Deactivate owners that still anchor properties or financial history.
 * Hard-delete is limited to records with no linked history. Properties, leases,
 * payments and ledgers are never removed by this function.
 */
export async function retirePropertyOwner(ownerId: string, companyId: string): Promise<OwnerRetirementResult> {
  if (!mongoose.Types.ObjectId.isValid(ownerId)) {
    throw new AppError('Invalid owner ID', 400);
  }
  const owner = await PropertyOwner.findOne({ _id: ownerId, companyId });
  if (!owner) throw new AppError('Property owner not found', 404);

  const propertyIds = await resolveOwnerPropertyIds(ownerId, companyId);
  const cid = new mongoose.Types.ObjectId(companyId);
  const [leaseCount, paymentCount, accountCount, historyCount, documentCount] = await Promise.all([
    propertyIds.length
      ? Lease.countDocuments({ companyId: cid, propertyId: { $in: propertyIds } })
      : Promise.resolve(0),
    propertyIds.length
      ? Payment.countDocuments({ companyId: cid, propertyId: { $in: propertyIds } })
      : Promise.resolve(0),
    propertyIds.length
      ? PropertyAccount.countDocuments({ propertyId: { $in: propertyIds } })
      : Promise.resolve(0),
    OwnershipHistory.countDocuments({ ownerId: owner._id, companyId: cid }),
    OwnerDocument.countDocuments({ ownerId: owner._id, companyId: cid }),
  ]);

  const mode = ownerRetirementMode({
    linkedPropertyCount: propertyIds.length,
    leaseCount,
    paymentCount,
    accountCount,
    historyCount,
    documentCount,
  });

  if (mode === 'deactivate') {
    owner.active = false;
    await owner.save();
    await setOwnerPortalActive(owner.email, companyId, false);
    return {
      mode: 'deactivated',
      message: 'This owner has properties or financial history, so the record was deactivated. Properties, leases and financial records were kept.',
    };
  }

  await setOwnerPortalActive(owner.email, companyId, false);
  await PropertyOwner.findOneAndDelete({ _id: owner._id, companyId: cid });
  await Property.updateMany(
    { companyId: cid, propertyOwnerId: owner._id },
    { $unset: { propertyOwnerId: 1 } },
  );
  return {
    mode: 'deleted',
    message: 'Property owner deleted. No properties or financial history were attached.',
  };
}

export async function setOwnerActiveState(ownerId: string, companyId: string, active: boolean): Promise<void> {
  const owner = await PropertyOwner.findOne({ _id: ownerId, companyId }).select('email');
  if (!owner) return;
  await setOwnerPortalActive(owner.email, companyId, active);
}
