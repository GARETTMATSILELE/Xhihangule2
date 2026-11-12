import mongoose from 'mongoose';
import { Request } from 'express';
import { Property } from '../models/Property';
import { AppError } from '../middleware/errorHandler';
import { planOwnerPropertyAssignment, propertyIdsForCaller } from '../utils/propertyAccess';

export interface OwnerPropertyAssignmentPlan {
  properties: string[];
  selectedByCaller: string[];
  removed: string[];
}

export async function validateOwnerPropertyAssignment(
  req: Request,
  ownerId: string | null,
  existingPropertyIds: string[],
  requestedPropertyIds: unknown[],
): Promise<OwnerPropertyAssignmentPlan> {
  if (!Array.isArray(requestedPropertyIds)) {
    throw new AppError('propertyIds must be an array', 400);
  }
  if (!req.user?.companyId) {
    throw new AppError('Company ID not found', 400);
  }

  const requestedIds = requestedPropertyIds.map((propertyId) => String(propertyId));
  if (requestedIds.some((propertyId) => !mongoose.Types.ObjectId.isValid(propertyId))) {
    throw new AppError('One or more property IDs are invalid.', 400);
  }

  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const accessible = await propertyIdsForCaller(req);
  const assignment = planOwnerPropertyAssignment(
    existingPropertyIds.map(String),
    requestedIds,
    accessible === 'company' ? 'company' : accessible.map(String),
  );
  if (assignment.rejected.length > 0) {
    throw new AppError('All properties must belong to your authorized portfolio.', 403);
  }

  const accessibleRequested = assignment.properties.filter(
    (propertyId) => accessible === 'company' || accessible.some((row) => String(row) === propertyId),
  );
  if (accessibleRequested.length > 0) {
    const companyProperties = await Property.find({
      _id: { $in: accessibleRequested.map((propertyId) => new mongoose.Types.ObjectId(propertyId)) },
      companyId,
      isDeleted: { $ne: true },
    }).select('_id propertyOwnerId');

    if (companyProperties.length !== accessibleRequested.length) {
      throw new AppError('All properties must belong to your company.', 403);
    }
    const assignedElsewhere = companyProperties.find((property) =>
      property.propertyOwnerId && String(property.propertyOwnerId) !== String(ownerId || ''),
    );
    if (assignedElsewhere) {
      throw new AppError('One or more properties are already assigned to another owner.', 403);
    }
  }

  return {
    properties: assignment.properties,
    selectedByCaller: accessibleRequested,
    removed: assignment.removed,
  };
}

/** Writes the landlord pointer. Does not change Property.ownerId or any financial record. */
export async function commitOwnerPropertyLinks(
  companyId: mongoose.Types.ObjectId | string,
  ownerId: mongoose.Types.ObjectId | string,
  plan: OwnerPropertyAssignmentPlan,
): Promise<void> {
  const cid = new mongoose.Types.ObjectId(String(companyId));
  const oid = new mongoose.Types.ObjectId(String(ownerId));
  if (plan.selectedByCaller.length > 0) {
    await Property.updateMany(
      {
        _id: { $in: plan.selectedByCaller.map((propertyId) => new mongoose.Types.ObjectId(propertyId)) },
        companyId: cid,
        isDeleted: { $ne: true },
      },
      { $set: { propertyOwnerId: oid } },
    );
  }
  if (plan.removed.length > 0) {
    await Property.updateMany(
      {
        _id: { $in: plan.removed.map((propertyId) => new mongoose.Types.ObjectId(propertyId)) },
        companyId: cid,
        propertyOwnerId: oid,
      },
      { $unset: { propertyOwnerId: 1 } },
    );
  }
}
