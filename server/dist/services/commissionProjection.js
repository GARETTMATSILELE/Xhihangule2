"use strict";
/**
 * Single projection of agent commission lanes from Payment.commissionDetails.
 *
 * Business rule (same agent in both split roles):
 * A person MAY occupy both development-owner-agent and collaborator roles.
 * When that happens, post BOTH role-qualified lanes onto the same AgentAccount.
 * Identities are distinct (`paymentId:owner` vs `paymentId:collaborator`).
 * Do NOT also post the undifferentiated `agentShare` lane.
 * Totals equal ownerAgentShare + collaboratorAgentShare (normally the full agentShare).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.commissionIdentity = commissionIdentity;
exports.commissionReference = commissionReference;
exports.commissionReversalReference = commissionReversalReference;
exports.inferCommissionRoleFromReference = inferCommissionRoleFromReference;
exports.projectCommissionLanes = projectCommissionLanes;
exports.sameAgentOccupiesBothSplitRoles = sameAgentOccupiesBothSplitRoles;
function commissionIdentity(paymentId, role) {
    return `${String(paymentId)}:${role}`;
}
function commissionReference(paymentId, role) {
    if (role === 'agent')
        return String(paymentId);
    return `${String(paymentId)}-${role}`;
}
function commissionReversalReference(paymentId, role) {
    return `REV-${String(paymentId)}-${role}`;
}
function inferCommissionRoleFromReference(reference) {
    const ref = String(reference || '');
    if (ref.endsWith('-owner') || ref.includes(':owner'))
        return 'owner';
    if (ref.endsWith('-collaborator') || ref.includes(':collaborator'))
        return 'collaborator';
    return 'agent';
}
function projectCommissionLanes(payment) {
    if (!payment)
        return [];
    const paymentId = String(payment._id || payment.id || '');
    if (!paymentId)
        return [];
    const details = payment.commissionDetails || {};
    const split = details.agentSplit;
    const paymentType = String(payment.paymentType || '');
    const isSaleSplit = paymentType === 'sale' && split && typeof split === 'object';
    if (isSaleSplit) {
        const ownerId = split.ownerUserId ? String(split.ownerUserId) : '';
        const collabId = split.collaboratorUserId ? String(split.collaboratorUserId) : '';
        const ownerAmt = Number(split.ownerAgentShare || 0);
        const collabAmt = Number(split.collaboratorAgentShare || 0);
        const lanes = [];
        if (ownerId && ownerAmt > 0) {
            lanes.push({
                agentId: ownerId,
                amount: ownerAmt,
                role: 'owner',
                identity: commissionIdentity(paymentId, 'owner'),
                reference: commissionReference(paymentId, 'owner')
            });
        }
        if (collabId && collabAmt > 0) {
            lanes.push({
                agentId: collabId,
                amount: collabAmt,
                role: 'collaborator',
                identity: commissionIdentity(paymentId, 'collaborator'),
                reference: commissionReference(paymentId, 'collaborator')
            });
        }
        if (lanes.length > 0)
            return lanes;
    }
    const agentId = payment.agentId ? String(payment.agentId) : '';
    const amount = Number(details.agentShare || 0);
    if (agentId && amount > 0) {
        return [{
                agentId,
                amount,
                role: 'agent',
                identity: commissionIdentity(paymentId, 'agent'),
                reference: commissionReference(paymentId, 'agent')
            }];
    }
    return [];
}
function sameAgentOccupiesBothSplitRoles(lanes) {
    if (lanes.length < 2)
        return false;
    const owner = lanes.find((l) => l.role === 'owner');
    const collab = lanes.find((l) => l.role === 'collaborator');
    return Boolean(owner && collab && owner.agentId === collab.agentId);
}
