import { AppError } from '../middleware/errorHandler';
import {
  APPLICATION_STATUSES,
  ApplicationStatus,
  AUTHORISED_JOB_STATUSES,
  CONTRACTOR_JOB_STATUSES,
  ContractorJobStatus,
  ECOSYSTEM_MAINTENANCE_STATUSES,
  EcosystemMaintenanceStatus,
  QUOTE_STATUSES,
  QuoteStatus,
  VIEWING_STATUSES,
  ViewingStatus,
} from './constants';

function assertTransition<T extends string>(
  current: T,
  next: T,
  allowed: Record<string, readonly T[]>,
  label: string
): void {
  const options = allowed[current] || [];
  if (!options.includes(next)) {
    throw new AppError(`Cannot move ${label} from ${current} to ${next}`, 400, 'INVALID_STATE_TRANSITION');
  }
}

const VIEWING_TRANSITIONS: Record<string, readonly ViewingStatus[]> = {
  REQUESTED: ['UNDER_REVIEW', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'RESCHEDULED'],
  UNDER_REVIEW: ['CONFIRMED', 'DECLINED', 'CANCELLED', 'RESCHEDULED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'RESCHEDULED'],
  RESCHEDULED: ['CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  DECLINED: [],
};

const APPLICATION_TRANSITIONS: Record<string, readonly ApplicationStatus[]> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['UNDER_REVIEW', 'WITHDRAWN', 'MORE_INFORMATION_REQUIRED'],
  UNDER_REVIEW: ['SHORTLISTED', 'APPROVED', 'DECLINED', 'MORE_INFORMATION_REQUIRED', 'WITHDRAWN'],
  SHORTLISTED: ['SENT_TO_OWNER', 'UNDER_REVIEW', 'WITHDRAWN'],
  SENT_TO_OWNER: ['OWNER_APPROVED', 'OWNER_DECLINED', 'UNDER_REVIEW'],
  OWNER_APPROVED: ['LEASE_PREPARATION'],
  OWNER_DECLINED: [],
  MORE_INFORMATION_REQUIRED: ['SUBMITTED', 'UNDER_REVIEW', 'WITHDRAWN', 'DECLINED'],
  APPROVED: ['LEASE_PREPARATION', 'DECLINED'],
  LEASE_PREPARATION: ['LEASE_SIGNED', 'DECLINED'],
  DECLINED: [],
  WITHDRAWN: [],
  LEASE_SIGNED: [],
};

const MAINTENANCE_TRANSITIONS: Record<string, readonly EcosystemMaintenanceStatus[]> = {
  REPORTED: ['UNDER_REVIEW', 'CLOSED'],
  UNDER_REVIEW: ['QUOTE_REQUESTED', 'CLOSED', 'DECLINED'],
  QUOTE_REQUESTED: ['QUOTE_RECEIVED', 'CLOSED'],
  QUOTE_RECEIVED: ['OWNER_APPROVAL', 'QUOTE_REQUESTED', 'CLOSED'],
  OWNER_APPROVAL: ['APPROVED', 'DECLINED', 'QUOTE_REQUESTED'],
  APPROVED: ['AUTHORISED', 'CONTRACTOR_ASSIGNED'],
  CONTRACTOR_ASSIGNED: ['AUTHORISED'],
  AUTHORISED: ['SCHEDULED', 'WORK_IN_PROGRESS', 'CLOSED'],
  SCHEDULED: ['WORK_IN_PROGRESS', 'COMPLETED'],
  WORK_IN_PROGRESS: ['COMPLETED'],
  COMPLETED: ['TENANT_CONFIRMATION', 'REOPENED'],
  TENANT_CONFIRMATION: ['CLOSED', 'REOPENED'],
  REOPENED: ['UNDER_REVIEW', 'QUOTE_REQUESTED', 'WORK_IN_PROGRESS'],
  CLOSED: [],
  DECLINED: ['QUOTE_REQUESTED', 'UNDER_REVIEW'],
};

const QUOTE_TRANSITIONS: Record<string, readonly QuoteStatus[]> = {
  DRAFT: ['INVITED', 'SUBMITTED', 'WITHDRAWN'],
  INVITED: ['SUBMITTED', 'WITHDRAWN', 'EXPIRED'],
  SUBMITTED: ['UNDER_REVIEW', 'SHORTLISTED', 'SELECTED', 'WITHDRAWN', 'EXPIRED'],
  UNDER_REVIEW: ['SHORTLISTED', 'SELECTED', 'WITHDRAWN'],
  SHORTLISTED: ['SELECTED', 'UNDER_REVIEW'],
  SELECTED: ['SENT_TO_OWNER', 'UNDER_REVIEW'],
  SENT_TO_OWNER: ['OWNER_APPROVED', 'OWNER_DECLINED', 'UNDER_REVIEW'],
  OWNER_APPROVED: [],
  OWNER_DECLINED: [],
  EXPIRED: [],
  WITHDRAWN: [],
};

const JOB_TRANSITIONS: Record<string, readonly ContractorJobStatus[]> = {
  INVITED: ['QUOTE_REQUESTED', 'CANCELLED'],
  QUOTE_REQUESTED: ['QUOTE_SUBMITTED', 'CANCELLED'],
  QUOTE_SUBMITTED: ['SELECTED', 'CANCELLED'],
  SELECTED: ['AUTHORISED', 'CANCELLED'],
  AUTHORISED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['SCHEDULED', 'WORK_IN_PROGRESS', 'CANCELLED'],
  SCHEDULED: ['WORK_IN_PROGRESS', 'CANCELLED'],
  WORK_IN_PROGRESS: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['CLOSED', 'DISPUTED'],
  DISPUTED: ['WORK_IN_PROGRESS', 'CLOSED', 'CANCELLED'],
  CANCELLED: [],
  CLOSED: [],
};

export function assertViewingTransition(current: ViewingStatus, next: ViewingStatus): void {
  if (!(VIEWING_STATUSES as readonly string[]).includes(next)) {
    throw new AppError('Invalid viewing status', 400, 'VALIDATION_ERROR');
  }
  assertTransition(current, next, VIEWING_TRANSITIONS, 'viewing');
}

export function assertApplicationTransition(current: ApplicationStatus, next: ApplicationStatus): void {
  if (!(APPLICATION_STATUSES as readonly string[]).includes(next)) {
    throw new AppError('Invalid application status', 400, 'VALIDATION_ERROR');
  }
  assertTransition(current, next, APPLICATION_TRANSITIONS, 'application');
}

export function assertMaintenanceTransition(current: EcosystemMaintenanceStatus, next: EcosystemMaintenanceStatus): void {
  if (!(ECOSYSTEM_MAINTENANCE_STATUSES as readonly string[]).includes(next)) {
    throw new AppError('Invalid maintenance status', 400, 'VALIDATION_ERROR');
  }
  assertTransition(current, next, MAINTENANCE_TRANSITIONS, 'maintenance');
}

export function assertQuoteTransition(current: QuoteStatus, next: QuoteStatus): void {
  if (!(QUOTE_STATUSES as readonly string[]).includes(next)) {
    throw new AppError('Invalid quote status', 400, 'VALIDATION_ERROR');
  }
  assertTransition(current, next, QUOTE_TRANSITIONS, 'quote');
}

export function assertJobTransition(current: ContractorJobStatus, next: ContractorJobStatus): void {
  if (!(CONTRACTOR_JOB_STATUSES as readonly string[]).includes(next)) {
    throw new AppError('Invalid job status', 400, 'VALIDATION_ERROR');
  }
  assertTransition(current, next, JOB_TRANSITIONS, 'contractor job');
}

export function canAuthoriseWork(params: {
  ownerApproved: boolean;
  agentAuthorised?: boolean;
}): boolean {
  return Boolean(params.ownerApproved);
}

export function assertWorkMayStart(params: {
  ownerApproved: boolean;
  agentAuthorised: boolean;
  status: ContractorJobStatus;
}): void {
  if (!params.ownerApproved || !params.agentAuthorised) {
    throw new AppError(
      'Contractor cannot start work until the owner has approved the quote and the agent has authorised the job',
      403,
      'WORK_NOT_AUTHORISED'
    );
  }
  if (!AUTHORISED_JOB_STATUSES.includes(params.status) && params.status !== 'AUTHORISED' && params.status !== 'ACCEPTED') {
    throw new AppError('Job is not authorised', 403, 'WORK_NOT_AUTHORISED');
  }
}

export function assertQuoteNotLocked(status?: string): void {
  if (status === 'OWNER_APPROVED') {
    throw new AppError(
      'An owner-approved quote cannot be edited. Submit a change order for additional work.',
      409,
      'QUOTE_LOCKED'
    );
  }
}

export { VIEWING_TRANSITIONS, APPLICATION_TRANSITIONS, MAINTENANCE_TRANSITIONS, QUOTE_TRANSITIONS, JOB_TRANSITIONS };
