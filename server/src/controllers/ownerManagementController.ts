import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { JwtPayload } from '../types/auth';
import { AppError } from '../middleware/errorHandler';
import { PropertyOwner } from '../models/PropertyOwner';
import { Company } from '../models/Company';
import { getPropertyFinancialSnapshot } from '../services/propertyFinancialSnapshotService';
import { callerCanAccessProperty, callerCanMutatePropertyOwner, callerCanReadPropertyOwner, propertyIdsForCaller, propertyOwnerIdsForCaller } from '../utils/propertyAccess';
import { validateOwnerContact } from '../services/propertyOwnerGuards';
import { setOwnerActiveState, syncOwnerPortalProfile } from '../services/ownerRetirementService';
import {
  getOwnersDashboard,
  getOwnerListSummaries,
  getOwnerPortfolio,
  getOwnerFinancials,
  getOwnerMaintenance,
  getOwnerDocuments,
  uploadOwnerDocument,
  upsertOwnerBanking,
  upsertOwnerPreferences,
  getOwnerProfileExtras,
  addOwnershipHistory,
  getOwnershipHistory,
  getPropertyOwnershipHistory,
  generateOwnerDocument,
} from '../services/ownerManagementService';

const ctx = (req: Request) => {
  const user = req.user as JwtPayload;
  if (!user?.companyId) throw new AppError('Company context required', 403);
  return { companyId: user.companyId, userId: user.userId };
};

const ownerIdParam = (req: Request) => {
  const id = req.params.ownerId || req.params.id || req.body.ownerId;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new AppError('Invalid owner ID', 400);
  return String(id);
};

async function requireReadableOwner(req: Request, res: Response, ownerId: string): Promise<boolean> {
  if (await callerCanReadPropertyOwner(req, ownerId)) return true;
  res.status(404).json({ message: 'Property owner not found' });
  return false;
}

async function requireMutableOwner(req: Request, res: Response, ownerId: string): Promise<boolean> {
  if (await callerCanMutatePropertyOwner(req, ownerId)) return true;
  res.status(404).json({ message: 'Property owner not found' });
  return false;
}

async function visiblePropertyScope(req: Request): Promise<string[] | undefined> {
  const ids = await propertyIdsForCaller(req);
  return ids === 'company' ? undefined : ids.map(String);
}

/** Same ledger snapshot as GET /accountants/property-accounts/:propertyId */
export const propertyLedgerSnapshot = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const propertyId = req.params.propertyId;
  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
    throw new AppError('Invalid property ID', 400);
  }
  if (!(await callerCanAccessProperty(req, propertyId))) {
    return res.status(404).json({ message: 'Property not found' });
  }
  const ledger = (req.query.ledger as 'rental' | 'sale') || 'rental';
  const snapshot = await getPropertyFinancialSnapshot(propertyId, companyId, ledger);
  res.json(snapshot);
};

export const ownersDashboard = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const scope = await propertyOwnerIdsForCaller(req);
  const ownerIds = scope === 'company' ? undefined : scope.map(String);
  const visiblePropertyIds = await visiblePropertyScope(req);
  const [kpis, owners] = await Promise.all([
    getOwnersDashboard(companyId, ownerIds, visiblePropertyIds),
    getOwnerListSummaries(companyId, ownerIds, visiblePropertyIds),
  ]);
  res.json({ ...kpis, owners });
};

export const ownerPortfolio = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  if (!(await requireReadableOwner(req, res, ownerId))) return;
  const data = await getOwnerPortfolio(ownerId, companyId, await visiblePropertyScope(req));
  res.json(data);
};

export const ownerFinancials = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  if (!(await requireReadableOwner(req, res, ownerId))) return;
  const data = await getOwnerFinancials(ownerId, companyId, await visiblePropertyScope(req));
  res.json(data);
};

export const ownerMaintenance = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  if (!(await requireReadableOwner(req, res, ownerId))) return;
  const data = await getOwnerMaintenance(ownerId, companyId, await visiblePropertyScope(req));
  res.json(data);
};

export const ownerDocumentsList = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  if (!(await requireReadableOwner(req, res, ownerId))) return;
  const docs = await getOwnerDocuments(ownerId, companyId);
  res.json(docs);
};

export const ownerDocumentsUpload = async (req: Request, res: Response) => {
  const { companyId, userId } = ctx(req);
  const ownerId = req.body.ownerId || ownerIdParam(req);
  if (!(await requireMutableOwner(req, res, ownerId))) return;
  const doc = await uploadOwnerDocument({
    ownerId,
    companyId,
    userId: userId!,
    documentType: req.body.documentType,
    fileName: req.body.fileName,
    fileUrl: req.body.fileUrl,
    mimeType: req.body.mimeType,
    fileSize: req.body.fileSize,
  });
  res.status(201).json(doc);
};

export const ownerBankingUpsert = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  if (!(await requireMutableOwner(req, res, ownerId))) return;
  const banking = await upsertOwnerBanking(ownerId, companyId, req.body);
  res.json(banking);
};

