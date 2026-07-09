import { Request, Response } from 'express';
import chargeTypeService from '../services/chargeTypeService';
import { AppError } from '../middleware/errorHandler';

const getCompanyId = (req: Request): string | undefined => req.user?.companyId ? String(req.user.companyId) : undefined;
const getUserId = (req: Request): string | undefined => req.user?.userId ? String(req.user.userId) : undefined;

const handleError = (res: Response, error: any) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, message: error?.message || 'Charge type operation failed' });
};

export const listChargeTypes = async (req: Request, res: Response) => {
  try {
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
    const data = await chargeTypeService.listChargeTypes(getCompanyId(req), includeInactive);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const createChargeType = async (req: Request, res: Response) => {
  try {
    const data = await chargeTypeService.createChargeType(req.body, getCompanyId(req), getUserId(req));
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const updateChargeType = async (req: Request, res: Response) => {
  try {
    const data = await chargeTypeService.updateChargeType(req.params.id, req.body, getCompanyId(req), getUserId(req));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const deactivateChargeType = async (req: Request, res: Response) => {
  try {
    const data = await chargeTypeService.deactivateChargeType(req.params.id, getCompanyId(req), getUserId(req));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const deleteChargeType = async (req: Request, res: Response) => {
  try {
    await chargeTypeService.deleteChargeType(req.params.id, getCompanyId(req));
    return res.json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
};
