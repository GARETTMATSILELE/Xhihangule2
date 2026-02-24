import { Request, Response } from 'express';
import { Property } from '../models/Property';
import { Payment } from '../models/Payment';
import trustAccountService from '../services/trustAccountService';
import { TrustSettlement } from '../models/TrustSettlement';
import { generateTrustReportPdf } from '../services/reportGenerator';
import { runTrustReconciliationOnce } from '../jobs/trustReconciliationJob';

const companyIdFromReq = (req: Request): string | undefined => (req.user?.companyId ? String(req.user.companyId) : undefined);

const emitTrustUpdate = async (companyId: string, trustAccountId: string, event: string): Promise<void> => {
  try {
    const { getIo } = await import('../config/socket');
    const io = getIo();
    if (!io) return;
    io.to(`company-${companyId}`).emit('trustAccountUpdated', { trustAccountId, event, timestamp: new Date().toISOString() });
    io.to(`company-${companyId}`).emit('trust.updated', { trustAccountId, event, timestamp: new Date().toISOString() });
  } catch {
    // non-fatal
  }
};

const ensureCompany = (req: Request, res: Response): string | null => {
  const companyId = companyIdFromReq(req);
  if (!companyId) {
    res.status(400).json({ message: 'companyId is required' });
    return null;
  }
  return companyId;
};

const getPaymentPartyNames = async (
  companyId: string,
  propertyId: string
): Promise<{ buyer: string; seller: string }> => {
  const payments = await Payment.find({
    companyId,
    propertyId,
    paymentType: 'sale',
    status: 'completed',
    isProvisional: { $ne: true },
    isInSuspense: { $ne: true }
  })
    .sort({ paymentDate: -1, createdAt: -1, _id: -1 })
    .select('buyerName sellerName')
    .limit(50)
    .lean();

  const buyer =
    payments.map((p: any) => String(p?.buyerName || '').trim()).find((name) => name.length > 0) || '';
  const seller =
    payments.map((p: any) => String(p?.sellerName || '').trim()).find((name) => name.length > 0) || '';

  return { buyer, seller };
};

const filterOutReversedLedgerRows = async (
  companyId: string,
  ledgerRows: any[]
): Promise<any[]> => {
  if (!Array.isArray(ledgerRows) || ledgerRows.length === 0) return [];
  const paymentIds = Array.from(
    new Set(
      ledgerRows
        .map((row: any) => String(row?.paymentId || '').trim())
        .filter((id) => id.length > 0)
    )
  );
  if (!paymentIds.length) return ledgerRows;

  const linkedPayments = await Payment.find({
    companyId,
    _id: { $in: paymentIds }
  })
    .select('_id status reversalOfPaymentId')
    .lean();

  const hiddenPaymentIds = new Set(
    (linkedPayments as any[])
      .filter((payment) => {
        const status = String(payment?.status || '').toLowerCase();
        return status === 'reversed' || !!payment?.reversalOfPaymentId;
      })
      .map((payment) => String(payment?._id || ''))
  );

  if (!hiddenPaymentIds.size) return ledgerRows;
  return ledgerRows.filter((row: any) => !hiddenPaymentIds.has(String(row?.paymentId || '')));
};

export const listTrustAccounts = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 25);
    const payload = await trustAccountService.listTrustAccounts(companyId, { status, search, page, limit });
    return res.json({ data: payload.items, page: payload.page, limit: payload.limit, total: payload.total });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to list trust accounts' });
  }
};

export const getTrustAccountByProperty = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const propertyId = String(req.params.propertyId || '');
    const account = await trustAccountService.getByProperty(companyId, propertyId);
    if (!account) return res.status(404).json({ message: 'Trust account not found' });
    return res.json({ data: account });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch trust account' });
  }
};

export const getTrustAccount = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const item = await trustAccountService.getById(companyId, String(req.params.id || ''));
    if (!item) return res.status(404).json({ message: 'Trust account not found' });
    return res.json({ data: item });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch trust account' });
  }
};

