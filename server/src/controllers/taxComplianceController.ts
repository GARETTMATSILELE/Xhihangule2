import mongoose from 'mongoose';
import { NextFunction, Request, Response } from 'express';
import { TaxObligation } from '../models/TaxObligation';
import { TaxPayment } from '../models/TaxPayment';
import { TaxReviewItem } from '../models/TaxReviewItem';
import { ChartOfAccount } from '../models/ChartOfAccount';
import { Property } from '../models/Property';
import { Payment } from '../models/Payment';
import { prepareVatReturn, updateVatReturnStatus, listVatReturns } from '../services/vatReturnService';
import { recordZimraPayment, attachTaxPaymentReceipt } from '../services/zimraPaymentService';
import { buildComplianceMigrationReport } from '../services/taxComplianceReviewService';
import { runTaxIntegrityChecks, fiscalisationSummary, companyAccountVsGlNote } from '../services/taxIntegrityService';
import { detectVatRateReview } from '../services/taxRateService';
import { outstandingForObligation } from '../services/taxObligationService';
import { TAX_TYPE_LABEL, TAX_TYPE_MODE, type CanonicalTaxType } from '../services/tax/taxTypes';
import { GL } from '../services/tax/chartAccounts';
import { roundMoney } from '../utils/money';
import { AppError } from '../middleware/errorHandler';
import { buildTrustReconciliationReport } from '../services/tax/trustReconciliation';
import { loadTaxPositionResponse } from '../services/tax/taxDashboardRead';
import { formatPropertyAddress, presentObligationAmounts, presentObligationProperty, resolveLinkedPropertyId, summariseTaxPayment } from '../services/tax/taxDashboard';

const companyIdOf = (req: Request): string => {
  const id = req.user?.companyId;
  if (!id) throw new AppError('Company ID required', 400);
  return String(id);
};

async function loadLinkedProperties(
  companyId: string,
  links: Array<{ propertyId?: unknown; paymentId?: unknown }>
) {
  const paymentIds = links.map((link) => link.paymentId).filter(Boolean);
  const payments = paymentIds.length
    ? await Payment.find({ companyId, _id: { $in: paymentIds } }).select('referenceNumber propertyId').lean()
    : [];
  const paymentById = new Map(payments.map((row) => [String(row._id), row]));
  const propertyIds = Array.from(new Set(links.map((link) => {
    const payment = link.paymentId ? paymentById.get(String(link.paymentId)) : undefined;
    return resolveLinkedPropertyId({
      obligationPropertyId: link.propertyId ? String(link.propertyId) : null,
      paymentPropertyId: payment?.propertyId ? String(payment.propertyId) : null
    });
  }).filter((id): id is string => Boolean(id))));
  const properties = propertyIds.length
    ? await Property.find({ companyId, _id: { $in: propertyIds } }).select('name address').lean()
    : [];
  const propertyById = new Map(properties.map((row) => [String(row._id), row]));
  const viewFor = (link: { propertyId?: unknown; paymentId?: unknown }) => {
    const payment = link.paymentId ? paymentById.get(String(link.paymentId)) : undefined;
    const propertyId = resolveLinkedPropertyId({
      obligationPropertyId: link.propertyId ? String(link.propertyId) : null,
      paymentPropertyId: payment?.propertyId ? String(payment.propertyId) : null
    });
    const property = propertyId ? propertyById.get(propertyId) : undefined;
    return {
      propertyId,
      payment,
      ...presentObligationProperty({
        propertyId,
        propertyName: property?.name || null,
        propertyAddress: formatPropertyAddress(property?.address)
      })
    };
  };
  return { viewFor };
}

