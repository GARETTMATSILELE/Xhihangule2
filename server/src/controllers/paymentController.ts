import { Request, Response } from 'express';
import { Payment, IPayment } from '../models/Payment';
import { Notification } from '../models/Notification';
import { IUser } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { JwtPayload } from '../types/auth';
import mongoose from 'mongoose';
import { Lease } from '../models/Lease';
import { Property } from '../models/Property';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { SalesContract } from '../models/SalesContract';
import { Tenant } from '../models/Tenant';
import { callerCanAccessProperty } from '../utils/propertyAccess';
import { PaymentAuditLog } from '../models/PaymentAuditLog';
import propertyAccountService from '../services/propertyAccountService';
import agentAccountService from '../services/agentAccountService';
import { sendAgentPaymentNotificationEmail } from '../services/agentPaymentNotificationService';
import { notifyOwnerOfRentPayment, notifyOwnerOfRentReversal } from '../services/ownerRentNotificationService';
import accountingIntegrationService from '../services/accountingIntegrationService';
import { reversePaymentAccounting } from '../services/paymentAccountingOrchestrator';
import { resolveCommissionVatPolicy, resolveSaleVatPolicy, commissionVatFlagsFromPolicy, centralVatRateBlock, stampVatDecision } from '../services/vatPolicyService';
import { assertVatPeriodOpen } from '../services/vatReturnService';
import { openReview } from '../services/taxObligationService';
import { throwOnceIfArmed } from '../services/testFailureSeam';
import { activateAccountingTrackingForCompletion, ensureDepositLedgerFromPayment, ensurePaymentAccountingPosted, initialAccountingIntegrityFields, reconcilePayment, repairPaymentAccounting } from '../services/paymentAccountingReconciliation';
import { COMPLETED_PAYMENT_IMMUTABLE_MESSAGE, isCompletedFinancialPayment } from '../services/paymentFinancialImmutability';
import { applyPaymentStatusFilter, assertCorrectionDraftCanComplete, isReversalDocument } from '../services/paymentReversalPolicy';
import { acquireRentalPeriodGuardsForPayment, coverageByRentalKeys, findCoveredAdvanceMonth, sumRentalPeriodReservation, sumRentCoverageForPeriod } from '../services/rentalPeriodCoverage';
import { buildRentalCorrectionCommission, rentalCorrectionSnapshotAgrees } from '../services/correctionCommissionSnapshot';
import { findLiveIdempotentPayment } from '../services/paymentIdempotency';
import { emitEvent } from '../events/eventBus';
import trustEventRetryService from '../services/trustEventRetryService';
import {
  AccountingClassificationConflictError,
  historicalTransactionDomain,
  mayPostSaleTrust,
  resolveCreateTransactionDomain
} from '../services/transactionDomain';
import chargeTypeService from '../services/chargeTypeService';
import {
  resolveCombinedRentalAllocation,
  createLinkedLevyPayment,
  reverseLinkedLevyPayment,
  sumRentPaidForPeriod,
  type CombinedAllocationResult,
} from '../services/combinedPaymentService';
import { buildPaymentReceiptPdf } from '../utils/paymentReceiptPdf';
import { CommissionService, applyLevyPassThroughToSnapshot } from '../services/commissionService';
import { getVatRateForDate } from '../services/taxRateService';
import { roundMoney } from '../utils/money';
import {
  SALE_PAYMENT_INCOMPLETE_CODE,
  SALE_PAYMENT_INCOMPLETE_MESSAGE,
  salePaymentIncompleteResponse,
  validateSalePaymentCompleteness
} from '../services/salePaymentCompleteness';
import { prepareIntroductionRentalCommission } from '../services/introductionCommissionService';
import {
  introductionContextErrorResponse,
  type IntroductionContextError
} from '../services/introductionLeaseContext';

const isConfirmedStatus = (status?: string): boolean => {
  const s = String(status || '').toLowerCase();
  return s === 'completed' || s === 'confirmed';
};

const normalizePaymentLines = async (rawLines: any, companyId: string | mongoose.Types.ObjectId) => {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return undefined;
  const normalized = [];
  for (const rawLine of rawLines) {
    const code = String(rawLine?.chargeTypeCode || rawLine?.code || '').trim().toUpperCase();
    const amount = Number(rawLine?.amount || 0);
    if (!code || amount <= 0) continue;
    const chargeType = await chargeTypeService.getChargeTypeByCode(code, companyId, { throwIfMissing: true });
    normalized.push({
      chargeTypeCode: chargeType!.code,
      chargeTypeId: chargeType!._id,
      amount: Number(amount.toFixed(2)),
      description: rawLine?.description ? String(rawLine.description) : chargeType!.name,
      referenceId: rawLine?.referenceId ? String(rawLine.referenceId) : undefined,
      metadata: rawLine?.metadata && typeof rawLine.metadata === 'object' ? rawLine.metadata : undefined,
      chargeTypeCategory: chargeType!.category,
      ownerIncome: chargeType!.ownerIncome
    });
  }
  if (normalized.length === 0) {
    throw new AppError('At least one valid payment line is required', 400);
  }
  return normalized;
};

const sumPaymentLines = (lines?: Array<{ amount: number }>): number | undefined => {
  if (!Array.isArray(lines) || lines.length === 0) return undefined;
  return Number(lines.reduce((sum, line) => sum + Number(line.amount || 0), 0).toFixed(2));
};

const emitPaymentConfirmedIfNeeded = async (payment: any, sourceEvent: string): Promise<void> => {
  if (!payment || !payment._id || !isConfirmedStatus(payment.status)) return;
  if (!mayPostSaleTrust(payment)) return;
  const updateResult = await Payment.updateOne(
    {
      _id: payment._id,
      companyId: payment.companyId,
      trustEventEmittedAt: { $exists: false }
    },
    { $set: { trustEventEmittedAt: new Date(), lastTrustEventSource: sourceEvent } }
  );

  if (!Number((updateResult as any).modifiedCount || 0)) return;

  const payload = {
    eventId: `payment.confirmed:${String(payment._id)}`,
    paymentId: String(payment._id),
    propertyId: String(payment.propertyId || ''),
    payerId: String(payment.tenantId || ''),
    amount: Number(payment.amount || 0),
    reference: String(payment.referenceNumber || ''),
    date: new Date(payment.paymentDate || new Date()).toISOString(),
    companyId: String(payment.companyId || ''),
    performedBy: String(payment.processedBy || '')
  };

  try {
    await emitEvent('payment.confirmed', payload);
  } catch (error: any) {
    await trustEventRetryService.enqueueFailure(
      'payment.confirmed',
      payload as unknown as Record<string, unknown>,
      error?.message || 'failed to emit payment.confirmed',
      String(payment.companyId || '')
    );
  }
};

const isDuplicateKeyError = (error: any): boolean => (
  Number(error?.code) === 11000 || Number(error?.cause?.code) === 11000
);

const hasFinancePrivileges = (user: any): boolean => {
  const roles = ((user?.roles as string[] | undefined) || [user?.role]).map((r) => String(r || '').toLowerCase());
  return roles.some((r) => ['admin', 'accountant', 'principal', 'prea', 'finance'].includes(r));
};

const isAccountingPeriodLocked = (paymentDate: Date | string | undefined): boolean => {
  const lockBefore = process.env.ACCOUNTING_PERIOD_LOCK_BEFORE;
  if (!lockBefore) return false;
  const cutoff = new Date(lockBefore);
  const txDate = paymentDate ? new Date(paymentDate) : new Date();
  if (Number.isNaN(cutoff.getTime()) || Number.isNaN(txDate.getTime())) return false;
  return txDate < cutoff;
};

const LIST_QUERY_MAX_TIME_MS = Math.max(1000, Number(process.env.PAYMENTS_LIST_MAX_TIME_MS || 15000));
const NON_PAGINATED_PAYMENTS_LIMIT = Math.max(
  50,
  Math.min(1000, Number(process.env.PAYMENTS_NON_PAGINATED_LIMIT || 200))
);

const buildSaleCommissionDetails = async (input: {
  amount: number;
  companyId: string;
  propertyId?: any;
  vatIncluded?: boolean;
  vatRate?: number;
  applyVatOnCommission?: boolean;
  vatOnCommissionRate?: number;
  existingSplit?: any;
  commissionPercentOverride?: number;
}) => {
  const grossAmount = Math.max(0, Number(input.amount || 0));
  const saleVatRate = Math.max(0, Math.min(1, Number(input.vatRate || 0)));
  const saleVatAmount = input.vatIncluded
    ? Number((grossAmount - grossAmount / (1 + saleVatRate)).toFixed(2))
    : 0;
  const commissionBaseAmount = Math.max(0, Number((grossAmount - saleVatAmount).toFixed(2)));
  const companyObjectId = new mongoose.Types.ObjectId(String(input.companyId));
  let commissionPercent = Number(input.commissionPercentOverride);
  if (!Number.isFinite(commissionPercent) || commissionPercent <= 0) {
    commissionPercent = 5;
    try {
      if (input.propertyId && mongoose.Types.ObjectId.isValid(String(input.propertyId))) {
        const property = await Property.findById(new mongoose.Types.ObjectId(String(input.propertyId))).select('commission').lean();
        if (typeof (property as any)?.commission === 'number' && Number((property as any).commission) > 0) {
          commissionPercent = Number((property as any).commission);
        }
      }
    } catch {
      // keep fallback percent
    }
  }

  const computed = await CommissionService.calculate(commissionBaseAmount, commissionPercent, companyObjectId);
  const applyVatOnCommission = Boolean(input.applyVatOnCommission);
  let vatOnCommissionRate = 0;
  if (applyVatOnCommission) {
    const explicit = Number(input.vatOnCommissionRate);
    if (Number.isFinite(explicit) && explicit > 0) {
      vatOnCommissionRate = Math.max(0, Math.min(1, explicit));
    } else {
      const lookedUp = await getVatRateForDate(companyObjectId);
      if (!(lookedUp.decimal > 0) || lookedUp.source === 'none') {
        throw new AppError('No centrally managed VAT rate applies on the payment date. The payment was not saved.', 400);
      }
      vatOnCommissionRate = lookedUp.decimal;
    }
  }
  const vatOnCommission = applyVatOnCommission
    ? roundMoney(Number(computed.totalCommission || 0) * vatOnCommissionRate)
    : 0;
  const result: any = {
    totalCommission: Number(Number(computed.totalCommission || 0).toFixed(2)),
    preaFee: Number(Number(computed.preaFee || 0).toFixed(2)),
    agentShare: Number(Number(computed.agentShare || 0).toFixed(2)),
    agencyShare: Number(Number(computed.agencyShare || 0).toFixed(2)),
    vatOnCommission,
    ownerAmount: Number((grossAmount - saleVatAmount - Number(computed.totalCommission || 0) - vatOnCommission).toFixed(2))
  };

  const split = input.existingSplit;
  if (split && typeof split === 'object') {
    const ownerPct = Math.max(0, Math.min(100, Number(split?.splitPercentOwner ?? 0)));
    const collabPct = Math.max(0, Math.min(100, Number(split?.splitPercentCollaborator ?? (100 - ownerPct))));
    if (split?.ownerUserId || split?.collaboratorUserId) {
      const ownerAgentShare = Number((result.agentShare * (ownerPct / 100)).toFixed(2));
      const collaboratorAgentShare = Number((result.agentShare * (collabPct / 100)).toFixed(2));
      result.agentSplit = {
        ownerAgentShare,
        collaboratorAgentShare,
        ownerUserId: split?.ownerUserId,
        collaboratorUserId: split?.collaboratorUserId,
        splitPercentOwner: ownerPct,
        splitPercentCollaborator: collabPct
      };
    }
  }

  return result;
};

const paymentAuditSnapshot = (payment: any): Record<string, any> => ({
  _id: String(payment?._id || ''),
  amount: Number(payment?.amount || 0),
  status: String(payment?.status || ''),
  postingStatus: String(payment?.postingStatus || ''),
  paymentType: String(payment?.paymentType || ''),
  paymentDate: payment?.paymentDate || null,
  paymentMethod: String(payment?.paymentMethod || ''),
  propertyId: String(payment?.propertyId || ''),
  tenantId: String(payment?.tenantId || ''),
  leaseId: payment?.leaseId ? String(payment.leaseId) : null,
  companyId: String(payment?.companyId || ''),
  referenceNumber: String(payment?.referenceNumber || ''),
  reversalOfPaymentId: payment?.reversalOfPaymentId ? String(payment.reversalOfPaymentId) : null,
  reversalPaymentId: payment?.reversalPaymentId ? String(payment.reversalPaymentId) : null,
  correctedPaymentId: payment?.correctedPaymentId ? String(payment.correctedPaymentId) : null,
});

const logPaymentAudit = async (input: {
  paymentId: string;
  companyId: string;
  action: 'create' | 'edit' | 'post' | 'reverse' | 'delete' | 'void';
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  reason?: string;
  userId?: string;
}) => {
  try {
    await PaymentAuditLog.create({
      paymentId: new mongoose.Types.ObjectId(input.paymentId),
      companyId: new mongoose.Types.ObjectId(input.companyId),
      action: input.action,
      oldValues: input.oldValues,
      newValues: input.newValues,
      reason: input.reason,
      userId: input.userId ? new mongoose.Types.ObjectId(input.userId) : undefined,
    });
  } catch (e) {
    console.warn('Non-fatal: failed to write payment audit log', e);
  }
};

// List sales-only payments for a company
export const getCompanySalesPayments = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const query: any = { companyId: req.user.companyId, paymentType: 'sale' };

    // Role-based access narrowing: agents/sales users can only see their own payments
    try {
      const roles = (((req.user as any).roles as string[] | undefined) || [req.user.role]).map(r => String(r));
      const hasElevatedAccess = roles.some(r => r === 'accountant' || r === 'admin');
      const isAgentUser = roles.some(r => r === 'agent' || r === 'sales');
      // Only narrow to self when the user is agent/sales WITHOUT accountant/admin role
      if (isAgentUser && !hasElevatedAccess) {
        const uid = (req.user as any)?.userId;
        if (uid) {
          try {
            query.agentId = new mongoose.Types.ObjectId(String(uid));
          } catch {
            // if user id is not a valid object id, fall back to string equality
            query.agentId = String(uid);
          }
        }
      } else if (req.query.agentId && typeof req.query.agentId === 'string') {
        // Admin/Accountant may optionally filter by specific agentId
        try {
          query.agentId = new mongoose.Types.ObjectId(req.query.agentId);
        } catch {
          query.agentId = String(req.query.agentId);
        }
      }
    } catch {
      // Non-fatal: if role parsing fails, no additional restriction beyond company is applied
    }

    // Filters
    if (req.query.saleMode === 'quick' || req.query.saleMode === 'installment') {
      query.saleMode = req.query.saleMode;
    }
    if (req.query.status && typeof req.query.status === 'string') {
      applyPaymentStatusFilter(query, req.query.status);
    }
    if (req.query.paymentMethod && typeof req.query.paymentMethod === 'string') {
      query.paymentMethod = req.query.paymentMethod;
    }
    if (req.query.propertyId && typeof req.query.propertyId === 'string') {
      try {
        query.propertyId = new mongoose.Types.ObjectId(req.query.propertyId);
      } catch {
        // ignore invalid id
      }
    }
    // Non-development filter: returns only payments not linked to a development
    if (String(req.query.noDevelopment) === 'true') {
      query.$or = [
        { developmentId: { $exists: false } },
        { developmentId: null }
      ];
    }
    // Date filtering
    if (req.query.startDate || req.query.endDate) {
      query.paymentDate = {};
      if (req.query.startDate) {
        query.paymentDate.$gte = new Date(String(req.query.startDate));
      }
      if (req.query.endDate) {
        query.paymentDate.$lte = new Date(String(req.query.endDate));
      }
    }

    const paginate = String(req.query.paginate) === 'true';
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 25)));
    const skip = (page - 1) * limit;

    // Base query with lean and minimal fields
    const base = Payment.find(query)
      .select({
        paymentType: 1,
        amount: 1,
        currency: 1,
        paymentDate: 1,
        paymentMethod: 1,
        status: 1,
        referenceNumber: 1,
        // Include notes so client can parse total sale price for outstanding calc
        notes: 1,
        saleMode: 1,
        developmentId: 1,
        // Include saleId so client can group payments reliably per sale
        saleId: 1,
        propertyId: 1,
        tenantId: 1,
        buyerName: 1,
        sellerName: 1,
        commissionDetails: 1,
        rentalPeriodMonth: 1,
        rentalPeriodYear: 1,
        advanceMonthsPaid: 1,
        advancePeriodStart: 1,
        advancePeriodEnd: 1,
        rentUsed: 1,
        rentAllocated: 1,
        levyAllocated: 1,
        manualPropertyAddress: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName')
      .sort({ paymentDate: -1 })
      .maxTimeMS(LIST_QUERY_MAX_TIME_MS)
      .lean();

    if (!paginate) {
      const unpaginatedLimit = Math.max(
        1,
        Math.min(NON_PAGINATED_PAYMENTS_LIMIT, Number(req.query.limit || NON_PAGINATED_PAYMENTS_LIMIT))
      );
      const payments = await base.limit(unpaginatedLimit).exec();
      // Annotate outstanding for sales payments in-memory
      try {
        const companyId = (req.user as any).companyId;
        const saleIdKeys = new Set<string>();
        const refKeys = new Set<string>();
        const manualAddrKeys = new Set<string>();
        for (const it of payments as any[]) {
          if (it?.saleId) {
            saleIdKeys.add(String(it.saleId));
          } else {
            if (it?.referenceNumber) refKeys.add(String(it.referenceNumber));
            if (it?.manualPropertyAddress) manualAddrKeys.add(String(it.manualPropertyAddress));
          }
        }
        const paidBySaleId: Record<string, number> = {};
        if (saleIdKeys.size > 0) {
          const agg = await Payment.aggregate([
            { $match: { companyId: new mongoose.Types.ObjectId(String(companyId)), paymentType: 'sale', status: 'completed', saleId: { $in: Array.from(saleIdKeys).map(id => new mongoose.Types.ObjectId(String(id))) } } },
            { $group: { _id: '$saleId', totalPaid: { $sum: '$amount' } } }
          ]).option({ maxTimeMS: LIST_QUERY_MAX_TIME_MS });
          for (const row of agg) {
            paidBySaleId[String(row._id)] = Number(row.totalPaid || 0);
          }
        }
        const paidByLoose: Record<string, number> = {};
        if (refKeys.size > 0 || manualAddrKeys.size > 0) {
          const or: any[] = [];
          if (refKeys.size > 0) or.push({ referenceNumber: { $in: Array.from(refKeys) } });
          if (manualAddrKeys.size > 0) or.push({ manualPropertyAddress: { $in: Array.from(manualAddrKeys) } });
          const related = await Payment.find({
            companyId,
            paymentType: 'sale',
            status: 'completed',
            $or: or
          }).select('referenceNumber manualPropertyAddress amount').maxTimeMS(LIST_QUERY_MAX_TIME_MS).lean();
          for (const p of related as any[]) {
            const key = p.referenceNumber || p.manualPropertyAddress || '';
            if (!key) continue;
            paidByLoose[key] = (paidByLoose[key] || 0) + Number(p.amount || 0);
          }
        }
        const parseTotalSale = (notes: string | undefined): number | null => {
          if (!notes) return null;
          const m = String(notes).match(/Total\s+Sale\s+Price\s+([0-9,.]+)/i);
          if (m && m[1]) {
            const n = Number(m[1].replace(/,/g, ''));
            return Number.isFinite(n) ? n : null;
          }
          return null;
        };
        for (const it of payments as any[]) {
          const totalSale = parseTotalSale(it?.notes);
          if (totalSale != null) {
            let paidToDate = 0;
            if (it?.saleId) {
              paidToDate = paidBySaleId[String(it.saleId)] || 0;
            } else {
              const key = it?.referenceNumber || it?.manualPropertyAddress || '';
              paidToDate = (paidByLoose[key] || 0) + (paidByLoose[`REV-${key}`] || 0) + (paidByLoose[`CORR-${key}`] || 0);
            }
            (it as any).outstanding = Math.max(0, totalSale - paidToDate);
          }
        }
      } catch (calcErr) {
        console.warn('Failed to compute outstanding for sales payments:', (calcErr as any)?.message || calcErr);
      }
      if (payments.length === unpaginatedLimit) {
        res.setHeader('X-Result-Limit-Applied', String(unpaginatedLimit));
      }
      return res.json(payments);
    }

    const [items, total] = await Promise.all([
      base.skip(skip).limit(limit).exec(),
      Payment.countDocuments(query).maxTimeMS(LIST_QUERY_MAX_TIME_MS)
    ]);
    // Compute outstanding per page
    try {
      const companyId = (req.user as any).companyId;
      const saleIdKeys = new Set<string>();
      const refKeys = new Set<string>();
      const manualAddrKeys = new Set<string>();
      for (const it of items as any[]) {
        if (it?.saleId) {
          saleIdKeys.add(String(it.saleId));
        } else {
          if (it?.referenceNumber) refKeys.add(String(it.referenceNumber));
          if (it?.manualPropertyAddress) manualAddrKeys.add(String(it.manualPropertyAddress));
        }
      }
      const paidBySaleId: Record<string, number> = {};
      if (saleIdKeys.size > 0) {
        const agg = await Payment.aggregate([
          { $match: { companyId: new mongoose.Types.ObjectId(String(companyId)), paymentType: 'sale', status: 'completed', saleId: { $in: Array.from(saleIdKeys).map(id => new mongoose.Types.ObjectId(String(id))) } } },
          { $group: { _id: '$saleId', totalPaid: { $sum: '$amount' } } }
        ]).option({ maxTimeMS: LIST_QUERY_MAX_TIME_MS });
        for (const row of agg) {
          paidBySaleId[String(row._id)] = Number(row.totalPaid || 0);
        }
      }
      const paidByLoose: Record<string, number> = {};
      if (refKeys.size > 0 || manualAddrKeys.size > 0) {
        const or: any[] = [];
        if (refKeys.size > 0) or.push({ referenceNumber: { $in: Array.from(refKeys) } });
        if (manualAddrKeys.size > 0) or.push({ manualPropertyAddress: { $in: Array.from(manualAddrKeys) } });
        const related = await Payment.find({
          companyId,
          paymentType: 'sale',
          status: 'completed',
          $or: or
        }).select('referenceNumber manualPropertyAddress amount').maxTimeMS(LIST_QUERY_MAX_TIME_MS).lean();
        for (const p of related as any[]) {
          const key = p.referenceNumber || p.manualPropertyAddress || '';
          if (!key) continue;
          paidByLoose[key] = (paidByLoose[key] || 0) + Number(p.amount || 0);
        }
      }
      const parseTotalSale = (notes: string | undefined): number | null => {
        if (!notes) return null;
        const m = String(notes).match(/Total\s+Sale\s+Price\s+([0-9,.]+)/i);
        if (m && m[1]) {
          const n = Number(m[1].replace(/,/g, ''));
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };
      for (const it of items as any[]) {
        const totalSale = parseTotalSale(it?.notes);
        if (totalSale != null) {
          let paidToDate = 0;
          if (it?.saleId) {
            paidToDate = paidBySaleId[String(it.saleId)] || 0;
          } else {
            const key = it?.referenceNumber || it?.manualPropertyAddress || '';
            paidToDate = (paidByLoose[key] || 0) + (paidByLoose[`REV-${key}`] || 0) + (paidByLoose[`CORR-${key}`] || 0);
          }
          (it as any).outstanding = Math.max(0, totalSale - paidToDate);
        }
      }
    } catch (calcErr) {
      console.warn('Failed to compute outstanding for paginated sales payments:', (calcErr as any)?.message || calcErr);
    }
    return res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching sales payments:', error);
    return res.status(500).json({ message: 'Failed to fetch sales payments' });
  }
};

export const getPayments = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payments = await Payment.find({ companyId: req.user.companyId });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ message: 'Error fetching payments' });
  }
};

