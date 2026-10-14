"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOB_TRANSITIONS = exports.QUOTE_TRANSITIONS = exports.MAINTENANCE_TRANSITIONS = exports.APPLICATION_TRANSITIONS = exports.VIEWING_TRANSITIONS = void 0;
exports.assertViewingTransition = assertViewingTransition;
exports.assertApplicationTransition = assertApplicationTransition;
exports.assertMaintenanceTransition = assertMaintenanceTransition;
exports.assertQuoteTransition = assertQuoteTransition;
exports.assertJobTransition = assertJobTransition;
exports.canAuthoriseWork = canAuthoriseWork;
exports.assertWorkMayStart = assertWorkMayStart;
exports.assertQuoteNotLocked = assertQuoteNotLocked;
const errorHandler_1 = require("../middleware/errorHandler");
const constants_1 = require("./constants");
function assertTransition(current, next, allowed, label) {
    const options = allowed[current] || [];
    if (!options.includes(next)) {
        throw new errorHandler_1.AppError(`Cannot move ${label} from ${current} to ${next}`, 400, 'INVALID_STATE_TRANSITION');
    }
}
const VIEWING_TRANSITIONS = {
    REQUESTED: ['UNDER_REVIEW', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'RESCHEDULED'],
    UNDER_REVIEW: ['CONFIRMED', 'DECLINED', 'CANCELLED', 'RESCHEDULED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED', 'RESCHEDULED'],
    RESCHEDULED: ['CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED'],
    COMPLETED: [],
    CANCELLED: [],
    DECLINED: [],
};
exports.VIEWING_TRANSITIONS = VIEWING_TRANSITIONS;
const APPLICATION_TRANSITIONS = {
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
exports.APPLICATION_TRANSITIONS = APPLICATION_TRANSITIONS;
const MAINTENANCE_TRANSITIONS = {
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
exports.MAINTENANCE_TRANSITIONS = MAINTENANCE_TRANSITIONS;
const QUOTE_TRANSITIONS = {
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
exports.QUOTE_TRANSITIONS = QUOTE_TRANSITIONS;
const JOB_TRANSITIONS = {
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
exports.JOB_TRANSITIONS = JOB_TRANSITIONS;
function assertViewingTransition(current, next) {
    if (!constants_1.VIEWING_STATUSES.includes(next)) {
        throw new errorHandler_1.AppError('Invalid viewing status', 400, 'VALIDATION_ERROR');
    }
    assertTransition(current, next, VIEWING_TRANSITIONS, 'viewing');
}
function assertApplicationTransition(current, next) {
    if (!constants_1.APPLICATION_STATUSES.includes(next)) {
        throw new errorHandler_1.AppError('Invalid application status', 400, 'VALIDATION_ERROR');
    }
    assertTransition(current, next, APPLICATION_TRANSITIONS, 'application');
}
function assertMaintenanceTransition(current, next) {
    if (!constants_1.ECOSYSTEM_MAINTENANCE_STATUSES.includes(next)) {
        throw new errorHandler_1.AppError('Invalid maintenance status', 400, 'VALIDATION_ERROR');
    }
    assertTransition(current, next, MAINTENANCE_TRANSITIONS, 'maintenance');
}
function assertQuoteTransition(current, next) {
    if (!constants_1.QUOTE_STATUSES.includes(next)) {
        throw new errorHandler_1.AppError('Invalid quote status', 400, 'VALIDATION_ERROR');
    }
    assertTransition(current, next, QUOTE_TRANSITIONS, 'quote');
}
function assertJobTransition(current, next) {
    if (!constants_1.CONTRACTOR_JOB_STATUSES.includes(next)) {
        throw new errorHandler_1.AppError('Invalid job status', 400, 'VALIDATION_ERROR');
    }
    assertTransition(current, next, JOB_TRANSITIONS, 'contractor job');
}
function canAuthoriseWork(params) {
    return Boolean(params.ownerApproved);
}
function assertWorkMayStart(params) {
    if (!params.ownerApproved || !params.agentAuthorised) {
        throw new errorHandler_1.AppError('Contractor cannot start work until the owner has approved the quote and the agent has authorised the job', 403, 'WORK_NOT_AUTHORISED');
    }
    if (!constants_1.AUTHORISED_JOB_STATUSES.includes(params.status) && params.status !== 'AUTHORISED' && params.status !== 'ACCEPTED') {
        throw new errorHandler_1.AppError('Job is not authorised', 403, 'WORK_NOT_AUTHORISED');
    }
}
function assertQuoteNotLocked(status) {
    if (status === 'OWNER_APPROVED') {
        throw new errorHandler_1.AppError('An owner-approved quote cannot be edited. Submit a change order for additional work.', 409, 'QUOTE_LOCKED');
    }
}
