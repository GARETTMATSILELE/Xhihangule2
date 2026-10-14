import mongoose from 'mongoose';
import { DEFAULT_TRUST_JURISDICTION } from '../config/trustJurisdictions';
import { TrustAuditLog } from '../models/TrustAuditLog';
import { ITrustAccount, TrustWorkflowState } from '../models/TrustAccount';
import { ITrustMatter, ITrustMatterDocument, TrustCustodyType, TrustMatter, TrustMatterDocumentType, TrustMatterWorkflowStage } from '../models/TrustMatter';
import { ITrustSettlement } from '../models/TrustSettlement';

const money = (n: number): number => Number(Number(n || 0).toFixed(2));
const toObjectId = (id: string): mongoose.Types.ObjectId => new mongoose.Types.ObjectId(id);
const toOptionalObjectId = (value: any): mongoose.Types.ObjectId | undefined => {
  const id = String(value?._id || value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? toObjectId(id) : undefined;
};

const DOCUMENT_LABELS: Record<TrustMatterDocumentType, string> = {
  AGREEMENT_OF_SALE: 'Agreement of Sale',
  OFFER_LETTER: 'Offer Letter',
  PROOF_OF_PAYMENT: 'Proof of Payment',
  DEPOSIT_SLIP: 'Deposit Slip',
  TRANSFER_DOCUMENTS: 'Transfer Documents',
  CGT_CLEARANCE: 'CGT Clearance',
  RATES_CLEARANCE: 'Rates Clearance',
  COMMISSION_INVOICE: 'Commission Invoice',
  SELLER_STATEMENT: 'Seller Statement',
  BUYER_STATEMENT: 'Buyer Statement',
  TAX_CERTIFICATE: 'Tax Certificate',
  OTHER_DOCUMENTS: 'Other Documents'
};

const WORKFLOW_LABELS: Array<{ key: TrustMatterWorkflowStage; label: string }> = [
  { key: 'TRUST_MATTER_OPENED', label: 'Trust Matter Opened' },
  { key: 'BUYER_DEPOSIT_RECEIVED', label: 'Buyer Deposit Received' },
  { key: 'FUNDS_HELD', label: 'Funds Held' },
  { key: 'SETTLEMENT_CALCULATED', label: 'Settlement Calculated' },
  { key: 'SETTLEMENT_APPROVED', label: 'Settlement Approved' },
  { key: 'FUNDS_ALLOCATED', label: 'Funds Allocated' },
  { key: 'SELLER_PAID', label: 'Seller Paid' },
  { key: 'TAXES_PAID', label: 'Tax Deductions Recorded (not ZIMRA remittance)' },
  { key: 'TRUST_BALANCED', label: 'Trust Balanced' },
  { key: 'TRUST_CLOSED', label: 'Trust Closed' }
];

const readableAuditAction = (rawAction?: unknown): string => {
  const action = String(rawAction || '').toUpperCase();
  const map: Record<string, string> = {
    CREATED: 'Trust Matter Opened',
    POSTED: 'Trust Transaction Posted',
    BALANCE_UPDATED: 'Trust Balance Updated',
    CALCULATED: 'Settlement Calculated',
    TAX_APPLIED: 'Taxes Applied',
    CLOSED: 'Trust Closed',
    WORKFLOW_STATE_CHANGED: 'Workflow Updated',
    INVARIANT_AUTO_REPAIRED: 'Ledger Invariant Repaired',
    DUPLICATE_IGNORED: 'Duplicate Event Ignored',
    DUPLICATE_KEY_IGNORED: 'Duplicate Event Ignored',
    CUSTODY_UPDATED: 'Custody Updated',
    DOCUMENTS_UPDATED: 'Supporting Documents Updated'
  };
  return map[action] || String(rawAction || 'Trust Event');
};

const readableTransactionType = (rawType?: unknown): string => {
  const type = String(rawType || '').toUpperCase();
  const map: Record<string, string> = {
    BUYER_PAYMENT: 'Buyer Payment',
    CGT_DEDUCTION: 'CGT Deduction',
    COMMISSION_DEDUCTION: 'Commission Deduction',
    VAT_DEDUCTION: 'VAT Deduction',
    VAT_ON_COMMISSION: 'VAT on Commission',
    TRANSFER_TO_SELLER: 'Transfer to Seller',
    REFUND: 'Refund'
  };
  return map[type] || String(rawType || 'Trust Transaction');
};

const stageFromAccount = (account: ITrustAccount): TrustMatterWorkflowStage => {
  const state = String(account.workflowState || '') as TrustWorkflowState;
  if (account.status === 'CLOSED' || state === 'TRUST_CLOSED') return 'TRUST_CLOSED';
  if (state === 'TRANSFER_COMPLETE') return 'SELLER_PAID';
  if (state === 'SETTLED') return 'FUNDS_ALLOCATED';
  if (state === 'TAX_PENDING') return 'SETTLEMENT_CALCULATED';
  if (state === 'DEPOSIT_RECEIVED') return 'BUYER_DEPOSIT_RECEIVED';
  if (state === 'TRUST_OPEN') return 'FUNDS_HELD';
  return 'TRUST_MATTER_OPENED';
};

const buildMatterNumber = (account: ITrustAccount): string => {
  const openedYear = new Date(account.createdAt || Date.now()).getFullYear();
  return `TM-${openedYear}-${String(account._id).slice(-8).toUpperCase()}`;
};

class TrustMatterService {
  private indexesEnsured = false;

  private async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) return;
    await Promise.all([
      TrustMatter.collection.createIndex({ trustAccountId: 1 }, { unique: true }),
      TrustMatter.collection.createIndex({ companyId: 1, matterNumber: 1 }, { unique: true }),
      TrustMatter.collection.createIndex({ companyId: 1, status: 1, workflowStage: 1, createdAt: -1 })
    ]);
    this.indexesEnsured = true;
  }

  private defaultDocuments(existing?: ITrustMatterDocument[]): ITrustMatterDocument[] {
    const byType = new Map((existing || []).map((document) => [document.type, document]));
    return (Object.keys(DOCUMENT_LABELS) as TrustMatterDocumentType[]).map((type) => ({
      type,
      label: DOCUMENT_LABELS[type],
      status: byType.get(type)?.status || 'MISSING',
      fileId: byType.get(type)?.fileId,
      fileName: byType.get(type)?.fileName,
      reference: byType.get(type)?.reference,
      notes: byType.get(type)?.notes,
      receivedAt: byType.get(type)?.receivedAt,
      approvedAt: byType.get(type)?.approvedAt,
      updatedBy: byType.get(type)?.updatedBy,
      updatedAt: byType.get(type)?.updatedAt
    }));
  }

  async getForTrustAccount(companyId: string, trustAccountId: string): Promise<ITrustMatter | null> {
    return TrustMatter.findOne({
      companyId: toObjectId(companyId),
      trustAccountId: toObjectId(trustAccountId)
    });
  }

  async ensureForTrustAccount(input: {
    companyId: string;
    account: ITrustAccount | Record<string, any>;
    property?: Record<string, any> | null;
    responsibleAccountant?: string;
  }): Promise<ITrustMatter> {
    await this.ensureIndexes();
    const account = input.account as any;
    const accountId = String(account?._id || '');
    const propertyId = String(account?.propertyId?._id || account?.propertyId || '');
    if (!accountId || !propertyId) throw new Error('Trust account and property are required to ensure a trust matter');

    const status = String(account?.status || 'OPEN') as 'OPEN' | 'SETTLED' | 'CLOSED';
    const purchasePrice = money(Number(input.property?.price || account?.purchasePrice || 0));
    const workflowStage = stageFromAccount(account as ITrustAccount);
    const jurisdiction = DEFAULT_TRUST_JURISDICTION;

    const setFields: Record<string, unknown> = {
      purchasePrice,
      status,
      settlementStatus: status === 'CLOSED' ? 'CLOSED' : status === 'SETTLED' ? 'SETTLED' : 'PENDING',
      workflowStage,
      dateClosed: account?.closedAt || undefined
    };
    const buyerId = toOptionalObjectId(account?.buyerId);
    const sellerId = toOptionalObjectId(account?.sellerId);
    const responsibleAccountant = toOptionalObjectId(input.responsibleAccountant);
    if (buyerId) setFields.buyerId = buyerId;
    if (sellerId) setFields.sellerId = sellerId;
    if (account?.dealId) setFields.dealId = account.dealId;
    if (responsibleAccountant) setFields.responsibleAccountant = responsibleAccountant;

    const matter = await TrustMatter.findOneAndUpdate(
      { companyId: toObjectId(input.companyId), trustAccountId: toObjectId(accountId) },
      {
        $set: setFields,
        $setOnInsert: {
          companyId: toObjectId(input.companyId),
          trustAccountId: toObjectId(accountId),
          propertyId: toObjectId(propertyId),
          matterNumber: buildMatterNumber(account as ITrustAccount),
          custodyType: jurisdiction.defaultCustody,
          custodyDetails: {},
          dateOpened: account?.createdAt || new Date(),
          jurisdiction,
          documents: this.defaultDocuments(),
          reconciliationMetadata: {}
        }
      },
      { upsert: true, new: true }
    );

    if (!matter) throw new Error('Failed to ensure trust matter');
    if (!Array.isArray(matter.documents) || matter.documents.length < Object.keys(DOCUMENT_LABELS).length) {
      matter.documents = this.defaultDocuments(matter.documents);
      await matter.save();
    }
    return matter;
  }

  async updateCustody(input: {
    companyId: string;
    trustAccountId: string;
    custodyType: TrustCustodyType;
    custodyDetails?: Record<string, unknown>;
    performedBy?: string;
  }): Promise<ITrustMatter> {
    await this.ensureIndexes();
    const matter = await TrustMatter.findOne({
      companyId: toObjectId(input.companyId),
      trustAccountId: toObjectId(input.trustAccountId)
    });
    if (!matter) throw new Error('Trust matter not found');

    const before = matter.toObject() as unknown as Record<string, unknown>;
    matter.custodyType = input.custodyType;
    matter.custodyDetails = input.custodyDetails || {};
    await matter.save();
    await this.auditMatterChange({
      companyId: input.companyId,
      matter,
      action: 'CUSTODY_UPDATED',
      sourceEvent: 'trust.matter.custody.updated',
      oldValue: before,
      newValue: matter.toObject() as unknown as Record<string, unknown>,
      performedBy: input.performedBy
    });
    return matter;
  }

  async upsertDocuments(input: {
    companyId: string;
    trustAccountId: string;
    documents: Partial<ITrustMatterDocument>[];
    performedBy?: string;
  }): Promise<ITrustMatter> {
    await this.ensureIndexes();
    const matter = await TrustMatter.findOne({
      companyId: toObjectId(input.companyId),
      trustAccountId: toObjectId(input.trustAccountId)
    });
    if (!matter) throw new Error('Trust matter not found');

    const before = matter.toObject() as unknown as Record<string, unknown>;
    const byType = new Map(this.defaultDocuments(matter.documents).map((document) => [document.type, document]));
    for (const document of input.documents) {
      const type = String(document.type || '') as TrustMatterDocumentType;
      if (!DOCUMENT_LABELS[type]) continue;
      const existing = byType.get(type) || { type, label: DOCUMENT_LABELS[type], status: 'MISSING' as const };
      byType.set(type, {
        ...existing,
        label: String(document.label || existing.label || DOCUMENT_LABELS[type]),
        status: (document.status || existing.status || 'MISSING') as ITrustMatterDocument['status'],
        fileId: document.fileId,
        fileName: document.fileName,
        reference: document.reference,
        notes: document.notes,
        receivedAt: document.receivedAt,
        approvedAt: document.approvedAt,
        updatedBy: input.performedBy ? toObjectId(input.performedBy) : existing.updatedBy,
        updatedAt: new Date()
      });
    }
    matter.documents = (Object.keys(DOCUMENT_LABELS) as TrustMatterDocumentType[]).map((type) => byType.get(type) as ITrustMatterDocument);
    await matter.save();
    await this.auditMatterChange({
      companyId: input.companyId,
      matter,
      action: 'DOCUMENTS_UPDATED',
      sourceEvent: 'trust.matter.documents.updated',
      oldValue: before,
      newValue: matter.toObject() as unknown as Record<string, unknown>,
      performedBy: input.performedBy
    });
    return matter;
  }

  buildWorkflowTimeline(input: {
    account: Record<string, any>;
    matter: Record<string, any>;
    ledger: Record<string, any>[];
    settlement?: Record<string, any> | null;
    auditLogs: Record<string, any>[];
    reconciliation?: Record<string, any> | null;
  }) {
    const auditByAction = new Map<string, Record<string, any>>();
    for (const audit of input.auditLogs || []) {
      const action = String(audit?.action || '').toUpperCase();
      if (action && !auditByAction.has(action)) auditByAction.set(action, audit);
    }
    const firstBuyerPayment = (input.ledger || [])
      .filter((row) => String(row?.type || '').toUpperCase() === 'BUYER_PAYMENT' && Number(row?.credit || 0) > 0)
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())[0];
    const sellerTransfer = (input.ledger || []).find((row) => String(row?.type || '').toUpperCase() === 'TRANSFER_TO_SELLER');
    const taxDeduction = (input.ledger || []).find((row) => ['CGT_DEDUCTION', 'VAT_DEDUCTION', 'VAT_ON_COMMISSION'].includes(String(row?.type || '').toUpperCase()));
    const commissionDeduction = (input.ledger || []).find((row) => String(row?.type || '').toUpperCase() === 'COMMISSION_DEDUCTION');
    const settlementAudit = auditByAction.get('CALCULATED');
    const closedAudit = auditByAction.get('CLOSED');

    const stageData: Record<TrustMatterWorkflowStage, { complete: boolean; date?: unknown; user?: unknown; auditReference?: string }> = {
      TRUST_MATTER_OPENED: {
        complete: true,
        date: input.matter?.dateOpened || input.account?.createdAt,
        user: auditByAction.get('CREATED')?.performedBy,
        auditReference: auditByAction.get('CREATED')?.sourceEvent || 'trust.account.created'
      },
      BUYER_DEPOSIT_RECEIVED: {
        complete: !!firstBuyerPayment,
        date: firstBuyerPayment?.createdAt,
        user: firstBuyerPayment?.createdBy,
        auditReference: firstBuyerPayment?.reference || firstBuyerPayment?.sourceEvent
      },
      FUNDS_HELD: {
        complete: Number(input.account?.runningBalance || 0) > 0 || !!firstBuyerPayment,
        date: firstBuyerPayment?.createdAt,
        user: firstBuyerPayment?.createdBy,
        auditReference: firstBuyerPayment?.sourceEvent
      },
      SETTLEMENT_CALCULATED: {
        complete: !!input.settlement,
        date: input.settlement?.settlementDate || settlementAudit?.timestamp,
        user: settlementAudit?.performedBy,
        auditReference: settlementAudit?.sourceEvent
      },
      SETTLEMENT_APPROVED: {
        complete: Boolean(input.settlement?.locked || sellerTransfer || input.account?.status === 'SETTLED' || input.account?.status === 'CLOSED'),
        date: input.settlement?.updatedAt || input.settlement?.settlementDate,
        user: settlementAudit?.performedBy,
        auditReference: input.settlement?.locked ? 'settlement.locked' : undefined
      },
      FUNDS_ALLOCATED: {
        complete: !!commissionDeduction || !!taxDeduction || !!input.settlement,
        date: commissionDeduction?.createdAt || taxDeduction?.createdAt || input.settlement?.settlementDate,
        user: commissionDeduction?.createdBy || taxDeduction?.createdBy,
        auditReference: commissionDeduction?.reference || taxDeduction?.reference
      },
      SELLER_PAID: {
        complete: !!sellerTransfer,
        date: sellerTransfer?.createdAt,
        user: sellerTransfer?.createdBy,
        auditReference: sellerTransfer?.reference
      },
      TAXES_PAID: {
        complete: !!taxDeduction,
        date: taxDeduction?.createdAt,
        user: taxDeduction?.createdBy,
        auditReference: taxDeduction?.reference
      },
      TRUST_BALANCED: {
        complete: Boolean(input.reconciliation?.healthy),
        date: new Date(),
        user: undefined,
        auditReference: input.reconciliation?.healthy ? 'trust.reconciliation.healthy' : undefined
      },
      TRUST_CLOSED: {
        complete: input.account?.status === 'CLOSED',
        date: input.account?.closedAt || closedAudit?.timestamp,
        user: closedAudit?.performedBy,
        auditReference: closedAudit?.sourceEvent
      }
    };

    return WORKFLOW_LABELS.map((stage) => ({
      key: stage.key,
      label: stage.label,
      complete: stageData[stage.key].complete,
      date: stageData[stage.key].date || null,
      user: stageData[stage.key].user || null,
      auditReference: stageData[stage.key].auditReference || null
    }));
  }

  buildFundsAllocation(input: { account: Record<string, any>; settlement?: Record<string, any> | null }) {
    const deductions = new Map((input.settlement?.deductions || []).map((deduction: any) => [String(deduction.type || '').toUpperCase(), money(Number(deduction.amount || 0))]));
    const sellerFunds = money(Number(input.settlement?.netPayout || 0));
    const agencyCommission = money(Number(deductions.get('COMMISSION') || 0));
    const vatLiability = money(Number(deductions.get('VAT') || 0));
    const vatOnCommission = money(Number(deductions.get('VAT_ON_COMMISSION') || 0));
    const cgwtLiability = money(
      Number(deductions.get('CAPITAL_GAINS_WITHHOLDING_TAX') || deductions.get('CGWT') || 0)
    );
    const cgtLiability = money(Number(deductions.get('CGT') || deductions.get('CAPITAL_GAINS_TAX') || 0));
    const totalTrustBalance = money(Number(input.account?.runningBalance || 0));
    const allocated = money(sellerFunds + agencyCommission + vatLiability + vatOnCommission + cgwtLiability);
    return {
      fundsCurrentlyHeld: totalTrustBalance,
      sellerFunds,
      agencyCommission,
      vatLiability,
      vatOnCommission,
      cgtLiability,
      cgwtLiability,
      otherAdjustments: 0,
      remainingUnallocated: money(totalTrustBalance - allocated),
      totalTrustBalance
    };
  }

  buildPaymentAllocation(input: { account: Record<string, any>; settlement?: Record<string, any> | null }) {
    const funds = this.buildFundsAllocation(input);
    const purchasePrice = money(Number(input.settlement?.salePrice || input.settlement?.grossProceeds || input.account?.purchasePrice || 0));
    const allocated = money(funds.sellerFunds + funds.agencyCommission + funds.vatOnCommission + funds.vatLiability + (funds.cgwtLiability || 0) + funds.otherAdjustments);
    return {
      purchasePrice,
      allocated: {
        seller: funds.sellerFunds,
        commission: funds.agencyCommission,
        vatCommission: funds.vatOnCommission,
        vat: funds.vatLiability,
        capitalGainsTax: funds.cgtLiability,
        capitalGainsWithholdingTax: funds.cgwtLiability || 0,
        other: funds.otherAdjustments
      },
      balanceRemaining: money(Math.max(0, purchasePrice - allocated))
    };
  }

  buildLedgerPresentation(ledger: Record<string, any>[]) {
    return (ledger || []).map((row) => ({
      id: String(row?._id || ''),
      date: row?.createdAt || null,
      transaction: readableTransactionType(row?.type),
      receipt: row?.paymentId ? String(row.paymentId) : null,
      reference: row?.reference || null,
      debit: money(Number(row?.debit || 0)),
      credit: money(Number(row?.credit || 0)),
      runningBalance: money(Number(row?.runningBalance || 0)),
      performedBy: row?.createdBy || null,
      approval: null,
      supportingDocument: null
    }));
  }

  buildAuditPresentation(auditLogs: Record<string, any>[]) {
    return (auditLogs || []).map((row) => ({
      id: String(row?._id || ''),
      title: readableAuditAction(row?.action),
      action: row?.action || null,
      performedBy: row?.performedBy || null,
      date: row?.timestamp || row?.createdAt || null,
      reference: row?.sourceEvent || row?.migrationId || row?.entityId || null,
      triggeredAutomatically: !row?.performedBy,
      entityType: row?.entityType || null,
      entityId: row?.entityId || null,
      technicalDetails: {
        oldValue: row?.oldValue || null,
        newValue: row?.newValue || null,
        sourceEvent: row?.sourceEvent || null
      }
    }));
  }

  buildReconciliationPresentation(input: { account: Record<string, any>; matter: Record<string, any>; reconciliation?: Record<string, any> | null }) {
    const custodyType = String(input.matter?.custodyType || 'AGENCY_TRUST_BANK');
    const trustBalance = money(Number(input.reconciliation?.trustBankBalance ?? input.account?.runningBalance ?? 0));
    const difference = money(Number(input.reconciliation?.variance ?? 0));
    return {
      trustBalance,
      cashHeld: custodyType === 'AGENCY_CASH' ? trustBalance : null,
      bankBalance: custodyType === 'AGENCY_TRUST_BANK' ? trustBalance : null,
      lawyerConfirmation: custodyType === 'LAWYER_TRUST_ACCOUNT' ? input.matter?.custodyDetails?.confirmationDate || null : null,
      difference,
      status: input.reconciliation?.healthy ? 'Reconciled' : 'Review Required',
      reconciled: Boolean(input.reconciliation?.healthy),
      lastReconciled: input.matter?.reconciliationMetadata?.lastReconciledAt || null,
      by: input.matter?.reconciliationMetadata?.lastReconciledBy || null
    };
  }

  private async auditMatterChange(input: {
    companyId: string;
    matter: ITrustMatter;
    action: string;
    sourceEvent: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    performedBy?: string;
  }): Promise<void> {
    await TrustAuditLog.create({
      companyId: toObjectId(input.companyId),
      entityType: 'TRUST_MATTER',
      entityId: String(input.matter._id),
      action: input.action,
      sourceEvent: input.sourceEvent,
      oldValue: input.oldValue || null,
      newValue: input.newValue || null,
      performedBy: input.performedBy ? toObjectId(input.performedBy) : undefined,
      timestamp: new Date()
    });
  }
}

export default new TrustMatterService();