export const getPayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payment = await Payment.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ message: 'Error fetching payment' });
  }
};

// Create a new payment (for lease-based payments)
async function paymentRecordVisible(req: Request, payment: { companyId?: unknown; propertyId?: unknown }): Promise<boolean> {
  if (!req.user?.companyId || String(payment.companyId || '') !== String(req.user.companyId)) return false;
  if (payment.propertyId && !(await callerCanAccessProperty(req, String(payment.propertyId)))) return false;
  return true;
}

export const createPayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Allow Idempotency-Key header as an alternative to body field
  try {
    const headerKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key']) as string | undefined;
    if (headerKey && !req.body.idempotencyKey) {
      (req.body as any).idempotencyKey = String(headerKey);
    }
  } catch (_) {}

  let releaseRentalGuard: () => Promise<void> = async () => {};
  try {
    const {
      leaseId,
      amount,
      paymentDate,
      paymentMethod,
      status,
      companyId,
      rentalPeriodMonth,
      rentalPeriodYear,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
    } = req.body;
    const requestedCurrency = String(req.body.currency || 'USD').trim().toUpperCase();
    if (requestedCurrency !== 'USD' && requestedCurrency !== 'ZWL') {
      return res.status(400).json({ status: 'error', message: 'Currency must be USD or ZWL.' });
    }
    req.body.currency = requestedCurrency;

    // Validate required fields
    if (!leaseId || !amount || !paymentDate || !paymentMethod || !status) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: leaseId, amount, paymentDate, paymentMethod, status',
      });
    }
    if (!req.user.companyId) {
      return res.status(401).json({ status: 'error', message: 'Authentication required' });
    }
    const authorizedLease = await Lease.findOne({ _id: leaseId, companyId: req.user.companyId }).select('_id propertyId tenantId');
    if (!authorizedLease || !(await callerCanAccessProperty(req, String(authorizedLease.propertyId)))) {
      return res.status(404).json({ status: 'error', message: 'Lease not found' });
    }
    releaseRentalGuard = await acquireRentalPeriodGuardsForPayment({
      companyId: req.user.companyId,
      propertyId: authorizedLease.propertyId,
      tenantId: authorizedLease.tenantId,
      rentalPeriodYear,
      rentalPeriodMonth,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
      paymentType: 'rental',
      amount,
      depositAmount: req.body.depositAmount,
      leaseId,
      currency: req.body.currency,
    });
    if (req.body.idempotencyKey) {
      const dup = await findLiveIdempotentPayment({
        companyId: req.user.companyId,
        idempotencyKey: String(req.body.idempotencyKey)
      });
      if (dup) {
        return res.status(200).json({ message: 'Payment processed successfully', payment: dup });
      }
    }
    // Validate advance payment fields
    if (advanceMonthsPaid && advancePeriodStart && advancePeriodEnd) {
      // Check for overlapping advance payments for this lease
      const overlap = await Payment.findOne({
        leaseId,
        companyId: new mongoose.Types.ObjectId(req.user.companyId),
        status: { $in: ['pending', 'completed'] },
        reversalOfPaymentId: { $exists: false },
        amount: { $gte: 0 },
        reversalState: { $ne: 'reversed' },
        $or: [
          {
            'advancePeriodStart.year': { $lte: advancePeriodEnd.year },
            'advancePeriodEnd.year': { $gte: advancePeriodStart.year },
            'advancePeriodStart.month': { $lte: advancePeriodEnd.month },
            'advancePeriodEnd.month': { $gte: advancePeriodStart.month },
          },
          {
            rentalPeriodYear: { $gte: advancePeriodStart.year, $lte: advancePeriodEnd.year },
            rentalPeriodMonth: { $gte: advancePeriodStart.month, $lte: advancePeriodEnd.month },
          }
        ]
      });
      if (overlap) {
        return res.status(400).json({
          status: 'error',
          message: 'Overlapping advance payment already exists for this period.'
        });
      }
      const coveredAdvance = await findCoveredAdvanceMonth({
        companyId: req.user.companyId,
        propertyId: authorizedLease.propertyId,
        tenantId: authorizedLease.tenantId,
        rentalPeriodMonth,
        rentalPeriodYear,
        advanceMonthsPaid,
        advancePeriodStart,
        advancePeriodEnd,
        leaseId,
        currency: req.body.currency,
      });
      if ('error' in coveredAdvance) {
        return res.status(400).json({ status: 'error', message: coveredAdvance.error, code: 'RENTAL_PERIOD_REQUIRED' });
      }
      if (coveredAdvance.covered) {
        return res.status(400).json({
          status: 'error',
          message: 'Overlapping advance payment already exists for this period.'
        });
      }
      // Validate amount
      const lease = await Lease.findById(leaseId);
      if (lease && amount !== lease.rentAmount * advanceMonthsPaid) {
        return res.status(400).json({
          status: 'error',
          message: `Amount must equal rent (${lease.rentAmount}) x months (${advanceMonthsPaid}) = ${lease.rentAmount * advanceMonthsPaid}`
        });
      }
    }

    // Get lease details to extract property and tenant information
    const lease = await Lease.findById(leaseId);
    if (!lease) {
      return res.status(404).json({
        status: 'error',
        message: 'Lease not found',
      });
    }

    // Get property details
    const property = await Property.findById(lease.propertyId);
    if (!property) {
      return res.status(404).json({
        message: 'Property not found',
      });
    }
    const rent = property.rent || lease.rentAmount;
    // For advance payments spanning multiple months, require full multiple of rent
    if (advanceMonthsPaid && advanceMonthsPaid > 1) {
      const expectedAmount = rent * advanceMonthsPaid;
      if (amount !== expectedAmount) {
        return res.status(400).json({
          status: 'error',
          message: `Amount must equal rent (${rent}) x months (${advanceMonthsPaid}) = ${expectedAmount}`
        });
      }
      const coveredAdvance = await findCoveredAdvanceMonth({
        companyId: req.user.companyId,
        propertyId: lease.propertyId,
        tenantId: lease.tenantId,
        rentalPeriodMonth,
        rentalPeriodYear,
        advanceMonthsPaid,
        advancePeriodStart,
        advancePeriodEnd,
        leaseId: lease._id,
        currency: req.body.currency,
      });
      if ('error' in coveredAdvance) {
        return res.status(400).json({ status: 'error', message: coveredAdvance.error, code: 'RENTAL_PERIOD_REQUIRED' });
      }
      if (coveredAdvance.covered) {
        return res.status(400).json({
          status: 'error',
          message: 'Overlapping advance payment already exists for this period.'
        });
      }
    } else {
      // Allow partial payments for a single month up to remaining balance
      const alreadyPaid = await sumRentalPeriodReservation({
        companyId: req.user.companyId,
        propertyId: lease.propertyId,
        tenantId: lease.tenantId,
        rentalPeriodYear,
        rentalPeriodMonth,
        leaseId: lease._id,
        currency: req.body.currency
      });
      const alreadyPaidCents = Math.round(alreadyPaid * 100);
      const rentCents = Math.round((rent || 0) * 100);
      const remainingCents = rentCents - alreadyPaidCents;
      if (remainingCents <= 0) {
        return res.status(409).json({ status: 'error', message: 'This month is fully paid. Change rental month.' });
      }
      const amountCents = Math.round((amount || 0) * 100);
      if (amountCents > remainingCents) {
        return res.status(400).json({ status: 'error', message: `Only ${(remainingCents/100).toFixed(2)} remains for this month. Enter an amount ≤ remaining.` });
      }
    }

    const propertyVatRequested = Boolean((property as any)?.vatOnCommission);
    const propertyVatTreatment = (property as any)?.vatCommissionTreatment;
    const isIntroductionPayment = String((property as any)?.rentalType || '').toLowerCase() === 'introduction';
    const commissionVatPolicy = await resolveCommissionVatPolicy({
      companyId: String(req.user.companyId),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      property: {
        vatOnCommission: propertyVatRequested,
        vatCommissionTreatment: propertyVatTreatment
      },
      requestedVatOnCommission: propertyVatRequested,
      requestedTreatment: propertyVatTreatment,
      commissionType: isIntroductionPayment ? 'introduction' : 'management'
    });
    const blockedVatRate = centralVatRateBlock(commissionVatPolicy);
    if (blockedVatRate) {
      return res.status(400).json({ message: blockedVatRate.message, code: blockedVatRate.code });
    }
    const commissionVat = commissionVatFlagsFromPolicy(commissionVatPolicy);
    if (commissionVatPolicy.reviewRequired && commissionVatPolicy.reviewReason) {
      await openReview({
        companyId: String(req.user.companyId),
        kind: commissionVatPolicy.reviewReason,
        title: 'VAT on commission requires review',
        detail: commissionVatPolicy.reason,
        propertyId: String(lease.propertyId)
      });
    }

    // Calculate commission based on property commission percentage and company config
    let paymentCommissionResult;
    let paymentCommissionDetails;
    if (isIntroductionPayment) {
      const prepared = await prepareIntroductionRentalCommission({
        companyId: String(req.user.companyId || lease.companyId),
        propertyId: lease.propertyId,
        tenantId: lease.tenantId,
        leaseId: lease._id,
        rentAllocated: Number(amount || 0),
        levyAllocated: 0,
        vatOnCommission: commissionVat.vatOnCommission,
        vatTreatment: commissionVat.vatTreatment,
        vatRate: commissionVat.vatRate,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        propertyRent: Number(rent || 0),
        rentUsed: Number(rent || 0)
      });
      if (!prepared.ok) {
        return res.status(400).json(introductionContextErrorResponse(prepared as IntroductionContextError));
      }
      paymentCommissionResult = prepared.result;
      paymentCommissionDetails = prepared.snapshot;
    } else {
      paymentCommissionResult = await CommissionService.calculateForProperty({
        companyId: req.user.companyId,
        grossRent: amount,
        levy: 0,
        commissionPercentage: property.commission || 0,
        vatOnCommission: commissionVat.vatOnCommission,
        vatTreatment: commissionVat.vatTreatment,
        vatRate: commissionVat.vatRate,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date()
      });
      paymentCommissionDetails = applyLevyPassThroughToSnapshot(paymentCommissionResult, amount, 0);
    }
    paymentCommissionDetails = stampVatDecision(paymentCommissionDetails, commissionVatPolicy);

    try {
      resolveCreateTransactionDomain({
        paymentType: 'rental',
        entity: { kind: 'property', rentalType: (property as any)?.rentalType }
      });
    } catch (domainError) {
      if (domainError instanceof AccountingClassificationConflictError) {
        return res.status(409).json(domainError.toBody());
      }
      throw domainError;
    }

    // Create payment record
    const payment = new Payment({
      amount,
      paymentDate,
      paymentMethod,
      status,
      ...initialAccountingIntegrityFields({ status }),
      companyId: req.user.companyId,
      paymentType: 'rental',
      transactionDomain: 'RENTAL',
      propertyType: 'residential', // Default value
      propertyId: lease.propertyId,
      tenantId: lease.tenantId,
      agentId: property.agentId, // Use property's assigned agent as the primary agent for rental notifications
      processedBy: lease.tenantId, // Use tenant ID as processedBy since no agent ID
      depositAmount: 0, // Default value
      rentalPeriodMonth,
      rentalPeriodYear,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
      referenceNumber: '', // Placeholder, will update after save
      notes: '', // Default empty notes
      commissionDetails: paymentCommissionDetails,
      applyVatOnCommission: paymentCommissionResult.vatOnCommission,
      vatOnCommissionRate: paymentCommissionResult.vatRate || 0,
      vatCommissionTreatment: paymentCommissionResult.vatTreatment,
      rentUsed: rent, // Store the rent used for this payment
      leaseId: lease._id,
      currency: requestedCurrency,
      idempotencyKey: req.body.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
    });

    await payment.save();
    // Generate reference number after save (using payment._id)
    payment.referenceNumber = `RCPT-${payment._id.toString().slice(-6).toUpperCase()}-${rentalPeriodYear}-${String(rentalPeriodMonth).padStart(2, '0')}`;
    await payment.save();
    await logPaymentAudit({
      paymentId: String(payment._id),
      companyId: String(payment.companyId),
      action: String(payment.status || '') === 'completed' ? 'post' : 'create',
      newValues: paymentAuditSnapshot(payment),
      reason: 'Initial payment creation',
      userId: req.user.userId
    });

    // If depositAmount > 0, record in rentaldeposits
    if (payment.depositAmount && payment.depositAmount > 0) {
      await ensureDepositLedgerFromPayment(payment);
    }

    // Company.revenue / User.balance are not accounting ledgers (Phase 5B).
    const postResult = await ensurePaymentAccountingPosted(payment._id.toString(), { createdBy: req.user.userId });
    if (postResult.recon.status !== 'complete' && postResult.recon.status !== 'not_applicable') {
      console.warn('Payment accounting post incomplete (lease-based create)', postResult.recon.missing);
    }

    // Update property arrears after payment
    if (property.currentArrears !== undefined) {
      const arrears = property.currentArrears - amount;
      await Property.findByIdAndUpdate(property._id, { currentArrears: arrears < 0 ? 0 : arrears });
    }

    // Notify the primary agent (and split participants) for completed rental payments
    try {
      const recipientIds = new Set<string>();
      if (payment.agentId) recipientIds.add(String(payment.agentId));
      const split = ((payment as any).commissionDetails || {})?.agentSplit || {};
      if (split.ownerUserId) recipientIds.add(String(split.ownerUserId));
      if (split.collaboratorUserId) recipientIds.add(String(split.collaboratorUserId));
      const docs = Array.from(recipientIds).map((uid) => ({
        companyId: String((req.user as any).companyId),
        userId: new mongoose.Types.ObjectId(uid),
        title: 'Rental payment recorded',
        message: `Reference ${payment.referenceNumber} · Amount ${payment.amount} ${payment.currency || 'USD'}`,
        link: '/sales-dashboard/notifications',
        payload: { paymentId: payment._id, paymentType: payment.paymentType, skipEmail: true }
      }));
      if (docs.length) {
        const saved = await Notification.insertMany(docs);
        try {
          const { getIo } = await import('../config/socket');
          const io = getIo();
          if (io) {
            for (const n of saved) {
              io.to(`user-${String((n as any).userId)}`).emit('newNotification', n);
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Non-fatal: failed to create agent notification for rental payment', e);
    }

    // Email agent with payment details (fire-and-forget). Owner email is downstream and cannot roll back the payment.
    void sendAgentPaymentNotificationEmail(payment);
    if (postResult.accountingComplete === true) {
      void notifyOwnerOfRentPayment(payment, { accountingComplete: true });
    }

    await emitPaymentConfirmedIfNeeded(payment, 'payment.create');

    res.status(201).json({
      message: 'Payment processed successfully',
      payment,
      receiptStatus: 'PAYMENT_RECEIVED',
      accountingComplete: postResult.accountingComplete,
      accountingStatus: postResult.accountingStatus,
      accountingState: postResult.accountingComplete ? 'ACCOUNTING_COMPLETE' : 'ACCOUNTING_INCOMPLETE'
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode || 400).json({ message: error.message, code: error.code || 'VAT_RATE_UNAVAILABLE' });
    }
    console.error('Error processing payment:', error);
    res.status(500).json({
      message: 'Failed to process payment',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    await releaseRentalGuard();
  }
};

// Create a new payment (for accountant dashboard - handles PaymentFormData structure)
export const createPaymentAccountant = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const currentUser = req.user as JwtPayload;

  // Allow Idempotency-Key header as an alternative to body field
  try {
    const headerKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key']) as string | undefined;
    if (headerKey && !(req.body as any).idempotencyKey) {
      (req.body as any).idempotencyKey = String(headerKey);
    }
  } catch (_) {}

  type CreateResult =
    | { payment: IPayment }
    | { error: { status: number; message: string; code?: string; missing?: string[]; mismatches?: string[] } };

  // Helper to perform the actual create logic, with optional transaction session
  const performCreate = async (user: JwtPayload, session?: mongoose.ClientSession): Promise<CreateResult> => {
    const {
      paymentType,
      propertyType,
      paymentDate,
      paymentMethod,
      amount,
      depositAmount,
      referenceNumber,
      notes,
      currency,
      rentalPeriodMonth,
      rentalPeriodYear,
      rentUsed,
      commissionDetails,
      manualPropertyAddress,
      manualTenantName,
    } = req.body as any;
    // Extract optional advance fields
    const { advanceMonthsPaid, advancePeriodStart, advancePeriodEnd } = (req.body as any);
    if (!user.companyId) {
      return { error: { status: 400, message: 'Company ID is required' } };
    }
    if ((req.body as any).idempotencyKey) {
      const existing = await findLiveIdempotentPayment({
        companyId: user.companyId,
        idempotencyKey: String((req.body as any).idempotencyKey),
        session
      });
      if (existing) {
        return { payment: existing as any };
      }
    }
    const normalizedPaymentLines = await normalizePaymentLines((req.body as any).paymentLines, String(user.companyId));
    const lineTotal = sumPaymentLines(normalizedPaymentLines);
    const effectiveAmount = lineTotal ?? Number(amount || 0);
    const configuredNonOwnerTotal = Array.isArray(normalizedPaymentLines)
      ? normalizedPaymentLines
        .filter((line: any) => line.chargeTypeCategory !== 'PROPERTY_INCOME' || line.ownerIncome !== true)
        .reduce((sum: number, line: any) => sum + Number(line.amount || 0), 0)
      : 0;

    // Safely extract ids (string or nested {_id})
    const extractId = (v: any): string | undefined => {
      if (!v) return undefined;
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && (v._id || v.id)) return v._id || v.id;
      return undefined;
    };

    const rawPropertyId = extractId((req.body as any).propertyId);
    const rawTenantId = extractId((req.body as any).tenantId);
    const rawAgentId = extractId((req.body as any).agentId) || user.userId;
    const rawProcessedBy = extractId((req.body as any).processedBy) || user.userId;
    const rawLeaseId = extractId((req.body as any).leaseId);
    const rawOwnerId = extractId((req.body as any).ownerId);
    const rawSaleId = extractId((req.body as any).saleId);

    // Validate required fields: paymentDate must be present; at least amount or depositAmount > 0
    if (!paymentDate) {
      return { error: { status: 400, message: 'Missing required field: paymentDate' } };
    }
    const numericAmount = Number(effectiveAmount || 0);
    const numericDeposit = Number(depositAmount || 0);
    if (numericAmount <= 0 && numericDeposit <= 0) {
      return { error: { status: 400, message: 'Either amount or depositAmount must be greater than 0' } };
    }
    
    // Check if using manual entries
    const manualProperty = typeof rawPropertyId === 'string' && rawPropertyId.startsWith('manual_');
    const manualTenant = typeof rawTenantId === 'string' && rawTenantId.startsWith('manual_');
    
    // Validate manual entries
    if (manualProperty && !manualPropertyAddress) {
      return { error: { status: 400, message: 'Manual property address is required when using manual property entry' } };
    }
    if (manualTenant && !manualTenantName) {
      return { error: { status: 400, message: 'Manual tenant name is required when using manual tenant entry' } };
    }
    
    // Validate that either propertyId/tenantId are provided or manual entries are used
    if (!rawPropertyId && !manualPropertyAddress) {
      return { error: { status: 400, message: 'Either propertyId or manual property address is required' } };
    }
    if (!rawTenantId && !manualTenantName) {
      return { error: { status: 400, message: 'Either tenantId or manual tenant name is required' } };
    }

    // Validate ObjectId formats when not manual
    if (!manualProperty && rawPropertyId && !mongoose.Types.ObjectId.isValid(rawPropertyId)) {
      return { error: { status: 400, message: 'Invalid propertyId format' } };
    }
    if (!manualTenant && rawTenantId && !mongoose.Types.ObjectId.isValid(rawTenantId)) {
      return { error: { status: 400, message: 'Invalid tenantId format' } };
    }
    if (rawAgentId && !mongoose.Types.ObjectId.isValid(rawAgentId)) {
      return { error: { status: 400, message: 'Invalid agentId format' } };
    }
    if (rawProcessedBy && !mongoose.Types.ObjectId.isValid(rawProcessedBy)) {
      return { error: { status: 400, message: 'Invalid processedBy format' } };
    }
    if (rawLeaseId && !mongoose.Types.ObjectId.isValid(rawLeaseId)) {
      return { error: { status: 400, message: 'Invalid leaseId format' } };
    }
    if (rawSaleId && !mongoose.Types.ObjectId.isValid(rawSaleId)) {
      return { error: { status: 400, message: 'Invalid saleId format' } };
    }
    if (rawOwnerId && !mongoose.Types.ObjectId.isValid(rawOwnerId)) {
      return { error: { status: 400, message: 'Invalid ownerId format' } };
    }

    if (!manualProperty && rawPropertyId) {
      const propertyInCompany = await Property.exists({ _id: rawPropertyId, companyId: user.companyId });
      if (!propertyInCompany || !(await callerCanAccessProperty(req, String(rawPropertyId)))) {
        return { error: { status: 404, message: 'Property was not found in this company' } };
      }
    }
    if (!manualTenant && rawTenantId) {
      const tenantInCompany = await Tenant.exists({ _id: rawTenantId, companyId: user.companyId });
      if (!tenantInCompany) {
        return { error: { status: 404, message: 'Tenant was not found in this company' } };
      }
    }
    if (rawLeaseId) {
      const leaseInCompany = await Lease.findOne({ _id: rawLeaseId, companyId: user.companyId }).select('propertyId tenantId').lean();
      if (!leaseInCompany) {
        return { error: { status: 404, message: 'Lease was not found in this company' } };
      }
      if (!manualProperty && rawPropertyId && String((leaseInCompany as any).propertyId) !== String(rawPropertyId)) {
        return { error: { status: 404, message: 'Lease was not found in this company' } };
      }
      if (!manualTenant && rawTenantId && String((leaseInCompany as any).tenantId) !== String(rawTenantId)) {
        return { error: { status: 404, message: 'Tenant was not found in this company' } };
      }
    }

    let resolvedPaymentType: 'sale' | 'rental' | 'introduction';
    if (manualProperty) {
      if (!paymentType) {
        return { error: { status: 400, message: 'paymentType is required for manual property payments because Property.rentalType cannot be resolved' } };
      }
      resolvedPaymentType = paymentType as any;
    } else {
      try {
        const ledgerResolution = await propertyAccountService.resolveLedgerTypeForProperty(
          rawPropertyId!,
          'createPaymentAccountant'
        );
        const suppliedPaymentType = paymentType ? String(paymentType).toLowerCase() : '';
        if (suppliedPaymentType === 'sale' && ledgerResolution.ledgerType !== 'sale') {
          return {
            error: {
              status: 400,
              message: `Payment type sale does not match Property.rentalType (${ledgerResolution.businessType}) for property ${rawPropertyId}`
            }
          };
        }
        if (suppliedPaymentType && suppliedPaymentType !== 'sale' && ledgerResolution.ledgerType !== 'rental') {
          return {
            error: {
              status: 400,
              message: `Payment type ${suppliedPaymentType} does not match Property.rentalType (${ledgerResolution.businessType}) for property ${rawPropertyId}`
            }
          };
        }
        resolvedPaymentType = (paymentType as any) || (ledgerResolution.ledgerType === 'sale' ? 'sale' : 'rental');
      } catch (error: any) {
        return { error: { status: Number(error?.statusCode || 400), message: error?.message || 'Unable to resolve payment ledger type from property' } };
      }
    }

    // Resolve rent/levy allocation for combined payments (levy-first split)
    let combinedAllocation: CombinedAllocationResult | null = null;
    const isRentalPayment = resolvedPaymentType !== 'sale';
    if (isRentalPayment && !normalizedPaymentLines && !manualProperty && !manualTenant && rawPropertyId && rawTenantId) {
      const allocationResult = await resolveCombinedRentalAllocation({
        companyId: new mongoose.Types.ObjectId(user.companyId),
        propertyId: new mongoose.Types.ObjectId(rawPropertyId),
        tenantId: new mongoose.Types.ObjectId(rawTenantId),
        amount: Number(effectiveAmount || 0),
        depositAmount: Number(depositAmount || 0),
        rentalPeriodMonth: Number(rentalPeriodMonth),
        rentalPeriodYear: Number(rentalPeriodYear),
        advanceMonthsPaid: Number(advanceMonthsPaid || 1),
        advancePeriodStart,
        advancePeriodEnd,
        leaseId: rawLeaseId,
        currency,
        rentUsed: typeof rentUsed === 'number' ? Number(rentUsed) : undefined,
        levyUsed: typeof (req.body as any).levyUsed === 'number' ? Number((req.body as any).levyUsed) : undefined,
      });
      if ('status' in allocationResult) {
        return { error: { status: allocationResult.status, message: allocationResult.message } };
      }
      combinedAllocation = allocationResult;
    }

    const commissionBaseAmount = combinedAllocation
      ? combinedAllocation.rentAllocated
      : Number(amount || 0);

    // Calculate commission: apply "single-month" rule only for introduction; management uses full amount (including advance periods)
    let finalCommissionDetails = commissionDetails;
    let resolvedOwnerId: string | undefined = rawOwnerId;
    let rentalVatOnCommission = false;
    let rentalVatOnCommissionRate = 0;
    let rentalVatCommissionTreatment: 'inclusive' | 'exclusive' | undefined;
    let resolvedIntroductionLeaseId: string | undefined = rawLeaseId;
    {
      const isRental = resolvedPaymentType !== 'sale';
      const tenantObjectId = manualTenant ? undefined : (rawTenantId ? new mongoose.Types.ObjectId(rawTenantId) : undefined);
      const propertyObjectId = manualProperty ? undefined : (rawPropertyId ? new mongoose.Types.ObjectId(rawPropertyId) : undefined);
      const amountNum = Number(amount || 0);
      const depositNum = Number(depositAmount || 0);
      const isDepositOnly = amountNum <= 0 && depositNum > 0;

      // Fetch property to resolve commission percent, rentalType, VAT settings and owner fallback
      let commissionPercentResolved: number = (propertyType || 'residential') === 'residential' ? 15 : 10;
      let rentalTypeResolved: 'management' | 'introduction' | 'sale' | undefined = undefined;
      let propertyVatOnCommission = false;
      let propertyVatTreatment: 'inclusive' | 'exclusive' | undefined;
      let propertyRentResolved = 0;
      if (!manualProperty && rawPropertyId) {
        const prop = await Property.findById(new mongoose.Types.ObjectId(rawPropertyId))
          .select('commission rentalType ownerId vatOnCommission vatCommissionTreatment rent')
          .lean();
        if (prop) {
          if (typeof (prop as any)?.commission === 'number') {
            commissionPercentResolved = Number((prop as any).commission);
          }
          if ((prop as any)?.rentalType) {
            rentalTypeResolved = (prop as any).rentalType as any;
          }
          propertyVatOnCommission = Boolean((prop as any)?.vatOnCommission);
          propertyRentResolved = Number((prop as any)?.rent || 0);
          if (propertyVatOnCommission) {
            propertyVatTreatment = String((prop as any)?.vatCommissionTreatment || '').toLowerCase() === 'inclusive'
              ? 'inclusive'
              : 'exclusive';
          }
          if (!resolvedOwnerId && (prop as any)?.ownerId) {
            resolvedOwnerId = String((prop as any).ownerId);
          }
        }
      }
      const isIntroduction = rentalTypeResolved === 'introduction';
      const levyAllocated = Number(combinedAllocation?.levyAllocated || 0);
      const vatPolicy = await resolveCommissionVatPolicy({
        companyId: String(user.companyId),
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        property: {
          vatOnCommission: propertyVatOnCommission,
          vatCommissionTreatment: propertyVatTreatment
        },
        requestedVatOnCommission: propertyVatOnCommission,
        requestedTreatment: propertyVatTreatment,
        commissionType: isIntroduction ? 'introduction' : 'management'
      });
      const blockedVatRate = centralVatRateBlock(vatPolicy);
      if (blockedVatRate) {
        return { error: { status: 400, code: blockedVatRate.code, message: blockedVatRate.message } };
      }
      const commissionVat = commissionVatFlagsFromPolicy(vatPolicy);
      propertyVatOnCommission = commissionVat.vatOnCommission;
      propertyVatTreatment = commissionVat.vatTreatment;
      if (vatPolicy.reviewRequired && vatPolicy.reviewReason) {
        await openReview({
          companyId: String(user.companyId),
          kind: vatPolicy.reviewReason,
          title: 'VAT on commission requires review',
          detail: vatPolicy.reason,
          propertyId: rawPropertyId
        });
      }

      const buildRentalCommission = async (commissionableRent: number) => {
        const result = await CommissionService.calculateForProperty({
          companyId: user.companyId,
          grossRent: commissionableRent,
          levy: 0,
          commissionPercentage: commissionPercentResolved,
          vatOnCommission: propertyVatOnCommission,
          vatTreatment: propertyVatTreatment,
          vatRate: commissionVat.vatRate,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date()
        });
        rentalVatOnCommission = result.vatOnCommission;
        rentalVatOnCommissionRate = Number(result.vatRate || 0);
        rentalVatCommissionTreatment = result.vatTreatment;
        return applyLevyPassThroughToSnapshot(result, commissionBaseAmount, levyAllocated);
      };

      // Compute server-enforced commission
      let computed: any = undefined;
      if (isRental && tenantObjectId && propertyObjectId) {
        if (isIntroduction) {
          const prepared = await prepareIntroductionRentalCommission({
            companyId: user.companyId,
            propertyId: propertyObjectId,
            tenantId: tenantObjectId,
            leaseId: rawLeaseId,
            rentAllocated: isDepositOnly ? 0 : Math.max(0, commissionBaseAmount),
            levyAllocated: isDepositOnly ? 0 : levyAllocated,
            vatOnCommission: propertyVatOnCommission,
            vatTreatment: propertyVatTreatment,
            vatRate: commissionVat.vatRate,
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            propertyRent: propertyRentResolved,
            rentUsed: typeof rentUsed === 'number' ? Number(rentUsed) : undefined
          });
          if (!prepared.ok) {
            return {
              error: {
                status: 400,
                code: prepared.code,
                message: prepared.message,
                missing: (prepared as any).missing,
                mismatches: (prepared as any).mismatches
              }
            };
          }
          resolvedIntroductionLeaseId = prepared.context.leaseId;
          rentalVatOnCommission = prepared.result.vatOnCommission;
          rentalVatOnCommissionRate = Number(prepared.result.vatRate || 0);
          rentalVatCommissionTreatment = prepared.result.vatTreatment;
          computed = prepared.snapshot;
        } else {
          // Management (or unknown): standard commission on rent portion only (advance supported)
          computed = await buildRentalCommission(Math.max(0, commissionBaseAmount));
        }
      } else {
        // Non-rental or insufficient linkage: default to standard on amount (safe)
        computed = await buildRentalCommission(Math.max(0, amountNum));
        if (!isRental) {
          computed.ownerAmount = roundMoney(Math.max(0, amountNum - Number(computed.totalCommission || 0) - Number(computed.vatAmount || 0)));
        }
      }

      // Always enforce server rule over client-provided commissionDetails.
      // A calculation failure must not save a completed payment with commission and VAT zeroed.
      finalCommissionDetails = stampVatDecision(computed, vatPolicy);
    }

    if (resolvedPaymentType === 'sale') {
      const saleCheck = validateSalePaymentCompleteness({
        amount: Number(amount || 0),
        commissionDetails: finalCommissionDetails
      });
      if (!saleCheck.ok) {
        return {
          error: {
            status: 400,
            code: SALE_PAYMENT_INCOMPLETE_CODE,
            message: SALE_PAYMENT_INCOMPLETE_MESSAGE,
            missing: saleCheck.missing
          }
        };
      }
    }

    // Remaining-balance enforcement for rental payments (single month) and advance-payment handling
    // Skip when combined allocation already validated rent+levy together.
    if (isRentalPayment && !combinedAllocation?.hasLevy) {
      const tenantObjectId = manualTenant ? undefined : (rawTenantId ? new mongoose.Types.ObjectId(rawTenantId) : undefined);
      const propertyObjectId = manualProperty ? undefined : (rawPropertyId ? new mongoose.Types.ObjectId(rawPropertyId) : undefined);
      const isAdvanceRental = typeof advanceMonthsPaid === 'number' && advanceMonthsPaid > 1;

      // For advance payments: require amount to equal rent × months when rent is known, and skip single-month cap
      if (isAdvanceRental) {
        let rentBaseline = typeof rentUsed === 'number' ? rentUsed : 0;
        // Try to fetch rent if not provided and a real property is present
        if (!rentBaseline && propertyObjectId) {
          try {
            const prop = await Property.findById(propertyObjectId).select('rent').lean();
            rentBaseline = Number((prop as any)?.rent || 0);
          } catch {}
        }
        if (rentBaseline > 0) {
          const expectedCents = Math.round(rentBaseline * 100) * Number(advanceMonthsPaid);
          const amountCents = Math.round((amount || 0) * 100);
          if (amountCents !== expectedCents) {
            return { error: { status: 400, message: `Amount must equal rent (${rentBaseline}) x months (${advanceMonthsPaid}) = ${(expectedCents/100).toFixed(2)}` } };
          }
        }
        if (tenantObjectId && propertyObjectId) {
          const coveredAdvance = await findCoveredAdvanceMonth({
            companyId: user.companyId,
            propertyId: propertyObjectId,
            tenantId: tenantObjectId,
            rentalPeriodMonth,
            rentalPeriodYear,
            advanceMonthsPaid,
            advancePeriodStart,
            advancePeriodEnd,
            leaseId: rawLeaseId,
            currency,
          });
          if ('error' in coveredAdvance) {
            return { error: { status: 400, code: 'RENTAL_PERIOD_REQUIRED', message: coveredAdvance.error } };
          }
          if (coveredAdvance.covered) {
            return { error: { status: 400, message: 'Overlapping advance payment already exists for this period.' } };
          }
        }
      } else {
        // Only enforce when both real tenant and property are present (single-month payment)
        if (tenantObjectId && propertyObjectId && rentalPeriodMonth && rentalPeriodYear) {
          const alreadyPaid = await sumRentalPeriodReservation({
            companyId: user.companyId,
            propertyId: propertyObjectId,
            tenantId: tenantObjectId,
            rentalPeriodYear,
            rentalPeriodMonth,
            leaseId: rawLeaseId,
            currency
          });
          // Determine monthly rent baseline for single-month enforcement
          let rentBaseline = typeof rentUsed === 'number' ? rentUsed : 0;
          if (!rentBaseline) {
            try {
              const prop = await Property.findById(propertyObjectId).select('rent').lean();
              rentBaseline = Number((prop as any)?.rent || 0);
            } catch {}
          }
          const rentCents = Math.round((rentBaseline || 0) * 100);
          const alreadyPaidCents = Math.round(alreadyPaid * 100);
          const remainingCents = rentCents - alreadyPaidCents;
          if (rentCents > 0) {
            const amountCents = Math.round((effectiveAmount || 0) * 100);
            const depositCents = Math.round((Number(depositAmount || 0)) * 100);
            const isDepositOnly = amountCents === 0 && depositCents > 0;
            if (!isDepositOnly) {
              if (remainingCents <= 0) {
                return { error: { status: 409, message: 'This month is fully paid. Change rental month.' } };
              }
              if (amountCents > remainingCents) {
                return { error: { status: 400, message: `Only ${(remainingCents/100).toFixed(2)} remains for this month. Enter an amount ≤ remaining.` } };
              }
            }
          }
        }
      }
    }

    // Determine provisional flags
    const markProvisional = Boolean(manualProperty || manualTenant);
    // Create payment record
    const payment = new Payment({
      paymentType: resolvedPaymentType,
      transactionDomain: resolvedPaymentType === 'sale' ? 'SALE' : 'RENTAL',
      propertyType: propertyType || 'residential',
      propertyId: manualProperty ? new mongoose.Types.ObjectId() : new mongoose.Types.ObjectId(rawPropertyId!), // Generate new ID for manual entries
      tenantId: manualTenant ? new mongoose.Types.ObjectId() : new mongoose.Types.ObjectId(rawTenantId!), // Generate new ID for manual entries
      agentId: new mongoose.Types.ObjectId(rawAgentId),
      companyId: new mongoose.Types.ObjectId(user.companyId),
      paymentDate: new Date(paymentDate),
      paymentMethod,
      amount: effectiveAmount,
      depositAmount: depositAmount || 0,
      paymentLines: normalizedPaymentLines?.map((line: any) => ({
        chargeTypeCode: line.chargeTypeCode,
        chargeTypeId: line.chargeTypeId,
        amount: line.amount,
        description: line.description,
        referenceId: line.referenceId,
        metadata: line.metadata
      })),
      rentalPeriodMonth,
      rentalPeriodYear,
      referenceNumber: referenceNumber || `RCPT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      notes: notes || '',
      processedBy: new mongoose.Types.ObjectId(rawProcessedBy),
      commissionDetails: finalCommissionDetails,
      applyVatOnCommission: rentalVatOnCommission,
      vatOnCommissionRate: rentalVatOnCommissionRate,
      vatCommissionTreatment: rentalVatCommissionTreatment,
      status: 'completed',
      currency: currency || 'USD',
      leaseId: resolvedIntroductionLeaseId
        ? new mongoose.Types.ObjectId(resolvedIntroductionLeaseId)
        : (rawLeaseId ? new mongoose.Types.ObjectId(rawLeaseId) : undefined),
      rentUsed: combinedAllocation?.rentUsed ?? rentUsed,
      levyUsed: combinedAllocation?.levyUsed,
      rentAllocated: combinedAllocation ? combinedAllocation.rentAllocated : undefined,
      levyAllocated: combinedAllocation ? combinedAllocation.levyAllocated : undefined,
      advanceMonthsPaid: advanceMonthsPaid || 1,
      advancePeriodStart: advanceMonthsPaid && advanceMonthsPaid > 1 ? advancePeriodStart : undefined,
      advancePeriodEnd: advanceMonthsPaid && advanceMonthsPaid > 1 ? advancePeriodEnd : undefined,
      // Add manual entry fields
      manualPropertyAddress: manualProperty ? manualPropertyAddress : undefined,
      manualTenantName: manualTenant ? manualTenantName : undefined,
      // Provisional flags
      isProvisional: markProvisional,
      isInSuspense: markProvisional,
      commissionFinalized: !markProvisional,
      provisionalRelationshipType: markProvisional ? 'unknown' : undefined,
      ...initialAccountingIntegrityFields({
        status: 'completed',
        isProvisional: markProvisional,
        isInSuspense: markProvisional
      }),
      idempotencyKey: (req.body as any).idempotencyKey ? String((req.body as any).idempotencyKey) : undefined,
      saleId: rawSaleId ? new mongoose.Types.ObjectId(rawSaleId) : undefined,
    });
    // Save and related updates (with or without session)
    await payment.save(session ? { session } : undefined);

    // Create linked levy ledger entry when rent+levy combined
    if (combinedAllocation?.levyAllocated && combinedAllocation.levyAllocated > 0) {
      const levyId = await createLinkedLevyPayment(
        {
          _id: payment._id as mongoose.Types.ObjectId,
          propertyId: payment.propertyId,
          companyId: payment.companyId,
          paymentDate: payment.paymentDate,
          paymentMethod: payment.paymentMethod,
          currency: payment.currency,
          referenceNumber: payment.referenceNumber,
          notes: payment.notes,
          processedBy: payment.processedBy,
          levyAllocated: combinedAllocation.levyAllocated,
          levyUsed: combinedAllocation.levyUsed,
          rentalPeriodMonth: payment.rentalPeriodMonth,
          rentalPeriodYear: payment.rentalPeriodYear,
          advanceMonthsPaid: payment.advanceMonthsPaid,
          advancePeriodStart: payment.advancePeriodStart,
          advancePeriodEnd: payment.advancePeriodEnd,
        },
        session
      );
      if (levyId) {
        payment.linkedLevyPaymentId = levyId;
        await payment.save(session ? { session } : undefined);
      }
    }

    await logPaymentAudit({
      paymentId: String(payment._id),
      companyId: String(payment.companyId),
      action: String(payment.status || '') === 'completed' ? 'post' : 'create',
      newValues: paymentAuditSnapshot(payment),
      reason: payment.isProvisional ? 'Manual provisional entry' : 'Accountant payment creation',
      userId: user.userId
    });

    // If depositAmount > 0, record in rentaldeposits (ledger) — idempotent, session-aware
    if (payment.depositAmount && payment.depositAmount > 0) {
      await ensureDepositLedgerFromPayment(payment, session);
    }

    // Accounting is posted once after the Payment commit. Do not post inside this transaction.

    // Notify the primary agent (and split participants) when a completed sale payment is created
    try {
      if (!payment.isProvisional && (payment as any).paymentType === 'sale') {
        const recipientIds = new Set<string>();
        if (payment.agentId) recipientIds.add(String(payment.agentId));
        const split = ((payment as any).commissionDetails || (req.body as any).commissionDetails || {})?.agentSplit || {};
        if (split.ownerUserId) recipientIds.add(String(split.ownerUserId));
        if (split.collaboratorUserId) recipientIds.add(String(split.collaboratorUserId));
        const docs = Array.from(recipientIds).map((uid) => ({
          companyId: String((req.user as any).companyId),
          userId: new mongoose.Types.ObjectId(uid),
          title: 'Sale payment recorded',
          message: `Reference ${payment.referenceNumber} · Amount ${payment.amount} ${payment.currency || 'USD'}`,
          link: '/sales-dashboard/notifications',
          payload: { paymentId: payment._id, paymentType: payment.paymentType, skipEmail: true }
        }));
        if (docs.length) {
          const saved = await Notification.insertMany(docs);
          try {
            const { getIo } = await import('../config/socket');
            const io = getIo();
            if (io) {
              for (const n of saved) {
                io.to(`user-${String((n as any).userId)}`).emit('newNotification', n);
              }
            }
          } catch {}
        }
      }
    } catch (e) {
      console.warn('Non-fatal: failed to create agent notification for payment', e);
    }

    // Notify the primary agent (and split participants) when a completed rental payment is created
    try {
      if (!payment.isProvisional && (payment as any).paymentType === 'rental') {
        const recipientIds = new Set<string>();
        if (payment.agentId) recipientIds.add(String(payment.agentId));
        const split = ((payment as any).commissionDetails || (req.body as any).commissionDetails || {})?.agentSplit || {};
        if (split.ownerUserId) recipientIds.add(String(split.ownerUserId));
        if (split.collaboratorUserId) recipientIds.add(String(split.collaboratorUserId));
        const docs = Array.from(recipientIds).map((uid) => ({
          companyId: String((req.user as any).companyId),
          userId: new mongoose.Types.ObjectId(uid),
          title: 'Rental payment recorded',
          message: `Reference ${payment.referenceNumber} · Amount ${payment.amount} ${payment.currency || 'USD'}`,
          link: '/sales-dashboard/notifications',
          payload: { paymentId: payment._id, paymentType: payment.paymentType, skipEmail: true }
        }));
        if (docs.length) {
          const saved = await Notification.insertMany(docs);
          try {
            const { getIo } = await import('../config/socket');
            const io = getIo();
            if (io) {
              for (const n of saved) {
                io.to(`user-${String((n as any).userId)}`).emit('newNotification', n);
              }
            }
          } catch {}
        }
      }
    } catch (e) {
      console.warn('Non-fatal: failed to create agent notification for rental payment', e);
    }

    // Email agent with payment details when payment is finalized (fire-and-forget)
    if (!payment.isProvisional) {
      void sendAgentPaymentNotificationEmail(payment);
    }

    return { payment };
  };

  const bodyId = (value: any) => {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') return value._id || value.id;
    return undefined;
  };
  let session: mongoose.ClientSession | null = null;
  let useTransaction = false;
  let releaseAccountantGuard: () => Promise<void> = async () => {};

  try {
    releaseAccountantGuard = await acquireRentalPeriodGuardsForPayment({
      companyId: currentUser.companyId,
      propertyId: bodyId((req.body as any).propertyId),
      tenantId: bodyId((req.body as any).tenantId),
      rentalPeriodYear: (req.body as any).rentalPeriodYear,
      rentalPeriodMonth: (req.body as any).rentalPeriodMonth,
      advanceMonthsPaid: (req.body as any).advanceMonthsPaid,
      advancePeriodStart: (req.body as any).advancePeriodStart,
      advancePeriodEnd: (req.body as any).advancePeriodEnd,
      paymentType: (req.body as any).paymentType || 'rental',
      amount: (req.body as any).amount,
      depositAmount: (req.body as any).depositAmount,
      leaseId: bodyId((req.body as any).leaseId),
      currency: (req.body as any).currency,
    });
    // Try to use a transaction; if unsupported, we will fallback
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (e) {
      console.warn('Transactions not supported or failed to start. Proceeding without transaction.', e);
    }

    const result: CreateResult = await performCreate(currentUser, session || undefined);
    if ('error' in result && result.error) {
      return res.status(result.error.status).json({
        status: 'error',
        success: false,
        message: result.error.message,
        ...(result.error.code ? { code: result.error.code } : {}),
        ...(result.error.missing ? { missing: result.error.missing } : {}),
        ...(result.error.mismatches ? { mismatches: result.error.mismatches } : {})
      });
    }

    if (useTransaction && session) {
      await session.commitTransaction();
    }

    if ('payment' in result) {
      let accountingReceipt: { accountingComplete: boolean; accountingStatus: string } | undefined;
      if ((result.payment as any)?.status === 'completed' && !(result.payment as any)?.isProvisional) {
        accountingReceipt = await ensurePaymentAccountingPosted(String((result.payment as any)._id), { createdBy: currentUser.userId });
        await emitPaymentConfirmedIfNeeded(result.payment as any, 'payment.create.accountant');
        if (accountingReceipt?.accountingComplete === true) {
          void notifyOwnerOfRentPayment(result.payment as any, { accountingComplete: true });
        }
      }
      return res.status(201).json({
        message: 'Payment processed successfully',
        payment: result.payment,
        receiptStatus: 'PAYMENT_RECEIVED',
        accountingComplete: accountingReceipt?.accountingComplete === true,
        accountingStatus: accountingReceipt?.accountingStatus || 'incomplete',
        accountingState: accountingReceipt?.accountingComplete ? 'ACCOUNTING_COMPLETE' : 'ACCOUNTING_INCOMPLETE'
      });
    }
    return res.status(500).json({ message: 'Unknown error creating payment' });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode || 400).json({ message: error.message, code: error.code || 'VAT_RATE_UNAVAILABLE' });
    }
    if (useTransaction && session) {
      try { await session.abortTransaction(); } catch {}
    }
    // Fallback: if error is due to transactions not supported, retry without session
    if (error?.code === 20 /* IllegalOperation */ || /Transaction numbers are only allowed/.test(String(error?.message))) {
      try {
        const result: CreateResult = await performCreate(currentUser);
        if ('error' in result && result.error) {
          return res.status(result.error.status).json({
            status: 'error',
            success: false,
            message: result.error.message,
            ...(result.error.code ? { code: result.error.code } : {}),
            ...(result.error.missing ? { missing: result.error.missing } : {}),
        ...(result.error.mismatches ? { mismatches: result.error.mismatches } : {})
          });
        }
        if ('payment' in result) {
          let accountingReceipt: { accountingComplete: boolean; accountingStatus: string } | undefined;
          if ((result.payment as any)?.status === 'completed' && !(result.payment as any)?.isProvisional) {
            accountingReceipt = await ensurePaymentAccountingPosted(String((result.payment as any)._id), { createdBy: currentUser.userId });
            await emitPaymentConfirmedIfNeeded(result.payment as any, 'payment.create.accountant');
            if (accountingReceipt?.accountingComplete === true) {
          void notifyOwnerOfRentPayment(result.payment as any, { accountingComplete: true });
        }
          }
          return res.status(201).json({
            message: 'Payment processed successfully',
            payment: result.payment,
            receiptStatus: 'PAYMENT_RECEIVED',
            accountingComplete: accountingReceipt?.accountingComplete === true,
            accountingStatus: accountingReceipt?.accountingStatus || 'incomplete',
            accountingState: accountingReceipt?.accountingComplete ? 'ACCOUNTING_COMPLETE' : 'ACCOUNTING_INCOMPLETE'
          });
        }
        return res.status(500).json({ message: 'Unknown error creating payment' });
      } catch (fallbackErr: any) {
        console.error('Fallback create payment failed:', fallbackErr);
        return res.status(500).json({
          message: 'Failed to process payment',
          error: fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error',
        });
      }
    }
    console.error('Error processing payment:', error);
    return res.status(500).json({
      message: 'Failed to process payment',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    await releaseAccountantGuard();
    if (session) {
      try { session.endSession(); } catch {}
    }
  }
};

// Create a sales payment explicitly (no rental validations, paymentType fixed to 'introduction')
export const createSalesPaymentAccountant = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const user = req.user as JwtPayload;
    const {
      paymentDate,
      paymentMethod,
      amount,
      referenceNumber,
      notes,
      currency,
      commissionDetails,
      manualPropertyAddress,
      manualTenantName,
      buyerName,
      sellerName,
      propertyId,
      tenantId,
      agentId,
      processedBy,
      saleId,
      rentalPeriodMonth,
      rentalPeriodYear,
      saleMode,
      developmentId,
      developmentUnitId,
      vatIncluded,
      vatRate,
      applyVatOnCommission,
      vatOnCommissionRate
    } = req.body as any;
    const saleVatPolicy = await resolveSaleVatPolicy({
      companyId: String(user.companyId),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      vatIncludedRequested: Boolean(vatIncluded)
    });
    const normalizedVatIncluded = Boolean(vatIncluded) && saleVatPolicy.apply;
    const blockedSaleVat = centralVatRateBlock(saleVatPolicy);
    if (blockedSaleVat) {
      return res.status(400).json({ message: blockedSaleVat.message, code: blockedSaleVat.code });
    }
    const saleVatRate = saleVatPolicy.apply ? saleVatPolicy.vatRate : 0;
    if (saleVatPolicy.reviewRequired && saleVatPolicy.reviewReason) {
      await openReview({
        companyId: String(user.companyId),
        kind: saleVatPolicy.reviewReason,
        title: 'Sale VAT applicability requires review',
        detail: saleVatPolicy.reason
      });
    }
    const normalizedApplyVatOnCommission = Boolean(applyVatOnCommission);
    const grossAmount = Number(amount || 0);
    const vatAmount = normalizedVatIncluded && saleVatRate > 0
      ? Number((grossAmount - (grossAmount / (1 + saleVatRate))).toFixed(2))
      : 0;
    const taxableAmountForAllocation = Number((grossAmount - vatAmount).toFixed(2));


    if (!amount || !paymentDate || !paymentMethod) {
      return res.status(400).json({ message: 'Missing required fields: amount, paymentDate, paymentMethod' });
    }

    const headerKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key']) as string | undefined;
    if (headerKey && !(req.body as any).idempotencyKey) {
      (req.body as any).idempotencyKey = String(headerKey);
    }
    const salesIdempotencyKey = (req.body as any).idempotencyKey
      ? String((req.body as any).idempotencyKey)
      : undefined;
    if (salesIdempotencyKey) {
      const existingSalesPayment = await findLiveIdempotentPayment({
        companyId: user.companyId,
        idempotencyKey: salesIdempotencyKey
      });
      if (existingSalesPayment) {
        return res.status(200).json({
          message: 'Sales payment processed successfully',
          payment: existingSalesPayment
        });
      }
    }

    const toObjectId = (v?: string) => (v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : undefined);
    const propId = toObjectId(propertyId);
    const tenId = toObjectId(tenantId);
    // Prefer explicit agentId when provided. For non-development sales, fallback to property's assigned agent.
    // Avoid blindly defaulting to the current user for sales to prevent mis-crediting commissions.
    let agId = toObjectId(agentId);
    const procBy = toObjectId(processedBy) || new mongoose.Types.ObjectId(user.userId);
    const saleObjId = toObjectId(saleId);
    const devId = toObjectId(developmentId);
    const unitId = toObjectId(developmentUnitId);

    // If no agent provided and this is a non-development sale, try to derive from property
    if (!agId && !devId && propId) {
      try {
        const prop = await Property.findById(propId).select('agentId').lean();
        if (prop && (prop as any).agentId) {
          agId = new mongoose.Types.ObjectId(String((prop as any).agentId));
        }
      } catch {
        // ignore and enforce requirement below
      }
    }
    // Require an explicit/derived agent for non-development sales to ensure commission is credited correctly
    if (!agId) {
      return res.status(400).json({ message: 'Sales agent is required for this sale payment' });
    }

    // Optional validation: if development/unit provided, ensure they belong to the same company and match
    let devAddressForManual: string | undefined;
    if (devId) {
      const dev = await (await import('../models/Development')).Development.findOne({ _id: devId, companyId: new mongoose.Types.ObjectId(user.companyId) }).lean();
      if (!dev) {
        return res.status(400).json({ message: 'Invalid developmentId' });
      }
      // Enforce createdBy exists (owner) and the agent is either owner or collaborator
      const devOwnerUserId = (dev as any).createdBy ? new mongoose.Types.ObjectId((dev as any).createdBy) : undefined;
      if (!devOwnerUserId) {
        return res.status(400).json({ message: 'Development owner not set; cannot process sales payment' });
      }
      const isOwnerAgent = String(devOwnerUserId) === String(agId);
      const isCollabAgent = Array.isArray((dev as any).collaborators) && (dev as any).collaborators.map(String).includes(String(agId));
      if (!isOwnerAgent && !isCollabAgent) {
        return res.status(400).json({ message: 'Agent must be development owner or collaborator to process sale for this development' });
      }
      devAddressForManual = [dev.name, (dev as any).address].filter(Boolean).join(' - ');
      if (unitId) {
        const unit = await (await import('../models/DevelopmentUnit')).DevelopmentUnit.findOne({ _id: unitId, developmentId: devId }).lean();
        if (!unit) {
          return res.status(400).json({ message: 'Selected unit does not belong to the selected development' });
        }
      }
    } else if (unitId) {
      // If only unitId provided, still verify it exists and derive development for consistency
      const unit = await (await import('../models/DevelopmentUnit')).DevelopmentUnit.findOne({ _id: unitId }).lean();
      if (!unit) {
        return res.status(400).json({ message: 'Invalid developmentUnitId' });
      }
      const dev = await (await import('../models/Development')).Development.findOne({ _id: (unit as any).developmentId, companyId: new mongoose.Types.ObjectId(user.companyId) }).lean();
      if (!dev) {
        return res.status(400).json({ message: 'Unit belongs to a development not accessible in this company' });
      }
      devAddressForManual = [dev.name, (dev as any).address].filter(Boolean).join(' - ');
    }

    // Calculate commission if not provided
    let finalCommissionDetails = commissionDetails;
    if (!finalCommissionDetails) {
      try {
        let percent = 15;
        if (propId) {
          const prop = await Property.findById(propId);
          percent = typeof prop?.commission === 'number' ? (prop as any).commission : 15;
        }
        finalCommissionDetails = await CommissionService.calculate(
          taxableAmountForAllocation,
          percent,
          new mongoose.Types.ObjectId(user.companyId)
        ) as any;
      } catch {
        const fallback = (await import('../utils/money')).computeCommissionFallback(taxableAmountForAllocation, 15);
        finalCommissionDetails = {
          totalCommission: fallback.totalCommission,
          preaFee: fallback.preaFee,
          agentShare: fallback.agentShare,
          agencyShare: fallback.agencyShare,
          ownerAmount: fallback.ownerAmount,
        } as any;
      }
    }

    let normalizedVatOnCommissionRate = 0;
    {
      const commissionVatPolicy = await resolveCommissionVatPolicy({
        companyId: String(user.companyId),
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        requestedVatOnCommission: normalizedApplyVatOnCommission,
        requestedTreatment: 'exclusive'
      });
      const blockedCommissionVat = centralVatRateBlock(commissionVatPolicy);
      if (blockedCommissionVat) {
        return res.status(400).json({ message: blockedCommissionVat.message, code: blockedCommissionVat.code });
      }
      const applyCommissionVat = Boolean(normalizedApplyVatOnCommission) && commissionVatPolicy.apply;
      const vatRate = applyCommissionVat ? commissionVatPolicy.vatRate : 0;
      normalizedVatOnCommissionRate = vatRate;
      const commissionBase = Number(((finalCommissionDetails as any)?.totalCommission) || 0);
      const vatOnCommission = applyCommissionVat ? roundMoney(commissionBase * vatRate) : 0;
      (finalCommissionDetails as any).vatOnCommission = vatOnCommission;
      (finalCommissionDetails as any).ownerAmount = roundMoney(taxableAmountForAllocation - commissionBase - vatOnCommission);
    }

    // If development and agent are provided, and the agent is a collaborator on that development,
    // split the agentShare between development owner (creator) and the collaborator using development's split config.
    // If the agent is the owner, 100% of agentShare goes to owner by default.
    let ownerAgentIncrement = 0;
    let collaboratorAgentIncrement = 0;
    if (devId && agId) {
      const dev = await (await import('../models/Development')).Development.findOne({ _id: devId, companyId: new mongoose.Types.ObjectId(user.companyId) }).lean();
      if (dev) {
        const devOwnerUserId = (dev as any).createdBy ? new mongoose.Types.ObjectId((dev as any).createdBy) : undefined;
        const isOwnerAgent = devOwnerUserId && (String(devOwnerUserId) === String(agId));
        const isCollaborator = Array.isArray((dev as any).collaborators) && (dev as any).collaborators.map(String).includes(String(agId));
        if (isOwnerAgent) {
          // Entire agentShare to owner
          const agentShare = (finalCommissionDetails as any).agentShare || 0;
          (finalCommissionDetails as any).agentSplit = {
            ownerAgentShare: agentShare,
            collaboratorAgentShare: 0,
            ownerUserId: devOwnerUserId!,
            collaboratorUserId: undefined,
            splitPercentOwner: 100,
            splitPercentCollaborator: 0
          };
          ownerAgentIncrement = agentShare;
          collaboratorAgentIncrement = 0;
        } else if (isCollaborator && devOwnerUserId) {
          const agentShare = (finalCommissionDetails as any).agentShare || 0;
          const ownerPct = Math.max(0, Math.min(100, Number((dev as any).collabOwnerAgentPercent ?? 50)));
          const collabPct = Math.max(0, Math.min(100, Number((dev as any).collabCollaboratorAgentPercent ?? (100 - ownerPct))));
          const ownerShare = agentShare * (ownerPct / 100);
          const collaboratorShare = agentShare * (collabPct / 100);
          // Record split details
          (finalCommissionDetails as any).agentSplit = {
            ownerAgentShare: ownerShare,
            collaboratorAgentShare: collaboratorShare,
            ownerUserId: devOwnerUserId,
            collaboratorUserId: agId,
            splitPercentOwner: ownerPct,
            splitPercentCollaborator: collabPct
          };
          ownerAgentIncrement = ownerShare;
          collaboratorAgentIncrement = collaboratorShare;
          // Ensure agentShare stays the same total (owner+collaborator)
          (finalCommissionDetails as any).agentShare = ownerShare + collaboratorShare;
        }
      }
    }

    const manualProperty = !propId && manualPropertyAddress;
    const manualTenant = !tenId && manualTenantName;

    // Sanitize agentSplit: keep only for valid development splits; remove for non-development or empty splits
    try {
      if (!devId && (finalCommissionDetails as any)?.agentSplit) {
        delete (finalCommissionDetails as any).agentSplit;
      } else if ((finalCommissionDetails as any)?.agentSplit) {
        const split = (finalCommissionDetails as any).agentSplit as any;
        const ownerAmtOk = Number(split?.ownerAgentShare || 0) > 0 && !!split?.ownerUserId;
        const collabAmtOk = Number(split?.collaboratorAgentShare || 0) > 0 && !!split?.collaboratorUserId;
        if (!ownerAmtOk && !collabAmtOk) {
          delete (finalCommissionDetails as any).agentSplit;
        }
      }
    } catch { /* no-op */ }

    const saleCompleteness = validateSalePaymentCompleteness({
      amount: grossAmount,
      commissionDetails: finalCommissionDetails
    });
    if (!saleCompleteness.ok) {
      return res.status(400).json(salePaymentIncompleteResponse(saleCompleteness.missing));
    }

    if (!propId && !devId && !unitId) {
      return res.status(400).json({
        code: 'SALE_CONTEXT_REQUIRED',
        message: 'A sale payment requires a property, development, or unit.'
      });
    }
    if (propId) {
      const saleProperty = await Property.findOne({
        _id: propId,
        companyId: new mongoose.Types.ObjectId(user.companyId)
      }).select('rentalType').lean();
      if (!saleProperty) {
        return res.status(400).json({ message: 'Property not found for this sale payment' });
      }
      try {
        resolveCreateTransactionDomain({
          paymentType: 'sale',
          entity: { kind: 'property', rentalType: (saleProperty as any).rentalType }
        });
      } catch (domainError) {
        if (domainError instanceof AccountingClassificationConflictError) {
          return res.status(409).json(domainError.toBody());
        }
        throw domainError;
      }
    }

    const jsDate = new Date(paymentDate);
    const periodMonth = Number(rentalPeriodMonth ?? (jsDate.getMonth() + 1));
    const periodYear = Number(rentalPeriodYear ?? jsDate.getFullYear());

    const payment = new Payment({
      paymentType: 'sale',
      transactionDomain: 'SALE',
      saleMode: (saleMode === 'installment' ? 'installment' : 'quick'),
      propertyType: 'residential',
      propertyId: propId,
      tenantId: tenId,
      agentId: agId,
      companyId: new mongoose.Types.ObjectId(user.companyId),
      paymentDate: new Date(paymentDate),
      paymentMethod,
      amount,
      depositAmount: 0,
      referenceNumber: referenceNumber || `SALE-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      notes: notes || '',
      processedBy: procBy,
      commissionDetails: finalCommissionDetails,
      vatIncluded: normalizedVatIncluded,
      vatRate: normalizedVatIncluded ? saleVatRate : 0,
      vatAmount,
      applyVatOnCommission: normalizedApplyVatOnCommission,
      vatOnCommissionRate: normalizedVatOnCommissionRate,
      status: 'completed',
      ...initialAccountingIntegrityFields({ status: 'completed' }),
      currency: currency || 'USD',
      rentalPeriodMonth: periodMonth,
      rentalPeriodYear: periodYear,
      // Manual fields
      manualPropertyAddress: manualProperty ? (manualPropertyAddress || devAddressForManual) : (devAddressForManual || undefined),
      manualTenantName: manualTenant ? manualTenantName : undefined,
      buyerName: buyerName || (manualTenant ? manualTenantName : undefined),
      sellerName: sellerName,
      // Sales linkage
      saleId: saleObjId,
      developmentId: devId,
      developmentUnitId: unitId,
      idempotencyKey: salesIdempotencyKey
    });

    // Critical writes: keep payment insert and company revenue increment atomic where possible.
    let session: mongoose.ClientSession | null = null;
    let usedTransaction = false;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      usedTransaction = true;
      await payment.save({ session });
      await session.commitTransaction();
    } catch (txErr: any) {
      if (usedTransaction && session) {
        try { await session.abortTransaction(); } catch {}
      }
      if (txErr?.code === 11000 && salesIdempotencyKey) {
        const existingDup = await Payment.findOne({
          companyId: new mongoose.Types.ObjectId(user.companyId),
          idempotencyKey: salesIdempotencyKey
        }).lean();
        if (existingDup) {
          return res.status(200).json({
            message: 'Sales payment processed successfully',
            payment: existingDup
          });
        }
      }
      // Some deployments do not support transactions; fallback to non-transactional writes.
      if (txErr?.code === 20 || /Transaction numbers are only allowed/.test(String(txErr?.message || ''))) {
        await payment.save();
      } else {
        throw txErr;
      }
    } finally {
      if (session) {
        try { session.endSession(); } catch {}
      }
    }

    const postResult = await ensurePaymentAccountingPosted(payment._id.toString(), { createdBy: user.userId });
    if (postResult.recon.status !== 'complete' && postResult.recon.status !== 'not_applicable') {
      console.warn('Payment accounting post incomplete (sales create)', postResult.recon.missing);
    }
    await emitPaymentConfirmedIfNeeded(payment, 'payment.create.sales');

    // Notify the primary agent and split participants for completed sale payment
    try {
      const recipientIds = new Set<string>();
      if (payment.agentId) recipientIds.add(String(payment.agentId));
      const split = ((finalCommissionDetails as any)?.agentSplit) || {};
      if (split.ownerUserId) recipientIds.add(String(split.ownerUserId));
      if (split.collaboratorUserId) recipientIds.add(String(split.collaboratorUserId));
      if (recipientIds.size > 0) {
        const docs = Array.from(recipientIds).map((uid) => ({
          companyId: String((user as any).companyId),
          userId: new mongoose.Types.ObjectId(uid),
          title: 'Sale payment recorded',
          message: `Reference ${payment.referenceNumber} · Amount ${payment.amount} ${payment.currency || 'USD'}`,
          link: '/sales-dashboard/notifications',
          payload: { paymentId: payment._id, paymentType: payment.paymentType }
        }));
        const saved = await Notification.insertMany(docs);
        try {
          const { getIo } = await import('../config/socket');
          const io = getIo();
          if (io) {
            for (const n of saved) {
              io.to(`user-${String((n as any).userId)}`).emit('newNotification', n);
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Non-fatal: failed to create agent/split notifications for sale payment', e);
    }

    return res.status(201).json({
      message: 'Sales payment processed successfully',
      payment,
      receiptStatus: 'PAYMENT_RECEIVED',
      accountingComplete: postResult.accountingComplete,
      accountingStatus: postResult.accountingStatus,
      accountingState: postResult.accountingComplete ? 'ACCOUNTING_COMPLETE' : 'ACCOUNTING_INCOMPLETE'
    });
  } catch (error: any) {
    console.error('Error creating sales payment:', error);
    return res.status(500).json({ message: 'Failed to process sales payment', error: error?.message || 'Unknown error' });
  }
};

export const updatePayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payment = await Payment.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const requestedStatus = String((req.body as any)?.status || payment.status || '').toLowerCase();
    if (requestedStatus === 'completed' || String((req.body as any)?.postingStatus || '') === 'posted') {
      await assertCorrectionDraftCanComplete(payment, String(req.user.companyId));
    }

    if (isCompletedFinancialPayment(payment)) {
      return res.status(409).json({ message: COMPLETED_PAYMENT_IMMUTABLE_MESSAGE });
    }
    if (String((payment as any).postingStatus || '') !== 'draft') {
      return res.status(409).json({ message: 'Only draft payments can be edited. Reverse posted payments instead.' });
    }
    if (isAccountingPeriodLocked(payment.paymentDate)) {
      return res.status(409).json({ message: 'Accounting period is locked. Post an adjustment entry instead.' });
    }
    try {
      await assertVatPeriodOpen(String(req.user.companyId), new Date(payment.paymentDate as any));
    } catch (error: any) {
      return res.status(error?.statusCode || 409).json({ message: error?.message || 'VAT period is locked.' });
    }

    const before = paymentAuditSnapshot(payment);
    const previousStatus = String(payment.status || '').toLowerCase();
    const editableFields = new Set([
      'paymentDate', 'paymentMethod', 'amount', 'depositAmount', 'referenceNumber', 'notes', 'currency',
      'rentalPeriodMonth', 'rentalPeriodYear', 'advanceMonthsPaid', 'advancePeriodStart', 'advancePeriodEnd',
      'manualPropertyAddress', 'manualTenantName', 'buyerName', 'sellerName', 'status', 'postingStatus',
      'commissionDetails', 'vatIncluded', 'vatRate', 'vatAmount', 'applyVatOnCommission', 'vatOnCommissionRate', 'vatCommissionTreatment'
    ]);
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!editableFields.has(k)) continue;
      (payment as any)[k] = v;
    }

    if ((payment as any).paymentType === 'sale') {
      const grossAmount = Math.max(0, Number((payment as any).amount || 0));
      const rawDetails = (payment as any).commissionDetails || {};
      const totalCommission = Number(rawDetails?.totalCommission || 0);
      const explicitCommissionPercent =
        Number(req.body?.commissionPercent) > 0
          ? Number(req.body?.commissionPercent)
          : (() => {
              const saleVatRate = Math.max(0, Math.min(1, Number((payment as any).vatRate || 0)));
              const saleVatAmount = Boolean((payment as any).vatIncluded)
                ? Number((grossAmount - grossAmount / (1 + saleVatRate)).toFixed(2))
                : 0;
              const commissionBase = Math.max(0, Number((grossAmount - saleVatAmount).toFixed(2)));
              return commissionBase > 0
                ? Number(((totalCommission / commissionBase) * 100).toFixed(4))
                : undefined;
            })();
      const recomputed = await buildSaleCommissionDetails({
        amount: grossAmount,
        companyId: String((payment as any).companyId || req.user.companyId),
        propertyId: (payment as any).propertyId,
        vatIncluded: Boolean((payment as any).vatIncluded),
        vatRate: Number((payment as any).vatRate || 0),
        applyVatOnCommission: Boolean((payment as any).applyVatOnCommission),
        vatOnCommissionRate: Number((payment as any).vatOnCommissionRate ?? 0),
        existingSplit: rawDetails?.agentSplit,
        commissionPercentOverride: explicitCommissionPercent
      });
      (payment as any).commissionDetails = recomputed;
    }

    const nextStatus = String((payment as any).status || '').toLowerCase();
    if (String((payment as any).paymentType || '') === 'sale' && nextStatus === 'completed') {
      const saleCompleteness = validateSalePaymentCompleteness({
        amount: (payment as any).amount,
        commissionDetails: (payment as any).commissionDetails
      });
      if (!saleCompleteness.ok) {
        return res.status(400).json(salePaymentIncompleteResponse(saleCompleteness.missing));
      }
    }
    if (nextStatus === 'completed') {
      (payment as any).postingStatus = 'posted';
      if (previousStatus !== 'completed') {
        activateAccountingTrackingForCompletion(payment);
      }
    } else if (nextStatus === 'pending') {
      (payment as any).postingStatus = 'draft';
    } else if (nextStatus === 'failed') {
      (payment as any).postingStatus = 'voided';
    }
    await payment.save();

    if (previousStatus !== 'completed' && nextStatus === 'completed') {
      const postResult = await ensurePaymentAccountingPosted(String(payment._id), { createdBy: req.user.userId });
      if (postResult.recon.status !== 'complete' && postResult.recon.status !== 'not_applicable') {
        console.warn('Payment accounting post incomplete (update complete)', postResult.recon.missing);
      }
      if (postResult.accountingComplete === true) {
        void notifyOwnerOfRentPayment(payment, { accountingComplete: true });
      }
      await emitPaymentConfirmedIfNeeded(payment, 'payment.update');
      await logPaymentAudit({
        paymentId: String(payment._id),
        companyId: String(payment.companyId),
        action: 'post',
        oldValues: before,
        newValues: paymentAuditSnapshot(payment),
        reason: typeof req.body?.reason === 'string' ? req.body.reason : 'Draft correction completed',
        userId: req.user.userId
      });
    } else {
      await logPaymentAudit({
        paymentId: String(payment._id),
        companyId: String(payment.companyId),
        action: 'edit',
        oldValues: before,
        newValues: paymentAuditSnapshot(payment),
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        userId: req.user.userId
      });
    }

    res.json(payment);
  } catch (error: any) {
    console.error('Error updating payment:', error);
    const status = Number(error?.statusCode || 500);
    res.status(status >= 400 && status < 600 ? status : 500).json({
      message: error?.message || 'Error updating payment',
      code: error?.code
    });
  }
};

export const deletePayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payment = await Payment.findOne({
      _id: req.params.id,
      companyId: req.user.companyId
    });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    const postingStatus = String((payment as any).postingStatus || '');
    const legacyPosted = String(payment.status || '') === 'completed';
    if (postingStatus === 'posted' || postingStatus === 'reversed' || postingStatus === 'voided' || legacyPosted) {
      return res.status(409).json({ message: 'Posted payments cannot be deleted. Use reversal workflow.' });
    }
    if (isAccountingPeriodLocked(payment.paymentDate)) {
      return res.status(409).json({ message: 'Accounting period is locked. Draft cannot be deleted in this period.' });
    }

    const before = paymentAuditSnapshot(payment);
    await Payment.deleteOne({ _id: payment._id });
    await logPaymentAudit({
      paymentId: String(payment._id),
      companyId: String(payment.companyId),
      action: 'delete',
      oldValues: before,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      userId: req.user.userId
    });

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ message: 'Error deleting payment' });
  }
};

