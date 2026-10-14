import { Request, Response } from 'express';
import mongoose from 'mongoose';
import PropertyAccount, { IPropertyAccount, Transaction, OwnerPayout, PassThroughChargeType } from '../models/PropertyAccount';
import { Payment } from '../models/Payment';
import { Property } from '../models/Property';
import { PropertyOwner } from '../models/PropertyOwner';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { Development } from '../models/Development';
import { DevelopmentUnit } from '../models/DevelopmentUnit';
import SystemSetting from '../models/SystemSetting';
import { v4 as uuidv4 } from 'uuid';
import { mainConnection, accountingConnection } from '../config/database';
import chargeTypeService from './chargeTypeService';
import { emitPropertyAccountUpdated } from '../events/propertyAccountSocket';
import {
  buildOwnerIncomeLedgerTargets,
  checkPaymentAccountingCompleteness,
  computeOwnerIncomeAmount,
  shouldSkipRecordIncomePosting,
  type PaymentAccountingCompletenessDeps
} from './paymentAccountingCompleteness';
import { evaluatePermanentAccountingPolicy } from './accountingPostingPolicy';
import {
  historicalTransactionDomain,
  ledgerForDomain,
  OwnerIncomeAmountMissingError
} from './transactionDomain';
import { classifyDuplicateGroup, classifyLedgerTransactionDuplicates } from './propertyAccountDuplicateInventory';
import { computePropertyAccountTotals } from './propertyAccountTotals';
import { isIndexCreationAllowed } from './ledgerMutationPolicy';
import { throwOnceIfArmed } from './testFailureSeam';

// Upgrade legacy indexes: allow separate ledgers per property
let ledgerIndexUpgradePromise: Promise<void> | null = null;

const PASS_THROUGH_TYPE_LABELS: Record<string, string> = {
  LEVY: 'Levies',
  WATER: 'Water Recoveries',
  ELECTRICITY: 'Electricity Recoveries',
  RATES: 'Rates',
  SECURITY: 'Security',
  INSURANCE: 'Insurance Recoveries',
  MUNICIPAL: 'Municipal Charges',
  OTHER: 'Other Pass-Through Charges'
};

export class PropertyAccountService {
  private static instance: PropertyAccountService;
  private static readonly ONE_TIME_DUPLICATE_CLEANUP_KEY = 'property_account_duplicate_cleanup_v1';

  public static getInstance(): PropertyAccountService {
    if (!PropertyAccountService.instance) {
      PropertyAccountService.instance = new PropertyAccountService();
    }
    return PropertyAccountService.instance;
  }

  private isDuplicateKeyError(error: any): boolean {
    return (
      error?.code === 11000 ||
      /duplicate key/i.test(String(error?.message || ''))
    );
  }

