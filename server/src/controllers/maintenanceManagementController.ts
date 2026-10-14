import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { MaintenanceVerification } from '../models/MaintenanceVerification';
import { JwtPayload } from '../types/auth';
import { AppError } from '../middleware/errorHandler';
import { contractorDirectoryFilter, MaintenanceContractor } from '../models/MaintenanceContractor';
import { MaintenanceWorkOrder } from '../models/MaintenanceWorkOrder';
import { MaintenanceQuote } from '../models/MaintenanceQuote';
import { MaintenanceAttachmentRecord } from '../models/MaintenanceAttachment';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { recordAuditEvent } from '../services/auditService';
import {
  getMaintenanceDashboard,
  getMaintenanceTimeline,
  createWorkOrder,
  assignContractor,
  uploadMaintenancePhoto,
  addQuotation,
  recordVerification,
  getPropertyMaintenanceHistory,
  getContractorPerformance,
  generateMaintenanceDocument,
  logMaintenanceActivity,
  scheduleFollowUpInspection,
  getOwnerMaintenanceSummary,
} from '../services/maintenanceManagementService';
import { Company } from '../models/Company';
import { Property } from '../models/Property';

const ctx = (req: Request) => {
  const user = req.user as JwtPayload;
  if (!user?.userId || !user?.companyId) throw new AppError('Authentication required', 401);
  return { userId: user.userId, companyId: user.companyId, role: user.role };
};

export const getDashboard = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const data = await getMaintenanceDashboard(companyId);
  res.json(data);
};

export const getTimeline = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const timeline = await getMaintenanceTimeline(req.params.id, companyId);
  res.json(timeline);
};

export const postWorkOrder = async (req: Request, res: Response) => {
  const { userId, companyId } = ctx(req);
  const workOrder = await createWorkOrder({
    maintenanceRequestId: req.body.maintenanceRequestId || req.params.id,
    companyId,
    userId,
    notes: req.body.notes,
    targetCompletionDate: req.body.targetCompletionDate,
  });
  const populated = await MaintenanceWorkOrder.findById(workOrder._id)
    .populate('maintenanceRequestId', 'title status')
    .populate('propertyId', 'name address');
  res.status(201).json(populated);
};

export const postAssignContractor = async (req: Request, res: Response) => {
  const { userId, companyId } = ctx(req);
  const result = await assignContractor({
    maintenanceRequestId: req.body.maintenanceRequestId || req.params.id,
    workOrderId: req.body.workOrderId,
    contractorId: req.body.contractorId,
    companyId,
    userId,
    targetCompletionDate: req.body.targetCompletionDate,
  });
  res.json(result);
};

export const postUploadPhoto = async (req: Request, res: Response) => {
  const { userId, companyId } = ctx(req);
  const { type, fileUrl, fileName, mimeType, requestId } = req.body;
  if (!fileUrl || !type) throw new AppError('fileUrl and type are required', 400);
  const attachment = await uploadMaintenancePhoto({
    requestId: requestId || req.params.id,
    companyId,
    userId,
    type,
    fileUrl,
    fileName,
    mimeType,
  });
  res.status(201).json(attachment);
};

export const postQuotation = async (req: Request, res: Response) => {
  const { userId, companyId } = ctx(req);
  const quote = await addQuotation({
    requestId: req.body.requestId || req.params.id,
    companyId,
    userId,
    contractorId: req.body.contractorId,
    amount: Number(req.body.amount),
    description: req.body.description,
    fileUrl: req.body.fileUrl,
    fileName: req.body.fileName,
  });
  res.status(201).json(quote);
};

export const postVerification = async (req: Request, res: Response) => {
  const { userId, companyId } = ctx(req);
  const result = await recordVerification({
    requestId: req.body.requestId || req.params.id,
    companyId,
    userId,
    outcome: req.body.outcome,
    comments: req.body.comments,
  });
  res.json(result);
};

export const getPropertyHistory = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const history = await getPropertyMaintenanceHistory(req.params.propertyId, companyId);
  res.json(history);
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const listContractors = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const query: any = contractorDirectoryFilter(companyId);
  if (req.query.active === 'true') query.active = true;
  const category = String(req.query.category || req.query.trade || '').trim();
  if (category) {
    const pattern = new RegExp(`^${escapeRegex(category)}$`, 'i');
    query.$and = [...(query.$and || []), { $or: [{ trade: pattern }, { skills: pattern }] }];
  }
  const contractors = await MaintenanceContractor.find(query)
    .populate('userId', 'avatar avatarMimeType')
    .sort({ companyName: 1 })
    .lean();
  res.json(contractors.map((row: any) => {
    const user = row.userId && typeof row.userId === 'object' ? row.userId : null;
    return {
      ...row,
      userId: user?._id || row.userId || undefined,
      profileImage: user?.avatar || undefined,
      profileImageType: user?.avatarMimeType || undefined,
    };
  }));
};

export const createContractor = async (req: Request, res: Response) => {
  const { userId, companyId } = ctx(req);
  const { companyName, contactPerson, phone, email, trade, address, notes, rating, active } = req.body;
  if (!companyName || !contactPerson || !phone || !email || !trade) {
    throw new AppError('companyName, contactPerson, phone, email, and trade are required', 400);
  }
  const contractor = await MaintenanceContractor.create({
    companyId,
    companyName,
    contactPerson,
    phone,
    email,
    trade,
    address,
    notes,
    rating: rating ?? 0,
    active: active !== false,
  });
  await recordAuditEvent({
    userId,
    companyId,
    action: 'maintenance.contractor.create',
    entityType: 'MaintenanceContractor',
    entityId: String(contractor._id),
  });
  res.status(201).json(contractor);
};