// Get all payments for a company
export const getCompanyPayments = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const query: any = { companyId: req.user.companyId };
    // Exclude provisional from company payments by default (visible in accountant page via dedicated filters)
    if (req.query.includeProvisional !== 'true') {
      query.isProvisional = { $ne: true };
    }
    // Optional: filter for deposits only
    if (req.query.onlyDeposits === 'true') {
      query.depositAmount = { $gt: 0 };
    }
    // Date filtering
    if (req.query.startDate || req.query.endDate) {
      query.paymentDate = {} as any;
      if (req.query.startDate) {
        (query.paymentDate as any).$gte = new Date(String(req.query.startDate));
      }
      if (req.query.endDate) {
        (query.paymentDate as any).$lte = new Date(String(req.query.endDate));
      }
    }
    // Status filter
    if (req.query.status) {
      applyPaymentStatusFilter(query, String(req.query.status));
    }
    // Payment type filter (e.g., rental-only accountant list)
    if (req.query.paymentType && typeof req.query.paymentType === 'string') {
      query.paymentType = req.query.paymentType;
    }
    // Payment method filter
    if (req.query.paymentMethod) {
      query.paymentMethod = req.query.paymentMethod;
    }
    // Property filter
    if (req.query.propertyId) {
      try {
        query.propertyId = new mongoose.Types.ObjectId(String(req.query.propertyId));
      } catch {
        // ignore invalid id
      }
    }

    // Global search (reference number, notes, and other textual fields)
    if (req.query.search && typeof req.query.search === 'string') {
      const search = String(req.query.search).trim();
      if (search) {
        const regex = new RegExp(search, 'i');
        query.$or = [
          { referenceNumber: { $regex: regex } },
          { notes: { $regex: regex } },
          { currency: { $regex: regex } },
          { paymentMethod: { $regex: regex } },
          { status: { $regex: regex } },
          { manualPropertyAddress: { $regex: regex } },
          { manualTenantName: { $regex: regex } },
          { buyerName: { $regex: regex } },
          { sellerName: { $regex: regex } },
        ];
      }
    }

    // Pagination controls
    const paginate = String(req.query.paginate || 'false') === 'true';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit || '25'), 10)));

    const baseQuery = Payment.find(query).sort({ paymentDate: -1 }).maxTimeMS(LIST_QUERY_MAX_TIME_MS);

    if (paginate) {
      const [items, total] = await Promise.all([
        baseQuery
          .select('paymentDate paymentType saleId propertyId amount depositAmount paymentMethod status postingStatus referenceNumber currency tenantId isProvisional manualPropertyAddress manualTenantName rentalPeriodMonth rentalPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd notes rentUsed reversalState reversalPaymentId reversalOfPaymentId correctedPaymentId')
          .populate('propertyId', 'name address rent')
          .lean()
          .skip((page - 1) * limit)
          .limit(limit),
        Payment.countDocuments(query).maxTimeMS(LIST_QUERY_MAX_TIME_MS),
      ]);
      // Compute outstanding amounts for current page
      try {
        const companyId = (req.user as any).companyId;
        // Prepare sales grouping keys
        const saleIdKeys = new Set<string>();
        const refKeys = new Set<string>();
        const manualAddrKeys = new Set<string>();
        // Prepare rental grouping keys (by period)
        type RentalKey = { propertyId: string; tenantId: string; year: number; month: number };
        const rentalKeys: RentalKey[] = [];
        const rentalKeySet = new Set<string>();
        for (const it of items as any[]) {
          const type = it?.paymentType;
          if (type === 'sale') {
            if (it?.saleId) {
              saleIdKeys.add(String(it.saleId));
            } else {
              if (it?.referenceNumber) refKeys.add(String(it.referenceNumber));
              if (it?.manualPropertyAddress) manualAddrKeys.add(String(it.manualPropertyAddress));
            }
          } else if (type === 'rental' || type === 'introduction' || type === 'management') {
            try {
              const propId = String((it?.propertyId as any)?._id || it?.propertyId || '');
              const tenantId = String((it?.tenantId as any)?._id || it?.tenantId || '');
              // Determine period: prefer explicit rental period, fall back to paymentDate
              const y = typeof it?.rentalPeriodYear === 'number' ? Number(it.rentalPeriodYear) : new Date(it.paymentDate).getFullYear();
              const m = typeof it?.rentalPeriodMonth === 'number' ? Number(it.rentalPeriodMonth) : (new Date(it.paymentDate).getMonth() + 1);
              if (propId && tenantId && Number.isFinite(y) && Number.isFinite(m)) {
                const key = `${propId}:${tenantId}:${y}:${m}`;
                if (!rentalKeySet.has(key)) {
                  rentalKeySet.add(key);
                  rentalKeys.push({ propertyId: propId, tenantId, year: y, month: m });
                }
              }
            } catch {
              // ignore malformed rental row
            }
          }
        }
        // Sales paid-to-date by saleId
        const paidBySaleId: Record<string, number> = {};
        if (saleIdKeys.size > 0) {
          const agg = await Payment.aggregate([
            { $match: { companyId: new mongoose.Types.ObjectId(String(companyId)), paymentType: 'sale', status: 'completed', saleId: { $in: Array.from(saleIdKeys).map(id => new mongoose.Types.ObjectId(String(id))) } } },
            { $group: { _id: '$saleId', totalPaid: { $sum: '$amount' } } }
          ]).option({ maxTimeMS: LIST_QUERY_MAX_TIME_MS });
          for (const row of agg) {
            paidBySaleId[String(row._id)] = Number(row.totalPaid || 0);
          }
        }
        // Sales paid-to-date by referenceNumber/manualPropertyAddress (loose grouping)
        const paidByLoose: Record<string, number> = {};
        if (refKeys.size > 0 || manualAddrKeys.size > 0) {
          const or: any[] = [];
          if (refKeys.size > 0) or.push({ referenceNumber: { $in: Array.from(refKeys) } });
          if (manualAddrKeys.size > 0) or.push({ manualPropertyAddress: { $in: Array.from(manualAddrKeys) } });
          const related = await Payment.find({
            companyId,
            paymentType: 'sale',
            status: 'completed',
            $or: or
          }).select('referenceNumber manualPropertyAddress amount').maxTimeMS(LIST_QUERY_MAX_TIME_MS).lean();
          for (const p of related as any[]) {
            const key = p.referenceNumber || p.manualPropertyAddress || '';
            if (!key) continue;
            paidByLoose[key] = (paidByLoose[key] || 0) + Number(p.amount || 0);
          }
        }
        // Rentals: paid-to-date by (propertyId, tenantId, year, month)
        const paidByRentalPeriod: Record<string, number> = {};
        if (rentalKeys.length > 0) {
          const covered = await coverageByRentalKeys(String(companyId), rentalKeys);
          Object.assign(paidByRentalPeriod, covered);
        }
        // Helper to parse total sale price
        const parseTotalSale = (notes: string | undefined): number | null => {
          if (!notes) return null;
          const m = String(notes).match(/Total\s+Sale\s+Price\s+([0-9,.]+)/i);
          if (m && m[1]) {
            const n = Number(m[1].replace(/,/g, ''));
            return Number.isFinite(n) ? n : null;
          }
          return null;
        };
        for (const it of items as any[]) {
          try {
            const type = it?.paymentType;
            if (type === 'sale') {
              const totalSale = parseTotalSale(it?.notes);
              if (totalSale != null) {
                let paidToDate = 0;
                if (it?.saleId) {
                  paidToDate = paidBySaleId[String(it.saleId)] || 0;
                } else {
                  const key = it?.referenceNumber || it?.manualPropertyAddress || '';
                  paidToDate = (paidByLoose[key] || 0) + (paidByLoose[`REV-${key}`] || 0) + (paidByLoose[`CORR-${key}`] || 0);
                }
                (it as any).outstanding = Math.max(0, totalSale - paidToDate);
              }
            } else if (type === 'rental' || type === 'introduction' || type === 'management') {
              // Determine period key for this row
              const propId = String((it?.propertyId as any)?._id || it?.propertyId || '');
              const tenantId = String((it?.tenantId as any)?._id || it?.tenantId || '');
              const y = typeof it?.rentalPeriodYear === 'number' ? Number(it.rentalPeriodYear) : new Date(it.paymentDate).getFullYear();
              const m = typeof it?.rentalPeriodMonth === 'number' ? Number(it.rentalPeriodMonth) : (new Date(it.paymentDate).getMonth() + 1);
              const key = `${propId}:${tenantId}:${y}:${m}`;
              // Compute expected rent
              const rentUsed = typeof it?.rentUsed === 'number' ? Number(it.rentUsed) : null;
              const rentFromProp = (it?.propertyId && typeof (it.propertyId as any).rent === 'number') ? Number((it.propertyId as any).rent) : null;
              const rentAmount = (rentUsed != null ? rentUsed : (rentFromProp != null ? rentFromProp : null));
              if (rentAmount != null && Number.isFinite(rentAmount)) {
                const paidToDate = paidByRentalPeriod[key] || 0;
                (it as any).outstanding = Math.max(0, rentAmount - paidToDate);
              }
            }
          } catch {
            // best-effort; skip item if any error
          }
        }
      } catch (calcErr) {
        console.warn('Failed to compute outstanding for payments page:', (calcErr as any)?.message || calcErr);
      }
      const pages = Math.max(1, Math.ceil(total / limit));
      return res.json({ items, total, page, pages });
    }

    // Non-paginated fallback (legacy)
    const unpaginatedLimit = Math.max(
      1,
      Math.min(NON_PAGINATED_PAYMENTS_LIMIT, Number(req.query.limit || NON_PAGINATED_PAYMENTS_LIMIT))
    );
    const payments = await baseQuery
      .populate('propertyId', 'name')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'name')
      .limit(unpaginatedLimit);

    if (payments.length === unpaginatedLimit) {
      res.setHeader('X-Result-Limit-Applied', String(unpaginatedLimit));
    }

    return res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      message: 'Failed to fetch payments',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get payment details