  private getFirstEnv(keys: string[]): string {
    for (const key of keys) {
      const value = process.env[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  private getResolvedMongoUris(): { mainUri: string; accountingUri: string } {
    const mainUri = this.getFirstEnv([
      'MONGODB_URI',
      'MONGODB_URI_PROPERTY',
      'CUSTOMCONNSTR_MONGODB_URI',
      'CUSTOMCONNSTR_MONGODB_URI_PROPERTY',
      'AZURE_COSMOS_CONNECTIONSTRING',
    ]);
    const accountingUri = this.getFirstEnv([
      'ACCOUNTING_DB_URI',
      'MONGODB_URI_ACCOUNTING',
      'CUSTOMCONNSTR_ACCOUNTING_DB_URI',
      'CUSTOMCONNSTR_MONGODB_URI_ACCOUNTING',
    ]);
    return { mainUri, accountingUri };
  }

  private isCosmosMongoEndpoint(): boolean {
    const { mainUri, accountingUri } = this.getResolvedMongoUris();
    if (/cosmos\.azure\.com/i.test(`${mainUri} ${accountingUri}`)) {
      return true;
    }
    // Fallback to active runtime connections in case env URIs are masked or transformed by platform settings.
    try {
      const defaultHost = String((mongoose.connection as any)?.host || '');
      const mainHost = String((mainConnection as any)?.host || '');
      const accountingHost = String((accountingConnection as any)?.host || '');
      return /cosmos\.azure\.com/i.test(`${defaultHost} ${mainHost} ${accountingHost}`);
    } catch {
      return false;
    }
  }

  private isCosmosPartialFilterUnsupported(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return (
      message.includes('partialfilterexpression') ||
      message.includes('$and only supported in partialfilterexpression at top level')
    );
  }

  private normalizeLedgerType(value: any): 'rental' | 'sale' {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'sale' ? 'sale' : 'rental';
  }

  private async resolveCompanyIdForEntity(entityId: string): Promise<string | undefined> {
    try {
      const property = await Property.findById(entityId).select('companyId').lean();
      if ((property as any)?.companyId) return String((property as any).companyId);
      const development = await Development.findById(entityId).select('companyId').lean();
      if ((development as any)?.companyId) return String((development as any).companyId);
      const unit = await DevelopmentUnit.findById(entityId).select('developmentId').lean();
      if ((unit as any)?.developmentId) {
        const parent = await Development.findById((unit as any).developmentId).select('companyId').lean();
        if ((parent as any)?.companyId) return String((parent as any).companyId);
      }
    } catch (error) {
      logger.warn('Failed to resolve companyId for property-account socket emit', { entityId, error });
    }
    return undefined;
  }

  private notifyAccountUpdated(opts: {
    companyId?: any;
    propertyId?: string;
    accountId?: any;
    paymentId?: string;
    eventType: string;
  }): void {
    void (async () => {
      try {
        let companyId = opts.companyId ? String(opts.companyId) : undefined;
        if (!companyId && opts.propertyId) {
          companyId = await this.resolveCompanyIdForEntity(opts.propertyId);
        }
        emitPropertyAccountUpdated({
          companyId,
          propertyId: opts.propertyId,
          accountId: opts.accountId ? String(opts.accountId) : undefined,
          paymentId: opts.paymentId,
          eventType: opts.eventType
        });
      } catch (error) {
        logger.warn('propertyAccount.updated notify failed (non-fatal)', error);
      }
    })();
  }

  private async shouldRunOneTimeDuplicateCleanup(): Promise<boolean> {
    try {
      const key = PropertyAccountService.ONE_TIME_DUPLICATE_CLEANUP_KEY;
      const existing = await SystemSetting.findOne({ key }).lean();
      if (existing?.completedAt) return false;
      if (existing?.startedAt && !existing?.completedAt) {
        // Another instance likely started this already; skip to avoid duplicate heavy scans.
        return false;
      }
      await SystemSetting.updateOne(
        { key },
        { $setOnInsert: { key, version: 1, startedAt: new Date() } },
        { upsert: true }
      );
      return true;
    } catch (e: any) {
      console.warn('Could not evaluate one-time duplicate cleanup state; proceeding defensively without heavy cleanup:', e?.message || e);
      return false;
    }
  }

  private async markOneTimeDuplicateCleanupComplete(result: { archived: number; normalized: number }): Promise<void> {
    try {
      const key = PropertyAccountService.ONE_TIME_DUPLICATE_CLEANUP_KEY;
      await SystemSetting.updateOne(
        { key },
        {
          $set: {
            completedAt: new Date(),
            value: result,
            lastError: undefined
          },
          $setOnInsert: { key, version: 1, startedAt: new Date() }
        },
        { upsert: true }
      );
    } catch (e: any) {
      console.warn('Could not mark one-time duplicate cleanup as complete:', e?.message || e);
    }
  }

  private async markOneTimeDuplicateCleanupError(error: any): Promise<void> {
    try {
      const key = PropertyAccountService.ONE_TIME_DUPLICATE_CLEANUP_KEY;
      await SystemSetting.updateOne(
        { key },
        {
          $set: {
            lastError: String(error?.message || error),
            startedAt: new Date()
          },
          $setOnInsert: { key, version: 1 }
        },
        { upsert: true }
      );
    } catch {}
  }

  private async normalizeActiveLedgerTypes(): Promise<number> {
    const accounts = await PropertyAccount.find({
      isArchived: false,
      $or: [
        { ledgerType: { $exists: false } },
        { ledgerType: null as any },
        { ledgerType: '' as any },
        { ledgerType: { $nin: ['rental', 'sale'] } as any }
      ]
    } as any).select('_id propertyId ledgerType');

    let modified = 0;
    for (const account of accounts as any[]) {
      try {
        const resolution = await this.resolveLedgerTypeForProperty(
          String(account.propertyId),
          'normalizeActiveLedgerTypes',
          String(account._id)
        );
        const result = await PropertyAccount.updateOne(
          { _id: account._id, isArchived: false },
          { $set: { ledgerType: resolution.ledgerType, lastUpdated: new Date() } }
        );
        modified += Number((result as any)?.modifiedCount || 0);
      } catch (error: any) {
        logger.warn('Skipping PropertyAccount ledgerType normalization because Property business type could not be resolved', {
          propertyId: String(account.propertyId || ''),
          propertyAccountId: String(account._id || ''),
          currentLedgerType: String(account.ledgerType || ''),
          error: error?.message || String(error)
        });
      }
    }
    return modified;
  }

  // Keep one active ledger per (propertyId, normalized ledgerType), archive the rest.
  private async archiveDuplicateActiveLedgers(): Promise<number> {
    try {
      const normalized = await this.normalizeActiveLedgerTypes();
      if (normalized > 0) {
        console.log(`Normalized ${normalized} PropertyAccount ledgerType values to canonical values before duplicate cleanup.`);
      }
    } catch (normalizeErr: any) {
      console.warn('Could not normalize active ledgerType values before duplicate cleanup:', normalizeErr?.message || normalizeErr);
    }

    const active = await PropertyAccount.find({ isArchived: false })
      .select('_id propertyId ledgerType lastUpdated createdAt')
      .sort({ lastUpdated: -1, createdAt: -1 });

    const seen = new Set<string>();
    const archiveIds: mongoose.Types.ObjectId[] = [];

    for (const account of active as any[]) {
      const normalizedLedger = this.normalizeLedgerType((account as any).ledgerType);
      const key = `${String(account.propertyId)}|${normalizedLedger}`;
      if (seen.has(key)) {
        archiveIds.push(account._id);
      } else {
        seen.add(key);
      }
    }

    if (archiveIds.length === 0) return 0;

    const result = await PropertyAccount.updateMany(
      { _id: { $in: archiveIds } },
      { $set: { isArchived: true, lastUpdated: new Date() } }
    );
    return Number((result as any)?.modifiedCount || 0);
  }

  async resolveLedgerTypeForProperty(
    propertyId: string,
    callingService = 'unknown',
    propertyAccountId?: string
  ): Promise<{ ledgerType: 'rental' | 'sale'; businessType: string }> {
    const property = await Property.findById(propertyId).lean();
    if (property) {
      const rt = String((property as any)?.rentalType || '').toLowerCase();
      let ledgerType: 'rental' | 'sale' | null = null;
      if (rt === 'introduction' || rt === 'management') ledgerType = 'rental';
      if (rt === 'sale') ledgerType = 'sale';
      if (!ledgerType) {
        throw new AppError('Unable to determine ledger type: Property.rentalType must be sale, management, or introduction', 400);
      }
      logger.info('Resolved PropertyAccount ledger type from Property.rentalType', {
        propertyId,
        propertyBusinessType: rt,
        resolvedLedgerType: ledgerType,
        callingService,
        propertyAccountId
      });
      return { ledgerType, businessType: rt };
    }

    // Backward compatibility for existing development/unit sale ledgers. This is
    // still resolved centrally here; callers must not assume the ledger type.
    const dev = await Development.findById(propertyId).select('_id').lean();
    if (dev) {
      logger.warn('Resolved ledger type for Development through compatibility resolver', {
        propertyId,
        propertyBusinessType: 'development',
        resolvedLedgerType: 'sale',
        callingService,
        propertyAccountId
      });
      return { ledgerType: 'sale', businessType: 'development' };
    }
    const unit = await DevelopmentUnit.findById(propertyId).select('_id').lean();
    if (unit) {
      logger.warn('Resolved ledger type for DevelopmentUnit through compatibility resolver', {
        propertyId,
        propertyBusinessType: 'development_unit',
        resolvedLedgerType: 'sale',
        callingService,
        propertyAccountId
      });
      return { ledgerType: 'sale', businessType: 'development_unit' };
    }
    throw new AppError('Unable to determine ledger type: entity not found', 404);
  }

  private activeAccountCandidatesQuery(propertyId: mongoose.Types.ObjectId, ledgerType: 'rental' | 'sale'): Record<string, any> {
    return {
      propertyId,
      ledgerType,
      isArchived: false,
      isActive: { $ne: false }
    };
  }

  private activeAccountQuery(propertyId: mongoose.Types.ObjectId, ledgerType: 'rental' | 'sale'): Record<string, any> {
    return {
      propertyId,
      ledgerType,
      isArchived: false,
      isActive: { $ne: false }
    };
  }

  private validateWritableAccount(account: IPropertyAccount | null | undefined, propertyId: string, callingFunction: string): IPropertyAccount {
    if (!account) {
      throw new AppError(`PropertyAccount not found for writable operation (${callingFunction})`, 404);
    }
    if ((account as any).isArchived === true) {
      throw new AppError(`Refusing to write to archived PropertyAccount ${String((account as any)._id)} in ${callingFunction}`, 409);
    }
    if ((account as any).isActive === false) {
      throw new AppError(`Refusing to write to inactive PropertyAccount ${String((account as any)._id)} in ${callingFunction}`, 409);
    }
    if (String((account as any).propertyId) !== String(propertyId)) {
      throw new AppError(`PropertyAccount ${String((account as any)._id)} does not belong to requested property ${propertyId}`, 409);
    }
    this.logWritableAccountSelection(account, callingFunction);
    return account;
  }

  private logWritableAccountSelection(account: IPropertyAccount, callingFunction: string): void {
    logger.info('Selected PropertyAccount for write', {
      propertyId: String((account as any).propertyId),
      propertyAccountId: String((account as any)._id),
      isArchived: Boolean((account as any).isArchived),
      ledgerType: String((account as any).ledgerType || 'legacy'),
      callingFunction
    } as any);
  }

  private normalizePassThroughType(type?: string): string {
    const normalized = String(type || 'OTHER')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || 'OTHER';
  }

  private getPassThroughLabel(type: string): string {
    const normalized = this.normalizePassThroughType(type);
    return PASS_THROUGH_TYPE_LABELS[normalized] || normalized
      .toLowerCase()
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private recalculatePassThroughAccounts(accounts: any[] = []): {
    accounts: any[];
    collected: number;
    paid: number;
    outstanding: number;
  } {
    let collected = 0;
    let paid = 0;
    const normalizedAccounts = accounts.map((account: any) => {
      const plain = account?.toObject ? account.toObject() : account;
      const type = this.normalizePassThroughType(plain?.type);
      const transactions = Array.isArray(plain?.transactions) ? plain.transactions : [];
      const totalCollected = transactions
        .filter((tx: any) => tx?.type === 'collection' && tx?.status === 'completed')
        .reduce((sum: number, tx: any) => sum + Number(tx?.amount || 0), 0);
      const totalPaid = transactions
        .filter((tx: any) => tx?.type === 'payment' && tx?.status === 'completed')
        .reduce((sum: number, tx: any) => sum + Number(tx?.amount || 0), 0);
      collected += totalCollected;
      paid += totalPaid;
      return {
        ...plain,
        type,
        label: plain?.label || this.getPassThroughLabel(type),
        totalCollected: Number(totalCollected.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        runningBalance: Number((totalCollected - totalPaid).toFixed(2)),
        transactions,
        lastUpdated: new Date()
      };
    });

    return {
      accounts: normalizedAccounts,
      collected: Number(collected.toFixed(2)),
      paid: Number(paid.toFixed(2)),
      outstanding: Number((collected - paid).toFixed(2))
    };
  }

  private upsertPassThroughTransaction(
    accounts: any[],
    chargeType: string,
    transaction: any,
    duplicatePredicate: (tx: any) => boolean
  ): { accounts: any[]; inserted: boolean } {
    const type = this.normalizePassThroughType(chargeType);
    const nextAccounts = (Array.isArray(accounts) ? accounts : []).map((account: any) => {
      const plain = account?.toObject ? account.toObject() : account;
      return {
        ...plain,
        type: this.normalizePassThroughType(plain?.type),
        transactions: Array.isArray(plain?.transactions) ? [...plain.transactions] : []
      };
    });
    let target = nextAccounts.find((account: any) => this.normalizePassThroughType(account?.type) === type);
    if (!target) {
      target = {
        type,
        label: this.getPassThroughLabel(type),
        runningBalance: 0,
        totalCollected: 0,
        totalPaid: 0,
        transactions: [],
        lastUpdated: new Date()
      };
      nextAccounts.push(target);
    }

    const exists = (target.transactions || []).some(duplicatePredicate);
    if (exists) {
      return { accounts: nextAccounts, inserted: false };
    }

    target.transactions.push(transaction);
    return { accounts: nextAccounts, inserted: true };
  }

  private async reloadWritableAccount(accountId: any, propertyId: string): Promise<IPropertyAccount> {
    const fresh = await PropertyAccount.findOne({
      _id: accountId,
      isArchived: false,
      isActive: { $ne: false }
    });
    if (!fresh) {
      return this.validateWritableAccount(
        await this.getOrCreatePropertyAccount(propertyId),
        propertyId,
        'reloadWritableAccount'
      );
    }
    return this.validateWritableAccount(fresh as IPropertyAccount, propertyId, 'reloadWritableAccount');
  }

  /**
   * Append a pass-through row without replacing the sibling buckets/transactions.
   */
  private async pushPassThroughTransactionAtomic(opts: {
    account: IPropertyAccount;
    propertyId: string;
    chargeType: string;
    transaction: any;
    idKey: string;
    incrementCollected?: number;
    incrementPaid?: number;
  }): Promise<'inserted' | 'duplicate'> {
    const { account, propertyId, chargeType, transaction, idKey } = opts;
    const type = this.normalizePassThroughType(chargeType);
    const amountIncCollected = Number(opts.incrementCollected || 0);
    const amountIncPaid = Number(opts.incrementPaid || 0);

    const already = await PropertyAccount.findOne({
      _id: (account as any)._id,
      'passThroughAccounts.transactions.idempotencyKey': idKey
    }).select('_id').lean();
    if (already) return 'duplicate';

    const intoBucket = await PropertyAccount.updateOne(
      {
        _id: (account as any)._id,
        propertyId: (account as any).propertyId,
        isArchived: false,
        isActive: { $ne: false },
        passThroughAccounts: {
          $elemMatch: {
            type,
            'transactions.idempotencyKey': { $ne: idKey }
          }
        }
      },
      {
        $push: { 'passThroughAccounts.$.transactions': transaction },
        $inc: {
          passThroughCollected: amountIncCollected,
          passThroughPaid: amountIncPaid,
          ledgerRevision: 1
        },
        $set: { lastUpdated: new Date() }
      }
    );
    if (Number((intoBucket as any).modifiedCount || 0) > 0) {
      const fresh = await PropertyAccount.findOne({ _id: (account as any)._id, isArchived: false });
      if (fresh) await this.recalculateBalance(fresh as any);
      return 'inserted';
    }

    const created = await PropertyAccount.updateOne(
      {
        _id: (account as any)._id,
        propertyId: (account as any).propertyId,
        isArchived: false,
        isActive: { $ne: false },
        'passThroughAccounts.type': { $ne: type },
        'passThroughAccounts.transactions.idempotencyKey': { $ne: idKey }
      },
      {
        $push: {
          passThroughAccounts: {
            type,
            label: this.getPassThroughLabel(type),
            runningBalance: amountIncCollected - amountIncPaid,
            totalCollected: amountIncCollected,
            totalPaid: amountIncPaid,
            transactions: [transaction],
            lastUpdated: new Date()
          }
        },
        $inc: {
          passThroughCollected: amountIncCollected,
          passThroughPaid: amountIncPaid,
          ledgerRevision: 1
        },
        $set: { lastUpdated: new Date() }
      }
    );
    if (Number((created as any).modifiedCount || 0) > 0) {
      const fresh = await PropertyAccount.findOne({ _id: (account as any)._id, isArchived: false });
      if (fresh) await this.recalculateBalance(fresh as any);
      return 'inserted';
    }

    const raced = await PropertyAccount.findOne({
      _id: (account as any)._id,
      'passThroughAccounts.transactions.idempotencyKey': idKey
    }).select('_id').lean();
    if (raced) return 'duplicate';

    const retry = await PropertyAccount.updateOne(
      {
        _id: (account as any)._id,
        propertyId: (account as any).propertyId,
        isArchived: false,
        isActive: { $ne: false },
        passThroughAccounts: {
          $elemMatch: {
            type,
            'transactions.idempotencyKey': { $ne: idKey }
          }
        }
      },
      {
        $push: { 'passThroughAccounts.$.transactions': transaction },
        $inc: {
          passThroughCollected: amountIncCollected,
          passThroughPaid: amountIncPaid,
          ledgerRevision: 1
        },
        $set: { lastUpdated: new Date() }
      }
    );
    if (Number((retry as any).modifiedCount || 0) > 0) {
      const fresh = await PropertyAccount.findOne({ _id: (account as any)._id, isArchived: false });
      if (fresh) await this.recalculateBalance(fresh as any);
      return 'inserted';
    }
    logger.warn('Pass-through atomic push matched no document', { propertyId, type, idKey });
    return 'duplicate';
  }

  calculatePassThroughSummary(account: IPropertyAccount | any): {
    accounts: any[];
    collected: number;
    paid: number;
    outstanding: number;
    byType: Record<string, { label: string; collected: number; paid: number; outstanding: number }>;
  } {
    const summary = this.recalculatePassThroughAccounts((account as any)?.passThroughAccounts || []);
    const byType: Record<string, { label: string; collected: number; paid: number; outstanding: number }> = {};
    for (const passThroughAccount of summary.accounts) {
      const type = this.normalizePassThroughType(passThroughAccount.type);
      byType[type] = {
        label: passThroughAccount.label || this.getPassThroughLabel(type),
        collected: Number(passThroughAccount.totalCollected || 0),
        paid: Number(passThroughAccount.totalPaid || 0),
        outstanding: Number(passThroughAccount.runningBalance || 0)
      };
    }
    return { ...summary, byType };
  }

  async recordPassThroughCollection(input: {
    propertyId: string;
    chargeType: PassThroughChargeType;
    companyId?: string;
    amount: number;
    date?: Date;
    paymentId?: string;
    levyPaymentId?: string;
    referenceNumber?: string;
    description?: string;
    processedBy?: string;
    notes?: string;
    idempotencyKey?: string;
  }): Promise<IPropertyAccount> {
    const amount = Number(input.amount || 0);
    if (amount <= 0) {
      throw new AppError('Pass-through collection amount must be greater than 0', 400);
    }
    const chargeType = this.normalizePassThroughType(input.chargeType);
    const chargeTypeConfig = await chargeTypeService.getChargeTypeByCode(chargeType, input.companyId, { throwIfMissing: true });
    if (chargeTypeConfig?.category !== 'PASS_THROUGH') {
      throw new AppError(`Charge type ${chargeType} is not configured as pass-through`, 400);
    }
    const idKey = input.idempotencyKey || `pass-through:${chargeType}:collection:${input.paymentId || uuidv4()}`;
    const account = this.validateWritableAccount(
      await this.getOrCreatePropertyAccount(input.propertyId),
      input.propertyId,
      'recordPassThroughCollection'
    );

    const transaction = {
      type: 'collection',
      amount,
      date: input.date || new Date(),
      paymentId: input.paymentId ? new mongoose.Types.ObjectId(input.paymentId) : undefined,
      levyPaymentId: input.levyPaymentId ? new mongoose.Types.ObjectId(input.levyPaymentId) : undefined,
      chargeTypeCode: chargeTypeConfig?.code,
      chargeTypeId: chargeTypeConfig?._id,
      idempotencyKey: idKey,
      description: input.description || `${chargeTypeConfig?.name || this.getPassThroughLabel(chargeType)} collected`,
      referenceNumber: input.referenceNumber,
      status: 'completed',
      processedBy: input.processedBy ? new mongoose.Types.ObjectId(input.processedBy) : undefined,
      notes: input.notes,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const pushed = await this.pushPassThroughTransactionAtomic({
      account,
      propertyId: input.propertyId,
      chargeType,
      transaction,
      idKey,
      incrementCollected: amount
    });
    if (pushed === 'duplicate') {
      return account;
    }

    this.notifyAccountUpdated({
      companyId: input.companyId,
      propertyId: input.propertyId,
      accountId: (account as any)._id,
      paymentId: input.paymentId,
      eventType: 'pass_through_updated'
    });

    return this.reloadWritableAccount((account as any)._id, input.propertyId);
  }

  async recordPassThroughPayment(input: {
    propertyId: string;
    chargeType: PassThroughChargeType;
    companyId?: string;
    amount: number;
    date?: Date;
    paymentId?: string;
    levyPaymentId?: string;
    referenceNumber?: string;
    description?: string;
    processedBy?: string;
    notes?: string;
    idempotencyKey?: string;
    ledgerType?: 'rental' | 'sale';
  }): Promise<IPropertyAccount> {
    const amount = Number(input.amount || 0);
    if (amount <= 0) {
      throw new AppError('Pass-through payment amount must be greater than 0', 400);
    }
    const chargeType = this.normalizePassThroughType(input.chargeType);
    const chargeTypeConfig = await chargeTypeService.getChargeTypeByCode(chargeType, input.companyId, { throwIfMissing: true });
    if (chargeTypeConfig?.category !== 'PASS_THROUGH') {
      throw new AppError(`Charge type ${chargeType} is not configured as pass-through`, 400);
    }
    const idKey = input.idempotencyKey || `pass-through:${chargeType}:payment:${input.levyPaymentId || input.paymentId || uuidv4()}`;
    const account = this.validateWritableAccount(
      await this.getOrCreatePropertyAccount(input.propertyId, input.ledgerType),
      input.propertyId,
      'recordPassThroughPayment'
    );

    const transaction = {
      type: 'payment',
      amount,
      date: input.date || new Date(),
      paymentId: input.paymentId ? new mongoose.Types.ObjectId(input.paymentId) : undefined,
      levyPaymentId: input.levyPaymentId ? new mongoose.Types.ObjectId(input.levyPaymentId) : undefined,
      chargeTypeCode: chargeTypeConfig?.code,
      chargeTypeId: chargeTypeConfig?._id,
      idempotencyKey: idKey,
      description: input.description || `${chargeTypeConfig?.name || this.getPassThroughLabel(chargeType)} paid`,
      referenceNumber: input.referenceNumber,
      status: 'completed',
      processedBy: input.processedBy ? new mongoose.Types.ObjectId(input.processedBy) : undefined,
      notes: input.notes,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const pushed = await this.pushPassThroughTransactionAtomic({
      account,
      propertyId: input.propertyId,
      chargeType,
      transaction,
      idKey,
      incrementPaid: amount
    });
    if (pushed === 'duplicate') {
      return account;
    }

    this.notifyAccountUpdated({
      companyId: input.companyId,
      propertyId: input.propertyId,
      accountId: (account as any)._id,
      paymentId: input.paymentId,
      eventType: 'pass_through_updated'
    });

    return this.reloadWritableAccount((account as any)._id, input.propertyId);
  }

  async getCompanyPassThroughSummary(companyId: string): Promise<{
    totalCollected: number;
    totalPaid: number;
    totalOutstanding: number;
    byType: Record<string, { label: string; collected: number; paid: number; outstanding: number }>;
  }> {
    const [properties, developments] = await Promise.all([
      Property.find({ companyId }).select('_id').lean(),
      Development.find({ companyId }).select('_id').lean()
    ]);
    const propertyIds = properties.map((property: any) => property._id);
    const developmentIds = developments.map((development: any) => development._id);
    let unitIds: any[] = [];
    if (developmentIds.length > 0) {
      try {
        const units = await DevelopmentUnit.find({ developmentId: { $in: developmentIds } }).select('_id').lean();
        unitIds = units.map((unit: any) => unit._id);
      } catch {}
    }

    const allIds = [...propertyIds, ...developmentIds, ...unitIds];
    if (allIds.length === 0) {
      return { totalCollected: 0, totalPaid: 0, totalOutstanding: 0, byType: {} };
    }

    const accounts = await PropertyAccount.find({
      propertyId: { $in: allIds },
      isArchived: false,
      isActive: { $ne: false }
    })
      .select('passThroughAccounts passThroughCollected passThroughPaid passThroughOutstanding')
      .lean();

    const byType: Record<string, { label: string; collected: number; paid: number; outstanding: number }> = {};
    let totalCollected = 0;
    let totalPaid = 0;
    for (const account of accounts as any[]) {
      const summary = this.calculatePassThroughSummary(account);
      totalCollected += summary.collected;
      totalPaid += summary.paid;
      for (const [type, row] of Object.entries(summary.byType)) {
        byType[type] = byType[type] || { label: row.label, collected: 0, paid: 0, outstanding: 0 };
        byType[type].collected = Number((byType[type].collected + row.collected).toFixed(2));
        byType[type].paid = Number((byType[type].paid + row.paid).toFixed(2));
        byType[type].outstanding = Number((byType[type].outstanding + row.outstanding).toFixed(2));
      }
    }

    return {
      totalCollected: Number(totalCollected.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      totalOutstanding: Number((totalCollected - totalPaid).toFixed(2)),
      byType
    };
  }

  /**
   * Get or create property account
   */
  async getOrCreatePropertyAccount(propertyId: string, ledgerOverride?: 'rental' | 'sale'): Promise<IPropertyAccount> {
    try {
      const effectiveLedger = ledgerOverride
        ?? (await this.resolveLedgerTypeForProperty(propertyId, 'getOrCreatePropertyAccount')).ledgerType;
      const propertyObjectId = new mongoose.Types.ObjectId(propertyId);

      const activeAccounts = await PropertyAccount.find(this.activeAccountCandidatesQuery(propertyObjectId, effectiveLedger));
      if (activeAccounts.length > 1) {
        throw new AppError(
          `Multiple active PropertyAccounts found for property ${propertyId} (${effectiveLedger}); refusing to choose a writable ledger`,
          409
        );
      }

      let account = activeAccounts[0] as IPropertyAccount | undefined;
      if (account) {
        return this.validateWritableAccount(account, propertyId, 'getOrCreatePropertyAccount');
      }
      
      if (!account) {
        // Try resolve as a Property; if not found, try as a Development; then as a Development Unit
        const property = await Property.findById(propertyId);
        const development = property ? null : await Development.findById(propertyId);
        const unit = (property || development) ? null : await DevelopmentUnit.findById(propertyId);
        if (!property && !development && !unit) {
          throw new AppError('Property not found', 404);
        }

        // Get owner details
        let ownerName = 'Unknown Owner';
        let ownerId = null as any;

        if (property) {
          // Resolve owner via PropertyOwner linkage
          if (property.ownerId) {
            const owner = await PropertyOwner.findById(property.ownerId);
            if (owner) {
              ownerName = `${owner.firstName} ${owner.lastName}`.trim();
              ownerId = owner._id;
            }
          }
          if (!ownerId) {
            const owner = await PropertyOwner.findOne({
              properties: { $in: [new mongoose.Types.ObjectId(propertyId)] }
            });
            if (owner) {
              ownerName = `${owner.firstName} ${owner.lastName}`.trim();
              ownerId = owner._id;
            }
          }
        } else if (development) {
          // Resolve owner from Development.owner first/last name
          const first = development.owner?.firstName || '';
          const last = development.owner?.lastName || '';
          const companyName = development.owner?.companyName || '';
          const combined = `${first} ${last}`.trim();
          ownerName = combined || companyName || 'Unknown Owner';
        } else if (unit) {
          // Unit-level: pull owner info from parent development
          try {
            const devParent = await Development.findById((unit as any).developmentId);
            const first = devParent?.owner?.firstName || '';
            const last = devParent?.owner?.lastName || '';
            const companyName = devParent?.owner?.companyName || '';
            const combined = `${first} ${last}`.trim();
            ownerName = combined || companyName || 'Unknown Owner';
          } catch {}
        }

        // Compute display name/address before create
        let displayName = '';
        let displayAddress = '';
        if (property) {
          displayName = property.name || '';
          displayAddress = property.address || '';
        } else if (development) {
          displayName = (development as any)?.name || '';
          displayAddress = (development as any)?.address || '';
        } else if (unit) {
          let devLabel = '';
          try {
            const devParent = await Development.findById((unit as any).developmentId);
            devLabel = devParent?.name || '';
            displayAddress = devParent?.address || '';
          } catch {}
          const unitLabel = (unit as any)?.unitCode || ((unit as any)?.unitNumber ? `Unit ${(unit as any).unitNumber}` : 'Development Unit');
          displayName = devLabel ? `${unitLabel} - ${devLabel}` : unitLabel;
        }

        // Create new account
        account = new PropertyAccount({
          propertyId: propertyObjectId,
          ledgerType: effectiveLedger,
          propertyName: displayName,
          propertyAddress: displayAddress,
          ownerId: ownerId,
          ownerName,
          transactions: [],
          ownerPayouts: [],
          runningBalance: 0,
          totalIncome: 0,
          totalExpenses: 0,
          totalOwnerPayouts: 0,
          isActive: true,
          isArchived: false
        });

        try {
          await account.save();
        } catch (saveErr: any) {
          const isDup = this.isDuplicateKeyError(saveErr);
          if (isDup) {
            const reloaded = await PropertyAccount.find(this.activeAccountCandidatesQuery(propertyObjectId, effectiveLedger));
            if (reloaded.length === 1) {
              account = reloaded[0] as any;
            } else if (reloaded.length > 1) {
              throw new AppError(
                `Multiple active PropertyAccounts found for property ${propertyId} after concurrent create; refusing to choose a writable ledger`,
                409
              );
            } else {
              throw saveErr;
            }
          } else {
            throw saveErr;
          }
        }
        logger.info(`Created new property account for property: ${propertyId}`);
      }

      return this.validateWritableAccount(account, propertyId, 'getOrCreatePropertyAccount');
    } catch (error) {
      logger.error('Error in getOrCreatePropertyAccount:', error);
      throw error;
    }
  }
  
  // One-time index upgrade to support { propertyId, ledgerType } uniqueness.
  // Phase 5B: never create/drop indexes or mutate documents unless explicitly enabled.
  private async ensureLedgerIndexes(): Promise<void> {
    if (!isIndexCreationAllowed()) {
      return;
    }
    if (!ledgerIndexUpgradePromise) {
      ledgerIndexUpgradePromise = (async () => {
        try {
          const cosmosMongo = this.isCosmosMongoEndpoint();
          const runOneTimeDuplicateCleanup = await this.shouldRunOneTimeDuplicateCleanup();
          // Cosmos Mongo partial indexes do not support `$ne` in filter expressions.
          // Normalize legacy docs so active records are explicitly `isArchived: false`.
          try {
            await PropertyAccount.collection.updateMany(
              {
                $or: [
                  { isArchived: { $exists: false } },
                  { isArchived: null as any }
                ]
              } as any,
              { $set: { isArchived: false } } as any
            );
          } catch (normalizeErr: any) {
            console.warn('Could not normalize isArchived defaults before index migration:', normalizeErr?.message || normalizeErr);
          }

          const indexes = await PropertyAccount.collection.indexes();
          const legacyUniqueByProperty = indexes.find((idx: any) => idx.name === 'propertyId_1' && idx.unique === true);
          if (legacyUniqueByProperty) {
            try {
              await PropertyAccount.collection.dropIndex('propertyId_1');
              console.log('Dropped legacy unique index propertyId_1 on PropertyAccount.');
            } catch (dropErr: any) {
              console.warn('Could not drop legacy index propertyId_1:', dropErr?.message || dropErr);
            }
          }
          // Drop legacy ownerPayout unique index that doesn't include ledgerType and may not be sparse
          const legacyOwnerPayout = indexes.find((idx: any) => idx.name === 'propertyId_1_ownerPayouts.referenceNumber_1');
          if (legacyOwnerPayout) {
            try {
              await PropertyAccount.collection.dropIndex('propertyId_1_ownerPayouts.referenceNumber_1');
              console.log('Dropped legacy index propertyId_1_ownerPayouts.referenceNumber_1 on PropertyAccount.');
            } catch (dropErr: any) {
              console.warn('Could not drop legacy ownerPayout index:', dropErr?.message || dropErr);
            }
          }
          // Run heavy duplicate cleanup only once (persisted via SystemSetting) to avoid load on every restart.
          if (runOneTimeDuplicateCleanup) {
            console.warn(
              'Skipping PropertyAccount duplicate archival during index migration. ' +
              'Archive-without-merge hides owner income. Reconcile duplicates explicitly first.'
            );
          } else {
            console.log('Skipping heavy duplicate cleanup (already completed or in progress).');
          }
          // Ensure unique compound index exists and is partial on non-archived docs
          const compound = indexes.find((idx: any) => idx.name === 'propertyId_1_ledgerType_1');
          const compoundIsGood =
            compound &&
            compound.unique === true &&
            compound.partialFilterExpression &&
            compound.partialFilterExpression.isArchived === false;
          if (!compoundIsGood) {
            try {
              if (compound) {
                await PropertyAccount.collection.dropIndex('propertyId_1_ledgerType_1');
                console.log('Dropped existing compound index propertyId_1_ledgerType_1 to recreate as partial unique.');
              }
            } catch (dropErr: any) {
              console.warn('Could not drop compound index:', dropErr?.message || dropErr);
            }
            let createdCompound = false;
            let lastCompoundError: any = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                await PropertyAccount.collection.createIndex(
                  { propertyId: 1, ledgerType: 1 },
                  { unique: true, partialFilterExpression: { isArchived: false } }
                );
                console.log(`Created partial unique compound index propertyId_1_ledgerType_1 on attempt ${attempt}.`);
                createdCompound = true;
                break;
              } catch (createErr: any) {
                lastCompoundError = createErr;
                if (this.isDuplicateKeyError(createErr)) {
                  console.warn(
                    'Partial unique index was not created because duplicate PropertyAccounts exist. ' +
                    'Duplicates must be reconciled without archiving history before the index can be enabled. ' +
                    'ALLOW_ACCOUNTING_INDEX_MIGRATION must stay unset in production until that reconciliation is proven.'
                  );
                  break;
                } else {
                  break;
                }
              }
            }
            if (!createdCompound) {
              console.warn('Could not create partial compound index after cleanup retries:', lastCompoundError?.message || lastCompoundError);
            }
          }
          // Ensure owner payouts unique index includes ledgerType and uses partial filter (no sparse)
          const opIdx = indexes.find((idx: any) => idx.name === 'propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1');
          const opGood = opIdx &&
            opIdx.unique === true &&
            (
              (cosmosMongo && opIdx.sparse === true) ||
              (!cosmosMongo &&
                opIdx.partialFilterExpression &&
                opIdx.partialFilterExpression.isArchived === false &&
                opIdx.partialFilterExpression['ownerPayouts.referenceNumber'])
            );
          if (!opGood) {
            try { if (opIdx) await PropertyAccount.collection.dropIndex('propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1'); } catch {}
            try {
              const options = cosmosMongo
                // Cosmos Mongo has limitations on nested partial expressions.
                ? { unique: true, sparse: true }
                : { unique: true, partialFilterExpression: { isArchived: false, 'ownerPayouts.referenceNumber': { $exists: true, $type: 'string' } } };
              await PropertyAccount.collection.createIndex(
                { propertyId: 1, ledgerType: 1, 'ownerPayouts.referenceNumber': 1 },
                options as any
              );
              console.log('Created partial unique owner payout index propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1.');
            } catch (createErr: any) {
              if (!cosmosMongo && this.isCosmosPartialFilterUnsupported(createErr)) {
                try {
                  await PropertyAccount.collection.createIndex(
                    { propertyId: 1, ledgerType: 1, 'ownerPayouts.referenceNumber': 1 },
                    { unique: true, sparse: true } as any
                  );
                  console.log('Created sparse unique owner payout index propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1 after partial filter rejection.');
                } catch (retryErr: any) {
                  console.warn('Could not create owner payout compound index (including sparse fallback):', retryErr?.message || retryErr);
                }
              } else {
                console.warn('Could not create owner payout compound index:', createErr?.message || createErr);
              }
            }
          }
          // Ensure transactions.paymentId uniqueness is scoped per property ledger
          const legacyTxIndex = indexes.find((idx: any) => idx.name === 'transactions.paymentId_1');
          if (legacyTxIndex) {
            try {
              await PropertyAccount.collection.dropIndex('transactions.paymentId_1');
              console.log('Dropped legacy index transactions.paymentId_1 on PropertyAccount.');
            } catch (dropErr: any) {
              console.warn('Could not drop legacy transactions.paymentId index:', dropErr?.message || dropErr);
            }
          }
          const txIdx = indexes.find((idx: any) => idx.name === 'propertyId_1_ledgerType_1_transactions.paymentId_1');
          const txGood = txIdx &&
            txIdx.unique === true &&
            (
              (cosmosMongo && txIdx.sparse === true) ||
              (!cosmosMongo &&
                txIdx.partialFilterExpression &&
                txIdx.partialFilterExpression.isArchived === false &&
                txIdx.partialFilterExpression['transactions.paymentId'])
            );
          if (!txGood) {
            try { if (txIdx) await PropertyAccount.collection.dropIndex('propertyId_1_ledgerType_1_transactions.paymentId_1'); } catch {}
            try {
              const options = cosmosMongo
                // Cosmos Mongo has limitations on nested partial expressions.
                ? { unique: true, sparse: true }
                : { unique: true, partialFilterExpression: { isArchived: false, 'transactions.paymentId': { $exists: true } } };
              await PropertyAccount.collection.createIndex(
                { propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 },
                options as any
              );
              console.log('Created partial unique transactions index propertyId_1_ledgerType_1_transactions.paymentId_1.');
            } catch (createErr: any) {
              if (!cosmosMongo && this.isCosmosPartialFilterUnsupported(createErr)) {
                try {
                  await PropertyAccount.collection.createIndex(
                    { propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 },
                    { unique: true, sparse: true } as any
                  );
                  console.log('Created sparse unique transactions index propertyId_1_ledgerType_1_transactions.paymentId_1 after partial filter rejection.');
                } catch (retryErr: any) {
                  console.warn('Could not create transactions compound index (including sparse fallback):', retryErr?.message || retryErr);
                }
              } else {
                console.warn('Could not create transactions compound index:', createErr?.message || createErr);
              }
            }
          }
        } catch (e) {
          console.warn('Failed to verify/upgrade PropertyAccount indexes:', (e as any)?.message || e);
        }
      })();
    }
    return ledgerIndexUpgradePromise;
  }

  /**
   * Recalculate balance for an existing account
   */
  async recalculateBalance(account: IPropertyAccount): Promise<void> {
    this.validateWritableAccount(account, String((account as any).propertyId), 'recalculateBalance');
    const totals = computePropertyAccountTotals(account as any);
    const revision = Number((account as any).ledgerRevision || 0);
    const scalarsUnchanged =
      account.runningBalance === totals.runningBalance &&
      Number(account.totalIncome || 0) === totals.totalIncome &&
      Number(account.totalExpenses || 0) === totals.totalExpenses &&
      Number(account.totalOwnerPayouts || 0) === totals.totalOwnerPayouts &&
      Number((account as any).passThroughCollected || 0) === totals.passThroughCollected &&
      Number((account as any).passThroughPaid || 0) === totals.passThroughPaid &&
      Number((account as any).passThroughOutstanding || 0) === totals.passThroughOutstanding &&
      Number((account as any).netOwnerBalance || 0) === totals.runningBalance;
    if (scalarsUnchanged) return;

    account.runningBalance = totals.runningBalance;
    account.totalIncome = totals.totalIncome;
    account.totalExpenses = totals.totalExpenses;
    account.totalOwnerPayouts = totals.totalOwnerPayouts;
    (account as any).passThroughCollected = totals.passThroughCollected;
    (account as any).passThroughPaid = totals.passThroughPaid;
    (account as any).passThroughOutstanding = totals.passThroughOutstanding;
    (account as any).netOwnerBalance = totals.runningBalance;
    account.lastUpdated = new Date();

    // Never $set passThroughAccounts/transactions arrays â€” concurrent $push must win.
    const result = await PropertyAccount.updateOne(
      {
        _id: account._id,
        propertyId: account.propertyId,
        isArchived: false,
        isActive: { $ne: false },
        $or: [{ ledgerRevision: revision }, { ledgerRevision: { $exists: false } }]
      },
      {
        $set: {
          runningBalance: totals.runningBalance,
          totalIncome: totals.totalIncome,
          totalExpenses: totals.totalExpenses,
          totalOwnerPayouts: totals.totalOwnerPayouts,
          passThroughCollected: totals.passThroughCollected,
          passThroughPaid: totals.passThroughPaid,
          passThroughOutstanding: totals.passThroughOutstanding,
          netOwnerBalance: totals.runningBalance,
          lastUpdated: new Date()
        },
        $inc: { ledgerRevision: 1 }
      }
    );
    if (Number((result as any).modifiedCount || 0) === 0 && Number((result as any).matchedCount || 0) === 0) {
      const fresh = await PropertyAccount.findOne({
        _id: account._id,
        isArchived: false,
        isActive: { $ne: false }
      });
      if (fresh && String((fresh as any).ledgerRevision || 0) !== String(revision)) {
        logger.warn('Skipped stale PropertyAccount total write', {
          accountId: String(account._id),
          expectedRevision: revision,
          actualRevision: (fresh as any).ledgerRevision
        });
      }
    }
  }

  private async reconcileReversedPaymentArtifacts(_account: IPropertyAccount): Promise<void> {
    // Counter-postings neutralise a reversal. Cancelling the original income would erase history.
    return;
  }

  private ownerIncomeCompletenessDeps(): PaymentAccountingCompletenessDeps {
    return {
      resolveLedgerTypeForProperty: (propertyId: string) =>
        this.resolveLedgerTypeForProperty(propertyId, 'recordIncomeFromPayment'),
      getCompatibilityChargeLines: (payment, companyId) =>
        chargeTypeService.getCompatibilityChargeLines(payment, companyId as any),
      findActivePropertyAccounts: async (propertyId, ledgerType) => {
        const pid = new mongoose.Types.ObjectId(propertyId);
        return PropertyAccount.find(this.activeAccountCandidatesQuery(pid, ledgerType))
          .select({
            propertyId: 1,
            ledgerType: 1,
            isArchived: 1,
            isActive: 1,
            'transactions.type': 1,
            'transactions.paymentId': 1,
            'transactions.status': 1,
            'transactions.idempotencyKey': 1,
            'passThroughAccounts.type': 1,
            'passThroughAccounts.transactions.type': 1,
            'passThroughAccounts.transactions.paymentId': 1,
            'passThroughAccounts.transactions.status': 1,
            'passThroughAccounts.transactions.idempotencyKey': 1
          })
          .lean();
      },
      findDevelopmentIdForUnit: async (unitId: string) => {
        const unitDoc = await DevelopmentUnit.findById(unitId).select('developmentId').lean();
        return unitDoc?.developmentId ? String(unitDoc.developmentId) : undefined;
      }
    };
  }

  /**
   * Append a completed row to the property ledger. Used by individualAccountingService
   * only — rent still posts through recordIncomeFromPayment.
   */
  async appendManualLedgerTransaction(input: {
    propertyId: string;
    idempotencyKey: string;
    transaction: Partial<Transaction> & {
      type: Transaction['type'];
      amount: number;
      date: Date;
      description: string;
      idempotencyKey: string;
    };
  }): Promise<{ accountId: mongoose.Types.ObjectId; transactionId?: mongoose.Types.ObjectId }> {
    const account = this.validateWritableAccount(
      await this.getOrCreatePropertyAccount(input.propertyId),
      input.propertyId,
      'appendManualLedgerTransaction'
    );
    const existing = (account.transactions || []).find(
      (tx: any) => String(tx.idempotencyKey || '') === input.idempotencyKey
    );
    if (existing) {
      return {
        accountId: (account as any)._id,
        transactionId: existing._id
      };
    }

    const row: any = {
      type: input.transaction.type,
      amount: Number(input.transaction.amount),
      date: input.transaction.date,
      idempotencyKey: input.idempotencyKey,
      description: input.transaction.description,
      category: input.transaction.category,
      transactionCategory: input.transaction.transactionCategory,
      accountingTreatment: input.transaction.accountingTreatment,
      referenceNumber: input.transaction.referenceNumber,
      status: input.transaction.status || 'completed',
      processedBy: input.transaction.processedBy,
      notes: input.transaction.notes,
      attachments: input.transaction.attachments || [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await PropertyAccount.updateOne(
      {
        _id: (account as any)._id,
        propertyId: (account as any).propertyId,
        isArchived: false,
        isActive: { $ne: false },
        'transactions.idempotencyKey': { $ne: input.idempotencyKey }
      },
      {
        $push: { transactions: row },
        $set: { lastUpdated: new Date() }
      }
    );
    const fresh = await PropertyAccount.findOne({
      _id: (account as any)._id,
      isArchived: false,
      isActive: { $ne: false }
    }) as any;
    if (fresh) await this.recalculateBalance(fresh as any);
    const posted = (fresh?.transactions || []).find(
      (tx: any) => String(tx.idempotencyKey || '') === input.idempotencyKey
    );
    return {
      accountId: (account as any)._id,
      transactionId: posted?._id
    };
  }

  /**
   * Record income from a completed Payment onto the property ledger.
 *
 * Call only from paymentAccountingOrchestrator (live completion) or from
 * explicit authorised repair, which itself calls the orchestrator.
 * Do not call from scheduled jobs, GET handlers, integrity, or historical sync.
 */
  async recordIncomeFromPayment(paymentId: string): Promise<void> {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new AppError('Payment not found', 404);
      }

      const policy = evaluatePermanentAccountingPolicy(payment);
      if (!policy.allowed) {
        logger.info(`Skipping income recording for payment ${paymentId} - ${policy.reason}`);
        return;
      }

      try {
        const completeness = await checkPaymentAccountingCompleteness(payment as any, this.ownerIncomeCompletenessDeps());
        if (shouldSkipRecordIncomePosting(completeness)) {
          logger.debug('payment completeness check passed', { paymentId: String(payment._id) });
          return;
        }
        logger.debug(`payment completeness check failed: ${completeness.reason || 'not_proven'}`, {
          paymentId: String(payment._id)
        });
      } catch {
        logger.debug('payment completeness check failed: completeness_error', { paymentId: String(payment._id) });
      }

      const domain = historicalTransactionDomain(payment);
      if (!domain) {
        throw new AppError(`Payment ${paymentId} has no authoritative transaction domain`, 409);
      }
      const isSale = domain === 'SALE';
      const ledgerType = ledgerForDomain(domain);

      const targets = await buildOwnerIncomeLedgerTargets({
        isSale,
        ledgerType,
        propertyId: String(payment.propertyId),
        developmentId: (payment as any)?.developmentId,
        developmentUnitId: (payment as any)?.developmentUnitId,
        findDevelopmentIdForUnit: async (unitId) => {
          try {
            const unitDoc = await DevelopmentUnit.findById(unitId).select('developmentId');
            return unitDoc?.developmentId ? String((unitDoc as any).developmentId) : undefined;
          } catch {
            return undefined;
          }
        },
        unitLookupErrors: 'swallow'
      });

      let postedToAtLeastOneTarget = false;
      let notFoundCount = 0;
      const chargeLines = isSale
        ? []
        : await chargeTypeService.getCompatibilityChargeLines(payment, payment.companyId);
      const passThroughLines = chargeLines.filter(line => line.chargeType.category === 'PASS_THROUGH');
      const passThroughTotal = passThroughLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
      const propertyExpenseLines = chargeLines.filter(line => line.chargeType.category === 'PROPERTY_EXPENSE');
      const propertyExpenseTotal = propertyExpenseLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
      const propertyIncomeLines = chargeLines.filter(line => line.chargeType.ownerIncome && line.chargeType.category === 'PROPERTY_INCOME');
      const primaryIncomeChargeType = propertyIncomeLines[0]?.chargeType;
      const ownerIncomeAmount = computeOwnerIncomeAmount({
        isSale,
        ownerAmount: payment.commissionDetails?.ownerAmount || 0,
        passThroughTotal
      });
      if (Number(payment.amount || 0) > 0 && ownerIncomeAmount <= 0) {
        throw new OwnerIncomeAmountMissingError(paymentId);
      }
      const ownerSeamKey = String(paymentId);
      const ownerSeams = (global as any).__phase26OwnerSeam || ((global as any).__phase26OwnerSeam = new Set<string>());
      if (
        process.env.NODE_ENV !== 'production' &&
        process.env.MANTIS_TEST_SEAM === '1' &&
        String((payment as any).notes || '').includes('PHASE26_FAIL_OWNER_INCOME') &&
        !ownerSeams.has(ownerSeamKey)
      ) {
        ownerSeams.add(ownerSeamKey);
        throw new Error('PHASE26_FAIL_OWNER_INCOME');
      }
      for (const target of targets) {
        let account: IPropertyAccount | null = null as any;
        try {
          account = await this.getOrCreatePropertyAccount(target.id, ledgerType);
        } catch (e: any) {
          const message = String(e?.message || '');
          const status = Number((e as any)?.statusCode || (e as any)?.status || 0);
          // Treat missing entity as a non-fatal condition for this payment target
          if (
            status === 404 ||
            /not found|entity not found/i.test(message) ||
            status === 400 && /unable to determine ledger type/i.test(message)
          ) {
            notFoundCount++;
            continue;
          }
          throw e;
        }
        account = this.validateWritableAccount(account, target.id, 'recordIncomeFromPayment');

        const incomeAmount = ownerIncomeAmount;

        const recordPassThroughIfNeeded = async () => {
          const grouped = new Map<string, { amount: number; line: any }>();
          for (const line of passThroughLines) {
            const existing = grouped.get(line.chargeType.code) || { amount: 0, line };
            existing.amount += Number(line.amount || 0);
            grouped.set(line.chargeType.code, existing);
          }
          for (const [code, row] of grouped) {
            if (row.amount <= 0) continue;
            await this.recordPassThroughCollection({
              propertyId: target.id,
              companyId: payment.companyId ? String(payment.companyId) : undefined,
              chargeType: code,
              amount: row.amount,
              date: payment.paymentDate || payment.createdAt,
              paymentId,
              levyPaymentId: code === 'LEVY' && (payment as any).linkedLevyPaymentId ? String((payment as any).linkedLevyPaymentId) : undefined,
              referenceNumber: payment.referenceNumber,
              description: `${row.line.chargeType.name} collected - ${payment.referenceNumber}`,
              processedBy: payment.processedBy ? String(payment.processedBy) : undefined,
              notes: payment.notes,
              idempotencyKey: `payment:${paymentId}:pass-through:${code}`
            });
          }
        };

        const recordConfiguredExpensesIfNeeded = async () => {
          if (propertyExpenseTotal <= 0) return;
          const idKey = `payment:${paymentId}:configured-expense`;
          const existingExpense = account!.transactions.find(
            t => String((t as any).idempotencyKey || '') === idKey
          );
          if (existingExpense) return;
          const expenseTransaction: any = {
            type: 'expense',
            amount: propertyExpenseTotal,
            date: payment.paymentDate || payment.createdAt,
            idempotencyKey: idKey,
            description: `Configured property expense - ${payment.referenceNumber}`,
            category: 'configured_expense',
            transactionCategory: 'OTHER',
            accountingTreatment: 'PROPERTY_EXPENSE',
            chargeTypeCode: propertyExpenseLines[0]?.chargeType.code,
            chargeTypeId: propertyExpenseLines[0]?.chargeType._id,
            status: 'completed',
            processedBy: payment.processedBy,
            referenceNumber: payment.referenceNumber,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          await PropertyAccount.updateOne(
            {
              _id: (account as any)._id,
              propertyId: (account as any).propertyId,
              isArchived: false,
              isActive: { $ne: false },
              'transactions.idempotencyKey': { $ne: idKey }
            },
            { $push: { transactions: expenseTransaction }, $set: { lastUpdated: new Date() } }
          );
          const freshAfterExpense = await PropertyAccount.findOne({ _id: (account as any)._id, isArchived: false, isActive: { $ne: false } }) as any;
          if (freshAfterExpense) await this.recalculateBalance(freshAfterExpense as any);
        };

        // Check if income already recorded for this payment
        const existingTransaction = account.transactions.find(
          t => t.paymentId?.toString() === paymentId && t.type === 'income'
        );
        if (existingTransaction) {
          logger.info(`Income already recorded for payment: ${paymentId} on account ${String((account as any)._id)}`);
          await recordPassThroughIfNeeded();
          await recordConfiguredExpensesIfNeeded();
          postedToAtLeastOneTarget = true;
          continue;
        }

        if (incomeAmount <= 0) {
          logger.info(`Skipping income for payment ${paymentId} due to deposit exclusion or zero owner income (computed=${incomeAmount}).`);
          await recordPassThroughIfNeeded();
          await recordConfiguredExpensesIfNeeded();
          if (passThroughTotal > 0 || propertyExpenseTotal > 0) {
            postedToAtLeastOneTarget = true;
            this.notifyAccountUpdated({
              companyId: payment.companyId,
              propertyId: target.id,
              accountId: (account as any)._id,
              paymentId,
              eventType: 'payment_recorded'
            });
          }
          continue;
        }

        const incomeDescription = isSale
          ? `Sale income - ${payment.referenceNumber}`
          : `Rental income - ${payment.referenceNumber}`;
        const incomeCategory = isSale ? 'sale_income' : 'rental_income';

        const incomeTransaction: any = {
          type: 'income',
          amount: incomeAmount,
          date: payment.paymentDate || payment.createdAt,
          paymentId: new mongoose.Types.ObjectId(paymentId),
          idempotencyKey: `payment:${paymentId}`,
          description: incomeDescription,
          category: incomeCategory,
          transactionCategory: isSale ? 'OTHER' : (primaryIncomeChargeType?.code === 'RENT' ? 'RENT' : 'OTHER'),
          accountingTreatment: 'PROPERTY_INCOME',
          chargeTypeCode: primaryIncomeChargeType?.code,
          chargeTypeId: primaryIncomeChargeType?._id,
          status: 'completed',
          processedBy: payment.processedBy,
          referenceNumber: payment.referenceNumber,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await PropertyAccount.updateOne(
          {
            _id: (account as any)._id,
            propertyId: (account as any).propertyId,
            isArchived: false,
            isActive: { $ne: false },
            'transactions.idempotencyKey': { $ne: `payment:${paymentId}` }
          },
          {
            $push: { transactions: incomeTransaction },
            $set: { lastUpdated: new Date() }
          }
        );
        const fresh = await PropertyAccount.findOne({ _id: (account as any)._id, isArchived: false, isActive: { $ne: false } }) as any;
        if (fresh) {
          await this.recalculateBalance(fresh as any);
        }
        await recordPassThroughIfNeeded();
        await recordConfiguredExpensesIfNeeded();
        logger.info(`Accounting ledger successfully updated for payment ${paymentId} on account ${String((account as any)._id)} (target ${target.id}, ledger ${target.ledger}, income=${incomeAmount})`);
        this.notifyAccountUpdated({
          companyId: payment.companyId,
          propertyId: target.id,
          accountId: (account as any)._id,
          paymentId,
          eventType: 'payment_recorded'
        });
        postedToAtLeastOneTarget = true;
      }

      // If we could not post to any target and every attempt failed due to missing entities,
      // place the payment in suspense to avoid repeated degradation.
      if (!postedToAtLeastOneTarget && notFoundCount >= targets.length && targets.length > 0) {
        try {
          await Payment.updateOne(
            { _id: payment._id, isInSuspense: { $ne: true } },
            { $set: { isInSuspense: true } }
          );
          logger.warn(`Payment ${String(payment._id)} placed in suspense (no backing property/development/unit found)`);
        } catch {}
      }

    } catch (error) {
      logger.error('Error recording income from payment:', error);
      throw error;
    }
  }

  async reverseIncomeFromPayment(paymentId: string, opts?: { processedBy?: string; reason?: string }): Promise<{ countered: boolean }> {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new AppError('Payment not found', 404);
      }

      const domain = historicalTransactionDomain(payment);
      if (!domain) {
        throw new AppError(`Payment ${paymentId} has no authoritative transaction domain`, 409);
      }
      const targets: Array<{ id: string; ledger: 'rental' | 'sale' }> = [];
      const isSale = domain === 'SALE';
      const ledgerType = ledgerForDomain(domain);
      let devId = (payment as any)?.developmentId as mongoose.Types.ObjectId | undefined;
      const unitId = (payment as any)?.developmentUnitId as mongoose.Types.ObjectId | undefined;
      if (isSale) {
        if (unitId) targets.push({ id: unitId.toString(), ledger: ledgerType });
        if (!devId && unitId) {
          try { const unitDoc = await DevelopmentUnit.findById(unitId).select('developmentId'); devId = unitDoc?.developmentId as any; } catch {}
        }
        if (devId) targets.push({ id: devId.toString(), ledger: ledgerType });
        if (!unitId && !devId) targets.push({ id: payment.propertyId.toString(), ledger: ledgerType });
      } else {
        targets.push({ id: payment.propertyId.toString(), ledger: ledgerType });
      }

      throwOnceIfArmed(
        paymentId,
        `${String((payment as any).notes || '')} ${String(opts?.reason || '')}`,
        'PHASE27_FAIL_OWNER'
      );

      const chargeLines = isSale
        ? []
        : await chargeTypeService.getCompatibilityChargeLines(payment, payment.companyId);
      const passThroughLines = chargeLines.filter(line => line.chargeType.category === 'PASS_THROUGH');
      let countered = false;

      for (const target of targets) {
        const account = this.validateWritableAccount(
          await this.getOrCreatePropertyAccount(target.id, target.ledger),
          target.id,
          'reverseIncomeFromPayment'
        );
        const groupedPassThrough = new Map<string, { amount: number; line: any }>();
        for (const line of passThroughLines) {
          const existing = groupedPassThrough.get(line.chargeType.code) || { amount: 0, line };
          existing.amount += Number(line.amount || 0);
          groupedPassThrough.set(line.chargeType.code, existing);
        }
        for (const [code, row] of groupedPassThrough) {
          if (row.amount <= 0) continue;
          await this.recordPassThroughPayment({
            propertyId: target.id,
            companyId: payment.companyId ? String(payment.companyId) : undefined,
            chargeType: code,
            amount: row.amount,
            date: new Date(),
            paymentId,
            levyPaymentId: code === 'LEVY' && (payment as any).linkedLevyPaymentId ? String((payment as any).linkedLevyPaymentId) : undefined,
            referenceNumber: (payment as any).referenceNumber,
            description: `${row.line.chargeType.name} reversal - ${(payment as any).referenceNumber || paymentId}`,
            processedBy: opts?.processedBy,
            notes: opts?.reason || 'Payment reversal',
            idempotencyKey: `payment:${paymentId}:pass-through:${code}:reversal`,
            ledgerType: target.ledger
          });
        }
        const originalIncome = (account.transactions || []).filter(
          (t: any) =>
            t.type === 'income' &&
            String(t.paymentId || '') === String(payment._id || '') &&
            String(t.status || '') === 'completed' &&
            !t.reversesPaymentId
        );
        const postedIncome = Number(
          originalIncome.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0).toFixed(2)
        );
        const incomeKey = `payment:${paymentId}:owner-income:reversal:${target.id}`;
        const incomeAlready = (account.transactions || []).some(
          (t: any) => String(t.idempotencyKey || '') === incomeKey && String(t.status || '') === 'completed'
        );
        if (postedIncome > 0 && !incomeAlready) {
          const counter: any = {
            type: 'expense',
            amount: postedIncome,
            date: new Date(),
            reversesPaymentId: payment._id,
            idempotencyKey: incomeKey,
            description: `Reversal of owner income ${String((payment as any).referenceNumber || paymentId)}`,
            category: 'payment_reversal',
            transactionCategory: 'OTHER',
            accountingTreatment: 'PROPERTY_EXPENSE',
            status: 'completed',
            notes: opts?.reason || 'Payment reversal',
            referenceNumber: `REV-OWN-${String((payment as any).referenceNumber || paymentId)}`,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          await PropertyAccount.updateOne(
            {
              _id: (account as any)._id,
              propertyId: (account as any).propertyId,
              isArchived: false,
              isActive: { $ne: false },
              'transactions.idempotencyKey': { $ne: incomeKey }
            },
            { $push: { transactions: counter }, $set: { lastUpdated: new Date() } }
          );
          countered = true;
        } else if (postedIncome > 0 && incomeAlready) {
          countered = true;
        }

        const configuredExpenses = (account.transactions || []).filter(
          (t: any) =>
            t.type === 'expense' &&
            String(t.category || '') === 'configured_expense' &&
            String(t.status || '') === 'completed' &&
            (String(t.idempotencyKey || '') === `payment:${paymentId}:configured-expense` ||
              String(t.paymentId || '') === String(payment._id || ''))
        );
        for (const expense of configuredExpenses) {
          const expenseKey = `payment:${paymentId}:configured-expense:reversal:${String((expense as any)._id || target.id)}`;
          const expenseAlready = (account.transactions || []).some(
            (t: any) => String(t.idempotencyKey || '') === expenseKey
          );
          if (expenseAlready || Number((expense as any).amount || 0) <= 0) continue;
          await PropertyAccount.updateOne(
            {
              _id: (account as any)._id,
              propertyId: (account as any).propertyId,
              isArchived: false,
              isActive: { $ne: false },
              'transactions.idempotencyKey': { $ne: expenseKey }
            },
            {
              $push: {
                transactions: {
                  type: 'income',
                  amount: Number(Number((expense as any).amount || 0).toFixed(2)),
                  date: new Date(),
                  reversesPaymentId: payment._id,
                  idempotencyKey: expenseKey,
                  description: `Reversal of configured expense ${String((payment as any).referenceNumber || paymentId)}`,
                  category: 'payment_reversal',
                  transactionCategory: 'OTHER',
                  accountingTreatment: 'PROPERTY_INCOME',
                  status: 'completed',
                  notes: opts?.reason || 'Payment reversal',
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
              },
              $set: { lastUpdated: new Date() }
            }
          );
        }

        const fresh = await PropertyAccount.findOne({ _id: (account as any)._id, isArchived: false, isActive: { $ne: false } }) as any;
        if (fresh) {
          await this.recalculateBalance(fresh as any);
        }
        this.notifyAccountUpdated({
          companyId: payment.companyId,
          propertyId: target.id,
          accountId: (account as any)._id,
          paymentId,
          eventType: 'payment_reversed'
        });
      }
      return { countered };
    } catch (error) {
      logger.error('Error reversing income from payment:', error);
      throw error;
    }
  }

  /**
   * EXPLICIT HISTORICAL BACKFILL for development sale ledgers.
   * Call only from the authorised admin migration endpoint after confirm=true.
   * Never from GET, integrity, or scheduled reconciliation.
   */
  async ensureDevelopmentLedgersAndBackfillPayments(options?: {
    companyId?: string;
    limit?: number; // optional cap for developments processed in one run
  }): Promise<{
    developmentsProcessed: number;
    ledgersCreated: number;
    paymentsScanned: number;
    backfillInvocations: number;
  }> {
    const companyFilter: any = {};
    if (options?.companyId) {
      companyFilter.companyId = new mongoose.Types.ObjectId(options.companyId);
    }
    // Find all developmentIds that actually have units
    const devIdsWithUnits = await DevelopmentUnit.distinct('developmentId', {});
    if (!Array.isArray(devIdsWithUnits) || devIdsWithUnits.length === 0) {
      return { developmentsProcessed: 0, ledgersCreated: 0, paymentsScanned: 0, backfillInvocations: 0 };
    }
    // Load developments that belong to the company (if provided) and have units
    const devQuery: any = { _id: { $in: devIdsWithUnits } };
    Object.assign(devQuery, companyFilter);
    const developments = await Development.find(devQuery)
      .select('_id name companyId')
      .limit(typeof options?.limit === 'number' && options.limit > 0 ? options.limit : 0);
    let ledgersCreated = 0;
    let paymentsScanned = 0;
    let backfillInvocations = 0;
    for (const dev of developments) {
      // Ensure a 'sale' ledger exists for the development (guarded by unique index)
      const existing = await PropertyAccount.findOne(
        this.activeAccountQuery(new mongoose.Types.ObjectId(dev._id), 'sale')
      );
      if (!existing) {
        await this.getOrCreatePropertyAccount(dev._id.toString());
        ledgersCreated++;
      }
      // Find payments tied to this development directly or via its units
      const unitIds = await DevelopmentUnit.find({ developmentId: dev._id }).select('_id');
      const unitIdList = unitIds.map((u: any) => u._id);
      if (unitIdList.length === 0) {
        continue;
      }
      const salePayments = await Payment.find({
        paymentType: 'sale',
        status: 'completed',
        isProvisional: { $ne: true },
        isInSuspense: { $ne: true },
        $or: [
          { developmentId: new mongoose.Types.ObjectId(dev._id) },
          { developmentUnitId: { $in: unitIdList } }
        ]
      }).select('_id');
      paymentsScanned += salePayments.length;
      if (salePayments.length > 0) {
        logger.info('Development ledger ensured. Historical sale payments were not replayed.', {
          developmentId: String(dev._id),
          payments: salePayments.length
        });
      }
    }
    return {
      developmentsProcessed: developments.length,
      ledgersCreated,
      paymentsScanned,
      backfillInvocations
    };
  }

  /**
   * Add expense to property account
   */
  async addExpense(
    propertyId: string,
    expenseData: {
      amount: number;
      date: Date;
      description: string;
      category?: string;
      recipientId?: string;
      recipientType?: 'owner' | 'contractor' | 'tenant' | 'other';
      processedBy: string;
      notes?: string;
      idempotencyKey?: string;
    },
    ledgerType?: 'rental' | 'sale'
  ): Promise<IPropertyAccount> {
    try {
      if (expenseData.amount <= 0) {
        throw new AppError('Expense amount must be greater than 0', 400);
      }

      // Ensure idempotency for all expense creations (generate if missing)
      const idKey = (expenseData.idempotencyKey && expenseData.idempotencyKey.trim().length > 0)
        ? expenseData.idempotencyKey.trim()
        : `expense:${uuidv4()}`;

      const account = this.validateWritableAccount(
        await this.getOrCreatePropertyAccount(propertyId),
        propertyId,
        'addExpense'
      );

      if (account.runningBalance < expenseData.amount) {
        throw new AppError('Insufficient balance for this expense', 400);
      }

      const expenseTransaction: any = {
        type: 'expense',
        amount: expenseData.amount,
        date: expenseData.date,
        description: expenseData.description,
        category: expenseData.category || 'general',
        transactionCategory: String(expenseData.category || '').toLowerCase().includes('maintenance') ? 'MAINTENANCE' : 'OTHER',
        accountingTreatment: 'PROPERTY_EXPENSE',
        recipientId: expenseData.recipientId,
        recipientType: expenseData.recipientType,
        status: 'completed',
        processedBy: new mongoose.Types.ObjectId(expenseData.processedBy),
        notes: expenseData.notes,
        referenceNumber: `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        idempotencyKey: idKey,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Atomic, guarded append using idempotencyKey and balance check.
      const previousLastUpdated = account.lastUpdated ? new Date(account.lastUpdated) : undefined as any;
      let res = await PropertyAccount.updateOne(
        { 
          _id: (account as any)._id,
          propertyId: (account as any).propertyId,
          isArchived: false,
          isActive: { $ne: false },
          runningBalance: { $gte: expenseData.amount },
          'transactions.idempotencyKey': { $ne: idKey },
          ...(previousLastUpdated ? { lastUpdated: previousLastUpdated } : {})
        },
        { 
          $push: { transactions: expenseTransaction },
          $set: { lastUpdated: new Date() }
        }
      );
      if ((res as any)?.modifiedCount === 0) {
        // Retry once with refreshed state
        const fresh = await PropertyAccount.findOne({ _id: (account as any)._id, isArchived: false, isActive: { $ne: false } }) as any;
        if (fresh) {
          await this.recalculateBalance(fresh as any);
          res = await PropertyAccount.updateOne(
            { 
              _id: (fresh as any)._id,
              propertyId: (fresh as any).propertyId,
              isArchived: false,
              isActive: { $ne: false },
              runningBalance: { $gte: expenseData.amount },
              'transactions.idempotencyKey': { $ne: idKey }
            },
            { 
              $push: { transactions: expenseTransaction },
              $set: { lastUpdated: new Date() }
            }
          );
        }
      }
      const reloaded = await PropertyAccount.findOne({ _id: (account as any)._id, isArchived: false, isActive: { $ne: false } }) as any;
      if (reloaded) await this.recalculateBalance(reloaded as any);
      logger.info(`Added expense (idempotent, guarded) of ${expenseData.amount} to property ${propertyId}`);
      this.notifyAccountUpdated({
        propertyId,
        accountId: (reloaded as any)?._id || (account as any)._id,
        eventType: 'expense_recorded'
      });
      return (await this.getPropertyAccount(propertyId)) as any;
    } catch (error) {
      logger.error('Error adding expense:', error);
      throw error;
    }
  }

  /**
   * Add an opening balance adjustment to a property account.
   *
   * Opening balance entries affect running balance only. They are intentionally
   * excluded from operational income/expense totals and the general ledger sync.
   */
  async addOpeningBalanceAdjustment(
    propertyId: string,
    openingBalanceData: {
      amount: number;
      direction: 'credit' | 'debit';
      date: Date;
      description?: string;
      processedBy: string;
      notes?: string;
      idempotencyKey?: string;
    },
    ledgerType?: 'rental' | 'sale'
  ): Promise<IPropertyAccount> {
    try {
      const amount = Number(openingBalanceData.amount || 0);
      if (amount <= 0) {
        throw new AppError('Opening balance amount must be greater than 0', 400);
      }

      if (!['credit', 'debit'].includes(openingBalanceData.direction)) {
        throw new AppError('Opening balance direction must be credit or debit', 400);
      }

      const effectiveDate = openingBalanceData.date instanceof Date
        ? openingBalanceData.date
        : new Date(openingBalanceData.date);
      if (Number.isNaN(effectiveDate.getTime())) {
        throw new AppError('Valid opening balance date is required', 400);
      }

      const idKey = (openingBalanceData.idempotencyKey && openingBalanceData.idempotencyKey.trim().length > 0)
        ? openingBalanceData.idempotencyKey.trim()
        : `opening-balance:${uuidv4()}`;

      const account = this.validateWritableAccount(
        await this.getOrCreatePropertyAccount(propertyId),
        propertyId,
        'addOpeningBalanceAdjustment'
      );
      const referenceNumber = `OB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const directionLabel = openingBalanceData.direction === 'credit' ? 'Credit' : 'Debit';
      const openingBalanceTransaction: any = {
        type: 'opening_balance',
        amount,
        direction: openingBalanceData.direction,
        date: effectiveDate,
        description: openingBalanceData.description?.trim() || `Opening balance ${directionLabel.toLowerCase()}`,
        category: 'opening_balance',
        transactionCategory: 'OPENING_BALANCE',
        accountingTreatment: 'SYSTEM',
        status: 'completed',
        processedBy: new mongoose.Types.ObjectId(openingBalanceData.processedBy),
        notes: openingBalanceData.notes,
        referenceNumber,
        idempotencyKey: idKey,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await PropertyAccount.updateOne(
        {
          _id: (account as any)._id,
          propertyId: (account as any).propertyId,
          isArchived: false,
          isActive: { $ne: false },
          'transactions.idempotencyKey': { $ne: idKey }
        },
        {
          $push: { transactions: openingBalanceTransaction },
          $set: { lastUpdated: new Date() }
        }
      );

      const reloaded = await PropertyAccount.findOne({ _id: (account as any)._id, isArchived: false, isActive: { $ne: false } }) as any;
      if (reloaded) await this.recalculateBalance(reloaded as any);
      logger.info(`Added opening balance ${openingBalanceData.direction} of ${amount} to property ${propertyId}`);
      this.notifyAccountUpdated({
        propertyId,
        accountId: (reloaded as any)?._id || (account as any)._id,
        eventType: 'account_adjusted'
      });
      return (await this.getPropertyAccount(propertyId)) as any;
    } catch (error) {
      logger.error('Error adding opening balance adjustment:', error);
      throw error;
    }
  }

  /**
   * Create owner payout
   */
  async createOwnerPayout(
    propertyId: string,
    payoutData: {
      amount: number;
      paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
      recipientId: string;
      recipientName: string;
      recipientBankDetails?: {
        bankName?: string;
        accountNumber?: string;
        accountName?: string;
      };
      processedBy: string;
      notes?: string;
      autoComplete?: boolean;
      idempotencyKey?: string;
    },
    ledgerType?: 'rental' | 'sale'
  ): Promise<{ account: IPropertyAccount; payout: any }> {
    try {
      if (payoutData.amount <= 0) {
        throw new AppError('Payout amount must be greater than 0', 400);
      }

      // Ensure idempotency for payout creation (generate if missing)
      const idKey = (payoutData.idempotencyKey && payoutData.idempotencyKey.trim().length > 0)
        ? payoutData.idempotencyKey.trim()
        : `payout:${uuidv4()}`;

      const account = this.validateWritableAccount(
        await this.getOrCreatePropertyAccount(propertyId),
        propertyId,
        'createOwnerPayout'
      );

      if (account.runningBalance < payoutData.amount) {
        throw new AppError('Insufficient balance for this payout', 400);
      }

      const referenceNumber = `PAYOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const payoutStatus = payoutData.autoComplete ? 'completed' : 'pending';

      const payout: any = {
        amount: payoutData.amount,
        date: new Date(),
        paymentMethod: payoutData.paymentMethod,
        referenceNumber,
        idempotencyKey: idKey,
        status: payoutStatus,
        processedBy: new mongoose.Types.ObjectId(payoutData.processedBy),
        recipientId: new mongoose.Types.ObjectId(payoutData.recipientId),
        recipientName: payoutData.recipientName,
        recipientBankDetails: payoutData.recipientBankDetails,
        notes: payoutData.notes,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await PropertyAccount.updateOne(
        { _id: (account as any)._id, propertyId: (account as any).propertyId, isArchived: false, isActive: { $ne: false }, 'ownerPayouts.idempotencyKey': { $ne: idKey } },
        { $push: { ownerPayouts: payout }, $set: { lastUpdated: new Date() } }
      );
      const fresh = await PropertyAccount.findOne({ _id: (account as any)._id, isArchived: false, isActive: { $ne: false } }) as any;
      if (fresh) await this.recalculateBalance(fresh as any);
      logger.info(`Created owner payout (idempotent) of ${payoutData.amount} for property ${propertyId}`);
      this.notifyAccountUpdated({
        propertyId,
        accountId: (fresh as any)?._id || (account as any)._id,
        eventType: 'payout_recorded'
      });
      return { account: (await this.getPropertyAccount(propertyId)) as any, payout };
    } catch (error) {
      logger.error('Error creating owner payout:', error);
      throw error;
    }
  }

  /**
   * Update payout status
   */
  async updatePayoutStatus(
    propertyId: string,
    payoutId: string,
    status: 'pending' | 'completed' | 'failed' | 'cancelled',
    processedBy: string
  ): Promise<IPropertyAccount> {
    try {
      const pid = new mongoose.Types.ObjectId(propertyId);
      // Fetch all ledgers for this property (rental/sale) and locate the payout
      const accounts = await PropertyAccount.find({ propertyId: pid, isArchived: false, isActive: { $ne: false } });
      if (!accounts || accounts.length === 0) {
        throw new AppError('Property account not found', 404);
      }

      let targetAccount: IPropertyAccount | null = null;
      let targetPayout: OwnerPayout | undefined;
      for (const acc of accounts as unknown as IPropertyAccount[]) {
        const found = acc.ownerPayouts.find(p => p._id?.toString() === payoutId);
        if (found) {
          targetAccount = acc as unknown as IPropertyAccount;
          targetPayout = found;
          break;
        }
      }

      if (!targetAccount || !targetPayout) {
        throw new AppError('Payout not found', 404);
      }
      targetAccount = this.validateWritableAccount(targetAccount, propertyId, 'updatePayoutStatus');

      // Atomic status transition
      const now = new Date();
      if (targetPayout.status === 'pending' && status === 'completed') {
        if (targetAccount.runningBalance < targetPayout.amount) {
          throw new AppError('Insufficient balance to complete payout', 400);
        }
        const res = await PropertyAccount.updateOne(
          { 
            _id: (targetAccount as any)._id,
            propertyId: (targetAccount as any).propertyId,
            isArchived: false,
            isActive: { $ne: false },
            runningBalance: { $gte: targetPayout.amount },
            ownerPayouts: { $elemMatch: { _id: new mongoose.Types.ObjectId(payoutId), status: 'pending' } }
          },
          { 
            $set: { 'ownerPayouts.$.status': 'completed', 'ownerPayouts.$.updatedAt': now, lastUpdated: now }
          }
        );
        if ((res as any)?.modifiedCount === 0) {
          throw new AppError('Unable to complete payout due to insufficient balance or concurrent update', 409);
        }
      } else {
        const res = await PropertyAccount.updateOne(
          { 
            _id: (targetAccount as any)._id,
            propertyId: (targetAccount as any).propertyId,
            isArchived: false,
            isActive: { $ne: false },
            ownerPayouts: { $elemMatch: { _id: new mongoose.Types.ObjectId(payoutId) } }
          },
          { 
            $set: { 'ownerPayouts.$.status': status, 'ownerPayouts.$.updatedAt': now, lastUpdated: now }
          }
        );
        if ((res as any)?.modifiedCount === 0) {
          throw new AppError('Payout status update conflict', 409);
        }
      }
      const fresh = await PropertyAccount.findOne({ _id: (targetAccount as any)._id, isArchived: false, isActive: { $ne: false } }) as any;
      if (fresh) await this.recalculateBalance(fresh as any);

      logger.info(`Updated payout ${payoutId} status to ${status} for property ${propertyId} on ledger ${String((targetAccount as any).ledgerType || 'unknown')}`);
      this.notifyAccountUpdated({
        propertyId,
        accountId: (fresh as any)?._id || (targetAccount as any)._id,
        eventType: 'payout_updated'
      });
      
      return (await this.getPropertyAccount(propertyId, (targetAccount as any).ledgerType)) as any;
    } catch (error) {
      logger.error('Error updating payout status:', error);
      throw error;
    }
  }

  /**
   * Get property account with summary
   */
  async getPropertyAccount(propertyId: string, ledger?: 'rental' | 'sale'): Promise<IPropertyAccount> {
    try {
      const pid = new mongoose.Types.ObjectId(propertyId);
      // An explicit ledger is historical account identity. Property.rentalType is only
      // the current-state default when the caller did not name a ledger.
      const effectiveLedger = ledger
        ?? (await this.resolveLedgerTypeForProperty(propertyId, 'getPropertyAccount')).ledgerType;
      const candidates = await PropertyAccount.find({
        propertyId: pid,
        isArchived: { $ne: true },
        isActive: { $ne: false },
        ledgerType: effectiveLedger
      }) as any as IPropertyAccount[];

      let account: IPropertyAccount | null = null;
      if (!candidates || candidates.length === 0) {
        throw new AppError('Property account not found', 404);
      } else if (candidates.length === 1) {
        account = candidates[0];
      } else {
        throw new AppError(
          `Multiple active PropertyAccounts found for property ${propertyId} (${effectiveLedger}); refusing to choose a ledger`,
          409
        );
      }
      if (!account) throw new AppError('Property account not found', 404);

      const display = account as unknown as IPropertyAccount;
      const totals = computePropertyAccountTotals(display as any);
      (display as any).runningBalance = totals.runningBalance;
      (display as any).totalIncome = totals.totalIncome;
      (display as any).totalExpenses = totals.totalExpenses;
      (display as any).totalOwnerPayouts = totals.totalOwnerPayouts;
      (display as any).passThroughCollected = totals.passThroughCollected;
      (display as any).passThroughPaid = totals.passThroughPaid;
      (display as any).passThroughOutstanding = totals.passThroughOutstanding;
      (display as any).netOwnerBalance = totals.runningBalance;
      return display;
    } catch (error) {
      logger.error('Error getting property account:', error);
      throw error;
    }
  }

  /**
   * Get all property accounts for a company
   */
  async getCompanyPropertyAccounts(companyId: string): Promise<IPropertyAccount[]> {
    try {
      // Get all properties and developments for the company
      const [properties, developments] = await Promise.all([
        Property.find({ companyId }),
        Development.find({ companyId })
      ]);
      const propertyIds = properties.map(p => p._id);
      const developmentIds = developments.map(d => d._id);
      // Also include development units for these developments
      let unitIds: any[] = [];
      try {
        const units = await DevelopmentUnit.find({ developmentId: { $in: developmentIds } }).select('_id');
        unitIds = units.map((u: any) => u._id);
      } catch {}
      const allIds = [...propertyIds, ...developmentIds, ...unitIds];

      let accounts = await PropertyAccount.find({
        propertyId: { $in: allIds },
        isArchived: { $ne: true }
      }).sort({ lastUpdated: -1 });

      return accounts as unknown as IPropertyAccount[];
    } catch (error) {
      logger.error('Error getting company property accounts:', error);
      throw error;
    }
  }

  async syncPropertyMetadata(property: any): Promise<void> {
    const account = this.validateWritableAccount(
      await this.getOrCreatePropertyAccount(property._id.toString()),
      property._id.toString(),
      'syncPropertyMetadata'
    );
    const updates: any = {
      propertyName: property.name,
      propertyAddress: property.address,
      ownerId: property.ownerId,
      isActive: property.isActive !== false,
      lastUpdated: new Date()
    };
    if (property.ownerId) {
      const owner = await User.findById(property.ownerId);
      if (owner) {
        updates.ownerName = `${owner.firstName} ${owner.lastName}`;
      }
    }
    await PropertyAccount.updateOne(
      { _id: (account as any)._id, isArchived: false, isActive: { $ne: false } },
      { $set: updates }
    );
  }

  async updateOwnerNameForActiveAccounts(ownerId: string | mongoose.Types.ObjectId, ownerName: string): Promise<number> {
    const result = await PropertyAccount.updateMany(
      { ownerId, isArchived: false, isActive: { $ne: false } },
      { $set: { ownerName, lastUpdated: new Date() } },
      { maxTimeMS: 5000 } as any
    );
    return Number((result as any)?.modifiedCount || 0);
  }

  async removeOwnerReferenceFromActiveAccounts(ownerId: string | mongoose.Types.ObjectId): Promise<number> {
    const result = await PropertyAccount.updateMany(
      { ownerId, isArchived: false, isActive: { $ne: false } },
      {
        $unset: { ownerId: 1, ownerName: 1 },
        $set: { lastUpdated: new Date() }
      },
      { maxTimeMS: 5000 } as any
    );
    return Number((result as any)?.modifiedCount || 0);
  }

  async clearOwnerReferenceForAccount(accountId: string | mongoose.Types.ObjectId): Promise<boolean> {
    const result = await PropertyAccount.updateOne(
      { _id: accountId, isArchived: false, isActive: { $ne: false } },
      { $unset: { ownerId: 1, ownerName: 1 }, $set: { lastUpdated: new Date() } }
    );
    return Number((result as any)?.modifiedCount || 0) > 0;
  }

  async archiveLedgersForProperty(propertyId: string | mongoose.Types.ObjectId): Promise<number> {
    const result = await PropertyAccount.updateMany(
      { propertyId },
      { $set: { isActive: false, isArchived: true, lastUpdated: new Date() } },
      { maxTimeMS: 5000 } as any
    );
    return Number((result as any)?.modifiedCount || 0);
  }

  async archiveLedgerById(accountId: string | mongoose.Types.ObjectId): Promise<boolean> {
    const result = await PropertyAccount.updateOne(
      { _id: accountId, isArchived: { $ne: true } },
      { $set: { isArchived: true, isActive: false, lastUpdated: new Date() } }
    );
    return Number((result as any)?.modifiedCount || 0) > 0;
  }

  async cancelPaymentReference(paymentId: string): Promise<boolean> {
    const propertyAccount = await PropertyAccount.findOne({
      'transactions.paymentId': paymentId,
      isArchived: false,
      isActive: { $ne: false }
    });
    if (!propertyAccount) return false;

    const transaction = propertyAccount.transactions.find(
      (t: any) => t.paymentId && t.paymentId.toString() === paymentId
    );
    if (!transaction) return false;

    this.validateWritableAccount(propertyAccount as any, String((propertyAccount as any).propertyId), 'cancelPaymentReference');
    const updateResult = await PropertyAccount.updateOne(
      {
        _id: propertyAccount._id,
        propertyId: propertyAccount.propertyId,
        isArchived: false,
        isActive: { $ne: false },
        transactions: { $elemMatch: { _id: (transaction as any)._id, status: { $ne: 'cancelled' } } }
      },
      {
        $set: {
          'transactions.$.status': 'cancelled',
          'transactions.$.updatedAt': new Date(),
          lastUpdated: new Date()
        }
      }
    );
    if (Number((updateResult as any)?.modifiedCount || 0) > 0) {
      const fresh = await PropertyAccount.findOne({
        _id: propertyAccount._id,
        isArchived: false,
        isActive: { $ne: false }
      });
      if (fresh) {
        await this.recalculateBalance(fresh as any);
      }
      return true;
    }
    return false;
  }

  /**
   * EXPLICIT HISTORICAL BACKFILL. Call only from the authorised admin migration
   * endpoint after confirm=true and a non-empty reason. Never from GET, integrity,
   * or scheduled reconciliation.
   */
  async syncPropertyAccountsWithPayments(options?: {
    companyId?: string;
    onProgress?: () => Promise<void> | void;
  }): Promise<{ selected: number; attempted: number; failures: number }> {
    logger.warn('Historical payment replay is disabled. Use the read-only duplicate inventory and single-payment repair.', {
      companyId: options?.companyId || null
    });
    throw new AppError(
      'HISTORICAL_REPLAY_DISABLED: property-account sync no longer posts or replays payments. Detect gaps and repair one payment at a time.',
      409
    );
  }

  async getLedgerEntityIdsForCompany(companyId: string): Promise<string[]> {
    const trimmed = String(companyId || '').trim();
    if (!trimmed || !mongoose.Types.ObjectId.isValid(trimmed)) {
      return [];
    }
    const companyObjectId = new mongoose.Types.ObjectId(trimmed);
    const [properties, developments] = await Promise.all([
      Property.find({ companyId: companyObjectId }).select('_id').lean(),
      Development.find({ companyId: companyObjectId }).select('_id').lean()
    ]);
    const developmentIds = developments.map((row: any) => row._id);
    const units = developmentIds.length
      ? await DevelopmentUnit.find({ developmentId: { $in: developmentIds } }).select('_id').lean()
      : [];
    return [...properties, ...developments, ...units].map((row: any) => String(row._id));
  }

  /**
   * Get transaction history with filters
   */
  async getTransactionHistory(
    propertyId: string,
    filters: {
      type?: string;
      startDate?: Date;
      endDate?: Date;
      category?: string;
      status?: string;
    },
    legacyLedgerHint?: 'rental' | 'sale'
  ): Promise<Transaction[]> {
    try {
      const account = await this.getPropertyAccount(propertyId, legacyLedgerHint);
      
      let transactions = account.transactions;

      // Apply filters
      if (filters.type) {
        transactions = transactions.filter(t => t.type === filters.type);
      }
      
      if (filters.startDate) {
        transactions = transactions.filter(t => t.date >= filters.startDate!);
      }
      
      if (filters.endDate) {
        transactions = transactions.filter(t => t.date <= filters.endDate!);
      }
      
      if (filters.category) {
        transactions = transactions.filter(t => t.category === filters.category);
      }
      
      if (filters.status) {
        transactions = transactions.filter(t => t.status === filters.status);
      }

      // Sort by date descending
      return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      logger.error('Error getting transaction history:', error);
      throw error;
    }
  }

  /**
   * Get payout history
   */
  async getPayoutHistory(propertyId: string): Promise<OwnerPayout[]> {
    try {
      const account = await this.getPropertyAccount(propertyId);
      return account.ownerPayouts.sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (error) {
      logger.error('Error getting payout history:', error);
      throw error;
    }
  }

  /**
   * Merge duplicate PropertyAccount documents in-memory and persist the cleanup.
   * Duplicates are defined by same propertyId and effective ledgerType
   * (null/undefined ledgerType is normalized to 'rental' for legacy records).
   *
   * Returns true if any changes were made (merged or deleted).
   */
  private async mergeDuplicateAccounts(accounts: IPropertyAccount[]): Promise<boolean> {
    if (!Array.isArray(accounts) || accounts.length === 0) return false;
    accounts = accounts.filter(acc => (acc as any).isArchived !== true && (acc as any).isActive !== false);
    if (accounts.length === 0) return false;
    // Group by (propertyId, ledgerTypeNormalized)
    type Group = { key: string; items: IPropertyAccount[] };
    const groupsMap: Record<string, IPropertyAccount[]> = Object.create(null);
    for (const acc of accounts) {
      const pid = String(acc.propertyId);
      const ledgerRaw = (acc as any).ledgerType as any;
      const ledger: 'rental' | 'sale' = ledgerRaw === 'sale' ? 'sale' : 'rental';
      const key = `${pid}|${ledger}`;
      if (!groupsMap[key]) groupsMap[key] = [];
      groupsMap[key].push(acc);
    }
    const groups: Group[] = Object.entries(groupsMap).map(([key, items]) => ({ key, items }));
    let anyChanged = false;

    for (const group of groups) {
      if (group.items.length <= 1) continue;
      const [groupPropertyId, groupLedger] = group.key.split('|');
      const plan = classifyDuplicateGroup(
        groupPropertyId,
        groupLedger,
        group.items.map((account) => ({
          id: String(account._id),
          propertyId: String(account.propertyId),
          ledgerType: (account as any).ledgerType || groupLedger,
          isArchived: (account as any).isArchived === true,
          isActive: (account as any).isActive !== false,
          transactions: (account.transactions || []) as any,
          ownerPayouts: (account.ownerPayouts || []) as any,
          createdAt: (account as any).createdAt
        }))
      );
      if (!plan.automaticMergeAllowed) {
        logger.warn('Refusing automatic duplicate merge', {
          propertyId: groupPropertyId,
          ledgerType: groupLedger,
          classification: plan.classification,
          reason: plan.reason
        });
        continue;
      }
      // Choose keeper from the safe classification, then by financial history.
      const legacy = group.items.filter(i => (i as any).ledgerType == null);
      const candidates = legacy.length > 0 ? legacy : group.items;
      const pickScore = (i: IPropertyAccount) => {
        const count = (Array.isArray(i.transactions) ? i.transactions.length : 0) + (Array.isArray(i.ownerPayouts) ? i.ownerPayouts.length : 0);
        const updated = i.lastUpdated ? new Date(i.lastUpdated).getTime() : 0;
        return { count, updated };
      };
      let keeper = candidates[0];
      for (const c of candidates.slice(1)) {
        const a = pickScore(keeper);
        const b = pickScore(c);
        if (b.count > a.count || (b.count === a.count && b.updated > a.updated)) {
          keeper = c;
        }
      }
      const toMergeAndDelete = group.items.filter(i => String(i._id) !== String(keeper._id));
      if (toMergeAndDelete.length === 0) continue;

      // Build uniqueness sets for transactions and payouts on keeper
      const txKeys = new Set<string>();
      for (const t of (keeper.transactions || [])) {
        const pid = (t as any)?.paymentId ? String((t as any).paymentId) : '';
        const key = pid
          ? `pid:${pid}`
          : `free:${t.type}:${t.referenceNumber || ''}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`;
        txKeys.add(key);
      }
      const payoutKeys = new Map<string, number>(); // referenceNumber -> index in keeper.ownerPayouts
      for (let i = 0; i < (keeper.ownerPayouts || []).length; i++) {
        const p = keeper.ownerPayouts[i];
        const ref = p.referenceNumber || String(p._id || '');
        payoutKeys.set(ref, i);
      }

      // Normalize ledgerType on keeper if missing
      if (!(keeper as any).ledgerType) {
        const ledger = group.key.endsWith('|sale') ? 'sale' : 'rental';
        (keeper as any).ledgerType = ledger;
      }

      // Merge each duplicate into keeper
      for (const dup of toMergeAndDelete) {
        // Merge transactions (dedupe by paymentId if present, else by derived key)
        for (const t of (dup.transactions || [])) {
          const pid = (t as any)?.paymentId ? String((t as any).paymentId) : '';
          const key = pid
            ? `pid:${pid}`
            : `free:${t.type}:${t.referenceNumber || ''}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`;
          if (!txKeys.has(key)) {
            // Push shallow copy and remove _id to let MongoDB assign a new one
            const copy: any = { ...t };
            delete copy._id;
            (keeper.transactions as any).push(copy);
            txKeys.add(key);
          }
        }
        // Merge owner payouts (dedupe by referenceNumber; prefer completed or latest updatedAt)
        for (const p of (dup.ownerPayouts || [])) {
          const ref = p.referenceNumber || String(p._id || '');
          if (!payoutKeys.has(ref)) {
            const copy: any = { ...p };
            delete copy._id;
            (keeper.ownerPayouts as any).push(copy);
            payoutKeys.set(ref, (keeper.ownerPayouts || []).length - 1);
          } else {
            const idx = payoutKeys.get(ref)!;
            const existing = keeper.ownerPayouts[idx];
            const preferNew =
              (existing.status !== 'completed' && p.status === 'completed') ||
              (new Date(p.updatedAt || p.createdAt).getTime() > new Date(existing.updatedAt || existing.createdAt).getTime());
            if (preferNew) {
              keeper.ownerPayouts[idx] = { ...p, _id: existing._id }; // keep existing _id slot
            }
          }
        }
      }

      // Persist keeper and recalculate balance
      try {
        this.validateWritableAccount(keeper, String((keeper as any).propertyId), 'mergeDuplicateAccounts');
        await keeper.save();
        await this.recalculateBalance(keeper);
      } catch (e) {
        console.warn('Keeper save failed during account dedupe:', (e as any)?.message || e);
      }

      // Archive duplicates instead of deleting (to respect immutable ledger policy and avoid unique conflicts)
      try {
        const ids = toMergeAndDelete.map(d => d._id);
        if (ids.length > 0) {
          await PropertyAccount.updateMany(
            { _id: { $in: ids }, isArchived: false },
            { $set: { isArchived: true, lastUpdated: new Date() } }
          );
        }
        anyChanged = true;
        logger.info(`Merged and archived ${ids.length} duplicate account(s) for key ${group.key}`);
      } catch (e) {
        console.warn('Failed to archive duplicates during account dedupe:', (e as any)?.message || e);
      }
    }
    return anyChanged;
  }

  /**
   * One-time migration: move sale income transactions from rental ledger to sale ledger per property.
   * Safe to run multiple times (idempotent using transaction.paymentId uniqueness).
   */
  async migrateSalesLedgerForCompany(companyPropertyIds?: string[]): Promise<{ moved: number; propertiesAffected: number }> {
    let moved = 0;
    let propertiesAffected = 0;
    const filter: any = {};
    if (Array.isArray(companyPropertyIds) && companyPropertyIds.length > 0) {
      filter.propertyId = { $in: companyPropertyIds.map(id => new mongoose.Types.ObjectId(id)) };
    }
    const rentalAccounts = await PropertyAccount.find({ ...filter, isArchived: false, isActive: { $ne: false }, ledgerType: { $in: [null as any, 'rental'] } });
    for (const rental of rentalAccounts) {
      this.validateWritableAccount(rental as any, String((rental as any).propertyId), 'migrateSalesLedgerForCompany');
      const saleTx = (rental.transactions || []).filter(t => t.type === 'income' && t.category === 'sale_income');
      if (saleTx.length === 0) continue;
      const saleAccount = await this.getOrCreatePropertyAccount(rental.propertyId.toString(), 'sale');
      // Move each tx if not already present in sale ledger (by paymentId)
      let movedHere = 0;
      for (const tx of saleTx) {
        const exists = saleAccount.transactions.some(st => st.type === 'income' && st.paymentId && tx.paymentId && st.paymentId.toString() === tx.paymentId.toString());
        if (exists) continue;
        {
          const copy: any = { ...tx };
          delete copy._id;
          saleAccount.transactions.push(copy);
        }
        movedHere++;
        moved++;
      }
      if (movedHere > 0) {
        for (const tx of rental.transactions || []) {
          if (tx.type === 'income' && tx.category === 'sale_income') {
            tx.status = 'cancelled';
            tx.updatedAt = new Date();
          }
        }
        this.validateWritableAccount(saleAccount, String((saleAccount as any).propertyId), 'migrateSalesLedgerForCompany');
        await saleAccount.save();
        await rental.save();
        await this.recalculateBalance(saleAccount);
        await this.recalculateBalance(rental);
        propertiesAffected++;
      }
    }
    return { moved, propertiesAffected };
  }

  /**
   * Merge a source PropertyAccount into a target PropertyAccount (cross-ledger merge).
   * Deduplicates transactions by paymentId or derived key, and payouts by referenceNumber.
   */
  private async mergeAccountsCrossLedger(
    source: IPropertyAccount,
    target: IPropertyAccount
  ): Promise<{ mergedTransactions: number; mergedPayouts: number }> {
    let mergedTransactions = 0;
    let mergedPayouts = 0;
    this.validateWritableAccount(source, String((source as any).propertyId), 'mergeAccountsCrossLedger:source');
    this.validateWritableAccount(target, String((target as any).propertyId), 'mergeAccountsCrossLedger:target');

    // Build uniqueness sets from target
    const txKeys = new Set<string>();
    for (const t of (target.transactions || [])) {
      const pid = (t as any)?.paymentId ? String((t as any).paymentId) : '';
      const key = pid
        ? `pid:${pid}`
        : `free:${t.type}:${t.referenceNumber || ''}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`;
      txKeys.add(key);
    }
    const payoutKeys = new Map<string, number>(); // referenceNumber -> index
    for (let i = 0; i < (target.ownerPayouts || []).length; i++) {
      const p = target.ownerPayouts[i];
      const ref = p.referenceNumber || String(p._id || '');
      payoutKeys.set(ref, i);
    }

    // Merge transactions
    for (const t of (source.transactions || [])) {
      const pid = (t as any)?.paymentId ? String((t as any).paymentId) : '';
      const key = pid
        ? `pid:${pid}`
        : `free:${t.type}:${t.referenceNumber || ''}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`;
      if (!txKeys.has(key)) {
        const copy: any = { ...t };
        delete copy._id;
        (target.transactions as any).push(copy);
        txKeys.add(key);
        mergedTransactions++;
      }
    }

    // Merge payouts (prefer completed or latest updatedAt)
    for (const p of (source.ownerPayouts || [])) {
      const ref = p.referenceNumber || String(p._id || '');
      if (!payoutKeys.has(ref)) {
        const copy: any = { ...p };
        delete copy._id;
        (target.ownerPayouts as any).push(copy);
        payoutKeys.set(ref, (target.ownerPayouts || []).length - 1);
        mergedPayouts++;
      } else {
        const idx = payoutKeys.get(ref)!;
        const existing = target.ownerPayouts[idx];
        const preferNew =
          (existing.status !== 'completed' && p.status === 'completed') ||
          (new Date(p.updatedAt || p.createdAt).getTime() > new Date(existing.updatedAt || existing.createdAt).getTime());
        if (preferNew) {
          target.ownerPayouts[idx] = { ...p, _id: existing._id };
        }
      }
    }

    await (target as any).save();
    await this.recalculateBalance(target);

    await PropertyAccount.updateOne(
      { _id: source._id, isArchived: false },
      { $set: { isArchived: true, isActive: false, lastUpdated: new Date() } }
    );

    return { mergedTransactions, mergedPayouts };
  }

  /**
   * One-off migration: Normalize legacy ledger types to 'sale' where appropriate.
   * - For properties with rentalType 'sale', or when the id is a development/development unit.
   * - Merges into existing sale ledgers if present (cross-ledger), otherwise updates ledgerType.
   */
  async migrateLegacyLedgerTypesForCompany(
    companyId?: string,
    options?: { dryRun?: boolean }
  ): Promise<{
    examined: number;
    updated: number;
    merged: number;
    skipped: number;
    errors: number;
    details: Array<{ propertyId: string; action: 'updated' | 'merged' | 'skipped' | 'error'; reason?: string }>;
  }> {
    const dryRun = Boolean(options?.dryRun);
    const details: Array<{ propertyId: string; action: 'updated' | 'merged' | 'skipped' | 'error'; reason?: string }> = [];
    let examined = 0;
    let updated = 0;
    let merged = 0;
    let skipped = 0;
    let errors = 0;

    try {
      // Discover all property-like ids scoped by company when provided
      let propertyFilter: any = {};
      let developmentFilter: any = {};
      if (companyId) {
        propertyFilter.companyId = companyId;
        developmentFilter.companyId = companyId;
      }
      const [properties, developments] = await Promise.all([
        Property.find(propertyFilter).select('_id rentalType').lean(),
        Development.find(developmentFilter).select('_id').lean()
      ]);
      const propertyIds = properties.map(p => String(p._id));
      const developmentIds = developments.map(d => String(d._id));
      let unitIds: string[] = [];
      if (developmentIds.length > 0) {
        try {
          const units = await DevelopmentUnit.find({ developmentId: { $in: developmentIds } }).select('_id').lean();
          unitIds = units.map(u => String(u._id));
        } catch {
          // ignore unit lookup failures
        }
      }
      const salePropertyIdSet = new Set<string>(
        properties
          .filter((p: any) => String((p as any)?.rentalType || '').toLowerCase() === 'sale')
          .map((p: any) => String(p._id))
      );
      const developmentIdSet = new Set<string>(developmentIds);
      const unitIdSet = new Set<string>(unitIds);
      const allIdsSet = new Set<string>([...propertyIds, ...developmentIds, ...unitIds]);

      // Query candidate legacy accounts: missing ledgerType or 'rental'
      const candidates = await PropertyAccount.find({
        propertyId: { $in: Array.from(allIdsSet).map(id => new mongoose.Types.ObjectId(id)) },
        isArchived: false,
        isActive: { $ne: false },
        $or: [{ ledgerType: { $exists: false } }, { ledgerType: null }, { ledgerType: 'rental' }]
      });

      for (const acc of candidates) {
        examined++;
        const pid = String((acc as any).propertyId);
        const shouldBeSale = salePropertyIdSet.has(pid) || developmentIdSet.has(pid) || unitIdSet.has(pid);
        if (!shouldBeSale) {
          skipped++;
          details.push({ propertyId: pid, action: 'skipped', reason: 'Not a sale/development entity' });
          continue;
        }

        if ((acc as any).ledgerType === 'sale') {
          skipped++;
          details.push({ propertyId: pid, action: 'skipped', reason: 'Already sale ledger' });
          continue;
        }

        try {
          // If a sale ledger already exists for this property, merge into it; else update this one to sale
          const existingSale = await PropertyAccount.findOne({ propertyId: acc.propertyId, ledgerType: 'sale', isArchived: false, isActive: { $ne: false } });
          if (existingSale && String(existingSale._id) !== String(acc._id)) {
            if (dryRun) {
              merged++;
              details.push({ propertyId: pid, action: 'merged', reason: 'Would merge into existing sale ledger (dry-run)' });
            } else {
              await this.mergeAccountsCrossLedger(acc as any, existingSale as any);
              merged++;
              details.push({ propertyId: pid, action: 'merged' });
            }
            continue;
          }

          // No existing sale ledger: flip ledgerType to 'sale'
          if (dryRun) {
            updated++;
            details.push({ propertyId: pid, action: 'updated', reason: 'Would set ledgerType to sale (dry-run)' });
          } else {
            this.validateWritableAccount(acc as any, String((acc as any).propertyId), 'migrateLegacyLedgerTypesForCompany');
            (acc as any).ledgerType = 'sale';
            await (acc as any).save();
            await this.recalculateBalance(acc as any);
            updated++;
            details.push({ propertyId: pid, action: 'updated' });
          }
        } catch (e: any) {
          errors++;
          details.push({ propertyId: String((acc as any).propertyId), action: 'error', reason: e?.message || 'unknown' });
        }
      }
    } catch (outer: any) {
      errors++;
      details.push({ propertyId: '', action: 'error', reason: outer?.message || 'migration failed' });
    }

    return { examined, updated, merged, skipped, errors, details };
  }
}

export default PropertyAccountService.getInstance(); 

// Convenience named export for scripts/tools that call this migration directly
export async function migrateSalesLedgerForCompany(
  companyPropertyIds?: string[]
): Promise<{ moved: number; propertiesAffected: number }> {
  const service = PropertyAccountService.getInstance();
  return service.migrateSalesLedgerForCompany(companyPropertyIds);
}

// Explicit maintenance only. Identical income copies may be cancelled after classification.
// Ambiguous, cross-ledger, and reversal rows are preserved.
export async function reconcilePropertyLedgerDuplicates(
  propertyId: string
): Promise<{
  removed: number;
  kept: number;
  accountId?: string;
  classification: string;
  reason: string;
  mutated: boolean;
}> {
  const service = PropertyAccountService.getInstance();
  const account = await service.getPropertyAccount(propertyId);
  (service as any).validateWritableAccount(account, propertyId, 'reconcilePropertyLedgerDuplicates');
  const tx = Array.isArray(account.transactions) ? account.transactions : [];
  const plan = classifyLedgerTransactionDuplicates(
    tx.map((line: any) => ({
      _id: line._id,
      type: line.type,
      status: line.status,
      amount: line.amount,
      category: line.category,
      paymentId: line.paymentId,
      reversesPaymentId: line.reversesPaymentId,
      idempotencyKey: line.idempotencyKey,
      date: line.date,
      ledgerType: (account as any).ledgerType
    }))
  );
  const kept = tx.length - (plan.classification === 'SAFE_IDENTICAL' ? plan.cancelIds.length : 0);
  if (plan.classification !== 'SAFE_IDENTICAL' || plan.cancelIds.length === 0) {
    return {
      removed: 0,
      kept: tx.length,
      accountId: String(account._id),
      classification: plan.classification,
      reason: plan.reason,
      mutated: false
    };
  }
  await PropertyAccount.updateOne(
    { _id: account._id, propertyId: account.propertyId, isArchived: false, isActive: { $ne: false } },
    {
      $set: {
        'transactions.$[t].status': 'cancelled',
        'transactions.$[t].updatedAt': new Date(),
        lastUpdated: new Date()
      }
    },
    {
      arrayFilters: [{
        't._id': {
          $in: plan.cancelIds.map((id) => (
            mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
          ))
        }
      }] as any
    } as any
  );
  const fresh = await PropertyAccount.findOne({ _id: account._id, isArchived: false, isActive: { $ne: false } });
  if (fresh) {
    await service.recalculateBalance(fresh as any);
  }
  return {
    removed: plan.cancelIds.length,
    kept,
    accountId: String(account._id),
    classification: plan.classification,
    reason: plan.reason,
    mutated: true
  };
}

// Convenience export to ensure development ledgers exist and backfill payments
export async function ensureDevelopmentLedgersAndBackfillPayments(
  opts?: { companyId?: string; limit?: number }
): Promise<{
  developmentsProcessed: number;
  ledgersCreated: number;
  paymentsScanned: number;
  backfillInvocations: number;
}> {
  const service = PropertyAccountService.getInstance();
  return service.ensureDevelopmentLedgersAndBackfillPayments(opts);
}

// Initialize/upgrade property account indexes at startup
export async function initializePropertyAccountIndexes(): Promise<void> {
  const { isIndexCreationAllowed } = await import('./ledgerMutationPolicy');
  if (!isIndexCreationAllowed()) {
    return;
  }
  const svc = PropertyAccountService.getInstance() as any;
  if (typeof svc.ensureLedgerIndexes === 'function') {
    await svc.ensureLedgerIndexes();
  }
}

// Detection-only. Duplicate merges stay on the confirmed per-property endpoint,
// and only SAFE_DUPLICATE groups are eligible there.
export async function runPropertyLedgerMaintenance(options?: { companyId?: string; dryRun?: boolean; limit?: number }): Promise<{
  migrated: { examined: number; updated: number; merged: number; skipped: number; errors: number };
  deduped: { groupsChanged: boolean };
  reconciled: { accountsProcessed: number; removals: number };
}> {
  const service = PropertyAccountService.getInstance();
  const migrated = await service.migrateLegacyLedgerTypesForCompany(options?.companyId || undefined, { dryRun: true });
  return {
    migrated,
    deduped: { groupsChanged: false },
    reconciled: { accountsProcessed: 0, removals: 0 }
  };
}
