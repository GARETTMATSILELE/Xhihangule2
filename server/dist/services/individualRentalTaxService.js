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
exports.individualRentalTaxService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const pdf_lib_1 = require("pdf-lib");
const IndividualRentalTaxRecord_1 = require("../models/IndividualRentalTaxRecord");
const IndividualRentalTaxPayment_1 = require("../models/IndividualRentalTaxPayment");
const TransactionTaxSnapshot_1 = require("../models/TransactionTaxSnapshot");
const Payment_1 = require("../models/Payment");
const LandlordFinancialTransaction_1 = require("../models/LandlordFinancialTransaction");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const TaxPeriod_1 = require("../models/TaxPeriod");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const taxPeriodService_1 = require("./taxPeriodService");
const individualRentalTaxApplicability_1 = require("./individualRentalTaxApplicability");
const individualRentalTaxBase_1 = require("./individualRentalTaxBase");
const individualRentalTaxCalculation_1 = require("./individualRentalTaxCalculation");
const xlsxWorkbook_1 = require("../utils/xlsxWorkbook");
const money_1 = require("../utils/money");
const taxAmountAggregation_1 = require("./tax/taxAmountAggregation");
const rentalTaxTypes_1 = require("./tax/rentalTaxTypes");
const DISCLAIMER = 'This report presents rental-tax calculations based on the taxpayer information, transaction records and configured Zimbabwe tax rules available in Mantis. It is a tax working paper and does not constitute tax advice or confirmation of a ZIMRA-assessed liability.';
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
        rentalTaxRegime: doc.rentalTaxRegime,
        applicabilityStatus: doc.applicabilityStatus,
        applicabilityReason: doc.applicabilityReason,
        grossRentalAmount: doc.grossRentalAmount,
        excludedAmount: doc.excludedAmount,
        taxableRentalBase: doc.taxableRentalBase,
        taxRate: doc.taxRate,
        taxAmount: doc.taxAmount,
        calculationMethod: doc.calculationMethod,
        calculationStatus: doc.calculationStatus,
        reviewStatus: doc.reviewStatus,
        reviewReason: doc.reviewReason || null,
        reviewReasons: doc.reviewReasons || [],
        taxRuleId: doc.taxRuleId || null,
        taxRuleVersion: (_a = doc.taxRuleVersion) !== null && _a !== void 0 ? _a : null,
        taxRuleCode: doc.taxRuleCode || null,
        sourceReference: doc.sourceReference || null,
        currency: doc.currency,
        transactionCurrency: doc.transactionCurrency,
        baseCurrency: doc.baseCurrency,
        exchangeRate: doc.exchangeRate,
        exchangeRateDate: doc.exchangeRateDate,
        incomeTaxAmount: null,
        vatAmount: null
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
            sourceModule: 'individual_rental_tax',
            sourceId,
            success: !String(eventType).includes('FAILED'),
            message,
            metadata
        });
    });
}
function assertPeriodAllowsRentalTax(period) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(period === null || period === void 0 ? void 0 : period.taxPeriodId))
            return;
        const row = yield TaxPeriod_1.TaxPeriod.findById(period.taxPeriodId).select('status taxType periodKey');
        if (!row)
            return;
        if ((0, taxPeriodService_1.assignmentStatusForExistingPeriod)(row.status) === 'PERIOD_CLOSED') {
            throw new errorHandler_1.AppError(`Rental tax period ${row.periodKey} is ${row.status}. Corrections require an amendment.`, 409);
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
            return {
                amount: Number(payment.amount || 0),
                rentAllocated: (_c = (_a = payment.rentAllocated) !== null && _a !== void 0 ? _a : (_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.ownerAmount) !== null && _c !== void 0 ? _c : null,
                levyAllocated: (_d = payment.levyAllocated) !== null && _d !== void 0 ? _d : 0,
                depositAmount: Number(payment.depositAmount || 0),
                category: snapshot.sourceKind === 'PAYMENT_RENT' ? 'RENTAL_INCOME' : 'TENANT_DEPOSIT',
                currency: String(payment.currency || 'USD'),
                exchangeRate: (_e = payment.exchangeRate) !== null && _e !== void 0 ? _e : 1,
                exchangeRateDate: payment.paymentDate || null
            };
        }
        const entry = yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.findById(snapshot.sourceId).lean();
        if (!entry)
            return null;
        return {
            amount: Number(entry.amount || 0),
            rentAllocated: null,
            levyAllocated: 0,
            depositAmount: 0,
            category: entry.category || null,
            currency: String(entry.currency || 'USD'),
            exchangeRate: 1,
            exchangeRateDate: entry.date || null
        };
    });
}
function reviewStatusOf(calculationStatus, reviewReasons) {
    if (calculationStatus === 'REVIEW_REQUIRED' || calculationStatus === 'PERIOD_REQUIRED' || reviewReasons.length) {
        return 'REVIEW_REQUIRED';
    }
    if (calculationStatus === 'NOT_APPLICABLE')
        return 'NOT_APPLICABLE';
    if (calculationStatus === 'CALCULATED')
        return 'CALCULATED';
    return calculationStatus;
}
exports.individualRentalTaxService = {
    toApi,
    postForSnapshot(snapshot, classifiedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (snapshot.sourceKind === 'PAYMENT_DEPOSIT' || snapshot.sourceKind === 'LIABILITY') {
                return null;
            }
            if (snapshot.sourceKind !== 'PAYMENT_RENT' && snapshot.sourceKind !== 'OTHER_INCOME') {
                return null;
            }
            const existing = yield IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.findOne({
                companyId: snapshot.companyId,
                sourceType: snapshot.sourceType,
                sourceId: snapshot.sourceId,
                taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
                recordKind: 'ORIGINAL'
            });
            if (existing)
                return existing;
            const rentalRef = (snapshot.taxRuleReferences || []).find((row) => row.taxType === 'PRESUMPTIVE_RENTAL_INCOME_TAX');
            const profile = snapshot.taxProfileSnapshot;
            const applicability = (0, individualRentalTaxApplicability_1.evaluateIndividualRentalTaxApplicability)({
                sourceKind: snapshot.sourceKind,
                rentalTaxRegime: snapshot.rentalTaxRegime || (profile === null || profile === void 0 ? void 0 : profile.rentalTaxRegime),
                rentalTaxTreatment: snapshot.rentalTaxTreatment || (profile === null || profile === void 0 ? void 0 : profile.rentalTaxTreatment),
                propertyUseClass: profile === null || profile === void 0 ? void 0 : profile.propertyUseClass,
                profileSnapshotPresent: Boolean(profile),
                transactionDate: snapshot.transactionDate,
                rentalTaxRule: rentalRef
                    ? {
                        id: rentalRef.ruleId || '',
                        version: rentalRef.ruleVersion || 1,
                        ruleCode: rentalRef.ruleCode || '',
                        rate: rentalRef.configuredRate,
                        calculationMethod: 'GROSS_RENTAL_PERCENT',
                        sourceReference: rentalRef.sourceReference || '',
                        effectiveFrom: rentalRef.effectiveFrom ? new Date(rentalRef.effectiveFrom) : new Date(snapshot.transactionDate),
                        effectiveTo: null
                    }
                    : null
            });
            const period = yield (0, taxPeriodService_1.resolveTaxPeriod)({
                companyId: String(snapshot.companyId),
                taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
                transactionDate: snapshot.transactionDate
            });
            try {
                yield assertPeriodAllowsRentalTax({
                    taxPeriodId: period.taxPeriodId,
                    taxPeriodKey: period.periodKey,
                    status: period.status === 'PERIOD_REQUIRED' ? undefined : period.status
                });
            }
            catch (error) {
                if (Number(error === null || error === void 0 ? void 0 : error.statusCode) === 409) {
                    yield writeAudit(String(snapshot.companyId), 'RENTAL_TAX_REVIEW_REQUIRED', String(snapshot.sourceId), 'Rental tax period is closed', {
                        taxPeriodKey: period.periodKey,
                        reason: 'TAX_PERIOD_CLOSED'
                    });
                    throw error;
                }
                throw error;
            }
            const source = yield loadSource(snapshot);
            if (!source && snapshot.sourceKind === 'PAYMENT_RENT') {
                yield writeAudit(String(snapshot.companyId), 'RENTAL_TAX_REVIEW_REQUIRED', String(snapshot.sourceId), 'Source transaction missing', {
                    reason: 'TRANSACTION_CLASSIFICATION_INCOMPLETE'
                });
            }
            const taxBase = (0, individualRentalTaxBase_1.resolveRentalTaxBase)({
                sourceKind: snapshot.sourceKind,
                calculationMethod: applicability.calculationMethod || 'GROSS_RENTAL_PERCENT',
                amount: source === null || source === void 0 ? void 0 : source.amount,
                rentAllocated: source === null || source === void 0 ? void 0 : source.rentAllocated,
                levyAllocated: source === null || source === void 0 ? void 0 : source.levyAllocated,
                depositAmount: source === null || source === void 0 ? void 0 : source.depositAmount,
                category: source === null || source === void 0 ? void 0 : source.category
            });
            const calc = (0, individualRentalTaxCalculation_1.calculateIndividualRentalTax)({
                applicability,
                taxBase,
                periodAssignmentStatus: period.assignmentStatus
            });
            const reviewReasons = Array.from(new Set([...(applicability.reviewReasons || []), ...(taxBase.reviewReasons || []), ...(calc.reviewReasons || [])]));
            const reviewStatus = reviewStatusOf(calc.calculationStatus, reviewReasons);
            try {
                const created = yield IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.create({
                    companyId: snapshot.companyId,
                    ownerId: classifiedBy && mongoose_1.default.Types.ObjectId.isValid(classifiedBy) ? asObjectId(classifiedBy) : null,
                    propertyId: snapshot.propertyId || null,
                    sourceType: snapshot.sourceType,
                    sourceId: snapshot.sourceId,
                    snapshotId: snapshot._id,
                    taxPeriodId: period.taxPeriodId,
                    taxPeriodKey: period.periodKey,
                    taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
                    recordKind: 'ORIGINAL',
                    rentalTaxRegime: (0, rentalTaxTypes_1.normalizeRentalTaxRegime)(snapshot.rentalTaxRegime || (profile === null || profile === void 0 ? void 0 : profile.rentalTaxRegime)),
                    applicabilityStatus: applicability.status,
                    applicabilityReason: applicability.reason,
                    grossRentalAmount: calc.grossRentalAmount,
                    excludedAmount: calc.excludedAmount,
                    taxableRentalBase: calc.taxableRentalBase,
                    taxRate: calc.taxRate,
                    taxAmount: calc.taxAmount,
                    currency: (source === null || source === void 0 ? void 0 : source.currency) || 'USD',
                    transactionCurrency: (source === null || source === void 0 ? void 0 : source.currency) || 'USD',
                    baseCurrency: (source === null || source === void 0 ? void 0 : source.currency) || 'USD',
                    baseAmount: calc.taxableRentalBase,
                    exchangeRate: (_a = source === null || source === void 0 ? void 0 : source.exchangeRate) !== null && _a !== void 0 ? _a : 1,
                    exchangeRateDate: (source === null || source === void 0 ? void 0 : source.exchangeRateDate) || snapshot.transactionDate,
                    taxRuleId: calc.taxRuleId,
                    taxRuleVersion: calc.taxRuleVersion,
                    taxRuleCode: calc.taxRuleCode,
                    taxRuleEffectiveFrom: applicability.effectiveFrom,
                    sourceReference: calc.sourceReference,
                    calculationMethod: calc.calculationMethod,
                    calculationStatus: calc.calculationStatus,
                    reviewStatus,
                    reviewReason: reviewReasons[0] || null,
                    reviewReasons,
                    incomeTaxAmount: null,
                    vatAmount: null,
                    calculatedAt: new Date(),
                    calculatedBy: classifiedBy && mongoose_1.default.Types.ObjectId.isValid(classifiedBy) ? asObjectId(classifiedBy) : null
                });
                const event = calc.calculationStatus === 'REVIEW_REQUIRED' || calc.calculationStatus === 'PERIOD_REQUIRED'
                    ? 'RENTAL_TAX_REVIEW_REQUIRED'
                    : 'RENTAL_TAX_CALCULATED';
                yield writeAudit(String(snapshot.companyId), event, String(snapshot.sourceId), `Rental tax ${calc.calculationStatus}`, {
                    taxAmount: calc.taxAmount,
                    taxRuleVersion: calc.taxRuleVersion,
                    rentalTaxRegime: snapshot.rentalTaxRegime
                });
                return created;
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                    return IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.findOne({
                        companyId: snapshot.companyId,
                        sourceType: snapshot.sourceType,
                        sourceId: snapshot.sourceId,
                        taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
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
                logger_1.logger.warn('Individual rental tax calculation failed after accounting success', {
                    sourceId: String(snapshot.sourceId),
                    message: (error === null || error === void 0 ? void 0 : error.message) || error
                });
                yield writeAudit(String(snapshot.companyId), 'RENTAL_TAX_REVIEW_REQUIRED', String(snapshot.sourceId), (error === null || error === void 0 ? void 0 : error.message) || 'Rental tax calculation failed', { accountingStatus: 'ACCOUNTING_SUCCESS', reason: 'CALCULATION_FAILED' }).catch(() => undefined);
            }
        });
    },
    reverseForSource(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const original = yield IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.findOne({
                companyId: asObjectId(input.companyId),
                sourceType: input.sourceType,
                sourceId: asObjectId(input.sourceId),
                recordKind: 'ORIGINAL'
            });
            if (!original)
                return null;
            const existing = yield IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.findOne({
                companyId: original.companyId,
                sourceType: original.sourceType,
                sourceId: original.sourceId,
                taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
                recordKind: 'REVERSAL'
            });
            if (existing)
                return existing;
            try {
                yield assertPeriodAllowsRentalTax({
                    taxPeriodId: original.taxPeriodId,
                    taxPeriodKey: original.taxPeriodKey
                });
            }
            catch (error) {
                if (Number(error === null || error === void 0 ? void 0 : error.statusCode) === 409)
                    throw error;
            }
            const created = yield IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.create({
                companyId: original.companyId,
                ownerId: original.ownerId,
                propertyId: original.propertyId,
                sourceType: original.sourceType,
                sourceId: original.sourceId,
                snapshotId: original.snapshotId,
                taxPeriodId: original.taxPeriodId,
                taxPeriodKey: original.taxPeriodKey,
                taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
                recordKind: 'REVERSAL',
                reversalOf: original._id,
                reversalReason: input.reason || 'Accounting reversal',
                reversalDate: new Date(),
                reversalTransactionId: input.reversalTransactionId || null,
                rentalTaxRegime: original.rentalTaxRegime,
                applicabilityStatus: original.applicabilityStatus,
                applicabilityReason: original.applicabilityReason,
                grossRentalAmount: original.grossRentalAmount == null ? null : (0, money_1.roundMoney)(-Number(original.grossRentalAmount)),
                excludedAmount: original.excludedAmount == null ? null : (0, money_1.roundMoney)(-Number(original.excludedAmount)),
                taxableRentalBase: original.taxableRentalBase == null ? null : (0, money_1.roundMoney)(-Number(original.taxableRentalBase)),
                taxRate: original.taxRate,
                taxAmount: original.taxAmount == null ? null : (0, money_1.roundMoney)(-Number(original.taxAmount)),
                currency: original.currency,
                transactionCurrency: original.transactionCurrency,
                baseCurrency: original.baseCurrency,
                baseAmount: original.baseAmount == null ? null : (0, money_1.roundMoney)(-Number(original.baseAmount)),
                exchangeRate: original.exchangeRate,
                exchangeRateDate: original.exchangeRateDate,
                taxRuleId: original.taxRuleId,
                taxRuleVersion: original.taxRuleVersion,
                taxRuleCode: original.taxRuleCode,
                taxRuleEffectiveFrom: original.taxRuleEffectiveFrom,
                sourceReference: original.sourceReference,
                calculationMethod: original.calculationMethod,
                calculationStatus: 'REVERSED',
                reviewStatus: original.reviewStatus,
                reviewReason: original.reviewReason,
                reviewReasons: original.reviewReasons,
                incomeTaxAmount: null,
                vatAmount: null,
                calculatedAt: new Date(),
                calculatedBy: input.userId && mongoose_1.default.Types.ObjectId.isValid(input.userId) ? asObjectId(input.userId) : null
            });
            yield writeAudit(input.companyId, 'RENTAL_TAX_REVERSED', input.sourceId, 'Rental tax reversal posted; original preserved', {
                originalId: String(original._id),
                reversalId: String(created._id)
            });
            yield writeAudit(input.companyId, 'RENTAL_TAX_AMENDED', input.sourceId, 'Replacement rental-tax path requires a new source transaction', {
                originalId: String(original._id)
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
                logger_1.logger.warn('Individual rental tax reversal failed', { sourceId: input.sourceId, message: (error === null || error === void 0 ? void 0 : error.message) || error });
            }
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
                    taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX'
                });
                if (!period)
                    throw new errorHandler_1.AppError('Rental tax period not found', 404);
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
            const created = yield IndividualRentalTaxPayment_1.IndividualRentalTaxPayment.create({
                companyId: asObjectId(input.companyId),
                ownerId: asObjectId(input.userId),
                propertyId: input.propertyId ? asObjectId(input.propertyId) : null,
                taxPeriodId: periodId,
                taxPeriodKey: periodKey,
                taxType: 'PRESUMPTIVE_RENTAL_INCOME_TAX',
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
            const reasons = [];
            if (!String(input.paymentReference || '').trim() && !String(input.zimraReference || '').trim()) {
                reasons.push('TAX_PAYMENT_MISSING_REFERENCE');
            }
            yield writeAudit(input.companyId, 'RENTAL_TAX_PAYMENT_RECORDED', String(created._id), 'Landlord-recorded rental tax payment', {
                amount: created.amount,
                taxPeriodKey: periodKey,
                zimraConfirmed: false,
                reviewReasons: reasons
            });
            return Object.assign(Object.assign({}, paymentToApi(created)), { reviewReasons: reasons });
        });
    },
    workingPaper(companyId, periodKey) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const company = yield Company_1.Company.findById(companyId).select('name tin taxProfile').lean();
            const query = { companyId: asObjectId(companyId) };
            if (periodKey)
                query.taxPeriodKey = periodKey;
            const records = yield IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.find(query).sort({ calculatedAt: 1 }).lean();
            const payments = yield IndividualRentalTaxPayment_1.IndividualRentalTaxPayment.find(Object.assign({ companyId: asObjectId(companyId), status: 'POSTED' }, (periodKey ? { taxPeriodKey: periodKey } : {})))
                .sort({ paymentDate: 1 })
                .lean();
            const calculatedTax = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(records, (row) => row.taxAmount);
            const taxPayments = (0, money_1.roundMoney)(payments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
            const gross = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(records, (row) => row.grossRentalAmount);
            const excluded = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(records, (row) => row.excludedAmount);
            const base = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(records, (row) => row.taxableRentalBase);
            const reviewItems = records.filter((row) => row.calculationStatus === 'REVIEW_REQUIRED' || row.calculationStatus === 'PERIOD_REQUIRED' || (row.reviewReasons || []).length);
            const taxProfile = (company === null || company === void 0 ? void 0 : company.taxProfile) || {};
            const rate = (_b = (_a = records.find((row) => row.taxRate != null)) === null || _a === void 0 ? void 0 : _a.taxRate) !== null && _b !== void 0 ? _b : null;
            const regime = ((_c = records.find((row) => row.rentalTaxRegime)) === null || _c === void 0 ? void 0 : _c.rentalTaxRegime) || taxProfile.rentalTaxRegime || 'ACCOUNTANT_REVIEW';
            const properties = Array.from(new Set(records.map((row) => String(row.propertyId || '')).filter(Boolean)));
            const propertyDocs = properties.length
                ? yield Property_1.Property.find({ _id: { $in: properties }, companyId: asObjectId(companyId) }).select('name address').lean()
                : [];
            const propertyName = (id) => { var _a; return ((_a = propertyDocs.find((row) => String(row._id) === id)) === null || _a === void 0 ? void 0 : _a.name) || id; };
            return {
                disclaimer: DISCLAIMER,
                label: 'Calculated rental tax based on configured rules',
                notZimraConfirmedLiability: true,
                taxpayer: {
                    name: (company === null || company === void 0 ? void 0 : company.name) || '',
                    tin: (company === null || company === void 0 ? void 0 : company.tin) || taxProfile.tin || '',
                    rentalTaxRegime: regime
                },
                taxPeriod: periodKey || 'ALL',
                rentalTaxRegime: regime,
                grossRentalReceipts: gross,
                excludedAmounts: excluded,
                rentalTaxBase: base,
                applicableRate: rate,
                calculatedRentalTax: calculatedTax,
                taxPayments,
                calculatedBalance: (0, taxAmountAggregation_1.netFromNullable)(calculatedTax, taxPayments),
                properties: properties.map((id) => ({
                    propertyId: id,
                    propertyName: propertyName(id),
                    grossRentalReceipts: (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(records.filter((row) => String(row.propertyId) === id), (row) => row.grossRentalAmount),
                    rentalTaxBase: (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(records.filter((row) => String(row.propertyId) === id), (row) => row.taxableRentalBase),
                    calculatedRentalTax: (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(records.filter((row) => String(row.propertyId) === id), (row) => row.taxAmount)
                })),
                transactions: records.map((row) => (Object.assign(Object.assign({}, toApi(row)), { propertyName: row.propertyId ? propertyName(String(row.propertyId)) : null }))),
                payments: payments.map((row) => paymentToApi(row)),
                reviewItems: reviewItems.map((row) => ({
                    id: String(row._id),
                    sourceId: String(row.sourceId),
                    sourceType: row.sourceType,
                    reasons: row.reviewReasons || [],
                    calculationStatus: row.calculationStatus,
                    taxAmount: row.taxAmount
                })),
                incomeTaxAmount: null
            };
        });
    },
    overview(companyId, periodKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const paper = yield this.workingPaper(companyId, periodKey);
            return {
                currentPeriod: paper.taxPeriod,
                rentalTaxRegime: paper.rentalTaxRegime,
                calculatedRentalTax: paper.calculatedRentalTax,
                taxPayments: paper.taxPayments,
                calculatedBalance: paper.calculatedBalance,
                reviewItems: paper.reviewItems.length,
                transactions: paper.transactions.length,
                label: paper.label
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
            if (filters.propertyId)
                query.propertyId = asObjectId(filters.propertyId);
            const rows = yield IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.find(query).sort({ calculatedAt: -1 }).limit(500).lean();
            return rows.map((row) => toApi(row));
        });
    },
    reviewQueue(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = yield IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.find({
                companyId: asObjectId(companyId),
                $or: [
                    { calculationStatus: 'REVIEW_REQUIRED' },
                    { calculationStatus: 'PERIOD_REQUIRED' },
                    { reviewReasons: { $exists: true, $ne: [] } }
                ]
            })
                .sort({ calculatedAt: -1 })
                .limit(200)
                .lean();
            const paymentReview = yield IndividualRentalTaxPayment_1.IndividualRentalTaxPayment.find({
                companyId: asObjectId(companyId),
                status: 'POSTED',
                $and: [
                    { $or: [{ paymentReference: { $in: [null, ''] } }, { paymentReference: { $exists: false } }] },
                    { $or: [{ zimraReference: { $in: [null, ''] } }, { zimraReference: { $exists: false } }] }
                ]
            })
                .limit(50)
                .lean();
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
                ...paymentReview.map((row) => ({
                    id: String(row._id),
                    kind: 'PAYMENT',
                    sourceType: 'RentalTaxPayment',
                    sourceId: String(row._id),
                    taxPeriodKey: row.taxPeriodKey,
                    reasons: ['TAX_PAYMENT_MISSING_REFERENCE'],
                    calculationStatus: 'REVIEW_REQUIRED',
                    taxAmount: row.amount
                }))
            ];
        });
    },
    reconcile(companyId, periodKey) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const paper = yield this.workingPaper(companyId, periodKey);
            const findings = [];
            const records = paper.transactions;
            const recordSum = (0, money_1.roundMoney)(records.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0));
            if (paper.calculatedRentalTax != null && recordSum !== paper.calculatedRentalTax) {
                findings.push({ issueType: 'CALCULATION_MISMATCH', reason: 'Working paper calculated tax does not equal rental-tax record sums' });
            }
            const paymentSum = (0, money_1.roundMoney)(paper.payments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
            const calculatedTax = paper.calculatedRentalTax;
            const taxPayments = paymentSum;
            if (calculatedTax != null &&
                paper.calculatedBalance != null &&
                (0, money_1.roundMoney)(calculatedTax - taxPayments) !== paper.calculatedBalance) {
                findings.push({ issueType: 'CALCULATION_MISMATCH', reason: 'Calculated tax minus payments does not equal working-paper balance' });
            }
            const originals = records.filter((row) => row.recordKind !== 'REVERSAL');
            const sourceIds = originals.map((row) => row.sourceId);
            for (const id of Array.from(new Set(sourceIds.filter((id, index) => sourceIds.indexOf(id) !== index)))) {
                findings.push({ issueType: 'DUPLICATE_RECORD', reason: 'More than one original rental-tax record for the same source', sourceId: id });
            }
            for (const row of records) {
                if (row.snapshotId) {
                    const snapshot = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.findById(row.snapshotId).select('taxPeriodKey taxProfileSnapshot taxRuleReferences sourceType sourceId').lean();
                    if (!snapshot)
                        findings.push({ issueType: 'RECORD_WITHOUT_SOURCE', reason: 'Rental tax record snapshot is missing', sourceId: row.sourceId });
                    else {
                        const rule = (snapshot.taxRuleReferences || []).find((ref) => ref.taxType === 'PRESUMPTIVE_RENTAL_INCOME_TAX');
                        if (row.taxRuleVersion != null && (rule === null || rule === void 0 ? void 0 : rule.ruleVersion) != null && Number(rule.ruleVersion) !== Number(row.taxRuleVersion)) {
                            findings.push({ issueType: 'RULE_MISMATCH', reason: 'Rental tax record rule version differs from snapshot', sourceId: row.sourceId });
                        }
                        if (((_a = snapshot.taxProfileSnapshot) === null || _a === void 0 ? void 0 : _a.rentalTaxRegime) && snapshot.taxProfileSnapshot.rentalTaxRegime !== row.rentalTaxRegime) {
                            findings.push({ issueType: 'PROFILE_MISMATCH', reason: 'Rental tax record regime differs from snapshot', sourceId: row.sourceId });
                        }
                    }
                }
                else {
                    findings.push({ issueType: 'RECORD_WITHOUT_SOURCE', reason: 'Rental tax record has no snapshot', sourceId: row.sourceId });
                }
            }
            const snapshots = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.find(Object.assign({ companyId: asObjectId(companyId), sourceKind: { $in: ['PAYMENT_RENT', 'OTHER_INCOME'] } }, (periodKey ? { taxPeriodKey: periodKey } : {})))
                .select('sourceId sourceType taxTypesRelevant')
                .lean();
            const recordSource = new Set(originals.map((row) => `${row.sourceType}:${row.sourceId}`));
            for (const snapshot of snapshots) {
                const relevant = (snapshot.taxTypesRelevant || []).includes('PRESUMPTIVE_RENTAL_INCOME_TAX');
                if (!relevant)
                    continue;
                const key = `${snapshot.sourceType}:${String(snapshot.sourceId)}`;
                if (!recordSource.has(key)) {
                    findings.push({ issueType: 'SOURCE_WITHOUT_RECORD', reason: 'Rental receipt snapshot has no rental-tax record', sourceId: String(snapshot.sourceId) });
                }
            }
            for (const pay of paper.payments) {
                if (!pay.taxPeriodId && !pay.taxPeriodKey) {
                    findings.push({ issueType: 'PAYMENT_WITHOUT_PERIOD', reason: 'Tax payment is missing a rental-tax period', sourceId: pay.id });
                }
            }
            return {
                detectionOnly: true,
                noAutomaticRepair: true,
                workingPaper: {
                    calculatedRentalTax: paper.calculatedRentalTax,
                    taxPayments: paper.taxPayments,
                    calculatedBalance: paper.calculatedBalance
                },
                recordTotals: { calculatedRentalTax: recordSum, taxPayments: paymentSum },
                findings
            };
        });
    },
    annualSchedule(companyId, year) {
        return __awaiter(this, void 0, void 0, function* () {
            const taxYear = Number(year || new Date().getUTCFullYear());
            const start = `${taxYear}-01`;
            const end = `${taxYear}-12`;
            const records = yield IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.find({
                companyId: asObjectId(companyId),
                taxPeriodKey: { $gte: start, $lte: end }
            }).lean();
            const payments = yield IndividualRentalTaxPayment_1.IndividualRentalTaxPayment.find({
                companyId: asObjectId(companyId),
                status: 'POSTED',
                taxPeriodKey: { $gte: start, $lte: end }
            }).lean();
            const byProperty = new Map();
            for (const row of records) {
                const key = String(row.propertyId || 'unassigned');
                const list = byProperty.get(key) || [];
                list.push(row);
                byProperty.set(key, list);
            }
            const paymentByProperty = new Map();
            for (const row of payments) {
                const key = String(row.propertyId || 'unassigned');
                paymentByProperty.set(key, (0, money_1.roundMoney)(Number(paymentByProperty.get(key) || 0) + Number(row.amount || 0)));
            }
            const ids = Array.from(byProperty.keys()).filter((id) => id !== 'unassigned' && mongoose_1.default.Types.ObjectId.isValid(id));
            const propertyDocs = ids.length ? yield Property_1.Property.find({ _id: { $in: ids } }).select('name').lean() : [];
            return {
                disclaimer: DISCLAIMER,
                year: taxYear,
                foundationOnly: true,
                properties: Array.from(byProperty.entries()).map(([propertyId, rows]) => {
                    var _a;
                    const calculatedRentalTax = (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(rows, (row) => row.taxAmount);
                    const taxPayments = paymentByProperty.get(propertyId) || 0;
                    return {
                        propertyId,
                        propertyName: ((_a = propertyDocs.find((row) => String(row._id) === propertyId)) === null || _a === void 0 ? void 0 : _a.name) || (propertyId === 'unassigned' ? 'Unassigned' : propertyId),
                        grossRentalReceipts: (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(rows, (row) => row.grossRentalAmount),
                        rentalTaxBase: (0, taxAmountAggregation_1.sumCompleteTaxAmounts)(rows, (row) => row.taxableRentalBase),
                        calculatedRentalTax,
                        taxPayments,
                        balance: (0, taxAmountAggregation_1.netFromNullable)(calculatedRentalTax, taxPayments)
                    };
                })
            };
        });
    },
    exportWorkingPaper(companyId, periodKey, format) {
        return __awaiter(this, void 0, void 0, function* () {
            const paper = yield this.workingPaper(companyId, periodKey);
            const rows = paper.transactions.map((row) => ({
                taxpayer: paper.taxpayer.name,
                tin: paper.taxpayer.tin,
                taxRegime: paper.rentalTaxRegime,
                taxPeriod: paper.taxPeriod,
                property: row.propertyName || row.propertyId,
                transaction: row.sourceId,
                sourceType: row.sourceType,
                gross: row.grossRentalAmount,
                excluded: row.excludedAmount,
                taxBase: row.taxableRentalBase,
                rate: row.taxRate,
                calculatedTax: row.taxAmount,
                rule: row.taxRuleCode,
                sourceReference: row.sourceReference,
                status: row.calculationStatus
            }));
            if (format === 'csv') {
                const headers = Object.keys(rows[0] || { taxpayer: '', tin: '', taxRegime: '', taxPeriod: '' });
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
                    body: (0, xlsxWorkbook_1.buildXlsxWorkbook)('Rental tax working paper', rows.length ? rows : [{ taxpayer: paper.taxpayer.name, taxPeriod: paper.taxPeriod, disclaimer: paper.disclaimer }]),
                    filename: `rental-tax-working-paper-${paper.taxPeriod}.xlsx`
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
            line('PRESUMPTIVE RENTAL INCOME TAX', 16, true);
            line(paper.taxPeriod, 12, true);
            line(paper.disclaimer, 8);
            line(`Taxpayer: ${paper.taxpayer.name}  TIN: ${paper.taxpayer.tin}`);
            line(`Tax regime: ${paper.rentalTaxRegime}`);
            line(`Gross rental receipts ${paper.grossRentalReceipts}`);
            line(`Excluded amounts (${paper.excludedAmounts})`);
            line(`Rental tax base ${paper.rentalTaxBase}`, 11, true);
            line(`Applicable rate ${paper.applicableRate == null ? '—' : `${paper.applicableRate}%`}`);
            line(`Calculated rental tax ${paper.calculatedRentalTax}`, 11, true);
            line(`Tax payments (${paper.taxPayments})`);
            line(`Calculated balance ${paper.calculatedBalance}`, 11, true);
            line('This is calculated rental tax, not a confirmed ZIMRA liability.', 8);
            for (const row of rows) {
                line(`${row.property || ''} ${row.transaction} base=${row.taxBase} tax=${row.calculatedTax}`);
            }
            for (const item of paper.reviewItems) {
                line(`Review: ${item.calculationStatus} ${(item.reasons || []).join(', ')}`, 8);
            }
            return { contentType: 'application/pdf', body: Buffer.from(yield pdf.save()) };
        });
    }
};
exports.default = exports.individualRentalTaxService;