export const createTrustAccount = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const { propertyId, buyerId, sellerId, dealId, openingBalance, initialWorkflowState } = req.body || {};
    if (!propertyId) return res.status(400).json({ message: 'propertyId is required' });
    const account = await trustAccountService.createTrustAccount({
      companyId,
      propertyId: String(propertyId),
      buyerId: buyerId ? String(buyerId) : undefined,
      sellerId: sellerId ? String(sellerId) : undefined,
      dealId: dealId ? String(dealId) : undefined,
      openingBalance: Number(openingBalance || 0),
      initialWorkflowState,
      createdBy: req.user?.userId ? String(req.user.userId) : undefined
    });
    return res.status(201).json({ message: 'Trust account created', data: account });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Failed to create trust account' });
  }
};

export const recordBuyerPayment = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const { amount, reference, propertyId, buyerId, sellerId, paymentId } = req.body || {};
    if (!amount) return res.status(400).json({ message: 'amount is required' });
    if (!propertyId) return res.status(400).json({ message: 'propertyId is required' });
    const result = await trustAccountService.recordBuyerPayment({
      companyId,
      trustAccountId,
      propertyId: String(propertyId),
      amount: Number(amount),
      reference: reference ? String(reference) : undefined,
      paymentId: paymentId ? String(paymentId) : undefined,
      sourceEvent: 'trust.manual.buyer.payment',
      createdBy: req.user?.userId ? String(req.user.userId) : undefined,
      buyerId: buyerId ? String(buyerId) : undefined,
      sellerId: sellerId ? String(sellerId) : undefined
    });
    await emitTrustUpdate(companyId, trustAccountId, 'BUYER_PAYMENT_RECORDED');
    return res.status(201).json({ message: 'Buyer payment recorded', data: result });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Failed to record buyer payment' });
  }
};

export const calculateSettlement = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const { salePrice, commissionAmount, applyVatOnSale, cgtRate, cgtAmount, vatSaleRate, vatOnCommissionRate } = req.body || {};
    const data = await trustAccountService.calculateSettlement({
      companyId,
      trustAccountId,
      salePrice: salePrice != null ? Number(salePrice) : undefined,
      commissionAmount: commissionAmount != null ? Number(commissionAmount) : undefined,
      applyVatOnSale: Boolean(applyVatOnSale),
      cgtRate: cgtRate != null ? Number(cgtRate) : undefined,
      cgtAmount: cgtAmount != null ? Number(cgtAmount) : undefined,
      vatSaleRate: vatSaleRate != null ? Number(vatSaleRate) : undefined,
      vatOnCommissionRate: vatOnCommissionRate != null ? Number(vatOnCommissionRate) : undefined,
      createdBy: req.user?.userId ? String(req.user.userId) : undefined
    });
    await emitTrustUpdate(companyId, trustAccountId, 'SETTLEMENT_CALCULATED');
    return res.json({ message: 'Settlement calculated', data });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Failed to calculate settlement' });
  }
};

export const applyTaxDeductions = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const data = await trustAccountService.applyTaxDeductions({
      companyId,
      trustAccountId,
      createdBy: req.user?.userId ? String(req.user.userId) : undefined,
      zimraPaymentReference:
        typeof req.body?.zimraPaymentReference === 'string' ? req.body.zimraPaymentReference : undefined
    });
    await emitTrustUpdate(companyId, trustAccountId, 'TAX_DEDUCTIONS_APPLIED');
    return res.json({ message: 'Tax deductions applied', data });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Failed to apply tax deductions' });
  }
};

