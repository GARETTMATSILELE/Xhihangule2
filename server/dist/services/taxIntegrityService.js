"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTaxIntegrityChecks = runTaxIntegrityChecks;
exports.fiscalisationSummary = fiscalisationSummary;
exports.companyAccountVsGlNote = companyAccountVsGlNote;
const VatReturn_1 = require("../models/VatReturn");
const TaxObligation_1 = require("../models/TaxObligation");
const TaxPayment_1 = require("../models/TaxPayment");
const TaxRate_1 = require("../models/TaxRate");
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const Payment_1 = require("../models/Payment");
const Invoice_1 = require("../models/Invoice");
const TrustTransaction_1 = require("../models/TrustTransaction");
const chartAccounts_1 = require("./tax/chartAccounts");
const taxObligationService_1 = require("./taxObligationService");
const vatReturnService_1 = require("./vatReturnService");
const taxRateService_1 = require("./taxRateService");
const money_1 = require("../utils/money");
const trustReconciliation_1 = require("./tax/trustReconciliation");
const money = (n) => (0, money_1.roundMoney)(Number(n || 0));
/**
 * Detection-only tax and trust integrity checks. Never repairs amounts, journals, or balances.
 */
function runTaxIntegrityChecks(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const findings = [];
        const push = (finding) => findings.push(finding);
        const now = new Date();
        const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        const vatObligations = yield TaxObligation_1.TaxObligation.find({
            companyId,
            taxPeriod: period,
            taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] },
            status: { $ne: 'REVERSED' }
        }).lean();
        const obligationOutput = money(vatObligations.reduce((s, row) => s + Number(row.taxAmount || 0), 0));
        const glOutput = yield (0, vatReturnService_1.glOutputVatForPeriod)(companyId, period);
        if (Math.abs(obligationOutput - glOutput) > 0.005) {
            push({
                category: 'VAT',
                issueType: 'VAT_OBLIGATION_VS_GL_2101',
                severity: 'HIGH',
                entity: `VAT period ${period}`,
                taxType: 'VAT_OUTPUT',
                amount: obligationOutput,
                currentAmount: obligationOutput,
                expectedBasis: `GL 2101 credits ${glOutput}`,
                reason: `VAT obligation output ${obligationOutput} vs GL 2101 ${glOutput}`,
                recommendedAction: 'Review VAT obligations against GL 2101 for the period. Do not rewrite historical journals automatically.',
                detail: `VAT obligation output ${obligationOutput} vs GL 2101 ${glOutput}`
            });
        }
        const vatReturn = yield VatReturn_1.VatReturn.findOne({ companyId, filingPeriod: period }).lean();
        if (vatReturn && Math.abs(Number(vatReturn.outputVat || 0) - obligationOutput) > 0.005) {
            push({
                category: 'VAT',
                issueType: 'VAT_RETURN_VS_OBLIGATIONS',
                severity: 'HIGH',
                entity: `VAT return ${period}`,
                taxType: 'VAT_OUTPUT',
                amount: Number(vatReturn.outputVat || 0),
                currentAmount: Number(vatReturn.outputVat || 0),
                expectedBasis: `obligations ${obligationOutput}`,
                reason: 'VAT return output does not match tax obligations for the period',
                recommendedAction: 'Rebuild the working paper or document a timing difference. Do not mark RECONCILED until explained.',
                detail: 'VAT return output does not match tax obligations for the period'
            });
        }
        const vatPaid = yield TaxPayment_1.TaxPayment.aggregate([
            { $match: { companyId: (_a = vatObligations[0]) === null || _a === void 0 ? void 0 : _a.companyId, status: 'POSTED' } },
            { $unwind: '$allocations' },
            { $match: { 'allocations.taxType': { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] } } },
            { $group: { _id: null, total: { $sum: '$allocations.amount' } } }
        ]);
        const obligationPaid = money(vatObligations.filter((row) => row.status === 'PAID' || row.status === 'RECONCILED').reduce((s, row) => s + Number(row.taxAmount || 0), 0));
        const paymentPaid = money(Number(((_b = vatPaid[0]) === null || _b === void 0 ? void 0 : _b.total) || 0));
        if (vatPaid.length && Math.abs(obligationPaid - paymentPaid) > 0.5) {
            push({
                category: 'VAT',
                issueType: 'VAT_PAID_VS_TAXPAYMENT',
                severity: 'WARNING',
                entity: `VAT period ${period}`,
                taxType: 'VAT_OUTPUT',
                amount: obligationPaid,
                currentAmount: obligationPaid,
                expectedBasis: `TaxPayment allocations ${paymentPaid}`,
                reason: 'Paid VAT obligations do not match posted TaxPayment allocations',
                recommendedAction: 'Match TaxObligation PAID status to ZIMRA TaxPayment records. A receipt upload is not a payment.',
                detail: 'Paid VAT obligations do not match posted TaxPayment allocations'
            });
        }
        const unallocatedPayments = yield TaxPayment_1.TaxPayment.find({
            companyId,
            status: 'POSTED',
            unallocatedAmount: { $gt: 0.005 }
        }).select('_id amount unallocatedAmount').limit(50).lean();
        for (const payment of unallocatedPayments) {
            push({
                category: 'VAT',
                issueType: 'UNALLOCATED_ZIMRA_PAYMENT',
                severity: 'WARNING',
                entity: `TaxPayment ${payment._id}`,
                transaction: String(payment._id),
                taxType: 'ZIMRA_PAYMENT',
                amount: Number(payment.unallocatedAmount || 0),
                currentAmount: Number(payment.unallocatedAmount || 0),
                expectedBasis: `payment ${payment.amount}`,
                reason: 'ZIMRA payment has an explicit unallocated remainder',
                recommendedAction: 'Allocate the remainder to an obligation or document the tax prepayment (GL 1102).',
                detail: 'Unallocated ZIMRA payment remainder'
            });
        }
        const paidWithoutPayment = yield TaxObligation_1.TaxObligation.find({
            companyId,
            status: 'PAID',
            taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION', 'CAPITAL_GAINS_TAX', 'CAPITAL_GAINS_WITHHOLDING_TAX'] }
        }).select('_id taxType taxAmount taxPeriod').limit(100).lean();
        if (paidWithoutPayment.length) {
            const allocatedIds = new Set((yield TaxPayment_1.TaxPayment.find({ companyId, status: 'POSTED' }).select('allocations.taxObligationId').lean()).flatMap((row) => (row.allocations || []).map((a) => String(a.taxObligationId || ''))));
            for (const row of paidWithoutPayment) {
                if (!allocatedIds.has(String(row._id))) {
                    push({
                        category: row.taxType === 'CAPITAL_GAINS_WITHHOLDING_TAX' ? 'CGWT' : row.taxType === 'CAPITAL_GAINS_TAX' ? 'CGT' : 'VAT',
                        issueType: 'TAX_PAID_WITHOUT_PAYMENT_RECORD',
                        severity: 'HIGH',
                        entity: `TaxObligation ${row._id}`,
                        transaction: String(row._id),
                        taxType: row.taxType,
                        amount: Number(row.taxAmount || 0),
                        currentAmount: Number(row.taxAmount || 0),
                        expectedBasis: 'matching TaxPayment allocation',
                        reason: 'Obligation is PAID but no posted TaxPayment allocation exists',
                        recommendedAction: 'Record a ZIMRA payment or revert PAID status. Do not treat a receipt upload as payment.',
                        detail: 'Tax paid without payment record'
                    });
                }
            }
        }
        const cgtRates = yield TaxRate_1.TaxRate.countDocuments({ companyId, taxType: 'CGT', isActive: { $ne: false } });
        const cgwtRates = yield TaxRate_1.TaxRate.countDocuments({ companyId, taxType: 'CGWT', isActive: { $ne: false } });
        if (cgtRates === 0) {
            push({
                category: 'CGT',
                issueType: 'MISSING_CGT_RATE',
                severity: 'HIGH',
                entity: 'TaxRate CGT',
                taxType: 'CAPITAL_GAINS_TAX',
                amount: 0,
                currentAmount: 0,
                expectedBasis: 'effective-dated CGT rate',
                reason: 'No active Capital Gains Tax rate is configured',
                recommendedAction: 'Configure an effective-dated CGT rate in Settings → Tax Rates before settling sales.',
                detail: 'Missing CGT rate'
            });
        }
        if (cgwtRates === 0) {
            push({
                category: 'CGWT',
                issueType: 'MISSING_CGWT_RATE',
                severity: 'HIGH',
                entity: 'TaxRate CGWT',
                taxType: 'CAPITAL_GAINS_WITHHOLDING_TAX',
                amount: 0,
                currentAmount: 0,
                expectedBasis: 'effective-dated CGWT rate',
                reason: 'No active Capital Gains Withholding Tax rate is configured',
                recommendedAction: 'Configure a CGWT rate or mark sales CGWT_NOT_APPLICABLE with a reason. Do not treat missing rate as zero withholding.',
                detail: 'Missing CGWT rate'
            });
        }
        const cgtRows = yield TaxObligation_1.TaxObligation.find({ companyId, taxType: 'CAPITAL_GAINS_TAX', status: { $ne: 'REVERSED' } }).lean();
        const cgwtRows = yield TaxObligation_1.TaxObligation.find({ companyId, taxType: 'CAPITAL_GAINS_WITHHOLDING_TAX', status: { $ne: 'REVERSED' } }).lean();
        for (const row of cgtRows) {
            if (row.status === 'ACCOUNTANT_REVIEW' || (Number(row.taxAmount || 0) === 0 && String(row.calculationBasis || '').includes('RATE'))) {
                push({
                    category: 'CGT',
                    issueType: 'SALE_SETTLEMENT_VS_CGT',
                    severity: 'HIGH',
                    entity: `TaxObligation ${row._id}`,
                    transaction: String(row.paymentId || row._id),
                    taxType: 'CAPITAL_GAINS_TAX',
                    amount: Number(row.taxAmount || 0),
                    currentAmount: Number(row.taxAmount || 0),
                    expectedBasis: String(row.calculationBasis || ''),
                    reason: 'Capital Gains Tax obligation requires review',
                    recommendedAction: 'Complete acquisition cost and dated CGT rate, or mark CGT_NOT_APPLICABLE with a reason.',
                    detail: 'Capital Gains Tax obligation requires review'
                });
            }
        }
        for (const row of cgwtRows) {
            if (row.status === 'ACCOUNTANT_REVIEW') {
                push({
                    category: 'CGWT',
                    issueType: 'SALE_SETTLEMENT_VS_CGWT',
                    severity: 'HIGH',
                    entity: `TaxObligation ${row._id}`,
                    transaction: String(row.paymentId || row._id),
                    taxType: 'CAPITAL_GAINS_WITHHOLDING_TAX',
                    amount: Number(row.taxAmount || 0),
                    currentAmount: Number(row.taxAmount || 0),
                    expectedBasis: String(row.calculationBasis || ''),
                    reason: 'Capital Gains Withholding Tax obligation requires review',
                    recommendedAction: 'Record CGWT applicability. Missing rate is not the same as not applicable.',
                    detail: 'Capital Gains Withholding Tax obligation requires review'
                });
            }
        }
        const legacyCgt = yield TrustTransaction_1.TrustTransaction.find({
            companyId,
            type: 'CGT_DEDUCTION'
        })
            .select('_id debit credit trustAccountId type propertyId')
            .limit(50)
            .lean();
        for (const row of legacyCgt) {
            const amount = money(Number(row.debit || row.credit || 0));
            push({
                category: 'CGT',
                issueType: 'LEGACY_CGT_CALCULATION',
                severity: 'WARNING',
                entity: `TrustTransaction ${row._id}`,
                transaction: String(row._id),
                taxType: 'CAPITAL_GAINS_TAX',
                amount,
                currentAmount: amount,
                expectedBasis: 'capital gain × dated CGT rate; historical 20% × sale price is legacy',
                reason: 'Historical trust deduction labelled CGT. May be 20% of gross sale price.',
                recommendedAction: 'Leave the historical amount unchanged. Review as LEGACY CGT DEDUCTION. Create a controlled adjustment only if the accountant decides it is required.',
                detail: 'Legacy CGT trust deduction'
            });
        }
        const glRows = yield ChartOfAccount_1.ChartOfAccount.find({
            companyId,
            code: { $in: [chartAccounts_1.GL.TRUST_BANK, chartAccounts_1.GL.OWNER_PAYABLE, chartAccounts_1.GL.SELLER_PAYABLE, chartAccounts_1.GL.ZIMRA_WITHHOLDING, chartAccounts_1.GL.TENANT_DEPOSITS, chartAccounts_1.GL.LEVY_PAYABLE, chartAccounts_1.GL.AGENCY_REVENUE] },
            isDeleted: { $ne: true }
        }).select('code balance').lean();
        const glBalance = (code) => { var _a; return money(Number(((_a = glRows.find((row) => row.code === code)) === null || _a === void 0 ? void 0 : _a.balance) || 0)); };
        const trust = (0, trustReconciliation_1.buildTrustReconciliationReport)({
            trustBank: glBalance(chartAccounts_1.GL.TRUST_BANK),
            ownerPayable: glBalance(chartAccounts_1.GL.OWNER_PAYABLE),
            sellerPayable: glBalance(chartAccounts_1.GL.SELLER_PAYABLE),
            zimraWithholding: glBalance(chartAccounts_1.GL.ZIMRA_WITHHOLDING),
            tenantDeposits: glBalance(chartAccounts_1.GL.TENANT_DEPOSITS),
            levyPayable: glBalance(chartAccounts_1.GL.LEVY_PAYABLE)
        });
        if (trust.status === 'RECONCILIATION_EXCEPTION') {
            push({
                category: 'TRUST',
                issueType: trust.difference > 0 ? 'TRUST_SURPLUS' : 'TRUST_SHORTFALL',
                severity: Math.abs(trust.difference) > 1000 ? 'CRITICAL' : 'HIGH',
                entity: 'GL 1003 vs scoped client ledgers',
                taxType: 'TRUST',
                amount: trust.trustBank,
                currentAmount: trust.trustBank,
                expectedBasis: `client ledgers ${trust.clientLiabilities} (PARTIAL scope)`,
                reason: `Trust bank vs scoped client ledgers difference ${trust.difference}`,
                recommendedAction: 'Investigate the PARTIAL recon difference. Do not auto-repair. Excluded categories are documented on Tax Compliance.',
                detail: `Trust bank vs scoped client ledgers difference ${trust.difference}`
            });
        }
        const payments = yield Payment_1.Payment.find({
            companyId,
            status: 'completed',
            isProvisional: { $ne: true },
            reversalOfPaymentId: { $exists: false }
        })
            .select('commissionDetails amount paymentType')
            .limit(500)
            .lean();
        let agencyShareTotal = 0;
        let commissionNetTotal = 0;
        for (const payment of payments) {
            agencyShareTotal = money(agencyShareTotal + Number(((_c = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.agencyShare) || 0));
            commissionNetTotal = money(commissionNetTotal + Number(((_d = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _d === void 0 ? void 0 : _d.commissionNet) || ((_e = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _e === void 0 ? void 0 : _e.totalCommission) || 0));
        }
        const glCommission = glBalance(chartAccounts_1.GL.AGENCY_REVENUE);
        if (payments.length && Math.abs(commissionNetTotal - glCommission) > 1) {
            push({
                category: 'COMPANY',
                issueType: 'COMPANY_COMMISSION_VS_GL_REVENUE',
                severity: 'WARNING',
                entity: 'GL 4001',
                taxType: 'AGENCY_REVENUE',
                amount: commissionNetTotal,
                currentAmount: commissionNetTotal,
                expectedBasis: `GL 4001 ${glCommission}; CompanyAccount.agencyShare ${agencyShareTotal} is retained share after agent/PREA split, not GL 4001`,
                reason: 'Commission net vs GL 4001 difference detected (detection only)',
                recommendedAction: 'Reconcile commissionNet to GL 4001. Do not force equality with CompanyAccount.agencyShare.',
                detail: 'Commission net vs GL 4001 difference detected (detection only)'
            });
        }
        const vatRateReview = yield (0, taxRateService_1.detectVatRateReview)(companyId);
        if (vatRateReview) {
            push({
                category: 'VAT',
                issueType: 'VAT_RATE_2026_NOT_CONFIGURED',
                severity: 'HIGH',
                entity: 'TaxRate VAT',
                taxType: 'VAT',
                amount: Number(vatRateReview.currentRate || 0),
                currentAmount: Number(vatRateReview.currentRate || 0),
                expectedBasis: `${vatRateReview.expectedRate}% from 1 Jan 2026`,
                reason: vatRateReview.message,
                recommendedAction: 'Accountant review of the open VAT rate covering 1 January 2026. Do not rewrite historical rates.',
                detail: vatRateReview.message
            });
            yield (0, taxObligationService_1.openReview)({
                companyId,
                kind: 'VAT_RATE_2026_NOT_CONFIGURED',
                title: 'VAT RATE REVIEW REQUIRED',
                detail: vatRateReview.message,
                metadata: { currentRate: vatRateReview.currentRate, expectedRate: vatRateReview.expectedRate, severity: 'HIGH' }
            });
        }
        for (const finding of findings) {
            yield (0, taxObligationService_1.openReview)({
                companyId,
                kind: finding.issueType,
                title: finding.issueType.replace(/_/g, ' '),
                detail: finding.reason,
                metadata: finding
            });
        }
        return {
            generatedAt: new Date().toISOString(),
            detectionOnly: true,
            repaired: false,
            findings,
            trust
        };
    });
}
function fiscalisationSummary(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const notFiscalised = yield Invoice_1.Invoice.countDocuments({
                companyId,
                fiscalisationStatus: { $ne: 'FISCALISATION_SUCCESS' }
            });
            return { notFiscalised };
        }
        catch (_a) {
            return { notFiscalised: 0 };
        }
    });
}
function companyAccountVsGlNote() {
    return 'CompanyAccount.agencyShare is the retained agency share after PREA and agent split. GL 4001 is commission net (company commission revenue). They are intentionally different. Reconcile commissionNet to GL 4001 and agencyShare to commissionNet − preaFee − agentShare. Historical CompanyAccount values are not rewritten.';
}
