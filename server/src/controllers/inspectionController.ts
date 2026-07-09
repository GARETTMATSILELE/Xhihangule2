import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { Inspection } from '../models/Inspection';
import { Property } from '../models/Property';
import { Lease } from '../models/Lease';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { logMaintenanceActivity } from '../services/maintenanceManagementService';
import { MaintenanceAttachmentRecord } from '../models/MaintenanceAttachment';
import multer from 'multer';
import {
  addInspectionInterval,
  buildInspectionReminders,
  defaultChecklistForInspection,
  generateLeaseInspectionSchedule,
  resolveInspectionStatus
} from '../services/inspectionScheduleEngine';
import { dispatchDueInspectionReminders, notifyInspectionEvent } from '../services/inspectionNotificationService';

const ISSUE_STATUSES = ['attention_required', 'damaged', 'missing', 'not_working', 'fail'];

function calculateInspectionScore(checklist: any[] = []) {
  if (!checklist.length) {
    return { score: 100, rating: 'excellent' as const, followUpRequired: false, issueCount: 0 };
  }

  const penalties = checklist.reduce((sum, item) => {
    if (!ISSUE_STATUSES.includes(String(item.status))) return sum;
    const severity = String(item.severity || 'medium');
    if (severity === 'critical') return sum + 18;
    if (severity === 'high') return sum + 12;
    if (severity === 'medium') return sum + 8;
    return sum + 4;
  }, 0);
  const issueCount = checklist.filter((item) => ISSUE_STATUSES.includes(String(item.status))).length;
  const score = Math.max(0, Math.min(100, 100 - penalties));
  const rating = score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 50 ? 'needs_attention' : 'critical';
  return { score, rating, followUpRequired: issueCount > 0, issueCount };
}

function pushTimeline(update: any, event: string, message: string, userId?: string, payload?: any) {
  update.$push = update.$push || {};
  update.$push.executionTimeline = {
    event,
    message,
    timestamp: new Date(),
    userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
    payload
  };
}

function escapeHtml(value: any) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const listInspections = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Authentication with company required', 401);
    }
    const query: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (req.user?.role === 'agent' && req.user.userId) {
      query.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    }
    if (req.query.propertyId) {
      query.propertyId = new mongoose.Types.ObjectId(req.query.propertyId as string);
    }
    if (req.query.leaseId) {
      query.leaseId = new mongoose.Types.ObjectId(req.query.leaseId as string);
    }
    if (req.query.status) {
      query.status = req.query.status;
    }
    const inspections = await Inspection.find(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('leaseId', 'startDate endDate status')
      .sort({ scheduledDate: -1 });

    const today = new Date();
    const staleInspections = inspections.filter((inspection: any) => {
      const status = resolveInspectionStatus(inspection.scheduledDate, inspection.completedAt, inspection.status);
      return status !== inspection.status && inspection.status !== 'rescheduled';
    });
    if (staleInspections.length) {
      await Promise.all(staleInspections.map((inspection: any) => Inspection.updateOne(
        { _id: inspection._id },
        { $set: { status: resolveInspectionStatus(inspection.scheduledDate, inspection.completedAt, inspection.status) } }
      )));
    }

    res.json(inspections.map(i => ({
      ...i.toObject(),
      property: i.get('propertyId'),
      effectiveStatus: resolveInspectionStatus(i.scheduledDate, i.completedAt, i.status as any),
      isOverdue: i.scheduledDate < today && !i.completedAt
    })));
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error listing inspections:', error);
    throw new AppError('Error listing inspections', 500);
  }
};