const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export const getTaxComplianceDashboard = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyIdOf(req);
  const rows = await TaxObligation.find({ companyId, status: { $ne: 'REVERSED' } }).lean();
  const byType: Record<string, { calculated: number; withheld: number; payable: number; paid: number; outstanding: number }> = {};
  for (const row of rows) {
    const key = row.taxType;
    if (!byType[key]) byType[key] = { calculated: 0, withheld: 0, payable: 0, paid: 0, outstanding: 0 };
    byType[key].calculated = roundMoney(byType[key].calculated + Number(row.taxAmount || 0));
    if (row.status === 'WITHHELD') byType[key].withheld = roundMoney(byType[key].withheld + Number(row.taxAmount || 0));
    if (row.status === 'PAID' || row.status === 'RECONCILED') {
      byType[key].paid = roundMoney(byType[key].paid + Number(row.taxAmount || 0));
    } else if (row.status !== 'ACCOUNTANT_REVIEW') {
      byType[key].payable = roundMoney(byType[key].payable + Number(row.taxAmount || 0));
      const outstanding = await outstandingForObligation(String(row._id));
      byType[key].outstanding = roundMoney(byType[key].outstanding + outstanding);
    }
  }
  const openReviews = await TaxReviewItem.countDocuments({ companyId, status: { $in: ['open', 'OPEN', 'UNDER_REVIEW'] } });
  const vat = byType.VAT_ON_COMMISSION || { calculated: 0, withheld: 0, payable: 0, paid: 0, outstanding: 0 };
  const output = byType.VAT_OUTPUT || { calculated: 0, withheld: 0, payable: 0, paid: 0, outstanding: 0 };
  const cgt = byType.CAPITAL_GAINS_TAX || { calculated: 0, withheld: 0, payable: 0, paid: 0, outstanding: 0 };
  const cgwt = byType.CAPITAL_GAINS_WITHHOLDING_TAX || { calculated: 0, withheld: 0, payable: 0, paid: 0, outstanding: 0 };

  const glRows = await ChartOfAccount.find({
    companyId,
    code: { $in: [GL.TRUST_BANK, GL.OWNER_PAYABLE, GL.SELLER_PAYABLE, GL.ZIMRA_WITHHOLDING, GL.TENANT_DEPOSITS, GL.LEVY_PAYABLE] },
    isDeleted: { $ne: true }
  }).select('code name balance').lean();
  const glBalance = (code: string) => roundMoney(Number(glRows.find((r) => r.code === code)?.balance || 0));
  const trust = buildTrustReconciliationReport({
    trustBank: glBalance(GL.TRUST_BANK),
    ownerPayable: glBalance(GL.OWNER_PAYABLE),
    sellerPayable: glBalance(GL.SELLER_PAYABLE),
    zimraWithholding: glBalance(GL.ZIMRA_WITHHOLDING),
    tenantDeposits: glBalance(GL.TENANT_DEPOSITS),
    levyPayable: glBalance(GL.LEVY_PAYABLE)
  });
  const trustBank = trust.trustBank;
  const clientLedgers = trust.clientLiabilities;
  const trustDifference = trust.difference;
  const vatRateReview = await detectVatRateReview(companyId);
  const fiscal = await fiscalisationSummary(companyId);
  const vatUnpaidPeriods = await TaxObligation.distinct('taxPeriod', {
    companyId,
    taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] },
    status: { $nin: ['PAID', 'RECONCILED', 'REVERSED'] }
  });
  const cgtReviews = await TaxReviewItem.countDocuments({
    companyId,
    kind: { $in: ['CGT_MISSING_ACQUISITION_COST', 'CGT_RATE_NOT_CONFIGURED', 'LEGACY_CGT_ON_GROSS_SALE_PRICE', 'CGT_SETTLEMENT_REVIEW_REQUIRED', 'LEGACY_CGT_CALCULATION'] },
    status: { $in: ['open', 'OPEN', 'UNDER_REVIEW'] }
  });
  const cgwtReviews = await TaxReviewItem.countDocuments({
    companyId,
    kind: { $in: ['CGWT_MISSING', 'CGWT_RATE_NOT_CONFIGURED', 'CGWT_RATE_MISSING', 'CGWT_APPLICABILITY_UNDECIDED'] },
    status: { $in: ['open', 'OPEN', 'UNDER_REVIEW'] }
  });
  const categories = {
    VAT: {
      periodsRequireReview: vatRateReview ? 1 : 0,
      periodsUnpaid: vatUnpaidPeriods.length,
      outstanding: roundMoney(vat.outstanding + output.outstanding)
    },
    CGT: {
      historicalCalculationsRequireReview: cgtReviews,
      outstanding: cgt.outstanding
    },
    CGWT: {
      missingApplicability: cgwtReviews,
      outstanding: cgwt.outstanding
    },
    TRUST: {
      reconciliationDifferences: Math.abs(trustDifference) > 0.005 ? 1 : 0,
      scope: 'PARTIAL'
    },
    FISCALISATION: {
      invoicesNotFiscalised: fiscal.notFiscalised
    },
    HISTORICAL_DATA: {
      openReviews
    }
  };
  const allClear =
    categories.VAT.periodsUnpaid === 0 &&
    categories.VAT.periodsRequireReview === 0 &&
    categories.CGT.historicalCalculationsRequireReview === 0 &&
    categories.CGWT.missingApplicability === 0 &&
    categories.TRUST.reconciliationDifferences === 0 &&
    openReviews === 0;

  return res.json({
    status: 'success',
    data: {
      vatPayable: roundMoney(vat.outstanding + output.outstanding),
      vatPaid: roundMoney(vat.paid + output.paid),
      vatOutstanding: roundMoney(vat.outstanding + output.outstanding),
      cgtCalculated: cgt.calculated,
      cgtOutstanding: cgt.outstanding,
      cgwtWithheld: cgwt.withheld || cgwt.calculated,
      cgwtRemitted: cgwt.paid,
      cgwtOutstanding: cgwt.outstanding,
      trustTaxOutstanding: roundMoney(cgwt.outstanding + (byType.VAT_OUTPUT?.outstanding || 0)),
      openReviews,
      byType,
      categories,
      allClear,
      complianceLabel: allClear ? 'Controls passed' : 'Attention required',
      vatRateReview,
      modes: TAX_TYPE_MODE,
      labels: TAX_TYPE_LABEL,
      paye: { status: 'EXTERNAL', note: 'PAYE is not calculated in this application.' },
      corporateTax: { status: 'EXTERNAL', note: 'Corporate income tax is not calculated in this application.' },
      companyAccountVsGl: companyAccountVsGlNote(),
      trust: {
        trustBank,
        ownerPayable: glBalance(GL.OWNER_PAYABLE),
        sellerPayable: glBalance(GL.SELLER_PAYABLE),
        zimraWithholding: glBalance(GL.ZIMRA_WITHHOLDING),
        tenantDeposits: glBalance(GL.TENANT_DEPOSITS),
        levyPayable: glBalance(GL.LEVY_PAYABLE),
        clientLedgers,
        difference: trustDifference,
        status: trust.status,
        scope: 'PARTIAL',
        includedLedgers: trust.includedLedgers,
        excludedClientMoney: trust.excludedClientMoney,
        categories: trust.categories,
        note: trust.note
      }
    }
  });
});

