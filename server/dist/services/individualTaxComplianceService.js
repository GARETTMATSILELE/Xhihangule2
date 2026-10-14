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
exports.individualTaxComplianceService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const pdf_lib_1 = require("pdf-lib");
const IndividualTaxPack_1 = require("../models/IndividualTaxPack");
const IndividualTaxEvidence_1 = require("../models/IndividualTaxEvidence");
const IndividualTaxComplianceReview_1 = require("../models/IndividualTaxComplianceReview");
const IndividualVatRecord_1 = require("../models/IndividualVatRecord");
const IndividualRentalTaxRecord_1 = require("../models/IndividualRentalTaxRecord");
const IndividualRentalTaxPayment_1 = require("../models/IndividualRentalTaxPayment");
const IndividualIncomeTaxRecord_1 = require("../models/IndividualIncomeTaxRecord");
const IndividualIncomeTaxAdjustment_1 = require("../models/IndividualIncomeTaxAdjustment");
const IndividualIncomeTaxPayment_1 = require("../models/IndividualIncomeTaxPayment");
const TransactionTaxSnapshot_1 = require("../models/TransactionTaxSnapshot");
const TaxPeriod_1 = require("../models/TaxPeriod");
const Property_1 = require("../models/Property");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const File_1 = __importDefault(require("../models/File"));
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const errorHandler_1 = require("../middleware/errorHandler");
const money_1 = require("../utils/money");
const xlsxWorkbook_1 = require("../utils/xlsxWorkbook");
const propertyAccountTotals_1 = require("./propertyAccountTotals");
const individualTaxProfileService_1 = __importDefault(require("./individualTaxProfileService"));
const individualVatService_1 = __importDefault(require("./individualVatService"));
const individualRentalTaxService_1 = __importDefault(require("./individualRentalTaxService"));
const individualIncomeTaxService_1 = __importDefault(require("./individualIncomeTaxService"));
const individualTaxComplianceReadinessService_1 = require("./individualTaxComplianceReadinessService");
const taxAmountAggregation_1 = require("./tax/taxAmountAggregation");
const complianceTypes_1 = require("./tax/complianceTypes");
function asObjectId(value, label = 'id') {
    if (!mongoose_1.default.Types.ObjectId.isValid(value))
        throw new errorHandler_1.AppError(`Invalid ${label}`, 400);
    return new mongoose_1.default.Types.ObjectId(value);
}
function yearRange(taxYear) {
    return { $gte: `${taxYear}-01`, $lte: `${taxYear}-12` };
}
function yearBounds(taxYear) {
    return {
        start: new Date(Date.UTC(taxYear, 0, 1)),
        end: new Date(Date.UTC(taxYear + 1, 0, 1))
    };
}
function sumStored(values) {
    if (!values.length)
        return null;
    const present = values.filter((value) => value != null);
    if (!present.length)
        return null;
    return (0, money_1.roundMoney)(present.reduce((sum, value) => sum + Number(value || 0), 0));
}
function displayStatus(values, amount) {
    if (!values.length)
        return 'NOT_CALCULATED';
    if (values.every((row) => row.calculationStatus === 'NOT_APPLICABLE'))
        return 'NOT_APPLICABLE';
    if (values.some((row) => ['REVIEW_REQUIRED', 'PERIOD_REQUIRED', 'RULE_REQUIRED', 'PROFILE_REQUIRED'].includes(String(row.calculationStatus || '')))) {
        return 'REVIEW_REQUIRED';
    }
    if (amount == null)
        return 'NOT_CALCULATED';
    return 'CALCULATED';
}
function writeAudit(companyId, eventType, sourceId, message, metadata) {
    return __awaiter(this, void 0, void 0, function* () {
        const row = yield AccountingEventLog_1.AccountingEventLog.create({
            companyId: asObjectId(companyId),
            eventType,
            sourceModule: 'individual_tax_compliance',
            sourceId,
            success: true,
            message,
            metadata
        });
        return String(row._id);
    });
}
function mapIssueType(reason, fallback) {
    const code = String(reason || '').toUpperCase();
    if (complianceTypes_1.COMPLIANCE_ISSUE_TYPES.includes(code))
        return code;
    if (code.includes('PERIOD'))
        return 'MISSING_TAX_PERIOD';
    if (code.includes('RULE'))
        return 'MISSING_TAX_RULE';
    if (code.includes('CLASSIF') || code.includes('NOT_YET'))
        return 'MISSING_TAX_CLASSIFICATION';
    if (code.includes('DOCUMENT'))
        return 'MISSING_DOCUMENT';
    if (code.includes('AIDS'))
        return 'AIDS_LEVY_REVIEW';
    if (code.includes('CAPITAL'))
        return 'CAPITAL_ALLOWANCE_REVIEW';
    if (code.includes('CURRENCY'))
        return 'CURRENCY_CONVERSION_REQUIRED';
    if (code.includes('VAT'))
        return 'VAT_REVIEW';
    if (code.includes('RENTAL') || code.includes('PRESUMPTIVE'))
        return 'PRESUMPTIVE_RENTAL_REVIEW';
    return fallback;
}
function packToApi(row) {
    const doc = row;
    return {
        id: String(doc._id),
        taxYear: doc.taxYear,
        status: doc.status,
        version: doc.version,
        generatedAt: doc.generatedAt,
        finalizedAt: doc.finalizedAt || null,
        supersedesPackId: doc.supersedesPackId ? String(doc.supersedesPackId) : null,
        supersedeReason: doc.supersedeReason || null,
        readinessStatus: doc.readinessStatus,
        disclaimer: doc.disclaimer,
        accountingSummary: doc.accountingSummary,
        vatSummary: doc.vatSummary,
        rentalTaxSummary: doc.rentalTaxSummary,
        incomeTaxSummary: doc.incomeTaxSummary,
        reviewSummary: doc.reviewSummary,
        evidenceSummary: doc.evidenceSummary,
        paymentSummary: doc.paymentSummary,
        taxRuleReferences: doc.taxRuleReferences || [],
        sourceProjectionReferences: doc.sourceProjectionReferences || []
    };
}
exports.individualTaxComplianceService = {
    disclaimer: complianceTypes_1.TAX_PACK_DISCLAIMER,
    assembleYear(companyId, taxYear) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const startKey = `${taxYear}-01`;
            const endKey = `${taxYear}-12`;
            const bounds = yearBounds(taxYear);
            const companyQuery = { companyId: asObjectId(companyId) };
            const periodQuery = Object.assign(Object.assign({}, companyQuery), { taxPeriodKey: yearRange(taxYear) });
            const [owner, properties, snapshots, vatRows, rentalRows, rentalPayments, incomeRows, incomeAdjustments, incomePayments, periods, accounts, evidence, reviews] = yield Promise.all([
                individualTaxProfileService_1.default.getOwnerProfile(companyId),
                Property_1.Property.find(Object.assign(Object.assign({}, companyQuery), { isDeleted: { $ne: true } }))
                    .select('name address propertyUseClass vatSupplyTreatment rentalTaxTreatment ownershipPercentage')
                    .lean(),
                TransactionTaxSnapshot_1.TransactionTaxSnapshot.find(Object.assign(Object.assign({}, companyQuery), { taxPeriodKey: yearRange(taxYear) }))
                    .select('sourceType sourceId sourceKind taxPeriodKey taxCalculationStatus periodAssignmentStatus reviewReasons propertyId taxRuleReferences rentalTaxRegime deductibility capitalOrRevenue taxTypesRelevant')
                    .lean(),
                IndividualVatRecord_1.IndividualVatRecord.find(periodQuery).lean(),
                IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.find(periodQuery).lean(),
                IndividualRentalTaxPayment_1.IndividualRentalTaxPayment.find(Object.assign(Object.assign({}, periodQuery), { status: 'POSTED' })).lean(),
                IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.find(periodQuery).lean(),
                IndividualIncomeTaxAdjustment_1.IndividualIncomeTaxAdjustment.find(periodQuery).lean(),
                IndividualIncomeTaxPayment_1.IndividualIncomeTaxPayment.find(Object.assign(Object.assign({}, periodQuery), { status: 'POSTED' })).lean(),
                TaxPeriod_1.TaxPeriod.find(Object.assign(Object.assign({}, companyQuery), { periodKey: yearRange(taxYear) })).select('taxType periodKey status').lean(),
                PropertyAccount_1.default.find(companyQuery).select('propertyId transactions').lean(),
                IndividualTaxEvidence_1.IndividualTaxEvidence.find(Object.assign(Object.assign({}, companyQuery), { taxYear })).lean(),
                IndividualTaxComplianceReview_1.IndividualTaxComplianceReview.find(Object.assign(Object.assign({}, companyQuery), { taxYear })).lean()
            ]);
            let rentalIncome = 0;
            let otherIncome = 0;
            let expenses = 0;
            for (const account of accounts) {
                const pnl = (0, propertyAccountTotals_1.sumPropertyAccountPeriodPnl)(account.transactions, bounds.start, bounds.end);
                rentalIncome += pnl.income;
                expenses += pnl.expenses;
            }
            const accounting = {
                rentalIncome: (0, money_1.roundMoney)(rentalIncome),
                otherIncome: (0, money_1.roundMoney)(otherIncome),
                expenses: (0, money_1.roundMoney)(expenses),
                netAccountingProfit: (0, money_1.roundMoney)(rentalIncome + otherIncome - expenses),
                lifetimeNotUsed: true,
                annualisedNotUsed: true
            };
            const vatOutput = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(vatRows.filter((row) => row.direction === 'OUTPUT'), (row) => row.vatAmount);
            const vatInput = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(vatRows.filter((row) => row.direction === 'INPUT'), (row) => { var _a; return (_a = row.recoverableVatAmount) !== null && _a !== void 0 ? _a : row.vatAmount; });
            const vatSummary = {
                outputVat: vatOutput,
                inputVat: vatInput,
                netVatPosition: vatOutput == null || vatInput == null ? null : (0, money_1.roundMoney)(Number(vatOutput) - Number(vatInput)),
                calculationStatus: displayStatus(vatRows, vatOutput),
                reviewItems: vatRows.filter((row) => row.calculationStatus === 'REVIEW_REQUIRED' || (row.reviewReasons || []).length).length,
                vatRegistered: Boolean(owner.vatRegistered),
                periodsIncomplete: periods.filter((row) => row.taxType === 'VAT' && row.status !== 'FINALIZED' && row.status !== 'LOCKED').length,
                incomeTaxAmount: null,
                presumptiveTaxAmount: null
            };
            const rentalTaxAmount = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(rentalRows, (row) => row.taxAmount);
            const rentalPaid = (0, money_1.roundMoney)(rentalPayments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
            const rentalSummary = {
                applicableRentalIncome: sumStored(rentalRows.map((row) => row.grossRentalAmount)),
                taxableRentalBase: sumStored(rentalRows.map((row) => row.taxableRentalBase)),
                taxRate: (_b = (_a = rentalRows.find((row) => row.taxRate != null)) === null || _a === void 0 ? void 0 : _a.taxRate) !== null && _b !== void 0 ? _b : null,
                taxRuleCode: ((_c = rentalRows.find((row) => row.taxRuleCode)) === null || _c === void 0 ? void 0 : _c.taxRuleCode) || null,
                calculatedRentalTax: rentalTaxAmount,
                calculationStatus: displayStatus(rentalRows, rentalTaxAmount),
                paymentsRecorded: rentalPaid,
                unreconciledAmount: rentalTaxAmount == null ? null : (0, money_1.roundMoney)(Number(rentalTaxAmount) - rentalPaid),
                reviewItems: rentalRows.filter((row) => row.calculationStatus === 'REVIEW_REQUIRED' || (row.reviewReasons || []).length).length,
                incomeTaxAmount: null,
                vatAmount: null
            };
            const incomeTaxable = sumStored(incomeRows.filter((row) => row.recordKind !== 'REVERSAL').map((row) => row.taxableContribution));
            const incomeAnnual = yield individualIncomeTaxService_1.default.annualSchedule(companyId, taxYear);
            const incomePaid = (0, money_1.roundMoney)(incomePayments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
            const currencies = Array.from(new Set(incomeRows.map((row) => String(row.transactionCurrency || row.currency || 'USD'))));
            const incomeSummary = {
                accountingProfit: accounting.netAccountingProfit,
                addBacks: sumStored(incomeRows.map((row) => row.addBacks)),
                approvedDeductions: sumStored(incomeAdjustments.filter((row) => row.status === 'APPROVED' && row.adjustmentType === 'DEDUCTION').map((row) => row.amount)),
                exemptIncome: sumStored(incomeRows.map((row) => row.exemptIncome)),
                presumptiveExclusion: sumStored(incomeRows.filter((row) => row.incomeTaxRegime === 'PRESUMPTIVE_RENTAL').map((row) => { var _a; return (_a = row.exemptIncome) !== null && _a !== void 0 ? _a : row.accountingIncome; })),
                otherAdjustments: sumStored(incomeAdjustments.filter((row) => row.status === 'APPROVED' && row.adjustmentType === 'OTHER').map((row) => row.amount)),
                taxableIncome: incomeAnnual.taxableIncome,
                calculatedIncomeTax: incomeAnnual.calculatedIncomeTax,
                taxRuleCode: ((_d = incomeRows.find((row) => row.taxRuleCode)) === null || _d === void 0 ? void 0 : _d.taxRuleCode) || null,
                sourceReference: ((_e = incomeRows.find((row) => row.sourceReference)) === null || _e === void 0 ? void 0 : _e.sourceReference) || null,
                paymentsRecorded: incomePaid,
                unreconciledAmount: incomeAnnual.unreconciledAmount,
                calculationStatus: incomeAnnual.calculatedIncomeTax == null ? (incomeRows.length ? 'REVIEW_REQUIRED' : 'NOT_CALCULATED') : 'CALCULATED',
                reviewItems: incomeAnnual.reviewItems,
                pendingAdjustments: incomeAdjustments.filter((row) => row.status === 'PENDING').length,
                currencies,
                vatAmount: null,
                presumptiveTaxAmount: null,
                lineTaxableContribution: incomeTaxable
            };
            const propertySummaries = properties.map((property) => {
                var _a;
                const id = String(property._id);
                const propertyIncomeRows = incomeRows.filter((row) => String(row.propertyId || '') === id);
                const propertyRentalRows = rentalRows.filter((row) => String(row.propertyId || '') === id);
                const snapshotsForProperty = snapshots.filter((row) => String(row.propertyId || '') === id);
                const account = accounts.find((row) => String(row.propertyId || '') === id);
                const pnl = (0, propertyAccountTotals_1.sumPropertyAccountPeriodPnl)(account === null || account === void 0 ? void 0 : account.transactions, bounds.start, bounds.end);
                const ownership = Number((_a = property.ownershipPercentage) !== null && _a !== void 0 ? _a : 100);
                const regimes = Array.from(new Set(snapshotsForProperty.map((row) => String(row.rentalTaxRegime || '')).filter(Boolean)));
                return {
                    propertyId: id,
                    name: property.name || '',
                    address: property.address || '',
                    useClass: property.propertyUseClass || null,
                    ownershipPercentage: ownership,
                    rentalRegime: regimes.length === 1 ? regimes[0] : regimes.length ? 'MIXED_SNAPSHOTS' : property.rentalTaxTreatment || 'ACCOUNTANT_REVIEW',
                    vatTreatment: property.vatSupplyTreatment || null,
                    grossRentalIncome: pnl.income,
                    expenses: pnl.expenses,
                    accountingProfit: pnl.net,
                    ownerShareIncome: ownership === 100 ? pnl.income : null,
                    taxTreatment: regimes[0] || property.rentalTaxTreatment || 'ACCOUNTANT_REVIEW',
                    reviewStatus: (ownership > 0 && ownership < 100) ||
                        snapshotsForProperty.some((row) => row.taxCalculationStatus === 'REVIEW_REQUIRED')
                        ? 'REVIEW_REQUIRED'
                        : 'CALCULATED',
                    inferredFromPropertyType: false,
                    rentalTaxProjection: (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(propertyRentalRows, (row) => row.taxAmount),
                    incomeTaxLines: propertyIncomeRows.length
                };
            });
            const rentalIncomeRows = snapshots
                .filter((row) => row.sourceKind === 'PAYMENT_RENT' || row.sourceKind === 'OTHER_INCOME' || row.sourceKind === 'PAYMENT_DEPOSIT')
                .map((row) => ({
                sourceId: String(row.sourceId),
                sourceType: row.sourceType,
                sourceKind: row.sourceKind,
                propertyId: row.propertyId ? String(row.propertyId) : null,
                taxPeriodKey: row.taxPeriodKey,
                classification: row.sourceKind === 'PAYMENT_DEPOSIT' ? 'DEPOSIT_NOT_INCOME' : row.taxCalculationStatus,
                taxStatus: row.sourceKind === 'PAYMENT_DEPOSIT' ? 'NOT_APPLICABLE' : row.taxCalculationStatus
            }));
            const expenseRows = incomeRows
                .filter((row) => row.accountingExpenses != null)
                .map((row) => ({
                sourceId: String(row.sourceId),
                category: row.classification,
                accountingAmount: row.accountingExpenses,
                taxClassification: row.classification,
                deductibleAmount: row.deductions,
                nonDeductibleAmount: row.addBacks,
                capitalAmount: row.capitalAdjustments,
                reviewAmount: row.classification === 'REVIEW_REQUIRED' ? row.accountingExpenses : null,
                supportingDocumentStatus: row.supportingDocumentStatus
            }));
            const payments = [
                ...rentalPayments.map((row) => ({
                    id: String(row._id),
                    taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
                    taxPeriodKey: row.taxPeriodKey,
                    amount: row.amount,
                    currency: row.currency,
                    paymentDate: row.paymentDate,
                    reference: row.paymentReference || null,
                    status: row.status,
                    recordedByLandlord: true,
                    zimraConfirmed: false
                })),
                ...incomePayments.map((row) => ({
                    id: String(row._id),
                    taxType: 'INCOME_TAX',
                    taxPeriodKey: row.taxPeriodKey,
                    amount: row.amount,
                    currency: row.currency,
                    paymentDate: row.paymentDate,
                    reference: row.paymentReference || null,
                    status: row.status,
                    recordedByLandlord: true,
                    zimraConfirmed: false
                }))
            ];
            const missingDocs = incomeRows.filter((row) => row.supportingDocumentStatus === 'MISSING').length;
            const unclassified = snapshots.filter((row) => ['PAYMENT_RENT', 'OTHER_INCOME', 'EXPENSE', 'MAINTENANCE', 'CAPITAL'].includes(String(row.sourceKind)) &&
                (!incomeRows.some((line) => String(line.sourceId) === String(row.sourceId) && line.sourceType === row.sourceType) &&
                    !vatRows.some((line) => String(line.sourceId) === String(row.sourceId)) &&
                    !rentalRows.some((line) => String(line.sourceId) === String(row.sourceId))));
            const periodRequired = snapshots.filter((row) => row.periodAssignmentStatus === 'PERIOD_REQUIRED').length;
            const missingRules = snapshots.filter((row) => (row.reviewReasons || []).includes('TAX_RULE_UNAVAILABLE') || (row.taxRuleReferences || []).some((ref) => !ref.ruleId && ref.taxCalculationStatus === 'READY_FOR_CALCULATION')).length;
            return {
                taxYear,
                taxpayer: {
                    name: owner.legalName || owner.tradingName,
                    tin: owner.tin,
                    vatRegistered: owner.vatRegistered,
                    incomeTaxRegistered: owner.incomeTaxRegistered,
                    rentalTaxRegime: owner.rentalTaxRegime,
                    taxYearStartMonth: owner.taxYearStartMonth
                },
                accounting,
                vat: vatSummary,
                rentalTax: rentalSummary,
                incomeTax: incomeSummary,
                properties: propertySummaries,
                rentalIncome: rentalIncomeRows,
                expenses: expenseRows,
                adjustments: incomeAdjustments.map((row) => ({
                    id: String(row._id),
                    adjustmentType: row.adjustmentType,
                    amount: row.amount,
                    currency: row.currency,
                    reason: row.reason,
                    status: row.status,
                    reviewStatus: row.reviewStatus,
                    sourceTransactionIds: row.sourceTransactionIds || [],
                    supportingDocumentIds: row.supportingDocumentIds || [],
                    createdAt: row.createdAt,
                    approvedAt: row.approvedAt || null
                })),
                payments,
                periods: periods.map((row) => ({ taxType: row.taxType, periodKey: row.periodKey, status: row.status })),
                evidence: evidence.map((row) => ({
                    id: String(row._id),
                    documentId: String(row.documentId),
                    taxType: row.taxType,
                    sourceType: row.sourceType,
                    sourceId: row.sourceId,
                    documentType: row.documentType,
                    documentStatus: row.documentStatus,
                    reviewStatus: row.reviewStatus,
                    description: row.description
                })),
                reviews: reviews.map((row) => ({
                    id: String(row._id),
                    taxType: row.taxType,
                    taxPeriodKey: row.taxPeriodKey,
                    sourceType: row.sourceType,
                    sourceId: row.sourceId,
                    issueType: row.issueType,
                    severity: row.severity,
                    description: row.description,
                    status: row.status
                })),
                snapshots: snapshots.length,
                diagnostics: {
                    unclassified: unclassified.length,
                    periodRequired,
                    missingRules,
                    missingDocuments: missingDocs,
                    mixedCurrency: currencies.length > 1,
                    closedPeriods: periods.filter((row) => row.status === 'FINALIZED' || row.status === 'LOCKED').length,
                    ownershipUnclear: propertySummaries.some((row) => row.ownershipPercentage > 0 && row.ownershipPercentage < 100),
                    unclassifiedIds: unclassified.map((row) => String(row.sourceId)),
                    startKey,
                    endKey
                },
                sourceProjectionReferences: [
                    { taxType: 'VAT', count: vatRows.length },
                    { taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX', count: rentalRows.length },
                    { taxType: 'INCOME_TAX', count: incomeRows.length }
                ]
            };
        });
    },
    readiness(companyId, taxYear) {
        return __awaiter(this, void 0, void 0, function* () {
            const year = yield this.assembleYear(companyId, taxYear);
            const [vatReview, rentalReview, incomeReview, latestPack] = yield Promise.all([
                individualVatService_1.default.reviewQueue(companyId),
                individualRentalTaxService_1.default.reviewQueue(companyId),
                individualIncomeTaxService_1.default.reviewQueue(companyId),
                IndividualTaxPack_1.IndividualTaxPack.findOne({ companyId: asObjectId(companyId), taxYear, status: 'FINALIZED' }).sort({ version: -1 }).lean()
            ]);
            const vatYearReview = vatReview.filter((row) => String(row.taxPeriodKey || '').startsWith(String(taxYear)));
            const rentalYearReview = rentalReview.filter((row) => String(row.taxPeriodKey || '').startsWith(String(taxYear)));
            const incomeYearReview = incomeReview.filter((row) => String(row.taxPeriodKey || '').startsWith(String(taxYear)) || row.kind === 'SNAPSHOT');
            return (0, individualTaxComplianceReadinessService_1.evaluateComplianceReadiness)({
                taxYear,
                packFinalized: Boolean(latestPack),
                hasAnyActivity: year.snapshots > 0 || year.accounting.netAccountingProfit !== 0,
                unclassifiedTransactions: year.diagnostics.unclassified,
                missingTaxRules: year.diagnostics.missingRules,
                missingTaxPeriods: year.diagnostics.periodRequired,
                incompleteTaxableIncome: year.incomeTax.calculationStatus !== 'CALCULATED' && year.incomeTax.calculationStatus !== 'NOT_CALCULATED' && year.incomeTax.calculationStatus !== 'NOT_APPLICABLE',
                unresolvedIncomeTaxReviews: incomeYearReview.filter((row) => (row.reasons || []).some((reason) => reason !== 'AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW' && reason !== 'NOT_YET_TAX_CLASSIFIED') && row.calculationStatus === 'REVIEW_REQUIRED').length,
                unresolvedRentalTaxReviews: rentalYearReview.length,
                unresolvedVatReviews: vatYearReview.length,
                missingDocuments: year.diagnostics.missingDocuments,
                unmatchedTaxPayments: year.payments.filter((row) => !row.reference).length,
                capitalAllowanceReviews: year.expenses.filter((row) => row.taxClassification === 'CAPITAL').length,
                aidsLevyReviews: 1,
                mixedCurrency: year.diagnostics.mixedCurrency,
                vatRegistered: year.taxpayer.vatRegistered,
                presumptiveApplicable: year.rentalTax.calculationStatus !== 'NOT_APPLICABLE' && year.rentalTax.calculatedRentalTax != null,
                incomeTaxPaymentRecorded: year.incomeTax.paymentsRecorded > 0,
                rentalTaxPaymentRecorded: year.rentalTax.paymentsRecorded > 0,
                ownershipUnclear: year.diagnostics.ownershipUnclear,
                closedPeriods: year.diagnostics.closedPeriods,
                pendingAdjustments: year.incomeTax.pendingAdjustments
            });
        });
    },
    overview(companyId, taxYear) {
        return __awaiter(this, void 0, void 0, function* () {
            const [year, readiness] = yield Promise.all([this.assembleYear(companyId, taxYear), this.readiness(companyId, taxYear)]);
            return {
                disclaimer: complianceTypes_1.TAX_PACK_DISCLAIMER,
                taxYear,
                status: readiness.status,
                taxpayer: year.taxpayer,
                accounting: year.accounting,
                vat: year.vat,
                rentalTax: year.rentalTax,
                incomeTax: year.incomeTax,
                properties: year.properties,
                payments: year.payments,
                adjustments: year.adjustments,
                rentalIncome: year.rentalIncome,
                expenses: year.expenses,
                compliance: {
                    unclassifiedTransactions: readiness.metrics.unclassifiedTransactions,
                    missingDocuments: readiness.metrics.missingDocuments,
                    openReviews: readiness.metrics.openReviews,
                    closedPeriods: readiness.metrics.closedPeriods,
                    incompleteCalculations: readiness.metrics.incompleteCalculations
                },
                readiness,
                generatedAt: new Date().toISOString()
            };
        });
    },
    checklist(companyId, taxYear) {
        return __awaiter(this, void 0, void 0, function* () {
            const [year, readiness, owner, properties] = yield Promise.all([
                this.assembleYear(companyId, taxYear),
                this.readiness(companyId, taxYear),
                individualTaxProfileService_1.default.getOwnerProfile(companyId),
                Property_1.Property.find({ companyId: asObjectId(companyId), isDeleted: { $ne: true } }).select('propertyUseClass rentalTaxTreatment').lean()
            ]);
            const items = [
                { key: 'profile', label: 'Tax profile completed', done: Boolean(owner.tin || owner.rentalTaxRegime !== 'ACCOUNTANT_REVIEW' || owner.vatRegistered || owner.incomeTaxRegistered), href: '/settings' },
                { key: 'properties', label: 'Properties classified', done: properties.every((row) => Boolean(row.propertyUseClass)), href: '/properties' },
                { key: 'periods', label: 'Tax periods present', done: !readiness.blockers.some((row) => row.issueType === 'MISSING_TAX_PERIOD'), href: '/settings' },
                { key: 'accounting', label: 'Accounting reconciled', done: year.accounting.lifetimeNotUsed, href: '/accounting' },
                { key: 'classified', label: 'Tax transactions classified', done: readiness.metrics.unclassifiedTransactions === 0, href: '/tax/compliance' },
                { key: 'vat', label: 'VAT reviewed', done: readiness.metrics.vatReviewItems === 0, href: '/tax/vat' },
                { key: 'rental', label: 'Rental tax reviewed', done: readiness.metrics.rentalTaxReviewItems === 0, href: '/tax/rental' },
                { key: 'income', label: 'Income tax working paper reviewed', done: readiness.metrics.incomeTaxReviewItems === 0, href: '/tax/income' },
                { key: 'adjustments', label: 'Adjustments approved', done: year.incomeTax.pendingAdjustments === 0, href: '/tax/income' },
                { key: 'payments', label: 'Tax payments recorded', done: year.payments.length > 0, href: '/tax/compliance' },
                { key: 'documents', label: 'Supporting documents attached', done: readiness.metrics.missingDocuments === 0, href: '/files' },
                { key: 'reviews', label: 'Review issues resolved', done: readiness.blockers.length === 0, href: '/tax/compliance' }
            ];
            return { taxYear, status: readiness.status, items };
        });
    },
    syncReviews(companyId, taxYear, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [vatReview, rentalReview, incomeReview, year] = yield Promise.all([
                individualVatService_1.default.reviewQueue(companyId),
                individualRentalTaxService_1.default.reviewQueue(companyId),
                individualIncomeTaxService_1.default.reviewQueue(companyId),
                this.assembleYear(companyId, taxYear)
            ]);
            const incoming = [];
            for (const row of vatReview.filter((item) => String(item.taxPeriodKey || '').startsWith(String(taxYear)))) {
                incoming.push({
                    taxType: 'VAT',
                    sourceType: String(row.sourceType),
                    sourceId: String(row.sourceId),
                    taxPeriodKey: row.taxPeriodKey,
                    issueType: 'VAT_REVIEW',
                    severity: 'BLOCKER',
                    description: (row.reasons || []).join(', ') || 'VAT review required'
                });
            }
            for (const row of rentalReview.filter((item) => String(item.taxPeriodKey || '').startsWith(String(taxYear)))) {
                incoming.push({
                    taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
                    sourceType: String(row.sourceType),
                    sourceId: String(row.sourceId),
                    taxPeriodKey: row.taxPeriodKey,
                    issueType: 'PRESUMPTIVE_RENTAL_REVIEW',
                    severity: 'BLOCKER',
                    description: (row.reasons || []).join(', ') || 'Rental tax review required'
                });
            }
            for (const row of incomeReview.filter((item) => String(item.taxPeriodKey || '').startsWith(String(taxYear)) || item.kind === 'SNAPSHOT')) {
                const reasons = row.reasons || [];
                incoming.push({
                    taxType: 'INCOME_TAX',
                    sourceType: String(row.sourceType),
                    sourceId: String(row.sourceId),
                    taxPeriodKey: row.taxPeriodKey,
                    issueType: mapIssueType(reasons[0], reasons.includes('NOT_YET_TAX_CLASSIFIED') ? 'NOT_YET_TAX_CLASSIFIED' : 'INCOME_TAX_REVIEW'),
                    severity: reasons.includes('AIDS_LEVY_NOT_INCLUDED_REQUIRES_REVIEW') || reasons.includes('MISSING_SUPPORTING_DOCUMENT') ? 'WARNING' : 'BLOCKER',
                    description: reasons.join(', ') || 'Income tax review required'
                });
            }
            for (const id of year.diagnostics.unclassifiedIds) {
                incoming.push({
                    taxType: 'INCOME_TAX',
                    sourceType: 'Snapshot',
                    sourceId: id,
                    issueType: 'NOT_YET_TAX_CLASSIFIED',
                    severity: 'BLOCKER',
                    description: 'Transaction is not yet tax-classified'
                });
            }
            for (const item of incoming) {
                const existing = yield IndividualTaxComplianceReview_1.IndividualTaxComplianceReview.findOne({
                    companyId: asObjectId(companyId),
                    taxYear,
                    taxType: item.taxType,
                    sourceType: item.sourceType,
                    sourceId: item.sourceId,
                    issueType: item.issueType
                });
                if (existing)
                    continue;
                yield IndividualTaxComplianceReview_1.IndividualTaxComplianceReview.create({
                    companyId: asObjectId(companyId),
                    taxYear,
                    taxPeriodKey: item.taxPeriodKey || null,
                    taxType: item.taxType,
                    sourceType: item.sourceType,
                    sourceId: item.sourceId,
                    issueType: item.issueType,
                    severity: item.severity,
                    description: item.description,
                    status: 'OPEN',
                    createdBy: userId && mongoose_1.default.Types.ObjectId.isValid(userId) ? asObjectId(userId) : null
                });
                yield writeAudit(companyId, 'TAX_COMPLIANCE_REVIEW_CREATED', item.sourceId, item.description, { taxYear, issueType: item.issueType });
            }
            const rows = yield IndividualTaxComplianceReview_1.IndividualTaxComplianceReview.find({ companyId: asObjectId(companyId), taxYear }).sort({ createdAt: -1 }).lean();
            return rows.map((row) => ({
                id: String(row._id),
                taxYear: row.taxYear,
                taxType: row.taxType,
                taxPeriod: row.taxPeriodKey,
                sourceType: row.sourceType,
                sourceId: row.sourceId,
                issueType: row.issueType,
                severity: row.severity,
                description: row.description,
                status: row.status,
                decision: row.decision || null,
                comment: row.comment || null,
                createdAt: row.createdAt,
                resolvedAt: row.resolvedAt || null
            }));
        });
    },
    startReview(companyId, reviewId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield IndividualTaxComplianceReview_1.IndividualTaxComplianceReview.findOne({ _id: asObjectId(reviewId), companyId: asObjectId(companyId) });
            if (!row)
                throw new errorHandler_1.AppError('Review not found', 404);
            if (row.status === 'RESOLVED' || row.status === 'WAIVED')
                return row;
            row.status = 'IN_REVIEW';
            row.assignedTo = asObjectId(userId);
            yield row.save();
            return row;
        });
    },
    listEvidence(companyId, taxYear) {
        return __awaiter(this, void 0, void 0, function* () {
            const year = yield this.assembleYear(companyId, taxYear);
            return year.evidence;
        });
    },
    listYears(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const current = new Date().getUTCFullYear();
            const periods = yield TaxPeriod_1.TaxPeriod.find({ companyId: asObjectId(companyId) }).select('periodKey').lean();
            const years = new Set([current, current - 1]);
            for (const period of periods) {
                const year = Number(String(period.periodKey || '').slice(0, 4));
                if (year)
                    years.add(year);
            }
            return [...years].sort((a, b) => b - a);
        });
    },
    resolveReview(companyId, reviewId, userId, input) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield IndividualTaxComplianceReview_1.IndividualTaxComplianceReview.findOne({ _id: asObjectId(reviewId), companyId: asObjectId(companyId) });
            if (!row)
                throw new errorHandler_1.AppError('Review not found', 404);
            if (row.status === 'RESOLVED' || row.status === 'WAIVED')
                return row;
            row.status = 'RESOLVED';
            row.decision = input.decision || 'RESOLVED';
            row.comment = input.comment || null;
            if (input.evidenceId) {
                const evidence = yield IndividualTaxEvidence_1.IndividualTaxEvidence.findOne({
                    _id: asObjectId(input.evidenceId),
                    companyId: asObjectId(companyId)
                });
                if (!evidence)
                    throw new errorHandler_1.AppError('Evidence not found', 404);
                const file = yield File_1.default.findOne({ _id: evidence.documentId, companyId: asObjectId(companyId) }).select('_id');
                if (!file)
                    throw new errorHandler_1.AppError('Document not found', 404);
                row.evidenceId = evidence._id;
            }
            row.resolvedBy = asObjectId(userId);
            row.resolvedAt = new Date();
            yield row.save();
            yield writeAudit(companyId, 'TAX_COMPLIANCE_REVIEW_RESOLVED', reviewId, 'Compliance review resolved without mutating the source transaction', {
                decision: row.decision,
                sourceId: row.sourceId
            });
            return row;
        });
    },
    waiveReview(companyId, reviewId, userId, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!String(reason || '').trim())
                throw new errorHandler_1.AppError('A waiver requires a reason', 400);
            const row = yield IndividualTaxComplianceReview_1.IndividualTaxComplianceReview.findOne({ _id: asObjectId(reviewId), companyId: asObjectId(companyId) });
            if (!row)
                throw new errorHandler_1.AppError('Review not found', 404);
            row.status = 'WAIVED';
            row.waiverReason = String(reason).trim();
            row.decision = 'WAIVED';
            row.resolvedBy = asObjectId(userId);
            row.resolvedAt = new Date();
            yield row.save();
            yield writeAudit(companyId, 'TAX_COMPLIANCE_REVIEW_WAIVED', reviewId, 'Compliance review waived', { reason: row.waiverReason, sourceId: row.sourceId });
            return row;
        });
    },
    attachEvidence(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const file = yield File_1.default.findOne({ _id: asObjectId(input.documentId), companyId: asObjectId(input.companyId) }).select('_id propertyId');
            if (!file)
                throw new errorHandler_1.AppError('Document not found', 404);
            if (input.propertyId) {
                const property = yield Property_1.Property.findOne({ _id: asObjectId(input.propertyId), companyId: asObjectId(input.companyId), isDeleted: { $ne: true } }).select('_id');
                if (!property)
                    throw new errorHandler_1.AppError('Property not found', 404);
            }
            const documentType = complianceTypes_1.EVIDENCE_DOCUMENT_TYPES.includes(String(input.documentType || ''))
                ? input.documentType
                : 'OTHER';
            try {
                const created = yield IndividualTaxEvidence_1.IndividualTaxEvidence.create({
                    companyId: asObjectId(input.companyId),
                    taxYear: input.taxYear,
                    taxPeriodKey: input.taxPeriodKey || null,
                    taxType: input.taxType,
                    sourceType: input.sourceType,
                    sourceId: input.sourceId,
                    documentId: file._id,
                    documentType,
                    documentStatus: 'UPLOADED',
                    description: input.description || null,
                    uploadedBy: asObjectId(input.userId),
                    uploadedAt: new Date(),
                    reviewStatus: 'REQUIRES_REVIEW'
                });
                const auditId = yield writeAudit(input.companyId, 'TAX_EVIDENCE_ATTACHED', input.sourceId, 'Evidence linked to existing document', {
                    documentId: String(file._id),
                    taxYear: input.taxYear,
                    copiedFile: false
                });
                created.auditEventId = auditId;
                yield created.save();
                return created;
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                    return IndividualTaxEvidence_1.IndividualTaxEvidence.findOne({
                        companyId: asObjectId(input.companyId),
                        documentId: file._id,
                        sourceId: input.sourceId
                    });
                }
                throw error;
            }
        });
    },
    reviewEvidence(companyId, evidenceId, userId, status) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield IndividualTaxEvidence_1.IndividualTaxEvidence.findOne({ _id: asObjectId(evidenceId), companyId: asObjectId(companyId) });
            if (!row)
                throw new errorHandler_1.AppError('Evidence not found', 404);
            row.documentStatus = status === 'ACCEPTED' ? 'ACCEPTED' : status === 'REVIEWED' ? 'REVIEWED' : 'REQUIRES_REVIEW';
            row.reviewStatus = status;
            row.reviewedBy = asObjectId(userId);
            row.reviewedAt = new Date();
            yield row.save();
            yield writeAudit(companyId, 'TAX_EVIDENCE_REVIEWED', evidenceId, 'Evidence review updated', { status });
            return row;
        });
    },
    reconciliation(companyId, taxYear) {
        return __awaiter(this, void 0, void 0, function* () {
            const year = yield this.assembleYear(companyId, taxYear);
            return {
                disclaimer: complianceTypes_1.TAX_PACK_DISCLAIMER,
                taxYear,
                vat: {
                    label: 'VAT projection',
                    calculated: year.vat.netVatPosition,
                    recordedPayments: null,
                    paymentStatus: 'NOT_RECORDED',
                    unreconciled: null,
                    status: year.vat.calculationStatus
                },
                rentalTax: {
                    label: 'Presumptive rental tax projection',
                    calculated: year.rentalTax.calculatedRentalTax,
                    recordedPayments: year.rentalTax.paymentsRecorded,
                    unreconciled: year.rentalTax.unreconciledAmount,
                    status: year.rentalTax.calculationStatus
                },
                incomeTax: {
                    label: 'Ordinary income-tax projection',
                    calculated: year.incomeTax.calculatedIncomeTax,
                    recordedPayments: year.incomeTax.paymentsRecorded,
                    unreconciled: year.incomeTax.unreconciledAmount,
                    status: year.incomeTax.calculationStatus
                },
                combinedTotalTaxPayable: null,
                zimraBalance: null
            };
        });
    },
    generatePack(companyId, taxYear, userId, supersedeReason) {
        return __awaiter(this, void 0, void 0, function* () {
            const [year, readiness] = yield Promise.all([this.assembleYear(companyId, taxYear), this.readiness(companyId, taxYear)]);
            const latest = yield IndividualTaxPack_1.IndividualTaxPack.findOne({ companyId: asObjectId(companyId), taxYear }).sort({ version: -1 });
            if ((latest === null || latest === void 0 ? void 0 : latest.status) === 'GENERATED') {
                return packToApi(latest);
            }
            const version = latest ? Number(latest.version) + 1 : 1;
            try {
                const created = yield IndividualTaxPack_1.IndividualTaxPack.create({
                    companyId: asObjectId(companyId),
                    taxYear,
                    status: 'GENERATED',
                    version,
                    generatedAt: new Date(),
                    generatedBy: asObjectId(userId),
                    supersedesPackId: (latest === null || latest === void 0 ? void 0 : latest._id) || null,
                    supersedeReason: supersedeReason || null,
                    accountingSummary: year.accounting,
                    vatSummary: year.vat,
                    rentalTaxSummary: year.rentalTax,
                    incomeTaxSummary: year.incomeTax,
                    reviewSummary: { open: readiness.metrics.openReviews, blockers: readiness.blockers.length },
                    evidenceSummary: { count: year.evidence.length, missing: year.diagnostics.missingDocuments },
                    paymentSummary: { payments: year.payments },
                    taxRuleReferences: [
                        { taxType: 'VAT', from: 'IndividualVatRecord' },
                        { taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX', from: 'IndividualRentalTaxRecord' },
                        { taxType: 'INCOME_TAX', from: 'IndividualIncomeTaxRecord' }
                    ],
                    sourceProjectionReferences: year.sourceProjectionReferences,
                    readinessStatus: readiness.status,
                    disclaimer: complianceTypes_1.TAX_PACK_DISCLAIMER
                });
                if ((latest === null || latest === void 0 ? void 0 : latest.status) === 'FINALIZED') {
                    latest.status = 'SUPERSEDED';
                    yield latest.save();
                    yield writeAudit(companyId, 'TAX_PACK_SUPERSEDED', String(latest._id), 'Finalized pack superseded by a new version', {
                        taxYear,
                        previousVersion: latest.version
                    });
                }
                yield writeAudit(companyId, 'TAX_PACK_GENERATED', String(created._id), `Tax pack generated for ${taxYear}`, {
                    version,
                    readiness: readiness.status,
                    duplicatedTaxEngine: false
                });
                return packToApi(created);
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                    const existing = yield IndividualTaxPack_1.IndividualTaxPack.findOne({ companyId: asObjectId(companyId), taxYear, version });
                    if (existing)
                        return packToApi(existing);
                }
                throw error;
            }
        });
    },
    finalizePack(companyId, taxYear, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const readiness = yield this.readiness(companyId, taxYear);
            if (readiness.blockers.length) {
                throw new errorHandler_1.AppError('Cannot finalise the tax pack while blockers remain', 409);
            }
            let row = yield IndividualTaxPack_1.IndividualTaxPack.findOne({ companyId: asObjectId(companyId), taxYear, status: 'GENERATED' }).sort({ version: -1 });
            if (!row) {
                const generated = yield this.generatePack(companyId, taxYear, userId);
                row = yield IndividualTaxPack_1.IndividualTaxPack.findById(generated.id);
            }
            if (!row)
                throw new errorHandler_1.AppError('Tax pack not found', 404);
            if (row.status === 'FINALIZED')
                return packToApi(row);
            if (row.status !== 'GENERATED')
                throw new errorHandler_1.AppError('Only a generated pack can be finalised', 409);
            row.status = 'FINALIZED';
            row.finalizedAt = new Date();
            row.finalizedBy = asObjectId(userId);
            yield row.save();
            yield writeAudit(companyId, 'TAX_PACK_FINALIZED', String(row._id), `Tax pack ${taxYear} v${row.version} finalised`, {
                version: row.version,
                projectionsRewritten: false
            });
            return packToApi(row);
        });
    },
    getPack(companyId, taxYear) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield IndividualTaxPack_1.IndividualTaxPack.findOne({ companyId: asObjectId(companyId), taxYear }).sort({ version: -1 }).lean();
            if (!row)
                return null;
            return packToApi(row);
        });
    },
    drillDown(companyId, sourceType, sourceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { default: individualTaxMetadataService } = yield Promise.resolve().then(() => __importStar(require('./individualTaxMetadataService')));
            const overlay = yield individualTaxMetadataService.getForSource(companyId, sourceType, sourceId);
            const evidence = yield IndividualTaxEvidence_1.IndividualTaxEvidence.find({
                companyId: asObjectId(companyId),
                sourceId
            }).lean();
            return {
                snapshot: overlay,
                vat: (overlay === null || overlay === void 0 ? void 0 : overlay.vat) || [],
                rentalTax: (overlay === null || overlay === void 0 ? void 0 : overlay.rentalTax) || [],
                incomeTax: (overlay === null || overlay === void 0 ? void 0 : overlay.incomeTax) || [],
                evidence: evidence.map((row) => ({
                    id: String(row._id),
                    documentId: String(row.documentId),
                    documentType: row.documentType,
                    documentStatus: row.documentStatus
                }))
            };
        });
    },
    exportPack(companyId, taxYear, format) {
        return __awaiter(this, void 0, void 0, function* () {
            const year = yield this.assembleYear(companyId, taxYear);
            const readiness = yield this.readiness(companyId, taxYear);
            const cover = [
                { field: 'Report', value: 'Mantis Individual Landlord Tax Preparation Pack' },
                { field: 'Tax year', value: taxYear },
                { field: 'Generated', value: new Date().toISOString() },
                { field: 'Disclaimer', value: complianceTypes_1.TAX_PACK_DISCLAIMER }
            ];
            const sheets = [
                { name: 'Cover', rows: cover },
                { name: 'Taxpayer', rows: [{ name: year.taxpayer.name, tin: year.taxpayer.tin, vatRegistered: year.taxpayer.vatRegistered, rentalTaxRegime: year.taxpayer.rentalTaxRegime }] },
                { name: 'Properties', rows: year.properties.length ? year.properties : [{ property: 'none' }] },
                { name: 'Rental Income', rows: year.rentalIncome.length ? year.rentalIncome : [{ note: 'none' }] },
                { name: 'Expenses', rows: year.expenses.length ? year.expenses : [{ note: 'none' }] },
                { name: 'VAT', rows: [{ outputVat: year.vat.outputVat, inputVat: year.vat.inputVat, net: year.vat.netVatPosition, status: year.vat.calculationStatus }] },
                { name: 'Rental Tax', rows: [{ calculated: year.rentalTax.calculatedRentalTax, payments: year.rentalTax.paymentsRecorded, unreconciled: year.rentalTax.unreconciledAmount, status: year.rentalTax.calculationStatus }] },
                { name: 'Income Tax', rows: [{ taxableIncome: year.incomeTax.taxableIncome, calculated: year.incomeTax.calculatedIncomeTax, payments: year.incomeTax.paymentsRecorded, unreconciled: year.incomeTax.unreconciledAmount, status: year.incomeTax.calculationStatus }] },
                { name: 'Adjustments', rows: year.adjustments.length ? year.adjustments : [{ note: 'none' }] },
                { name: 'Tax Payments', rows: year.payments.length ? year.payments : [{ note: 'none' }] },
                { name: 'Review Items', rows: [...readiness.blockers, ...readiness.warnings] },
                { name: 'Evidence Register', rows: year.evidence.length ? year.evidence : [{ note: 'none' }] },
                { name: 'Reconciliation', rows: [{ vat: year.vat.netVatPosition, rentalTax: year.rentalTax.calculatedRentalTax, incomeTax: year.incomeTax.calculatedIncomeTax, totalTaxPayable: null }] }
            ];
            if (format === 'csv') {
                const body = sheets
                    .map((sheet) => {
                    const rows = sheet.rows;
                    const headers = Object.keys(rows[0] || { line: '' });
                    return [`# ${sheet.name}`, headers.join(','), ...rows.map((row) => headers.map((header) => { var _a; return JSON.stringify((_a = row[header]) !== null && _a !== void 0 ? _a : ''); }).join(','))].join('\n');
                })
                    .join('\n\n');
                return { contentType: 'text/csv', body: `${body}\n\n${JSON.stringify(complianceTypes_1.TAX_PACK_DISCLAIMER)}`, filename: `tax-pack-${taxYear}.csv` };
            }
            if (format === 'xlsx' || format === 'excel') {
                return {
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    body: (0, xlsxWorkbook_1.buildXlsxWorkbookSheets)(sheets),
                    filename: `tax-pack-${taxYear}.xlsx`
                };
            }
            const pdf = yield pdf_lib_1.PDFDocument.create();
            const font = yield pdf.embedFont(pdf_lib_1.StandardFonts.Helvetica);
            const bold = yield pdf.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
            let page = pdf.addPage([595, 842]);
            let y = 800;
            const wrap = (text, maxChars) => {
                const words = String(text || '').split(/\s+/);
                const lines = [];
                let current = '';
                for (const word of words) {
                    const next = current ? `${current} ${word}` : word;
                    if (next.length > maxChars && current) {
                        lines.push(current);
                        current = word;
                    }
                    else {
                        current = next;
                    }
                }
                if (current)
                    lines.push(current);
                return lines.length ? lines : [''];
            };
            const line = (text, size = 10, useBold = false) => {
                const maxChars = size <= 8 ? 108 : 92;
                for (const piece of wrap(text, maxChars)) {
                    if (y < 40) {
                        page = pdf.addPage([595, 842]);
                        y = 800;
                    }
                    page.drawText(piece, { x: 40, y, size, font: useBold ? bold : font });
                    y -= size <= 8 ? 12 : 14;
                }
            };
            line('Mantis Individual Landlord Tax Preparation Pack', 16, true);
            line(`Tax Year: ${taxYear}`, 12, true);
            line(complianceTypes_1.TAX_PACK_DISCLAIMER, 8);
            line(`Taxpayer: ${year.taxpayer.name}  TIN: ${year.taxpayer.tin || '—'}`);
            line(`Readiness: ${readiness.status}`, 11, true);
            line('Accounting summary', 12, true);
            line(`Rental income ${year.accounting.rentalIncome}  Expenses ${year.accounting.expenses}  Net profit ${year.accounting.netAccountingProfit}`);
            line('VAT projection', 12, true);
            line(`Output ${year.vat.outputVat == null ? 'not calculated' : year.vat.outputVat}  Input ${year.vat.inputVat == null ? 'not calculated' : year.vat.inputVat}  Net ${year.vat.netVatPosition == null ? 'not calculated' : year.vat.netVatPosition}`);
            line('Presumptive rental tax projection', 12, true);
            line(`Calculated ${year.rentalTax.calculatedRentalTax == null ? 'not calculated' : year.rentalTax.calculatedRentalTax}  Payments ${year.rentalTax.paymentsRecorded}  Unreconciled ${year.rentalTax.unreconciledAmount == null ? '—' : year.rentalTax.unreconciledAmount}`);
            line('Ordinary income-tax projection', 12, true);
            line(`Taxable income ${year.incomeTax.taxableIncome == null ? 'not calculated' : year.incomeTax.taxableIncome}`);
            line(`Calculated ${year.incomeTax.calculatedIncomeTax == null ? 'not calculated' : year.incomeTax.calculatedIncomeTax}  Payments ${year.incomeTax.paymentsRecorded}`);
            line('These figures are not a combined tax payable and not a ZIMRA assessment.', 8);
            line('Properties', 12, true);
            for (const property of year.properties) {
                line(`${property.name} rent ${property.grossRentalIncome} exp ${property.expenses} ownership ${property.ownershipPercentage}% displayed, not used to scale tax`);
            }
            line('Adjustments', 12, true);
            if (!year.adjustments.length)
                line('No recorded income-tax adjustments.');
            for (const adj of year.adjustments) {
                line(`${adj.adjustmentType || 'ADJUSTMENT'} ${adj.amount} ${adj.currency || ''} ${adj.status || ''} ${adj.reason || ''}`.trim());
            }
            line('Recorded tax payments', 12, true);
            if (!year.payments.length)
                line('No landlord-recorded tax payments.');
            for (const pay of year.payments) {
                line(`${pay.taxType || 'TAX'} ${pay.amount} ${pay.currency || ''} ref ${pay.reference || '—'} ZIMRA ref ${pay.zimraConfirmed ? 'recorded' : 'not confirmed'}`);
            }
            line('Evidence status', 12, true);
            if (!year.evidence.length)
                line('No evidence linked for this year.');
            for (const item of year.evidence) {
                line(`${item.documentType || 'OTHER'} ${item.documentStatus || ''} source ${item.sourceType || ''} ${item.sourceId || ''}`);
            }
            line('Reviews', 12, true);
            for (const item of readiness.blockers)
                line(`Blocker: ${item.description}`, 8);
            for (const item of readiness.warnings)
                line(`Warning: ${item.description}`, 8);
            if (!readiness.blockers.length && !readiness.warnings.length)
                line('No open review items.');
            return { contentType: 'application/pdf', body: Buffer.from(yield pdf.save()), filename: `tax-pack-${taxYear}.pdf` };
        });
    }
};
exports.default = exports.individualTaxComplianceService;
