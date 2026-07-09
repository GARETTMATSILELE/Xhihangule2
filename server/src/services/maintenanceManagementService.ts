import mongoose from 'mongoose';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { MaintenanceWorkOrder } from '../models/MaintenanceWorkOrder';
import { MaintenanceActivity } from '../models/MaintenanceActivity';
import { MaintenanceAttachmentRecord, ALLOWED_ATTACHMENT_MIME } from '../models/MaintenanceAttachment';
import { MaintenanceQuote } from '../models/MaintenanceQuote';
import { MaintenanceVerification } from '../models/MaintenanceVerification';
import { MaintenanceContractor } from '../models/MaintenanceContractor';
import { PaymentRequest } from '../models/PaymentRequest';
import { Property } from '../models/Property';
import { AppError } from '../middleware/errorHandler';
import { recordAuditEvent } from './auditService';
import {
  MAINTENANCE_STATUSES,
  normalizeMaintenanceStatus,
  OPEN_STATUSES,
  APPROVAL_STATUSES,
  IN_PROGRESS_STATUSES,
  isOwnerApproved,
} from '../utils/maintenanceStatus';
import { generateTrustReportPdf } from './reportGenerator';
import { Inspection } from '../models/Inspection';
import {
  buildInspectionReminders,
  defaultChecklistForInspection,
  resolveInspectionStatus,
} from './inspectionScheduleEngine';
import { notifyInspectionEvent } from './inspectionNotificationService';

type ActorContext = {
  userId: string;
  companyId: string;
  role?: string;
};

export async function logMaintenanceActivity(input: {
  requestId: mongoose.Types.ObjectId | string;
  companyId: mongoose.Types.ObjectId | string;
  action: string;
  description: string;
  createdBy?: string;
}) {
  await MaintenanceActivity.create({
    requestId: input.requestId,
    companyId: input.companyId,
    action: input.action,
    description: input.description,
    createdBy: input.createdBy,
    createdAt: new Date(),
  });
  await MaintenanceRequest.updateOne(
    { _id: input.requestId },
    { $set: { lastActivityAt: new Date() } }
  );
}