export const createInspection = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) {
      throw new AppError('Authentication required', 401);
    }

    const { propertyId, tenantId, leaseId, scheduledDate, scheduledTime, notes, frequency, type, customIntervalDays, template, checklist } = req.body;
    if (!propertyId || !scheduledDate) {
      throw new AppError('propertyId and scheduledDate are required', 400);
    }

    const property = await Property.findOne({
      _id: new mongoose.Types.ObjectId(propertyId),
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    });
    if (!property) {
      throw new AppError('Property not found in your company', 404);
    }

    const scheduled = new Date(scheduledDate);
    const finalFrequency = frequency || 'quarterly';
    const inspectionType = type || 'routine';
    const next = finalFrequency === 'ad_hoc' ? undefined : addInspectionInterval(scheduled, finalFrequency, customIntervalDays);

    const inspection = new Inspection({
      propertyId: new mongoose.Types.ObjectId(propertyId),
      tenantId: tenantId ? new mongoose.Types.ObjectId(tenantId) : undefined,
      leaseId: leaseId ? new mongoose.Types.ObjectId(leaseId) : undefined,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ownerId: new mongoose.Types.ObjectId(req.user.userId),
      scheduledDate: scheduled,
      originalScheduledDate: scheduled,
      scheduledTime: scheduledTime || '',
      nextInspectionDate: next,
      notes: notes || '',
      frequency: finalFrequency,
      customIntervalDays,
      type: inspectionType,
      status: resolveInspectionStatus(scheduled),
      generatedBy: 'manual',
      reminders: buildInspectionReminders(scheduled, property.name || property.address || 'Property'),
      template: template || { name: inspectionType === 'move_out' ? 'Move-Out inspection' : 'Routine inspection' },
      checklist: Array.isArray(checklist) && checklist.length ? checklist : defaultChecklistForInspection(inspectionType)
    });
    await inspection.save();
    await notifyInspectionEvent({
      companyId: req.user.companyId,
      userId: req.user.userId,
      title: 'Inspection scheduled',
      message: `${property.name || property.address || 'Property'} inspection scheduled for ${scheduled.toLocaleDateString()}`,
      inspectionId: inspection._id,
      eventType: 'scheduled',
    });
    const populated = await Inspection.findById(inspection._id)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('leaseId', 'startDate endDate status');
    res.status(201).json(populated);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error creating inspection:', error);
    throw new AppError('Error creating inspection', 500);
  }
};

export const updateInspection = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) {
      throw new AppError('Authentication required', 401);
    }
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError('Invalid inspection ID', 400);
    }
    const { scheduledDate, scheduledTime, nextInspectionDate, notes, tenantId, leaseId, frequency, status, type, customIntervalDays, checklist, conditionScore, conditionRating, followUpRequired } = req.body;
    const update: any = {};
    if (scheduledDate) update.scheduledDate = new Date(scheduledDate);
    if (scheduledTime !== undefined) update.scheduledTime = scheduledTime;
    if (nextInspectionDate) update.nextInspectionDate = new Date(nextInspectionDate);
    if (notes !== undefined) update.notes = notes;
    if (tenantId !== undefined) update.tenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : undefined;
    if (leaseId !== undefined) update.leaseId = leaseId ? new mongoose.Types.ObjectId(leaseId) : undefined;
    if (frequency) update.frequency = frequency;
    if (status) update.status = status;
    if (type) update.type = type;
    if (customIntervalDays !== undefined) update.customIntervalDays = customIntervalDays;
    if (checklist !== undefined) update.checklist = checklist;
    if (conditionScore !== undefined) update.conditionScore = Number(conditionScore);
    if (conditionRating !== undefined) update.conditionRating = conditionRating;
    if (followUpRequired !== undefined) update.followUpRequired = Boolean(followUpRequired);
    if (update.scheduledDate && !status) update.status = resolveInspectionStatus(update.scheduledDate);

    const updated = await Inspection.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), companyId: new mongoose.Types.ObjectId(req.user.companyId) },
      update,
      { new: true }
    ).populate('propertyId', 'name address').populate('tenantId', 'firstName lastName email').populate('leaseId', 'startDate endDate status');
    if (!updated) {
      throw new AppError('Inspection not found', 404);
    }
    res.json(updated);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error updating inspection:', error);
    throw new AppError('Error updating inspection', 500);
  }
};

export const startInspectionExecution = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) throw new AppError('Authentication required', 401);
    const inspection = await Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!inspection) throw new AppError('Inspection not found', 404);

    inspection.checklist = Array.isArray(inspection.checklist) && inspection.checklist.length
      ? inspection.checklist
      : defaultChecklistForInspection((inspection.type || 'routine') as any) as any;
    inspection.status = 'in_progress';
    inspection.startedAt = inspection.startedAt || new Date();
    inspection.executionTimeline = [
      ...((inspection as any).executionTimeline || []),
      { event: 'started', message: 'Inspection execution started', timestamp: new Date(), userId: new mongoose.Types.ObjectId(req.user.userId) }
    ] as any;
    await inspection.save();

    const updated = await Inspection.findById(inspection._id)
      .populate('propertyId', 'name address images')
      .populate('tenantId', 'firstName lastName email phone')
      .populate('leaseId', 'startDate endDate status');
    res.json(updated);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error starting inspection execution:', error);
    throw new AppError('Error starting inspection execution', 500);
  }
};