export const getPaymentDetails = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const payment = await Payment.findById(req.params.id)
      .populate('propertyId', 'name')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'name')
      .populate('processedBy', 'name');

    if (!payment || !(await paymentRecordVisible(req, payment))) {
      return res.status(404).json({
        message: 'Payment not found',
      });
    }

    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({
      message: 'Failed to fetch payment details',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export const getPaymentAccountingReconciliation = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const payment = await Payment.findById(req.params.id)
      .select('_id companyId tenantId propertyId leaseId paymentType status postingStatus accountingComplete accountingStatus referenceNumber currency')
      .lean();
    if (!payment || !(await paymentRecordVisible(req, payment as any))) return res.status(404).json({ message: 'Payment not found' });
    const recon = await reconcilePayment(String(payment._id));
    const { loadLegacyIntroductionContextRisk } = await import('../services/legacyIntroductionRisk');
    const { buildPaymentIntegrityDiagnostic, detectCurrencyMismatch } = await import('../services/paymentIntegrityDiagnostic');
    let legacyIntroductionRisk = null;
    try {
      legacyIntroductionRisk = await loadLegacyIntroductionContextRisk({
        companyId: (payment as any).companyId,
        tenantId: (payment as any).tenantId,
        propertyId: (payment as any).propertyId,
        leaseId: (payment as any).leaseId
      });
    } catch {
      legacyIntroductionRisk = null;
    }
    return res.json({
      ...recon,
      diagnostic: buildPaymentIntegrityDiagnostic({
        payment,
        recon,
        legacyIntroductionRisk,
        currencyFlag: detectCurrencyMismatch({
          paymentCurrency: (payment as any).currency
        })
      })
    });
  } catch (error) {
    console.error('Error reconciling payment accounting:', error);
    return res.status(500).json({ message: 'Failed to reconcile payment accounting' });
  }
};