export async function generateWorkOrderNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  const latest = await MaintenanceWorkOrder.findOne({
    companyId,
    workOrderNumber: new RegExp(`^${prefix}`),
  })
    .sort({ workOrderNumber: -1 })
    .select('workOrderNumber')
    .lean();

  let seq = 1;
  if (latest?.workOrderNumber) {
    const parts = latest.workOrderNumber.split('-');
    const lastSeq = parseInt(parts[2] || '0', 10);
    if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export async function getMaintenanceDashboard(companyId: string) {
  const cid = new mongoose.Types.ObjectId(companyId);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const requests = await MaintenanceRequest.find({ companyId: cid }).lean();
  const normalized = requests.map((r) => ({ ...r, normStatus: normalizeMaintenanceStatus(r.status) }));

  const openRequests = normalized.filter((r) =>
    OPEN_STATUSES.includes(r.normStatus) && !['closed', 'rejected', 'verified'].includes(r.normStatus)
  ).length;

  const awaitingApproval = normalized.filter((r) => APPROVAL_STATUSES.includes(r.status!) || r.normStatus === 'awaiting_approval').length;
  const awaitingPayment = normalized.filter((r) => ['awaiting_payment', 'pending_completion'].includes(r.status!) || r.normStatus === 'awaiting_payment').length;
  const inProgress = normalized.filter((r) => IN_PROGRESS_STATUSES.includes(r.normStatus) || r.status === 'in_progress').length;

  const completedThisMonth = normalized.filter((r) => {
    const s = r.normStatus;
    if (!['completed', 'verified', 'closed'].includes(s) && r.status !== 'completed') return false;
    const d = r.updatedAt ? new Date(r.updatedAt) : null;
    return d && d >= monthStart;
  }).length;

  const completedRequests = normalized.filter((r) =>
    ['completed', 'verified', 'closed'].includes(r.normStatus) || r.status === 'completed'
  );
  let totalResolutionMs = 0;
  let resolutionCount = 0;
  for (const r of completedRequests) {
    if (r.createdAt && r.updatedAt) {
      totalResolutionMs += new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime();
      resolutionCount += 1;
    }
  }
  const avgResolutionDays = resolutionCount
    ? Math.round((totalResolutionMs / resolutionCount / (1000 * 60 * 60 * 24)) * 10) / 10
    : 0;

  const statusCounts: Record<string, number> = {};
  for (const r of normalized) {
    const key = r.normStatus;
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  const requestsByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  const categoryCounts: Record<string, number> = {};
  for (const r of requests) {
    const cat = r.category || 'GENERAL';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }
  const requestsByCategory = Object.entries(categoryCounts).map(([category, count]) => ({ category, count }));

  const monthlySpend: Record<string, number> = {};
  for (const r of requests) {
    const d = r.updatedAt ? new Date(r.updatedAt) : new Date(r.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cost = Number(r.paidAmount || r.estimatedCost || 0);
    if (cost > 0 && ['completed', 'verified', 'closed', 'funded', 'in_progress', 'assigned'].includes(normalizeMaintenanceStatus(r.status))) {
      monthlySpend[key] = (monthlySpend[key] || 0) + cost;
    }
  }
  const monthlyMaintenanceSpend = Object.entries(monthlySpend)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amount]) => ({ month, amount }));

  const propertyCost: Record<string, { propertyId: string; propertyName: string; cost: number; count: number }> = {};
  for (const r of requests) {
    const pid = String(r.propertyId);
    const cost = Number(r.paidAmount || r.estimatedCost || 0);
    if (!propertyCost[pid]) propertyCost[pid] = { propertyId: pid, propertyName: pid, cost: 0, count: 0 };
    propertyCost[pid].cost += cost;
    propertyCost[pid].count += 1;
  }
  const properties = await Property.find({ companyId: cid }).select('name').lean();
  const propNameMap = new Map(properties.map((p) => [String(p._id), p.name]));
  const topPropertiesByCost = Object.values(propertyCost)
    .map((p) => ({ ...p, propertyName: propNameMap.get(p.propertyId) || p.propertyName }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  return {
    kpis: {
      openRequests,
      awaitingApproval,
      awaitingPayment,
      inProgress,
      completedThisMonth,
      averageResolutionDays: avgResolutionDays,
    },
    charts: {
      requestsByStatus,
      requestsByCategory,
      monthlyMaintenanceSpend,
      topPropertiesByCost,
    },
  };
}

export async function getMaintenanceTimeline(requestId: string, companyId: string) {
  return MaintenanceActivity.find({ requestId, companyId })
    .populate('createdBy', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .lean();
}

export async function createWorkOrder(input: {
  maintenanceRequestId: string;
  companyId: string;
  userId: string;
  notes?: string;
  targetCompletionDate?: string;
}) {
  const request = await MaintenanceRequest.findOne({
    _id: input.maintenanceRequestId,
    companyId: input.companyId,
  });
  if (!request) throw new AppError('Maintenance request not found', 404);

  const norm = normalizeMaintenanceStatus(request.status);
  if (!['approved', 'funded', 'awaiting_payment', 'pending_completion'].includes(norm) && !isOwnerApproved(request.status)) {
    throw new AppError('Work order can only be generated for approved requests', 400);
  }

  const existing = await MaintenanceWorkOrder.findOne({ maintenanceRequestId: request._id });
  if (existing) throw new AppError('Work order already exists for this request', 409);

  const workOrderNumber = await generateWorkOrderNumber(input.companyId);
  const workOrder = await MaintenanceWorkOrder.create({
    workOrderNumber,
    maintenanceRequestId: request._id,
    propertyId: request.propertyId,
    companyId: input.companyId,
    status: 'Assigned',
    notes: input.notes,
    targetCompletionDate: input.targetCompletionDate ? new Date(input.targetCompletionDate) : undefined,
    assignedBy: input.userId,
    assignedDate: new Date(),
  });

  request.status = 'assigned';
  await request.save();

  await logMaintenanceActivity({
    requestId: request._id,
    companyId: input.companyId,
    action: 'Work Order Generated',
    description: `Work order ${workOrderNumber} created`,
    createdBy: input.userId,
  });

  await recordAuditEvent({
    userId: input.userId,
    companyId: input.companyId,
    action: 'maintenance.work_order.create',
    entityType: 'MaintenanceWorkOrder',
    entityId: String(workOrder._id),
    metadata: { workOrderNumber, maintenanceRequestId: input.maintenanceRequestId },
  });

  return workOrder;
}

export async function assignContractor(input: {
  maintenanceRequestId: string;
  workOrderId?: string;
  contractorId: string;
  companyId: string;
  userId: string;
  targetCompletionDate?: string;
}) {
  const contractor = await MaintenanceContractor.findOne({
    _id: input.contractorId,
    companyId: input.companyId,
    active: true,
  });
  if (!contractor) throw new AppError('Contractor not found or inactive', 404);

  const request = await MaintenanceRequest.findOne({
    _id: input.maintenanceRequestId,
    companyId: input.companyId,
  });
  if (!request) throw new AppError('Maintenance request not found', 404);

  let workOrder = input.workOrderId
    ? await MaintenanceWorkOrder.findOne({ _id: input.workOrderId, companyId: input.companyId })
    : await MaintenanceWorkOrder.findOne({ maintenanceRequestId: request._id, companyId: input.companyId });

  if (!workOrder) {
    workOrder = await createWorkOrder({
      maintenanceRequestId: input.maintenanceRequestId,
      companyId: input.companyId,
      userId: input.userId,
      targetCompletionDate: input.targetCompletionDate,
    });
  }

  workOrder.contractorId = contractor._id as any;
  workOrder.assignedBy = new mongoose.Types.ObjectId(input.userId);
  workOrder.assignedDate = new Date();
  workOrder.status = 'Assigned';
  if (input.targetCompletionDate) workOrder.targetCompletionDate = new Date(input.targetCompletionDate);
  await workOrder.save();

  request.contractorId = contractor._id as any;
  request.status = 'assigned';
  await request.save();

  await logMaintenanceActivity({
    requestId: request._id,
    companyId: input.companyId,
    action: 'Assigned To Contractor',
    description: `Assigned to ${contractor.companyName} (${contractor.trade})`,
    createdBy: input.userId,
  });

  return { workOrder, contractor, request };
}

export async function uploadMaintenancePhoto(input: {
  requestId: string;
  companyId: string;
  userId: string;
  type: 'BEFORE' | 'AFTER';
  fileUrl: string;
  fileName?: string;
  mimeType?: string;
}) {
  if (input.mimeType && !ALLOWED_ATTACHMENT_MIME.includes(input.mimeType)) {
    throw new AppError('Unsupported file type. Allowed: jpg, jpeg, png, webp, pdf', 400);
  }

  const request = await MaintenanceRequest.findOne({ _id: input.requestId, companyId: input.companyId });
  if (!request) throw new AppError('Maintenance request not found', 404);

  const attachment = await MaintenanceAttachmentRecord.create({
    requestId: input.requestId,
    companyId: input.companyId,
    type: input.type,
    fileUrl: input.fileUrl,
    fileName: input.fileName,
    mimeType: input.mimeType,
    uploadedBy: input.userId,
    uploadedAt: new Date(),
  });

  await logMaintenanceActivity({
    requestId: input.requestId,
    companyId: input.companyId,
    action: input.type === 'BEFORE' ? 'Problem Photo Uploaded' : 'Completion Photo Uploaded',
    description: input.fileName || 'Photo uploaded',
    createdBy: input.userId,
  });

  return attachment;
}

export async function addQuotation(input: {
  requestId: string;
  companyId: string;
  userId: string;
  contractorId?: string;
  amount: number;
  description: string;
  fileUrl?: string;
  fileName?: string;
}) {
  const request = await MaintenanceRequest.findOne({ _id: input.requestId, companyId: input.companyId });
  if (!request) throw new AppError('Maintenance request not found', 404);

  const quote = await MaintenanceQuote.create({
    requestId: input.requestId,
    companyId: input.companyId,
    contractorId: input.contractorId,
    amount: input.amount,
    description: input.description,
    fileUrl: input.fileUrl,
    fileName: input.fileName,
    submittedDate: new Date(),
    createdBy: input.userId,
  });

  if (!request.estimatedCost || request.estimatedCost === 0) {
    request.estimatedCost = input.amount;
    request.requestedAmount = input.amount;
    await request.save();
  }

  await logMaintenanceActivity({
    requestId: input.requestId,
    companyId: input.companyId,
    action: 'Quotation Submitted',
    description: `Quote for $${input.amount.toFixed(2)}: ${input.description}`,
    createdBy: input.userId,
  });

  return quote;
}

export async function recordVerification(input: {
  requestId: string;
  companyId: string;
  userId: string;
  outcome: 'Tenant Confirmed' | 'Tenant Rejected' | 'Unable To Reach';
  comments?: string;
}) {
  const request = await MaintenanceRequest.findOne({ _id: input.requestId, companyId: input.companyId });
  if (!request) throw new AppError('Maintenance request not found', 404);

  const norm = normalizeMaintenanceStatus(request.status);
  if (norm !== 'completed' && request.status !== 'completed') {
    throw new AppError('Verification is only available after work is completed', 400);
  }

  const verification = await MaintenanceVerification.create({
    requestId: input.requestId,
    companyId: input.companyId,
    outcome: input.outcome,
    comments: input.comments,
    recordedBy: input.userId,
    recordedAt: new Date(),
  });

  if (input.outcome === 'Tenant Rejected') {
    request.status = 'in_progress';
    const workOrder = await MaintenanceWorkOrder.findOne({ maintenanceRequestId: request._id });
    if (workOrder) {
      workOrder.status = 'In Progress';
      workOrder.completionDate = undefined;
      await workOrder.save();
    }
  } else if (input.outcome === 'Tenant Confirmed') {
    request.status = 'verified';
  } else {
    request.status = 'completed';
  }

  await request.save();

  await logMaintenanceActivity({
    requestId: input.requestId,
    companyId: input.companyId,
    action: 'Tenant Verification',
    description: `${input.outcome}${input.comments ? `: ${input.comments}` : ''}`,
    createdBy: input.userId,
  });

  return { verification, request };
}

export async function getPropertyMaintenanceHistory(propertyId: string, companyId: string) {
  const requests = await MaintenanceRequest.find({ propertyId, companyId })
    .populate('contractorId', 'companyName trade')
    .sort({ createdAt: -1 })
    .lean();

  const workOrders = await MaintenanceWorkOrder.find({ propertyId, companyId }).lean();
  const woMap = new Map(workOrders.map((w) => [String(w.maintenanceRequestId), w]));

  return requests.map((r) => {
    const wo = woMap.get(String(r._id));
    return {
      _id: r._id,
      date: r.createdAt,
      issue: r.title,
      description: r.description,
      cost: Number(r.paidAmount || r.estimatedCost || 0),
      contractor: (r.contractorId as any)?.companyName || null,
      contractorTrade: (r.contractorId as any)?.trade || null,
      status: normalizeMaintenanceStatus(r.status),
      statusRaw: r.status,
      priority: r.priority,
      category: r.category,
      workOrderNumber: wo?.workOrderNumber || null,
      paymentStatus: r.paymentStatus,
    };
  });
}

export async function getContractorPerformance(companyId: string) {
  const contractors = await MaintenanceContractor.find({ companyId, active: true }).lean();
  const workOrders = await MaintenanceWorkOrder.find({ companyId })
    .populate('maintenanceRequestId', 'estimatedCost paidAmount')
    .lean();

  return contractors.map((c) => {
    const jobs = workOrders.filter((w) => String(w.contractorId) === String(c._id));
    const completed = jobs.filter((j) => j.status === 'Completed');
    let totalMs = 0;
    let completedWithDates = 0;
    for (const j of completed) {
      if (j.assignedDate && j.completionDate) {
        totalMs += new Date(j.completionDate).getTime() - new Date(j.assignedDate).getTime();
        completedWithDates += 1;
      }
    }
    const totalValue = jobs.reduce((sum, j) => {
      const req = j.maintenanceRequestId as any;
      return sum + Number(req?.paidAmount || req?.estimatedCost || 0);
    }, 0);

    return {
      contractor: c,
      jobsCompleted: completed.length,
      averageCompletionDays: completedWithDates
        ? Math.round((totalMs / completedWithDates / (1000 * 60 * 60 * 24)) * 10) / 10
        : 0,
      totalValueOfJobs: totalValue,
      openJobs: jobs.filter((j) => ['Assigned', 'In Progress'].includes(j.status)).length,
    };
  });
}

export async function syncPaymentFromRequest(paymentRequestId: string, paidAmount: number, reference?: string) {
  const pr = await PaymentRequest.findById(paymentRequestId);
  if (!pr || !(pr as any).maintenanceRequestId) return;

  const request = await MaintenanceRequest.findById((pr as any).maintenanceRequestId);
  if (!request) return;

  const requested = Number(request.requestedAmount || request.estimatedCost || pr.amount || 0);
  const paid = Number(paidAmount || 0);
  request.paidAmount = paid;
  request.paymentReference = reference;
  request.paymentDate = new Date();
  request.paymentRequestId = pr._id as any;

  if (paid <= 0) {
    request.paymentStatus = 'awaiting_payment';
  } else if (paid < requested) {
    request.paymentStatus = 'partially_paid';
    request.status = 'awaiting_payment';
  } else {
    request.paymentStatus = 'paid';
    request.status = 'funded';
  }

  await request.save();
  await logMaintenanceActivity({
    requestId: request._id,
    companyId: request.companyId,
    action: 'Payment Completed',
    description: `Payment of $${paid.toFixed(2)} recorded${reference ? ` (Ref: ${reference})` : ''}`,
  });
}

export async function getOwnerMaintenanceSummary(ownerPropertyIds: string[], companyId?: string) {
  const query: any = { propertyId: { $in: ownerPropertyIds } };
  if (companyId) query.companyId = companyId;

  const requests = await MaintenanceRequest.find(query)
    .populate('propertyId', 'name address')
    .populate('contractorId', 'companyName')
    .sort({ updatedAt: -1 })
    .lean();

  const workOrders = await MaintenanceWorkOrder.find({ propertyId: { $in: ownerPropertyIds } })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const openRequests = requests.filter((r) =>
    OPEN_STATUSES.includes(normalizeMaintenanceStatus(r.status)) &&
    !['closed', 'rejected', 'verified'].includes(normalizeMaintenanceStatus(r.status))
  );

  const approvedRequests = requests.filter((r) => isOwnerApproved(r.status));
  const maintenanceSpend = requests.reduce((s, r) => s + Number(r.paidAmount || r.estimatedCost || 0), 0);

  const requestIds = requests.map((r) => r._id);
  const photos = await MaintenanceAttachmentRecord.find({ requestId: { $in: requestIds } })
    .sort({ uploadedAt: -1 })
    .lean();

  const completedRepairs = requests.filter((r) =>
    ['completed', 'verified', 'closed'].includes(normalizeMaintenanceStatus(r.status))
  );

  return {
    openRequests,
    approvedRequests,
    maintenanceSpend,
    recentWorkOrders: workOrders,
    propertyMaintenanceHistory: requests.map((r) => ({
      _id: r._id,
      date: r.createdAt,
      issue: r.title,
      cost: Number(r.paidAmount || r.estimatedCost || 0),
      contractor: (r.contractorId as any)?.companyName || null,
      status: normalizeMaintenanceStatus(r.status),
      propertyName: (r.propertyId as any)?.name,
    })),
    photos,
    completedRepairs,
  };
}

export async function generateMaintenanceDocument(input: {
  type: 'maintenance-report' | 'work-order' | 'quotation-summary' | 'completion-certificate';
  requestId: string;
  companyId: string;
  companyName: string;
}) {
  const request = await MaintenanceRequest.findOne({ _id: input.requestId, companyId: input.companyId })
    .populate('propertyId', 'name address')
    .populate('contractorId', 'companyName contactPerson phone')
    .populate('requestedBy', 'firstName lastName')
    .lean();
  if (!request) throw new AppError('Maintenance request not found', 404);

  const [activities, quotes, workOrder, photos] = await Promise.all([
    MaintenanceActivity.find({ requestId: input.requestId }).sort({ createdAt: -1 }).lean(),
    MaintenanceQuote.find({ requestId: input.requestId }).lean(),
    MaintenanceWorkOrder.findOne({ maintenanceRequestId: input.requestId }).lean(),
    MaintenanceAttachmentRecord.find({ requestId: input.requestId }).lean(),
  ]);

  const propertyLabel = (request.propertyId as any)?.name || 'Property';
  const rows: Record<string, unknown>[] = [];

  if (input.type === 'work-order' && workOrder) {
    rows.push(
      { Field: 'Work Order', Value: workOrder.workOrderNumber },
      { Field: 'Status', Value: workOrder.status },
      { Field: 'Target Completion', Value: workOrder.targetCompletionDate ? new Date(workOrder.targetCompletionDate).toLocaleDateString() : 'N/A' },
      { Field: 'Contractor', Value: (request.contractorId as any)?.companyName || 'Unassigned' },
      { Field: 'Issue', Value: request.title },
      { Field: 'Description', Value: request.description },
    );
  } else if (input.type === 'quotation-summary') {
    for (const q of quotes) {
      rows.push({ Contractor: q.contractorId || 'N/A', Amount: q.amount, Description: q.description, Date: new Date(q.submittedDate).toLocaleDateString() });
    }
  } else if (input.type === 'completion-certificate') {
    rows.push(
      { Field: 'Issue', Value: request.title },
      { Field: 'Completed', Value: request.updatedAt ? new Date(request.updatedAt).toLocaleDateString() : 'N/A' },
      { Field: 'Contractor', Value: (request.contractorId as any)?.companyName || 'N/A' },
      { Field: 'Cost', Value: Number(request.paidAmount || request.estimatedCost || 0) },
      { Field: 'Completion Photos', Value: photos.filter((p) => p.type === 'AFTER').length },
    );
  } else {
    rows.push(
      { Field: 'Title', Value: request.title },
      { Field: 'Status', Value: request.status },
      { Field: 'Priority', Value: request.priority },
      { Field: 'Estimated Cost', Value: Number(request.estimatedCost || 0) },
      { Field: 'Paid', Value: Number(request.paidAmount || 0) },
    );
    for (const a of activities.slice(0, 20)) {
      rows.push({ Timeline: a.action, Detail: a.description, Date: new Date(a.createdAt).toLocaleString() });
    }
  }

  return generateTrustReportPdf({
    reportType: input.type as any,
    companyName: input.companyName,
    propertyLabel,
    auditReference: String(request._id),
    rows,
    totals: { estimatedCost: Number(request.estimatedCost || 0), paidAmount: Number(request.paidAmount || 0) },
  });
}

export function isValidMaintenanceStatus(status: string): boolean {
  return (MAINTENANCE_STATUSES as readonly string[]).includes(status);
}

export async function scheduleFollowUpInspection(input: {
  maintenanceRequestId: string;
  companyId: string;
  userId: string;
  scheduledDate?: string;
  scheduledTime?: string;
  notes?: string;
}) {
  const request = await MaintenanceRequest.findOne({
    _id: input.maintenanceRequestId,
    companyId: input.companyId,
  });
  if (!request) throw new AppError('Maintenance request not found', 404);

  const norm = normalizeMaintenanceStatus(request.status);
  if (!['completed', 'verified', 'closed'].includes(norm) && request.status !== 'completed') {
    throw new AppError('Follow-up inspection can only be scheduled after work is completed', 400);
  }

  if (request.followUpInspectionId) {
    throw new AppError('Follow-up inspection already scheduled for this request', 409);
  }

  const scheduledDate = input.scheduledDate
    ? new Date(input.scheduledDate)
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const property = await Property.findById(request.propertyId).select('name').lean();
  const propertyName = property?.name || 'Property';

  const followUp = await Inspection.create({
    propertyId: request.propertyId,
    companyId: input.companyId,
    ownerId: new mongoose.Types.ObjectId(input.userId),
    scheduledDate,
    originalScheduledDate: scheduledDate,
    scheduledTime: input.scheduledTime || '',
    frequency: 'ad_hoc',
    type: 'follow_up',
    status: resolveInspectionStatus(scheduledDate),
    generatedBy: 'follow_up',
    sourceMaintenanceRequestId: request._id,
    maintenanceRequestIds: [request._id],
    notes: input.notes || `Follow-up inspection for maintenance: ${request.title}`,
    reminders: buildInspectionReminders(scheduledDate, propertyName),
    checklist: defaultChecklistForInspection('follow_up'),
    template: { name: 'Maintenance Follow-Up' },
  });

  request.followUpInspectionId = followUp._id as any;
  await request.save();

  await logMaintenanceActivity({
    requestId: request._id,
    companyId: input.companyId,
    action: 'Follow-Up Inspection Scheduled',
    description: `Scheduled for ${scheduledDate.toLocaleDateString()}`,
    createdBy: input.userId,
  });

  await notifyInspectionEvent({
    companyId: input.companyId,
    userId: input.userId,
    title: 'Follow-up inspection scheduled',
    message: `Follow-up for "${request.title}" on ${scheduledDate.toLocaleDateString()}.`,
    inspectionId: followUp._id,
    eventType: 'follow_up_created',
  });

  return followUp;
}