export const autosaveInspectionExecution = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) throw new AppError('Authentication required', 401);
    const { checklist, notes, report, quickDraft = true } = req.body;
    const score = calculateInspectionScore(Array.isArray(checklist) ? checklist : []);
    const update: any = {
      ...(Array.isArray(checklist) ? { checklist } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(report !== undefined ? { report } : {}),
      status: quickDraft ? 'draft' : 'in_progress',
      startedAt: req.body.startedAt ? new Date(req.body.startedAt) : new Date(),
      conditionScore: score.score,
      conditionRating: score.rating,
      followUpRequired: score.followUpRequired,
    };
    pushTimeline(update, 'autosaved', 'Inspection progress autosaved', req.user.userId, { issueCount: score.issueCount });

    const updated = await Inspection.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.companyId },
      update,
      { new: true }
    ).populate('propertyId', 'name address images').populate('tenantId', 'firstName lastName email phone').populate('leaseId', 'startDate endDate status');
    if (!updated) throw new AppError('Inspection not found', 404);
    res.json(updated);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error autosaving inspection execution:', error);
    throw new AppError('Error autosaving inspection execution', 500);
  }
};

export const completeInspectionExecution = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) throw new AppError('Authentication required', 401);
    const inspection = await Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!inspection) throw new AppError('Inspection not found', 404);

    if (Array.isArray(req.body.checklist)) inspection.checklist = req.body.checklist as any;
    if (req.body.notes !== undefined) inspection.notes = req.body.notes;
    if (req.body.report) inspection.report = { ...(inspection.report || {}), ...req.body.report } as any;

    const score = calculateInspectionScore((inspection as any).checklist || []);
    inspection.conditionScore = score.score;
    inspection.conditionRating = score.rating as any;
    inspection.followUpRequired = score.followUpRequired;
    inspection.status = score.followUpRequired ? 'follow_up_required' : 'completed';
    inspection.completedAt = new Date();
    inspection.completedBy = new mongoose.Types.ObjectId(req.user.userId);
    inspection.executionTimeline = [
      ...((inspection as any).executionTimeline || []),
      { event: 'completed', message: 'Inspection completed', timestamp: new Date(), userId: new mongoose.Types.ObjectId(req.user.userId), payload: score }
    ] as any;
    inspection.report = {
      ...(inspection.report || {}),
      inspectedAt: inspection.completedAt,
      inspectorName: req.body.report?.inspectorName || inspection.report?.inspectorName || '',
      conditionSummary: req.body.report?.conditionSummary || inspection.report?.conditionSummary || `${score.score}% ${String(score.rating).replace('_', ' ')} condition`,
      issuesFound: req.body.report?.issuesFound || inspection.report?.issuesFound || `${score.issueCount} issue${score.issueCount === 1 ? '' : 's'} flagged`,
      actionsRequired: req.body.report?.actionsRequired || inspection.report?.actionsRequired || (score.followUpRequired ? 'Review flagged issues and create maintenance requests where required.' : 'No immediate action required.'),
    } as any;
    await inspection.save();

    await notifyInspectionEvent({
      companyId: req.user.companyId,
      userId: req.user.userId,
      title: 'Inspection completed',
      message: `Inspection completed with a ${score.score}% condition score.`,
      inspectionId: inspection._id,
      eventType: 'completed',
    });

    const updated = await Inspection.findById(inspection._id)
      .populate('propertyId', 'name address images')
      .populate('tenantId', 'firstName lastName email phone')
      .populate('leaseId', 'startDate endDate status');
    res.json(updated);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error completing inspection execution:', error);
    throw new AppError('Error completing inspection execution', 500);
  }
};

export const deleteInspection = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) {
      throw new AppError('Authentication required', 401);
    }
    const { id } = req.params;
    await Inspection.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      companyId: new mongoose.Types.ObjectId(req.user.companyId)
    });
    res.json({ message: 'Inspection deleted' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error deleting inspection:', error);
    throw new AppError('Error deleting inspection', 500);
  }
};