export const repairPaymentAccountingExplicit = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const payment = await Payment.findById(req.params.id).select('_id companyId propertyId').lean();
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    if (String((payment as any).companyId) !== String(req.user.companyId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if ((payment as any).propertyId && !(await callerCanAccessProperty(req, String((payment as any).propertyId)))) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    const dryRun = !(req.body?.dryRun === false && req.body?.confirm === true);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!dryRun && !reason) {
      return res.status(400).json({ message: 'Manual accounting repair requires confirm=true, dryRun=false, and a non-empty reason' });
    }
    const result = await repairPaymentAccounting(String(payment._id), {
      dryRun,
      reason,
      userId: req.user.userId,
      createdBy: req.user.userId
    });
    return res.json(result);
  } catch (error) {
    console.error('Error repairing payment accounting:', error);
    return res.status(500).json({
      message: 'Failed to repair payment accounting',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Update payment status
export const updatePaymentStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const { status, reason } = req.body;

    if (!['pending', 'completed', 'failed', 'reversed'].includes(status)) {
      return res.status(400).json({
        message: 'Invalid status',
      });
    }

    const payment = await Payment.findById(req.params.id);

    if (!payment || !(await paymentRecordVisible(req, payment))) {
      return res.status(404).json({
        message: 'Payment not found',
      });
    }

    if (isAccountingPeriodLocked(payment.paymentDate) && status !== 'reversed') {
      return res.status(409).json({ message: 'Accounting period is locked. Post an adjustment entry instead.' });
    }
    if (status !== 'reversed') {
      try {
        await assertVatPeriodOpen(String(req.user.companyId), new Date(payment.paymentDate as any), { allowAdjustment: false });
      } catch (error: any) {
        return res.status(error?.statusCode || 409).json({ message: error?.message || 'VAT period is locked.' });
      }
    }

    if (status === 'reversed') {
      return res.status(400).json({ message: 'Use /payments/:id/reverse endpoint for reversals.' });
    }
    if (status === 'completed') {
      await assertCorrectionDraftCanComplete(payment, String(req.user.companyId));
      const looksLikeCorrection = Boolean((payment as any).isCorrectionEntry)
        || String((payment as any).referenceNumber || '').startsWith('CORR-');
      const paymentType = String((payment as any).paymentType || '');
      if (looksLikeCorrection && (paymentType === 'rental' || paymentType === 'introduction')) {
        if (!rentalCorrectionSnapshotAgrees((payment as any).commissionDetails, Number(payment.amount || 0))) {
          const built = await buildRentalCorrectionCommission(payment);
          if (!built.agrees) {
            throw new AppError(
              'Corrected payment commission snapshot does not reconcile.',
              409,
              'CORRECTION_SNAPSHOT_INCOMPLETE'
            );
          }
          (payment as any).commissionDetails = built.snapshot;
          (payment as any).applyVatOnCommission = built.applyVatOnCommission;
          (payment as any).vatOnCommissionRate = built.vatOnCommissionRate;
          if (built.vatCommissionTreatment) {
            (payment as any).vatCommissionTreatment = built.vatCommissionTreatment;
          }
        }
        (payment as any).commissionFinalized = true;
      }
    }
    if (isCompletedFinancialPayment(payment) && String(status) !== 'completed') {
      return res.status(409).json({ message: COMPLETED_PAYMENT_IMMUTABLE_MESSAGE });
    }

    const previousStatus = payment.status;
    const previousPostingStatus = (payment as any).postingStatus;
    const before = paymentAuditSnapshot(payment);
    payment.status = status;
    if (status === 'completed') {
      (payment as any).postingStatus = 'posted';
      if (previousStatus !== 'completed') {
        activateAccountingTrackingForCompletion(payment);
      }
    } else if (status === 'pending') {
      (payment as any).postingStatus = 'draft';
    } else if (status === 'failed') {
      (payment as any).postingStatus = 'voided';
      (payment as any).voidedAt = new Date();
      (payment as any).voidedBy = new mongoose.Types.ObjectId(req.user.userId);
      (payment as any).voidReason = reason || '';
    }
    await payment.save();

    if (previousStatus !== 'completed' && status === 'completed') {
      const postResult = await ensurePaymentAccountingPosted(String(payment._id), { createdBy: req.user.userId });
      if (postResult.recon.status !== 'complete' && postResult.recon.status !== 'not_applicable') {
        console.warn('Payment accounting post incomplete (status update)', postResult.recon.missing);
      }
      if (postResult.accountingComplete === true) {
        void notifyOwnerOfRentPayment(payment, { accountingComplete: true });
      }
      await emitPaymentConfirmedIfNeeded(payment, 'payment.status.updated');
      await logPaymentAudit({
        paymentId: String(payment._id),
        companyId: String(payment.companyId),
        action: 'post',
        oldValues: { ...before, previousPostingStatus },
        newValues: paymentAuditSnapshot(payment),
        reason: typeof reason === 'string' ? reason : undefined,
        userId: req.user.userId
      });
    } else {
      await logPaymentAudit({
        paymentId: String(payment._id),
        companyId: String(payment.companyId),
        action: status === 'failed' ? 'void' : 'edit',
        oldValues: before,
        newValues: paymentAuditSnapshot(payment),
        reason: typeof reason === 'string' ? reason : undefined,
        userId: req.user.userId
      });
    }

    res.json({
      message: 'Payment status updated successfully',
      payment,
    });
  } catch (error: any) {
    console.error('Error updating payment status:', error);
    const statusCode = Number(error?.statusCode || 500);
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      message: error?.message || 'Failed to update payment status',
      code: error?.code
    });
  }
};

