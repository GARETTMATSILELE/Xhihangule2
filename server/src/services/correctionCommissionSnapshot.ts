/**
 * Commission snapshot for a rental correction draft.
 * Uses the same property commission and dated VAT path as a new rental receipt.
 * The original payment is never rewritten. The draft is finalized only when the
 * stored allocation, commission split, VAT, and owner payable agree.
 */
import { Property } from '../models/Property';
import { CommissionService, applyLevyPassThroughToSnapshot } from './commissionService';
import { prepareIntroductionRentalCommission } from './introductionCommissionService';
import { allocationBalances } from './tax/paymentAllocation';
import { commissionVatFlagsFromPolicy, resolveCommissionVatPolicy, stampVatDecision } from './vatPolicyService';
import { roundMoney } from '../utils/money';

export type RentalCorrectionCommission = {
  snapshot: any;
  agrees: boolean;
  applyVatOnCommission: boolean;
  vatOnCommissionRate: number;
  vatCommissionTreatment?: string;
};

export function rentalCorrectionSnapshotAgrees(snapshot: any, grossAmount: number): boolean {
  const allocation = snapshot?.paymentAllocation;
  if (!allocation || allocation.source !== 'canonical_payment_allocation') return false;
  if (!allocationBalances(allocation)) return false;
  const gross = roundMoney(Math.max(0, Number(grossAmount || 0)));
  const levy = roundMoney(Math.max(0, Number(snapshot?.levy ?? allocation.levy ?? 0)));
  const allocationGross = roundMoney(Number(allocation.grossAmount || 0));
  const allocationRent = roundMoney(Number(allocation.rent || 0));
  const grossMatches = Math.abs(allocationGross - roundMoney(gross + levy)) <= 0.02
    || Math.abs(allocationRent - gross) <= 0.02;
  if (!grossMatches) return false;
  const owner = roundMoney(Number(snapshot?.ownerAmount || 0));
  const expectedOwner = roundMoney(Number(allocation.ownerPayable || 0) + Number(allocation.levyPayable || 0));
  if (Math.abs(owner - expectedOwner) > 0.02) return false;
  const vat = roundMoney(Number(snapshot?.vatOnCommission ?? 0));
  if (Math.abs(vat - roundMoney(Number(allocation.vatOnCommission || 0))) > 0.02) return false;
  const net = roundMoney(Number(snapshot?.commissionNet ?? snapshot?.totalCommission ?? 0));
  if (Math.abs(net - roundMoney(Number(allocation.commissionNet || 0))) > 0.02) return false;
  const parts = roundMoney(
    Number(snapshot?.agentShare || 0) + Number(snapshot?.agencyShare || 0) + Number(snapshot?.preaFee || 0)
  );
  return Math.abs(parts - net) <= 0.05;
}

export async function buildRentalCorrectionCommission(source: any): Promise<RentalCorrectionCommission> {
  const property = source?.propertyId
    ? await Property.findById(source.propertyId)
      .select('commission vatOnCommission vatCommissionTreatment rentalType rent')
      .lean()
    : null;
  const paymentDate = source?.paymentDate ? new Date(source.paymentDate) : new Date();
  const amount = Math.max(0, Number(source?.amount || 0));
  const levy = Math.max(0, Number(source?.levyAllocated || 0));
  const isIntroduction = String(source?.paymentType || (property as any)?.rentalType || '').toLowerCase() === 'introduction';
  const policy = await resolveCommissionVatPolicy({
    companyId: String(source?.companyId || ''),
    paymentDate,
    property: {
      vatOnCommission: Boolean((property as any)?.vatOnCommission),
      vatCommissionTreatment: (property as any)?.vatCommissionTreatment
    },
    requestedVatOnCommission: Boolean((property as any)?.vatOnCommission),
    requestedTreatment: (property as any)?.vatCommissionTreatment,
    commissionType: isIntroduction ? 'introduction' : 'management'
  });
  const flags = commissionVatFlagsFromPolicy(policy);
  if (isIntroduction) {
    const prepared = await prepareIntroductionRentalCommission({
      companyId: String(source?.companyId || ''),
      propertyId: source.propertyId,
      tenantId: source.tenantId,
      leaseId: source.leaseId,
      rentAllocated: amount,
      levyAllocated: levy,
      vatOnCommission: flags.vatOnCommission,
      vatTreatment: flags.vatTreatment,
      vatRate: flags.vatRate,
      paymentDate,
      propertyRent: Number((property as any)?.rent || amount),
      rentUsed: Number(source?.rentUsed || (property as any)?.rent || amount)
    });
    if (!prepared.ok) {
      return {
        snapshot: source?.commissionDetails || {},
        agrees: false,
        applyVatOnCommission: flags.vatOnCommission,
        vatOnCommissionRate: Number(flags.vatRate || 0),
        vatCommissionTreatment: flags.vatTreatment
      };
    }
    const snapshot = stampVatDecision(prepared.snapshot, policy);
    return {
      snapshot,
      agrees: rentalCorrectionSnapshotAgrees(snapshot, amount),
      applyVatOnCommission: Boolean(prepared.result?.vatOnCommission),
      vatOnCommissionRate: Number(prepared.result?.vatRate || flags.vatRate || 0),
      vatCommissionTreatment: prepared.result?.vatTreatment || flags.vatTreatment
    };
  }
  const result = await CommissionService.calculateForProperty({
    companyId: source.companyId,
    grossRent: amount,
    levy,
    commissionPercentage: Number((property as any)?.commission || 0),
    vatOnCommission: flags.vatOnCommission,
    vatTreatment: flags.vatTreatment,
    vatRate: flags.vatRate,
    paymentDate,
    commissionType: 'management'
  });
  const snapshot = stampVatDecision(applyLevyPassThroughToSnapshot(result, amount, levy), policy);
  return {
    snapshot,
    agrees: rentalCorrectionSnapshotAgrees(snapshot, amount),
    applyVatOnCommission: Boolean(result.vatOnCommission),
    vatOnCommissionRate: Number(result.vatRate || 0),
    vatCommissionTreatment: result.vatTreatment
  };
}
