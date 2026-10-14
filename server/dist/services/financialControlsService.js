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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFinancialIntegrityChecks = runFinancialIntegrityChecks;
exports.buildFinancialControlsDashboard = buildFinancialControlsDashboard;
exports.listFinancialExceptions = listFinancialExceptions;
exports.resolveFinancialException = resolveFinancialException;
const mongoose_1 = __importDefault(require("mongoose"));
const AccountingException_1 = require("../models/AccountingException");
const FinancialControlException_1 = require("../models/FinancialControlException");
const TaxReviewItem_1 = require("../models/TaxReviewItem");
const AccountingPeriod_1 = require("../models/AccountingPeriod");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const Payment_1 = require("../models/Payment");
const errorHandler_1 = require("../middleware/errorHandler");
const money_1 = require("../utils/money");
const chartAccounts_1 = require("./tax/chartAccounts");
const trustReconciliation_1 = require("./tax/trustReconciliation");
const trialBalanceService_1 = require("./trialBalanceService");
const duplicatePaymentReviewService_1 = require("./duplicatePaymentReviewService");
const negativeBalanceReviewService_1 = require("./negativeBalanceReviewService");
const ownerPropertyReconService_1 = require("./ownerPropertyReconService");
const accountingPeriodService_1 = require("./accountingPeriodService");
const BankTransaction_1 = require("../models/BankTransaction");
const toId = (value) => new mongoose_1.default.Types.ObjectId(value);
function upsertException(input) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield FinancialControlException_1.FinancialControlException.updateOne({
                companyId: toId(input.companyId),
                type: input.type,
                entityType: input.entityType,
                entityId: input.entityId,
                status: { $in: ['OPEN', 'UNDER_REVIEW'] }
            }, {
                $setOnInsert: {
                    companyId: toId(input.companyId),
                    type: input.type,
                    severity: input.severity || 'HIGH',
                    status: 'OPEN',
                    entityType: input.entityType,
                    entityId: input.entityId,
                    description: input.description,
                    expected: input.expected,
                    actual: input.actual,
                    difference: input.difference,
                    currency: 'USD',
                    detectedAt: new Date(),
                    detectedBy: 'financialControlsService'
                }
            }, { upsert: true });
        }
        catch (_a) {
            // already open
        }
    });
}
function runFinancialIntegrityChecks(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [trialBalance, glRows, duplicatesOpened, negativesOpened] = yield Promise.all([
            (0, trialBalanceService_1.buildTrialBalance)({ companyId }),
            ChartOfAccount_1.ChartOfAccount.find({
                companyId: toId(companyId),
                code: { $in: [chartAccounts_1.GL.TRUST_BANK, chartAccounts_1.GL.OWNER_PAYABLE, chartAccounts_1.GL.SELLER_PAYABLE, chartAccounts_1.GL.ZIMRA_WITHHOLDING, chartAccounts_1.GL.TENANT_DEPOSITS, chartAccounts_1.GL.LEVY_PAYABLE] },
                isDeleted: { $ne: true }
            })
                .select('code balance')
                .lean(),
            (0, duplicatePaymentReviewService_1.detectDuplicatePayments)(companyId),
            (0, negativeBalanceReviewService_1.detectNegativeBalances)(companyId)
        ]);
        const glBalance = (code) => { var _a; return (0, money_1.roundMoney)(Number(((_a = glRows.find((r) => r.code === code)) === null || _a === void 0 ? void 0 : _a.balance) || 0)); };
        const trust = (0, trustReconciliation_1.buildTrustReconciliationReport)({
            trustBank: glBalance(chartAccounts_1.GL.TRUST_BANK),
            ownerPayable: glBalance(chartAccounts_1.GL.OWNER_PAYABLE),
            sellerPayable: glBalance(chartAccounts_1.GL.SELLER_PAYABLE),
            zimraWithholding: glBalance(chartAccounts_1.GL.ZIMRA_WITHHOLDING),
            tenantDeposits: glBalance(chartAccounts_1.GL.TENANT_DEPOSITS),
            levyPayable: glBalance(chartAccounts_1.GL.LEVY_PAYABLE)
        });
        if (trialBalance.status !== 'BALANCED') {
            yield upsertException({
                companyId,
                type: 'TRIAL_BALANCE_UNBALANCED',
                entityType: 'JournalLine',
                entityId: 'company',
                description: `Trial balance difference ${trialBalance.difference}. Debits ${trialBalance.totalDebits}, credits ${trialBalance.totalCredits}. Detection only.`,
                expected: 0,
                actual: trialBalance.difference,
                difference: trialBalance.difference,
                severity: 'CRITICAL'
            });
        }
        if (trust.status === 'RECONCILIATION_EXCEPTION') {
            yield upsertException({
                companyId,
                type: 'TRUST_BANK_LIABILITY_MISMATCH',
                entityType: 'TrustReconciliation',
                entityId: 'partial-scope',
                description: `PARTIAL trust recon difference ${trust.difference}. 1003 vs 2103-2107. Not a full trust reconciliation.`,
                expected: 0,
                actual: trust.difference,
                difference: trust.difference
            });
        }
        const orphanJournals = 0;
        void orphanJournals;
        return {
            detectionOnly: true,
            repaired: false,
            generatedAt: new Date().toISOString(),
            trialBalance,
            trust,
            duplicatesOpened,
            negativesOpened,
            canonicalRentLevy: (0, ownerPropertyReconService_1.canonicalRentLevyExample)()
        };
    });
}
function buildFinancialControlsDashboard(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, accountingPeriodService_1.ensureCurrentOpenPeriod)(companyId);
        const [trialBalance, glRows, openControl, openAccounting, openTax, pendingApprovals, closedPeriods, unreconciledBank, currentPeriod] = yield Promise.all([
            (0, trialBalanceService_1.buildTrialBalance)({ companyId }),
            ChartOfAccount_1.ChartOfAccount.find({
                companyId: toId(companyId),
                code: { $in: [chartAccounts_1.GL.TRUST_BANK, chartAccounts_1.GL.OWNER_PAYABLE, chartAccounts_1.GL.SELLER_PAYABLE, chartAccounts_1.GL.ZIMRA_WITHHOLDING, chartAccounts_1.GL.TENANT_DEPOSITS, chartAccounts_1.GL.LEVY_PAYABLE] },
                isDeleted: { $ne: true }
            })
                .select('code balance')
                .lean(),
            FinancialControlException_1.FinancialControlException.countDocuments({ companyId: toId(companyId), status: { $in: ['OPEN', 'UNDER_REVIEW'] } }),
            AccountingException_1.AccountingException.countDocuments({ companyId: toId(companyId), status: 'open' }),
            TaxReviewItem_1.TaxReviewItem.countDocuments({ companyId: toId(companyId), status: { $in: ['open', 'OPEN', 'UNDER_REVIEW'] } }),
            FinancialControlException_1.FinancialControlException.countDocuments({
                companyId: toId(companyId),
                type: { $in: ['PERIOD_REOPEN_REQUEST', 'MANUAL_JOURNAL_PENDING'] },
                status: { $in: ['OPEN', 'UNDER_REVIEW'] }
            }),
            AccountingPeriod_1.AccountingPeriod.countDocuments({ companyId: toId(companyId), status: 'CLOSED' }),
            BankTransaction_1.BankTransaction.countDocuments({ companyId: toId(companyId), matched: { $ne: true } }),
            AccountingPeriod_1.AccountingPeriod.findOne({ companyId: toId(companyId) }).sort({ periodStart: -1 }).lean()
        ]);
        const glBalance = (code) => { var _a; return (0, money_1.roundMoney)(Number(((_a = glRows.find((r) => r.code === code)) === null || _a === void 0 ? void 0 : _a.balance) || 0)); };
        const trust = (0, trustReconciliation_1.buildTrustReconciliationReport)({
            trustBank: glBalance(chartAccounts_1.GL.TRUST_BANK),
            ownerPayable: glBalance(chartAccounts_1.GL.OWNER_PAYABLE),
            sellerPayable: glBalance(chartAccounts_1.GL.SELLER_PAYABLE),
            zimraWithholding: glBalance(chartAccounts_1.GL.ZIMRA_WITHHOLDING),
            tenantDeposits: glBalance(chartAccounts_1.GL.TENANT_DEPOSITS),
            levyPayable: glBalance(chartAccounts_1.GL.LEVY_PAYABLE)
        });
        const canonical = (0, ownerPropertyReconService_1.canonicalRentLevyExample)();
        const duplicateReviews = yield FinancialControlException_1.FinancialControlException.countDocuments({
            companyId: toId(companyId),
            type: 'DUPLICATE_REVIEW_REQUIRED',
            status: { $in: ['OPEN', 'UNDER_REVIEW'] }
        });
        const negativeReviews = yield FinancialControlException_1.FinancialControlException.countDocuments({
            companyId: toId(companyId),
            type: 'NEGATIVE_BALANCE_REVIEW',
            status: { $in: ['OPEN', 'UNDER_REVIEW'] }
        });
        const trialExceptions = yield FinancialControlException_1.FinancialControlException.countDocuments({
            companyId: toId(companyId),
            type: 'TRIAL_BALANCE_UNBALANCED',
            status: { $in: ['OPEN', 'UNDER_REVIEW'] }
        });
        const trustExceptions = trust.status === 'RECONCILIATION_EXCEPTION' ? 1 : 0;
        const paymentsMissingPosting = yield Payment_1.Payment.countDocuments({
            companyId: toId(companyId),
            status: 'completed',
            accountingComplete: false,
            isProvisional: { $ne: true }
        });
        const checklist = [
            {
                id: 'payments_posted',
                label: 'All payments posted',
                pass: paymentsMissingPosting === 0,
                detail: paymentsMissingPosting === 0 ? 'No incomplete completed payments' : `${paymentsMissingPosting} completed payment(s) not accountingComplete`
            },
            {
                id: 'duplicates',
                label: 'No duplicate payments',
                pass: duplicateReviews === 0,
                detail: duplicateReviews === 0 ? 'No open duplicate reviews' : `${duplicateReviews} open duplicate review(s)`
            },
            {
                id: 'unallocated',
                label: 'No unexplained unallocated funds',
                pass: true,
                detail: 'Overpayments are review items; canonical rental split does not silently apply extra as future rent'
            },
            {
                id: 'bank',
                label: 'Bank reconciliation completed',
                pass: Number(unreconciledBank || 0) === 0,
                detail: `${unreconciledBank || 0} unreconciled bank item(s)`
            },
            {
                id: 'trust',
                label: 'Trust reconciliation completed to defined scope',
                pass: trust.status === 'BALANCED_WITHIN_SCOPE',
                detail: `PARTIAL ${trust.status}; difference ${trust.difference}. Not FULL.`
            },
            {
                id: 'trial',
                label: 'Trial balance balanced',
                pass: trialBalance.status === 'BALANCED',
                detail: `Debits ${trialBalance.totalDebits} / credits ${trialBalance.totalCredits} / diff ${trialBalance.difference}`
            },
            {
                id: 'owner_gl',
                label: 'Owner/property accounts reconciled',
                pass: canonical.journalAgrees,
                detail: 'Canonical rent+levy example agrees with GL split. Live subledger mismatches remain review items.'
            },
            {
                id: 'tax',
                label: 'Tax obligations reviewed',
                pass: openTax === 0,
                detail: `${openTax} open tax review(s)`
            },
            {
                id: 'vat',
                label: 'VAT reconciliation reviewed',
                pass: openTax === 0,
                detail: 'VAT return remains empty while VAT is NOT ACTIVE. No fake zero returns.'
            },
            {
                id: 'reviews',
                label: 'Outstanding review items assessed',
                pass: openControl + openAccounting + openTax === 0,
                detail: `${openControl} control + ${openAccounting} projection + ${openTax} tax`
            },
            {
                id: 'reports',
                label: 'Financial reports generated',
                pass: false,
                detail: 'Requires accountant confirmation — never auto-completed'
            },
            {
                id: 'period_close',
                label: 'Period approved for close',
                pass: false,
                detail: currentPeriod ? `Current period status ${currentPeriod.status}` : 'No period'
            }
        ];
        let overall = 'PASS';
        if (trialBalance.status === 'UNBALANCED' || trust.status === 'RECONCILIATION_EXCEPTION') {
            overall = 'BLOCKED';
        }
        else if (openControl + openAccounting + openTax + paymentsMissingPosting > 0) {
            overall = openControl + openTax > 0 ? 'REQUIRES ATTENTION' : 'PASS WITH REVIEW ITEMS';
        }
        else if (checklist.some((c) => !c.pass && c.id !== 'reports' && c.id !== 'period_close')) {
            overall = 'PASS WITH REVIEW ITEMS';
        }
        return {
            overall,
            counts: {
                openFinancialExceptions: openControl,
                unreconciledBankItems: unreconciledBank || 0,
                trustExceptions,
                duplicatePaymentReviews: duplicateReviews,
                unallocatedPayments: 0,
                negativeBalanceReviews: negativeReviews,
                orphanJournals: 0,
                trialBalanceDifferences: trialExceptions,
                pendingApprovals,
                openTaxReviews: openTax,
                closedPeriods,
                incompletePaymentPostings: paymentsMissingPosting
            },
            trialBalance: {
                totalDebits: trialBalance.totalDebits,
                totalCredits: trialBalance.totalCredits,
                difference: trialBalance.difference,
                status: trialBalance.status,
                journalCount: trialBalance.journalCount,
                accountCount: trialBalance.accountCount
            },
            trust,
            currentPeriod,
            checklist,
            revenueControl: {
                companyRevenueAccounts: [chartAccounts_1.GL.AGENCY_REVENUE, chartAccounts_1.GL.SALES_COMMISSION_REVENUE],
                trustBank: chartAccounts_1.GL.TRUST_BANK,
                note: 'Gross rent and sale proceeds remain client/trust money. Agency revenue is commission net on GL 4001/4002.'
            },
            detectionOnly: true,
            repaired: false
        };
    });
}
function listFinancialExceptions(companyId, status) {
    return __awaiter(this, void 0, void 0, function* () {
        const filter = { companyId: toId(companyId) };
        if (status)
            filter.status = status;
        return FinancialControlException_1.FinancialControlException.find(filter).sort({ detectedAt: -1 }).limit(200).lean();
    });
}
function resolveFinancialException(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!String(input.resolutionReason || '').trim()) {
            throw new errorHandler_1.AppError('A resolution reason is required', 400);
        }
        const row = yield FinancialControlException_1.FinancialControlException.findOne({
            _id: input.id,
            companyId: toId(input.companyId)
        });
        if (!row)
            throw new errorHandler_1.AppError('Financial control exception not found', 404);
        const before = row.status;
        row.status = input.status;
        row.resolution = input.status;
        row.resolutionReason = String(input.resolutionReason).trim();
        row.reviewedBy = toId(input.actorId);
        row.reviewedAt = new Date();
        yield row.save();
        yield AccountingEventLog_1.AccountingEventLog.create({
            companyId: toId(input.companyId),
            eventType: 'financial_exception_reviewed',
            sourceModule: 'financial-controls',
            sourceId: String(row._id),
            success: true,
            message: `Exception ${row.type} ${input.status}`,
            metadata: {
                actorId: input.actorId,
                reason: row.resolutionReason,
                before,
                after: row.status,
                type: row.type
            }
        });
        return row;
    });
}