export const reversePayment = async (req: Request, res: Response) => {
  // Correction foundation: Original Payment → Reversal Payment → Correction draft.
  // Do not UPDATE the original completed Payment amount.
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  if (!hasFinancePrivileges(req.user)) {
    return res.status(403).json({ message: 'Only finance/admin roles can reverse posted payments.' });
  }

  const reason = String(req.body?.reason || '').trim();
  if (!reason) {
    return res.status(400).json({ message: 'Reversal reason is required.' });
  }

  const session = await mongoose.startSession();
  try {
    let resultPayload: any = null;
    const findOrCreateCorrectionDraft = async (source: any, dbSession?: any) => {
      if (source?.correctedPaymentId) {
        const linkedQuery = Payment.findOne({ _id: source.correctedPaymentId, companyId: source.companyId });
        const linked = dbSession ? await linkedQuery.session(dbSession) : await linkedQuery;
        if (linked) return linked;
      }
      const referenceNumber = `CORR-${String(source.referenceNumber || source._id)}`;
      const byRefQuery = Payment.findOne({
        companyId: source.companyId,
        referenceNumber,
        isCorrectionEntry: true,
        reversalOfPaymentId: { $exists: false }
      });
      const byRef = dbSession ? await byRefQuery.session(dbSession) : await byRefQuery;
      if (byRef) {
        await Payment.updateOne(
          { _id: source._id },
          { $set: { correctedPaymentId: byRef._id } },
          dbSession ? { session: dbSession } : undefined
        );
        return byRef;
      }
      const rentalCorrection = source.paymentType === 'rental' || source.paymentType === 'introduction';
      const builtCorrection = rentalCorrection ? await buildRentalCorrectionCommission(source) : null;
      const correctedCommissionDetails = builtCorrection
        ? builtCorrection.snapshot
        : await buildSaleCommissionDetails({
          amount: Math.max(0, Number(source.amount || 0)),
          companyId: String(source.companyId || ''),
          propertyId: source.propertyId,
          vatIncluded: Boolean(source.vatIncluded),
          vatRate: Number(source.vatRate || 0),
          applyVatOnCommission: Boolean(source.applyVatOnCommission),
          vatOnCommissionRate: Number(source.vatOnCommissionRate ?? 0),
          existingSplit: source?.commissionDetails?.agentSplit
        });
      const correctedDraft = new Payment({
        paymentType: source.paymentType,
        transactionDomain: historicalTransactionDomain(source) || undefined,
        saleMode: source.saleMode,
        propertyType: source.propertyType,
        propertyId: source.propertyId,
        tenantId: source.tenantId,
        agentId: source.agentId,
        companyId: source.companyId,
        paymentDate: source.paymentDate,
        paymentMethod: source.paymentMethod,
        amount: Number(source.amount || 0),
        depositAmount: Number(source.depositAmount || 0),
        referenceNumber,
        rentalPeriodMonth: source.rentalPeriodMonth,
        rentalPeriodYear: source.rentalPeriodYear,
        advanceMonthsPaid: source.advanceMonthsPaid,
        advancePeriodStart: source.advancePeriodStart,
        advancePeriodEnd: source.advancePeriodEnd,
        notes: `Correction draft for ${String(source.referenceNumber || source._id)}`,
        processedBy: new mongoose.Types.ObjectId(req.user!.userId),
        commissionDetails: correctedCommissionDetails,
        vatIncluded: source.vatIncluded,
        vatRate: source.vatRate,
        vatAmount: source.vatAmount,
        applyVatOnCommission: builtCorrection ? builtCorrection.applyVatOnCommission : source.applyVatOnCommission,
        vatOnCommissionRate: builtCorrection ? builtCorrection.vatOnCommissionRate : source.vatOnCommissionRate,
        vatCommissionTreatment: builtCorrection?.vatCommissionTreatment || source.vatCommissionTreatment,
        rentAllocated: source.rentAllocated,
        levyAllocated: source.levyAllocated,
        rentUsed: source.rentUsed,
        levyUsed: source.levyUsed,
        status: 'pending',
        postingStatus: 'draft',
        currency: source.currency,
        leaseId: source.leaseId,
        manualPropertyAddress: source.manualPropertyAddress,
        manualTenantName: source.manualTenantName,
        buyerName: source.buyerName,
        sellerName: source.sellerName,
        isCorrectionEntry: true,
        isProvisional: false,
        isInSuspense: false,
        commissionFinalized: Boolean(builtCorrection?.agrees),
        developmentId: source.developmentId,
        developmentUnitId: source.developmentUnitId,
        saleId: source.saleId
      });
      try {
        await correctedDraft.save(dbSession ? { session: dbSession } : undefined);
      } catch (saveError: any) {
        if (!isDuplicateKeyError(saveError)) throw saveError;
        const racedQuery = Payment.findOne({
          companyId: source.companyId,
          referenceNumber,
          isCorrectionEntry: true,
          reversalOfPaymentId: { $exists: false }
        });
        const raced = dbSession ? await racedQuery.session(dbSession) : await racedQuery;
        if (!raced) throw saveError;
        await Payment.updateOne(
          { _id: source._id },
          { $set: { correctedPaymentId: raced._id } },
          dbSession ? { session: dbSession } : undefined
        );
        return raced;
      }
      await Payment.updateOne(
        { _id: source._id },
        { $set: { correctedPaymentId: correctedDraft._id } },
        dbSession ? { session: dbSession } : undefined
      );
      return correctedDraft;
    };
    const applyReversal = async (opts?: { session?: any }) => {
      const dbSession = opts?.session;
      const originalQuery = Payment.findOne({
        _id: req.params.id,
        companyId: req.user!.companyId
      });
      const original = dbSession ? await originalQuery.session(dbSession) : await originalQuery;
      if (!original) {
        throw new AppError('Payment not found', 404);
      }
      if (isAccountingPeriodLocked(original.paymentDate)) {
        throw new AppError('Accounting period is locked. Only adjustment entries are allowed.', 409);
      }
      await assertVatPeriodOpen(String(req.user!.companyId), new Date(), { allowAdjustment: false });
      if (isReversalDocument(original)) {
        throw new AppError('Reversal payments cannot be reversed.', 409, 'REVERSAL_OF_REVERSAL');
      }

      const postingStatus = String((original as any).postingStatus || '');
      const isPosted = postingStatus === 'posted' || String(original.status || '') === 'completed';
      if (!isPosted) {
        throw new AppError('Only posted payments can be reversed.', 409);
      }
      const legacyReversed =
        String(original.status || '') === 'reversed' || String((original as any).postingStatus || '') === 'reversed';
      if ((original as any).reversalPaymentId || String((original as any).reversalState || '') === 'reversed' || legacyReversed) {
        const existingReversal = (original as any).reversalPaymentId
          ? await Payment.findById((original as any).reversalPaymentId)
          : await Payment.findOne({ reversalOfPaymentId: original._id, amount: { $lt: 0 } });
        if (!existingReversal) {
          throw new AppError('Payment is already reversed.', 409);
        }
        if (String((existingReversal as any).reversalOfPaymentId || '') !== String(original._id)) {
          throw new AppError('Existing reversal does not belong to this payment.', 409, 'REVERSAL_LINK_MISMATCH');
        }
        const correctedDraft = await findOrCreateCorrectionDraft(original, dbSession);
        resultPayload = {
          original,
          reversal: existingReversal,
          correctedDraft,
          alreadyReversed: true,
          skipAccounting: legacyReversed && String((original as any).reversalState || '') !== 'reversal_incomplete'
        };
        return;
      }

      // Atomic guard to prevent duplicate reversals under concurrent requests.
      // Only one request can transition this payment into the in-progress reversal state.
      const lockedQuery = Payment.findOneAndUpdate(
        {
          _id: original._id,
          companyId: req.user!.companyId,
          reversalPaymentId: { $exists: false },
          reversalState: { $nin: ['reversal_in_progress', 'reversal_incomplete', 'reversed'] },
          postingStatus: 'posted',
          status: 'completed'
        },
        {
          $set: {
            reversalState: 'reversal_in_progress',
            reversalLockAt: new Date(),
            reversalLockBy: new mongoose.Types.ObjectId(req.user!.userId)
          }
        },
        { new: true }
      );
      let lockedOriginal = dbSession ? await lockedQuery.session(dbSession) : await lockedQuery;
      if (!lockedOriginal) {
        const existingReversalQuery = Payment.findOne({
          reversalOfPaymentId: original._id,
          companyId: req.user!.companyId,
          amount: { $lt: 0 }
        });
        const existingReversal = dbSession ? await existingReversalQuery.session(dbSession) : await existingReversalQuery;
        if (existingReversal) {
          await Payment.updateOne(
            { _id: original._id, reversalPaymentId: { $exists: false } },
            { $set: { reversalPaymentId: existingReversal._id, reversalState: 'reversal_in_progress' } },
            dbSession ? { session: dbSession } : undefined
          );
          const linkedQuery = Payment.findById(original._id);
          const linked = dbSession ? await linkedQuery.session(dbSession) : await linkedQuery;
          const correctedDraft = await findOrCreateCorrectionDraft(linked || original, dbSession);
          resultPayload = { original: linked, reversal: existingReversal, correctedDraft, alreadyReversed: true };
          return;
        }
        const currentQuery = Payment.findById(original._id);
        const current = dbSession ? await currentQuery.session(dbSession) : await currentQuery;
        const currentState = String((current as any)?.reversalState || '');
        if (currentState === 'reversal_incomplete') {
          throw new AppError(
            'Payment reversal is incomplete and must be recovered, not started again.',
            409,
            'REVERSAL_INCOMPLETE'
          );
        }
        if ((current as any)?.reversalPaymentId) {
          const reservedQuery = Payment.findById((current as any).reversalPaymentId);
          const reserved = dbSession ? await reservedQuery.session(dbSession) : await reservedQuery;
          if (reserved) {
            const correctedDraft = await findOrCreateCorrectionDraft(current || original, dbSession);
            resultPayload = { original: current, reversal: reserved, correctedDraft, alreadyReversed: true };
            return;
          }
          lockedOriginal = current;
        } else if (currentState === 'reversal_in_progress') {
          const claimQuery = Payment.findOneAndUpdate(
            {
              _id: original._id,
              companyId: req.user!.companyId,
              reversalPaymentId: { $exists: false },
              reversalState: 'reversal_in_progress'
            },
            {
              $set: {
                reversalState: 'reversal_in_progress',
                reversalLockAt: new Date(),
                reversalLockBy: new mongoose.Types.ObjectId(req.user!.userId)
              }
            },
            { new: true }
          );
          lockedOriginal = dbSession ? await claimQuery.session(dbSession) : await claimQuery;
        }
        if (!lockedOriginal) {
          const racedQuery = Payment.findOne({
            reversalOfPaymentId: original._id,
            companyId: req.user!.companyId,
            amount: { $lt: 0 }
          });
          const raced = dbSession ? await racedQuery.session(dbSession) : await racedQuery;
          if (raced) {
            const correctedDraft = await findOrCreateCorrectionDraft(current || original, dbSession);
            resultPayload = { original: current, reversal: raced, correctedDraft, alreadyReversed: true };
            return;
          }
          throw new AppError('Another reversal attempt is in progress for this payment.', 409, 'REVERSAL_IN_PROGRESS');
        }
      }

      throwOnceIfArmed(
        String(lockedOriginal._id),
        `${String((lockedOriginal as any).notes || '')} ${reason}`,
        'PHASE28_FAIL_BEFORE_REVERSAL_SAVE'
      );

      const before = paymentAuditSnapshot(original);

      let reversalId = (lockedOriginal as any).reversalPaymentId
        ? new mongoose.Types.ObjectId(String((lockedOriginal as any).reversalPaymentId))
        : new mongoose.Types.ObjectId();
      if (!(lockedOriginal as any).reversalPaymentId) {
        const reserveQuery = Payment.findOneAndUpdate(
          {
            _id: lockedOriginal._id,
            companyId: req.user!.companyId,
            reversalPaymentId: { $exists: false },
            reversalState: 'reversal_in_progress'
          },
          { $set: { reversalPaymentId: reversalId } },
          { new: true }
        );
        const reserved = dbSession ? await reserveQuery.session(dbSession) : await reserveQuery;
        if (!reserved) {
          const winnerQuery = Payment.findOne({
            reversalOfPaymentId: lockedOriginal._id,
            companyId: req.user!.companyId,
            amount: { $lt: 0 }
          });
          const winner = dbSession ? await winnerQuery.session(dbSession) : await winnerQuery;
          const currentQuery = Payment.findById(lockedOriginal._id);
          const current = dbSession ? await currentQuery.session(dbSession) : await currentQuery;
          const linked = winner || ((current as any)?.reversalPaymentId
            ? await Payment.findById((current as any).reversalPaymentId)
            : null);
          if (linked) {
            const correctedDraft = await findOrCreateCorrectionDraft(current || lockedOriginal, dbSession);
            resultPayload = { original: current || lockedOriginal, reversal: linked, correctedDraft, alreadyReversed: true };
            return;
          }
          throw new AppError('Another reversal attempt is in progress for this payment.', 409, 'REVERSAL_IN_PROGRESS');
        }
        lockedOriginal = reserved;
      }

      const reversal = new Payment({
        _id: reversalId,
        paymentType: lockedOriginal.paymentType,
        transactionDomain: historicalTransactionDomain(lockedOriginal) || undefined,
        saleMode: (lockedOriginal as any).saleMode,
        propertyType: lockedOriginal.propertyType,
        propertyId: lockedOriginal.propertyId,
        tenantId: lockedOriginal.tenantId,
        agentId: lockedOriginal.agentId,
        companyId: lockedOriginal.companyId,
        paymentDate: new Date(),
        paymentMethod: lockedOriginal.paymentMethod,
        amount: -Math.abs(Number(lockedOriginal.amount || 0)),
        depositAmount: -Math.abs(Number((lockedOriginal as any).depositAmount || 0)),
        rentAllocated: (lockedOriginal as any).rentAllocated != null
          ? -Math.abs(Number((lockedOriginal as any).rentAllocated || 0))
          : undefined,
        levyAllocated: (lockedOriginal as any).levyAllocated != null
          ? -Math.abs(Number((lockedOriginal as any).levyAllocated || 0))
          : undefined,
        rentUsed: (lockedOriginal as any).rentUsed,
        levyUsed: (lockedOriginal as any).levyUsed,
        referenceNumber: `REV-${String(lockedOriginal.referenceNumber || lockedOriginal._id)}`,
        rentalPeriodMonth: (lockedOriginal as any).rentalPeriodMonth,
        rentalPeriodYear: (lockedOriginal as any).rentalPeriodYear,
        advanceMonthsPaid: (lockedOriginal as any).advanceMonthsPaid,
        advancePeriodStart: (lockedOriginal as any).advancePeriodStart,
        advancePeriodEnd: (lockedOriginal as any).advancePeriodEnd,
        notes: `Reversal of ${String(lockedOriginal.referenceNumber || lockedOriginal._id)}. Reason: ${reason}`,
        processedBy: new mongoose.Types.ObjectId(req.user!.userId),
        commissionDetails: lockedOriginal.commissionDetails,
        vatIncluded: (lockedOriginal as any).vatIncluded,
        vatRate: (lockedOriginal as any).vatRate,
        vatAmount: (lockedOriginal as any).vatAmount,
        applyVatOnCommission: (lockedOriginal as any).applyVatOnCommission,
        vatOnCommissionRate: (lockedOriginal as any).vatOnCommissionRate,
        status: 'completed',
        postingStatus: 'posted',
        currency: lockedOriginal.currency,
        leaseId: (lockedOriginal as any).leaseId,
        manualPropertyAddress: (lockedOriginal as any).manualPropertyAddress,
        manualTenantName: (lockedOriginal as any).manualTenantName,
        buyerName: (lockedOriginal as any).buyerName,
        sellerName: (lockedOriginal as any).sellerName,
        reversalOfPaymentId: lockedOriginal._id,
        isCorrectionEntry: true,
        isProvisional: false,
        isInSuspense: false,
        commissionFinalized: true,
        developmentId: (lockedOriginal as any).developmentId,
        developmentUnitId: (lockedOriginal as any).developmentUnitId,
        saleId: (lockedOriginal as any).saleId,
      });
      try {
        await reversal.save(dbSession ? { session: dbSession } : undefined);
      } catch (saveError: any) {
        if (!isDuplicateKeyError(saveError)) throw saveError;
        const existingQuery = Payment.findOne({
          companyId: lockedOriginal.companyId,
          referenceNumber: reversal.referenceNumber
        });
        const existing = dbSession ? await existingQuery.session(dbSession) : await existingQuery;
        if (!existing) throw saveError;
        const correctedDraft = await findOrCreateCorrectionDraft(lockedOriginal, dbSession);
        resultPayload = { original: lockedOriginal, reversal: existing, correctedDraft, alreadyReversed: true };
        return;
      }

      await reverseLinkedLevyPayment(
        (lockedOriginal as any).linkedLevyPaymentId,
        `Reversal of ${String(lockedOriginal.referenceNumber || lockedOriginal._id)}: ${reason}`,
        { session: dbSession, reversedBy: req.user!.userId }
      );

      const correctedDraft = await findOrCreateCorrectionDraft(lockedOriginal, dbSession);

      await Payment.updateOne(
        { _id: lockedOriginal._id },
        {
          $set: {
            reversedAt: new Date(),
            reversedBy: new mongoose.Types.ObjectId(req.user!.userId),
            reversalReason: reason,
            reversalPaymentId: reversal._id,
            correctedPaymentId: correctedDraft._id,
            reversalState: 'reversal_in_progress'
          }
        },
        dbSession ? { session: dbSession } : undefined
      );

      const updatedOriginalQuery = Payment.findById(lockedOriginal._id);
      const updatedOriginal = dbSession ? await updatedOriginalQuery.session(dbSession) : await updatedOriginalQuery;
      if (!updatedOriginal) {
        throw new AppError('Payment not found after reversal update', 500);
      }

      await logPaymentAudit({
        paymentId: String(updatedOriginal._id),
        companyId: String(updatedOriginal.companyId),
        action: 'reverse',
        oldValues: before,
        newValues: paymentAuditSnapshot(updatedOriginal),
        reason,
        userId: req.user!.userId
      });
      await logPaymentAudit({
        paymentId: String(reversal._id),
        companyId: String(reversal.companyId),
        action: 'create',
        newValues: paymentAuditSnapshot(reversal),
        reason: `Auto-created reversal for ${String(original._id)}`,
        userId: req.user!.userId
      });
      await logPaymentAudit({
        paymentId: String(correctedDraft._id),
        companyId: String(correctedDraft.companyId),
        action: 'create',
        newValues: paymentAuditSnapshot(correctedDraft),
        reason: `Auto-created correction draft for ${String(updatedOriginal._id)}`,
        userId: req.user!.userId
      });

      resultPayload = { original: updatedOriginal, reversal, correctedDraft };
    };

    // Prefer ACID transaction on replica-set deployments.
    // Fallback to non-transactional flow for standalone/local Mongo instances.
    try {
      await session.withTransaction(async () => {
        await applyReversal({ session });
      });
    } catch (txErr: any) {
      const txNotSupported =
        Number(txErr?.code) === 20 ||
        String(txErr?.codeName || '').toLowerCase() === 'illegaloperation' ||
        String(txErr?.message || '').toLowerCase().includes('transaction numbers are only allowed');
      if (!txNotSupported) throw txErr;
      console.warn('Mongo transactions unavailable; running reversal without DB transaction.');
      await applyReversal();
    }

    // Domain propagation after DB commit (idempotent operations).
    const original = resultPayload?.original as any;
    const reversal = resultPayload?.reversal as any;
    const propagationWarnings: string[] = [];
    let accountingOutcome = resultPayload?.skipAccounting ? 'reversed' : 'failed';
    if (original && !resultPayload?.skipAccounting) {
      const reversalResult = await reversePaymentAccounting(String(original._id), {
        processedBy: req.user.userId,
        reason,
        reversalPaymentId: reversal?._id ? String(reversal._id) : undefined
      });
      accountingOutcome = reversalResult.status;
      if (reversalResult.status === 'partial' || reversalResult.status === 'failed') {
        for (const err of reversalResult.errors) {
          propagationWarnings.push(err);
        }
        console.error('Payment reversal accounting incomplete', reversalResult);
      }
      const reversalSettled = reversalResult.status === 'reversed' || reversalResult.status === 'already_reversed';
      if (reversalSettled) {
        try {
          await emitEvent('payment.reversed', {
            eventId: `payment.reversed:${String(original._id)}`,
            paymentId: String(original._id),
            reversalPaymentId: String(reversal?._id || ''),
            companyId: String(original.companyId || ''),
            reason,
            performedBy: String(req.user.userId)
          });
        } catch (emitErr: any) {
          await trustEventRetryService.enqueueFailure(
            'payment.reversed',
            {
              paymentId: String(original._id),
              reversalPaymentId: String(reversal?._id || ''),
              companyId: String(original.companyId || ''),
              reason,
              performedBy: String(req.user.userId),
            },
            emitErr?.message || 'failed to emit payment.reversed',
            String(original.companyId || '')
          );
        }
      }
      try {
        await notifyOwnerOfRentReversal(original, reason, { settled: reversalSettled });
      } catch (noticeErr: any) {
        console.warn('Owner reversal notice failed', noticeErr?.message || noticeErr);
      }
    }

    const incomplete = accountingOutcome === 'partial' || accountingOutcome === 'failed';
    const queued = incomplete && !propagationWarnings.some((warning) => String(warning).startsWith('reversal.enqueue'));
    const httpStatus = !incomplete ? 200 : (queued ? 202 : 500);
    return res.status(httpStatus).json({
      outcome: !incomplete ? 'reversed' : (queued ? 'reversal_incomplete' : 'reversal_failed'),
      message: !incomplete
        ? 'Payment reversed. Draft correction created.'
        : (queued
          ? 'Payment reversal is incomplete. Accounting recovery has been queued.'
          : 'Payment reversal is incomplete and could not be queued.'),
      originalPayment: resultPayload?.original,
      reversalPayment: resultPayload?.reversal,
      correctedPayment: resultPayload?.correctedDraft,
      warnings: propagationWarnings
    });
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || 500);
    console.error('Error reversing payment:', error);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      message: error?.message || 'Failed to reverse payment',
      code: error?.code
    });
  } finally {
    await session.endSession();
  }
};

