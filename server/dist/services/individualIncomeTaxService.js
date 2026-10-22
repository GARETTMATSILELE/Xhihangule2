"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.individualIncomeTaxService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const pdf_lib_1 = require("pdf-lib");
const IndividualIncomeTaxRecord_1 = require("../models/IndividualIncomeTaxRecord");
const IndividualIncomeTaxAdjustment_1 = require("../models/IndividualIncomeTaxAdjustment");
const IndividualIncomeTaxPayment_1 = require("../models/IndividualIncomeTaxPayment");
const TransactionTaxSnapshot_1 = require("../models/TransactionTaxSnapshot");
const Payment_1 = require("../models/Payment");
const LandlordFinancialTransaction_1 = require("../models/LandlordFinancialTransaction");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const TaxPeriod_1 = require("../models/TaxPeriod");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const taxPeriodService_1 = require("./taxPeriodService");
const individualIncomeTaxClassification_1 = require("./individualIncomeTaxClassification");
const individualIncomeTaxCalculation_1 = require("./individualIncomeTaxCalculation");
const xlsxWorkbook_1 = require("../utils/xlsxWorkbook");
const money_1 = require("../utils/money");
const propertyAccountTotals_1 = require("./propertyAccountTotals");
const taxMetadataTypes_1 = require("./tax/taxMetadataTypes");
const incomeTaxTypes_1 = require("./tax/incomeTaxTypes");
const rentalTaxTypes_1 = require("./tax/rentalTaxTypes");
const taxRuleRegistry_1 = require("./taxRuleRegistry");
const DISCLAIMER = 'Income-tax figures shown here are working-paper calculations based on the information and tax classifications recorded in Mantis. They are not a ZIMRA assessment or confirmation of tax payable.';
function asObjectId(value) {
    return new mongoose_1.default.Types.ObjectId(value);
}
function toApi(row) {
    var _a;
    const doc = row;
    return {
        id: String(doc._id),
        sourceType: doc.sourceType,
        sourceId: String(doc.sourceId),
        snapshotId: doc.snapshotId ? String(doc.snapshotId) : null,
        propertyId: doc.propertyId ? String(doc.propertyId) : null,
        taxPeriodId: doc.taxPeriodId ? String(doc.taxPeriodId) : null,
        taxPeriodKey: doc.taxPeriodKey,
        taxType: doc.taxType,
        recordKind: doc.recordKind,
        reversalOf: doc.reversalOf ? String(doc.reversalOf) : null,
        incomeTaxRegime: doc.incomeTaxRegime,
        classification: doc.classification,
        accountingIncome: doc.accountingIncome,
        accountingExpenses: doc.accountingExpenses,
        addBacks: doc.addBacks,
        deductions: doc.deductions,
        exemptIncome: doc.exemptIncome,
        capitalAdjustments: doc.capitalAdjustments,
        otherTaxAdjustments: doc.otherTaxAdjustments,
        taxableContribution: doc.taxableContribution,
        taxableIncome: doc.taxableIncome,
        taxRate: doc.taxRate,
        taxAmount: doc.taxAmount,
        calculationMethod: doc.calculationMethod,
        calculationStatus: doc.calculationStatus,
        reviewStatus: doc.reviewStatus,
        reviewReason: doc.reviewReason || null,
        reviewReasons: doc.reviewReasons || [],
        supportingDocumentStatus: doc.supportingDocumentStatus,
        taxRuleId: doc.taxRuleId || null,
        taxRuleVersion: (_a = doc.taxRuleVersion) !== null && _a !== void 0 ? _a : null,
        taxRuleCode: doc.taxRuleCode || null,
        sourceReference: doc.sourceReference || null,
        currency: doc.currency,
        transactionCurrency: doc.transactionCurrency,
        taxCurrency: doc.taxCurrency,
        exchangeRate: doc.exchangeRate,
        exchangeRateDate: doc.exchangeRateDate,
        exchangeRateSource: doc.exchangeRateSource || null,
        vatAmount: null,
        presumptiveTaxAmount: null
    };
}
function adjustmentToApi(row) {
    var _a;
    const doc = row;
    return {
        id: String(doc._id),
        taxPeriodKey: doc.taxPeriodKey,
        taxPeriodId: doc.taxPeriodId ? String(doc.taxPeriodId) : null,
        adjustmentType: doc.adjustmentType,
        amount: doc.amount,
        currency: doc.currency,
        reason: doc.reason,
        explanation: doc.explanation || null,
        sourceTransactionIds: doc.sourceTransactionIds || [],
        supportingDocumentIds: doc.supportingDocumentIds || [],
        ruleId: doc.ruleId || null,
        ruleVersion: (_a = doc.ruleVersion) !== null && _a !== void 0 ? _a : null,
        status: doc.status,
        reviewStatus: doc.reviewStatus
    };
}
function paymentToApi(row) {
    const doc = row;
    return {
        id: String(doc._id),
        taxPeriodId: doc.taxPeriodId ? String(doc.taxPeriodId) : null,
        taxPeriodKey: doc.taxPeriodKey,
        taxType: doc.taxType,
        propertyId: doc.propertyId ? String(doc.propertyId) : null,
        amount: doc.amount,
        currency: doc.currency,
        paymentDate: doc.paymentDate,
        paymentMethod: doc.paymentMethod || null,
        paymentReference: doc.paymentReference || null,
        zimraReference: doc.zimraReference || null,
        documentId: doc.documentId || null,
        notes: doc.notes || null,
        status: doc.status,
        landlordRecordedOnly: true
    };
}
function writeAudit(companyId, eventType, sourceId, message, metadata) {
    return __awaiter(this, void 0, void 0, function* () {
        yield AccountingEventLog_1.AccountingEventLog.create({
            companyId: asObjectId(companyId),
            eventType,
            sourceModule: 'individual_income_tax',
            sourceId,
            success: !String(eventType).includes('FAILED'),
            message,
            metadata
        });
    });
}
function assertPeriodAllowsIncomeTax(period) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(period === null || period === void 0 ? void 0 : period.taxPeriodId))
            return;
        const row = yield TaxPeriod_1.TaxPeriod.findById(period.taxPeriodId).select('status taxType periodKey');
        if (!row)
            return;
        if ((0, taxPeriodService_1.assignmentStatusForExistingPeriod)(row.status) === 'PERIOD_CLOSED') {
            throw new errorHandler_1.AppError(`Income tax period ${row.periodKey} is ${row.status}. Corrections require a reversal or amendment.`, 409);
        }
    });
}
function loadSource(snapshot) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (snapshot.sourceType === 'Payment') {
            const payment = yield Payment_1.Payment.findById(snapshot.sourceId).lean();
            if (!payment)
                return null;
            return {
                amount: Number(payment.amount || 0),
                category: snapshot.sourceKind === 'PAYMENT_RENT' ? 'RENTAL_INCOME' : 'TENANT_DEPOSIT',
                currency: String(payment.currency || 'USD'),
                vatMode: null,
                deductibility: snapshot.deductibility,
                capitalOrRevenue: snapshot.capitalOrRevenue,
                attachments: [],
                exchangeRate: (_a = payment.exchangeRate) !== null && _a !== void 0 ? _a : null,
                exchangeRateDate: payment.paymentDate || null
            };
        }
        const entry = yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.findById(snapshot.sourceId).lean();
        if (!entry)
            return null;
        return {
            amount: Number(entry.amount || 0),
            category: entry.category || null,
            currency: String(entry.currency || 'USD'),
            vatMode: entry.vatMode || null,
            deductibility: entry.deductibility || snapshot.deductibility,
            capitalOrRevenue: entry.capitalOrRevenue || snapshot.capitalOrRevenue,
            attachments: Array.isArray(entry.attachments) ? entry.attachments.map((row) => String(row)) : [],
            exchangeRate: null,
            exchangeRateDate: entry.date || null
        };
    });
}
function reviewStatusOf(calculationStatus, reviewReasons) {
    if (calculationStatus === 'REVIEW_REQUIRED' || calculationStatus === 'PERIOD_REQUIRED' || calculationStatus === 'RULE_REQUIRED' || calculationStatus === 'PROFILE_REQUIRED' || reviewReasons.length) {
        return 'REVIEW_REQUIRED';
    }
    if (calculationStatus === 'NOT_APPLICABLE')
        return 'NOT_APPLICABLE';
    if (calculationStatus === 'CALCULATED')
        return 'CALCULATED';
    return calculationStatus;
}
function loadAccountingProfit(companyId, periodKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const accounts = yield PropertyAccount_1.default.find({ companyId: asObjectId(companyId) }).select('transactions').lean();
        const bounds = periodKey ? (0, taxMetadataTypes_1.calendarPeriodBounds)(periodKey) : null;
        let income = 0;
        let expenses = 0;
        for (const account of accounts) {
            const pnl = (0, propertyAccountTotals_1.sumPropertyAccountPeriodPnl)(account.transactions, bounds === null || bounds === void 0 ? void 0 : bounds.periodStart, bounds ? new Date(bounds.periodEnd.getTime() + 1) : undefined);
            income += pnl.income;
            expenses += pnl.expenses;
        }
        return {
            accountingIncome: (0, money_1.roundMoney)(income),
            accountingExpenses: (0, money_1.roundMoney)(expenses),
            accountingProfit: (0, money_1.roundMoney)(income - expenses)
        };
    });
}
function snapshotRule(snapshot) {
    const ref = (snapshot.taxRuleReferences || []).find((row) => row.taxType === 'INCOME_TAX');
    if (!ref)
        return null;
    return {
        id: ref.ruleId || '',
        version: ref.ruleVersion || 1,
        ruleCode: ref.ruleCode || '',
        rate: ref.configuredRate,
        calculationMethod: 'TAXABLE_INCOME_PERCENT',
        sourceReference: ref.sourceReference || '',
        effectiveFrom: ref.effectiveFrom || null,
        effectiveTo: null
    };
}
exports.individualIncomeTaxService = {
    toApi,
    postForSnapshot(snapshot, classifiedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const existing = yield IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.findOne({
                companyId: snapshot.companyId,
                sourceType: snapshot.sourceType,
                sourceId: snapshot.sourceId,
                taxType: 'INCOME_TAX',
                recordKind: 'ORIGINAL'
            });
            if (existing)
                return existing;
            const period = yield (0, taxPeriodService_1.resolveTaxPeriod)({
                companyId: String(snapshot.companyId),
                taxType: 'INCOME_TAX',
                transactionDate: snapshot.transactionDate
            });
            try {
                yield assertPeriodAllowsIncomeTax({ taxPeriodId: period.taxPeriodId, taxPeriodKey: period.periodKey });
            }
            catch (error) {
                if (Number(error === null || error === void 0 ? void 0 : error.statusCode) === 409) {
                    yield writeAudit(String(snapshot.companyId), 'INCOME_TAX_REVIEW_REQUIRED', String(snapshot.sourceId), 'Income tax period is closed', {
                        taxPeriodKey: period.periodKey,
                        reason: 'TAX_PERIOD_CLOSED'
                    });
                    throw error;
                }
                throw error;
            }
            const source = yield loadSource(snapshot);
            const profile = snapshot.taxProfileSnapshot;
            const incomeRef = snapshotRule(snapshot);
            const classified = (0, individualIncomeTaxClassification_1.classifyIncomeTaxLine)({
                sourceKind: snapshot.sourceKind,
                amount: (source === null || source === void 0 ? void 0 : source.amount) || 0,
                rentalTaxRegime: snapshot.rentalTaxRegime || (profile === null || profile === void 0 ? void 0 : profile.rentalTaxRegime),
                rentalTaxTreatment: snapshot.rentalTaxTreatment || (profile === null || profile === void 0 ? void 0 : profile.rentalTaxTreatment),
                deductibility: (source === null || source === void 0 ? void 0 : source.deductibility) || snapshot.deductibility,
                capitalOrRevenue: (source === null || source === void 0 ? void 0 : source.capitalOrRevenue) || snapshot.capitalOrRevenue,
                category: source === null || source === void 0 ? void 0 : source.category,
                vatMode: source === null || source === void 0 ? void 0 : source.vatMode,
                profileSnapshotPresent: Boolean(profile),
                attachments: source === null || source === void 0 ? void 0 : source.attachments
            });
            const reviewReasons = [...classified.reviewReasons];
            if (period.assignmentStatus === 'PERIOD_REQUIRED')
                reviewReasons.push('TAX_PERIOD_MISSING');
            if (classified.classification !== 'NOT_INCOME_TAX_RELEVANT' && classified.classification !== 'EXEMPT_INCOME' && !(incomeRef === null || incomeRef === void 0 ? void 0 : incomeRef.id) && classified.calculationStatus !== 'NOT_APPLICABLE') {
                if (!reviewReasons.includes('TAX_RULE_UNAVAILABLE') && (snapshot.taxTypesRelevant || []).includes('INCOME_TAX')) {
                    reviewReasons.push('TAX_RULE_UNAVAILABLE');
                }
            }
            const calculationStatus = period.assignmentStatus === 'PERIOD_REQUIRED'
                ? 'PERIOD_REQUIRED'
                : classified.calculationStatus === 'PROFILE_REQUIRED'
                    ? 'PROFILE_REQUIRED'
                    : reviewReasons.includes('TAX_RULE_UNAVAILABLE') && classified.calculationStatus === 'CALCULATED'
                        ? 'RULE_REQUIRED'
                        : classified.calculationStatus;
            try {
                const created = yield IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.create({
                    companyId: snapshot.companyId,
                    taxpayerId: snapshot.companyId,
                    ownerId: classifiedBy && mongoose_1.default.Types.ObjectId.isValid(classifiedBy) ? asObjectId(classifiedBy) : null,
                    propertyId: snapshot.propertyId || null,
                    sourceType: snapshot.sourceType,
                    sourceId: snapshot.sourceId,
                    snapshotId: snapshot._id,
                    taxpayerProfileSnapshotId: profile ? `v${profile.ownerProfileVersion}` : null,
                    taxPeriodId: period.taxPeriodId,
                    taxPeriodKey: period.periodKey,
                    taxType: 'INCOME_TAX',
                    recordKind: 'ORIGINAL',
                    incomeTaxRegime: (0, rentalTaxTypes_1.normalizeRentalTaxRegime)(snapshot.rentalTaxRegime || (profile === null || profile === void 0 ? void 0 : profile.rentalTaxRegime)),
                    classification: classified.classification,
                    accountingIncome: classified.accountingIncome,
                    accountingExpenses: classified.accountingExpense,
                    taxableIncomeBeforeAdjustments: null,
                    addBacks: classified.addBack,
                    deductions: classified.deduction,
                    exemptIncome: classified.exemptIncome,
                    capitalAdjustments: classified.classification === 'CAPITAL' ? classified.accountingExpense : null,
                    otherTaxAdjustments: null,
                    taxableIncome: null,
                    taxableContribution: classified.taxableContribution,
                    taxRate: (_a = incomeRef === null || incomeRef === void 0 ? void 0 : incomeRef.rate) !== null && _a !== void 0 ? _a : null,
                    taxAmount: null,
                    taxCurrency: (source === null || source === void 0 ? void 0 : source.currency) || 'USD',
                    currency: (source === null || source === void 0 ? void 0 : source.currency) || 'USD',
                    transactionCurrency: (source === null || source === void 0 ? void 0 : source.currency) || 'USD',
                    baseCurrency: (source === null || source === void 0 ? void 0 : source.currency) || 'USD',
                    exchangeRate: (_b = source === null || source === void 0 ? void 0 : source.exchangeRate) !== null && _b !== void 0 ? _b : null,
                    exchangeRateDate: (source === null || source === void 0 ? void 0 : source.exchangeRateDate) || snapshot.transactionDate,
                    exchangeRateSource: (source === null || source === void 0 ? void 0 : source.exchangeRate) == null ? null : 'TRANSACTION',
                    taxRuleId: (incomeRef === null || incomeRef === void 0 ? void 0 : incomeRef.id) || null,
                    taxRuleVersion: (_c = incomeRef === null || incomeRef === void 0 ? void 0 : incomeRef.version) !== null && _c !== void 0 ? _c : null,
                    taxRuleCode: (incomeRef === null || incomeRef === void 0 ? void 0 : incomeRef.ruleCode) || null,
                    taxRuleEffectiveFrom: (incomeRef === null || incomeRef === void 0 ? void 0 : incomeRef.effectiveFrom) || null,
                    taxRuleEffectiveTo: (incomeRef === null || incomeRef === void 0 ? void 0 : incomeRef.effectiveTo) || null,
                    sourceReference: (incomeRef === null || incomeRef === void 0 ? void 0 : incomeRef.sourceReference) || null,
                    calculationMethod: 'TAXABLE_INCOME_PERCENT',
                    calculationStatus,
                    reviewStatus: reviewStatusOf(calculationStatus, reviewReasons),
                    reviewReason: reviewReasons[0] || classified.reason,
                    reviewReasons: Array.from(new Set(reviewReasons)),
                    supportingDocumentStatus: classified.documentStatus,
                    vatAmount: null,
                    presumptiveTaxAmount: null,
                    calculatedAt: new Date(),
                    calculatedBy: classifiedBy && mongoose_1.default.Types.ObjectId.isValid(classifiedBy) ? asObjectId(classifiedBy) : null
                });
                yield writeAudit(String(snapshot.companyId), 'INCOME_TAX_CALCULATED', String(snapshot.sourceId), `Income tax line ${calculationStatus}`, {
                    classification: classified.classification,
                    taxAmount: null,
                    taxRuleVersion: (_d = incomeRef === null || incomeRef === void 0 ? void 0 : incomeRef.version) !== null && _d !== void 0 ? _d : null
                });
                return created;
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                    return IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.findOne({
                        companyId: snapshot.companyId,
                        sourceType: snapshot.sourceType,
                        sourceId: snapshot.sourceId,
                        taxType: 'INCOME_TAX',
                        recordKind: 'ORIGINAL'
                    });
                }
                throw error;
            }
        });
    },
    safePostForSnapshot(snapshot, classifiedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!snapshot)
                return;
            try {
                yield this.postForSnapshot(snapshot, classifiedBy);
            }
            catch (error) {
                logger_1.logger.warn('Individual income tax classification failed after accounting success', {
                    sourceId: String(snapshot.sourceId),
                    message: (error === null || error === void 0 ? void 0 : error.message) || error
                });
                yield writeAudit(String(snapshot.companyId), 'INCOME_TAX_REVIEW_REQUIRED', String(snapshot.sourceId), (error === null || error === void 0 ? void 0 : error.message) || 'Income tax classification failed', { accountingStatus: 'ACCOUNTING_SUCCESS', reason: 'CALCULATION_FAILED' }).catch(() => undefined);
            }
        });
    },
    reverseForSource(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const original = yield IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.findOne({
                companyId: asObjectId(input.companyId),
                sourceType: input.sourceType,
                sourceId: asObjectId(input.sourceId),
                recordKind: 'ORIGINAL'
            });
            if (!original)
                return null;
            const existing = yield IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.findOne({
                companyId: original.companyId,
                sourceType: original.sourceType,
                sourceId: original.sourceId,
                taxType: 'INCOME_TAX',
                recordKind: 'REVERSAL'
            });
            if (existing)
                return existing;
            try {
                yield assertPeriodAllowsIncomeTax({ taxPeriodId: original.taxPeriodId, taxPeriodKey: original.taxPeriodKey });
            }
            catch (error) {
                if (Number(error === null || error === void 0 ? void 0 : error.statusCode) === 409)
                    throw error;
            }
            const created = yield IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.create({
                companyId: original.companyId,
                taxpayerId: original.taxpayerId,
                ownerId: original.ownerId,
                propertyId: original.propertyId,
                sourceType: original.sourceType,
                sourceId: original.sourceId,
                snapshotId: original.snapshotId,
                taxpayerProfileSnapshotId: original.taxpayerProfileSnapshotId,
                taxPeriodId: original.taxPeriodId,
                taxPeriodKey: original.taxPeriodKey,
                taxType: 'INCOME_TAX',
                recordKind: 'REVERSAL',
                reversalOf: original._id,
                reversalReason: input.reason || 'Accounting reversal',
                reversalDate: new Date(),
                incomeTaxRegime: original.incomeTaxRegime,
                classification: original.classification,
                accountingIncome: original.accountingIncome == null ? null : (0, money_1.roundMoney)(-Number(original.accountingIncome)),
                accountingExpenses: original.accountingExpenses == null ? null : (0, money_1.roundMoney)(-Number(original.accountingExpenses)),
                taxableIncomeBeforeAdjustments: null,
                addBacks: original.addBacks == null ? null : (0, money_1.roundMoney)(-Number(original.addBacks)),
                deductions: original.deductions == null ? null : (0, money_1.roundMoney)(-Number(original.deductions)),
                exemptIncome: original.exemptIncome == null ? null : (0, money_1.roundMoney)(-Number(original.exemptIncome)),
                capitalAdjustments: original.capitalAdjustments == null ? null : (0, money_1.roundMoney)(-Number(original.capitalAdjustments)),
                otherTaxAdjustments: original.otherTaxAdjustments == null ? null : (0, money_1.roundMoney)(-Number(original.otherTaxAdjustments)),
                taxableIncome: null,
                taxableContribution: original.taxableContribution == null ? null : (0, money_1.roundMoney)(-Number(original.taxableContribution)),
                taxRate: original.taxRate,
                taxAmount: null,
                taxCurrency: original.taxCurrency,
                currency: original.currency,
                transactionCurrency: original.transactionCurrency,
                baseCurrency: original.baseCurrency,
                exchangeRate: original.exchangeRate,
                exchangeRateDate: original.exchangeRateDate,
                exchangeRateSource: original.exchangeRateSource,
                taxRuleId: original.taxRuleId,
                taxRuleVersion: original.taxRuleVersion,
                taxRuleCode: original.taxRuleCode,
                taxRuleEffectiveFrom: original.taxRuleEffectiveFrom,
                taxRuleEffectiveTo: original.taxRuleEffectiveTo,
                sourceReference: original.sourceReference,
                calculationMethod: original.calculationMethod,
                calculationStatus: 'REVERSED',
                reviewStatus: original.reviewStatus,
                reviewReason: original.reviewReason,
                reviewReasons: original.reviewReasons,
                supportingDocumentStatus: original.supportingDocumentStatus,
                vatAmount: null,
                presumptiveTaxAmount: null,
                calculatedAt: new Date(),
                calculatedBy: input.userId && mongoose_1.default.Types.ObjectId.isValid(input.userId) ? asObjectId(input.userId) : null
            });
            yield writeAudit(input.companyId, 'INCOME_TAX_REVERSED', input.sourceId, 'Income tax reversal posted; original preserved', {
                originalId: String(original._id),
                reversalId: String(created._id)
            });
            return created;
        });
    },
    reportReverseForSource(input) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { throwOnceIfArmed } = yield Promise.resolve().then(() => __importStar(require('./testFailureSeam')));
                throwOnceIfArmed(String(input.sourceId), String(input.reason || ''), 'PHASE_FAIL_INDIVIDUAL_INCOME_TAX');
                const created = yield this.reverseForSource(input);
                return created ? 'reversed' : 'absent';
            }
            catch (error) {
                logger_1.logger.warn('Individual income tax reversal failed', { sourceId: input.sourceId, message: (error === null || error === void 0 ? void 0 : error.message) || error });
                return 'failed';
            }
        });
    },
    safeReverseForSource(input) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.reportReverseForSource(input);
        });
    },
    createAdjustment(input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const reason = String(input.reason || '').trim();
            if (!reason)
                throw new errorHandler_1.AppError('Manual income-tax adjustments require a reason', 400);
            if (!(Number(input.amount) || 0))
                throw new errorHandler_1.AppError('Adjustment amount is required', 400);
            if (!incomeTaxTypes_1.INCOME_TAX_ADJUSTMENT_TYPES.includes(input.adjustmentType)) {
                throw new errorHandler_1.AppError('Unsupported tax adjustment type', 400);
            }
            let periodKey = String(input.taxPeriodKey || '').trim();
            let periodId = input.taxPeriodId || null;
            if (periodId) {
                const period = yield TaxPeriod_1.TaxPeriod.findOne({
                    _id: asObjectId(periodId),
                    companyId: asObjectId(input.companyId),
                    taxType: 'INCOME_TAX'
                });
                if (!period)
                    throw new errorHandler_1.AppError('Income tax period not found', 404);
                if ((0, taxPeriodService_1.assignmentStatusForExistingPeriod)(period.status) === 'PERIOD_CLOSED') {
                    throw new errorHandler_1.AppError(`Income tax period ${period.periodKey} is ${period.status}`, 409);
                }
                periodKey = period.periodKey;
                periodId = String(period._id);
            }
            if (!periodKey)
                throw new errorHandler_1.AppError('taxPeriodId or taxPeriodKey is required', 400);
            if (!periodId) {
                const period = yield TaxPeriod_1.TaxPeriod.findOne({
                    companyId: asObjectId(input.companyId),
                    taxType: 'INCOME_TAX',
                    periodKey
                });
                if (period && (0, taxPeriodService_1.assignmentStatusForExistingPeriod)(period.status) === 'PERIOD_CLOSED') {
                    throw new errorHandler_1.AppError(`Income tax period ${period.periodKey} is ${period.status}`, 409);
                }
                periodId = period ? String(period._id) : null;
            }
            if (input.propertyId) {
                const property = yield Property_1.Property.findOne({
                    _id: asObjectId(input.propertyId),
                    companyId: asObjectId(input.companyId),
                    isDeleted: { $ne: true }
                }).select('_id');
                if (!property)
                    throw new errorHandler_1.AppError('Property not found', 404);
            }
            const created = yield IndividualIncomeTaxAdjustment_1.IndividualIncomeTaxAdjustment.create({
                companyId: asObjectId(input.companyId),
                ownerId: asObjectId(input.userId),
                propertyId: input.propertyId ? asObjectId(input.propertyId) : null,
                taxPeriodId: periodId,
                taxPeriodKey: periodKey,
                taxType: 'INCOME_TAX',
                adjustmentType: input.adjustmentType,
                amount: (0, money_1.roundMoney)(Number(input.amount)),
                currency: input.currency || 'USD',
                reason,
                explanation: input.explanation || null,
                sourceTransactionIds: input.sourceTransactionIds || [],
                supportingDocumentIds: input.supportingDocumentIds || [],
                ruleId: input.ruleId || null,
                ruleVersion: (_a = input.ruleVersion) !== null && _a !== void 0 ? _a : null,
                status: 'PENDING',
                reviewStatus: 'REVIEW_REQUIRED',
                createdBy: asObjectId(input.userId)
            });
            yield writeAudit(input.companyId, 'INCOME_TAX_ADJUSTMENT_CREATED', String(created._id), 'Manual income-tax adjustment created', {
                amount: created.amount,
                adjustmentType: created.adjustmentType,
                reason,
                taxableIncomeOverwritten: false
            });
            return adjustmentToApi(created);
        });
    },
    approveAdjustment(companyId, adjustmentId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield IndividualIncomeTaxAdjustment_1.IndividualIncomeTaxAdjustment.findOne({
                _id: asObjectId(adjustmentId),
                companyId: asObjectId(companyId)
            });
            if (!row)
                throw new errorHandler_1.AppError('Adjustment not found', 404);
            if (row.status === 'APPROVED')
                return adjustmentToApi(row);
            if (!String(row.reason || '').trim())
                throw new errorHandler_1.AppError('Manual income-tax adjustments require a reason', 400);
            row.status = 'APPROVED';
            row.reviewStatus = 'APPROVED';
            row.approvedBy = asObjectId(userId);
            row.approvedAt = new Date();
            yield row.save();
            yield writeAudit(companyId, 'INCOME_TAX_ADJUSTMENT_APPROVED', String(row._id), 'Manual income-tax adjustment approved', {
                amount: row.amount,
                adjustmentType: row.adjustmentType
            });
            return adjustmentToApi(row);
        });
    },
    recordPayment(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const amount = Number(input.amount || 0);
            if (!(amount > 0))
                throw new errorHandler_1.AppError('Payment amount must be greater than zero', 400);
            let periodKey = String(input.taxPeriodKey || '').trim();
            let periodId = input.taxPeriodId || null;
            if (periodId) {
                const period = yield TaxPeriod_1.TaxPeriod.findOne({
                    _id: asObjectId(periodId),
                    companyId: asObjectId(input.companyId),
                    taxType: 'INCOME_TAX'
                });
                if (!period)
                    throw new errorHandler_1.AppError('Income tax period not found', 404);
                periodKey = period.periodKey;
                periodId = String(period._id);
            }
            if (!periodKey)
                throw new errorHandler_1.AppError('taxPeriodId or taxPeriodKey is required', 400);
            if (input.propertyId) {
                const property = yield Property_1.Property.findOne({
                    _id: asObjectId(input.propertyId),
                    companyId: asObjectId(input.companyId),
                    isDeleted: { $ne: true }
                }).select('_id');
                if (!property)
                    throw new errorHandler_1.AppError('Property not found', 404);
            }
            const created = yield IndividualIncomeTaxPayment_1.IndividualIncomeTaxPayment.create({
                companyId: asObjectId(input.companyId),
                ownerId: asObjectId(input.userId),
                propertyId: input.propertyId ? asObjectId(input.propertyId) : null,
                taxPeriodId: periodId,
                taxPeriodKey: periodKey,
                taxType: 'INCOME_TAX',
                amount: (0, money_1.roundMoney)(amount),
                currency: input.currency || 'USD',
                paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
                paymentMethod: input.paymentMethod || null,
                paymentReference: input.paymentReference || null,
                zimraReference: input.zimraReference || null,
                documentId: input.documentId || null,
                notes: input.notes || null,
                status: 'POSTED',
                recordedBy: asObjectId(input.userId)
            });
            yield writeAudit(input.companyId, 'INCOME_TAX_PAYMENT_RECORDED', String(created._id), 'Landlord-recorded income tax payment', {
                amount: created.amount,
                taxPeriodKey: periodKey,
                zimraConfirmed: false
            });
            return Object.assign(Object.assign({}, paymentToApi(created)), { zimraConfirmed: false });
        });
    },
    workingPaper(companyId, periodKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const company = yield Company_1.Company.findById(companyId).select('name tin taxProfile').lean();
            const query = { companyId: asObjectId(companyId) };
            if (periodKey)
                query.taxPeriodKey = periodKey;
            const records = yield IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.find(query).sort({ calculatedAt: 1 }).lean();
            const adjustments = yield IndividualIncomeTaxAdjustment_1.IndividualIncomeTaxAdjustment.find(Object.assign({ companyId: asObjectId(companyId) }, (periodKey ? { taxPeriodKey: periodKey } : {})))
                .sort({ createdAt: 1 })
                .lean();
            const payments = yield IndividualIncomeTaxPayment_1.IndividualIncomeTaxPayment.find(Object.assign({ companyId: asObjectId(companyId), status: 'POSTED' }, (periodKey ? { taxPeriodKey: periodKey } : {})))
                .sort({ paymentDate: 1 })
                .lean();
            const accounting = yield loadAccountingProfit(companyId, periodKey);
            const currencies = Array.from(new Set(records.map((row) => String(row.transactionCurrency || row.currency || 'USD'))));
            const reviewReasons = records.flatMap((row) => row.reviewReasons || []);
            const periodStatus = periodKey
                ? yield (0, taxPeriodService_1.resolveTaxPeriod)({
                    companyId,
                    taxType: 'INCOME_TAX',
                    transactionDate: (0, taxMetadataTypes_1.calendarPeriodBounds)(periodKey).periodStart
                })
                : null;
            if ((periodStatus === null || periodStatus === void 0 ? void 0 : periodStatus.assignmentStatus) === 'PERIOD_REQUIRED')
                reviewReasons.push('TAX_PERIOD_MISSING');
            const ruleRow = records.find((row) => row.taxRuleId && row.taxRate != null);
            const fallbackRule = ruleRow || !periodKey
                ? null
                : yield (0, taxRuleRegistry_1.getEffectiveTaxRule)('INCOME_TAX', (0, taxMetadataTypes_1.calendarPeriodBounds)(periodKey).periodStart);
            const incomeTaxRule = ruleRow
                ? {
                    id: String(ruleRow.taxRuleId),
                    version: Number(ruleRow.taxRuleVersion || 1),
                    ruleCode: String(ruleRow.taxRuleCode || ''),
                    rate: ruleRow.taxRate,
                    calculationMethod: 'TAXABLE_INCOME_PERCENT',
                    sourceReference: ruleRow.sourceReference || ''
                }
                : fallbackRule
                    ? {
                        id: fallbackRule.id,
                        version: fallbackRule.version,
                        ruleCode: fallbackRule.ruleCode,
                        rate: fallbackRule.rate,
                        calculationMethod: fallbackRule.calculationMethod || 'TAXABLE_INCOME_PERCENT',
                        sourceReference: fallbackRule.sourceReference
                    }
                    : null;
            const paper = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: currencies.length ? currencies : ['USD'],
                accountingIncome: accounting.accountingIncome,
                accountingExpenses: accounting.accountingExpenses,
                lineAddBacks: records.reduce((sum, row) => sum + Number(row.addBacks || 0), 0),
                lineDeductions: records.reduce((sum, row) => sum + Number(row.deductions || 0), 0),
                lineExemptIncome: records.reduce((sum, row) => sum + Number(row.exemptIncome || 0), 0),
                adjustments: adjustments.map((row) => ({
                    adjustmentType: row.adjustmentType,
                    amount: row.amount,
                    currency: row.currency,
                    reason: row.reason,
                    status: row.status
                })),
                incomeTaxRule,
                periodAssignmentStatus: periodStatus === null || periodStatus === void 0 ? void 0 : periodStatus.assignmentStatus,
                profilePresent: true,
                reviewReasons: Array.from(new Set([...reviewReasons, 'AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW']))
            });
            const taxPayments = (0, money_1.roundMoney)(payments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
            const unreconciled = paper.taxAmount == null ? null : (0, money_1.roundMoney)(Number(paper.taxAmount) - taxPayments);
            const properties = Array.from(new Set(records.map((row) => String(row.propertyId || '')).filter(Boolean)));
            const propertyDocs = properties.length
                ? yield Property_1.Property.find({ _id: { $in: properties }, companyId: asObjectId(companyId) }).select('name address').lean()
                : [];
            const propertyName = (id) => { var _a; return ((_a = propertyDocs.find((row) => String(row._id) === id)) === null || _a === void 0 ? void 0 : _a.name) || id; };
            const reviewItems = [
                ...records.filter((row) => row.reviewStatus === 'REVIEW_REQUIRED' || (row.reviewReasons || []).length),
                ...adjustments.filter((row) => row.status !== 'APPROVED')
            ];
            const taxProfile = (company === null || company === void 0 ? void 0 : company.taxProfile) || {};
            return {
                disclaimer: DISCLAIMER,
                label: 'Calculated income tax based on the working paper and configured ordinary trade/investment rule',
                notZimraConfirmedLiability: true,
                taxpayer: {
                    name: (company === null || company === void 0 ? void 0 : company.name) || '',
                    tin: (company === null || company === void 0 ? void 0 : company.tin) || taxProfile.tin || '',
                    rentalTaxRegime: taxProfile.rentalTaxRegime || 'ACCOUNTANT_REVIEW'
                },
                taxPeriod: periodKey || 'ALL',
                incomeTaxRegime: taxProfile.rentalTaxRegime || 'ACCOUNTANT_REVIEW',
                currencies: paper.currencies,
                accountingIncome: paper.accountingIncome,
                accountingExpenses: paper.accountingExpenses,
                accountingProfit: paper.accountingProfit,
                addBacks: paper.addBacks,
                deductions: paper.deductions,
                exemptIncome: paper.exemptIncome,
                capitalAdjustments: paper.capitalAdjustments,
                otherTaxAdjustments: paper.otherTaxAdjustments,
                taxableIncomeBeforeAdjustments: paper.taxableIncomeBeforeAdjustments,
                taxableIncome: paper.taxableIncome,
                applicableRate: paper.taxRate,
                calculatedIncomeTax: paper.taxAmount,
                taxPayments,
                unreconciledAmount: unreconciled,
                calculationStatus: paper.calculationStatus,
                taxRuleId: paper.taxRuleId,
                taxRuleVersion: paper.taxRuleVersion,
                taxRuleCode: paper.taxRuleCode,
                sourceReference: paper.sourceReference,
                calculationMethod: paper.calculationMethod,
                reviewReasons: paper.reviewReasons,
                properties: properties.map((id) => ({
                    propertyId: id,
                    propertyName: propertyName(id),
                    accountingIncome: (0, money_1.roundMoney)(records.filter((row) => String(row.propertyId) === id).reduce((sum, row) => sum + Number(row.accountingIncome || 0), 0)),
                    accountingExpenses: (0, money_1.roundMoney)(records.filter((row) => String(row.propertyId) === id).reduce((sum, row) => sum + Number(row.accountingExpenses || 0), 0))
                })),
                transactions: records.map((row) => (Object.assign(Object.assign({}, toApi(row)), { propertyName: row.propertyId ? propertyName(String(row.propertyId)) : null }))),
                adjustments: adjustments.map((row) => adjustmentToApi(row)),
                payments: payments.map((row) => paymentToApi(row)),
                reviewItems: [
                    ...reviewItems.map((row) => {
                        var _a;
                        return ({
                            id: String(row._id),
                            sourceId: String(row.sourceId || row._id),
                            sourceType: row.sourceType || 'Adjustment',
                            reasons: row.reviewReasons || (row.status === 'PENDING' ? ['MANUAL_ADJUSTMENT_AWAITING_REVIEW'] : []),
                            calculationStatus: row.calculationStatus || row.status,
                            taxAmount: (_a = row.taxAmount) !== null && _a !== void 0 ? _a : null
                        });
                    }),
                    {
                        id: 'aids-levy',
                        sourceId: periodKey || 'period',
                        sourceType: 'WorkingPaper',
                        reasons: ['AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW'],
                        calculationStatus: 'REVIEW_REQUIRED',
                        taxAmount: null
                    }
                ],
                vatAmount: null,
                presumptiveTaxAmount: null
            };
        });
    },
    overview(companyId, periodKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const paper = yield this.workingPaper(companyId, periodKey);
            return {
                currentPeriod: paper.taxPeriod,
                incomeTaxRegime: paper.incomeTaxRegime,
                accountingProfit: paper.accountingProfit,
                taxAdjustments: (0, money_1.roundMoney)(Number(paper.addBacks || 0) - Number(paper.deductions || 0) - Number(paper.exemptIncome || 0) + Number(paper.otherTaxAdjustments || 0)),
                taxableIncome: paper.taxableIncome,
                calculatedIncomeTax: paper.calculatedIncomeTax,
                taxPayments: paper.taxPayments,
                unreconciledAmount: paper.unreconciledAmount,
                reviewItems: paper.reviewItems.length,
                transactions: paper.transactions.length,
                calculationStatus: paper.calculationStatus,
                label: paper.label,
                disclaimer: paper.disclaimer
            };
        });
    },
    transactions(companyId_1) {
        return __awaiter(this, arguments, void 0, function* (companyId, filters = {}) {
            const query = { companyId: asObjectId(companyId) };
            if (filters.periodKey)
                query.taxPeriodKey = filters.periodKey;
            if (filters.status)
                query.calculationStatus = filters.status;
            if (filters.propertyId) {
                const property = yield Property_1.Property.findOne({
                    _id: asObjectId(filters.propertyId),
                    companyId: asObjectId(companyId),
                    isDeleted: { $ne: true }
                }).select('_id');
                if (!property)
                    throw new errorHandler_1.AppError('Property not found', 404);
                query.propertyId = property._id;
            }
            const rows = yield IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.find(query).sort({ calculatedAt: -1 }).limit(500).lean();
            return rows.map((row) => toApi(row));
        });
    },
    reviewQueue(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = yield IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.find({
                companyId: asObjectId(companyId),
                $or: [
                    { calculationStatus: { $in: ['REVIEW_REQUIRED', 'PERIOD_REQUIRED', 'RULE_REQUIRED', 'PROFILE_REQUIRED'] } },
                    { reviewReasons: { $exists: true, $ne: [] } }
                ]
            })
                .sort({ calculatedAt: -1 })
                .limit(200)
                .lean();
            const pendingAdj = yield IndividualIncomeTaxAdjustment_1.IndividualIncomeTaxAdjustment.find({
                companyId: asObjectId(companyId),
                status: 'PENDING'
            })
                .limit(50)
                .lean();
            const unclassified = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.find({
                companyId: asObjectId(companyId),
                sourceKind: { $in: ['PAYMENT_RENT', 'OTHER_INCOME', 'EXPENSE', 'MAINTENANCE', 'CAPITAL'] }
            })
                .select('sourceId sourceType sourceKind taxPeriodKey taxCalculationStatus')
                .limit(200)
                .lean();
            const existing = yield IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.find({
                companyId: asObjectId(companyId),
                recordKind: 'ORIGINAL'
            })
                .select('sourceType sourceId')
                .lean();
            const classifiedIds = new Set(existing.map((row) => `${row.sourceType}:${row.sourceId}`));
            const missing = unclassified.filter((row) => !classifiedIds.has(`${row.sourceType}:${String(row.sourceId)}`)).slice(0, 50);
            return [
                ...rows.map((row) => ({
                    id: String(row._id),
                    kind: 'RECORD',
                    sourceType: row.sourceType,
                    sourceId: String(row.sourceId),
                    taxPeriodKey: row.taxPeriodKey,
                    reasons: row.reviewReasons || [],
                    calculationStatus: row.calculationStatus,
                    taxAmount: row.taxAmount
                })),
                ...pendingAdj.map((row) => ({
                    id: String(row._id),
                    kind: 'ADJUSTMENT',
                    sourceType: 'ManualAdjustment',
                    sourceId: String(row._id),
                    taxPeriodKey: row.taxPeriodKey,
                    reasons: ['MANUAL_ADJUSTMENT_AWAITING_REVIEW'],
                    calculationStatus: 'REVIEW_REQUIRED',
                    taxAmount: null
                })),
                ...missing.map((row) => ({
                    id: String(row._id),
                    kind: 'SNAPSHOT',
                    sourceType: row.sourceType,
                    sourceId: String(row.sourceId),
                    taxPeriodKey: row.taxPeriodKey,
                    reasons: ['NOT_YET_TAX_CLASSIFIED'],
                    calculationStatus: 'NOT_CALCULATED',
                    taxAmount: null
                }))
            ];
        });
    },
    reconcile(companyId, periodKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const paper = yield this.workingPaper(companyId, periodKey);
            const findings = [];
            const recomputed = (0, individualIncomeTaxCalculation_1.calculateOrdinaryIncomeTaxWorkingPaper)({
                currencies: paper.currencies,
                accountingIncome: Number(paper.accountingIncome || 0),
                accountingExpenses: Number(paper.accountingExpenses || 0),
                lineAddBacks: paper.transactions.reduce((sum, row) => sum + Number(row.addBacks || 0), 0),
                lineDeductions: paper.transactions.reduce((sum, row) => sum + Number(row.deductions || 0), 0),
                lineExemptIncome: paper.transactions.reduce((sum, row) => sum + Number(row.exemptIncome || 0), 0),
                adjustments: paper.adjustments.map((row) => ({
                    adjustmentType: row.adjustmentType,
                    amount: row.amount,
                    currency: row.currency,
                    reason: row.reason,
                    status: row.status
                })),
                incomeTaxRule: paper.taxRuleId
                    ? {
                        id: paper.taxRuleId,
                        version: Number(paper.taxRuleVersion || 1),
                        ruleCode: paper.taxRuleCode || '',
                        rate: paper.applicableRate,
                        calculationMethod: 'TAXABLE_INCOME_PERCENT',
                        sourceReference: paper.sourceReference || ''
                    }
                    : null,
                reviewReasons: paper.reviewReasons.filter((row) => row !== 'AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW')
            });
            if (recomputed.taxableIncome !== paper.taxableIncome || recomputed.taxAmount !== paper.calculatedIncomeTax) {
                findings.push({ issueType: 'CALCULATION_MISMATCH', reason: 'Recomputed working paper does not match stored overview' });
            }
            const originals = paper.transactions.filter((row) => row.recordKind !== 'REVERSAL');
            const sourceIds = originals.map((row) => row.sourceId);
            for (const id of Array.from(new Set(sourceIds.filter((id, index) => sourceIds.indexOf(id) !== index)))) {
                findings.push({ issueType: 'DUPLICATE_RECORD', reason: 'More than one original income-tax record for the same source', sourceId: id });
            }
            return {
                detectionOnly: true,
                noAutomaticRepair: true,
                lines: [
                    { key: 'accountingProfit', label: 'Accounting profit', amount: paper.accountingProfit },
                    { key: 'addBacks', label: 'Tax add-backs', amount: paper.addBacks },
                    { key: 'deductions', label: 'Allowable adjustments', amount: paper.deductions },
                    { key: 'exemptIncome', label: 'Exempt / non-taxable amounts', amount: paper.exemptIncome },
                    { key: 'otherTaxAdjustments', label: 'Other tax adjustments', amount: paper.otherTaxAdjustments },
                    { key: 'taxableIncome', label: 'Taxable income', amount: paper.taxableIncome },
                    { key: 'taxRule', label: paper.taxRuleCode || 'Tax rule', amount: paper.applicableRate },
                    { key: 'calculatedIncomeTax', label: 'Calculated income tax', amount: paper.calculatedIncomeTax },
                    { key: 'taxPayments', label: 'Recognised tax payments', amount: paper.taxPayments },
                    { key: 'unreconciledAmount', label: 'Unreconciled calculated amount', amount: paper.unreconciledAmount }
                ],
                workingPaper: {
                    accountingProfit: paper.accountingProfit,
                    taxableIncome: paper.taxableIncome,
                    calculatedIncomeTax: paper.calculatedIncomeTax,
                    taxPayments: paper.taxPayments,
                    unreconciledAmount: paper.unreconciledAmount
                },
                findings
            };
        });
    },
    annualSchedule(companyId, year) {
        return __awaiter(this, void 0, void 0, function* () {
            const taxYear = Number(year || new Date().getUTCFullYear());
            const start = `${taxYear}-01`;
            const end = `${taxYear}-12`;
            const months = Array.from({ length: 12 }, (_, index) => `${taxYear}-${String(index + 1).padStart(2, '0')}`);
            const papers = [];
            for (const month of months) {
                papers.push(yield this.workingPaper(companyId, month));
            }
            const accountingProfit = papers.some((row) => row.accountingProfit == null)
                ? null
                : (0, money_1.roundMoney)(papers.reduce((sum, row) => sum + Number(row.accountingProfit || 0), 0));
            const taxableIncome = papers.some((row) => row.taxableIncome == null)
                ? null
                : (0, money_1.roundMoney)(papers.reduce((sum, row) => sum + Number(row.taxableIncome || 0), 0));
            const calculated = papers.some((row) => row.calculatedIncomeTax == null)
                ? null
                : (0, money_1.roundMoney)(papers.reduce((sum, row) => sum + Number(row.calculatedIncomeTax || 0), 0));
            const payments = (0, money_1.roundMoney)(papers.reduce((sum, row) => sum + Number(row.taxPayments || 0), 0));
            const incompleteMonths = papers
                .filter((row) => row.accountingProfit == null || row.taxableIncome == null || row.calculatedIncomeTax == null)
                .map((row) => row.taxPeriod);
            return {
                disclaimer: DISCLAIMER,
                year: taxYear,
                foundationOnly: true,
                filingCapability: false,
                periodRange: { start, end },
                accountingProfit,
                taxableIncome,
                taxAdjustments: papers.some((row) => row.addBacks == null && row.exemptIncome == null)
                    ? (0, money_1.roundMoney)(papers.reduce((sum, row) => sum + Number(row.addBacks || 0) - Number(row.exemptIncome || 0), 0))
                    : (0, money_1.roundMoney)(papers.reduce((sum, row) => sum + Number(row.addBacks || 0) - Number(row.exemptIncome || 0), 0)),
                calculatedIncomeTax: calculated,
                taxPayments: payments,
                unreconciledAmount: calculated == null ? null : (0, money_1.roundMoney)(calculated - payments),
                reviewItems: papers.reduce((sum, row) => sum + row.reviewItems.length, 0),
                incompleteMonths,
                supportingDocumentCompleteness: papers.flatMap((row) => row.transactions).filter((row) => row.supportingDocumentStatus === 'MISSING').length
                    ? 'MISSING'
                    : 'DOCUMENTED'
            };
        });
    },
    calculatePeriod(companyId, periodKey, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const period = yield (0, taxPeriodService_1.resolveTaxPeriod)({
                companyId,
                taxType: 'INCOME_TAX',
                transactionDate: (0, taxMetadataTypes_1.calendarPeriodBounds)(periodKey).periodStart
            });
            if (period.assignmentStatus === 'PERIOD_CLOSED') {
                const paper = yield this.workingPaper(companyId, periodKey);
                return Object.assign(Object.assign({}, paper), { calculationStatus: paper.calculationStatus === 'CALCULATED' ? 'FINALIZED' : paper.calculationStatus, periodClosed: true });
            }
            const paper = yield this.workingPaper(companyId, periodKey);
            yield writeAudit(companyId, 'INCOME_TAX_RECALCULATED', periodKey, 'Income-tax working paper calculated from existing line records', {
                taxPeriodKey: periodKey,
                calculatedIncomeTax: paper.calculatedIncomeTax,
                taxableIncome: paper.taxableIncome,
                userId: userId || null,
                duplicated: false
            });
            return paper;
        });
    },
    exportWorkingPaper(companyId, periodKey, format) {
        return __awaiter(this, void 0, void 0, function* () {
            const paper = yield this.workingPaper(companyId, periodKey);
            const rows = paper.transactions.map((row) => ({
                taxpayer: paper.taxpayer.name,
                tin: paper.taxpayer.tin,
                taxPeriod: paper.taxPeriod,
                property: row.propertyName || row.propertyId,
                transaction: row.sourceId,
                sourceType: row.sourceType,
                classification: row.classification,
                accountingIncome: row.accountingIncome,
                accountingExpenses: row.accountingExpenses,
                addBacks: row.addBacks,
                deductions: row.deductions,
                exemptIncome: row.exemptIncome,
                status: row.calculationStatus,
                rule: row.taxRuleCode,
                sourceReference: row.sourceReference
            }));
            if (format === 'csv') {
                const headers = Object.keys(rows[0] || { taxpayer: '', tin: '', taxPeriod: '' });
                const body = [
                    headers.join(','),
                    ...rows.map((row) => headers.map((header) => { var _a; return JSON.stringify((_a = row[header]) !== null && _a !== void 0 ? _a : ''); }).join(',')),
                    '',
                    JSON.stringify(paper.disclaimer)
                ].join('\n');
                return { contentType: 'text/csv', body };
            }
            if (format === 'xlsx' || format === 'excel') {
                return {
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    body: (0, xlsxWorkbook_1.buildXlsxWorkbook)('Income tax working paper', rows.length
                        ? rows
                        : [
                            {
                                taxpayer: paper.taxpayer.name,
                                taxPeriod: paper.taxPeriod,
                                accountingProfit: paper.accountingProfit,
                                taxableIncome: paper.taxableIncome,
                                calculatedIncomeTax: paper.calculatedIncomeTax,
                                disclaimer: paper.disclaimer
                            }
                        ]),
                    filename: `income-tax-working-paper-${paper.taxPeriod}.xlsx`
                };
            }
            const pdf = yield pdf_lib_1.PDFDocument.create();
            const font = yield pdf.embedFont(pdf_lib_1.StandardFonts.Helvetica);
            const bold = yield pdf.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
            let page = pdf.addPage([595, 842]);
            let y = 800;
            const line = (text, size = 10, useBold = false) => {
                if (y < 40) {
                    page = pdf.addPage([595, 842]);
                    y = 800;
                }
                page.drawText(String(text || '').slice(0, 110), { x: 40, y, size, font: useBold ? bold : font });
                y -= 14;
            };
            line('ORDINARY INCOME TAX WORKING PAPER', 16, true);
            line(paper.taxPeriod, 12, true);
            line(paper.disclaimer, 8);
            line(`Taxpayer: ${paper.taxpayer.name}  TIN: ${paper.taxpayer.tin}`);
            line(`Accounting income ${paper.accountingIncome}`);
            line(`Accounting expenses (${paper.accountingExpenses})`);
            line(`Accounting profit ${paper.accountingProfit}`, 11, true);
            line(`Add-backs ${paper.addBacks}`);
            line(`Deductions (${paper.deductions})`);
            line(`Exempt income (${paper.exemptIncome})`);
            line(`Taxable income ${paper.taxableIncome == null ? 'not calculated' : paper.taxableIncome}`, 11, true);
            line(`Rule ${paper.taxRuleCode || '—'} ${paper.applicableRate == null ? '' : `${paper.applicableRate}%`}`);
            line(`Calculated income tax ${paper.calculatedIncomeTax == null ? 'not calculated' : paper.calculatedIncomeTax}`, 11, true);
            line(`Tax payments recorded (${paper.taxPayments})`);
            line(`Unreconciled amount ${paper.unreconciledAmount == null ? '—' : paper.unreconciledAmount}`, 11, true);
            line('These figures are not a ZIMRA assessment.', 8);
            for (const row of rows) {
                line(`${row.property || ''} ${row.classification} income=${row.accountingIncome} exp=${row.accountingExpenses}`);
            }
            for (const item of paper.reviewItems) {
                line(`Review: ${item.calculationStatus} ${(item.reasons || []).join(', ')}`, 8);
            }
            return { contentType: 'application/pdf', body: Buffer.from(yield pdf.save()) };
        });
    }
};
exports.default = exports.individualIncomeTaxService;
