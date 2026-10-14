export type AssessmentStatus = 'ASSESSMENT_DRAFT' | 'ASSESSMENT_SUBMITTED' | 'OWNER_APPROVED' | 'OWNER_REJECTED';
export type MandateStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'DECLINED' | 'EXPIRED';
export type ListingStatus = 'PRE_LISTING' | 'ACTIVE' | 'REMOVED';

const ASSESSMENT_NEXT: Record<AssessmentStatus, AssessmentStatus[]> = {
  ASSESSMENT_DRAFT: ['ASSESSMENT_SUBMITTED'],
  ASSESSMENT_SUBMITTED: ['OWNER_APPROVED', 'OWNER_REJECTED'],
  OWNER_APPROVED: [],
  OWNER_REJECTED: ['ASSESSMENT_DRAFT'],
};

const MANDATE_NEXT: Record<MandateStatus, MandateStatus[]> = {
  DRAFT: ['SENT', 'DECLINED'],
  SENT: ['SIGNED', 'DECLINED', 'EXPIRED'],
  SIGNED: ['EXPIRED'],
  DECLINED: [],
  EXPIRED: [],
};

export function assertAssessmentTransition(current: AssessmentStatus, next: AssessmentStatus): void {
  if (!ASSESSMENT_NEXT[current]?.includes(next)) {
    const error = new Error(`Assessment cannot move from ${current} to ${next}`);
    (error as any).status = 409;
    throw error;
  }
}

export function assertMandateTransition(current: MandateStatus, next: MandateStatus): void {
  if (!MANDATE_NEXT[current]?.includes(next)) {
    const error = new Error(`Mandate cannot move from ${current} to ${next}`);
    (error as any).status = 409;
    throw error;
  }
}

export function listingBlockers(input: { assessmentStatus?: string; mandateStatus?: string }): string[] {
  const blockers: string[] = [];
  if (input.assessmentStatus !== 'OWNER_APPROVED') blockers.push('Owner approval of the assessment is required');
  if (input.mandateStatus !== 'SIGNED') blockers.push('Signed rental mandate required');
  return blockers;
}

export function leaseActivationBlockers(input: {
  applicationStatus?: string;
  tenantSignedAt?: Date | string | null;
  ownerSignedAt?: Date | string | null;
  depositRequired: number;
  depositReceived: number;
}): string[] {
  const blockers: string[] = [];
  if (input.applicationStatus !== 'OWNER_APPROVED') blockers.push('Owner approval required');
  if (!input.tenantSignedAt) blockers.push('Tenant signature required');
  if (Number(input.depositRequired) > 0 && Number(input.depositReceived) + 0.001 < Number(input.depositRequired)) {
    blockers.push('Deposit payment outstanding');
  }
  if (!input.ownerSignedAt) blockers.push('Owner signature required');
  return blockers;
}

export function classifyRentCollection(input: {
  dueDate: Date;
  rent: number;
  received: number;
  now: Date;
}): 'DUE' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID' {
  const rent = Number(input.rent) || 0;
  const received = Number(input.received) || 0;
  if (rent > 0 && received + 0.001 >= rent) return 'PAID';
  if (received > 0) return 'PARTIALLY_PAID';
  if (input.now.getTime() > input.dueDate.getTime()) return 'OVERDUE';
  return 'DUE';
}

export function maintenanceRequestBlockers(input: {
  quoteStatus?: string;
  quotePropertyId?: string;
  requestPropertyId?: string;
  quoteCompanyId?: string;
  requestCompanyId?: string;
  approvedAmount: number;
  requestedAmount: number;
  changeOrderApproved?: boolean;
  agentAuthorised?: boolean;
}): string[] {
  const blockers: string[] = [];
  if (input.quoteCompanyId && input.requestCompanyId && input.quoteCompanyId !== input.requestCompanyId) {
    blockers.push('Quote is outside this company');
  }
  if (input.quotePropertyId && input.requestPropertyId && input.quotePropertyId !== input.requestPropertyId) {
    blockers.push('Quote does not belong to this property');
  }
  if (input.quoteStatus !== 'OWNER_APPROVED') blockers.push('Owner quote approval required');
  if (!input.agentAuthorised) blockers.push('Agent authorisation required');
  if (input.requestedAmount > input.approvedAmount + 0.001 && !input.changeOrderApproved) {
    blockers.push('Requested amount exceeds the approved quote');
  }
  return blockers;
}

export function nextAgencyAction(input: {
  assessmentStatus?: string;
  mandateStatus?: string;
  listingStatus?: string;
  applicationsAwaitingReview?: number;
  shortlisted?: number;
  awaitingOwner?: number;
  lease?: { status?: string; tenantSignedAt?: unknown; ownerSignedAt?: unknown; depositOutstanding?: boolean } | null;
  rentStatus?: string;
  collectionStatus?: string;
}): string {
  if (!input.assessmentStatus || input.assessmentStatus === 'ASSESSMENT_DRAFT' || input.assessmentStatus === 'OWNER_REJECTED') {
    return 'Complete assessment';
  }
  if (input.assessmentStatus === 'ASSESSMENT_SUBMITTED') return 'Await owner approval';
  if (input.mandateStatus !== 'SIGNED') return 'Obtain signed mandate';
  if (input.listingStatus !== 'ACTIVE') return 'List property';
  if ((input.applicationsAwaitingReview || 0) > 0) return 'Review applications';
  if ((input.shortlisted || 0) > 0 && !(input.awaitingOwner || 0)) return 'Send shortlist to owner';
  if ((input.awaitingOwner || 0) > 0) return 'Await owner applicant decision';
  if (input.lease && input.lease.status !== 'active') {
    if (!input.lease.tenantSignedAt) return 'Obtain tenant signature';
    if (input.lease.depositOutstanding) return 'Collect deposit';
    if (!input.lease.ownerSignedAt) return 'Obtain owner signature';
    return 'Activate lease';
  }
  if (input.rentStatus === 'DUE' || input.rentStatus === 'OVERDUE' || input.rentStatus === 'PARTIALLY_PAID') return 'Follow up rent';
  if (input.rentStatus === 'PAID' && (!input.collectionStatus || input.collectionStatus === 'NOT_REQUESTED')) return 'Notify owner and prepare collection';
  if (input.collectionStatus === 'OWNER_REQUESTED' || input.collectionStatus === 'READY_FOR_COLLECTION') return 'Prepare owner collection';
  return 'Portfolio is up to date';
}
