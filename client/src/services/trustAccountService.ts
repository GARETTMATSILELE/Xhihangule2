import api from '../api/axios';

export type TrustCustodyType =
  | 'AGENCY_CASH'
  | 'AGENCY_TRUST_BANK'
  | 'LAWYER_TRUST_ACCOUNT'
  | 'ESCROW'
  | 'DEVELOPER'
  | 'OTHER';

export type TrustMatterDocumentType =
  | 'AGREEMENT_OF_SALE'
  | 'OFFER_LETTER'
  | 'PROOF_OF_PAYMENT'
  | 'DEPOSIT_SLIP'
  | 'TRANSFER_DOCUMENTS'
  | 'CGT_CLEARANCE'
  | 'RATES_CLEARANCE'
  | 'COMMISSION_INVOICE'
  | 'SELLER_STATEMENT'
  | 'BUYER_STATEMENT'
  | 'TAX_CERTIFICATE'
  | 'OTHER_DOCUMENTS';

export type TrustMatterDocument = {
  type: TrustMatterDocumentType;
  label: string;
  status: 'MISSING' | 'REQUESTED' | 'RECEIVED' | 'APPROVED' | 'WAIVED';
  fileId?: string;
  fileName?: string;
  reference?: string;
  notes?: string;
  receivedAt?: string;
  approvedAt?: string;
  updatedAt?: string;
};

export type TrustMatter = {
  _id: string;
  matterNumber: string;
  trustAccountId: string;
  propertyId: string;
  buyerId?: string;
  sellerId?: string;
  dealId?: string;
  purchasePrice: number;
  custodyType: TrustCustodyType;
  custodyDetails: Record<string, unknown>;
  status: 'OPEN' | 'SETTLED' | 'CLOSED';
  settlementStatus: string;
  workflowStage: string;
  dateOpened: string;
  dateClosed?: string;
  responsibleAccountant?: string;
  responsibleAgent?: string;
  responsiblePrincipal?: string;
  jurisdiction?: {
    country: string;
    currency: string;
    trustRules: string;
    taxRules: string;
    defaultCustody: TrustCustodyType;
    vatEnabled: boolean;
    cgtEnabled: boolean;
    escrowEnabled: boolean;
  };
  documents: TrustMatterDocument[];
};

export type TrustWorkflowTimelineItem = {
  key: string;
  label: string;
  complete: boolean;
  date?: string | null;
  user?: string | null;
  auditReference?: string | null;
};

export type TrustFundsAllocation = {
  fundsCurrentlyHeld: number;
  sellerFunds: number;
  agencyCommission: number;
  vatLiability: number;
  vatOnCommission: number;
  cgtLiability: number;
  otherAdjustments: number;
  remainingUnallocated: number;
  totalTrustBalance: number;
};

export type TrustPaymentAllocation = {
  purchasePrice: number;
  allocated: {
    seller: number;
    commission: number;
    vatCommission: number;
    vat: number;
    cgt: number;
    other: number;
  };
  balanceRemaining: number;
};

export type TrustLedgerPresentationRow = {
  id: string;
  date?: string | null;
  transaction: string;
  receipt?: string | null;
  reference?: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
  performedBy?: string | null;
  approval?: string | null;
  supportingDocument?: string | null;
};

export type TrustAuditPresentationRow = {
  id: string;
  title: string;
  action?: string | null;
  performedBy?: string | null;
  date?: string | null;
  reference?: string | null;
  triggeredAutomatically: boolean;
  entityType?: string | null;
  entityId?: string | null;
  technicalDetails?: Record<string, unknown>;
};

export type TrustReconciliationPresentation = {
  trustBalance: number;
  cashHeld?: number | null;
  bankBalance?: number | null;
  lawyerConfirmation?: string | null;
  difference: number;
  status: string;
  reconciled: boolean;
  lastReconciled?: string | null;
  by?: string | null;
};

export type TrustAccountListItem = {
  _id: string;
  propertyId: { _id: string; name?: string; address?: string } | string;
  buyerId?: { _id: string; firstName?: string; lastName?: string } | string;
  sellerId?: { _id: string; firstName?: string; lastName?: string } | string;
  partyNames?: { buyer?: string; seller?: string };
  trustMatter?: TrustMatter;
  openingBalance: number;
  runningBalance: number;
  closingBalance: number;
  status: 'OPEN' | 'SETTLED' | 'CLOSED';
  workflowState: string;
  createdAt: string;
};