export const transferToSeller = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const { amount, reference } = req.body || {};
    if (!amount) return res.status(400).json({ message: 'amount is required' });
    const data = await trustAccountService.transferToSeller({
      companyId,
      trustAccountId,
      amount: Number(amount),
      reference: reference ? String(reference) : undefined,
      createdBy: req.user?.userId ? String(req.user.userId) : undefined
    });
    await emitTrustUpdate(companyId, trustAccountId, 'TRANSFER_TO_SELLER');
    return res.json({ message: 'Seller transfer completed', data });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Failed to transfer to seller' });
  }
};

export const closeTrustAccount = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const data = await trustAccountService.closeTrustAccount({
      companyId,
      trustAccountId,
      lockReason: typeof req.body?.lockReason === 'string' ? req.body.lockReason : undefined,
      createdBy: req.user?.userId ? String(req.user.userId) : undefined
    });
    await emitTrustUpdate(companyId, trustAccountId, 'TRUST_ACCOUNT_CLOSED');
    return res.json({ message: 'Trust account closed', data });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Failed to close trust account' });
  }
};

export const transitionTrustWorkflow = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const toState = String(req.body?.toState || '');
    if (!toState) return res.status(400).json({ message: 'toState is required' });
    const data = await trustAccountService.transitionWorkflowState({
      companyId,
      trustAccountId,
      toState: toState as any,
      createdBy: req.user?.userId ? String(req.user.userId) : undefined
    });
    await emitTrustUpdate(companyId, trustAccountId, 'WORKFLOW_STATE_CHANGED');
    return res.json({ message: 'Workflow state updated', data });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || 'Failed to update workflow' });
  }
};

export const getTrustLedger = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);
    const data = await trustAccountService.getLedger(companyId, trustAccountId, { page, limit });
    return res.json({ data: data.items, page: data.page, limit: data.limit, total: data.total });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch trust ledger' });
  }
};

export const getTrustTaxSummary = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const data = await trustAccountService.getTaxSummary(companyId, trustAccountId);
    return res.json({ data });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch tax summary' });
  }
};

export const getTrustAuditLogs = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const limit = Number(req.query.limit || 200);
    const data = await trustAccountService.getAuditLogs(companyId, trustAccountId, limit);
    return res.json({ data });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch audit logs' });
  }
};

export const getTrustReconciliation = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const data = await trustAccountService.getReconciliation(companyId, trustAccountId);
    return res.json({ data });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch trust reconciliation' });
  }
};

export const getTrustAccountFull = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const account = await trustAccountService.getById(companyId, trustAccountId);
    if (!account) return res.status(404).json({ message: 'Trust account not found' });
    try {
      await trustAccountService.verifyAndRepairAccountInvariants({
        companyId,
        trustAccountId,
        sourceEvent: 'trust.account.full.read'
      });
    } catch {
      // non-fatal on read
    }

    const [refreshedAccount, ledger, taxSummary, auditLogs, reconciliation, settlement] = await Promise.all([
      trustAccountService.getById(companyId, trustAccountId),
      trustAccountService.getLedger(companyId, trustAccountId, { page: 1, limit: 100 }),
      trustAccountService.getTaxSummary(companyId, trustAccountId),
      trustAccountService.getAuditLogs(companyId, trustAccountId, 100),
      trustAccountService.getReconciliation(companyId, trustAccountId),
      TrustSettlement.findOne({ companyId, trustAccountId }).lean()
    ]);
    const filteredLedgerRows = await filterOutReversedLedgerRows(companyId, ledger.items || []);
    const partyNames = await getPaymentPartyNames(companyId, String((refreshedAccount as any)?.propertyId || (account as any).propertyId || ''));
    return res.json({
      data: {
        trustAccount: refreshedAccount || account,
        ledger: filteredLedgerRows,
        taxSummary,
        auditLogs,
        reconciliation,
        settlement,
        partyNames
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch trust account detail' });
  }
};

export const getTrustAccountByPropertyFull = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const propertyId = String(req.params.propertyId || '');
    const account = await trustAccountService.getByProperty(companyId, propertyId);
    if (!account) return res.status(404).json({ message: 'Trust account not found for property' });
    req.params.id = String(account._id);
    return getTrustAccountFull(req, res);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to fetch property trust account detail' });
  }
};

