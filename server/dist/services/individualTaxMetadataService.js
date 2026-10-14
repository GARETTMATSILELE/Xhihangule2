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
exports.individualTaxMetadataService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const Payment_1 = require("../models/Payment");
const LandlordFinancialTransaction_1 = require("../models/LandlordFinancialTransaction");
const TransactionTaxSnapshot_1 = require("../models/TransactionTaxSnapshot");
const IndividualVatRecord_1 = require("../models/IndividualVatRecord");
const IndividualRentalTaxRecord_1 = require("../models/IndividualRentalTaxRecord");
const IndividualIncomeTaxRecord_1 = require("../models/IndividualIncomeTaxRecord");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const logger_1 = require("../utils/logger");
const accountingPostingPolicy_1 = require("./accountingPostingPolicy");
const accountingPeriodService_1 = require("./accountingPeriodService");
const individualTaxProfileService_1 = __importDefault(require("./individualTaxProfileService"));
const taxRuleRegistry_1 = require("./taxRuleRegistry");
const taxClassificationService_1 = require("./taxClassificationService");
const taxPeriodService_1 = require("./taxPeriodService");
const taxMetadataTypes_1 = require("./tax/taxMetadataTypes");
const individualVatService_1 = __importDefault(require("./individualVatService"));
const individualRentalTaxService_1 = __importDefault(require("./individualRentalTaxService"));
const individualIncomeTaxService_1 = __importDefault(require("./individualIncomeTaxService"));
function asObjectId(value) {
    return new mongoose_1.default.Types.ObjectId(value);
}
function isIndividualCompany(company) {
    return (company === null || company === void 0 ? void 0 : company.workspaceType) === 'individual' || (company === null || company === void 0 ? void 0 : company.plan) === 'INDIVIDUAL';
}
function writeAudit(companyId, eventType, sourceId, message, metadata) {
    return __awaiter(this, void 0, void 0, function* () {
        yield AccountingEventLog_1.AccountingEventLog.create({
            companyId: asObjectId(companyId),
            eventType,
            sourceModule: 'individual_tax_metadata',
            sourceId,
            success: true,
            message,
            metadata
        });
    });
}
function toApi(snapshot) {
    return Object.assign({ id: String(snapshot._id), sourceType: snapshot.sourceType, sourceId: String(snapshot.sourceId), sourceKind: snapshot.sourceKind, transactionDate: snapshot.transactionDate, taxPeriodKey: snapshot.taxPeriodKey, taxPeriodId: snapshot.taxPeriodId ? String(snapshot.taxPeriodId) : null, periodAssignmentStatus: snapshot.periodAssignmentStatus, accountingPeriodId: snapshot.accountingPeriodId ? String(snapshot.accountingPeriodId) : null, classificationStatus: snapshot.classificationStatus, taxCalculationStatus: snapshot.taxCalculationStatus, vatTreatment: snapshot.vatTreatment, rentalTaxTreatment: snapshot.rentalTaxTreatment, rentalTaxRegime: snapshot.rentalTaxRegime, deductibility: snapshot.deductibility, capitalOrRevenue: snapshot.capitalOrRevenue, classificationSource: snapshot.classificationSource, reviewReasons: snapshot.reviewReasons, taxProfileSnapshot: snapshot.taxProfileSnapshot, rules: snapshot.taxRuleReferences }, (0, taxMetadataTypes_1.uncalculatedTaxFields)());
}
function persistSnapshot(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const existing = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.findOne({
            companyId: asObjectId(input.companyId),
            sourceType: input.sourceType,
            sourceId: asObjectId(input.sourceId)
        });
        if (existing)
            return existing;
        const taxTypes = input.classification.taxTypesRelevant.filter((type) => ['VAT', 'PRESUMPTIVE_RENTAL_INCOME_TAX', 'INCOME_TAX'].includes(type));
        const periodTypes = taxTypes.length ? taxTypes : ['INCOME_TAX'];
        const periods = yield (0, taxPeriodService_1.resolveRelevantTaxPeriods)({
            companyId: input.companyId,
            taxTypes: periodTypes,
            transactionDate: input.transactionDate
        });
        yield (0, taxPeriodService_1.assertTaxPeriodsAllowPosting)(periods);
        const assigned = periods.find((period) => period.assignmentStatus === 'ASSIGNED') || periods[0];
        const accounting = yield (0, accountingPeriodService_1.findPeriodForDate)(input.companyId, input.transactionDate);
        try {
            const created = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.create(Object.assign(Object.assign({ companyId: asObjectId(input.companyId), propertyId: input.propertyId ? asObjectId(input.propertyId) : null, sourceType: input.sourceType, sourceId: asObjectId(input.sourceId), sourceKind: input.sourceKind, transactionDate: input.transactionDate, accountingPeriodId: (accounting === null || accounting === void 0 ? void 0 : accounting._id) || null, taxPeriodKey: assigned.periodKey, taxPeriodId: assigned.taxPeriodId, periodAssignmentStatus: assigned.assignmentStatus, taxTypesRelevant: input.classification.taxTypesRelevant, taxRuleReferences: input.classification.taxRuleReferences, taxProfileSnapshot: input.classification.taxProfileSnapshot, vatTreatment: input.classification.vatTreatment, rentalTaxTreatment: input.classification.rentalTaxTreatment, rentalTaxRegime: input.classification.rentalTaxRegime, deductibility: input.classification.deductibility, capitalOrRevenue: input.classification.capitalOrRevenue, classificationSource: input.classification.classificationSource, classificationStatus: input.classification.classificationStatus, taxCalculationStatus: input.classification.taxCalculationStatus, reviewReasons: input.classification.reviewReasons }, (0, taxMetadataTypes_1.uncalculatedTaxFields)()), { classifiedAt: new Date(), classifiedBy: input.classifiedBy ? asObjectId(input.classifiedBy) : null }));
            yield writeAudit(input.companyId, 'TAX_METADATA_CREATED', input.sourceId, `Tax metadata for ${input.sourceKind}`, {
                taxPeriodKey: assigned.periodKey,
                taxCalculationStatus: input.classification.taxCalculationStatus,
                periodAssignmentStatus: assigned.assignmentStatus
            });
            yield writeAudit(input.companyId, 'TAX_PERIOD_ASSIGNED', input.sourceId, `Tax period ${assigned.periodKey}`, {
                taxPeriodId: assigned.taxPeriodId,
                assignmentStatus: assigned.assignmentStatus,
                taxTypes: periodTypes
            });
            yield writeAudit(input.companyId, 'TAX_PROFILE_SNAPSHOT_CREATED', input.sourceId, 'Stored tax profile snapshot', {
                ownerProfileVersion: input.classification.taxProfileSnapshot.ownerProfileVersion,
                vatSupplyTreatment: input.classification.taxProfileSnapshot.vatSupplyTreatment
            });
            if (input.classification.taxRuleReferences.length) {
                yield writeAudit(input.companyId, 'TAX_RULE_RESOLVED', input.sourceId, 'Stored tax rule references without calculating tax', {
                    rules: input.classification.taxRuleReferences.map((row) => ({
                        taxType: row.taxType,
                        ruleCode: row.ruleCode,
                        ruleVersion: row.ruleVersion,
                        taxAmount: null
                    }))
                });
            }
            return created;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                const dup = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.findOne({
                    companyId: asObjectId(input.companyId),
                    sourceType: input.sourceType,
                    sourceId: asObjectId(input.sourceId)
                });
                if (dup)
                    return dup;
            }
            throw error;
        }
    });
}
function loadClassificationContext(companyId, propertyId, transactionDate) {
    return __awaiter(this, void 0, void 0, function* () {
        const [owner, propertyProfile, vatRule, presumptiveRule, incomeTaxRule, company] = yield Promise.all([
            individualTaxProfileService_1.default.getOwnerProfile(companyId),
            individualTaxProfileService_1.default.getPropertyProfile(companyId, propertyId),
            (0, taxRuleRegistry_1.getEffectiveTaxRule)('VAT', transactionDate),
            (0, taxRuleRegistry_1.getEffectiveTaxRule)('PRESUMPTIVE_RENTAL_INCOME_TAX', transactionDate),
            (0, taxRuleRegistry_1.getEffectiveTaxRule)('INCOME_TAX', transactionDate),
            Company_1.Company.findById(companyId).select('taxProfile vatNumber').lean()
        ]);
        const taxProfile = (company === null || company === void 0 ? void 0 : company.taxProfile) || {};
        return { owner, propertyProfile, vatRule, presumptiveRule, incomeTaxRule, taxProfile };
    });
}
exports.individualTaxMetadataService = {
    toApi,
    attachForLandlordEntry(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const ctx = yield loadClassificationContext(input.companyId, input.propertyId, input.transactionDate);
            const classification = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind: input.sourceKind,
                transactionDate: input.transactionDate,
                vatRegistered: ctx.owner.vatRegistered,
                vatRegistrationEffectiveDate: ctx.owner.vatRegistrationDate,
                vatRegistrationCancelledAt: ctx.owner.vatRegistrationCancelledAt,
                vatNumber: ctx.owner.vatNumber,
                rentalTaxRegime: ctx.owner.rentalTaxRegime,
                incomeTaxRegistered: ctx.owner.incomeTaxRegistered,
                propertyUseClass: ctx.propertyProfile.propertyUseClass,
                vatSupplyTreatment: ctx.propertyProfile.vatSupplyTreatment,
                rentalTaxTreatment: ctx.propertyProfile.rentalTaxTreatment,
                ownerProfileVersion: Number(ctx.owner.profileVersion || 1),
                propertyUpdatedAt: null,
                userVatTreatment: input.vatMode || null,
                userDeductibility: input.deductibility || null,
                userCapitalOrRevenue: input.capitalOrRevenue || null,
                vatRule: ctx.vatRule,
                presumptiveRule: ctx.presumptiveRule,
                incomeTaxRule: ctx.incomeTaxRule
            });
            const snapshot = yield persistSnapshot({
                companyId: input.companyId,
                propertyId: input.propertyId,
                sourceType: 'LandlordFinancialTransaction',
                sourceId: input.transactionId,
                sourceKind: input.sourceKind,
                transactionDate: input.transactionDate,
                classifiedBy: input.userId,
                classification
            });
            yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.updateOne({ _id: asObjectId(input.transactionId) }, {
                $set: {
                    taxSnapshotId: snapshot._id,
                    taxCalculationStatus: snapshot.taxCalculationStatus,
                    taxPeriodKey: snapshot.taxPeriodKey
                }
            });
            yield individualVatService_1.default.safePostForSnapshot(snapshot, input.userId);
            yield individualRentalTaxService_1.default.safePostForSnapshot(snapshot, input.userId);
            yield individualIncomeTaxService_1.default.safePostForSnapshot(snapshot, input.userId);
            return snapshot;
        });
    },
    attachForPayment(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            const payment = yield Payment_1.Payment.findById(paymentId);
            if (!(payment === null || payment === void 0 ? void 0 : payment.companyId))
                return null;
            const company = yield Company_1.Company.findById(payment.companyId).select('workspaceType plan').lean();
            if (!isIndividualCompany(company))
                return null;
            if (String(payment.status) === 'reversed' || payment.reversalOfPaymentId)
                return null;
            const propertyId = payment.propertyId ? String(payment.propertyId) : '';
            if (!propertyId || !mongoose_1.default.Types.ObjectId.isValid(propertyId))
                return null;
            const property = yield Property_1.Property.findOne({ _id: propertyId, companyId: payment.companyId, isDeleted: { $ne: true } }).select('_id').lean();
            if (!property)
                return null;
            const transactionDate = payment.paymentDate ? new Date(payment.paymentDate) : new Date();
            const depositOnly = (0, accountingPostingPolicy_1.isDepositOnlyPayment)(payment);
            const sourceKind = depositOnly ? 'PAYMENT_DEPOSIT' : 'PAYMENT_RENT';
            const ctx = yield loadClassificationContext(String(payment.companyId), propertyId, transactionDate);
            const classification = (0, taxClassificationService_1.buildTaxClassification)({
                sourceKind,
                transactionDate,
                vatRegistered: ctx.owner.vatRegistered,
                vatRegistrationEffectiveDate: ctx.owner.vatRegistrationDate,
                vatRegistrationCancelledAt: ctx.owner.vatRegistrationCancelledAt,
                vatNumber: ctx.owner.vatNumber,
                rentalTaxRegime: ctx.owner.rentalTaxRegime,
                incomeTaxRegistered: ctx.owner.incomeTaxRegistered,
                propertyUseClass: ctx.propertyProfile.propertyUseClass,
                vatSupplyTreatment: ctx.propertyProfile.vatSupplyTreatment,
                rentalTaxTreatment: ctx.propertyProfile.rentalTaxTreatment,
                ownerProfileVersion: Number(ctx.owner.profileVersion || 1),
                vatRule: ctx.vatRule,
                presumptiveRule: ctx.presumptiveRule,
                incomeTaxRule: ctx.incomeTaxRule
            });
            const snapshot = yield persistSnapshot({
                companyId: String(payment.companyId),
                propertyId,
                sourceType: 'Payment',
                sourceId: String(payment._id),
                sourceKind,
                transactionDate,
                classifiedBy: payment.processedBy ? String(payment.processedBy) : null,
                classification
            });
            yield individualVatService_1.default.safePostForSnapshot(snapshot, payment.processedBy ? String(payment.processedBy) : null);
            yield individualRentalTaxService_1.default.safePostForSnapshot(snapshot, payment.processedBy ? String(payment.processedBy) : null);
            yield individualIncomeTaxService_1.default.safePostForSnapshot(snapshot, payment.processedBy ? String(payment.processedBy) : null);
            return snapshot;
        });
    },
    safeAttachForPayment(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.attachForPayment(paymentId);
            }
            catch (error) {
                logger_1.logger.warn('Individual tax metadata attach failed', { paymentId, message: (error === null || error === void 0 ? void 0 : error.message) || error });
            }
        });
    },
    getForSource(companyId, sourceType, sourceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const row = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.findOne({
                companyId: asObjectId(companyId),
                sourceType,
                sourceId: asObjectId(sourceId)
            });
            if (!row)
                return null;
            const vatRows = yield IndividualVatRecord_1.IndividualVatRecord.find({
                companyId: asObjectId(companyId),
                sourceType,
                sourceId: asObjectId(sourceId)
            }).lean();
            const rentalRows = yield IndividualRentalTaxRecord_1.IndividualRentalTaxRecord.find({
                companyId: asObjectId(companyId),
                sourceType,
                sourceId: asObjectId(sourceId)
            }).lean();
            const incomeRows = yield IndividualIncomeTaxRecord_1.IndividualIncomeTaxRecord.find({
                companyId: asObjectId(companyId),
                sourceType,
                sourceId: asObjectId(sourceId)
            }).lean();
            return Object.assign(Object.assign({}, toApi(row)), { vat: vatRows.map((item) => individualVatService_1.default.toApi(item)), rentalTax: rentalRows.map((item) => individualRentalTaxService_1.default.toApi(item)), incomeTax: incomeRows.map((item) => individualIncomeTaxService_1.default.toApi(item)) });
        });
    },
    listForPeriod(companyId, periodKey, taxType) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = { companyId: asObjectId(companyId), taxPeriodKey: periodKey };
            if (taxType)
                query.taxTypesRelevant = taxType;
            const rows = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.find(query).sort({ transactionDate: 1 }).lean();
            return rows.map((row) => toApi(row));
        });
    },
    reviewQueue(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.find({
                companyId: asObjectId(companyId),
                $or: [
                    { taxCalculationStatus: 'REVIEW_REQUIRED' },
                    { periodAssignmentStatus: 'PERIOD_REQUIRED' },
                    { reviewReasons: { $exists: true, $ne: [] } }
                ]
            })
                .sort({ transactionDate: -1 })
                .limit(200)
                .lean();
            return rows.map((row) => (Object.assign({ id: String(row._id), sourceType: row.sourceType, sourceId: String(row.sourceId), sourceKind: row.sourceKind, taxPeriodKey: row.taxPeriodKey, taxCalculationStatus: row.taxCalculationStatus, periodAssignmentStatus: row.periodAssignmentStatus, reviewReasons: row.reviewReasons || [] }, (0, taxMetadataTypes_1.uncalculatedTaxFields)())));
        });
    },
    periodSummaries(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.aggregate([
                { $match: { companyId: asObjectId(companyId) } },
                { $unwind: { path: '$taxTypesRelevant', preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: { periodKey: '$taxPeriodKey', taxType: '$taxTypesRelevant' },
                        transactions: { $sum: 1 },
                        review: {
                            $sum: { $cond: [{ $eq: ['$taxCalculationStatus', 'REVIEW_REQUIRED'] }, 1, 0] }
                        },
                        notCalculated: {
                            $sum: {
                                $cond: [{ $in: ['$taxCalculationStatus', ['NOT_CALCULATED', 'READY_FOR_CALCULATION', 'REVIEW_REQUIRED']] }, 1, 0]
                            }
                        },
                        periodRequired: {
                            $sum: { $cond: [{ $eq: ['$periodAssignmentStatus', 'PERIOD_REQUIRED'] }, 1, 0] }
                        }
                    }
                },
                { $sort: { '_id.periodKey': -1, '_id.taxType': 1 } }
            ]);
            const { TaxPeriod } = yield Promise.resolve().then(() => __importStar(require('../models/TaxPeriod')));
            const periodKeys = Array.from(new Set(rows.map((row) => row._id.periodKey).filter(Boolean)));
            const opened = periodKeys.length
                ? yield TaxPeriod.find({ companyId: asObjectId(companyId), periodKey: { $in: periodKeys } })
                    .select('taxType periodKey status')
                    .lean()
                : [];
            const statusByKey = new Map(opened.map((row) => [`${row.taxType}:${row.periodKey}`, row.status]));
            return rows.map((row) => (Object.assign({ taxType: row._id.taxType || 'OTHER', periodKey: row._id.periodKey, status: statusByKey.get(`${row._id.taxType}:${row._id.periodKey}`) || (row.periodRequired ? 'PERIOD_REQUIRED' : 'OPEN'), transactions: row.transactions, requiresReview: row.review, notCalculated: row.notCalculated, periodRequired: row.periodRequired }, (0, taxMetadataTypes_1.uncalculatedTaxFields)())));
        });
    },
    integrity(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const findings = [];
            const snapshots = yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.find({ companyId: asObjectId(companyId) }).limit(500).lean();
            const periodIds = Array.from(new Set(snapshots.map((row) => (row.taxPeriodId ? String(row.taxPeriodId) : '')).filter(Boolean)));
            const { TaxPeriod } = yield Promise.resolve().then(() => __importStar(require('../models/TaxPeriod')));
            const periods = periodIds.length
                ? yield TaxPeriod.find({ _id: { $in: periodIds.map((id) => asObjectId(id)) } })
                    .select('_id status')
                    .lean()
                : [];
            const periodById = new Map(periods.map((row) => [String(row._id), row]));
            for (const row of snapshots) {
                if (row.taxAmount != null || row.vatAmount != null || row.presumptiveTaxAmount != null || row.incomeTaxAmount != null) {
                    findings.push({ issueType: 'TAX_METADATA_MISMATCH', reason: 'Snapshot stores a tax amount although Phase D does not calculate tax', sourceId: String(row.sourceId) });
                }
                if (!row.taxProfileSnapshot) {
                    findings.push({ issueType: 'TAX_PROFILE_SNAPSHOT_MISSING', reason: 'Snapshot is missing the posting-time tax profile', sourceId: String(row.sourceId) });
                }
                if (!row.classificationStatus) {
                    findings.push({ issueType: 'TRANSACTION_MISSING_TAX_CLASSIFICATION', reason: 'Snapshot is missing classificationStatus', sourceId: String(row.sourceId) });
                }
                if (!row.taxPeriodKey) {
                    findings.push({ issueType: 'TRANSACTION_MISSING_TAX_PERIOD', reason: 'Snapshot is missing taxPeriodKey', sourceId: String(row.sourceId) });
                }
                if (row.taxPeriodId) {
                    const period = periodById.get(String(row.taxPeriodId));
                    if (!period)
                        findings.push({ issueType: 'TAX_PERIOD_INVALID', reason: 'taxPeriodId does not exist', sourceId: String(row.sourceId) });
                    else if (period.status === 'FINALIZED' || period.status === 'LOCKED') {
                        findings.push({ issueType: 'TAX_PERIOD_CLOSED', reason: `Assigned tax period is ${period.status}`, sourceId: String(row.sourceId) });
                    }
                }
                else if (row.periodAssignmentStatus === 'PERIOD_REQUIRED') {
                    findings.push({ issueType: 'TRANSACTION_MISSING_TAX_PERIOD', reason: `Period ${row.taxPeriodKey} has not been opened`, sourceId: String(row.sourceId) });
                }
                const badRule = (row.taxRuleReferences || []).find((ref) => ref.ruleCode && !ref.ruleId && ref.taxCalculationStatus === 'READY_FOR_CALCULATION');
                if (badRule) {
                    findings.push({ issueType: 'TAX_RULE_REFERENCE_INVALID', reason: `Rule ${badRule.ruleCode} is missing an id`, sourceId: String(row.sourceId) });
                }
            }
            return { detectionOnly: true, noAutomaticRepair: true, findings };
        });
    }
};
exports.default = exports.individualTaxMetadataService;
