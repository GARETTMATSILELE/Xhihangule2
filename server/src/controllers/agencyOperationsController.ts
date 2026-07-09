import { Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler';
import agencyOperationsService from '../services/agencyOperationsService';
import dutyRosterService from '../services/dutyRosterService';
import { MunicipalPayment } from '../models/MunicipalPayment';
import { Property } from '../models/Property';
import mongoose from 'mongoose';

const canAccessAgencyOperations = (req: Request): boolean => {
  const roles = ((req.user as any)?.roles as string[] | undefined) || [req.user?.role].filter(Boolean);
  return roles.some((r) => ['admin', 'principal', 'prea', 'agent', 'accountant'].includes(String(r)));
};

export const getExecutiveDashboard = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  if (!canAccessAgencyOperations(req)) throw new AppError('Access denied', 403);

  const { dateFrom, dateTo } = req.query;
  const data = await agencyOperationsService.getExecutiveDashboard(
    req.user.companyId,
    dateFrom as string | undefined,
    dateTo as string | undefined
  );
  res.json({ success: true, data });
};

export const listMunicipalBillsOverview = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  if (!canAccessAgencyOperations(req)) throw new AppError('Access denied', 403);

  const companyId = new mongoose.Types.ObjectId(req.user.companyId);
  const [properties, payments] = await Promise.all([
    Property.find({ companyId, levyOrMunicipalType: 'municipal' })
      .select('name address levyOrMunicipalAmount status')
      .lean(),
    MunicipalPayment.find({ companyId }).sort({ paymentDate: -1 }).lean(),
  ]);

  const paidByProperty = new Map<string, { amount: number; lastPayment?: Date }>();
  for (const p of payments as any[]) {
    const pid = String(p.propertyId);
    const entry = paidByProperty.get(pid) || { amount: 0 };
    if (String(p.status).toLowerCase() === 'completed') {
      entry.amount += Number(p.amount || 0);
      const pd = new Date(p.paymentDate);
      if (!entry.lastPayment || pd > entry.lastPayment) entry.lastPayment = pd;
    }
    paidByProperty.set(pid, entry);
  }

  const now = new Date();
  const propertyRows = (properties as any[]).map((prop) => {
    const pid = String(prop._id);
    const monthly = Number(prop.levyOrMunicipalAmount || 0);
    const paid = paidByProperty.get(pid);
    const paidAmount = paid?.amount || 0;
    const outstanding = Math.max(0, monthly - paidAmount);
    const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      propertyId: pid,
      propertyName: prop.name,
      address: prop.address,
      currentBalance: monthly,
      outstandingBalance: outstanding,
      dueDate: dueDate.toISOString(),
      lastPayment: paid?.lastPayment?.toISOString(),
      status: outstanding > 0 ? (dueDate < now ? 'overdue' : 'due') : 'current',
    };
  });

  const totalOutstanding = propertyRows.reduce((s, r) => s + r.outstandingBalance, 0);
  const inArrears = propertyRows.filter((r) => r.status === 'overdue').length;
  const dueThisMonth = propertyRows.filter((r) => r.status === 'due').length;

  res.json({
    success: true,
    data: {
      summary: { totalOutstanding, propertiesInArrears: inArrears, billsDueThisMonth: dueThisMonth, overdueAccounts: inArrears },
      properties: propertyRows,
      recentPayments: payments.slice(0, 50),
    },
  });
};

export const listDutyShifts = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  if (!canAccessAgencyOperations(req)) throw new AppError('Access denied', 403);
  const data = await dutyRosterService.listShifts(req.user.companyId, {
    from: req.query.from as string,
    to: req.query.to as string,
    agentId: req.query.agentId as string,
  });
  res.json({ success: true, data });
};

export const createDutyShift = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  if (!canAccessAgencyOperations(req)) throw new AppError('Access denied', 403);
  const data = await dutyRosterService.createShift(req.user.companyId, {
    ...req.body,
    createdBy: req.user.userId,
  });
  res.status(201).json({ success: true, data });
};

export const updateDutyShift = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  if (!canAccessAgencyOperations(req)) throw new AppError('Access denied', 403);
  const data = await dutyRosterService.updateShift(req.user.companyId, req.params.id, req.body);
  res.json({ success: true, data });
};

export const deleteDutyShift = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  if (!canAccessAgencyOperations(req)) throw new AppError('Access denied', 403);
  const data = await dutyRosterService.deleteShift(req.user.companyId, req.params.id);
  res.json({ success: true, data });
};

export const generateDutyRoster = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  if (!canAccessAgencyOperations(req)) throw new AppError('Access denied', 403);
  const data = await dutyRosterService.generateRoster(req.user.companyId, {
    ...req.body,
    createdBy: req.user.userId,
  });
  res.json({ success: true, data });
};

export const listAgentAvailability = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  const data = await dutyRosterService.listAvailability(req.user.companyId, req.query.agentId as string);
  res.json({ success: true, data });
};

export const upsertAgentAvailability = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  const data = await dutyRosterService.upsertAvailability(req.user.companyId, req.body);
  res.json({ success: true, data });
};

export const listLeaveRequests = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  const data = await dutyRosterService.listLeaveRequests(req.user.companyId, { status: req.query.status as string });
  res.json({ success: true, data });
};

export const createLeaveRequest = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  const data = await dutyRosterService.createLeaveRequest(req.user.companyId, req.body);
  res.status(201).json({ success: true, data });
};

export const reviewLeaveRequest = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  const data = await dutyRosterService.reviewLeaveRequest(
    req.user.companyId,
    req.params.id,
    req.body.status,
    req.user.userId!
  );
  res.json({ success: true, data });
};

export const listPublicHolidays = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  const data = await dutyRosterService.listHolidays(req.user.companyId);
  res.json({ success: true, data });
};

export const createPublicHoliday = async (req: Request, res: Response) => {
  if (!req.user?.companyId) throw new AppError('Authentication with company required', 401);
  const data = await dutyRosterService.createHoliday(req.user.companyId, req.body);
  res.status(201).json({ success: true, data });
};

export const getDutyTypes = async (_req: Request, res: Response) => {
  res.json({ success: true, data: dutyRosterService.getDutyTypes() });
};
