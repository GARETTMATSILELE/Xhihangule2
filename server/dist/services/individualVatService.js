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
exports.individualVatService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const pdf_lib_1 = require("pdf-lib");
const IndividualVatRecord_1 = require("../models/IndividualVatRecord");
const TransactionTaxSnapshot_1 = require("../models/TransactionTaxSnapshot");
const Payment_1 = require("../models/Payment");
const LandlordFinancialTransaction_1 = require("../models/LandlordFinancialTransaction");
const Company_1 = require("../models/Company");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const TaxPeriod_1 = require("../models/TaxPeriod");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const taxPeriodService_1 = require("./taxPeriodService");
const individualVatApplicability_1 = require("./individualVatApplicability");
const individualVatCalculation_1 = require("./individualVatCalculation");
const xlsxWorkbook_1 = require("../utils/xlsxWorkbook");
const money_1 = require("../utils/money");
const taxAmountAggregation_1 = require("./tax/taxAmountAggregation");
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
        direction: doc.direction,
        recordKind: doc.recordKind,
        reversalOf: doc.reversalOf ? String(doc.reversalOf) : null,
        treatment: doc.treatment,
        applicabilityReason: doc.applicabilityReason,
        grossAmount: doc.grossAmount,
        netAmount: doc.netAmount,
        taxableAmount: doc.taxableAmount,
        vatRate: doc.vatRate,
        vatAmount: doc.vatAmount,
        chargedVatAmount: doc.chargedVatAmount,
        recoverableVatAmount: doc.recoverableVatAmount,
        inputVatEligibility: doc.inputVatEligibility || null,
        calculationMethod: doc.calculationMethod,
        calculationStatus: doc.calculationStatus,
        reviewReasons: doc.reviewReasons || [],
        taxRuleId: doc.taxRuleId || null,
        taxRuleVersion: (_a = doc.taxRuleVersion) !== null && _a !== void 0 ? _a : null,
        taxRuleCode: doc.taxRuleCode || null,
        currency: doc.currency,
        baseCurrency: doc.baseCurrency,
        exchangeRate: doc.exchangeRate,
        supplierVatNumber: doc.supplierVatNumber || null,
        invoiceNumber: doc.invoiceNumber || null,
        incomeTaxAmount: null,
        presumptiveTaxAmount: null
    };
}
function writeAudit(companyId, eventType, sourceId, message, metadata) {
    return __awaiter(this, void 0, void 0, function* () {
        yield AccountingEventLog_1.AccountingEventLog.create({
            companyId: asObjectId(companyId),
            eventType,
            sourceModule: 'individual_vat',
            sourceId,
            success: !String(eventType).includes('FAILED'),
            message,
            metadata
        });
    });
}
function assertPeriodAllowsVat(snapshot) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!snapshot.taxPeriodId)
            return;
        const period = yield TaxPeriod_1.TaxPeriod.findById(snapshot.taxPeriodId).select('status taxType');
        if (!period)
            return;
        if ((0, taxPeriodService_1.assignmentStatusForExistingPeriod)(period.status) === 'PERIOD_CLOSED') {
            throw new errorHandler_1.AppError(`VAT period ${snapshot.taxPeriodKey} is ${period.status}. Corrections require an amendment.`, 409);
        }
    });
}
function loadSource(snapshot) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        if (snapshot.sourceType === 'Payment') {
            const payment = yield Payment_1.Payment.findById(snapshot.sourceId).lean();
            if (!payment)
                return null;
            const amount = Number((_d = (_c = (_a = payment.rentAllocated) !== null && _a !== void 0 ? _a : (_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.ownerAmount) !== null && _c !== void 0 ? _c : payment.amount) !== null && _d !== void 0 ? _d : 0);
            return {
                amount,
                currency: String(payment.currency || 'USD'),
                vatMode: null,
                vatIncluded: payment.vatIncluded,
                supplier: null,
                supplierTin: null,
                supplierVatNumber: null,
                invoiceNumber: payment.referenceNumber || null,
                inputVatEligibility: null,
                counterpartyName: null,
                exchangeRate: (_e = payment.exchangeRate) !== null && _e !== void 0 ? _e : 1,
                exchangeRateDate: payment.paymentDate || null
            };
        }
        const entry = yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.findById(snapshot.sourceId).lean();
        if (!entry)
            return null;
        return {
            amount: Number(entry.amount || 0),
            currency: String(entry.currency || 'USD'),
            vatMode: entry.vatMode || null,
            vatIncluded: null,
            supplier: entry.supplier || null,
            supplierTin: entry.supplierTin || null,
            supplierVatNumber: entry.supplierVatNumber || null,
            invoiceNumber: entry.invoiceNumber || null,
            inputVatEligibility: entry.inputVatEligibility || null,
            counterpartyName: entry.supplier || null,
            exchangeRate: 1,
            exchangeRateDate: entry.date || null
        };
    });
}
exports.individualVatService = {
    toApi,
    postForSnapshot(snapshot, classifiedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const vatRef = (snapshot.taxRuleReferences || []).find((row) => row.taxType === 'VAT');
            const applicability = (0, individualVatApplicability_1.evaluateIndividualVatApplicability)({
                sourceKind: snapshot.sourceKind,
                vatRegisteredOnSnapshot: Boolean((_a = snapshot.taxProfileSnapshot) === null || _a === void 0 ? void 0 : _a.vatRegistered),
                vatSupplyTreatment: ((_b = snapshot.taxProfileSnapshot) === null || _b === void 0 ? void 0 : _b.vatSupplyTreatment) || snapshot.vatTreatment,
                userVatTreatment: snapshot.vatTreatment,
                vatRule: vatRef
                    ? {
                        id: vatRef.ruleId || '',
                        version: vatRef.ruleVersion || 1,
                        ruleCode: vatRef.ruleCode || '',
                        rate: vatRef.configuredRate,
                        effectiveFrom: vatRef.effectiveFrom ? new Date(vatRef.effectiveFrom) : new Date(snapshot.transactionDate)
                    }
                    : null
            });
            if (!applicability.direction)
                return null;
            const existing = yield IndividualVatRecord_1.IndividualVatRecord.findOne({
                companyId: snapshot.companyId,
                sourceType: snapshot.sourceType,
                sourceId: snapshot.sourceId,
                direction: applicability.direction,
                recordKind: 'ORIGINAL'
            });
            if (existing)
                return existing;
            try {
                yield assertPeriodAllowsVat(snapshot);
            }
            catch (error) {
                if (Number(error === null || error === void 0 ? void 0 : error.statusCode) === 409) {
                    yield writeAudit(String(snapshot.companyId), 'VAT_REVIEW_REQUIRED', String(snapshot.sourceId), 'VAT period is closed', {
                        taxPeriodKey: snapshot.taxPeriodKey,
                        reason: 'TAX_PERIOD_CLOSED'
                    });
                    throw error;
                }
                throw error;
            }
            const source = yield loadSource(snapshot);
            const method = (0, individualVatCalculation_1.resolveCalculationMethod)({
                direction: applicability.direction,
                vatMode: source === null || source === void 0 ? void 0 : source.vatMode,
                vatIncluded: source === null || source === void 0 ? void 0 : source.vatIncluded
            });
            const calc = (0, individualVatCalculation_1.calculateIndividualVat)({
                direction: applicability.direction,
                treatment: applicability.treatment,
                amount: Number((source === null || source === void 0 ? void 0 : source.amount) || 0),
                vatRatePercent: applicability.configuredRate,
                method,
                inputVatEligibility: source === null || source === void 0 ? void 0 : source.inputVatEligibility,
                supplierVatNumber: source === null || source === void 0 ? void 0 : source.supplierVatNumber,
                invoiceNumber: source === null || source === void 0 ? void 0 : source.invoiceNumber
            });
            const reviewReasons = Array.from(new Set([...(applicability.reviewReasons || []), ...(calc.reviewReasons || [])]));
            const calculationStatus = reviewReasons.length && calc.calculationStatus === 'CALCULATED'
                ? 'REVIEW_REQUIRED'
                : calc.calculationStatus === 'CALCULATED' && applicability.reviewRequired
                    ? 'REVIEW_REQUIRED'
                    : calc.calculationStatus;
            try {
                const created = yield IndividualVatRecord_1.IndividualVatRecord.create({
                    companyId: snapshot.companyId,
                    propertyId: snapshot.propertyId || null,
                    sourceType: snapshot.sourceType,
                    sourceId: snapshot.sourceId,
                    snapshotId: snapshot._id,
                    taxPeriodId: snapshot.taxPeriodId || null,
                    taxPeriodKey: snapshot.taxPeriodKey,
                    taxType: 'VAT',
                    direction: applicability.direction,
                    recordKind: 'ORIGINAL',
                    treatment: applicability.treatment,
                    applicabilityReason: applicability.reason,
                    grossAmount: calc.grossAmount,
                    netAmount: calc.netAmount,
                    taxableAmount: calc.taxableAmount,
                    vatRate: calc.vatRate,
                    vatAmount: calc.vatAmount,
                    chargedVatAmount: calc.chargedVatAmount,
                    recoverableVatAmount: calc.recoverableVatAmount,
                    inputVatEligibility: calc.inputVatEligibility,
                    calculationMethod: calc.calculationMethod,
                    calculationStatus,
                    reviewReasons,
                    taxRuleId: applicability.ruleId,
                    taxRuleVersion: applicability.ruleVersion,
                    taxRuleCode: applicability.ruleCode,
                    taxRuleEffectiveFrom: applicability.effectiveFrom,
                    currency: (source === null || source === void 0 ? void 0 : source.currency) || 'USD',
                    baseCurrency: (source === null || source === void 0 ? void 0 : source.currency) || 'USD',
                    baseAmount: calc.grossAmount,
                    exchangeRate: (_c = source === null || source === void 0 ? void 0 : source.exchangeRate) !== null && _c !== void 0 ? _c : 1,
                    exchangeRateDate: (source === null || source === void 0 ? void 0 : source.exchangeRateDate) || snapshot.transactionDate,
                    supplier: source === null || source === void 0 ? void 0 : source.supplier,
                    supplierTin: source === null || source === void 0 ? void 0 : source.supplierTin,
                    supplierVatNumber: source === null || source === void 0 ? void 0 : source.supplierVatNumber,
                    invoiceNumber: source === null || source === void 0 ? void 0 : source.invoiceNumber,
                    counterpartyName: source === null || source === void 0 ? void 0 : source.counterpartyName,
                    incomeTaxAmount: null,
                    presumptiveTaxAmount: null,
                    calculatedAt: new Date(),
                    calculatedBy: classifiedBy && mongoose_1.default.Types.ObjectId.isValid(classifiedBy) ? asObjectId(classifiedBy) : null
                });
                const event = calculationStatus === 'REVIEW_REQUIRED' ? 'VAT_REVIEW_REQUIRED' : calculationStatus === 'NOT_APPLICABLE' ? 'VAT_CALCULATED' : 'VAT_CALCULATED';
                yield writeAudit(String(snapshot.companyId), event, String(snapshot.sourceId), `VAT ${applicability.direction} ${calculationStatus}`, {
                    vatAmount: calc.vatAmount,
                    treatment: applicability.treatment,
                    taxRuleVersion: applicability.ruleVersion
                });
                return created;
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                    return IndividualVatRecord_1.IndividualVatRecord.findOne({
                        companyId: snapshot.companyId,
                        sourceType: snapshot.sourceType,
                        sourceId: snapshot.sourceId,
                        direction: applicability.direction,
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
                logger_1.logger.warn('Individual VAT calculation failed after accounting success', {
                    sourceId: String(snapshot.sourceId),
                    message: (error === null || error === void 0 ? void 0 : error.message) || error
                });
                yield writeAudit(String(snapshot.companyId), 'VAT_FAILED', String(snapshot.sourceId), (error === null || error === void 0 ? void 0 : error.message) || 'VAT calculation failed', {
                    accountingStatus: 'ACCOUNTING_SUCCESS',
                    vatStatus: 'VAT_FAILED'
                }).catch(() => undefined);
            }
        });
    },
    reverseForSource(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const original = yield IndividualVatRecord_1.IndividualVatRecord.findOne({
                companyId: asObjectId(input.companyId),
                sourceType: input.sourceType,
                sourceId: asObjectId(input.sourceId),
                recordKind: 'ORIGINAL'
            });
            if (!original)
                return null;
            const existing = yield IndividualVatRecord_1.IndividualVatRecord.findOne({
                companyId: original.companyId,
                sourceType: original.sourceType,
                sourceId: original.sourceId,
                direction: original.direction,
                recordKind: 'REVERSAL'
            });
            if (existing)
                return existing;
            try {
                yield assertPeriodAllowsVat({
                    taxPeriodId: original.taxPeriodId,
                    taxPeriodKey: original.taxPeriodKey
                });
            }
            catch (error) {
                if (Number(error === null || error === void 0 ? void 0 : error.statusCode) === 409)
                    throw error;
            }
            const created = yield IndividualVatRecord_1.IndividualVatRecord.create({
                companyId: original.companyId,
                propertyId: original.propertyId,
                sourceType: original.sourceType,
                sourceId: original.sourceId,
                snapshotId: original.snapshotId,
                taxPeriodId: original.taxPeriodId,
                taxPeriodKey: original.taxPeriodKey,
                taxType: 'VAT',
                direction: original.direction,
                recordKind: 'REVERSAL',
                reversalOf: original._id,
                reversalReason: input.reason || 'Accounting reversal',
                reversalDate: new Date(),
                reversalTransactionId: input.reversalTransactionId || null,
                treatment: original.treatment,
                applicabilityReason: original.applicabilityReason,
                grossAmount: original.grossAmount == null ? null : (0, money_1.roundMoney)(-Number(original.grossAmount)),
                netAmount: original.netAmount == null ? null : (0, money_1.roundMoney)(-Number(original.netAmount)),
                taxableAmount: original.taxableAmount == null ? null : (0, money_1.roundMoney)(-Number(original.taxableAmount)),
                vatRate: original.vatRate,
                vatAmount: original.vatAmount == null ? null : (0, money_1.roundMoney)(-Number(original.vatAmount)),
                chargedVatAmount: original.chargedVatAmount == null ? null : (0, money_1.roundMoney)(-Number(original.chargedVatAmount)),
                recoverableVatAmount: original.recoverableVatAmount == null ? null : (0, money_1.roundMoney)(-Number(original.recoverableVatAmount)),
                inputVatEligibility: original.inputVatEligibility,
                calculationMethod: original.calculationMethod,
                calculationStatus: original.calculationStatus,
                reviewReasons: original.reviewReasons,
                taxRuleId: original.taxRuleId,
                taxRuleVersion: original.taxRuleVersion,
                taxRuleCode: original.taxRuleCode,
                taxRuleEffectiveFrom: original.taxRuleEffectiveFrom,
                currency: original.currency,
                baseCurrency: original.baseCurrency,
                baseAmount: original.baseAmount == null ? null : (0, money_1.roundMoney)(-Number(original.baseAmount)),
                exchangeRate: original.exchangeRate,
                exchangeRateDate: original.exchangeRateDate,
                supplier: original.supplier,
                supplierTin: original.supplierTin,
                supplierVatNumber: original.supplierVatNumber,
                invoiceNumber: original.invoiceNumber,
                counterpartyName: original.counterpartyName,
                incomeTaxAmount: null,
                presumptiveTaxAmount: null,
                calculatedAt: new Date(),
                calculatedBy: input.userId && mongoose_1.default.Types.ObjectId.isValid(input.userId) ? asObjectId(input.userId) : null
            });
            yield writeAudit(input.companyId, 'VAT_REVERSED', input.sourceId, 'VAT reversal posted; original preserved', {
                originalId: String(original._id),
                reversalId: String(created._id)
            });
            return created;
        });
    },
    safeReverseForSource(input) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.reverseForSource(input);
            }
            catch (error) {
                logger_1.logger.warn('Individual VAT reversal failed', { sourceId: input.sourceId, message: (error === null || error === void 0 ? void 0 : error.message) || error });
            }
        });
    },
    workingPaper(companyId, periodKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const company = yield Company_1.Company.findById(companyId).select('name tin taxProfile').lean();
            const query = { companyId: asObjectId(companyId) };
            if (periodKey)
                query.taxPeriodKey = periodKey;
            const records = yield IndividualVatRecord_1.IndividualVatRecord.find(query).sort({ calculatedAt: 1 }).lean();
            const outputRows = records.filter((row) => row.direction === 'OUTPUT');
            const inputRows = records.filter((row) => row.direction === 'INPUT');
            const outputVat = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(outputRows, (row) => row.vatAmount);
            const inputVat = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(inputRows, (row) => { var _a; return (_a = row.recoverableVatAmount) !== null && _a !== void 0 ? _a : row.vatAmount; });
            const adjustments = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(records.filter((row) => row.recordKind !== 'ORIGINAL'), (row) => row.vatAmount);
            const reviewItems = records.filter((row) => row.calculationStatus === 'REVIEW_REQUIRED' || (row.reviewReasons || []).length);
            const taxProfile = (company === null || company === void 0 ? void 0 : company.taxProfile) || {};
            return {
                disclaimer: 'VAT working paper for preparation support. Mantis does not file ZIMRA returns and is not ZIMRA-certified.',
                taxpayer: {
                    name: (company === null || company === void 0 ? void 0 : company.name) || '',
                    tin: (company === null || company === void 0 ? void 0 : company.tin) || taxProfile.tin || '',
                    vatNumber: taxProfile.vatNumber || '',
                    vatRegistered: Boolean(taxProfile.vatRegistered)
                },
                taxPeriod: periodKey || 'ALL',
                vatRegistrationStatus: taxProfile.vatRegistered ? 'REGISTERED' : 'NOT_REGISTERED',
                outputVat,
                inputVat,
                adjustments,
                netVatPosition: (0, taxAmountAggregation_1.netFromNullable)(outputVat, inputVat),
                incomeTaxAmount: null,
                presumptiveTaxAmount: null,
                transactions: records.map((row) => toApi(row)),
                reviewItems: reviewItems.map((row) => ({
                    id: String(row._id),
                    sourceId: String(row.sourceId),
                    sourceType: row.sourceType,
                    reasons: row.reviewReasons || [],
                    calculationStatus: row.calculationStatus,
                    vatAmount: row.vatAmount
                }))
            };
        });
    },
    overview(companyId, periodKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const paper = yield this.workingPaper(companyId, periodKey);
            return {
                currentPeriod: paper.taxPeriod,
                vatRegistered: paper.vatRegistrationStatus,
                outputVat: paper.outputVat,
                inputVat: paper.inputVat,
                netVatPosition: paper.netVatPosition,
                reviewItems: paper.reviewItems.length,
                incomeTaxAmount: null,
                presumptiveTaxAmount: null
            };
        });
    },
    transactions(companyId_1) {
        return __awaiter(this, arguments, void 0, function* (companyId, filters = {}) {
            const query = { companyId: asObjectId(companyId) };
            if (filters.periodKey)
                query.taxPeriodKey = filters.periodKey;
            if (filters.direction === 'INPUT' || filters.direction === 'OUTPUT')
                query.direction = filters.direction;
            if (filters.status)
                query.calculationStatus = filters.status;
            const rows = yield IndividualVatRecord_1.IndividualVatRecord.find(query).sort({ calculatedAt: -1 }).limit(500).lean();
            return rows.map((row) => toApi(row));
        });
    },
    reviewQueue(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = yield IndividualVatRecord_1.IndividualVatRecord.find({
                companyId: asObjectId(companyId),
                $or: [{ calculationStatus: 'REVIEW_REQUIRED' }, { reviewReasons: { $exists: true, $ne: [] } }]
            })
                .sort({ calculatedAt: -1 })
                .limit(200)
                .lean();
            return rows.map((row) => ({
                id: String(row._id),
                sourceType: row.sourceType,
                sourceId: String(row.sourceId),
                taxPeriodKey: row.taxPeriodKey,
                reasons: row.reviewReasons || [],
                calculationStatus: row.calculationStatus,
                vatAmount: row.vatAmount
            }));
        });
    },
    reconcile(companyId, periodKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const paper = yield this.workingPaper(companyId, periodKey);
            const findings = [];
            const records = paper.transactions;
            const outputSum = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(records.filter((row) => row.direction === 'OUTPUT'), (row) => row.vatAmount);
            const inputSum = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(records.filter((row) => row.direction === 'INPUT'), (row) => { var _a; return (_a = row.recoverableVatAmount) !== null && _a !== void 0 ? _a : row.vatAmount; });
            if (outputSum !== paper.outputVat || inputSum !== paper.inputVat) {
                findings.push({ issueType: 'VAT_AMOUNT_MISMATCH', reason: 'Working paper totals do not equal VAT record sums' });
            }
            const sourceIds = records.filter((row) => row.recordKind !== 'REVERSAL').map((row) => row.sourceId);
            const dup = sourceIds.filter((id, index) => sourceIds.indexOf(id) !== index);
            for (const id of Array.from(new Set(dup))) {
                findings.push({ issueType: 'SOURCE_WITH_DUPLICATE_VAT', reason: 'More than one original VAT record for the same source', sourceId: id });
            }
            for (const row of records) {
                if (row.snapshotId) {
                    const snapshot = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.findById(row.snapshotId).select('taxPeriodKey taxProfileSnapshot taxRuleReferences').lean();
                    if (!snapshot)
                        findings.push({ issueType: 'VAT_RECORD_WITHOUT_SOURCE', reason: 'VAT record snapshot is missing', sourceId: row.sourceId });
                    else {
                        if (snapshot.taxPeriodKey !== row.taxPeriodKey) {
                            findings.push({ issueType: 'VAT_PERIOD_MISMATCH', reason: 'VAT record period differs from snapshot', sourceId: row.sourceId });
                        }
                        const rule = (snapshot.taxRuleReferences || []).find((ref) => ref.taxType === 'VAT');
                        if (row.taxRuleVersion != null && (rule === null || rule === void 0 ? void 0 : rule.ruleVersion) != null && Number(rule.ruleVersion) !== Number(row.taxRuleVersion)) {
                            findings.push({ issueType: 'VAT_RULE_MISMATCH', reason: 'VAT record rule version differs from snapshot', sourceId: row.sourceId });
                        }
                    }
                }
                if (row.currency && row.baseCurrency && row.currency !== row.baseCurrency && row.exchangeRate == null) {
                    findings.push({ issueType: 'VAT_CURRENCY_MISMATCH', reason: 'Currency conversion basis is missing', sourceId: row.sourceId });
                }
            }
            return {
                detectionOnly: true,
                noAutomaticRepair: true,
                workingPaper: { outputVat: paper.outputVat, inputVat: paper.inputVat, netVatPosition: paper.netVatPosition },
                recordTotals: { outputVat: outputSum, inputVat: inputSum },
                findings
            };
        });
    },
    exportWorkingPaper(companyId, periodKey, format) {
        return __awaiter(this, void 0, void 0, function* () {
            const paper = yield this.workingPaper(companyId, periodKey);
            const rows = paper.transactions.map((row) => ({
                taxpayer: paper.taxpayer.name,
                tin: paper.taxpayer.tin,
                vatNumber: paper.taxpayer.vatNumber,
                taxPeriod: paper.taxPeriod,
                propertyId: row.propertyId,
                transaction: row.sourceId,
                sourceType: row.sourceType,
                direction: row.direction,
                treatment: row.treatment,
                net: row.netAmount,
                vatRate: row.vatRate,
                vat: row.vatAmount,
                rule: row.taxRuleCode,
                sourceReference: row.invoiceNumber
            }));
            if (format === 'csv') {
                const headers = Object.keys(rows[0] || { taxpayer: '', tin: '', vatNumber: '', taxPeriod: '' });
                const body = [
                    headers.join(','),
                    ...rows.map((row) => headers.map((header) => { var _a; return JSON.stringify((_a = row[header]) !== null && _a !== void 0 ? _a : ''); }).join(','))
                ].join('\n');
                return { contentType: 'text/csv', body };
            }
            if (format === 'xlsx' || format === 'excel') {
                return {
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    body: (0, xlsxWorkbook_1.buildXlsxWorkbook)('VAT working paper', rows.length ? rows : [{ taxpayer: paper.taxpayer.name, taxPeriod: paper.taxPeriod }]),
                    filename: `vat-working-paper-${paper.taxPeriod}.xlsx`
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
                for (const piece of wrap(String(text || ''), size <= 8 ? 108 : 92)) {
                    if (y < 40) {
                        page = pdf.addPage([595, 842]);
                        y = 800;
                    }
                    page.drawText(piece, { x: 40, y, size, font: useBold ? bold : font });
                    y -= size <= 8 ? 12 : 14;
                }
            };
            line('VAT WORKING PAPER', 16, true);
            line(paper.disclaimer, 8);
            line(`Taxpayer: ${paper.taxpayer.name}  TIN: ${paper.taxpayer.tin}  VAT: ${paper.taxpayer.vatNumber}`);
            line(`Period: ${paper.taxPeriod}  Registered: ${paper.vatRegistrationStatus}`);
            line(`Output VAT ${paper.outputVat == null ? 'not calculated' : paper.outputVat}  Input VAT ${paper.inputVat == null ? 'not calculated' : paper.inputVat}  Net ${paper.netVatPosition == null ? 'not calculated' : paper.netVatPosition}`, 11, true);
            for (const row of rows) {
                line(`${row.direction} ${row.treatment} net=${row.net} vat=${row.vat} ${row.transaction}`);
            }
            return { contentType: 'application/pdf', body: Buffer.from(yield pdf.save()) };
        });
    }
};
exports.default = exports.individualVatService;