export const updateInspectionReport = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) {
      throw new AppError('Authentication required', 401);
    }
    const { id } = req.params;
    const { conditionSummary, issuesFound, actionsRequired, inspectorName, inspectedAt, tenantSignature, agentSignature, conditionScore, conditionRating, followUpRequired, checklist } = req.body;
    const update: any = {
      report: {
        ...(conditionSummary !== undefined ? { conditionSummary } : {}),
        ...(issuesFound !== undefined ? { issuesFound } : {}),
        ...(actionsRequired !== undefined ? { actionsRequired } : {}),
        ...(inspectorName !== undefined ? { inspectorName } : {}),
        ...(inspectedAt ? { inspectedAt: new Date(inspectedAt) } : {}),
        ...(tenantSignature !== undefined ? { tenantSignature } : {}),
        ...(agentSignature !== undefined ? { agentSignature } : {}),
      }
    };
    if (conditionScore !== undefined) update.conditionScore = Number(conditionScore);
    if (conditionRating !== undefined) update.conditionRating = conditionRating;
    if (followUpRequired !== undefined) update.followUpRequired = Boolean(followUpRequired);
    if (checklist !== undefined) update.checklist = checklist;
    if (inspectedAt) {
      update.completedAt = new Date(inspectedAt);
      update.status = 'completed';
    }
    const updated = await Inspection.findOneAndUpdate(
      { _id: id, companyId: req.user.companyId },
      update,
      { new: true }
    );
    if (!updated) throw new AppError('Inspection not found', 404);
    res.json(updated);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error updating inspection report:', error);
    throw new AppError('Error updating inspection report', 500);
  }
};

export const generateLeaseInspections = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) {
      throw new AppError('Authentication required', 401);
    }

    const { leaseId, frequency, customIntervalDays, includeMoveIn = true, includeMoveOut = true } = req.body;
    const leaseQuery: any = {
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      status: { $in: ['active', 'expiring_soon', 'pending_approval'] }
    };
    if (req.user.role === 'agent') {
      leaseQuery.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    }
    if (leaseId) {
      leaseQuery._id = new mongoose.Types.ObjectId(leaseId);
    }

    const leases = await Lease.find(leaseQuery).populate('propertyId', 'name address');
    const created: any[] = [];

    for (const lease of leases as any[]) {
      const propertyLabel = lease.propertyId?.name || lease.propertyId?.address || 'Property';
      const schedules = generateLeaseInspectionSchedule(lease, {
        frequency: frequency || lease.inspectionFrequency || 'quarterly',
        customIntervalDays,
        propertyLabel,
        includeMoveIn,
        includeMoveOut,
      });

      for (const schedule of schedules) {
        const exists = await Inspection.exists({
          companyId: schedule.companyId,
          leaseId: schedule.leaseId,
          type: schedule.type,
          scheduledDate: schedule.scheduledDate
        });
        if (exists) continue;

        const inspection = await Inspection.create({
          ...schedule,
          originalScheduledDate: schedule.scheduledDate,
          checklist: defaultChecklistForInspection(schedule.type),
          template: {
            name: schedule.type === 'move_in'
              ? 'Move-In inspection'
              : schedule.type === 'move_out'
                ? 'Move-Out inspection'
                : 'Routine inspection'
          }
        });
        created.push(inspection);
      }
    }

    if (created.length) {
      await notifyInspectionEvent({
        companyId: req.user.companyId,
        userId: req.user.userId,
        title: 'Lease inspection schedules generated',
        message: `${created.length} lease-driven inspection${created.length === 1 ? '' : 's'} created from active occupancy records.`,
        eventType: 'generated_from_leases',
      });
    }

    res.status(201).json({ createdCount: created.length, inspections: created });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error generating lease inspections:', error);
    throw new AppError('Error generating lease inspections', 500);
  }
};

