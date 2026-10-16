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
exports.detectVatOnCommissionExceptions = detectVatOnCommissionExceptions;
exports.runTaxIntegrityChecks = runTaxIntegrityChecks;
exports.fiscalisationSummary = fiscalisationSummary;
exports.companyAccountVsGlNote = companyAccountVsGlNote;
const VatReturn_1 = require("../models/VatReturn");
const TaxObligation_1 = require("../models/TaxObligation");
const TaxPayment_1 = require("../models/TaxPayment");
const TaxRate_1 = require("../models/TaxRate");
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const Payment_1 = require("../models/Payment");
const Property_1 = require("../models/Property");
const VatRecord_1 = require("../models/VatRecord");
const Company_1 = require("../models/Company");
const vatPolicyService_1 = require("./vatPolicyService");
const vatApplicability_1 = require("./tax/vatApplicability");
const Invoice_1 = require("../models/Invoice");
const TrustTransaction_1 = require("../models/TrustTransaction");
const chartAccounts_1 = require("./tax/chartAccounts");
const taxObligationService_1 = require("./taxObligationService");
const vatReturnService_1 = require("./vatReturnService");
const taxRateService_1 = require("./taxRateService");
const money_1 = require("../utils/money");
const trustReconciliation_1 = require("./tax/trustReconciliation");
const financialPostingGapService_1 = require("./financialPostingGapService");
const money = (n) => (0, money_1.roundMoney)(Number(n || 0));
/**
 * Read-only VAT-on-commission exceptions. Does not rewrite payments, journals, or rates.
 */