export const ownerPreferencesUpsert = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  if (!(await requireMutableOwner(req, res, ownerId))) return;
  const prefs = await upsertOwnerPreferences(ownerId, companyId, req.body);
  res.json(prefs);
};

export const ownerProfileExtras = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  if (!(await requireReadableOwner(req, res, ownerId))) return;
  const extras = await getOwnerProfileExtras(ownerId, companyId);
  res.json(extras);
};

export const ownerHistoryList = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  if (!(await requireReadableOwner(req, res, ownerId))) return;
  const history = await getOwnershipHistory(ownerId, companyId);
  res.json(history);
};

export const ownershipHistoryCreate = async (req: Request, res: Response) => {
  const { companyId, userId } = ctx(req);
  const ownerId = req.body.ownerId || ownerIdParam(req);
  if (!(await requireMutableOwner(req, res, ownerId))) return;
  const history = await addOwnershipHistory({
    propertyId: req.body.propertyId,
    ownerId,
    companyId,
    userId: userId!,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    ownershipPercentage: req.body.ownershipPercentage,
    notes: req.body.notes,
  });
  res.status(201).json(history);
};

export const propertyOwnershipHistory = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  if (!req.params.propertyId || !(await callerCanAccessProperty(req, req.params.propertyId))) {
    return res.status(404).json({ message: 'Property not found' });
  }
  const history = await getPropertyOwnershipHistory(req.params.propertyId, companyId);
  res.json(history);
};

export const ownerDocumentPdf = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const type = (req.params.docType || 'owner-statement') as
    | 'owner-statement'
    | 'portfolio-report'
    | 'outstanding-rent'
    | 'maintenance-summary'
    | 'ownership-history';
  const ownerId = ownerIdParam(req);
  if (!(await requireReadableOwner(req, res, ownerId))) return;
  const company = await Company.findById(companyId).select('name').lean();
  const pdf = await generateOwnerDocument({
    type,
    ownerId,
    companyId,
    companyName: company?.name || 'Company',
    visiblePropertyIds: await visiblePropertyScope(req),
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-${ownerId}.pdf"`);
  res.send(pdf);
};

export const ownerFullProfile = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  if (!(await requireReadableOwner(req, res, ownerId))) return;
  const visiblePropertyIds = await visiblePropertyScope(req);
  const [portfolio, financials, maintenance, documents, history, extras] = await Promise.all([
    getOwnerPortfolio(ownerId, companyId, visiblePropertyIds),
    getOwnerFinancials(ownerId, companyId, visiblePropertyIds),
    getOwnerMaintenance(ownerId, companyId, visiblePropertyIds),
    getOwnerDocuments(ownerId, companyId),
    getOwnershipHistory(ownerId, companyId),
    getOwnerProfileExtras(ownerId, companyId),
  ]);
  res.json({ portfolio, financials, maintenance, documents, history, extras });
};

/** Extend owner record with profile fields (non-destructive). */
export const ownerProfilePatch = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  if (!(await requireMutableOwner(req, res, ownerId))) return;
  const allowed = [
    'firstName', 'lastName', 'email', 'phone', 'nationalId', 'passportNumber',
    'taxNumber', 'address', 'active',
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  for (const key of ['firstName', 'lastName', 'email', 'phone']) {
    if (updates[key] !== undefined && !String(updates[key]).trim()) {
      return res.status(400).json({ message: `${key} cannot be empty` });
    }
  }
  const contactError = validateOwnerContact({
    email: updates.email as string | undefined,
    phone: updates.phone as string | undefined,
  });
  if (contactError) return res.status(400).json({ message: contactError });
  if (typeof updates.email === 'string') updates.email = updates.email.trim().toLowerCase();
  const existing = await PropertyOwner.findOne({ _id: ownerId, companyId }).select('email firstName lastName');
  if (!existing) return res.status(404).json({ message: 'Property owner not found' });
  if (updates.email) {
    const duplicate = await PropertyOwner.findOne({
      email: updates.email,
      companyId,
      _id: { $ne: existing._id },
    }).select('_id');
    if (duplicate) return res.status(400).json({ message: 'Property owner with this email already exists' });
  }
  const owner = await PropertyOwner.findOneAndUpdate(
    { _id: ownerId, companyId },
    { $set: updates },
    { new: true, runValidators: true }
  ).select('-password -tokens');
  if (!owner) return res.status(404).json({ message: 'Property owner not found' });
  await syncOwnerPortalProfile({
    previousEmail: existing.email,
    companyId,
    email: typeof updates.email === 'string' ? updates.email : undefined,
    firstName: typeof updates.firstName === 'string' ? updates.firstName : undefined,
    lastName: typeof updates.lastName === 'string' ? updates.lastName : undefined,
  });
  if (typeof updates.active === 'boolean') {
    await setOwnerActiveState(ownerId, companyId, updates.active);
  }
  res.json(owner);
};