export const getTaxPosition = asyncHandler(async (req: Request, res: Response) => {
  const asOfRaw = req.query.asOf ? String(req.query.asOf) : '';
  let asOf: Date | undefined;
  if (asOfRaw) {
    asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw)
      ? new Date(`${asOfRaw}T23:59:59.999Z`)
      : new Date(asOfRaw);
    if (Number.isNaN(asOf.getTime())) {
      return res.status(400).json({ message: 'asOf must be a valid date' });
    }
  }
  const taxPeriod = req.query.taxPeriod ? String(req.query.taxPeriod).trim() : '';
  if (taxPeriod && (taxPeriod.length > 32 || /[^\w-]/.test(taxPeriod))) {
    return res.status(400).json({ message: 'taxPeriod is not a valid filing period' });
  }
  const data = await loadTaxPositionResponse(companyIdOf(req), asOf, taxPeriod || undefined);
  return res.json({ status: 'success', data });
});

export const listTaxObligations = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyIdOf(req);
  const companyObjectId = new mongoose.Types.ObjectId(companyId);
  const taxType = req.query.taxType ? String(req.query.taxType) : undefined;
  const period = req.query.period ? String(req.query.period) : undefined;
  const rows = await TaxObligation.find({
    companyId,
    ...(taxType ? { taxType } : {}),
    ...(period ? { taxPeriod: period } : {})
  })
    .sort({ transactionDate: -1 })
    .limit(500)
    .lean();

  const obligationIds = rows.map((row) => row._id);
  const [paidRows, linked] = await Promise.all([
    obligationIds.length
      ? TaxPayment.aggregate([
          { $match: { companyId: companyObjectId, status: 'POSTED', 'allocations.taxObligationId': { $in: obligationIds } } },
          { $unwind: '$allocations' },
          { $match: { 'allocations.taxObligationId': { $in: obligationIds } } },
          { $group: { _id: '$allocations.taxObligationId', total: { $sum: '$allocations.amount' } } }
        ])
      : [],
    loadLinkedProperties(companyId, rows)
  ]);
  const paidById = new Map(paidRows.map((row: { _id: unknown; total: number }) => [String(row._id), Number(row.total || 0)]));

  const withOutstanding = rows.map((row) => {
    const propertyView = linked.viewFor(row);
    const amounts = presentObligationAmounts({
      taxType: String(row.taxType),
      taxAmount: Number(row.taxAmount || 0),
      status: String(row.status || ''),
      reversalOf: row.reversalOf ? String(row.reversalOf) : null,
      allocatedPaid: paidById.get(String(row._id)) || 0
    });
    return {
      ...row,
      propertyId: propertyView.propertyId || row.propertyId || null,
      outstanding: amounts.outstanding,
      amountPaid: amounts.amountPaid,
      paymentStatus: amounts.paymentStatus,
      categoryKey: amounts.categoryKey,
      categoryLabel: amounts.categoryLabel,
      label: TAX_TYPE_LABEL[row.taxType as CanonicalTaxType] || row.taxType,
      propertyName: propertyView.propertyAvailable ? propertyView.propertyLabel : null,
      propertyAddress: propertyView.propertyAddress || null,
      propertyAvailable: propertyView.propertyAvailable,
      propertyLabel: propertyView.propertyLabel,
      sourcePaymentReference: propertyView.payment?.referenceNumber || row.paymentReference || null
    };
  });
  return res.json({ status: 'success', data: withOutstanding });
});

