/**
 * Introduction identity is tenant + property + lease.
 * Do not guess a lease. Do not use payerId as the Introduction key.
 */
import mongoose from 'mongoose';
import { Lease } from '../models/Lease';
import { logger } from '../utils/logger';

export const INTRODUCTION_LEASE_REQUIRED = 'INTRODUCTION_LEASE_REQUIRED';
export const INTRODUCTION_CONTEXT_INCOMPLETE = 'INTRODUCTION_CONTEXT_INCOMPLETE';
export const INTRODUCTION_CONTEXT_MISMATCH = 'INTRODUCTION_CONTEXT_MISMATCH';
export const INTRODUCTION_LEASE_NOT_APPLICABLE = 'INTRODUCTION_LEASE_NOT_APPLICABLE';

export const INTRODUCTION_APPLICABLE_LEASE_STATUSES = [
  'active',
  'expiring_soon',
  'pending_settlement'
] as const;

const sameId = (a: unknown, b: unknown): boolean => String(a || '') === String(b || '');

export type IntroductionContextError = {
  ok: false;
  code: string;
  message: string;
  missing?: string[];
  mismatches?: string[];
};

export type IntroductionContextOk = {
  ok: true;
  lease: any;
  tenantId: string;
  propertyId: string;
  leaseId: string;
};

const incomplete = (missing: string[]): IntroductionContextError => ({
  ok: false,
  code: INTRODUCTION_CONTEXT_INCOMPLETE,
  message: 'Introduction payment requires tenant, property, and lease.',
  missing
});

export function introductionContextErrorResponse(error: {
  code: string;
  message: string;
  missing?: string[];
  mismatches?: string[];
}) {
  return {
    status: 'error' as const,
    success: false as const,
    code: error.code,
    message: error.message,
    ...(error.missing ? { missing: error.missing } : {}),
    ...(error.mismatches ? { mismatches: error.mismatches } : {})
  };
}

export function logIntroductionContextFailure(input: {
  companyId?: mongoose.Types.ObjectId | string;
  tenantId?: string;
  propertyId?: string;
  leaseId?: unknown;
  paymentId?: string;
  code: string;
  missing?: string[];
  mismatches?: string[];
  attemptedAllocation?: Record<string, unknown>;
}) {
  logger.warn('Introduction payment context rejected', {
    paymentId: input.paymentId || null,
    tenantId: input.tenantId || null,
    propertyId: input.propertyId || null,
    leaseId: input.leaseId != null ? String(input.leaseId) : null,
    companyId: input.companyId != null ? String(input.companyId) : null,
    code: input.code,
    missing: input.missing || [],
    mismatches: input.mismatches || [],
    attemptedAllocation: input.attemptedAllocation || null
  });
}

export function introductionTargetFromLease(lease: any, property?: any): number {
  const fromLease = Number(lease?.rentAmount || lease?.monthlyRent || 0);
  if (fromLease > 0) return fromLease;
  return Number(property?.rent || 0);
}

export async function resolveIntroductionLeaseContext(input: {
  companyId: mongoose.Types.ObjectId | string;
  tenantId?: unknown;
  propertyId?: unknown;
  leaseId?: unknown;
}): Promise<IntroductionContextOk | IntroductionContextError> {
  const missing: string[] = [];
  const tenantId = input.tenantId != null && String(input.tenantId).trim() && !String(input.tenantId).startsWith('manual_')
    ? String(input.tenantId)
    : '';
  const propertyId = input.propertyId != null && String(input.propertyId).trim() && !String(input.propertyId).startsWith('manual_')
    ? String(input.propertyId)
    : '';
  const leaseIdRaw = input.leaseId != null && String(input.leaseId).trim() ? String(input.leaseId) : '';

  if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) missing.push('tenantId');
  if (!propertyId || !mongoose.Types.ObjectId.isValid(propertyId)) missing.push('propertyId');
  if (missing.length) {
    if (!leaseIdRaw) missing.push('leaseId');
    const error = incomplete(missing);
    logIntroductionContextFailure({ ...input, tenantId, propertyId, leaseId: leaseIdRaw, code: error.code, missing: error.missing });
    return error;
  }

  const companyId = new mongoose.Types.ObjectId(String(input.companyId));

  if (leaseIdRaw) {
    if (!mongoose.Types.ObjectId.isValid(leaseIdRaw)) {
      const error: IntroductionContextError = {
        ok: false,
        code: INTRODUCTION_LEASE_REQUIRED,
        message: 'Introduction payment requires an unambiguous lease.',
        missing: ['leaseId']
      };
      logIntroductionContextFailure({ ...input, tenantId, propertyId, leaseId: leaseIdRaw, code: error.code, missing: error.missing });
      return error;
    }
    const lease = await Lease.findOne({
      _id: new mongoose.Types.ObjectId(leaseIdRaw),
      companyId
    }).lean();
    if (!lease) {
      const error: IntroductionContextError = {
        ok: false,
        code: INTRODUCTION_LEASE_NOT_APPLICABLE,
        message: 'Introduction lease was not found for this company.',
        missing: ['leaseId']
      };
      logIntroductionContextFailure({ ...input, tenantId, propertyId, leaseId: leaseIdRaw, code: error.code, missing: error.missing });
      return error;
    }
    const mismatches: string[] = [];
    if (!sameId((lease as any).tenantId, tenantId)) mismatches.push('tenantId');
    if (!sameId((lease as any).propertyId, propertyId)) mismatches.push('propertyId');
    if (mismatches.length) {
      const error: IntroductionContextError = {
        ok: false,
        code: INTRODUCTION_CONTEXT_MISMATCH,
        message: 'Introduction payment tenant/property does not match the selected lease.',
        mismatches
      };
      logIntroductionContextFailure({ ...input, tenantId, propertyId, leaseId: leaseIdRaw, code: error.code, mismatches });
      return error;
    }
    const status = String((lease as any).status || '').toLowerCase();
    if (!INTRODUCTION_APPLICABLE_LEASE_STATUSES.includes(status as any)) {
      const error: IntroductionContextError = {
        ok: false,
        code: INTRODUCTION_LEASE_NOT_APPLICABLE,
        message: 'Introduction lease is not applicable (terminated, expired, or otherwise inactive).'
      };
      logIntroductionContextFailure({ ...input, tenantId, propertyId, leaseId: leaseIdRaw, code: error.code });
      return error;
    }
    return {
      ok: true,
      lease,
      tenantId,
      propertyId,
      leaseId: String((lease as any)._id)
    };
  }

  const candidates = await Lease.find({
    companyId,
    tenantId: new mongoose.Types.ObjectId(tenantId),
    propertyId: new mongoose.Types.ObjectId(propertyId),
    status: { $in: [...INTRODUCTION_APPLICABLE_LEASE_STATUSES] }
  }).select('_id tenantId propertyId rentAmount monthlyRent status startDate endDate').lean();

  if (candidates.length === 1) {
    return {
      ok: true,
      lease: candidates[0],
      tenantId,
      propertyId,
      leaseId: String((candidates[0] as any)._id)
    };
  }

  const error: IntroductionContextError = {
    ok: false,
    code: INTRODUCTION_LEASE_REQUIRED,
    message: 'Introduction payment requires an unambiguous lease.',
    missing: ['leaseId']
  };
  logIntroductionContextFailure({ ...input, tenantId, propertyId, code: error.code, missing: error.missing });
  return error;
}
