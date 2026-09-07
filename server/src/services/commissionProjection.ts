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

export type CommissionRole = 'agent' | 'owner' | 'collaborator';

export type CommissionLane = {
  agentId: string;
  amount: number;
  role: CommissionRole;
  /** Deterministic identity: `${paymentId}:${role}` */
  identity: string;
  /** Ledger reference stored on AgentAccount.transactions.reference */
  reference: string;
};

export function commissionIdentity(paymentId: string, role: CommissionRole): string {
  return `${String(paymentId)}:${role}`;
}

export function commissionReference(paymentId: string, role: CommissionRole): string {
  if (role === 'agent') return String(paymentId);
  return `${String(paymentId)}-${role}`;
}

export function commissionReversalReference(paymentId: string, role: CommissionRole): string {
  return `REV-${String(paymentId)}-${role}`;
}

export function inferCommissionRoleFromReference(reference: string): CommissionRole {
  const ref = String(reference || '');
  if (ref.endsWith('-owner') || ref.includes(':owner')) return 'owner';
  if (ref.endsWith('-collaborator') || ref.includes(':collaborator')) return 'collaborator';
  return 'agent';
}

export function projectCommissionLanes(payment: any): CommissionLane[] {
  if (!payment) return [];
  const paymentId = String(payment._id || payment.id || '');
  if (!paymentId) return [];

  const details = payment.commissionDetails || {};
  const split = details.agentSplit;
  const paymentType = String(payment.paymentType || '');
  const isSaleSplit = paymentType === 'sale' && split && typeof split === 'object';

  if (isSaleSplit) {
    const ownerId = split.ownerUserId ? String(split.ownerUserId) : '';
    const collabId = split.collaboratorUserId ? String(split.collaboratorUserId) : '';
    const ownerAmt = Number(split.ownerAgentShare || 0);
    const collabAmt = Number(split.collaboratorAgentShare || 0);
    const lanes: CommissionLane[] = [];
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
    if (lanes.length > 0) return lanes;
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

export function sameAgentOccupiesBothSplitRoles(lanes: CommissionLane[]): boolean {
  if (lanes.length < 2) return false;
  const owner = lanes.find((l) => l.role === 'owner');
  const collab = lanes.find((l) => l.role === 'collaborator');
  return Boolean(owner && collab && owner.agentId === collab.agentId);
}