export const generateTrustReport = async (req: Request, res: Response) => {
  try {
    const companyId = ensureCompany(req, res);
    if (!companyId) return;
    const trustAccountId = String(req.params.id || '');
    const reportType =
      (String(req.params.reportType || '').toLowerCase() as
        | 'buyer-statement'
        | 'seller-settlement'
        | 'trust-reconciliation'
        | 'tax-zimra'
        | 'audit-log') || 'buyer-statement';

    const account = await trustAccountService.listTrustAccounts(companyId, { page: 1, limit: 200 });
    const trust = account.items.find((r: any) => String(r._id) === trustAccountId);
    if (!trust) return res.status(404).json({ message: 'Trust account not found' });

    const [ledger, taxSummary, auditLogs, reconciliation, settlement, property] = await Promise.all([
      trustAccountService.getLedger(companyId, trustAccountId, { page: 1, limit: 500 }),
      trustAccountService.getTaxSummary(companyId, trustAccountId),
      trustAccountService.getAuditLogs(companyId, trustAccountId, 500),
      trustAccountService.getReconciliation(companyId, trustAccountId),
      TrustSettlement.findOne({ companyId, trustAccountId }).lean(),
      Property.findById((trust as any).propertyId).lean()
    ]);

    const filteredLedgerRows = await filterOutReversedLedgerRows(companyId, ledger.items || []);

    let rows: Record<string, unknown>[] = [];
    let totals: Record<string, number> = {};
    if (reportType === 'buyer-statement') {
      rows = filteredLedgerRows.map((t: any) => ({
        date: t.createdAt,
        type: t.type,
        debit: t.debit,
        credit: t.credit,
        runningBalance: t.runningBalance,
        reference: t.reference || ''
      }));
      totals = { trustBalance: reconciliation.trustBankBalance, buyerFundsHeld: reconciliation.totalBuyerFundsHeld };
    } else if (reportType === 'seller-settlement') {
      rows = (settlement?.deductions || []).map((d: any) => ({ type: d.type, amount: d.amount }));
      totals = { salePrice: Number(settlement?.salePrice || 0), netPayout: Number(settlement?.netPayout || 0) };
    } else if (reportType === 'tax-zimra') {
      rows = taxSummary.records.map((r: any) => ({
        taxType: r.taxType,
        amount: r.amount,
        paidToZimra: r.paidToZimra,
        paymentReference: r.paymentReference || ''
      }));
      totals = {
        cgt: taxSummary.cgt,
        vat: taxSummary.vat,
        vatOnCommission: taxSummary.vatOnCommission,
        total: taxSummary.total
      };
    } else if (reportType === 'audit-log') {
      rows = auditLogs.map((l: any) => ({
        timestamp: l.timestamp,
        entityType: l.entityType,
        action: l.action,
        entityId: l.entityId
      }));
    } else {
      rows = [reconciliation];
      totals = {
        trustBankBalance: reconciliation.trustBankBalance,
        buyerFundsHeld: reconciliation.totalBuyerFundsHeld,
        sellerLiability: reconciliation.sellerLiability,
        variance: reconciliation.variance
      };
    }

    const pdf = await generateTrustReportPdf({
      reportType,
      companyName: 'Mantis Africa',
      propertyLabel: String(property?.address || property?.name || (trust as any)?.propertyId || ''),
      auditReference: `TRUST-${trustAccountId}-${Date.now()}`,
      rows,
      totals
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="trust-${reportType}-${trustAccountId}.pdf"`);
    return res.status(200).send(pdf);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to generate trust report' });
  }
};

export const runTrustReconciliation = async (_req: Request, res: Response) => {
  try {
    await runTrustReconciliationOnce();
    return res.json({ message: 'Trust reconciliation completed' });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to run trust reconciliation' });
  }
};

