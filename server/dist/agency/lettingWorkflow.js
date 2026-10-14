"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertAssessmentTransition = assertAssessmentTransition;
exports.assertMandateTransition = assertMandateTransition;
exports.listingBlockers = listingBlockers;
exports.leaseActivationBlockers = leaseActivationBlockers;
exports.classifyRentCollection = classifyRentCollection;
exports.maintenanceRequestBlockers = maintenanceRequestBlockers;
exports.nextAgencyAction = nextAgencyAction;
const ASSESSMENT_NEXT = {
    ASSESSMENT_DRAFT: ['ASSESSMENT_SUBMITTED'],
    ASSESSMENT_SUBMITTED: ['OWNER_APPROVED', 'OWNER_REJECTED'],
    OWNER_APPROVED: [],
    OWNER_REJECTED: ['ASSESSMENT_DRAFT'],
};
const MANDATE_NEXT = {
    DRAFT: ['SENT', 'DECLINED'],
    SENT: ['SIGNED', 'DECLINED', 'EXPIRED'],
    SIGNED: ['EXPIRED'],
    DECLINED: [],
    EXPIRED: [],
};
function assertAssessmentTransition(current, next) {
    var _a;
    if (!((_a = ASSESSMENT_NEXT[current]) === null || _a === void 0 ? void 0 : _a.includes(next))) {
        const error = new Error(`Assessment cannot move from ${current} to ${next}`);
        error.status = 409;
        throw error;
    }
}
function assertMandateTransition(current, next) {
    var _a;
    if (!((_a = MANDATE_NEXT[current]) === null || _a === void 0 ? void 0 : _a.includes(next))) {
        const error = new Error(`Mandate cannot move from ${current} to ${next}`);
        error.status = 409;
        throw error;
    }
}
function listingBlockers(input) {
    const blockers = [];
    if (input.assessmentStatus !== 'OWNER_APPROVED')
        blockers.push('Owner approval of the assessment is required');
    if (input.mandateStatus !== 'SIGNED')
        blockers.push('Signed rental mandate required');
    return blockers;
}
function leaseActivationBlockers(input) {
    const blockers = [];
    if (input.applicationStatus !== 'OWNER_APPROVED')
        blockers.push('Owner approval required');
    if (!input.tenantSignedAt)
        blockers.push('Tenant signature required');
    if (Number(input.depositRequired) > 0 && Number(input.depositReceived) + 0.001 < Number(input.depositRequired)) {
        blockers.push('Deposit payment outstanding');
    }
    if (!input.ownerSignedAt)
        blockers.push('Owner signature required');
    return blockers;
}
function classifyRentCollection(input) {
    const rent = Number(input.rent) || 0;
    const received = Number(input.received) || 0;
    if (rent > 0 && received + 0.001 >= rent)
        return 'PAID';
    if (received > 0)
        return 'PARTIALLY_PAID';
    if (input.now.getTime() > input.dueDate.getTime())
        return 'OVERDUE';
    return 'DUE';
}
function maintenanceRequestBlockers(input) {
    const blockers = [];
    if (input.quoteCompanyId && input.requestCompanyId && input.quoteCompanyId !== input.requestCompanyId) {
        blockers.push('Quote is outside this company');
    }
    if (input.quotePropertyId && input.requestPropertyId && input.quotePropertyId !== input.requestPropertyId) {
        blockers.push('Quote does not belong to this property');
    }
    if (input.quoteStatus !== 'OWNER_APPROVED')
        blockers.push('Owner quote approval required');
    if (!input.agentAuthorised)
        blockers.push('Agent authorisation required');
    if (input.requestedAmount > input.approvedAmount + 0.001 && !input.changeOrderApproved) {
        blockers.push('Requested amount exceeds the approved quote');
    }
    return blockers;
}
function nextAgencyAction(input) {
    if (!input.assessmentStatus || input.assessmentStatus === 'ASSESSMENT_DRAFT' || input.assessmentStatus === 'OWNER_REJECTED') {
        return 'Complete assessment';
    }
    if (input.assessmentStatus === 'ASSESSMENT_SUBMITTED')
        return 'Await owner approval';
    if (input.mandateStatus !== 'SIGNED')
        return 'Obtain signed mandate';
    if (input.listingStatus !== 'ACTIVE')
        return 'List property';
    if ((input.applicationsAwaitingReview || 0) > 0)
        return 'Review applications';
    if ((input.shortlisted || 0) > 0 && !(input.awaitingOwner || 0))
        return 'Send shortlist to owner';
    if ((input.awaitingOwner || 0) > 0)
        return 'Await owner applicant decision';
    if (input.lease && input.lease.status !== 'active') {
        if (!input.lease.tenantSignedAt)
            return 'Obtain tenant signature';
        if (input.lease.depositOutstanding)
            return 'Collect deposit';
        if (!input.lease.ownerSignedAt)
            return 'Obtain owner signature';
        return 'Activate lease';
    }
    if (input.rentStatus === 'DUE' || input.rentStatus === 'OVERDUE' || input.rentStatus === 'PARTIALLY_PAID')
        return 'Follow up rent';
    if (input.rentStatus === 'PAID' && (!input.collectionStatus || input.collectionStatus === 'NOT_REQUESTED'))
        return 'Notify owner and prepare collection';
    if (input.collectionStatus === 'OWNER_REQUESTED' || input.collectionStatus === 'READY_FOR_COLLECTION')
        return 'Prepare owner collection';
    return 'Portfolio is up to date';
}
