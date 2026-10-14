import mongoose from 'mongoose';
import { Property } from '../models/Property';
import type { AccountingTreatment, Transaction } from '../models/PropertyAccount';
import {
  LandlordFinancialTransaction,
  ILandlordFinancialTransaction,
  LandlordSourceKind,
  LandlordVatMode,
  Deductibility,
  CapitalOrRevenue
} from '../models/LandlordFinancialTransaction';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { RentalDeposit } from '../models/rentalDeposit';
import { AppError } from '../middleware/errorHandler';
import { assertPeriodAllowsPosting, findPeriodForDate } from './accountingPeriodService';
import propertyAccountService from './propertyAccountService';
import individualTaxMetadataService from './individualTaxMetadataService';
import individualVatService from './individualVatService';
import individualRentalTaxService from './individualRentalTaxService';
import individualIncomeTaxService from './individualIncomeTaxService';
import { logger } from '../utils/logger';
import {
  classifyLandlordCategory,
  isAllowedLegacyCategory,
  normalizeLandlordCategory
} from './individualAccountingCategories';

export type IndividualEntryType = 'income' | 'expense' | 'maintenance';

export type PostIndividualEntryInput = {
  companyId: string;
  userId: string;
  entryType: IndividualEntryType;
  propertyId: string;
  category?: string;
  description?: string;
  amount: number;
  date?: Date | string;
  reference?: string;
  referenceNumber?: string;
  notes?: string;
  receiptUrl?: string;
  attachments?: string[];
  supplier?: string;
  supplierTin?: string;
  supplierVatNumber?: string;
  invoiceNumber?: string;
  paymentMethod?: string;
  currency?: string;
  vatMode?: LandlordVatMode;
  capitalOrRevenue?: CapitalOrRevenue;
  deductibility?: Deductibility;
  inputVatEligibility?: string;
  sourceMaintenanceId?: string;
  overrideReason?: string;
  idempotencyKey?: string;
};

