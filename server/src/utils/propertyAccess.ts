import mongoose from 'mongoose';
import { Request } from 'express';
import { UserRole } from '../types/auth';
import { hasAnyRole, getUserRoles } from './access';
import { Property } from '../models/Property';
import { PropertyOwner } from '../models/PropertyOwner';
import { User } from '../models/User';

/**
 * Company-wide property visibility already used by search and property reports.
 * These roles are an explicit permission. A plain agent is not in this list.
 */
export const COMPANY_WIDE_PROPERTY_ROLES: UserRole[] = ['admin', 'accountant', 'principal', 'prea'];

export function hasCompanyWidePropertyAccess(req: Request): boolean {
  return hasAnyRole(req, COMPANY_WIDE_PROPERTY_ROLES);
}

/**
 * Portfolio rule confirmed from the schema and write paths:
 * - ownerId is the User who created the property (often the agent who saved it).
 * - agentId is the formal assignment, when one was recorded.
 * - propertyOwnerId is the PropertyOwner landlord and is not an agent grant.
 */
export function agentPortfolioClause(userId: string): { $or: Array<Record<string, mongoose.Types.ObjectId>> } {
  const id = new mongoose.Types.ObjectId(userId);
  return { $or: [{ ownerId: id }, { agentId: id }] };
}

export async function propertyIdsForCaller(req: Request): Promise<mongoose.Types.ObjectId[] | 'company'> {
  if (!req.user?.userId || !req.user.companyId) return [];
  if (hasCompanyWidePropertyAccess(req)) return 'company';

  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const roles = getUserRoles(req);
  const isPortfolioStaff = roles.some((role) => role === 'agent' || role === 'sales');
  if (!isPortfolioStaff && roles.includes('owner')) {
    const resolved = await landlordPropertyIds(req.user.userId, req.user.companyId);
    return resolved;
  }

  return Property.find({
    companyId,
    isDeleted: { $ne: true },
    ...agentPortfolioClause(req.user.userId),
  }).distinct('_id');
}

export async function callerCanAccessProperty(
  req: Request,
  propertyId: string,
  options?: { includeDeleted?: boolean }
): Promise<boolean> {
  if (!req.user?.companyId || !req.user.userId || !mongoose.Types.ObjectId.isValid(String(propertyId))) return false;
  if (hasCompanyWidePropertyAccess(req) || options?.includeDeleted) {
    const exists = await Property.exists({
      _id: propertyId,
      companyId: req.user.companyId,
      ...(hasCompanyWidePropertyAccess(req) ? {} : agentPortfolioClause(req.user.userId)),
      ...(options?.includeDeleted ? {} : { isDeleted: { $ne: true } }),
    });
    return Boolean(exists);
  }
  const ids = await propertyIdsForCaller(req);
  if (ids === 'company') return false;
  return ids.some((id) => String(id) === String(propertyId));
}

export async function landlordPropertyIds(userId: string, companyHint?: string): Promise<mongoose.Types.ObjectId[]> {
  const hint = companyHint && mongoose.Types.ObjectId.isValid(companyHint)
    ? new mongoose.Types.ObjectId(companyHint)
    : undefined;
  let owner = mongoose.Types.ObjectId.isValid(userId)
    ? await PropertyOwner.findOne({
      _id: userId,
      ...(hint ? { companyId: hint } : {}),
    }).select('_id properties companyId').lean()
    : null;

  if (!owner && mongoose.Types.ObjectId.isValid(userId)) {
    const user = await User.findById(userId).select('email role companyId').lean();
    if (user && (user as any).role === 'owner' && (user as any).email) {
      const companyId = (user as any).companyId || hint;
      owner = await PropertyOwner.findOne({
        email: (user as any).email,
        ...(companyId ? { companyId } : {}),
      }).select('_id properties companyId').lean();
    }
  }

  if (!owner) return [];
  const companyId = (owner as any).companyId || hint;
  const rows = await Property.find({
    ...(companyId ? { companyId } : {}),
    isDeleted: { $ne: true },
    $or: [
      { propertyOwnerId: (owner as any)._id },
      ...(((owner as any).properties || []).length ? [{ _id: { $in: (owner as any).properties } }] : []),
    ],
  }).select('_id').lean();
  return rows.map((row: any) => row._id);
}

export async function propertyOwnerIdsForCaller(req: Request): Promise<mongoose.Types.ObjectId[] | 'company'> {
  if (!req.user?.companyId) return [];
  if (hasCompanyWidePropertyAccess(req)) return 'company';
  const ids = await propertyIdsForCaller(req);
  if (ids === 'company') return 'company';
  if (!ids.length) return [];
  const fromLink = await Property.distinct('propertyOwnerId', {
    _id: { $in: ids },
    companyId: req.user.companyId,
    propertyOwnerId: { $ne: null },
  });
  const fromArray = await PropertyOwner.find({
    companyId: req.user.companyId,
    properties: { $in: ids },
  }).distinct('_id');
  const merged = new Map<string, mongoose.Types.ObjectId>();
  for (const id of [...fromLink, ...fromArray]) {
    if (id) merged.set(String(id), id as mongoose.Types.ObjectId);
  }
  return [...merged.values()];
}

export async function callerCanReadPropertyOwner(req: Request, ownerId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(String(ownerId))) return false;
  const ids = await propertyOwnerIdsForCaller(req);
  if (ids === 'company') {
    return Boolean(await PropertyOwner.exists({ _id: ownerId, companyId: req.user?.companyId }));
  }
  return ids.some((id) => String(id) === String(ownerId));
}

/**
 * A shared landlord record may be read by each agent who manages one of its properties.
 * Mutating it is limited to callers whose portfolio already contains every linked property,
 * so one agent cannot rename a landlord that also belongs to another agent's property.
 */
export async function callerCanMutatePropertyOwner(req: Request, ownerId: string): Promise<boolean> {
  if (!req.user?.companyId || !mongoose.Types.ObjectId.isValid(String(ownerId))) return false;
  const owner = await PropertyOwner.findOne({ _id: ownerId, companyId: req.user.companyId }).select('_id properties').lean();
  if (!owner) return false;
  if (hasCompanyWidePropertyAccess(req)) return true;
  const visible = await propertyIdsForCaller(req);
  if (visible === 'company') return true;
  const visibleSet = new Set(visible.map(String));
  const linked = new Set<string>((((owner as any).properties) || []).map(String));
  const rows = await Property.find({
    companyId: req.user.companyId,
    isDeleted: { $ne: true },
    propertyOwnerId: ownerId,
  }).select('_id').lean();
  for (const row of rows) linked.add(String((row as any)._id));
  if (!linked.size) return false;
  for (const id of linked) {
    if (!visibleSet.has(id)) return false;
  }
  return true;
}
