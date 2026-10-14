import { roundMoney } from '../../utils/money';
import { GL } from './chartAccounts';

export type AgentReceiptJournalInput = {
  paymentType: string;
  amount: number;
  ownerAmount: number;
  commissionNet: number;
  vatAmount: number;
  levyAmount?: number;
  propertyId?: string;
  agentId?: string;
};

export type JournalLineDraft = {
  accountCode: string;
  debit?: number;
  credit?: number;
  propertyId?: string;
  agentId?: string;
};

export type AgentReceiptJournal = {
  lines: JournalLineDraft[];
  trustDebit: number;
  ownerLiability: number;
  levyLiability: number;
  companyRevenue: number;
  vatLiability: number;
  payableAccount: string;
  revenueAccount: string;
  balanced: boolean;
};

/**
 * Agent collection: receipt is client money. Company recognises commission only.
 * Dr Trust Bank / Cr owner or seller payable / Cr agency revenue / Cr VAT payable.
 */
export function buildAgentReceiptJournal(input: AgentReceiptJournalInput): AgentReceiptJournal {
  const amount = roundMoney(Math.max(0, Number(input.amount || 0)));
  const commissionNet = roundMoney(Math.max(0, Number(input.commissionNet || 0)));
  const vatAmount = roundMoney(Math.max(0, Number(input.vatAmount || 0)));
  const isSale = String(input.paymentType || '') === 'sale';
  const payableAccount = isSale ? GL.SELLER_PAYABLE : GL.OWNER_PAYABLE;
  const revenueAccount = isSale ? GL.SALES_COMMISSION_REVENUE : GL.AGENCY_REVENUE;
  const residual = roundMoney(Math.max(0, amount - commissionNet - vatAmount));
  const levyLiability = isSale ? 0 : roundMoney(Math.min(Math.max(0, Number(input.levyAmount || 0)), residual));
  const ownerLiability = roundMoney(Math.max(0, residual - levyLiability));

  const lines: JournalLineDraft[] = [];
  if (amount > 0) {
    lines.push({
      accountCode: GL.TRUST_BANK,
      debit: amount,
      propertyId: input.propertyId,
      agentId: input.agentId
    });
  }
  if (commissionNet > 0) {
    lines.push({ accountCode: revenueAccount, credit: commissionNet });
  }
  if (vatAmount > 0) {
    lines.push({ accountCode: GL.VAT_PAYABLE, credit: vatAmount });
  }
  if (ownerLiability > 0) {
    lines.push({
      accountCode: payableAccount,
      credit: ownerLiability,
      propertyId: input.propertyId
    });
  }
  if (levyLiability > 0) {
    lines.push({
      accountCode: GL.LEVY_PAYABLE,
      credit: levyLiability,
      propertyId: input.propertyId
    });
  }

  const debit = roundMoney(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const credit = roundMoney(lines.reduce((s, l) => s + Number(l.credit || 0), 0));

  return {
    lines,
    trustDebit: amount,
    ownerLiability,
    levyLiability,
    companyRevenue: commissionNet,
    vatLiability: vatAmount,
    payableAccount,
    revenueAccount,
    balanced: debit === credit
  };
}

export function buildAgentReceiptReversal(input: AgentReceiptJournalInput): JournalLineDraft[] {
  const posted = buildAgentReceiptJournal(input);
  return posted.lines.map((line) => ({
    accountCode: line.accountCode,
    debit: line.credit,
    credit: line.debit,
    propertyId: line.propertyId,
    agentId: line.agentId
  }));
}

export function buildVatPaymentJournal(input: {
  amount: number;
  bankAccountCode?: string;
  allocatedAmount?: number;
  unallocatedAmount?: number;
}): JournalLineDraft[] {
  const amount = roundMoney(Math.max(0, Number(input.amount || 0)));
  if (!(amount > 0)) return [];
  const unallocated = roundMoney(Math.max(0, Number(input.unallocatedAmount || 0)));
  const allocated = input.allocatedAmount != null
    ? roundMoney(Math.max(0, Number(input.allocatedAmount)))
    : roundMoney(amount - unallocated);
  const lines: JournalLineDraft[] = [];
  if (allocated > 0) lines.push({ accountCode: GL.VAT_PAYABLE, debit: allocated });
  if (unallocated > 0) lines.push({ accountCode: GL.TAX_PREPAYMENT, debit: unallocated });
  lines.push({ accountCode: input.bankAccountCode || GL.COMPANY_BANK, credit: amount });
  return lines;
}

export function buildWithholdingJournal(input: {
  amount: number;
  fromPayableAccount: string;
  propertyId?: string;
}): JournalLineDraft[] {
  const amount = roundMoney(Math.max(0, Number(input.amount || 0)));
  if (!(amount > 0)) return [];
  return [
    { accountCode: input.fromPayableAccount, debit: amount, propertyId: input.propertyId },
    { accountCode: GL.ZIMRA_WITHHOLDING, credit: amount }
  ];
}

export function buildWithholdingRemittanceJournal(input: {
  amount: number;
  bankAccountCode?: string;
}): JournalLineDraft[] {
  const amount = roundMoney(Math.max(0, Number(input.amount || 0)));
  if (!(amount > 0)) return [];
  return [
    { accountCode: GL.ZIMRA_WITHHOLDING, debit: amount },
    { accountCode: input.bankAccountCode || GL.TRUST_BANK, credit: amount }
  ];
}