// Public endpoint for admin dashboard - no authentication required
export const getPaymentsPublic = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    let query: any = { companyId: new mongoose.Types.ObjectId(companyId) };

    // Additional filtering options
    if (req.query.status) {
      applyPaymentStatusFilter(query, String(req.query.status));
    }

    if (req.query.paymentType) {
      query.paymentType = req.query.paymentType;
    }

    if (req.query.paymentMethod) {
      query.paymentMethod = req.query.paymentMethod;
    }

    if (req.query.propertyId) {
      query.propertyId = new mongoose.Types.ObjectId(req.query.propertyId as string);
    }

    // Filter by agentId when provided (ensure only that agent's payments are returned)
    if (req.query.agentId) {
      try {
        query.agentId = new mongoose.Types.ObjectId(req.query.agentId as string);
      } catch {
        // Ignore invalid ObjectId to avoid throwing on public endpoint
      }
    }

    // Date filtering
    if (req.query.startDate || req.query.endDate) {
      query.paymentDate = {};
      if (req.query.startDate) {
        query.paymentDate.$gte = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        query.paymentDate.$lte = new Date(req.query.endDate as string);
      }
    }

    const payments = await Payment.find(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'firstName lastName')
      .sort({ paymentDate: -1 });

    res.json({
      status: 'success',
      data: payments,
      count: payments.length,
      companyId: companyId || null
    });
  } catch (error) {
    console.error('Error fetching payments (public):', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching payments',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Public endpoint for getting a single payment by ID - no authentication required
export const getPaymentByIdPublic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    let query: any = { _id: id, companyId: new mongoose.Types.ObjectId(companyId) };

    const payment = await Payment.findOne(query)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'firstName lastName');

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found',
        id,
        companyId: companyId || null
      });
    }

    res.json({
      status: 'success',
      data: payment
    });
  } catch (error) {
    console.error('Error fetching payment by ID (public):', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching payment',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Public endpoint for creating payments (for admin dashboard) - no authentication required
export const createPaymentPublic = async (req: Request, res: Response) => {
  if (!req.user?.companyId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Allow Idempotency-Key header as an alternative to body field
  try {
    const headerKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key']) as string | undefined;
    if (headerKey && !req.body.idempotencyKey) {
      (req.body as any).idempotencyKey = String(headerKey);
    }
  } catch (_) {}

  let releasePublicRentalGuard: () => Promise<void> = async () => {};
  try {
    const {
      leaseId,
      amount,
      paymentDate,
      paymentMethod,
      status,
      rentalPeriodMonth,
      rentalPeriodYear,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
    } = req.body;
    const companyId = req.user.companyId;
    const publicCurrency = String(req.body.currency || 'USD').trim().toUpperCase();
    if (publicCurrency !== 'USD' && publicCurrency !== 'ZWL') {
      return res.status(400).json({ status: 'error', message: 'Currency must be USD or ZWL.' });
    }
    req.body.currency = publicCurrency;

    // Validate required fields
    if (!leaseId || !amount || !paymentDate || !paymentMethod || !status) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: leaseId, amount, paymentDate, paymentMethod, status',
      });
    }

    // Get lease details to extract property and tenant information
    const lease = await Lease.findOne({ _id: leaseId, companyId });
    if (!lease || !(await callerCanAccessProperty(req, String(lease.propertyId)))) {
      return res.status(404).json({
        status: 'error',
        message: 'Lease not found',
      });
    }
    releasePublicRentalGuard = await acquireRentalPeriodGuardsForPayment({
      companyId: lease.companyId,
      propertyId: lease.propertyId,
      tenantId: lease.tenantId,
      rentalPeriodYear,
      rentalPeriodMonth,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
      paymentType: 'rental',
      amount,
      depositAmount: req.body.depositAmount,
      leaseId: lease._id,
      currency: req.body.currency,
    });
    if (req.body.idempotencyKey) {
      const dup = await findLiveIdempotentPayment({
        companyId: lease.companyId,
        idempotencyKey: String(req.body.idempotencyKey)
      });
      if (dup) {
        return res.status(200).json({ status: 'success', data: dup, message: 'Payment created successfully' });
      }
    }

    // Get property details
    const property = await Property.findOne({ _id: lease.propertyId, companyId });
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    const rent = property.rent || lease.rentAmount;
    // For advance payments spanning multiple months, require full multiple of rent
    if (advanceMonthsPaid && advanceMonthsPaid > 1) {
      const expectedAmount = rent * advanceMonthsPaid;
      if (amount !== expectedAmount) {
        return res.status(400).json({
          status: 'error',
          message: `Amount must equal rent (${rent}) x months (${advanceMonthsPaid}) = ${expectedAmount}`
        });
      }
      const coveredAdvance = await findCoveredAdvanceMonth({
        companyId: lease.companyId,
        propertyId: lease.propertyId,
        tenantId: lease.tenantId,
        rentalPeriodMonth,
        rentalPeriodYear,
        advanceMonthsPaid,
        advancePeriodStart,
        advancePeriodEnd,
        leaseId: lease._id,
        currency: req.body.currency,
      });
      if ('error' in coveredAdvance) {
        return res.status(400).json({ status: 'error', message: coveredAdvance.error, code: 'RENTAL_PERIOD_REQUIRED' });
      }
      if (coveredAdvance.covered) {
        return res.status(400).json({
          status: 'error',
          message: 'Overlapping advance payment already exists for this period.'
        });
      }
    } else {
      // Allow partial payments for a single month up to remaining balance
      const alreadyPaid = await sumRentalPeriodReservation({
        companyId: lease.companyId,
        propertyId: lease.propertyId,
        tenantId: lease.tenantId,
        rentalPeriodYear,
        rentalPeriodMonth,
        leaseId: lease._id,
        currency: req.body.currency
      });
      const alreadyPaidCents = Math.round(alreadyPaid * 100);
      const rentCents = Math.round((rent || 0) * 100);
      const remainingCents = rentCents - alreadyPaidCents;
      if (remainingCents <= 0) {
        return res.status(409).json({ status: 'error', message: 'This month is fully paid. Change rental month.' });
      }
      const amountCents = Math.round((amount || 0) * 100);
      if (amountCents > remainingCents) {
        return res.status(400).json({ status: 'error', message: `Only ${(remainingCents/100).toFixed(2)} remains for this month. Enter an amount ≤ remaining.` });
      }
    }
    const propertyVatRequested = Boolean((property as any)?.vatOnCommission);
    const isIntroductionPayment = String((property as any)?.rentalType || '').toLowerCase() === 'introduction';
    const commissionVatPolicy = await resolveCommissionVatPolicy({
      companyId: String(lease.companyId),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      property: {
        vatOnCommission: propertyVatRequested,
        vatCommissionTreatment: (property as any)?.vatCommissionTreatment
      },
      requestedVatOnCommission: propertyVatRequested,
      requestedTreatment: (property as any)?.vatCommissionTreatment,
      commissionType: isIntroductionPayment ? 'introduction' : 'management'
    });
    const blockedVatRate = centralVatRateBlock(commissionVatPolicy);
    if (blockedVatRate) {
      return res.status(400).json({ message: blockedVatRate.message, code: blockedVatRate.code });
    }
    const commissionVat = commissionVatFlagsFromPolicy(commissionVatPolicy);
    if (commissionVatPolicy.reviewRequired && commissionVatPolicy.reviewReason) {
      await openReview({
        companyId: String(lease.companyId),
        kind: commissionVatPolicy.reviewReason,
        title: 'VAT on commission requires review',
        detail: commissionVatPolicy.reason,
        propertyId: String(lease.propertyId)
      });
    }

    // Calculate commission based on property commission percentage
    let publicCommissionResult;
    let publicCommissionDetails;
    if (isIntroductionPayment) {
      const prepared = await prepareIntroductionRentalCommission({
        companyId: lease.companyId,
        propertyId: lease.propertyId,
        tenantId: lease.tenantId,
        leaseId: lease._id,
        rentAllocated: Number(amount || 0),
        levyAllocated: 0,
        vatOnCommission: commissionVat.vatOnCommission,
        vatTreatment: commissionVat.vatTreatment,
        vatRate: commissionVat.vatRate,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        propertyRent: Number(rent || 0),
        rentUsed: Number(rent || 0)
      });
      if (!prepared.ok) {
        return res.status(400).json(introductionContextErrorResponse(prepared as IntroductionContextError));
      }
      publicCommissionResult = prepared.result;
      publicCommissionDetails = prepared.snapshot;
    } else {
      publicCommissionResult = await CommissionService.calculateForProperty({
        companyId: lease.companyId,
        grossRent: amount,
        levy: 0,
        commissionPercentage: property.commission || 0,
        vatOnCommission: commissionVat.vatOnCommission,
        vatTreatment: commissionVat.vatTreatment,
        vatRate: commissionVat.vatRate,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date()
      });
      publicCommissionDetails = stampVatDecision(
        applyLevyPassThroughToSnapshot(publicCommissionResult, amount, 0),
        commissionVatPolicy
      );
    }

    try {
      resolveCreateTransactionDomain({
        paymentType: 'rental',
        entity: { kind: 'property', rentalType: (property as any)?.rentalType }
      });
    } catch (domainError) {
      if (domainError instanceof AccountingClassificationConflictError) {
        return res.status(409).json(domainError.toBody());
      }
      throw domainError;
    }

    // Create payment record
    const payment = new Payment({
      amount,
      paymentDate,
      paymentMethod,
      status,
      ...initialAccountingIntegrityFields({ status }),
      companyId: req.user.companyId,
      paymentType: 'rental',
      transactionDomain: 'RENTAL',
      propertyType: 'residential', // Default value
      propertyId: lease.propertyId,
      tenantId: lease.tenantId,
      agentId: lease.tenantId, // Use tenant ID as agent ID since lease doesn't have agentId
      processedBy: lease.tenantId, // Use tenant ID as processedBy since no agent ID
      depositAmount: 0, // Default value
      rentalPeriodMonth,
      rentalPeriodYear,
      advanceMonthsPaid,
      advancePeriodStart,
      advancePeriodEnd,
      referenceNumber: '', // Placeholder, will update after save
      notes: '', // Default empty notes
      commissionDetails: publicCommissionDetails,
      applyVatOnCommission: publicCommissionResult.vatOnCommission,
      vatOnCommissionRate: publicCommissionResult.vatRate || 0,
      vatCommissionTreatment: publicCommissionResult.vatTreatment,
      rentUsed: rent, // Store the rent used for this payment
      leaseId: lease._id,
      currency: publicCurrency,
      idempotencyKey: req.body.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
    });

    await payment.save();
    payment.referenceNumber = `RCPT-${payment._id.toString().slice(-6).toUpperCase()}-${rentalPeriodYear}-${String(rentalPeriodMonth).padStart(2, '0')}`;
    await payment.save();

    // If depositAmount > 0, record in rentaldeposits
    if (payment.depositAmount && payment.depositAmount > 0) {
      await ensureDepositLedgerFromPayment(payment);
    }

    if (String(payment.status || '') === 'completed') {
      const postResult = await ensurePaymentAccountingPosted(payment._id.toString(), { createdBy: req.user?.userId });
      if (postResult.recon.status !== 'complete' && postResult.recon.status !== 'not_applicable') {
        console.warn('Payment accounting post incomplete (public create)', postResult.recon.missing);
      }
      if (postResult.accountingComplete === true) {
        void notifyOwnerOfRentPayment(payment, { accountingComplete: true });
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Payment created successfully:', { id: payment._id });
    }

    res.status(201).json({
      status: 'success',
      data: payment,
      message: 'Payment created successfully'
    });
  } catch (error) {
    console.error('Error creating payment (public):', error);
    const statusCode = error instanceof AppError ? (error.statusCode || 500) : 500;
    res.status(statusCode).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Error creating payment',
      ...(error instanceof AppError && error.code ? { code: error.code } : {})
    });
  } finally {
    await releasePublicRentalGuard();
  }
};

