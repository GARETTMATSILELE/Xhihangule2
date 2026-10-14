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
exports.individualAccountingService = exports.IndividualAccountingService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Property_1 = require("../models/Property");
const LandlordFinancialTransaction_1 = require("../models/LandlordFinancialTransaction");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const rentalDeposit_1 = require("../models/rentalDeposit");
const errorHandler_1 = require("../middleware/errorHandler");
const accountingPeriodService_1 = require("./accountingPeriodService");
const propertyAccountService_1 = __importDefault(require("./propertyAccountService"));
const individualTaxMetadataService_1 = __importDefault(require("./individualTaxMetadataService"));
const individualVatService_1 = __importDefault(require("./individualVatService"));
const individualRentalTaxService_1 = __importDefault(require("./individualRentalTaxService"));
const individualIncomeTaxService_1 = __importDefault(require("./individualIncomeTaxService"));
const logger_1 = require("../utils/logger");
const individualAccountingCategories_1 = require("./individualAccountingCategories");
function asObjectId(value, label = 'id') {
    if (!mongoose_1.default.Types.ObjectId.isValid(value))
        throw new errorHandler_1.AppError(`Invalid ${label}`, 400);
    return new mongoose_1.default.Types.ObjectId(value);
}
function ledgerTypeFromTreatment(treatment, classificationLedger) {
    if (treatment === 'PROPERTY_INCOME')
        return 'income';
    if (treatment === 'LIABILITY' || treatment === 'CAPITAL')
        return 'other';
    if (classificationLedger === 'maintenance')
        return 'maintenance';
    return 'expense';
}
function writeAudit(input) {
    return __awaiter(this, void 0, void 0, function* () {
        yield AccountingEventLog_1.AccountingEventLog.create({
            companyId: asObjectId(input.companyId, 'companyId'),
            eventType: input.eventType,
            sourceModule: 'individual_accounting',
            sourceId: input.sourceId,
            success: true,
            message: input.message,
            metadata: input.metadata
        });
    });
}
function reversalPostSpec(original) {
    if (original.sourceKind === 'LIABILITY') {
        return { entryType: 'expense', category: 'DEPOSIT_REFUND' };
    }
    if (original.sourceKind === 'CAPITAL') {
        return { entryType: 'expense', category: 'CAPITAL_IMPROVEMENT' };
    }
    if (original.sourceKind === 'OTHER_INCOME') {
        return { entryType: 'expense', category: 'OTHER_PROPERTY_EXPENSE' };
    }
    return { entryType: 'income', category: 'OTHER_INCOME' };
}
class IndividualAccountingService {
    postEntry(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const propertyId = String(input.propertyId || '');
            const property = yield Property_1.Property.findOne({
                _id: asObjectId(propertyId, 'propertyId'),
                companyId: asObjectId(input.companyId, 'companyId'),
                isDeleted: { $ne: true }
            }).lean();
            if (!property)
                throw new errorHandler_1.AppError('Property not found', 404);
            const amount = Number(input.amount || 0);
            if (!Number.isFinite(amount) || amount <= 0)
                throw new errorHandler_1.AppError('Amount must be greater than zero', 400);
            const rawCategory = String(input.category || (input.entryType === 'income' ? 'Other Income' : input.entryType === 'maintenance' ? 'Maintenance' : 'Other'));
            if (!(0, individualAccountingCategories_1.isAllowedLegacyCategory)(input.entryType, rawCategory) && !(0, individualAccountingCategories_1.isAllowedLegacyCategory)(input.entryType, (0, individualAccountingCategories_1.normalizeLandlordCategory)(rawCategory, 'EXPENSE'))) {
                throw new errorHandler_1.AppError(`Invalid ${input.entryType} category`, 400);
            }
            const category = (0, individualAccountingCategories_1.normalizeLandlordCategory)(rawCategory, input.entryType === 'income' ? 'OTHER_INCOME' : input.entryType === 'maintenance' ? 'MAINTENANCE' : 'EXPENSE');
            const classified = (0, individualAccountingCategories_1.classifyLandlordCategory)(category);
            if (input.entryType === 'income' && classified.sourceKind !== 'OTHER_INCOME') {
                throw new errorHandler_1.AppError('Income entries cannot use deposit or capital categories', 400);
            }
            const date = input.date ? new Date(input.date) : new Date();
            if (Number.isNaN(date.getTime()))
                throw new errorHandler_1.AppError('Invalid date', 400);
            const idempotencyKey = String(input.idempotencyKey || `${input.entryType}:${propertyId}:${Date.now()}`);
            const existing = yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.findOne({
                companyId: asObjectId(input.companyId, 'companyId'),
                idempotencyKey
            });
            if (existing) {
                yield this.ensureTaxOverlay(existing, input);
                return existing;
            }
            const periodGate = yield (0, accountingPeriodService_1.assertPeriodAllowsPosting)({
                companyId: input.companyId,
                transactionDate: date,
                overrideReason: input.overrideReason,
                actorId: input.userId,
                sourceModule: 'individual_accounting',
                sourceId: idempotencyKey
            });
            const period = yield (0, accountingPeriodService_1.findPeriodForDate)(input.companyId, date);
            const vatMode = input.vatMode || classified.vatModeDefault;
            const sourceKind = classified.sourceKind;
            const attachments = Array.isArray(input.attachments)
                ? input.attachments
                : input.receiptUrl
                    ? [String(input.receiptUrl)]
                    : [];
            let canonical;
            try {
                canonical = yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.create({
                    companyId: asObjectId(input.companyId, 'companyId'),
                    propertyId: asObjectId(propertyId, 'propertyId'),
                    createdBy: asObjectId(input.userId, 'userId'),
                    sourceKind,
                    category,
                    description: String(input.description || rawCategory),
                    amount,
                    currency: input.currency || 'USD',
                    date,
                    supplier: input.supplier,
                    supplierTin: input.supplierTin,
                    supplierVatNumber: input.supplierVatNumber,
                    invoiceNumber: input.invoiceNumber,
                    paymentMethod: input.paymentMethod,
                    referenceNumber: input.reference || input.referenceNumber,
                    notes: input.notes,
                    attachments,
                    vatMode,
                    accountingTreatment: classified.accountingTreatment,
                    transactionCategory: classified.transactionCategory,
                    capitalOrRevenue: input.capitalOrRevenue || classified.capitalOrRevenue,
                    deductibility: input.deductibility || classified.deductibility,
                    inputVatEligibility: input.inputVatEligibility,
                    taxReviewStatus: 'UNCLASSIFIED',
                    idempotencyKey,
                    status: 'POSTED',
                    accountingPeriodId: period === null || period === void 0 ? void 0 : period._id,
                    sourceMaintenanceId: input.sourceMaintenanceId ? asObjectId(input.sourceMaintenanceId, 'maintenanceId') : undefined
                });
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                    const dup = yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.findOne({
                        companyId: asObjectId(input.companyId, 'companyId'),
                        idempotencyKey
                    });
                    if (dup) {
                        yield this.ensureTaxOverlay(dup, input);
                        return dup;
                    }
                }
                throw error;
            }
            const projected = yield propertyAccountService_1.default.appendManualLedgerTransaction({
                propertyId,
                idempotencyKey,
                transaction: {
                    type: ledgerTypeFromTreatment(classified.accountingTreatment, classified.ledgerType),
                    amount,
                    date,
                    description: String(input.description || rawCategory),
                    category,
                    transactionCategory: classified.transactionCategory,
                    accountingTreatment: classified.accountingTreatment,
                    referenceNumber: input.reference || input.referenceNumber,
                    status: 'completed',
                    processedBy: asObjectId(input.userId, 'userId'),
                    notes: input.notes,
                    attachments,
                    idempotencyKey
                }
            });
            canonical.propertyAccountId = projected.accountId;
            canonical.propertyAccountTransactionId = projected.transactionId;
            yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.updateOne({ _id: canonical._id }, {
                $set: {
                    propertyAccountId: projected.accountId,
                    propertyAccountTransactionId: projected.transactionId
                }
            });
            yield this.ensureTaxOverlay(canonical, input);
            yield writeAudit({
                companyId: input.companyId,
                eventType: sourceKind === 'LIABILITY' ? 'DEPOSIT_POSTED' : sourceKind === 'OTHER_INCOME' ? 'INCOME_POSTED' : 'EXPENSE_POSTED',
                sourceId: String(canonical._id),
                message: `Posted ${sourceKind} ${amount} period=${periodGate.periodStatus}`,
                metadata: {
                    propertyId,
                    category,
                    accountingTreatment: classified.accountingTreatment,
                    vatMode,
                    taxReviewStatus: 'UNCLASSIFIED',
                    idempotencyKey
                }
            });
            return canonical;
        });
    }
    ensureTaxOverlay(canonical, input) {
        return __awaiter(this, void 0, void 0, function* () {
            const sourceKind = canonical.sourceKind;
            try {
                yield individualTaxMetadataService_1.default.attachForLandlordEntry({
                    companyId: input.companyId,
                    userId: input.userId,
                    transactionId: String(canonical._id),
                    sourceKind: sourceKind === 'LIABILITY' ? 'LIABILITY' : sourceKind === 'CAPITAL' ? 'CAPITAL' : sourceKind === 'OTHER_INCOME' ? 'OTHER_INCOME' : sourceKind === 'MAINTENANCE' ? 'MAINTENANCE' : sourceKind === 'REVERSAL' ? 'REVERSAL' : 'EXPENSE',
                    propertyId: String(canonical.propertyId),
                    transactionDate: canonical.date,
                    vatMode: canonical.vatMode,
                    deductibility: input.deductibility || canonical.deductibility,
                    capitalOrRevenue: input.capitalOrRevenue || canonical.capitalOrRevenue
                });
            }
            catch (error) {
                logger_1.logger.warn('Individual tax overlay failed after accounting post; accounting remains valid', {
                    sourceId: String(canonical._id),
                    statusCode: error === null || error === void 0 ? void 0 : error.statusCode,
                    message: (error === null || error === void 0 ? void 0 : error.message) || error
                });
            }
        });
    }
    reverseEntry(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const original = yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.findOne({
                _id: asObjectId(input.transactionId, 'transactionId'),
                companyId: asObjectId(input.companyId, 'companyId'),
                propertyId: asObjectId(input.propertyId, 'propertyId')
            });
            if (!original)
                throw new errorHandler_1.AppError('Ledger entry not found', 404);
            if (original.status === 'REVERSED')
                throw new errorHandler_1.AppError('Entry is already reversed', 409);
            const reversalSpec = reversalPostSpec(original);
            const reversalKey = `${input.mode}:reversal:${input.transactionId}`;
            const reversal = yield this.postEntry({
                companyId: input.companyId,
                userId: input.userId,
                entryType: reversalSpec.entryType,
                propertyId: input.propertyId,
                amount: Number(original.amount),
                date: new Date(),
                category: reversalSpec.category,
                description: `${input.mode === 'delete' ? 'Delete' : 'Edit'} reversal: ${original.description}`,
                reference: `REV-${String(original._id).slice(-8)}`,
                notes: `Correction entry for ${original._id}`,
                idempotencyKey: reversalKey
            });
            yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.updateOne({ _id: original._id, status: 'POSTED' }, { $set: { status: 'REVERSED', reversedBy: reversal._id } });
            yield individualVatService_1.default.safeReverseForSource({
                companyId: input.companyId,
                sourceType: 'LandlordFinancialTransaction',
                sourceId: String(original._id),
                reason: `${input.mode} reversal`,
                reversalTransactionId: String(reversal._id),
                userId: input.userId
            });
            yield individualRentalTaxService_1.default.safeReverseForSource({
                companyId: input.companyId,
                sourceType: 'LandlordFinancialTransaction',
                sourceId: String(original._id),
                reason: `${input.mode} reversal`,
                reversalTransactionId: String(reversal._id),
                userId: input.userId
            });
            yield individualIncomeTaxService_1.default.safeReverseForSource({
                companyId: input.companyId,
                sourceType: 'LandlordFinancialTransaction',
                sourceId: String(original._id),
                reason: `${input.mode} reversal`,
                reversalTransactionId: String(reversal._id),
                userId: input.userId
            });
            yield writeAudit({
                companyId: input.companyId,
                eventType: original.sourceKind === 'OTHER_INCOME' ? 'INCOME_REVERSED' : 'EXPENSE_REVERSED',
                sourceId: String(original._id),
                message: `Reversed ${original.sourceKind} via ${String(reversal._id)}`,
                metadata: { reversalId: String(reversal._id), mode: input.mode }
            });
            if (input.mode === 'delete' || !input.replacement) {
                return { reversal };
            }
            const replacement = yield this.postEntry(Object.assign(Object.assign({}, input.replacement), { companyId: input.companyId, userId: input.userId, propertyId: input.propertyId, idempotencyKey: input.replacement.idempotencyKey || `${input.mode}:replacement:${input.transactionId}` }));
            return { reversal, replacement };
        });
    }
    /**
     * First-class deposit-to-rent application. Does not mutate the original deposit receipt.
     * Creates a new rental-income transaction which then receives a tax snapshot, VAT eval, and rental-tax eval.
     */
    applyDepositToRent(input) {
        return __awaiter(this, void 0, void 0, function* () {
            let originalDeposit = null;
            if (!input.rentalDepositId) {
                throw new errorHandler_1.AppError('rentalDepositId is required to apply a deposit to rent', 400);
            }
            originalDeposit = yield rentalDeposit_1.RentalDeposit.findOne({
                _id: asObjectId(input.rentalDepositId, 'rentalDepositId'),
                companyId: asObjectId(input.companyId, 'companyId'),
                propertyId: asObjectId(input.propertyId, 'propertyId')
            });
            if (!originalDeposit)
                throw new errorHandler_1.AppError('Deposit not found', 404);
            const related = yield rentalDeposit_1.RentalDeposit.find({
                companyId: originalDeposit.companyId,
                propertyId: originalDeposit.propertyId,
                $or: [
                    { _id: originalDeposit._id },
                    ...(originalDeposit.paymentId ? [{ paymentId: originalDeposit.paymentId }] : []),
                    { paymentId: originalDeposit._id }
                ]
            }).select('type depositAmount').lean();
            const paid = related.filter((row) => row.type !== 'payout').reduce((sum, row) => sum + Number(row.depositAmount || 0), 0);
            const payout = related.filter((row) => row.type === 'payout').reduce((sum, row) => sum + Number(row.depositAmount || 0), 0);
            const held = paid - payout;
            if (Number(input.amount) - held > 0.005) {
                throw new errorHandler_1.AppError('Application exceeds remaining deposit', 400);
            }
            const application = yield this.postEntry({
                companyId: input.companyId,
                userId: input.userId,
                entryType: 'income',
                propertyId: input.propertyId,
                category: 'DEPOSIT_APPLICATION',
                description: input.notes || 'Deposit applied to rent',
                amount: input.amount,
                date: input.date,
                reference: input.reference || (originalDeposit ? `DEP-APP-${String(originalDeposit._id).slice(-8)}` : undefined),
                notes: originalDeposit ? `Application of deposit ${originalDeposit._id}; original deposit was not mutated` : input.notes,
                currency: input.currency,
                vatMode: input.vatMode || 'UNKNOWN',
                idempotencyKey: input.idempotencyKey || `deposit-application:${input.propertyId}:${input.rentalDepositId || 'none'}:${Number(input.amount)}:${String(input.date || '')}`
            });
            if (originalDeposit) {
                const payoutReference = `APPLY-${String(application._id)}`;
                const existingPayout = yield rentalDeposit_1.RentalDeposit.findOne({
                    companyId: originalDeposit.companyId,
                    type: 'payout',
                    referenceNumber: payoutReference
                });
                if (!existingPayout) {
                    yield rentalDeposit_1.RentalDeposit.create({
                        propertyId: originalDeposit.propertyId,
                        agentId: originalDeposit.agentId || asObjectId(input.userId, 'userId'),
                        companyId: originalDeposit.companyId,
                        tenantId: originalDeposit.tenantId,
                        depositAmount: Number(input.amount),
                        depositDate: input.date ? new Date(input.date) : new Date(),
                        paymentId: originalDeposit.paymentId,
                        type: 'payout',
                        referenceNumber: payoutReference,
                        notes: `Deposit application to rent via ${application._id}. Original deposit receipt ${originalDeposit._id} remains unchanged.`,
                        processedBy: asObjectId(input.userId, 'userId')
                    });
                }
            }
            yield writeAudit({
                companyId: input.companyId,
                eventType: 'DEPOSIT_APPLIED_TO_RENT',
                sourceId: String(application._id),
                message: 'Deposit application posted as rental income; original deposit unchanged',
                metadata: {
                    originalDepositId: originalDeposit ? String(originalDeposit._id) : null,
                    originalPaymentId: (originalDeposit === null || originalDeposit === void 0 ? void 0 : originalDeposit.paymentId) ? String(originalDeposit.paymentId) : null,
                    amount: Number(input.amount)
                }
            });
            return application;
        });
    }
    findByIdempotency(companyId, idempotencyKey) {
        return __awaiter(this, void 0, void 0, function* () {
            return LandlordFinancialTransaction_1.LandlordFinancialTransaction.findOne({
                companyId: asObjectId(companyId, 'companyId'),
                idempotencyKey
            });
        });
    }
}
exports.IndividualAccountingService = IndividualAccountingService;
exports.individualAccountingService = new IndividualAccountingService();
exports.default = exports.individualAccountingService;
