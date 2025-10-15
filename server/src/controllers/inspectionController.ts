import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler';
import { Inspection } from '../models/Inspection';
import { Property } from '../models/Property';
import multer from 'multer';

const addQuarter = (date: Date) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 3);
  return d;
};

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
    const inspections = await Inspection.find(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email')
      .sort({ scheduledDate: -1 });
    res.json(inspections.map(i => ({
      ...i.toObject(),
      property: i.get('propertyId')
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

    const { propertyId, tenantId, scheduledDate, notes, frequency } = req.body;
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
    const next = (frequency || 'quarterly') === 'quarterly' ? addQuarter(scheduled) : undefined;

    const inspection = new Inspection({
      propertyId: new mongoose.Types.ObjectId(propertyId),
      tenantId: tenantId ? new mongoose.Types.ObjectId(tenantId) : undefined,
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      ownerId: new mongoose.Types.ObjectId(req.user.userId),
      scheduledDate: scheduled,
      nextInspectionDate: next,
      notes: notes || '',
      frequency: frequency || 'quarterly'
    });
    await inspection.save();
    const populated = await Inspection.findById(inspection._id)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName email');
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
    const { scheduledDate, nextInspectionDate, notes, tenantId, frequency } = req.body;
    const update: any = {};
    if (scheduledDate) update.scheduledDate = new Date(scheduledDate);
    if (nextInspectionDate) update.nextInspectionDate = new Date(nextInspectionDate);
    if (notes !== undefined) update.notes = notes;
    if (tenantId !== undefined) update.tenantId = tenantId ? new mongoose.Types.ObjectId(tenantId) : undefined;
    if (frequency) update.frequency = frequency;

    const updated = await Inspection.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), companyId: new mongoose.Types.ObjectId(req.user.companyId) },
      update,
      { new: true }
    ).populate('propertyId', 'name address').populate('tenantId', 'firstName lastName email');
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
    const { conditionSummary, issuesFound, actionsRequired, inspectorName, inspectedAt } = req.body;
    const update: any = {
      report: {
        ...(conditionSummary !== undefined ? { conditionSummary } : {}),
        ...(issuesFound !== undefined ? { issuesFound } : {}),
        ...(actionsRequired !== undefined ? { actionsRequired } : {}),
        ...(inspectorName !== undefined ? { inspectorName } : {}),
        ...(inspectedAt ? { inspectedAt: new Date(inspectedAt) } : {}),
      }
    };
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