// Public endpoint for downloading a payment receipt as blob (no authentication required)
export const getPaymentReceiptDownload = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId as string | undefined;
    if (!companyId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const format = String((req.query as any)?.format || '').toLowerCase();

    let query: any = { _id: id };
    try {
      query.companyId = new mongoose.Types.ObjectId(String(companyId));
    } catch {
      query.companyId = String(companyId);
    }

    const payment = await Payment.findOne(query)
      .populate('propertyId', 'name address rent')
      .populate('tenantId', 'firstName lastName email')
      .populate('agentId', 'firstName lastName')
      .populate('processedBy', 'firstName lastName');

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found',
        id,
        companyId: companyId || null
      });
    }

    // Get company details if available
    let company = null;
    if (payment.companyId) {
      company = await Company.findById(payment.companyId).select(
        'name address phone email website registrationNumber tinNumber vatNumber logo description'
      );
    }

    // Determine rent amount to display on receipt: prefer explicit rentUsed, then property's rent
    const rentAmountForDisplay = typeof (payment as any).rentUsed === 'number'
      ? Number((payment as any).rentUsed)
      : Number(((payment as any).propertyId as any)?.rent || 0);

    // Compute paid-to-date across the rental period (company + property + tenant + month/year)
    let rentalOutstanding = 0;
    try {
      const periodYear = typeof (payment as any).rentalPeriodYear === 'number'
        ? Number((payment as any).rentalPeriodYear)
        : new Date(payment.paymentDate).getFullYear();
      const periodMonth = typeof (payment as any).rentalPeriodMonth === 'number'
        ? Number((payment as any).rentalPeriodMonth)
        : (new Date(payment.paymentDate).getMonth() + 1);
      const paidToDate = await sumRentCoverageForPeriod({
        companyId: payment.companyId as mongoose.Types.ObjectId,
        propertyId: ((payment as any).propertyId?._id || (payment as any).propertyId) as mongoose.Types.ObjectId,
        tenantId: ((payment as any).tenantId?._id || (payment as any).tenantId) as mongoose.Types.ObjectId,
        rentalPeriodYear: periodYear,
        rentalPeriodMonth: periodMonth,
        leaseId: (payment as any).leaseId,
        currency: (payment as any).currency
      });
      rentalOutstanding = Math.max(0, Number(rentAmountForDisplay || 0) - paidToDate);
    } catch {
      const rentPaidOnly = Number(payment.amount || 0);
      rentalOutstanding = Math.max(0, Number(rentAmountForDisplay || 0) - rentPaidOnly);
    }

    // Generate HTML receipt with logo
    const htmlReceipt = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Receipt - ${payment.referenceNumber}</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; color: #333; }
            .receipt { max-width: 600px; margin: 0 auto; border: 1px solid #ccc; padding: 20px; background: white; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .company-logo { max-width: 150px; max-height: 60px; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto; }
            .company-name { font-size: 24px; font-weight: bold; margin: 10px 0; }
            .company-details { font-size: 12px; color: #666; margin: 5px 0; }
            .receipt-number { font-size: 18px; font-weight: bold; color: #333; margin-top: 15px; }
            .amount { font-size: 28px; font-weight: bold; color: #2e7d32; text-align: center; margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
            .details { margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 8px 0; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .label { font-weight: bold; color: #666; min-width: 120px; }
            .value { color: #333; text-align: right; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px; }
            @media print { body { margin: 0; } .receipt { border: none; } }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="header">
              ${company?.logo ? `<img src="data:image/png;base64,${company.logo}" alt="Company Logo" class="company-logo">` : ''}
              <div class="company-name">${company?.name || 'Property Management'}</div>
              <div class="company-details">${company?.address || 'Address not available'}</div>
              <div class="company-details">Phone: ${company?.phone || 'Phone not available'} | Email: ${company?.email || 'Email not available'}</div>
              ${company?.website ? `<div class="company-details">Website: ${company.website}</div>` : ''}
              ${company?.registrationNumber ? `<div class="company-details">Reg. No: ${company.registrationNumber}</div>` : ''}
              ${company?.tinNumber ? `<div class="company-details">Tax No: ${company.tinNumber}</div>` : ''}
              <div class="receipt-number">Receipt #${payment.referenceNumber}</div>
            </div>
            
            <div class="amount">$${((Number(payment.amount || 0) + Number(payment.depositAmount || 0))).toFixed(2)}</div>
            
            <div class="details">
              <div class="detail-row">
                <span class="label">Payment Date:</span>
                <span class="value">${new Date(payment.paymentDate).toLocaleDateString()}</span>
              </div>
              <div class="detail-row">
                <span class="label">Payment Method:</span>
                <span class="value">${payment.paymentMethod?.replace('_', ' ').toUpperCase() || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Status:</span>
                <span class="value">${payment.status?.toUpperCase() || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Property:</span>
                <span class="value">${(payment.propertyId as any)?.name || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Tenant:</span>
                <span class="value">${(payment.tenantId as any)?.firstName} ${(payment.tenantId as any)?.lastName}</span>
              </div>
              <div class="detail-row">
                <span class="label">Agent:</span>
                <span class="value">${(payment.agentId as any)?.firstName} ${(payment.agentId as any)?.lastName || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Processed By:</span>
                <span class="value">${(payment.processedBy as any)?.firstName} ${(payment.processedBy as any)?.lastName || 'N/A'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Rent Amount:</span>
                <span class="value">$${(Number(rentAmountForDisplay || 0)).toFixed(2)}</span>
              </div>
              ${(payment.depositAmount && Number(payment.depositAmount) > 0) ? `
              <div class="detail-row">
                <span class="label">Deposit Amount:</span>
                <span class="value">$${(Number(payment.depositAmount || 0)).toFixed(2)}</span>
              </div>` : ''}
              <div class="detail-row">
                <span class="label">Outstanding:</span>
                <span class="value">$${(Number(rentalOutstanding || 0)).toFixed(2)}</span>
              </div>
              ${Number(rentalOutstanding || 0) === 0 ? `
              <div class="detail-row">
                <span class="label">Balance Status:</span>
                <span class="value">Cleared</span>
              </div>` : ''}
              <div class="detail-row">
                <span class="label">Total Paid:</span>
                <span class="value">$${(Number(payment.amount || 0) + Number(payment.depositAmount || 0)).toFixed(2)}</span>
              </div>
              ${payment.notes ? `
              <div class="detail-row">
                <span class="label">Notes:</span>
                <span class="value">${payment.notes}</span>
              </div>
              ` : ''}
            </div>
            
            <div class="footer">
              <p>Thank you for your payment!</p>
              <p>Generated on ${new Date().toLocaleString()}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (process.env.NODE_ENV !== 'production') {
      console.log('Generated HTML receipt for payment:', { id: payment._id });
    }

    if (format === 'pdf') {
      const totalPaid = Number(payment.amount || 0) + Number(payment.depositAmount || 0);
      const tenant = payment.tenantId as any;
      const agent = payment.agentId as any;
      const processedBy = payment.processedBy as any;
      const pdfBuffer = await buildPaymentReceiptPdf({
        companyName: company?.name || 'Property Management',
        companyAddress: company?.address,
        companyPhone: company?.phone,
        companyEmail: company?.email,
        companyWebsite: company?.website,
        registrationNumber: company?.registrationNumber,
        tinNumber: company?.tinNumber,
        logoBase64: company?.logo,
        receiptNumber: String(payment.referenceNumber || payment._id),
        amountLabel: `$${totalPaid.toFixed(2)}`,
        lines: [
          { label: 'Payment Date', value: new Date(payment.paymentDate).toLocaleDateString() },
          { label: 'Payment Method', value: payment.paymentMethod?.replace('_', ' ').toUpperCase() || 'N/A' },
          { label: 'Status', value: payment.status?.toUpperCase() || 'N/A' },
          { label: 'Property', value: (payment.propertyId as any)?.name || 'N/A' },
          { label: 'Tenant', value: [tenant?.firstName, tenant?.lastName].filter(Boolean).join(' ') || 'N/A' },
          { label: 'Agent', value: [agent?.firstName, agent?.lastName].filter(Boolean).join(' ') || 'N/A' },
          { label: 'Processed By', value: [processedBy?.firstName, processedBy?.lastName].filter(Boolean).join(' ') || 'N/A' },
          { label: 'Rent Amount', value: `$${Number(rentAmountForDisplay || 0).toFixed(2)}` },
          ...(payment.depositAmount && Number(payment.depositAmount) > 0
            ? [{ label: 'Deposit Amount', value: `$${Number(payment.depositAmount).toFixed(2)}` }]
            : []),
          { label: 'Outstanding', value: `$${Number(rentalOutstanding || 0).toFixed(2)}` },
          ...(Number(rentalOutstanding || 0) === 0 ? [{ label: 'Balance Status', value: 'Cleared' }] : []),
          { label: 'Total Paid', value: `$${totalPaid.toFixed(2)}` },
          ...(payment.notes ? [{ label: 'Notes', value: String(payment.notes) }] : [])
        ]
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.referenceNumber || payment._id}.pdf"`);
      return res.send(pdfBuffer);
    }

    // Default: HTML file download
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.referenceNumber || payment._id}.html"`);
    return res.send(htmlReceipt);
  } catch (error) {
    console.error('Error generating payment receipt download:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error generating receipt download',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Public endpoint for getting a payment receipt for printing
export const getPaymentReceipt = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companyId = req.user?.companyId as string | undefined;
    if (!companyId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    let query: any = { _id: id };
    try {
      query.companyId = new mongoose.Types.ObjectId(String(companyId));
    } catch {
      query.companyId = String(companyId);
    }

    const payment = await Payment.findOne(query)
      .populate('propertyId', 'name address rent')
      .populate('tenantId', 'firstName lastName email')
      .populate('agentId', 'firstName lastName')
      .populate('processedBy', 'firstName lastName');

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found',
        id,
        companyId: companyId || null
      });
    }

    // Get company details if available
    let company = null;
    if (payment.companyId) {
      company = await Company.findById(payment.companyId).select(
        'name address phone email website registrationNumber tinNumber vatNumber logo description'
      );
    }

    // Create receipt data
    const receipt: any = {
      receiptNumber: payment.referenceNumber,
      paymentDate: payment.paymentDate,
      amount: payment.amount,
      depositAmount: payment.depositAmount,
      totalPaid: Number(payment.amount || 0) + Number(payment.depositAmount || 0),
      currency: 'USD', // Default currency
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      property: payment.propertyId,
      tenant: payment.tenantId,
      agent: payment.agentId,
      processedBy: payment.processedBy,
      company: company,
      commissionDetails: payment.commissionDetails,
      notes: payment.notes,
      createdAt: payment.createdAt,
      // Include manual entry fields
      manualPropertyAddress: payment.manualPropertyAddress,
      manualTenantName: payment.manualTenantName,
      // Sales names (buyer/seller) for sales receipts
      buyerName: (payment as any).buyerName,
      sellerName: (payment as any).sellerName,
      paymentType: (payment as any).paymentType,
      saleId: (payment as any).saleId,
      referenceNumber: payment.referenceNumber,
      // Rental period details
      rentalPeriodMonth: (payment as any).rentalPeriodMonth,
      rentalPeriodYear: (payment as any).rentalPeriodYear,
      advanceMonthsPaid: (payment as any).advanceMonthsPaid,
      advancePeriodStart: (payment as any).advancePeriodStart,
      advancePeriodEnd: (payment as any).advancePeriodEnd,
      levyPeriodMonth: (payment as any).levyPeriodMonth,
      levyPeriodYear: (payment as any).levyPeriodYear
    };

    // Include rent amount for rentals: prefer explicit rentUsed, then property's rent
    try {
      const rentAmountForDisplay = typeof (payment as any).rentUsed === 'number'
        ? Number((payment as any).rentUsed)
        : Number(((payment as any).propertyId as any)?.rent || 0);
      if (Number.isFinite(rentAmountForDisplay)) {
        (receipt as any).rentAmount = rentAmountForDisplay;
      }
      if (typeof (payment as any).rentAllocated === 'number') {
        (receipt as any).rentAllocated = Number((payment as any).rentAllocated);
      }
      if (typeof (payment as any).levyAllocated === 'number') {
        (receipt as any).levyAllocated = Number((payment as any).levyAllocated);
      }
      if (typeof (payment as any).levyUsed === 'number') {
        (receipt as any).levyAmount = Number((payment as any).levyUsed);
      }
    } catch {
      // ignore
    }

    // Include rental outstanding aggregated across the rental period (rent - paid-to-date; deposit excluded)
    try {
      const rentAmountForDisplay = typeof (receipt as any).rentAmount === 'number'
        ? Number((receipt as any).rentAmount)
        : 0;
      const periodYear = typeof (payment as any).rentalPeriodYear === 'number'
        ? Number((payment as any).rentalPeriodYear)
        : new Date(payment.paymentDate).getFullYear();
      const periodMonth = typeof (payment as any).rentalPeriodMonth === 'number'
        ? Number((payment as any).rentalPeriodMonth)
        : (new Date(payment.paymentDate).getMonth() + 1);
      const paidToDate = await sumRentCoverageForPeriod({
        companyId: payment.companyId as mongoose.Types.ObjectId,
        propertyId: ((payment as any).propertyId?._id || (payment as any).propertyId) as mongoose.Types.ObjectId,
        tenantId: ((payment as any).tenantId?._id || (payment as any).tenantId) as mongoose.Types.ObjectId,
        rentalPeriodYear: periodYear,
        rentalPeriodMonth: periodMonth,
        leaseId: (payment as any).leaseId,
        currency: (payment as any).currency
      });
      const rentalOutstanding = Math.max(0, rentAmountForDisplay - paidToDate);
      (receipt as any).paidToDate = paidToDate;
      (receipt as any).rentalOutstanding = rentalOutstanding;

      const levyBaseline = typeof (receipt as any).levyAmount === 'number' ? Number((receipt as any).levyAmount) : 0;
      if (levyBaseline > 0) {
        const { sumLevyPaidForPeriod } = await import('../services/combinedPaymentService');
        const levyPaidToDate = await sumLevyPaidForPeriod({
          companyId: payment.companyId as mongoose.Types.ObjectId,
          propertyId: ((payment as any).propertyId?._id || (payment as any).propertyId) as mongoose.Types.ObjectId,
          levyPeriodMonth: periodMonth,
          levyPeriodYear: periodYear,
        });
        (receipt as any).levyPaidToDate = levyPaidToDate;
        (receipt as any).levyOutstanding = Math.max(0, levyBaseline - levyPaidToDate);
      }
    } catch {
      // ignore
    }

    // Generate a deterministic unique receipt code for sale payments
    if ((payment as any).paymentType === 'sale') {
      const dt = new Date(payment.paymentDate || payment.createdAt);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const suffix = String((payment as any)._id || '').slice(-6).toUpperCase();
      const receiptCode = `SR-${y}${m}${d}-${suffix}`;
      receipt.receiptCode = receiptCode;
      receipt.receiptNumber = receiptCode;
    }

    // For sale payments, compute totals for consistency with UI outstanding column
    try {
      const isSale = (payment as any).paymentType === 'sale';
      if (isSale) {
        let totalSalePrice: number | null = null;
        let saleCurrency: string | null = null;

        // Prefer linked sales contract
        if ((payment as any).saleId) {
          const sc = await SalesContract.findOne({ _id: (payment as any).saleId, companyId: payment.companyId });
          if (sc) {
            totalSalePrice = Number(sc.totalSalePrice || 0);
            saleCurrency = sc.currency || null;
          }
        }

        // Fallback: parse from notes (e.g., "Total Sale Price 280,000 USD")
        if (totalSalePrice == null && typeof payment.notes === 'string') {
          const match = payment.notes.match(/Total\s+Sale\s+Price\s+([0-9,.]+)/i);
          if (match && match[1]) {
            const n = Number(match[1].replace(/,/g, ''));
            if (Number.isFinite(n)) totalSalePrice = n;
          }
        }

        // Derive currency from payment if not provided by sale
        if (!saleCurrency) {
          saleCurrency = payment.currency || 'USD';
        }

        // Compute paid to date for this sale group (include current payment)
        let paidToDate = 0;
        const match: any = {
          companyId: payment.companyId,
          paymentType: 'sale',
          status: 'completed'
        };
        if ((payment as any).saleId) {
          match.saleId = (payment as any).saleId;
        } else {
          match.$or = [
            { referenceNumber: payment.referenceNumber || null },
            { manualPropertyAddress: payment.manualPropertyAddress || null }
          ];
        }
        const related = await Payment.find(match).select('amount');
        paidToDate = related.reduce((sum, p) => sum + (p.amount || 0), 0);

        if (totalSalePrice != null) {
          const outstanding = Math.max(0, totalSalePrice - paidToDate);
          receipt.totalSalePrice = totalSalePrice;
          receipt.paidToDate = paidToDate;
          receipt.outstanding = outstanding;
          if (saleCurrency) receipt.currency = saleCurrency;
        }
      }
    } catch (calcErr) {
      console.warn('Failed to compute sale totals for receipt', (calcErr as any)?.message);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Generated receipt for payment:', { id: payment._id });
    }

    res.json({
      status: 'success',
      data: receipt
    });
  } catch (error) {
    console.error('Error generating payment receipt:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error generating receipt',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 

// Finalize a provisional payment by linking to real property/tenant and posting commissions
export const finalizeProvisionalPayment = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {

    const { id } = req.params;
    const {
      propertyId,
      tenantId,
      ownerId,
      relationshipType, // 'management' | 'introduction'
      overrideCommissionPercent
    } = req.body as {
      propertyId: string;
      tenantId: string;
      ownerId?: string;
      relationshipType?: 'management' | 'introduction';
      overrideCommissionPercent?: number;
    };

    if (!propertyId || !tenantId) {
      return res.status(400).json({ message: 'propertyId and tenantId are required' });
    }

    // Validate ObjectId formats to prevent cast errors
    try {
      new mongoose.Types.ObjectId(propertyId);
      new mongoose.Types.ObjectId(tenantId);
      if (ownerId) new mongoose.Types.ObjectId(ownerId);
    } catch {
      return res.status(400).json({ message: 'Invalid id format supplied' });
    }

    const payment = await Payment.findOne({ _id: id, companyId: req.user.companyId });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    if (!payment.isProvisional) {
      return res.status(400).json({ message: 'Payment is not provisional' });
    }

    // Agents can only finalize their own provisional manual payments
    if ((req.user as any).role === 'agent') {
      if (String(payment.agentId) !== String((req.user as any).userId)) {
        return res.status(403).json({ message: 'Agents may only finalize their own provisional payments' });
      }
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }

    const commissionPercent = typeof overrideCommissionPercent === 'number' ? overrideCommissionPercent : (property.commission || 0);
    const propertyVatRequested = Boolean((property as any)?.vatOnCommission);
    const applyIntroductionRule = (relationshipType === 'introduction') || (property.rentalType === 'introduction');
    const commissionVatPolicy = await resolveCommissionVatPolicy({
      companyId: String(req.user.companyId),
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
      property: {
        vatOnCommission: propertyVatRequested,
        vatCommissionTreatment: (property as any)?.vatCommissionTreatment
      },
      requestedVatOnCommission: propertyVatRequested,
      requestedTreatment: (property as any)?.vatCommissionTreatment,
      commissionType: applyIntroductionRule ? 'introduction' : 'management'
    });
    const blockedVatRate = centralVatRateBlock(commissionVatPolicy);
    if (blockedVatRate) {
      return res.status(400).json({ message: blockedVatRate.message, code: blockedVatRate.code });
    }
    const commissionVat = commissionVatFlagsFromPolicy(commissionVatPolicy);
    if (commissionVatPolicy.reviewRequired && commissionVatPolicy.reviewReason) {
      await openReview({
        companyId: String(req.user.companyId),
        kind: commissionVatPolicy.reviewReason,
        title: 'VAT on commission requires review',
        detail: commissionVatPolicy.reason,
        propertyId: String(propertyId)
      });
    }
    // Apply rules based on relationshipType: 'introduction' → single-month once; 'management' → standard on full amount
    let finalCommission: any = {
      totalCommission: 0,
      preaFee: 0,
      agentShare: 0,
      agencyShare: 0,
      ownerAmount: payment.amount || 0
    };
    try {
      if (applyIntroductionRule) {
        const isDepositOnly = Number(payment.amount || 0) <= 0 && Number(payment.depositAmount || 0) > 0;
        const prepared = await prepareIntroductionRentalCommission({
            companyId: String(req.user.companyId),
            propertyId,
            tenantId,
            leaseId: (req.body as any).leaseId || (payment as any).leaseId,
            rentAllocated: isDepositOnly ? 0 : Math.max(0, Number((payment as any).rentAllocated || payment.amount || 0)),
            levyAllocated: isDepositOnly ? 0 : Number((payment as any).levyAllocated || 0),
            vatOnCommission: commissionVat.vatOnCommission,
            vatTreatment: commissionVat.vatTreatment,
            vatRate: commissionVat.vatRate,
            paymentDate: payment.paymentDate,
            excludePaymentId: payment._id,
            propertyRent: Number(property.rent || 0),
            rentUsed: typeof payment.rentUsed === 'number' ? Number(payment.rentUsed) : undefined
          });
          if (!prepared.ok) {
            return res.status(400).json(introductionContextErrorResponse(prepared as IntroductionContextError));
          }
          finalCommission = prepared.snapshot;
          (payment as any).leaseId = new mongoose.Types.ObjectId(prepared.context.leaseId);
      } else {
        // Management or other: standard commission on full amount (advance supported)
        const tmp = await CommissionService.calculateForProperty({
          companyId: req.user.companyId,
          grossRent: Math.max(0, Number((payment as any).rentAllocated || payment.amount || 0)),
          levy: 0,
          commissionPercentage: Number(commissionPercent),
          vatOnCommission: commissionVat.vatOnCommission,
          vatTreatment: commissionVat.vatTreatment,
          vatRate: commissionVat.vatRate,
          paymentDate: payment.paymentDate
        });
        finalCommission = applyLevyPassThroughToSnapshot(
          tmp,
          Math.max(0, Number((payment as any).rentAllocated || payment.amount || 0)),
          Number((payment as any).levyAllocated || 0)
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      finalCommission = {
        totalCommission: 0,
        preaFee: 0,
        agentShare: 0,
        agencyShare: 0,
        ownerAmount: payment.amount || 0
      };
    }

    payment.propertyId = new mongoose.Types.ObjectId(propertyId) as any;
    payment.tenantId = new mongoose.Types.ObjectId(tenantId) as any;
    if (ownerId) {
      (payment as any).ownerId = new mongoose.Types.ObjectId(ownerId);
    }
    payment.commissionDetails = stampVatDecision(finalCommission as any, commissionVatPolicy);
    (payment as any).applyVatOnCommission = Boolean((finalCommission as any)?.vatOnCommission && Number((finalCommission as any)?.vatAmount || 0) > 0);
    (payment as any).vatOnCommissionRate = Number((finalCommission as any)?.vatRate || 0);
    (payment as any).vatCommissionTreatment = (finalCommission as any)?.vatTreatment;
    payment.isProvisional = false;
    payment.isInSuspense = false;
    payment.commissionFinalized = true;
    payment.provisionalRelationshipType = (relationshipType as any) || payment.provisionalRelationshipType || 'unknown';
    (payment as any).finalizedAt = new Date();
    (payment as any).finalizedBy = new mongoose.Types.ObjectId(req.user.userId);
    activateAccountingTrackingForCompletion(payment);

    await payment.save();

    const postResult = await ensurePaymentAccountingPosted(payment._id.toString(), { createdBy: req.user.userId });
    if (postResult.recon.status !== 'complete' && postResult.recon.status !== 'not_applicable') {
      console.warn('Payment accounting post incomplete (finalize)', postResult.recon.missing);
    }
    if (postResult.accountingComplete === true && String(payment.status) === 'completed' && !payment.isProvisional) {
      void notifyOwnerOfRentPayment(payment, { accountingComplete: true });
    }

    await emitPaymentConfirmedIfNeeded(payment, 'payment.finalized');

    const populated = await Payment.findById(payment._id)
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName')
      .populate('agentId', 'firstName lastName');

    return res.json({ message: 'Payment finalized successfully', payment: populated || payment });
  } catch (error: any) {
    console.error('Error finalizing provisional payment:', error);
    return res.status(500).json({ message: 'Failed to finalize payment', error: error?.message || 'Unknown error' });
  } finally {
    // no-op
  }
};

/** Remaining rent + levy for a rental period (combined payment UI). */
export const getCombinedRemaining = async (req: Request, res: Response) => {
  try {
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { propertyId, tenantId, rentalPeriodMonth, rentalPeriodYear } = req.query as any;
    if (!propertyId || !tenantId || !rentalPeriodMonth || !rentalPeriodYear) {
      return res.status(400).json({ message: 'propertyId, tenantId, rentalPeriodMonth, rentalPeriodYear are required' });
    }
    const companyId = new mongoose.Types.ObjectId(req.user.companyId);
    const propId = new mongoose.Types.ObjectId(String(propertyId));
    const tenId = new mongoose.Types.ObjectId(String(tenantId));
    const month = Number(rentalPeriodMonth);
    const year = Number(rentalPeriodYear);

    const { loadPropertyCombinedBaselines, sumRentPaidForPeriod, sumLevyPaidForPeriod } = await import('../services/combinedPaymentService');
    const baselines = await loadPropertyCombinedBaselines(propId);
    const rentPaid = await sumRentPaidForPeriod({
      companyId,
      propertyId: propId,
      tenantId: tenId,
      rentalPeriodMonth: month,
      rentalPeriodYear: year,
    });
    const rentRemaining = Math.max(0, baselines.monthlyRent - rentPaid);
    let levyPaid = 0;
    let levyRemaining = 0;
    if (baselines.hasLevy) {
      levyPaid = await sumLevyPaidForPeriod({
        companyId,
        propertyId: propId,
        levyPeriodMonth: month,
        levyPeriodYear: year,
      });
      levyRemaining = Math.max(0, baselines.monthlyLevy - levyPaid);
    }

    return res.json({
      data: {
        monthlyRent: baselines.monthlyRent,
        monthlyLevy: baselines.monthlyLevy,
        hasLevy: baselines.hasLevy,
        rentPaid,
        levyPaid,
        rentRemaining,
        levyRemaining,
        combinedRemaining: rentRemaining + levyRemaining,
      },
    });
  } catch (error: any) {
    console.error('Error fetching combined remaining:', error);
    return res.status(500).json({ message: error?.message || 'Failed to fetch remaining balance' });
  }
};