export type TrustAccountFullResponse = {
  trustAccount?: any;
  trustMatter?: TrustMatter;
  propertySummary?: { purchasePrice?: number };
  ledger?: any[];
  buyerPayments?: any[];
  taxSummary?: any;
  auditLogs?: any[];
  reconciliation?: any;
  settlement?: any;
  partyNames?: { buyer?: string; seller?: string };
  workflowTimeline?: TrustWorkflowTimelineItem[];
  fundsAllocation?: TrustFundsAllocation;
  paymentAllocation?: TrustPaymentAllocation;
  ledgerPresentation?: TrustLedgerPresentationRow[];
  auditPresentation?: TrustAuditPresentationRow[];
  reconciliationPresentation?: TrustReconciliationPresentation;
};

class TrustAccountService {
  async list(params?: { status?: string; search?: string; page?: number; limit?: number }) {
    const response = await api.get('/accountants/trust-accounts', { params });
    return {
      data: (response.data?.data || []) as TrustAccountListItem[],
      total: Number(response.data?.total || 0),
      page: Number(response.data?.page || 1),
      limit: Number(response.data?.limit || 25)
    };
  }

  async getByProperty(propertyId: string) {
    const response = await api.get(`/accountants/trust-accounts/property/${propertyId}`);
    return response.data?.data;
  }

  async getFullByProperty(propertyId: string) {
    const response = await api.get(`/accountants/trust-accounts/property/${propertyId}/full`);
    return response.data?.data as TrustAccountFullResponse;
  }

  async getLedger(trustAccountId: string, params?: { page?: number; limit?: number }) {
    const response = await api.get(`/accountants/trust-accounts/${trustAccountId}/ledger`, { params });
    return response.data;
  }

  async calculateSettlement(
    trustAccountId: string,
    payload?: {
      salePrice?: number;
      commissionAmount?: number;
      applyVatOnSale?: boolean;
      cgtRate?: number;
      cgtAmount?: number;
      vatSaleRate?: number;
      vatOnCommissionRate?: number;
    }
  ) {
    const response = await api.post(`/accountants/trust-accounts/${trustAccountId}/calculate-settlement`, payload || {});
    return response.data?.data;
  }

  async applyTaxDeductions(trustAccountId: string, payload?: { zimraPaymentReference?: string }) {
    const response = await api.post(`/accountants/trust-accounts/${trustAccountId}/apply-tax-deductions`, payload || {});
    return response.data?.data;
  }

  async transferToSeller(trustAccountId: string, payload: { amount: number; reference?: string }) {
    const response = await api.post(`/accountants/trust-accounts/${trustAccountId}/transfer-to-seller`, payload);
    return response.data?.data;
  }

  async getMatter(trustAccountId: string) {
    const response = await api.get(`/accountants/trust-accounts/${trustAccountId}/matter`);
    return response.data?.data as TrustMatter;
  }

  async updateMatterCustody(
    trustAccountId: string,
    payload: { custodyType: TrustCustodyType; custodyDetails?: Record<string, unknown> }
  ) {
    const response = await api.patch(`/accountants/trust-accounts/${trustAccountId}/matter/custody`, payload);
    return response.data?.data as TrustMatter;
  }

  async updateMatterDocuments(trustAccountId: string, payload: { documents: Partial<TrustMatterDocument>[] }) {
    const response = await api.patch(`/accountants/trust-accounts/${trustAccountId}/matter/documents`, payload);
    return response.data?.data as TrustMatter;
  }

  async closeTrustAccount(trustAccountId: string, payload?: { lockReason?: string }) {
    const response = await api.post(`/accountants/trust-accounts/${trustAccountId}/close`, payload || {});
    return response.data?.data;
  }

  async transitionWorkflow(trustAccountId: string, toState: string) {
    const response = await api.post(`/accountants/trust-accounts/${trustAccountId}/workflow-transition`, { toState });
    return response.data?.data;
  }

  async downloadReport(
    trustAccountId: string,
    reportType: 'buyer-statement' | 'seller-settlement' | 'trust-reconciliation' | 'tax-zimra' | 'audit-log'
  ) {
    const response = await api.get(`/accountants/trust-accounts/${trustAccountId}/reports/${reportType}`, {
      responseType: 'blob'
    });
    return response.data as Blob;
  }
}

const trustAccountService = new TrustAccountService();
export default trustAccountService;