export const rescheduleInspection = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) {
      throw new AppError('Authentication required', 401);
    }
    const { id } = req.params;
    const { scheduledDate, scheduledTime, reason, tenantConfirmationNotes } = req.body;
    if (!scheduledDate || !reason) {
      throw new AppError('scheduledDate and reason are required', 400);
    }

    const inspection = await Inspection.findOne({ _id: id, companyId: req.user.companyId });
    if (!inspection) throw new AppError('Inspection not found', 404);

    const newDate = new Date(scheduledDate);
    const history = {
      originalDate: inspection.scheduledDate,
      newDate,
      newTime: scheduledTime || '',
      reason,
      tenantConfirmationNotes: tenantConfirmationNotes || '',
      rescheduledBy: new mongoose.Types.ObjectId(req.user.userId),
      rescheduledAt: new Date()
    };

    inspection.originalScheduledDate = inspection.originalScheduledDate || inspection.scheduledDate;
    inspection.scheduledDate = newDate;
    inspection.scheduledTime = scheduledTime || inspection.scheduledTime || '';
    inspection.status = 'rescheduled';
    inspection.rescheduleHistory = [...((inspection as any).rescheduleHistory || []), history] as any;
    inspection.reminders = buildInspectionReminders(newDate, 'Property') as any;
    await inspection.save();
    await notifyInspectionEvent({
      companyId: req.user.companyId,
      userId: req.user.userId,
      title: 'Inspection rescheduled',
      message: `Inspection moved to ${newDate.toLocaleDateString()}${scheduledTime ? ` at ${scheduledTime}` : ''}. Reason: ${reason}`,
      inspectionId: inspection._id,
      eventType: 'rescheduled',
    });

    const updated = await Inspection.findById(inspection._id)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('leaseId', 'startDate endDate status');

    res.json(updated);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error rescheduling inspection:', error);
    throw new AppError('Error rescheduling inspection', 500);
  }
};

export const createFollowUpInspection = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) {
      throw new AppError('Authentication required', 401);
    }
    const source = await Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!source) throw new AppError('Inspection not found', 404);

    const scheduledDate = req.body.scheduledDate ? new Date(req.body.scheduledDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const followUp = await Inspection.create({
      propertyId: source.propertyId,
      tenantId: source.tenantId,
      leaseId: source.leaseId,
      companyId: source.companyId,
      ownerId: source.ownerId,
      scheduledDate,
      originalScheduledDate: scheduledDate,
      scheduledTime: req.body.scheduledTime || '',
      frequency: 'ad_hoc',
      type: 'follow_up',
      status: resolveInspectionStatus(scheduledDate),
      generatedBy: 'follow_up',
      notes: req.body.notes || `Follow-up for inspection ${source._id}`,
      reminders: buildInspectionReminders(scheduledDate, 'Property'),
      checklist: defaultChecklistForInspection('follow_up'),
      template: { name: 'Follow-Up inspection' }
    });

    source.followUpRequired = true;
    source.followUpInspectionId = followUp._id as mongoose.Types.ObjectId;
    await source.save();
    await notifyInspectionEvent({
      companyId: req.user.companyId,
      userId: req.user.userId,
      title: 'Follow-up inspection created',
      message: `Follow-up inspection scheduled for ${scheduledDate.toLocaleDateString()}.`,
      inspectionId: followUp._id,
      eventType: 'follow_up_created',
    });

    res.status(201).json(followUp);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error creating follow-up inspection:', error);
    throw new AppError('Error creating follow-up inspection', 500);
  }
};

