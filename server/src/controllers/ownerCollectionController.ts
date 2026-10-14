import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { OwnerCollection } from '../models/OwnerCollection';
import { Property } from '../models/Property';
import { Payment } from '../models/Payment';
import { explainOwnerWaterfall } from '../reporting/ownerWaterfall';
import { assertOwnerCollectionTransition, OwnerCollectionStatus } from '../services/ownerCollectionService';

function companyId(req: AuthRequest): string | null {
  const id = (req.user as any)?.companyId || (req.user as any)?.company;
  return id ? String(id) : null;
}

export async function listOwnerCollections(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const rows = await OwnerCollection.find({ companyId: company })
    .sort({ updatedAt: -1 })
    .limit(100)
    .populate('propertyId', 'name address')
    .lean();
  return res.json({
    status: 'success',
    data: rows,
    note: 'Operational collection status is not a financial posting.',
  });
}

export async function createOwnerCollection(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const { propertyId, operationalAmount, notes, currency, overrideReason } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(propertyId)) return res.status(400).json({ message: 'Property is required' });
  const property = await Property.findOne({ _id: propertyId, companyId: company }).select('ownerId').lean();
  if (!property?.ownerId) return res.status(404).json({ message: 'Property owner was not found in this company' });
  const payment = await Payment.findOne({
    companyId: company,
    propertyId,
    status: 'completed',
    paymentType: { $in: ['rental', 'introduction'] },
  }).sort({ paymentDate: -1 }).select('amount commissionDetails paymentAllocation').lean();
  const snapshot = (payment as any)?.commissionDetails || {};
  const waterfall = payment ? explainOwnerWaterfall({
    grossAmount: Number(snapshot.grossRent ?? (payment as any).amount ?? 0),
    commissionAmount: Number(snapshot.commissionNet ?? snapshot.totalCommission ?? 0),
    levyAmount: Number(snapshot.levy ?? 0),
    vatOnCommission: Number(snapshot.vatOnCommission ?? snapshot.vatAmount ?? 0),
    recordedOwnerAmount: (payment as any).paymentAllocation?.ownerPayable,
  }) : null;
  const authoritative = waterfall ? waterfall.netOwnerAmount : undefined;
  const requested = operationalAmount === undefined || operationalAmount === null || operationalAmount === ''
    ? authoritative
    : Number(operationalAmount);
  if (requested === undefined || Number.isNaN(requested)) {
    return res.status(400).json({ message: 'An authoritative owner amount was not found. Record the rental payment before requesting collection.' });
  }
  const overridden = authoritative !== undefined && Math.abs(Number(requested) - authoritative) > 0.009;
  if (overridden && !overrideReason) {
    return res.status(400).json({ message: 'An amount that differs from the owner waterfall requires an override reason. Accounting is not changed.' });
  }
  const row = await OwnerCollection.create({
    companyId: company,
    propertyId,
    ownerId: property.ownerId,
    operationalAmount: Number(requested),
    authoritativeAmount: authoritative,
    amountSource: overridden ? 'OPERATIONAL_OVERRIDE' : 'OWNER_WATERFALL',
    overrideReason: overridden ? String(overrideReason) : undefined,
    currency: currency || 'USD',
    status: 'OWNER_REQUESTED',
    notes,
    requestedBy: (req.user as any)?.userId,
  });
  return res.status(201).json({ status: 'success', data: row, financialPosting: false });
}

export async function advanceOwnerCollection(req: AuthRequest, res: Response) {
  const company = companyId(req);
  if (!company) return res.status(403).json({ message: 'Company scope required' });
  const row = await OwnerCollection.findOne({ _id: req.params.id, companyId: company });
  if (!row) return res.status(404).json({ message: 'Collection was not found in this company' });
  const requested = String(req.body?.status || '') as OwnerCollectionStatus;
  try {
    assertOwnerCollectionTransition(row.status as OwnerCollectionStatus, requested);
  } catch (error: any) {
    return res.status(error.status || 409).json({ message: error.message });
  }
  row.status = requested;
  if (requested === 'READY_FOR_COLLECTION') row.preparedBy = (req.user as any)?.userId;
  if (requested === 'COLLECTED') row.collectedBy = (req.user as any)?.userId;
  if (requested === 'ACKNOWLEDGED' && req.body?.acknowledgementReference) {
    row.acknowledgementReference = String(req.body.acknowledgementReference);
  }
  await row.save();
  return res.json({ status: 'success', data: row, financialPosting: false });
}
