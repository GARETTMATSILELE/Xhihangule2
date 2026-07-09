import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { JwtPayload } from '../types/auth';
import { AppError } from '../middleware/errorHandler';
import { PropertyOwner } from '../models/PropertyOwner';
import { Company } from '../models/Company';
import { getPropertyFinancialSnapshot } from '../services/propertyFinancialSnapshotService';
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

/** Same ledger snapshot as GET /accountants/property-accounts/:propertyId */
export const propertyLedgerSnapshot = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const propertyId = req.params.propertyId;
  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) {
    throw new AppError('Invalid property ID', 400);
  }
  const ledger = (req.query.ledger as 'rental' | 'sale') || 'rental';
  const snapshot = await getPropertyFinancialSnapshot(propertyId, companyId, ledger);
  res.json(snapshot);
};

export const ownersDashboard = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const [kpis, owners] = await Promise.all([
    getOwnersDashboard(companyId),
    getOwnerListSummaries(companyId),
  ]);
  res.json({ ...kpis, owners });
};

export const ownerPortfolio = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const data = await getOwnerPortfolio(ownerIdParam(req), companyId);
  res.json(data);
};

export const ownerFinancials = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const data = await getOwnerFinancials(ownerIdParam(req), companyId);
  res.json(data);
};

export const ownerMaintenance = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const data = await getOwnerMaintenance(ownerIdParam(req), companyId);
  res.json(data);
};

export const ownerDocumentsList = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const docs = await getOwnerDocuments(ownerIdParam(req), companyId);
  res.json(docs);
};

export const ownerDocumentsUpload = async (req: Request, res: Response) => {
  const { companyId, userId } = ctx(req);
  const ownerId = req.body.ownerId || ownerIdParam(req);
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
  const banking = await upsertOwnerBanking(ownerIdParam(req), companyId, req.body);
  res.json(banking);
};

export const ownerPreferencesUpsert = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const prefs = await upsertOwnerPreferences(ownerIdParam(req), companyId, req.body);
  res.json(prefs);
};

export const ownerProfileExtras = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const extras = await getOwnerProfileExtras(ownerIdParam(req), companyId);
  res.json(extras);
};

export const ownerHistoryList = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const history = await getOwnershipHistory(ownerIdParam(req), companyId);
  res.json(history);
};

export const ownershipHistoryCreate = async (req: Request, res: Response) => {
  const { companyId, userId } = ctx(req);
  const history = await addOwnershipHistory({
    propertyId: req.body.propertyId,
    ownerId: req.body.ownerId || ownerIdParam(req),
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
  const company = await Company.findById(companyId).select('name').lean();
  const pdf = await generateOwnerDocument({
    type,
    ownerId: ownerIdParam(req),
    companyId,
    companyName: company?.name || 'Company',
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-${ownerIdParam(req)}.pdf"`);
  res.send(pdf);
};

export const ownerFullProfile = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const ownerId = ownerIdParam(req);
  const [portfolio, financials, maintenance, documents, history, extras] = await Promise.all([
    getOwnerPortfolio(ownerId, companyId),
    getOwnerFinancials(ownerId, companyId),
    getOwnerMaintenance(ownerId, companyId),
    getOwnerDocuments(ownerId, companyId),
    getOwnershipHistory(ownerId, companyId),
    getOwnerProfileExtras(ownerId, companyId),
  ]);
  res.json({ portfolio, financials, maintenance, documents, history, extras });
};

/** Extend owner record with profile fields (non-destructive). */
export const ownerProfilePatch = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const allowed = [
    'firstName', 'lastName', 'email', 'phone', 'nationalId', 'passportNumber',
    'taxNumber', 'address', 'active',
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const owner = await PropertyOwner.findOneAndUpdate(
    { _id: ownerIdParam(req), companyId },
    { $set: updates },
    { new: true, runValidators: true }
  ).select('-password');
  if (!owner) throw new AppError('Property owner not found', 404);
  res.json(owner);
};