export const updateContractor = async (req: Request, res: Response) => {
  const { userId, companyId } = ctx(req);
  const contractor = await MaintenanceContractor.findOneAndUpdate(
    { _id: req.params.id, companyId },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!contractor) throw new AppError('Contractor not found', 404);
  await recordAuditEvent({
    userId,
    companyId,
    action: 'maintenance.contractor.update',
    entityType: 'MaintenanceContractor',
    entityId: String(contractor._id),
  });
  res.json(contractor);
};

export const getContractorDashboard = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const performance = await getContractorPerformance(companyId);
  res.json(performance);
};

export const getRequestPhotos = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const photos = await MaintenanceAttachmentRecord.find({
    requestId: req.params.id,
    companyId,
  }).sort({ uploadedAt: -1 });
  res.json(photos);
};

export const getRequestQuotes = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const quotes = await MaintenanceQuote.find({ requestId: req.params.id, companyId })
    .populate('contractorId', 'companyName trade')
    .sort({ submittedDate: -1 });
  res.json(quotes);
};

export const getRequestWorkOrder = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const workOrder = await MaintenanceWorkOrder.findOne({
    maintenanceRequestId: req.params.id,
    companyId,
  }).populate('contractorId', 'companyName contactPerson phone trade');
  res.json(workOrder || null);
};

export const updateWorkOrderStatus = async (req: Request, res: Response) => {
  const { userId, companyId } = ctx(req);
  const { status } = req.body;
  const workOrder = await MaintenanceWorkOrder.findOne({ _id: req.params.workOrderId, companyId });
  if (!workOrder) throw new AppError('Work order not found', 404);

  workOrder.status = status;
  if (status === 'In Progress') {
    await MaintenanceRequest.updateOne({ _id: workOrder.maintenanceRequestId }, { $set: { status: 'in_progress' } });
    await logMaintenanceActivity({
      requestId: workOrder.maintenanceRequestId,
      companyId,
      action: 'Work Started',
      description: `Work order ${workOrder.workOrderNumber} in progress`,
      createdBy: userId,
    });
  }
  if (status === 'Completed') {
    workOrder.completionDate = new Date();
    await MaintenanceRequest.updateOne({ _id: workOrder.maintenanceRequestId }, { $set: { status: 'completed' } });
    await logMaintenanceActivity({
      requestId: workOrder.maintenanceRequestId,
      companyId,
      action: 'Completed',
      description: `Work order ${workOrder.workOrderNumber} completed`,
      createdBy: userId,
    });
  }
  await workOrder.save();
  res.json(workOrder);
};

export const closeMaintenanceRequest = async (req: Request, res: Response) => {
  const { userId, companyId } = ctx(req);
  const request = await MaintenanceRequest.findOne({ _id: req.params.id, companyId });
  if (!request) throw new AppError('Maintenance request not found', 404);
  request.status = 'closed';
  await request.save();
  await logMaintenanceActivity({
    requestId: request._id,
    companyId,
    action: 'Closed',
    description: 'Maintenance request closed',
    createdBy: userId,
  });
  res.json(request);
};

export const downloadDocument = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const type = (req.params.docType || 'maintenance-report') as
    | 'maintenance-report'
    | 'work-order'
    | 'quotation-summary'
    | 'completion-certificate';
  const company = await Company.findById(companyId).select('name').lean();
  const pdf = await generateMaintenanceDocument({
    type,
    requestId: req.params.id,
    companyId,
    companyName: company?.name || 'Company',
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-${req.params.id}.pdf"`);
  res.send(pdf);
};

export const scheduleFollowUp = async (req: Request, res: Response) => {
  const { userId, companyId } = ctx(req);
  const followUp = await scheduleFollowUpInspection({
    maintenanceRequestId: req.params.id,
    companyId,
    userId,
    scheduledDate: req.body.scheduledDate,
    scheduledTime: req.body.scheduledTime,
    notes: req.body.notes,
  });
  res.status(201).json(followUp);
};

export const getOwnerSummary = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const userId = (req.user as JwtPayload).userId;
  const properties = await Property.find({ ownerId: userId, companyId }).select('_id').lean();
  const propertyIds = properties.map((p: any) => String(p._id));
  const summary = await getOwnerMaintenanceSummary(propertyIds, companyId);
  res.json(summary);
};

export const getRequestDetailBundle = async (req: Request, res: Response) => {
  const { companyId } = ctx(req);
  const request = await MaintenanceRequest.findOne({ _id: req.params.id, companyId })
    .populate('propertyId', 'name address')
    .populate('requestedBy', 'firstName lastName email')
    .populate('ownerId', 'firstName lastName')
    .populate('contractorId', 'companyName trade contactPerson phone');
  if (!request) throw new AppError('Maintenance request not found', 404);

  const [timeline, photos, quotes, workOrder, verifications] = await Promise.all([
    getMaintenanceTimeline(req.params.id, companyId),
    MaintenanceAttachmentRecord.find({ requestId: req.params.id }).sort({ uploadedAt: -1 }),
    MaintenanceQuote.find({ requestId: req.params.id }).populate('contractorId', 'companyName'),
    MaintenanceWorkOrder.findOne({ maintenanceRequestId: req.params.id }).populate('contractorId', 'companyName'),
    MaintenanceVerification.find({ requestId: req.params.id }).sort({ recordedAt: -1 }),
  ]);

  res.json({ request, timeline, photos, quotes, workOrder, verifications });
};