export const escalateInspectionToMaintenance = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) {
      throw new AppError('Authentication required', 401);
    }
    const inspection = await Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!inspection) throw new AppError('Inspection not found', 404);

    const property = await Property.findOne({ _id: inspection.propertyId, companyId: req.user.companyId });
    if (!property) throw new AppError('Property not found', 404);
    if (!property.ownerId) throw new AppError('Property owner not found', 404);

    const failedItems = ((inspection as any).checklist || []).filter((item: any) => item.status === 'fail');
    const category = req.body.category || (failedItems[0]?.category?.toUpperCase?.() || 'GENERAL');
    const inspectionPhotos = ((inspection as any).checklist || [])
      .flatMap((item: any) => (item.photos || []).map((p: any) => p.url || p))
      .filter(Boolean);

    const maintenance = await MaintenanceRequest.create({
      propertyId: inspection.propertyId,
      requestedBy: new mongoose.Types.ObjectId(req.user.userId),
      ownerId: property.ownerId,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      title: req.body.title || `Inspection issue: ${inspection.type || 'routine'} inspection`,
      description: req.body.description || [
        inspection.report?.issuesFound,
        `Inspection reference: ${inspection._id}`,
        failedItems.map((item: any) => `${item.category}: ${item.item} (${item.severity}) ${item.notes || ''}`).join('\n')
      ].filter(Boolean).join('\n\n') || 'Maintenance issue detected during inspection.',
      priority: req.body.priority || (failedItems.some((item: any) => item.severity === 'critical' || item.severity === 'high') ? 'high' : 'medium'),
      category,
      inspectionId: inspection._id,
      estimatedCost: Number(req.body.estimatedCost || 0),
      requestedAmount: Number(req.body.estimatedCost || 0),
      attachments: [],
      status: 'draft',
      lastActivityAt: new Date(),
    });

    for (const url of inspectionPhotos.slice(0, 10)) {
      await MaintenanceAttachmentRecord.create({
        requestId: maintenance._id,
        companyId: req.user.companyId,
        type: 'BEFORE',
        fileUrl: typeof url === 'string' ? url : url.url,
        uploadedBy: req.user.userId,
        uploadedAt: new Date(),
      });
    }

    await logMaintenanceActivity({
      requestId: maintenance._id,
      companyId: req.user.companyId,
      action: 'Request Created',
      description: `Created from inspection ${inspection._id}`,
      createdBy: req.user.userId,
    });

    inspection.maintenanceRequestIds = [...((inspection as any).maintenanceRequestIds || []), maintenance._id] as any;
    await inspection.save();
    await notifyInspectionEvent({
      companyId: req.user.companyId,
      userId: req.user.userId,
      title: 'Maintenance request created from inspection',
      message: maintenance.title || 'Inspection finding escalated to maintenance.',
      inspectionId: inspection._id,
      eventType: 'maintenance_escalated',
    });

    res.status(201).json({ inspection, maintenanceRequest: maintenance });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error escalating inspection to maintenance:', error);
    throw new AppError('Error creating maintenance request from inspection', 500);
  }
};

export const dispatchInspectionReminders = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Authentication with company required', 401);
    }
    const sentCount = await dispatchDueInspectionReminders(req.user.companyId, req.user.role === 'agent' ? req.user.userId : undefined);
    res.json({ sentCount });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error dispatching inspection reminders:', error);
    throw new AppError('Error dispatching inspection reminders', 500);
  }
};

export const getInspectionOperations = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Authentication with company required', 401);
    }
    const query: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (req.user.role === 'agent' && req.user.userId) query.ownerId = new mongoose.Types.ObjectId(req.user.userId);

    const inspections = await Inspection.find(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .populate('leaseId', 'startDate endDate status')
      .sort({ scheduledDate: 1 });

    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const enriched = inspections.map((inspection: any) => ({
      ...inspection.toObject(),
      property: inspection.get('propertyId'),
      effectiveStatus: resolveInspectionStatus(inspection.scheduledDate, inspection.completedAt, inspection.status),
    }));

    res.json({
      dueThisWeek: enriched.filter((i: any) => new Date(i.scheduledDate) >= now && new Date(i.scheduledDate) <= weekEnd && i.effectiveStatus !== 'completed'),
      overdue: enriched.filter((i: any) => i.effectiveStatus === 'overdue'),
      rescheduled: enriched.filter((i: any) => i.status === 'rescheduled'),
      awaitingFollowUp: enriched.filter((i: any) => i.followUpRequired && !i.followUpInspectionId),
      pendingMoveOut: enriched.filter((i: any) => i.type === 'move_out' && i.effectiveStatus !== 'completed'),
      recentlyCompleted: enriched.filter((i: any) => i.effectiveStatus === 'completed').slice(0, 10),
      all: enriched,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error fetching inspection operations:', error);
    throw new AppError('Error fetching inspection operations', 500);
  }
};

export const getInspectionComplianceMetrics = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Authentication with company required', 401);
    }
    const query: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (req.user.role === 'agent' && req.user.userId) query.ownerId = new mongoose.Types.ObjectId(req.user.userId);

    const inspections = await Inspection.find(query).select('scheduledDate completedAt status type conditionScore conditionRating followUpRequired');
    const enriched = inspections.map((inspection: any) => ({
      ...inspection.toObject(),
      effectiveStatus: resolveInspectionStatus(inspection.scheduledDate, inspection.completedAt, inspection.status)
    }));
    const total = enriched.length;
    const completed = enriched.filter((inspection: any) => inspection.effectiveStatus === 'completed').length;
    const overdue = enriched.filter((inspection: any) => inspection.effectiveStatus === 'overdue').length;
    const upcoming = enriched.filter((inspection: any) => ['scheduled', 'upcoming', 'due_today'].includes(inspection.effectiveStatus)).length;
    const followUpRequired = enriched.filter((inspection: any) => inspection.followUpRequired).length;
    const moveOutPending = enriched.filter((inspection: any) => inspection.type === 'move_out' && inspection.effectiveStatus !== 'completed').length;

    res.json({
      total,
      completed,
      overdue,
      upcoming,
      followUpRequired,
      moveOutPending,
      compliancePercent: total ? Math.round((completed / total) * 100) : 100,
      overduePercent: total ? Math.round((overdue / total) * 100) : 0,
      upcomingPercent: total ? Math.round((upcoming / total) * 100) : 0,
      conditionAverage: enriched.length
        ? Math.round(enriched.reduce((sum: number, inspection: any) => sum + Number(inspection.conditionScore || 0), 0) / enriched.length)
        : null
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error fetching inspection compliance metrics:', error);
    throw new AppError('Error fetching inspection compliance metrics', 500);
  }
};

