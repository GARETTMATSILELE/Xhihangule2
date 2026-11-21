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
exports.loadComplianceSignals = loadComplianceSignals;
exports.loadTaxPositionResponse = loadTaxPositionResponse;
const TaxObligation_1 = require("../../models/TaxObligation");
const TaxReviewItem_1 = require("../../models/TaxReviewItem");
const ChartOfAccount_1 = require("../../models/ChartOfAccount");
const taxRateService_1 = require("../taxRateService");
const chartAccounts_1 = require("./chartAccounts");
const trustReconciliation_1 = require("./trustReconciliation");
const taxPositionRead_1 = require("./taxPositionRead");
const newTaxIntegrityRead_1 = require("./newTaxIntegrityRead");
const taxDashboard_1 = require("./taxDashboard");
const money_1 = require("../../utils/money");
const OPEN_REVIEW = { $in: ['open', 'OPEN', 'UNDER_REVIEW'] };
/**
 * Read-only tax dashboard. Loads the canonical position and compliance signals.
 * It does not create obligations, post journals, or edit ledgers.
 */
function loadComplianceSignals(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [openReviews, vatRateReview, cgtHistoricalReviews, cgwtMissingApplicability, unpaidVatPeriods, glRows] = yield Promise.all([
            TaxReviewItem_1.TaxReviewItem.countDocuments({ companyId, status: OPEN_REVIEW }),
            (0, taxRateService_1.detectVatRateReview)(companyId),
            TaxReviewItem_1.TaxReviewItem.countDocuments({
                companyId,
                kind: { $in: ['CGT_MISSING_ACQUISITION_COST', 'CGT_RATE_NOT_CONFIGURED', 'LEGACY_CGT_ON_GROSS_SALE_PRICE', 'CGT_SETTLEMENT_REVIEW_REQUIRED', 'LEGACY_CGT_CALCULATION'] },
                status: OPEN_REVIEW
            }),
            TaxReviewItem_1.TaxReviewItem.countDocuments({
                companyId,
                kind: { $in: ['CGWT_MISSING', 'CGWT_RATE_NOT_CONFIGURED', 'CGWT_RATE_MISSING', 'CGWT_APPLICABILITY_UNDECIDED'] },
                status: OPEN_REVIEW
            }),
            TaxObligation_1.TaxObligation.distinct('taxPeriod', {
                companyId,
                taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] },
                status: { $nin: ['PAID', 'RECONCILED', 'REVERSED'] }
            }),
            ChartOfAccount_1.ChartOfAccount.find({
                companyId,
                code: { $in: [chartAccounts_1.GL.TRUST_BANK, chartAccounts_1.GL.OWNER_PAYABLE, chartAccounts_1.GL.SELLER_PAYABLE, chartAccounts_1.GL.ZIMRA_WITHHOLDING, chartAccounts_1.GL.TENANT_DEPOSITS, chartAccounts_1.GL.LEVY_PAYABLE] },
                isDeleted: { $ne: true }
            }).select('code balance').lean()
        ]);
        const glBalance = (code) => { var _a; return (0, money_1.roundMoney)(Number(((_a = glRows.find((row) => row.code === code)) === null || _a === void 0 ? void 0 : _a.balance) || 0)); };
        const trust = (0, trustReconciliation_1.buildTrustReconciliationReport)({
            trustBank: glBalance(chartAccounts_1.GL.TRUST_BANK),
            ownerPayable: glBalance(chartAccounts_1.GL.OWNER_PAYABLE),
            sellerPayable: glBalance(chartAccounts_1.GL.SELLER_PAYABLE),
            zimraWithholding: glBalance(chartAccounts_1.GL.ZIMRA_WITHHOLDING),
            tenantDeposits: glBalance(chartAccounts_1.GL.TENANT_DEPOSITS),
            levyPayable: glBalance(chartAccounts_1.GL.LEVY_PAYABLE)
        });
        return {
            openReviews,
            vatRateReview: Boolean(vatRateReview),
            cgtHistoricalReviews,
            cgwtMissingApplicability,
            unpaidVatPeriods: unpaidVatPeriods.length,
            trustStatus: trust.status
        };
    });
}
function loadTaxPositionResponse(companyId, asOf, taxPeriod) {
    return __awaiter(this, void 0, void 0, function* () {
        const [position, newPeriod, signals] = yield Promise.all([
            (0, taxPositionRead_1.loadCompanyTaxPosition)(companyId, asOf),
            (0, newTaxIntegrityRead_1.loadNewTaxIntegrity)(companyId),
            loadComplianceSignals(companyId)
        ]);
        const dashboard = (0, taxDashboard_1.buildTaxDashboard)(position, {
            taxPeriod,
            compliance: Object.assign(Object.assign({}, signals), { newPeriodStatus: newPeriod.status })
        });
        return Object.assign(Object.assign({}, position), { newPeriod, dashboard });
    });
}