export const getTaxReconciliation = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyIdOf(req);
  const period = String(req.query.period || '');
  const match: Record<string, unknown> = { companyId, status: { $ne: 'REVERSED' } };
  if (period) match.taxPeriod = period;
  const rows = await TaxObligation.find(match).lean();
  const grouped: Record<string, Record<string, { calculated: number; withheld: number; payable: number; submitted: number; paid: number; outstanding: number }>> = {};
  for (const row of rows) {
    const p = row.taxPeriod;
    const t = row.taxType;
    if (!grouped[p]) grouped[p] = {};
    if (!grouped[p][t]) grouped[p][t] = { calculated: 0, withheld: 0, payable: 0, submitted: 0, paid: 0, outstanding: 0 };
    grouped[p][t].calculated = roundMoney(grouped[p][t].calculated + Number(row.taxAmount || 0));
    if (row.status === 'WITHHELD') grouped[p][t].withheld += Number(row.taxAmount || 0);
    if (row.status === 'RETURN_SUBMITTED') grouped[p][t].submitted += Number(row.taxAmount || 0);
    if (row.status === 'PAID' || row.status === 'RECONCILED') grouped[p][t].paid += Number(row.taxAmount || 0);
    grouped[p][t].outstanding = await outstandingForObligation(String(row._id)).then((n) => roundMoney(grouped[p][t].outstanding + n));
  }
  return res.json({ status: 'success', data: grouped });
});

export const postZimraPayment = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyIdOf(req);
  const createdBy = String(req.user?.userId || '');
  const result = await recordZimraPayment({
    companyId,
    createdBy,
    amount: Number(req.body?.amount || 0),
    paymentDate: req.body?.paymentDate ? new Date(req.body.paymentDate) : new Date(),
    bankAccountCode: req.body?.bankAccountCode,
    zimraReference: req.body?.zimraReference,
    paymentReference: req.body?.paymentReference,
    notes: req.body?.notes,
    allocations: Array.isArray(req.body?.allocations) ? req.body.allocations : [],
    unallocatedAmount: req.body?.unallocatedAmount != null ? Number(req.body.unallocatedAmount) : undefined,
    unallocatedReason: req.body?.unallocatedReason
  });
  return res.status(201).json({ status: 'success', data: result });
});

export const uploadZimraPaymentReceipt = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyIdOf(req);
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  await attachTaxPaymentReceipt({
    companyId,
    paymentId: String(req.params.paymentId),
    uploadedBy: String(req.user?.userId || ''),
    fileName: req.file.originalname,
    contentType: req.file.mimetype,
    data: req.file.buffer
  });
  return res.json({ status: 'success' });
});

export const prepareCompanyVatReturn = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyIdOf(req);
  const filingPeriod = String(req.body?.filingPeriod || req.query.filingPeriod || '');
  const row = await prepareVatReturn(companyId, filingPeriod, req.user?.userId);
  return res.json({ status: 'success', data: row });
});

export const listCompanyVatReturns = asyncHandler(async (req: Request, res: Response) => {
  const rows = await listVatReturns(companyIdOf(req));
  return res.json({ status: 'success', data: rows });
});

