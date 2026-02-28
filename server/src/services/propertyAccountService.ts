import { Request, Response } from 'express';
import mongoose from 'mongoose';
import PropertyAccount, { IPropertyAccount, Transaction, OwnerPayout } from '../models/PropertyAccount';
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

// Upgrade legacy indexes: allow separate ledgers per property
let ledgerIndexUpgradePromise: Promise<void> | null = null;

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
    const result = await PropertyAccount.updateMany(
      {
        isArchived: false,
        $or: [
          { ledgerType: { $exists: false } },
          { ledgerType: null as any },
          { ledgerType: '' as any },
          { ledgerType: { $nin: ['rental', 'sale'] } as any }
        ]
      } as any,
      { $set: { ledgerType: 'rental', lastUpdated: new Date() } } as any
    );
    return Number((result as any)?.modifiedCount || 0);
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

  /**
   * Infer ledger type strictly from the entity itself.
   * - Property.rentalType:
   *   - 'introduction' | 'management' → 'rental'
   *   - 'sale' → 'sale'
   * - Development or DevelopmentUnit id → 'sale'
   * Throws if the type cannot be determined. No defaults.
   */
  private async inferLedgerTypeForProperty(propertyId: string): Promise<'rental' | 'sale'> {
    // Try as Property first
    const property = await Property.findById(propertyId).lean();
    if (property) {
      const rt = String((property as any)?.rentalType || '').toLowerCase();
      if (rt === 'introduction' || rt === 'management') return 'rental';
      if (rt === 'sale') return 'sale';
      throw new AppError('Unable to determine ledger type: property.rentalType must be introduction, management, or sale', 400);
    }
    // If not a Property, allow Development/DevelopmentUnit ids as sales ledgers
    const dev = await Development.findById(propertyId).select('_id').lean();
    if (dev) return 'sale';
    const unit = await DevelopmentUnit.findById(propertyId).select('_id').lean();
    if (unit) return 'sale';
    throw new AppError('Unable to determine ledger type: entity not found', 404);
  }

  /**
   * Get or create property account
   */
  async getOrCreatePropertyAccount(propertyId: string, ledgerType?: 'rental' | 'sale'): Promise<IPropertyAccount> {
    try {
      // Ensure indexes support multi-ledger before any creates
      await this.ensureLedgerIndexes();
      console.log('getOrCreatePropertyAccount called with propertyId:', propertyId);
      console.log('Converting to ObjectId:', new mongoose.Types.ObjectId(propertyId));

      // If caller passed no explicit ledgerType, infer it
      const effectiveLedger: 'rental' | 'sale' = ledgerType ?? await this.inferLedgerTypeForProperty(propertyId);

      let account = await PropertyAccount.findOne({ propertyId: new mongoose.Types.ObjectId(propertyId), ledgerType: effectiveLedger });
      console.log('Database query result:', account ? 'Found account' : 'No account found');
      // If a legacy ledger (without ledgerType) also exists for this property, prefer it when it appears more complete.
      // This ensures older, accurate ledgers remain visible in the UI when a newer, partial ledger was created.
      if (account) {
        try {
          const legacy = await PropertyAccount.findOne({
            propertyId: new mongoose.Types.ObjectId(propertyId),
            $or: [{ ledgerType: { $exists: false } }, { ledgerType: null }]
          });
          if (legacy) {
            const legacyIncome = Number((legacy as any)?.totalIncome || 0);
            const currentIncome = Number((account as any)?.totalIncome || 0);
            const legacyTxCount = Array.isArray((legacy as any)?.transactions) ? (legacy as any).transactions.length : 0;
            const currentTxCount = Array.isArray((account as any)?.transactions) ? (account as any).transactions.length : 0;
            // Prefer legacy if it has equal/greater totalIncome or more transactions (heuristic for completeness)
            if (legacyIncome >= currentIncome || legacyTxCount > currentTxCount) {
              account = legacy as any;
            }
          }
        } catch {}
      }
      // If no account of the requested ledgerType exists, but a legacy ledger exists,
      // adopt the legacy ledger by assigning the appropriate ledgerType instead of creating a new doc.
      if (!account) {
        try {
          const legacy = await PropertyAccount.findOne({
            propertyId: new mongoose.Types.ObjectId(propertyId),
            $or: [{ ledgerType: { $exists: false } }, { ledgerType: null }]
          });
          if (legacy) {
            (legacy as any).ledgerType = effectiveLedger;
            try {
              await (legacy as any).save();
              await this.recalculateBalance(legacy as any);
              account = legacy as any;
            } catch (adoptErr: any) {
              // If a concurrent create slipped in and caused a duplicate-key on (propertyId, ledgerType),
              // fall back to loading the newly created account.
              const isDup = (adoptErr?.code === 11000) || /E11000 duplicate key error/.test(String(adoptErr?.message || ''));
              if (isDup) {
                const reloaded = await PropertyAccount.findOne({ propertyId: new mongoose.Types.ObjectId(propertyId), ledgerType: effectiveLedger });
                if (reloaded) {
                  account = reloaded as any;
                } else {
                  throw adoptErr;
                }
              } else {
                throw adoptErr;
              }
            }
          }
        } catch {}
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
          propertyId: new mongoose.Types.ObjectId(propertyId),
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
          isActive: true
        });

        try {
          await account.save();
        } catch (saveErr: any) {
          const isDup = (saveErr?.code === 11000) || /E11000 duplicate key error/.test(String(saveErr?.message || ''));
          if (isDup) {
            const reloaded = await PropertyAccount.findOne({ propertyId: new mongoose.Types.ObjectId(propertyId), ledgerType: effectiveLedger });
            if (reloaded) {
              account = reloaded as any;
            } else {
              throw saveErr;
            }
          } else {
            throw saveErr;
          }
        }
        logger.info(`Created new property account for property: ${propertyId}`);
      } else {
        // Recalculate balance for existing account
        await this.recalculateBalance(account);
      }

      return account as IPropertyAccount;
    } catch (error) {
      logger.error('Error in getOrCreatePropertyAccount:', error);
      throw error;
    }
  }
  
  // One-time index upgrade to support { propertyId, ledgerType } uniqueness
  private async ensureLedgerIndexes(): Promise<void> {
    if (!ledgerIndexUpgradePromise) {
      ledgerIndexUpgradePromise = (async () => {
        try {
          const cosmosMongo = this.isCosmosMongoEndpoint();
          const runOneTimeDuplicateCleanup = await this.shouldRunOneTimeDuplicateCleanup();
          let normalizedForCleanup = 0;
          let archivedForCleanup = 0;
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
            try {
              normalizedForCleanup = await this.normalizeActiveLedgerTypes();
              archivedForCleanup = await this.archiveDuplicateActiveLedgers();
              console.log(
                `One-time PropertyAccount duplicate cleanup completed (normalized=${normalizedForCleanup}, archived=${archivedForCleanup}).`
              );
              await this.markOneTimeDuplicateCleanupComplete({
                normalized: normalizedForCleanup,
                archived: archivedForCleanup
              });
            } catch (archiveErr: any) {
              await this.markOneTimeDuplicateCleanupError(archiveErr);
              console.warn('One-time duplicate cleanup failed before index migration:', archiveErr?.message || archiveErr);
            }
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
                  if (runOneTimeDuplicateCleanup) {
                    try {
                      const archived = await this.archiveDuplicateActiveLedgers();
                      console.warn(
                        `Compound index attempt ${attempt} hit duplicate keys; archived ${archived} duplicate active ledger records before retry.`
                      );
                    } catch (archiveErr: any) {
                      console.warn('Could not archive duplicate active ledgers during compound index retry:', archiveErr?.message || archiveErr);
                    }
                  } else {
                    console.warn('Compound index hit duplicate keys but one-time duplicate cleanup is disabled/already completed; skipping additional heavy archival.');
                    break;
                  }
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
    // Calculate totals from transactions
    const totalIncome = account.transactions
      .filter(t => t.type === 'income' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = account.transactions
      .filter(t => t.type !== 'income' && t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalOwnerPayouts = account.ownerPayouts
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);
    
    // Calculate running balance
    const newRunningBalance = totalIncome - totalExpenses - totalOwnerPayouts;
    
    // Update the account if balance has changed
    if (account.runningBalance !== newRunningBalance) {
      account.runningBalance = newRunningBalance;
      account.totalIncome = totalIncome;
      account.totalExpenses = totalExpenses;
      account.totalOwnerPayouts = totalOwnerPayouts;
      account.lastUpdated = new Date();
      
      // Use updateOne instead of save() to avoid triggering pre-save middleware
      await PropertyAccount.updateOne(
        { _id: account._id },
        {
          $set: {
            runningBalance: newRunningBalance,
            totalIncome: totalIncome,
            totalExpenses: totalExpenses,
            totalOwnerPayouts: totalOwnerPayouts,
            lastUpdated: new Date()
          }
        }
      );
      console.log(`Recalculated balance for property ${account.propertyId} (${(account as any).ledgerType || 'rental'}): ${newRunningBalance}`);
    }
  }

  private async reconcileReversedPaymentArtifacts(account: IPropertyAccount): Promise<void> {
    try {
      const paymentIds = Array.from(
        new Set(
          (account.transactions || [])
            .map((t: any) => String(t?.paymentId || ''))
            .filter(Boolean)
        )
      );
      if (!paymentIds.length) return;

      const reversedPayments = await Payment.find({
        _id: { $in: paymentIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: 'reversed'
      })
        .select('_id reversalPaymentId')
        .lean();
      if (!reversedPayments.length) return;

      const reversedSet = new Set<string>(reversedPayments.map((p: any) => String(p._id)));
      const reversalSet = new Set<string>(
        reversedPayments
          .map((p: any) => (p?.reversalPaymentId ? String(p.reversalPaymentId) : ''))
          .filter(Boolean)
      );

      let changed = false;
      for (const tx of (account.transactions || []) as any[]) {
        const txPid = String(tx?.paymentId || '');
        if (!txPid) continue;
        const isReversedChain = reversedSet.has(txPid) || reversalSet.has(txPid);
        if (!isReversedChain) continue;

        if (tx.type === 'income' && String(tx.status || '') === 'completed') {
          tx.status = 'cancelled';
          tx.updatedAt = new Date();
          tx.notes = tx.notes || 'Auto-cancelled due to payment reversal';
          changed = true;
        }
        if (
          tx.type === 'expense' &&
          String(tx.category || '') === 'payment_reversal' &&
          String(tx.status || '') === 'completed'
        ) {
          tx.status = 'cancelled';
          tx.updatedAt = new Date();
          tx.notes = tx.notes || 'Auto-cancelled after reversal-chain cleanup';
          changed = true;
        }
      }

      if (changed) {
        // Bypass immutable ledger middleware for reconciliation maintenance writes.
        await (PropertyAccount as any).collection.updateOne(
          { _id: (account as any)._id },
          { $set: { transactions: (account as any).transactions, lastUpdated: new Date() } }
        );
      }
    } catch (e) {
      logger.warn('Failed to reconcile reversed payment artifacts (non-fatal):', e);
    }
  }

  /**
   * Record income from rental payments
   */
  async recordIncomeFromPayment(paymentId: string): Promise<void> {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new AppError('Payment not found', 404);
      }

      // Reversal rows and correction entries must not be posted as new income.
      if ((payment as any).reversalOfPaymentId) return;
      if (Number(payment.amount || 0) < 0) return;

      if (payment.status !== 'completed') {
        logger.info(`Skipping income recording for payment ${paymentId} - status: ${payment.status}`);
        return;
      }

      // Guard: exclude deposit-only payments from income
      const deposit = payment.depositAmount || 0;
      if (deposit > 0 && (payment.amount <= deposit)) {
        logger.info(`Skipping income for deposit-only payment ${paymentId} (amount: ${payment.amount}, deposit: ${deposit})`);
        return;
      }
      // Get or create property account (rental vs sale)
      const chosenLedger: 'rental' | 'sale' = payment.paymentType === 'sale' ? 'sale' : 'rental';
      const isSale = payment.paymentType === 'sale';

      let devId = (payment as any)?.developmentId as mongoose.Types.ObjectId | undefined;
      const unitId = (payment as any)?.developmentUnitId as mongoose.Types.ObjectId | undefined;
      const targets: Array<{ id: string; ledger: 'rental' | 'sale' }> = [];
      if (isSale) {
        if (unitId) targets.push({ id: unitId.toString(), ledger: 'sale' });
        if (!devId && unitId) {
          try { const unitDoc = await DevelopmentUnit.findById(unitId).select('developmentId'); devId = unitDoc?.developmentId as any; } catch {}
        }
        if (devId) targets.push({ id: devId.toString(), ledger: 'sale' });
        if (!unitId && !devId) targets.push({ id: payment.propertyId.toString(), ledger: 'sale' });
      } else {
        targets.push({ id: payment.propertyId.toString(), ledger: 'rental' });
      }

      let postedToAtLeastOneTarget = false;
      let notFoundCount = 0;
      for (const target of targets) {
        let account: IPropertyAccount | null = null as any;
        try {
          account = await this.getOrCreatePropertyAccount(target.id, target.ledger);
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

        // Check if income already recorded for this payment
        const existingTransaction = account.transactions.find(
          t => t.paymentId?.toString() === paymentId && t.type === 'income'
        );
        if (existingTransaction) {
          logger.info(`Income already recorded for payment: ${paymentId} on account ${String((account as any)._id)}`);
          postedToAtLeastOneTarget = true;
          continue;
        }

        const ownerAmount = payment.commissionDetails?.ownerAmount || 0;
        const totalPaid = payment.amount || 0;
        const depositPortion = payment.depositAmount || 0;
        const totalCommission = payment.commissionDetails?.totalCommission || 0;
        // Align rental income with commission-calculated owner amount (legacy behavior).
        // Deposit-only payments are already excluded above.
        const incomeAmount = isSale
          ? Math.max(0, ownerAmount)
          : Math.max(0, ownerAmount);

        if (incomeAmount <= 0) {
          logger.info(`Skipping income for payment ${paymentId} due to deposit exclusion or zero owner income (computed=${incomeAmount}).`);
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
          status: 'completed',
          processedBy: payment.processedBy,
          referenceNumber: payment.referenceNumber,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await PropertyAccount.updateOne(
          { _id: (account as any)._id, 'transactions.paymentId': { $ne: new mongoose.Types.ObjectId(paymentId) } },
          {
            $push: { transactions: incomeTransaction },
            $set: { lastUpdated: new Date() }
          }
        );
        const fresh = await PropertyAccount.findById((account as any)._id) as any;
        if (fresh) {
          await this.recalculateBalance(fresh as any);
        }
        logger.info(`Recorded income of ${incomeAmount} to account ${String((account as any)._id)} (target ${target.id}, ledger ${target.ledger}) from payment ${paymentId}`);
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

  async reverseIncomeFromPayment(paymentId: string, opts?: { processedBy?: string; reason?: string }): Promise<void> {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new AppError('Payment not found', 404);
      }

      const targets: Array<{ id: string; ledger: 'rental' | 'sale' }> = [];
      const isSale = payment.paymentType === 'sale';
      let devId = (payment as any)?.developmentId as mongoose.Types.ObjectId | undefined;
      const unitId = (payment as any)?.developmentUnitId as mongoose.Types.ObjectId | undefined;
      if (isSale) {
        if (unitId) targets.push({ id: unitId.toString(), ledger: 'sale' });
        if (!devId && unitId) {
          try { const unitDoc = await DevelopmentUnit.findById(unitId).select('developmentId'); devId = unitDoc?.developmentId as any; } catch {}
        }
        if (devId) targets.push({ id: devId.toString(), ledger: 'sale' });
        if (!unitId && !devId) targets.push({ id: payment.propertyId.toString(), ledger: 'sale' });
      } else {
        targets.push({ id: payment.propertyId.toString(), ledger: 'rental' });
      }

      for (const target of targets) {
        const account = await this.getOrCreatePropertyAccount(target.id, target.ledger);
        const originalIncomeIds = (account.transactions || [])
          .filter(
            (t: any) =>
              t.type === 'income' &&
              String(t.paymentId || '') === String(payment._id || '') &&
              String(t.status || '') === 'completed'
          )
          .map((t: any) => t._id)
          .filter(Boolean);

        // Clean up accidental legacy posting of reversal payment as income.
        const reversalPaymentId = (payment as any).reversalPaymentId ? String((payment as any).reversalPaymentId) : '';
        const reversalIncomeIds = (account.transactions || [])
          .filter(
            (t: any) =>
              t.type === 'income' &&
              reversalPaymentId &&
              String(t.paymentId || '') === reversalPaymentId &&
              String(t.status || '') === 'completed'
          )
          .map((t: any) => t._id)
          .filter(Boolean);

        const idsToCancel = [...originalIncomeIds, ...reversalIncomeIds];
        if (idsToCancel.length > 0) {
          await PropertyAccount.updateOne(
            { _id: (account as any)._id },
            {
              $set: {
                'transactions.$[t].status': 'cancelled',
                'transactions.$[t].updatedAt': new Date(),
                'transactions.$[t].notes': opts?.reason || 'Payment reversed',
                lastUpdated: new Date()
              }
            },
            {
              arrayFilters: [{ 't._id': { $in: idsToCancel } }] as any
            } as any
          );
        }

        // Retire old expense-based reversal rows for this payment to avoid duplicate noise.
        await PropertyAccount.updateOne(
          { _id: (account as any)._id },
          {
            $set: {
              'transactions.$[t].status': 'cancelled',
              'transactions.$[t].updatedAt': new Date(),
              lastUpdated: new Date()
            }
          },
          {
            arrayFilters: [{
              't.type': 'expense',
              't.category': 'payment_reversal',
              't.paymentId': new mongoose.Types.ObjectId(paymentId),
              't.status': 'completed'
            }] as any
          } as any
        );

        const fresh = await PropertyAccount.findById((account as any)._id) as any;
        if (fresh) {
          await this.recalculateBalance(fresh as any);
        }
      }
    } catch (error) {
      logger.error('Error reversing income from payment:', error);
      throw error;
    }
  }

  /**
   * Ensure ledgers for developments (with units) exist and backfill existing sale payments into those ledgers.
   * - Cross-references Developments and DevelopmentUnits
   * - Creates sale ledgers per development if missing (idempotent)
   * - Posts existing completed sale payments tied to the development or its units
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
      const existing = await PropertyAccount.findOne({
        propertyId: new mongoose.Types.ObjectId(dev._id),
        ledgerType: 'sale'
      });
      if (!existing) {
        await this.getOrCreatePropertyAccount(dev._id.toString(), 'sale');
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
      // Backfill incomes into dev ledger (and unit ledger if missing) idempotently
      for (const p of salePayments) {
        try {
          await this.recordIncomeFromPayment(p._id.toString());
          backfillInvocations++;
        } catch (e) {
          console.warn(`Backfill failed for payment ${String((p as any)._id)} on development ${String(dev._id)}:`, (e as any)?.message || e);
        }
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

      const account = await this.getOrCreatePropertyAccount(propertyId, ledgerType);

      if (account.runningBalance < expenseData.amount) {
        throw new AppError('Insufficient balance for this expense', 400);
      }

      const expenseTransaction: any = {
        type: 'expense',
        amount: expenseData.amount,
        date: expenseData.date,
        description: expenseData.description,
        category: expenseData.category || 'general',
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
        const fresh = await PropertyAccount.findById((account as any)._id) as any;
        if (fresh) {
          await this.recalculateBalance(fresh as any);
          res = await PropertyAccount.updateOne(
            { 
              _id: (fresh as any)._id,
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
      const reloaded = await PropertyAccount.findById((account as any)._id) as any;
      if (reloaded) await this.recalculateBalance(reloaded as any);
      logger.info(`Added expense (idempotent, guarded) of ${expenseData.amount} to property ${propertyId}`);
      return (await this.getPropertyAccount(propertyId)) as any;
    } catch (error) {
      logger.error('Error adding expense:', error);
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

      const account = await this.getPropertyAccount(propertyId, ledgerType);

      if (account.runningBalance < payoutData.amount) {
        throw new AppError('Insufficient balance for this payout', 400);
      }

      const referenceNumber = `PAYOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const payout: any = {
        amount: payoutData.amount,
        date: new Date(),
        paymentMethod: payoutData.paymentMethod,
        referenceNumber,
        idempotencyKey: idKey,
        status: 'pending',
        processedBy: new mongoose.Types.ObjectId(payoutData.processedBy),
        recipientId: new mongoose.Types.ObjectId(payoutData.recipientId),
        recipientName: payoutData.recipientName,
        recipientBankDetails: payoutData.recipientBankDetails,
        notes: payoutData.notes,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await PropertyAccount.updateOne(
        { _id: (account as any)._id, 'ownerPayouts.idempotencyKey': { $ne: idKey } },
        { $push: { ownerPayouts: payout }, $set: { lastUpdated: new Date() } }
      );
      const fresh = await PropertyAccount.findById((account as any)._id) as any;
      if (fresh) await this.recalculateBalance(fresh as any);
      logger.info(`Created owner payout (idempotent) of ${payoutData.amount} for property ${propertyId}`);
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
      const accounts = await PropertyAccount.find({ propertyId: pid });
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

      // Atomic status transition
      const now = new Date();
      if (targetPayout.status === 'pending' && status === 'completed') {
        if (targetAccount.runningBalance < targetPayout.amount) {
          throw new AppError('Insufficient balance to complete payout', 400);
        }
        const res = await PropertyAccount.updateOne(
          { 
            _id: (targetAccount as any)._id,
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
      const fresh = await PropertyAccount.findById((targetAccount as any)._id) as any;
      if (fresh) await this.recalculateBalance(fresh as any);

      logger.info(`Updated payout ${payoutId} status to ${status} for property ${propertyId} on ledger ${String((targetAccount as any).ledgerType || 'unknown')}`);
      
      return (await this.getPropertyAccount(propertyId, (targetAccount as any).ledgerType)) as any;
    } catch (error) {
      logger.error('Error updating payout status:', error);
      throw error;
    }
  }

  /**
   * Get property account with summary
   */
  async getPropertyAccount(propertyId: string, ledgerType?: 'rental' | 'sale'): Promise<IPropertyAccount> {
    try {
      // Ensure indexes are healthy and up-to-date (partial unique with archive support)
      await this.ensureLedgerIndexes();
      const pid = new mongoose.Types.ObjectId(propertyId);
      // Prefer exact ledgerType; consider legacy records without ledgerType as candidates as well.
      const effectiveLedger: 'rental' | 'sale' = ledgerType || await this.inferLedgerTypeForProperty(propertyId);
      const candidates = await PropertyAccount.find({
        propertyId: pid,
        isArchived: { $ne: true },
        $or: [{ ledgerType: effectiveLedger }, { ledgerType: { $exists: false } }, { ledgerType: null as any }]
      }) as any as IPropertyAccount[];

      let account: IPropertyAccount | null = null;
      if (!candidates || candidates.length === 0) {
        // Create if missing
        account = (await this.getOrCreatePropertyAccount(propertyId, effectiveLedger)) as IPropertyAccount;
      } else if (candidates.length === 1) {
        account = candidates[0];
      } else {
        // Multiple ledgers found (duplicates/legacy). Pick the most complete deterministically.
        const score = (acc: IPropertyAccount) => {
          const txCount = Array.isArray(acc.transactions) ? acc.transactions.length : 0;
          const payoutCount = Array.isArray(acc.ownerPayouts) ? acc.ownerPayouts.length : 0;
          const income = Number((acc as any).totalIncome || 0);
          const updated = acc.lastUpdated ? new Date(acc.lastUpdated).getTime() : 0;
          return { txCount, payoutCount, income, updated };
        };
        // Prefer legacy (missing/null ledgerType) as authoritative if present
        const prefer = candidates.filter(c => (c as any).ledgerType == null);
        const pool = prefer.length > 0 ? prefer : candidates;
        let best = pool[0];
        for (const c of pool.slice(1)) {
          const a = score(best);
          const b = score(c);
          const aScore = a.txCount + a.payoutCount;
          const bScore = b.txCount + b.payoutCount;
          if (bScore > aScore || (bScore === aScore && (b.income > a.income || (b.income === a.income && b.updated > a.updated)))) {
            best = c;
          }
        }
        account = best;
      }
      if (!account) throw new AppError('Property account not found', 404);
      
      // Update owner information if missing or outdated
      if (!account.ownerName || account.ownerName === 'Unknown Owner') {
        const property = await Property.findById(propertyId);
        if (property) {
          let ownerName = 'Unknown Owner';
          let ownerId = null as any;
          
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
          
          if (ownerId) {
            (account as IPropertyAccount).ownerId = ownerId;
            (account as IPropertyAccount).ownerName = ownerName;
            await (account as IPropertyAccount).save();
          }
        } else {
          // Fallback: resolve via Development document
          const development = await Development.findById(propertyId);
          if (development) {
            const first = development.owner?.firstName || '';
            const last = development.owner?.lastName || '';
            const companyName = development.owner?.companyName || '';
            const combined = `${first} ${last}`.trim();
            const ownerName = combined || companyName || 'Unknown Owner';
            (account as IPropertyAccount).ownerName = ownerName;
            await (account as IPropertyAccount).save();
          } else {
            // Fallback: resolve via DevelopmentUnit -> parent Development
            const unit = await DevelopmentUnit.findById(propertyId);
            if (unit) {
              try {
                const dev = await Development.findById((unit as any).developmentId);
                const first = dev?.owner?.firstName || '';
                const last = dev?.owner?.lastName || '';
                const companyName = dev?.owner?.companyName || '';
                const combined = `${first} ${last}`.trim();
                const ownerName = combined || companyName || 'Unknown Owner';
                (account as IPropertyAccount).ownerName = ownerName;
                await (account as IPropertyAccount).save();
              } catch {}
            }
          }
        }
      }

      // Defensive backfill for sales ledger: ensure owner income for each completed sale payment exists
      if (effectiveLedger === 'sale') {
        try {
          // Determine whether this account is for a Development, a Development Unit, or a Property
          const devExists = await Development.exists({ _id: pid });
          const unitExists = await DevelopmentUnit.exists({ _id: pid });
          const present = new Set(
            ((account as IPropertyAccount).transactions || [])
              .filter(t => t.type === 'income' && (t.category === 'sale_income' || !t.category))
              .map(t => String(t.paymentId || ''))
              .filter(Boolean)
          );

          const baseFilter: any = {
            paymentType: 'sale',
            status: 'completed',
            isProvisional: { $ne: true },
            isInSuspense: { $ne: true },
            $or: [
              { commissionFinalized: true },
              { commissionFinalized: { $exists: false } }
            ]
          };
          if (devExists) {
            baseFilter.developmentId = pid;
          } else if (unitExists) {
            baseFilter.developmentUnitId = pid;
          } else {
            baseFilter.propertyId = pid;
          }
          const payments = await Payment.find(baseFilter).select('_id');

          const missing = payments.map(p => String((p as any)._id)).filter(id => !present.has(id));
          for (const mid of missing) {
            try {
              await this.recordIncomeFromPayment(mid);
            } catch (e) {
              console.warn(`Sales ledger backfill failed for payment ${mid}:`, (e as any)?.message || e);
            }
          }

          if (missing.length > 0) {
            account = (await this.getOrCreatePropertyAccount(propertyId, 'sale')) as IPropertyAccount;
          }
        } catch (defErr) {
          console.warn('Sales ledger defensive backfill error (non-fatal):', defErr);
        }
      }
      
      // Recalculate balance for the account
      const finalAccount = account as unknown as IPropertyAccount;
      await this.reconcileReversedPaymentArtifacts(finalAccount);
      await this.recalculateBalance(finalAccount);
      
      return finalAccount;
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

  /**
   * Sync all property accounts with payment data
   */
  async syncPropertyAccountsWithPayments(): Promise<void> {
    try {
      logger.info('Starting property account sync with payments...');
      
      // Get all completed payments (rental and sale) to ensure owner income is posted
      const payments = await Payment.find({
        status: 'completed'
      });

      let syncedCount = 0;
      for (const payment of payments) {
        try {
          await this.recordIncomeFromPayment(payment._id.toString());
          syncedCount++;
        } catch (error) {
          logger.error(`Failed to sync payment ${payment._id}:`, error);
        }
      }

      logger.info(`Property account sync completed. Synced ${syncedCount} payments.`);
    } catch (error) {
      logger.error('Error syncing property accounts:', error);
      throw error;
    }
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
    ledgerType: 'rental' | 'sale' = 'rental'
  ): Promise<Transaction[]> {
    try {
      const account = await this.getPropertyAccount(propertyId, ledgerType);
      
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
      // Choose keeper: prefer legacy (missing/null ledgerType), then by most entries, then latest lastUpdated
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
            { _id: { $in: ids } },
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
    const rentalAccounts = await PropertyAccount.find({ ...filter, ledgerType: { $in: [null as any, 'rental'] } });
    for (const rental of rentalAccounts) {
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
        // Remove from rental ledger
        rental.transactions = rental.transactions.filter(t => !(t.type === 'income' && t.category === 'sale_income'));
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

    // Bypass Mongoose middleware to delete the source document permanently
    await (PropertyAccount as any).collection.deleteOne({ _id: source._id });

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
          const existingSale = await PropertyAccount.findOne({ propertyId: acc.propertyId, ledgerType: 'sale' });
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

// One-off maintenance: remove duplicate income transactions per (type,paymentId) for a given property ledger
export async function reconcilePropertyLedgerDuplicates(
  propertyId: string,
  ledgerType?: 'rental' | 'sale'
): Promise<{ removed: number; kept: number; accountId?: string }> {
  const service = PropertyAccountService.getInstance();
  const account = await service.getPropertyAccount(propertyId, ledgerType);
  const tx = Array.isArray(account.transactions) ? account.transactions : [];
  const byKey: Record<string, Array<{ _id?: any; date: Date }>> = Object.create(null);
  for (const t of tx) {
    const pid = (t as any)?.paymentId ? String((t as any).paymentId) : '';
    if (!pid) continue; // only dedupe entries that reference a payment
    const key = `${t.type}:${pid}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({ _id: (t as any)._id, date: new Date(t.date) });
  }
  const toRemove: any[] = [];
  let kept = 0;
  for (const key of Object.keys(byKey)) {
    const list = byKey[key];
    if (list.length <= 1) { kept += list.length; continue; }
    // Keep the earliest by date, remove the rest
    const sorted = list.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    kept += 1;
    toRemove.push(...sorted.slice(1).map(i => i._id).filter(Boolean));
  }
  if (toRemove.length > 0) {
    // Use native collection update to bypass immutability middleware intentionally for repair
    await (PropertyAccount as any).collection.updateOne(
      { _id: account._id },
      { $pull: { transactions: { _id: { $in: toRemove } } } }
    );
    const fresh = await PropertyAccount.findById(account._id);
    if (fresh) {
      await service.recalculateBalance(fresh as any);
    }
  }
  return { removed: toRemove.length, kept, accountId: String(account._id) };
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
  const svc = PropertyAccountService.getInstance() as any;
  if (typeof svc.ensureLedgerIndexes === 'function') {
    await svc.ensureLedgerIndexes();
  }
}

// Orchestrated maintenance: normalize legacy types, merge duplicates (keeping legacy), reconcile duplicate tx, recalc
export async function runPropertyLedgerMaintenance(options?: { companyId?: string; dryRun?: boolean; limit?: number }): Promise<{
  migrated: { examined: number; updated: number; merged: number; skipped: number; errors: number };
  deduped: { groupsChanged: boolean };
  reconciled: { accountsProcessed: number; removals: number };
}> {
  const service = PropertyAccountService.getInstance();
  await initializePropertyAccountIndexes();
  const migrated = await service.migrateLegacyLedgerTypesForCompany(options?.companyId || undefined, { dryRun: Boolean(options?.dryRun) });
  let groupsChanged = false;
  if (!options?.dryRun) {
    // Scope accounts by company if provided (via Properties/Developments/Units)
    let accountFilter: any = {};
    if (options?.companyId) {
      const [props, devs] = await Promise.all([
        Property.find({ companyId: options.companyId }).select('_id'),
        Development.find({ companyId: options.companyId }).select('_id')
      ]);
      const devIds = devs.map((d: any) => d._id);
      let unitIds: any[] = [];
      try {
        unitIds = await DevelopmentUnit.find({ developmentId: { $in: devIds } }).distinct('_id');
      } catch {}
      const ids = [...props.map(p => p._id), ...devIds, ...unitIds];
      accountFilter.propertyId = { $in: ids };
    }
    const accounts = await PropertyAccount.find({ ...accountFilter, isArchived: { $ne: true } });
    // Use internal merge with legacy preference
    const svcAny = service as any;
    if (typeof svcAny.mergeDuplicateAccounts === 'function') {
      groupsChanged = await svcAny.mergeDuplicateAccounts(accounts);
    }
    // Reconcile duplicate income transactions per account
    const propertyIds = Array.from(new Set(accounts.map(a => String((a as any).propertyId))));
    let removals = 0;
    for (const pid of propertyIds) {
      try {
        const res = await reconcilePropertyLedgerDuplicates(pid);
        removals += res.removed || 0;
      } catch {}
    }
    return {
      migrated,
      deduped: { groupsChanged },
      reconciled: { accountsProcessed: propertyIds.length, removals }
    };
  }
  return {
    migrated,
    deduped: { groupsChanged: false },
    reconciled: { accountsProcessed: 0, removals: 0 }
  };
}