function detectVatOnCommissionExceptions(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const findings = [];
        const company = yield Company_1.Company.findById(companyId).select('taxProfile').lean();
        const registration = (0, vatPolicyService_1.companyVatRegistrationFromDoc)(company);
        const properties = yield Property_1.Property.find({ companyId, vatOnCommission: true })
            .select('_id vatOnCommission vatCommissionTreatment rentalType')
            .lean();
        const propertyById = new Map(properties.map((row) => [String(row._id), row]));
        const payments = yield Payment_1.Payment.find({
            companyId,
            paymentType: { $in: ['rental', 'introduction'] },
            status: 'completed',
            isProvisional: { $ne: true },
            reversalOfPaymentId: { $exists: false }
        }).select('_id propertyId paymentDate rentalPeriodMonth rentalPeriodYear amount commissionDetails applyVatOnCommission vatOnCommissionRate accountingComplete referenceNumber').lean();
        const paymentIds = payments.map((row) => row._id);
        const obligations = yield TaxObligation_1.TaxObligation.find({
            companyId,
            paymentId: { $in: paymentIds },
            taxType: 'VAT_ON_COMMISSION'
        }).select('_id paymentId taxAmount taxRate status reversalOf taxPeriod').lean();
        const originalsByPayment = new Map();
        for (const row of obligations) {
            if (row.reversalOf)
                continue;
            const key = String(row.paymentId);
            const list = originalsByPayment.get(key) || [];
            list.push(row);
            originalsByPayment.set(key, list);
        }
        const vatRecords = yield VatRecord_1.VatRecord.find({
            companyId,
            transactionId: { $in: payments.map((row) => String(row._id)) }
        }).select('transactionId vatCollected status').lean();
        const vatRecordByPayment = new Map(vatRecords.map((row) => [String(row.transactionId), row]));
        for (const payment of payments) {
            const details = payment.commissionDetails || {};
            const commission = money(Number((_b = (_a = details.commissionNet) !== null && _a !== void 0 ? _a : details.totalCommission) !== null && _b !== void 0 ? _b : 0));
            const vat = money(Number((_d = (_c = details.vatOnCommission) !== null && _c !== void 0 ? _c : details.vatAmount) !== null && _d !== void 0 ? _d : 0));
            const property = propertyById.get(String(payment.propertyId));
            if (!(commission > 0))
                continue;
            const applicable = Boolean(property === null || property === void 0 ? void 0 : property.vatOnCommission) && (0, vatApplicability_1.evaluateVatApplicability)({
                company: registration,
                transactionDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
                supplyTreatment: 'STANDARD_TAXABLE',
                useClass: 'AGENCY_COMMISSION',
                requested: true
            }).vatApplies;
            const linked = originalsByPayment.get(String(payment._id)) || [];
            const activeLinked = linked.filter((row) => row.status !== 'REVERSED');
            const obligationTotal = money(activeLinked.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0));
            const base = {
                transaction: String(payment._id),
                amount: vat,
                currentAmount: vat,
                entity: `Payment ${payment.referenceNumber || payment._id}`
            };
            if (applicable && !(vat > 0)) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'MISSING_VAT_ON_ELIGIBLE_COMMISSION', severity: 'CRITICAL', taxType: 'VAT_ON_COMMISSION', expectedBasis: `commission ${commission} with property VAT on commission and company registration on the payment date`, reason: 'Eligible rental commission has no VAT snapshot.', recommendedAction: 'Do not recalculate this historical payment automatically. Approve a separate correction that preserves the original record.', detail: `Payment ${payment._id} period ${payment.rentalPeriodMonth}/${payment.rentalPeriodYear} commission ${commission} VAT ${vat}.` }));
            }
            if (!applicable && vat > 0 && !(property === null || property === void 0 ? void 0 : property.vatOnCommission)) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'VAT_ON_INELIGIBLE_COMMISSION', severity: 'HIGH', taxType: 'VAT_ON_COMMISSION', expectedBasis: 'property VAT on commission disabled', reason: 'VAT on commission is stored for a property that does not enable it.', recommendedAction: 'Leave the stored snapshot unchanged until an authorised reversal or adjustment is approved.', detail: `Payment ${payment._id} stored VAT ${vat} while the property flag is off.` }));
            }
            if (!registration.vatRegistered && (property === null || property === void 0 ? void 0 : property.vatOnCommission) && !(vat > 0)) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'VAT_WITHHELD_COMPANY_NOT_REGISTERED', severity: 'WARNING', taxType: 'VAT_ON_COMMISSION', expectedBasis: 'no VAT while the company tax profile is not VAT registered', reason: 'The property requests VAT on commission, but the company is not marked VAT registered, so this payment stored commission without VAT.', recommendedAction: 'Do not backfill VAT. Confirm whether the company should have been registered on the payment date, then approve a correction only if VAT should have been charged.', detail: `Payment ${payment._id} period ${payment.rentalPeriodMonth}/${payment.rentalPeriodYear} commission ${commission} VAT ${vat}.` }));
            }
            if (!registration.vatRegistered && vat > 0) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'VAT_CHARGED_WHILE_COMPANY_NOT_REGISTERED', severity: 'HIGH', taxType: 'VAT_ON_COMMISSION', expectedBasis: 'company tax profile vatRegistered is false', reason: 'VAT on commission was stored while the company is not marked VAT registered.', recommendedAction: 'Do not rewrite the payment. Confirm registration status and approve a correction only if the charge was wrong.', detail: `Payment ${payment._id} on ${payment.paymentDate ? new Date(payment.paymentDate).toISOString().slice(0, 10) : 'unknown date'} stored VAT ${vat}.` }));
            }
            if (vat > 0 && activeLinked.length === 0) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'VAT_SNAPSHOT_WITHOUT_OBLIGATION', severity: 'HIGH', taxType: 'VAT_ON_COMMISSION', expectedBasis: `tax obligation ${vat}`, reason: 'Payment VAT snapshot has no matching VAT-on-commission tax obligation.', recommendedAction: 'Create the missing obligation through the payment accounting pipeline after approval. Do not add a parallel tax record.', detail: `Payment ${payment._id} VAT snapshot ${vat} accountingComplete ${payment.accountingComplete === true}.` }));
            }
            if (vat > 0 && activeLinked.length > 0 && Math.abs(obligationTotal - vat) > 0.005) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'VAT_SNAPSHOT_OBLIGATION_MISMATCH', severity: 'HIGH', taxType: 'VAT_ON_COMMISSION', amount: obligationTotal, currentAmount: vat, expectedBasis: `obligation total ${obligationTotal}`, reason: 'Payment VAT snapshot does not match the tax obligation amount.', recommendedAction: 'Review both records. Do not silently overwrite either amount.', detail: `Payment ${payment._id} snapshot ${vat} obligation ${obligationTotal}.` }));
            }
            if (activeLinked.length > 1) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'DUPLICATE_VAT_ON_COMMISSION_OBLIGATION', severity: 'CRITICAL', taxType: 'VAT_ON_COMMISSION', expectedBasis: 'one original obligation per payment', reason: 'More than one original VAT-on-commission obligation exists for this payment.', recommendedAction: 'Do not delete historical rows automatically. Approve which obligation remains.', detail: `Payment ${payment._id} has ${activeLinked.length} original obligations.` }));
            }
            const vatRecord = vatRecordByPayment.get(String(payment._id));
            if (vat > 0 && vatRecord && vatRecord.status !== 'reversed' && Math.abs(money(Number(vatRecord.vatCollected || 0)) - vat) > 0.005) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'VAT_SNAPSHOT_RECORD_MISMATCH', severity: 'HIGH', taxType: 'VAT_ON_COMMISSION', amount: money(Number(vatRecord.vatCollected || 0)), currentAmount: vat, expectedBasis: `vat record ${money(Number(vatRecord.vatCollected || 0))}`, reason: 'Payment VAT snapshot does not match the VAT collection record.', recommendedAction: 'Reconcile the collection record to the payment snapshot through the accounting pipeline. Do not invent a second collection.', detail: `Payment ${payment._id} snapshot ${vat} collection ${vatRecord.vatCollected}.` }));
            }
            if (payment.accountingComplete === true && applicable && !(vat > 0)) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'ACCOUNTING_COMPLETE_WITH_MISSING_VAT', severity: 'CRITICAL', taxType: 'VAT_ON_COMMISSION', expectedBasis: 'accountingComplete false until VAT is posted', reason: 'Payment is marked accounting complete while required VAT on commission is missing.', recommendedAction: 'Leave the financial amounts unchanged. Clear the complete flag only through the authorised accounting review.', detail: `Payment ${payment._id} is accountingComplete with commission ${commission} and VAT ${vat}.` }));
            }
            if (payment.accountingComplete === true && vat > 0 && activeLinked.length === 0) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'ACCOUNTING_COMPLETE_WITH_MISSING_OBLIGATION', severity: 'HIGH', taxType: 'VAT_ON_COMMISSION', expectedBasis: `VAT obligation ${vat}`, reason: 'Payment is marked accounting complete while its VAT snapshot has no tax obligation.', recommendedAction: 'Do not create the obligation from this check. Use the payment accounting pipeline only after approval.', detail: `Payment ${payment._id} on ${payment.paymentDate ? new Date(payment.paymentDate).toISOString().slice(0, 10) : 'unknown date'} period ${payment.rentalPeriodMonth}/${payment.rentalPeriodYear} snapshot ${vat}.` }));
            }
            const obligationsFullyReversed = (originalsByPayment.get(String(payment._id)) || []).some((row) => row.status === 'REVERSED')
                && activeLinked.length === 0;
            if (vat > 0 && !vatRecord && !obligationsFullyReversed) {
                findings.push(Object.assign(Object.assign({}, base), { category: 'VAT', issueType: 'VAT_SNAPSHOT_WITHOUT_COLLECTION', severity: 'HIGH', taxType: 'VAT_ON_COMMISSION', expectedBasis: `VAT collection record ${vat}`, reason: 'Payment VAT snapshot has no VAT collection record.', recommendedAction: 'Do not insert a collection record outside the payment accounting pipeline.', detail: `Payment ${payment._id} snapshot ${vat} has no VatRecord.` }));
            }
        }
        const knownPaymentIds = new Set(payments.map((row) => String(row._id)));
        const companyObligations = yield TaxObligation_1.TaxObligation.find({
            companyId,
            taxType: 'VAT_ON_COMMISSION'
        }).select('_id paymentId taxAmount status reversalOf taxPeriod transactionDate').lean();
        for (const row of companyObligations) {
            if (row.reversalOf)
                continue;
            const paymentId = row.paymentId ? String(row.paymentId) : '';
            if (paymentId && knownPaymentIds.has(paymentId))
                continue;
            findings.push({
                category: 'VAT',
                issueType: 'VAT_OBLIGATION_WITHOUT_PAYMENT',
                severity: 'HIGH',
                entity: `Tax obligation ${row._id}`,
                transaction: paymentId || undefined,
                taxType: 'VAT_ON_COMMISSION',
                amount: money(Number(row.taxAmount || 0)),
                currentAmount: money(Number(row.taxAmount || 0)),
                expectedBasis: 'a completed rental payment for this company',
                reason: 'A VAT-on-commission obligation has no matching completed payment in this company.',
                recommendedAction: 'Do not delete the obligation from this check. Confirm the payment reference before any correction.',
                detail: `Obligation ${row._id} payment ${paymentId || 'missing'} period ${row.taxPeriod || 'unknown'} amount ${money(Number(row.taxAmount || 0))} status ${row.status}.`
            });
        }
        let activeSnapshot = 0;
        let activeObligation = 0;
        let reversedSnapshot = 0;
        const unexplained = [];
        for (const payment of payments) {
            const vat = money(Number((_h = (_f = (_e = payment.commissionDetails) === null || _e === void 0 ? void 0 : _e.vatOnCommission) !== null && _f !== void 0 ? _f : (_g = payment.commissionDetails) === null || _g === void 0 ? void 0 : _g.vatAmount) !== null && _h !== void 0 ? _h : 0));
            if (!(vat > 0))
                continue;
            const linked = (originalsByPayment.get(String(payment._id)) || []).filter((row) => row.status !== 'REVERSED');
            const fullyReversed = (originalsByPayment.get(String(payment._id)) || []).length > 0 && linked.length === 0;
            if (fullyReversed) {
                reversedSnapshot = money(reversedSnapshot + vat);
                continue;
            }
            activeSnapshot = money(activeSnapshot + vat);
            const obligationTotal = money(linked.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0));
            activeObligation = money(activeObligation + obligationTotal);
            if (Math.abs(obligationTotal - vat) > 0.005) {
                unexplained.push(`${payment._id}: snapshot ${vat}, obligation ${obligationTotal}`);
            }
        }
        if (Math.abs(activeSnapshot - activeObligation) > 0.005) {
            findings.push({
                category: 'VAT',
                issueType: 'VAT_OBLIGATION_SNAPSHOT_RECONCILIATION',
                severity: 'HIGH',
                entity: `Company ${companyId}`,
                taxType: 'VAT_ON_COMMISSION',
                amount: activeObligation,
                currentAmount: activeSnapshot,
                expectedBasis: `active VAT snapshots ${activeSnapshot}`,
                reason: 'Active VAT-on-commission snapshots do not match active tax obligations. Reversed payments are excluded from both sides.',
                recommendedAction: 'Review the listed payments. Do not adjust the VAT return by recalculating historical snapshots.',
                detail: `Snapshots ${activeSnapshot}, obligations ${activeObligation}, reversed snapshots excluded ${reversedSnapshot}. ${unexplained.join('; ') || 'No per-payment breakdown.'}`
            });
        }
        return findings;
    });
}
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
        findings.push(...yield detectVatOnCommissionExceptions(companyId));
        const postingGaps = yield (0, financialPostingGapService_1.detectFinancialPostingGaps)(companyId);
        for (const gap of postingGaps) {
            push({
                category: 'VAT',
                issueType: gap.issueType,
                severity: gap.issueType.includes('DUPLICATE') || gap.issueType.includes('COMPLETE') ? 'CRITICAL' : 'HIGH',
                entity: `Payment ${gap.reference}`,
                transaction: gap.paymentId,
                taxType: 'VAT_ON_COMMISSION',
                amount: gap.amount,
                currentAmount: gap.amount,
                expectedBasis: gap.missingRecord,
                reason: `${gap.missingRecord} for company ${gap.companyId}, payment ${gap.reference}, amount ${gap.amount.toFixed(2)}.`,
                recommendedAction: gap.recommendedReview,
                detail: gap.recommendedReview
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