export const getInspectionCalendarEvents = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Authentication with company required', 401);
    }
    const query: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (req.user.role === 'agent' && req.user.userId) query.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    if (req.query.start || req.query.end) {
      query.scheduledDate = {};
      if (req.query.start) query.scheduledDate.$gte = new Date(String(req.query.start));
      if (req.query.end) query.scheduledDate.$lte = new Date(String(req.query.end));
    }

    const inspections = await Inspection.find(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email phone')
      .populate('leaseId', 'startDate endDate status')
      .sort({ scheduledDate: 1 });

    res.json(inspections.map((inspection: any) => {
      const status = resolveInspectionStatus(inspection.scheduledDate, inspection.completedAt, inspection.status);
      return {
        id: String(inspection._id),
        title: `${inspection.propertyId?.name || inspection.propertyId?.address || 'Property'} - ${String(inspection.type || 'routine').replace('_', ' ')}`,
        start: inspection.scheduledDate,
        end: inspection.scheduledDate,
        status,
        type: inspection.type || 'routine',
        property: inspection.propertyId,
        tenant: inspection.tenantId,
        lease: inspection.leaseId,
        inspection
      };
    }));
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error fetching inspection calendar events:', error);
    throw new AppError('Error fetching inspection calendar events', 500);
  }
};

export const getInspectionTemplates = async (_req: Request, res: Response) => {
  res.json([
    { name: 'Apartment inspection', propertyType: 'residential', checklist: defaultChecklistForInspection('routine') },
    { name: 'Commercial inspection', propertyType: 'commercial', checklist: defaultChecklistForInspection('routine') },
    { name: 'Move-In inspection', propertyType: 'residential', checklist: defaultChecklistForInspection('move_in') },
    { name: 'Move-Out inspection', propertyType: 'residential', checklist: defaultChecklistForInspection('move_out') },
  ]);
};

export const uploadInspectionItemPhoto = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) throw new AppError('Authentication required', 401);
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw new AppError('No file uploaded', 400);

    const inspection = await Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId });
    if (!inspection) throw new AppError('Inspection not found', 404);

    const itemId = req.params.itemId;
    const item = ((inspection as any).checklist || []).find((entry: any, index: number) => String(entry._id) === itemId || String(index) === itemId);
    if (!item) throw new AppError('Inspection item not found', 404);

    item.photos = item.photos || [];
    item.photos.push({
      fileName: file.originalname,
      fileType: file.mimetype,
      fileUrl: file.buffer.toString('base64'),
      caption: req.body?.caption || '',
      category: item.category || item.room || '',
      uploadedAt: new Date(),
      uploadedBy: new mongoose.Types.ObjectId(req.user.userId),
    });
    inspection.executionTimeline = [
      ...((inspection as any).executionTimeline || []),
      { event: 'photo_uploaded', message: `Photo uploaded for ${item.room || item.category}: ${item.item}`, timestamp: new Date(), userId: new mongoose.Types.ObjectId(req.user.userId) }
    ] as any;
    await inspection.save();

    res.status(201).json(inspection);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error uploading inspection item photo:', error);
    throw new AppError('Error uploading inspection item photo', 500);
  }
};