function asObjectId(value: string, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label}`, 400);
  return new mongoose.Types.ObjectId(value);
}

function ledgerTypeFromTreatment(
  treatment: AccountingTreatment,
  classificationLedger: 'income' | 'expense' | 'maintenance' | 'other'
): Transaction['type'] {
  if (treatment === 'PROPERTY_INCOME') return 'income';
  if (treatment === 'LIABILITY' || treatment === 'CAPITAL') return 'other';
  if (classificationLedger === 'maintenance') return 'maintenance';
  return 'expense';
}

async function writeAudit(input: {
  companyId: string;
  eventType: string;
  sourceId: string;
  message: string;
  metadata: Record<string, unknown>;
}) {
  await AccountingEventLog.create({
    companyId: asObjectId(input.companyId, 'companyId'),
    eventType: input.eventType,
    sourceModule: 'individual_accounting',
    sourceId: input.sourceId,
    success: true,
    message: input.message,
    metadata: input.metadata
  });
}

function reversalPostSpec(original: ILandlordFinancialTransaction): {
  entryType: IndividualEntryType;
  category: string;
} {
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

export class IndividualAccountingService {
  async postEntry(input: PostIndividualEntryInput): Promise<ILandlordFinancialTransaction> {
    const propertyId = String(input.propertyId || '');
    const property = await Property.findOne({
      _id: asObjectId(propertyId, 'propertyId'),
      companyId: asObjectId(input.companyId, 'companyId'),
      isDeleted: { $ne: true }
    }).lean();
    if (!property) throw new AppError('Property not found', 404);

    const amount = Number(input.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError('Amount must be greater than zero', 400);

    const rawCategory = String(input.category || (input.entryType === 'income' ? 'Other Income' : input.entryType === 'maintenance' ? 'Maintenance' : 'Other'));
    if (!isAllowedLegacyCategory(input.entryType, rawCategory) && !isAllowedLegacyCategory(input.entryType, normalizeLandlordCategory(rawCategory, 'EXPENSE'))) {
      throw new AppError(`Invalid ${input.entryType} category`, 400);
    }

    const category = normalizeLandlordCategory(
      rawCategory,
      input.entryType === 'income' ? 'OTHER_INCOME' : input.entryType === 'maintenance' ? 'MAINTENANCE' : 'EXPENSE'
    );
    const classified = classifyLandlordCategory(category);
    if (input.entryType === 'income' && classified.sourceKind !== 'OTHER_INCOME') {
      throw new AppError('Income entries cannot use deposit or capital categories', 400);
    }

    const date = input.date ? new Date(input.date) : new Date();
    if (Number.isNaN(date.getTime())) throw new AppError('Invalid date', 400);

    const idempotencyKey = String(input.idempotencyKey || `${input.entryType}:${propertyId}:${Date.now()}`);
    const existing = await LandlordFinancialTransaction.findOne({
      companyId: asObjectId(input.companyId, 'companyId'),
      idempotencyKey
    });
    if (existing) {
      await this.ensureTaxOverlay(existing, input);
      return existing;
    }

    const periodGate = await assertPeriodAllowsPosting({
      companyId: input.companyId,
      transactionDate: date,
      overrideReason: input.overrideReason,
      actorId: input.userId,
      sourceModule: 'individual_accounting',
      sourceId: idempotencyKey
    });
    const period = await findPeriodForDate(input.companyId, date);

    const vatMode: LandlordVatMode = input.vatMode || classified.vatModeDefault;
    const sourceKind: LandlordSourceKind = classified.sourceKind;
    const attachments = Array.isArray(input.attachments)
      ? input.attachments
      : input.receiptUrl
        ? [String(input.receiptUrl)]
        : [];

    let canonical: ILandlordFinancialTransaction;
    try {
      canonical = await LandlordFinancialTransaction.create({
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
        accountingPeriodId: period?._id,
        sourceMaintenanceId: input.sourceMaintenanceId ? asObjectId(input.sourceMaintenanceId, 'maintenanceId') : undefined
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        const dup = await LandlordFinancialTransaction.findOne({
          companyId: asObjectId(input.companyId, 'companyId'),
          idempotencyKey
        });
        if (dup) {
          await this.ensureTaxOverlay(dup, input);
          return dup;
        }
      }
      throw error;
    }

    const projected = await propertyAccountService.appendManualLedgerTransaction({
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

    canonical.propertyAccountId = projected.accountId as any;
    canonical.propertyAccountTransactionId = projected.transactionId as any;
    await LandlordFinancialTransaction.updateOne(
      { _id: canonical._id },
      {
        $set: {
          propertyAccountId: projected.accountId,
          propertyAccountTransactionId: projected.transactionId
        }
      }
    );

    await this.ensureTaxOverlay(canonical, input);

    await writeAudit({
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
  }

  async ensureTaxOverlay(canonical: ILandlordFinancialTransaction, input: PostIndividualEntryInput) {
    const sourceKind = canonical.sourceKind;
    try {
      await individualTaxMetadataService.attachForLandlordEntry({
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
    } catch (error: any) {
      logger.warn('Individual tax overlay failed after accounting post; accounting remains valid', {
        sourceId: String(canonical._id),
        statusCode: error?.statusCode,
        message: error?.message || error
      });
    }
  }

  async reverseEntry(input: {
    companyId: string;
    userId: string;
    propertyId: string;
    transactionId: string;
    mode: 'edit' | 'delete';
    replacement?: PostIndividualEntryInput;
  }): Promise<{ reversal: ILandlordFinancialTransaction; replacement?: ILandlordFinancialTransaction }> {
    const original = await LandlordFinancialTransaction.findOne({
      _id: asObjectId(input.transactionId, 'transactionId'),
      companyId: asObjectId(input.companyId, 'companyId'),
      propertyId: asObjectId(input.propertyId, 'propertyId')
    });
    if (!original) throw new AppError('Ledger entry not found', 404);
    if (original.status === 'REVERSED') throw new AppError('Entry is already reversed', 409);

    const reversalSpec = reversalPostSpec(original);
    const reversalKey = `${input.mode}:reversal:${input.transactionId}`;
    const reversal = await this.postEntry({
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

    await LandlordFinancialTransaction.updateOne(
      { _id: original._id, status: 'POSTED' },
      { $set: { status: 'REVERSED', reversedBy: reversal._id } }
    );
    await individualVatService.safeReverseForSource({
      companyId: input.companyId,
      sourceType: 'LandlordFinancialTransaction',
      sourceId: String(original._id),
      reason: `${input.mode} reversal`,
      reversalTransactionId: String(reversal._id),
      userId: input.userId
    });
    await individualRentalTaxService.safeReverseForSource({
      companyId: input.companyId,
      sourceType: 'LandlordFinancialTransaction',
      sourceId: String(original._id),
      reason: `${input.mode} reversal`,
      reversalTransactionId: String(reversal._id),
      userId: input.userId
    });
    await individualIncomeTaxService.safeReverseForSource({
      companyId: input.companyId,
      sourceType: 'LandlordFinancialTransaction',
      sourceId: String(original._id),
      reason: `${input.mode} reversal`,
      reversalTransactionId: String(reversal._id),
      userId: input.userId
    });

    await writeAudit({
      companyId: input.companyId,
      eventType: original.sourceKind === 'OTHER_INCOME' ? 'INCOME_REVERSED' : 'EXPENSE_REVERSED',
      sourceId: String(original._id),
      message: `Reversed ${original.sourceKind} via ${String(reversal._id)}`,
      metadata: { reversalId: String(reversal._id), mode: input.mode }
    });

    if (input.mode === 'delete' || !input.replacement) {
      return { reversal };
    }

    const replacement = await this.postEntry({
      ...input.replacement,
      companyId: input.companyId,
      userId: input.userId,
      propertyId: input.propertyId,
      idempotencyKey: input.replacement.idempotencyKey || `${input.mode}:replacement:${input.transactionId}`
    });
    return { reversal, replacement };
  }

  /**
   * First-class deposit-to-rent application. Does not mutate the original deposit receipt.
   * Creates a new rental-income transaction which then receives a tax snapshot, VAT eval, and rental-tax eval.
   */
  async applyDepositToRent(input: {
    companyId: string;
    userId: string;
    propertyId: string;
    amount: number;
    date?: Date | string;
    rentalDepositId?: string;
    notes?: string;
    reference?: string;
    currency?: string;
    vatMode?: LandlordVatMode;
    idempotencyKey?: string;
  }) {
    let originalDeposit: any = null;
    if (!input.rentalDepositId) {
      throw new AppError('rentalDepositId is required to apply a deposit to rent', 400);
    }
    originalDeposit = await RentalDeposit.findOne({
      _id: asObjectId(input.rentalDepositId, 'rentalDepositId'),
      companyId: asObjectId(input.companyId, 'companyId'),
      propertyId: asObjectId(input.propertyId, 'propertyId')
    });
    if (!originalDeposit) throw new AppError('Deposit not found', 404);

    const related = await RentalDeposit.find({
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
      throw new AppError('Application exceeds remaining deposit', 400);
    }

    const application = await this.postEntry({
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
      const existingPayout = await RentalDeposit.findOne({
        companyId: originalDeposit.companyId,
        type: 'payout',
        referenceNumber: payoutReference
      });
      if (!existingPayout) {
        await RentalDeposit.create({
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

    await writeAudit({
      companyId: input.companyId,
      eventType: 'DEPOSIT_APPLIED_TO_RENT',
      sourceId: String(application._id),
      message: 'Deposit application posted as rental income; original deposit unchanged',
      metadata: {
        originalDepositId: originalDeposit ? String(originalDeposit._id) : null,
        originalPaymentId: originalDeposit?.paymentId ? String(originalDeposit.paymentId) : null,
        amount: Number(input.amount)
      }
    });

    return application;
  }

  async findByIdempotency(companyId: string, idempotencyKey: string) {
    return LandlordFinancialTransaction.findOne({
      companyId: asObjectId(companyId, 'companyId'),
      idempotencyKey
    });
  }
}

export const individualAccountingService = new IndividualAccountingService();
export default individualAccountingService;