export const patchVatReturn = asyncHandler(async (req: Request, res: Response) => {
  const row = await updateVatReturnStatus({
    companyId: companyIdOf(req),
    filingPeriod: String(req.params.filingPeriod),
    status: req.body?.status,
    zimraReturnReference: req.body?.zimraReturnReference,
    paymentReference: req.body?.paymentReference,
    paymentDate: req.body?.paymentDate ? new Date(req.body.paymentDate) : undefined,
    amountSubmitted: req.body?.amountSubmitted,
    notes: req.body?.notes,
    reviewedBy: req.user?.userId
  });
  return res.json({ status: 'success', data: row });
});

export const listTaxReviews = asyncHandler(async (req: Request, res: Response) => {
  const rows = await TaxReviewItem.find({
    companyId: companyIdOf(req),
    status: req.query.status
      ? String(req.query.status)
      : { $in: ['open', 'OPEN', 'UNDER_REVIEW'] }
  })
    .sort({ detectedAt: -1 })
    .limit(200)
    .lean();
  return res.json({ status: 'success', data: rows });
});

export const resolveTaxReview = asyncHandler(async (req: Request, res: Response) => {
  const row = await TaxReviewItem.findOne({ _id: req.params.id, companyId: companyIdOf(req) });
  if (!row) return res.status(404).json({ message: 'Review item not found' });
  const allowed = ['OPEN', 'UNDER_REVIEW', 'ACKNOWLEDGED', 'CORRECTED_MANUALLY', 'NO_ACTION_REQUIRED', 'resolved', 'ignored'];
  const requested = String(req.body?.status || 'ACKNOWLEDGED');
  if (!allowed.includes(requested)) {
    return res.status(400).json({ message: 'Invalid review status' });
  }
  if (!String(req.body?.resolution || '').trim()) {
    return res.status(400).json({ message: 'A review note is required' });
  }
  row.status = requested as any;
  row.resolution = String(req.body?.resolution || '');
  row.resolvedAt = new Date();
  row.resolvedBy = req.user?.userId as any;
  await row.save();
  return res.json({ status: 'success', data: row });
});

export const runCompanyTaxIntegrity = asyncHandler(async (req: Request, res: Response) => {
  const report = await runTaxIntegrityChecks(companyIdOf(req));
  return res.json({ status: 'success', data: report });
});

export const getComplianceMigrationReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await buildComplianceMigrationReport(companyIdOf(req));
  return res.json({ status: 'success', data: report });
});

export const listTaxPayments = asyncHandler(async (req: Request, res: Response) => {
  const companyId = companyIdOf(req);
  const rows = await TaxPayment.find({ companyId })
    .select('-receiptData')
    .sort({ paymentDate: -1 })
    .limit(100)
    .lean();
  const obligationIds = rows.flatMap((row) => (row.allocations || []).map((allocation) => allocation.taxObligationId)).filter(Boolean);
  const obligations = obligationIds.length
    ? await TaxObligation.find({ companyId, _id: { $in: obligationIds } }).select('taxType taxPeriod propertyId paymentId').lean()
    : [];
  const linked = await loadLinkedProperties(companyId, obligations);
  const obligationById = new Map(obligations.map((row) => [String(row._id), row]));

  const data = rows.map((row) => {
    const summary = summariseTaxPayment({
      status: String(row.status || ''),
      amount: Number(row.amount || 0),
      unallocatedAmount: Number(row.unallocatedAmount || 0),
      allocations: (row.allocations || []).map((allocation) => ({
        amount: Number(allocation.amount || 0),
        taxType: allocation.taxType ? String(allocation.taxType) : undefined
      }))
    });
    const settledObligations = (row.allocations || []).map((allocation) => {
      const obligation = obligationById.get(String(allocation.taxObligationId));
      const propertyView = obligation
        ? linked.viewFor(obligation)
        : presentObligationProperty({ propertyId: null, propertyName: null, propertyAddress: null });
      const taxType = String(allocation.taxType || obligation?.taxType || '');
      return {
        taxObligationId: String(allocation.taxObligationId),
        taxType,
        taxPeriod: allocation.taxPeriod || obligation?.taxPeriod || '',
        amount: Number(allocation.amount || 0),
        label: TAX_TYPE_LABEL[taxType as CanonicalTaxType] || taxType,
        propertyLabel: propertyView.propertyLabel,
        propertyAddress: propertyView.propertyAddress
      };
    });
    return {
      ...row,
      allocatedAmount: summary.allocatedAmount,
      unallocatedAmount: summary.unallocatedAmount,
      confirmedPaidAmount: summary.confirmedPaidAmount,
      categories: summary.categories,
      settledObligations
    };
  });
  return res.json({ status: 'success', data });
});