export const getInspectionReportHtml = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
    const inspection = await Inspection.findOne({ _id: req.params.id, companyId: req.user.companyId })
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email phone')
      .populate('leaseId', 'startDate endDate status');
    if (!inspection) throw new AppError('Inspection not found', 404);

    const grouped = ((inspection as any).checklist || []).reduce((acc: Record<string, any[]>, item: any) => {
      const room = item.room || item.category || 'Inspection';
      acc[room] = acc[room] || [];
      acc[room].push(item);
      return acc;
    }, {});
    const property: any = inspection.propertyId;
    const tenant: any = inspection.tenantId;
    const lease: any = inspection.leaseId;

    const html = `
      <html>
        <head>
          <title>Inspection Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
            .brand { font-size: 24px; font-weight: 800; color: #2563eb; }
            .muted { color: #64748b; font-size: 12px; }
            .card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f8fafc; color: #475569; }
            .score { font-size: 34px; font-weight: 900; color: #2563eb; }
            .status { font-weight: 700; text-transform: capitalize; }
            @media print { body { margin: 18px; } .no-print { display: none; } }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">Print / Save PDF</button>
          <div class="header">
            <div>
              <div class="brand">Mantis Property Management</div>
              <div class="muted">Inspection Report</div>
            </div>
            <div>
              <div class="score">${inspection.conditionScore ?? 100}%</div>
              <div class="muted">${escapeHtml(String(inspection.conditionRating || 'good').replace('_', ' '))}</div>
            </div>
          </div>
          <div class="card">
            <h2>${escapeHtml(property?.name || property?.address || 'Property')}</h2>
            <p>${escapeHtml(property?.address || '')}</p>
            <p><strong>Tenant:</strong> ${escapeHtml(`${tenant?.firstName || ''} ${tenant?.lastName || ''}`.trim() || 'N/A')} ${tenant?.phone ? `(${escapeHtml(tenant.phone)})` : ''}</p>
            <p><strong>Lease:</strong> ${lease?.startDate ? `${new Date(lease.startDate).toLocaleDateString()} - ${new Date(lease.endDate).toLocaleDateString()}` : 'Legacy / no lease'}</p>
            <p><strong>Inspection date:</strong> ${inspection.completedAt ? inspection.completedAt.toLocaleDateString() : inspection.scheduledDate.toLocaleDateString()}</p>
          </div>
          ${Object.entries(grouped).map(([room, items]) => `
            <div class="card">
              <h3>${escapeHtml(room)}</h3>
              <table>
                <thead><tr><th>Item</th><th>Status</th><th>Severity</th><th>Notes</th></tr></thead>
                <tbody>${(items as any[]).map((item) => `<tr><td>${escapeHtml(item.item)}</td><td class="status">${escapeHtml(String(item.status).replace('_', ' '))}</td><td>${escapeHtml(item.severity || '')}</td><td>${escapeHtml(item.notes || '')}</td></tr>`).join('')}</tbody>
              </table>
            </div>
          `).join('')}
          <div class="card">
            <h3>Summary</h3>
            <p>${escapeHtml(inspection.report?.conditionSummary || '')}</p>
            <h3>Issues</h3>
            <p>${escapeHtml(inspection.report?.issuesFound || '')}</p>
            <h3>Recommendations</h3>
            <p>${escapeHtml(inspection.report?.actionsRequired || '')}</p>
          </div>
        </body>
      </html>
    `;
    inspection.executionTimeline = [
      ...((inspection as any).executionTimeline || []),
      { event: 'pdf_generated', message: 'Printable report generated', timestamp: new Date(), userId: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined }
    ] as any;
    await inspection.save();
    res.type('html').send(html);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error generating inspection report:', error);
    throw new AppError('Error generating inspection report', 500);
  }
};

export const uploadInspectionAttachment = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId || !req.user?.companyId) {
      throw new AppError('Authentication required', 401);
    }
    const { id } = req.params;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw new AppError('No file uploaded', 400);
    const fileDoc = {
      fileName: file.originalname,
      fileType: file.mimetype,
      fileUrl: file.buffer.toString('base64'),
      uploadedAt: new Date(),
      uploadedBy: req.user.userId,
    } as any;
    const updated = await Inspection.findOneAndUpdate(
      { _id: id, companyId: req.user.companyId },
      { $push: { attachments: fileDoc } },
      { new: true }
    );
    if (!updated) throw new AppError('Inspection not found', 404);
    res.status(201).json(updated);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error uploading inspection attachment:', error);
    throw new AppError('Error uploading inspection attachment', 500);
  }
};


