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
exports.buildComplianceMigrationReport = buildComplianceMigrationReport;
const Payment_1 = require("../models/Payment");
const TaxRecord_1 = require("../models/TaxRecord");
const TaxObligation_1 = require("../models/TaxObligation");
const TrustAccount_1 = require("../models/TrustAccount");
const TrustTransaction_1 = require("../models/TrustTransaction");
const Company_1 = require("../models/Company");
const cgtCalculation_1 = require("./tax/cgtCalculation");
const taxRateService_1 = require("./taxRateService");
const money_1 = require("../utils/money");
const taxObligationService_1 = require("./taxObligationService");
/**
 * Read-only historical review. Does not rewrite payments, journals, or tax amounts.
 */
function buildComplianceMigrationReport(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const issues = [];
        const company = yield Company_1.Company.findById(companyId).select('taxProfile vatNumber tinNumber').lean();
        const vatRegistered = Boolean((_a = company === null || company === void 0 ? void 0 : company.taxProfile) === null || _a === void 0 ? void 0 : _a.vatRegistered);
        if (!vatRegistered && !(company === null || company === void 0 ? void 0 : company.vatNumber)) {
            issues.push({
                reference: 'COMPANY',
                kind: 'VAT_REGISTRATION_STATUS_MISSING',
                detail: 'Company VAT registration status is not configured'
            });
            yield (0, taxObligationService_1.openReview)({
                companyId,
                kind: 'VAT_REGISTRATION_STATUS_MISSING',
                title: 'VAT registration status missing'
            });
        }
        const payments = yield Payment_1.Payment.find({
            companyId,
            status: 'completed',
            reversalOfPaymentId: { $exists: false }
        })
            .select('referenceNumber paymentType amount vatAmount commissionDetails paymentDate')
            .limit(2000)
            .lean();
        for (const payment of payments) {
            const ref = String(payment.referenceNumber || payment._id);
            if (String(payment.paymentType) === 'sale') {
                const cgtGuess = (0, money_1.roundMoney)(Number(payment.amount || 0) * 0.2);
                if (cgtGuess > 0 && (0, cgtCalculation_1.isFlatSalePriceCgt)(Number(payment.amount || 0), cgtGuess)) {
                    // Flag only when a TaxRecord already stored that pattern
                }
            }
        }
        const taxRecords = yield TaxRecord_1.TaxRecord.find({ companyId, taxType: 'CGT' }).lean();
        for (const record of taxRecords) {
            const trust = yield TrustAccount_1.TrustAccount.findById(record.trustAccountId).select('propertyId purchasePrice').lean();
            const salePrice = Number((trust === null || trust === void 0 ? void 0 : trust.purchasePrice) || 0);
            if (salePrice > 0 && (0, cgtCalculation_1.isFlatSalePriceCgt)(salePrice, Number(record.amount || 0))) {
                issues.push({
                    reference: String(record._id),
                    kind: 'LEGACY_CGT_ON_GROSS_SALE_PRICE',
                    detail: `CGT ${record.amount} equals 20% of sale price ${salePrice}`,
                    paymentId: undefined
                });
                yield (0, taxObligationService_1.openReview)({
                    companyId,
                    kind: 'LEGACY_CGT_CALCULATION',
                    title: 'Historical calculation may require accountant review',
                    detail: `Historical CGT ${record.amount} equals 20% of sale price ${salePrice}. Historical calculation may require accountant review. No amount was rewritten.`,
                    propertyId: (trust === null || trust === void 0 ? void 0 : trust.propertyId) ? String(trust.propertyId) : undefined,
                    metadata: { taxRecordId: String(record._id), salePrice, amount: record.amount }
                });
            }
        }
        const cgwtMissing = yield TrustAccount_1.TrustAccount.find({ companyId, status: { $in: ['OPEN', 'SETTLED'] } })
            .select('_id propertyId purchasePrice')
            .lean();
        for (const account of cgwtMissing) {
            const hasCgwt = yield TaxObligation_1.TaxObligation.exists({
                companyId,
                taxType: 'CAPITAL_GAINS_WITHHOLDING_TAX',
                propertyId: account.propertyId,
                status: { $ne: 'REVERSED' }
            });
            if (!hasCgwt && Number(account.purchasePrice || 0) > 0) {
                issues.push({
                    reference: String(account._id),
                    kind: 'CGWT_MISSING',
                    detail: 'Sale trust has no Capital Gains Withholding Tax obligation'
                });
                yield (0, taxObligationService_1.openReview)({
                    companyId,
                    kind: 'CGWT_MISSING',
                    title: 'Capital Gains Withholding Tax missing',
                    propertyId: String(account.propertyId),
                    metadata: { trustAccountId: String(account._id) }
                });
            }
        }
        const centralVatReview = yield (0, taxRateService_1.detectVatRateReview)(companyId);
        if (centralVatReview) {
            issues.push({
                reference: 'VAT-RATE-2026',
                kind: 'VAT_RATE_2026_NOT_CONFIGURED',
                detail: centralVatReview.message
            });
            yield (0, taxObligationService_1.openReview)({
                companyId,
                kind: 'VAT_RATE_2026_NOT_CONFIGURED',
                title: 'Central VAT rate from 1 January 2026 needs system-admin review',
                detail: centralVatReview.message
            });
        }
        const obligationCount = yield TaxObligation_1.TaxObligation.countDocuments({ companyId, status: { $ne: 'REVERSED' } });
        const trustTxCount = yield TrustTransaction_1.TrustTransaction.countDocuments({ companyId });
        return {
            generatedAt: new Date().toISOString(),
            companyId,
            scannedPayments: payments.length,
            scannedCgtRecords: taxRecords.length,
            existingTaxObligations: obligationCount,
            trustTransactions: trustTxCount,
            issues,
            note: 'No historical amounts were recalculated or rewritten.'
        };
    });
}
