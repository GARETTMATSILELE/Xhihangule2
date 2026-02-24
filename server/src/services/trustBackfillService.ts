import crypto from 'crypto';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { Property } from '../models/Property';
import { TrustAccount } from '../models/TrustAccount';
import { TrustTransaction } from '../models/TrustTransaction';
import { TrustAuditLog } from '../models/TrustAuditLog';
import { MigrationState } from '../models/MigrationState';

const MIGRATION_NAME = 'trust_backfill_v1';
const MAX_BATCH_LIMIT = 50;
const LEASE_MINUTES = 10;

type BackfillOptions = {
  dryRun?: boolean;
  limit?: number;
  performedBy?: string;
};

type BackfillResult = {
  migrationName: string;
  dryRun: boolean;
  accountsCreated: number;
  transactionsCreated: number;
  skippedExisting: number;
  errors: Array<{ propertyId?: string; paymentId?: string; error: string }>;
  processedProperties: number;
  duration: number;
};

const money = (n: number): number => Number(Number(n || 0).toFixed(2));

const ensureBackfillIndexes = async () => {
  try {
    await mongoose.connection.db.createCollection('migration_state');
  } catch (error: any) {
    if (error?.code !== 48) throw error;
  }

  await mongoose.connection.collection('migration_state').createIndex({ migrationName: 1 }, { unique: true });
  await mongoose.connection.collection('migration_state').createIndex({ status: 1, leaseExpiresAt: 1 });
  await mongoose.connection.collection('trustaccounts').createIndex(
    { propertyId: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['OPEN', 'SETTLED'] } } }
  );
  await mongoose.connection.collection('trusttransactions').createIndex(
    { paymentId: 1 },
    { unique: true, partialFilterExpression: { paymentId: { $exists: true, $type: 'objectId' } } }
  );
};

const isTransientTxUnsupported = (error: any): boolean => {
  return error?.code === 20 || /Transaction numbers are only allowed/.test(String(error?.message || ''));
};

const acquireLock = async (dryRun: boolean) => {
  if (dryRun) return { state: null as any, token: `dryrun-${Date.now()}` };
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MINUTES * 60_000);
  const token = crypto.randomUUID();

  const state = await MigrationState.findOneAndUpdate(
    {
      migrationName: MIGRATION_NAME,
      $or: [
        { status: { $in: ['idle', 'completed', 'failed'] } },
        { leaseExpiresAt: { $lt: now } },
        { leaseExpiresAt: { $exists: false } }
      ]
    },
    {
      $setOnInsert: { migrationName: MIGRATION_NAME, processedCount: 0 },
      $set: { status: 'running', startedAt: now, completedAt: null, leaseExpiresAt, lockToken: token, error: '' }
    },
    { upsert: true, new: true }
  );

  if (!state || state.lockToken !== token) {
    throw new Error('Backfill is already running. Please retry later.');
  }
  return { state, token };
};

const extendLease = async (token: string, processedCount: number, lastProcessedId?: string) => {
  const leaseExpiresAt = new Date(Date.now() + LEASE_MINUTES * 60_000);
  await MigrationState.updateOne(
    { migrationName: MIGRATION_NAME, lockToken: token, status: 'running' },
    { $set: { leaseExpiresAt, processedCount, lastProcessedId } }
  );
};

const finishState = async (token: string, status: 'completed' | 'failed', processedCount: number, lastProcessedId?: string, error?: string) => {
  await MigrationState.updateOne(
    { migrationName: MIGRATION_NAME, lockToken: token },
    {
      $set: {
        status,
        processedCount,
        lastProcessedId,
        completedAt: new Date(),
        leaseExpiresAt: null,
        error: error || ''
      }
    }
  );
};

const readResumeCursor = async (dryRun: boolean): Promise<string | undefined> => {
  if (dryRun) return undefined;
  const state = await MigrationState.findOne({ migrationName: MIGRATION_NAME }).lean();
  return state?.lastProcessedId || undefined;
};

const getPropertyBatch = async (afterId: string | undefined, limit: number) => {
  const query: Record<string, unknown> = {};
  if (afterId && mongoose.Types.ObjectId.isValid(afterId)) {
    query._id = { $gt: new mongoose.Types.ObjectId(afterId) };
  }
  return Property.find(query).sort({ _id: 1 }).limit(limit).lean();
};

const shouldConsiderProperty = async (property: any): Promise<boolean> => {
  if (String(property?.status || '').toLowerCase() === 'sold') return true;
  if (String(property?.rentalType || '').toLowerCase() === 'sale') return true;
  const hasSalePayment = await Payment.exists({
    propertyId: property._id,
    paymentType: 'sale',
    status: 'completed',
    isProvisional: { $ne: true },
    isInSuspense: { $ne: true }
  });
  return Boolean(hasSalePayment);
};

const writeAudit = async (input: {
  companyId: string;
  action: 'TRUST_ACCOUNT_CREATED' | 'TRUST_TRANSACTION_CREATED' | 'SKIPPED_EXISTING';
  entityId: string;
  migrationId: string;
  performedBy?: string;
  payload?: Record<string, unknown>;
  session?: mongoose.ClientSession;
}) => {
  await TrustAuditLog.create(
    [
      {
        companyId: new mongoose.Types.ObjectId(input.companyId),
        entityType: 'MIGRATION',
        entityId: input.entityId,
        action: input.action,
        sourceEvent: 'migration.trust.backfill',
        migrationId: input.migrationId,
        oldValue: null,
        newValue: input.payload || {},
        performedBy: input.performedBy ? new mongoose.Types.ObjectId(input.performedBy) : undefined,
        timestamp: new Date()
      }
    ],
    input.session ? { session: input.session } : undefined
  );
};

const processProperty = async (
  property: any,
  options: { dryRun: boolean; migrationId: string; performedBy?: string }
): Promise<{ accountsCreated: number; transactionsCreated: number; skippedExisting: number; errors: Array<{ paymentId?: string; error: string }> }> => {
  const result = { accountsCreated: 0, transactionsCreated: 0, skippedExisting: 0, errors: [] as Array<{ paymentId?: string; error: string }> };

  const processWithSession = async (session?: mongoose.ClientSession) => {
    let trustAccount = await TrustAccount.findOne({
      companyId: property.companyId,
      propertyId: property._id,
      status: { $in: ['OPEN', 'SETTLED', 'CLOSED'] }
    })
      .sort({ createdAt: -1 })
      .session(session || null);

    if (!trustAccount) {
      if (!options.dryRun) {
        const purchasePrice = money(Number(property?.price || 0));
        const created = await TrustAccount.create(
          [
            {
              companyId: property.companyId,
              propertyId: property._id,
              sellerId: property.ownerId || undefined,
              openingBalance: 0,
              runningBalance: 0,
              closingBalance: 0,
              purchasePrice,
              amountReceived: 0,
              amountOutstanding: purchasePrice,
              status: 'OPEN',
              workflowState: 'TRUST_OPEN'
            }
          ],
          session ? { session } : undefined
        );
        trustAccount = created[0];
        await writeAudit({
          companyId: String(property.companyId),
          action: 'TRUST_ACCOUNT_CREATED',
          entityId: String(trustAccount._id),
          migrationId: options.migrationId,
          performedBy: options.performedBy,
          payload: { propertyId: String(property._id), dryRun: false },
          session
        });
      }
      result.accountsCreated += 1;
    } else {
      result.skippedExisting += 1;
      if (!options.dryRun) {
        await writeAudit({
          companyId: String(property.companyId),
          action: 'SKIPPED_EXISTING',
          entityId: String(trustAccount._id),
          migrationId: options.migrationId,
          performedBy: options.performedBy,
          payload: { reason: 'trust_account_exists', propertyId: String(property._id) },
          session
        });
      }
    }

    const payments = await Payment.find({
      companyId: property.companyId,
      propertyId: property._id,
      paymentType: 'sale',
      status: 'completed',
      isProvisional: { $ne: true },
      isInSuspense: { $ne: true }
    })
      .sort({ paymentDate: 1, _id: 1 })
      .session(session || null);

    if (!payments.length || !trustAccount) return;

    const lastTx = await TrustTransaction.findOne({
      companyId: property.companyId,
      trustAccountId: trustAccount._id
    })
      .sort({ createdAt: -1 })
      .session(session || null);

    let runningBalance = money(Number(lastTx?.runningBalance || trustAccount.runningBalance || 0));
    let amountReceived = money(Number(trustAccount.amountReceived || 0));
    const purchasePrice = money(Number(trustAccount.purchasePrice || property?.price || 0));

    for (const payment of payments) {
      const existing = await TrustTransaction.findOne({
        companyId: property.companyId,
        paymentId: payment._id
      }).session(session || null);

      if (existing) {
        result.skippedExisting += 1;
        if (!options.dryRun) {
          await writeAudit({
            companyId: String(property.companyId),
            action: 'SKIPPED_EXISTING',
            entityId: String(existing._id),
            migrationId: options.migrationId,
            performedBy: options.performedBy,
            payload: { reason: 'trust_transaction_exists', paymentId: String(payment._id) },
            session
          });
        }
        continue;
      }

      runningBalance = money(runningBalance + Number(payment.amount || 0));
      amountReceived = money(amountReceived + Number(payment.amount || 0));
      const txDoc = {
        companyId: property.companyId,
        trustAccountId: trustAccount._id,
        propertyId: property._id,
        paymentId: payment._id,
        type: 'BUYER_PAYMENT' as const,
        debit: 0,
        credit: money(Number(payment.amount || 0)),
        vatComponent: 0,
        runningBalance,
        reference: payment.referenceNumber,
        sourceEvent: 'migration.trust.backfill',
        createdBy: options.performedBy && mongoose.Types.ObjectId.isValid(options.performedBy)
          ? new mongoose.Types.ObjectId(options.performedBy)
          : undefined
      };

      if (!options.dryRun) {
        try {
          const createdTx = await TrustTransaction.create([txDoc], session ? { session } : undefined);
          await writeAudit({
            companyId: String(property.companyId),
            action: 'TRUST_TRANSACTION_CREATED',
            entityId: String(createdTx[0]._id),
            migrationId: options.migrationId,
            performedBy: options.performedBy,
            payload: { paymentId: String(payment._id), amount: Number(payment.amount || 0) },
            session
          });
        } catch (error: any) {
          if (error?.code === 11000) {
            result.skippedExisting += 1;
            continue;
          }
          throw error;
        }
      }
      result.transactionsCreated += 1;
    }

    if (!options.dryRun) {
      trustAccount.runningBalance = runningBalance;
      trustAccount.closingBalance = runningBalance;
      trustAccount.amountReceived = amountReceived;
      trustAccount.amountOutstanding = money(Math.max(0, purchasePrice - amountReceived));
      trustAccount.purchasePrice = purchasePrice;
      trustAccount.lastTransactionAt = new Date();
      await trustAccount.save(session ? { session } : undefined);
    }
  };

  if (options.dryRun) {
    await processWithSession(undefined);
    return result;
  }

  let session: mongoose.ClientSession | null = null;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await processWithSession(session || undefined);
    });
  } catch (error: any) {
    if (isTransientTxUnsupported(error)) {
      await processWithSession(undefined);
    } else {
      throw error;
    }
  } finally {
    if (session) {
      try {
        session.endSession();
      } catch {}
    }
  }

  return result;
};

export const backfillTrustAccounts = async (options: BackfillOptions = {}): Promise<BackfillResult> => {
  const start = Date.now();
  const dryRun = Boolean(options.dryRun);
  const limit = Math.min(MAX_BATCH_LIMIT, Math.max(1, Number(options.limit || MAX_BATCH_LIMIT)));
  const migrationId = `${MIGRATION_NAME}:${Date.now()}`;

  if (!dryRun) {
    await ensureBackfillIndexes();
  }

  const totals: BackfillResult = {
    migrationName: MIGRATION_NAME,
    dryRun,
    accountsCreated: 0,
    transactionsCreated: 0,
    skippedExisting: 0,
    errors: [],
    processedProperties: 0,
    duration: 0
  };

  const { token } = await acquireLock(dryRun);
  let lastProcessedId = await readResumeCursor(dryRun);
  let done = false;

  try {
    while (!done) {
      const batch = await getPropertyBatch(lastProcessedId, limit);
      if (!batch.length) {
        done = true;
        break;
      }

      for (const property of batch) {
        lastProcessedId = String(property._id);
        const relevant = await shouldConsiderProperty(property);
        if (!relevant) {
          totals.skippedExisting += 1;
          continue;
        }

        try {
          const r = await processProperty(property, { dryRun, migrationId, performedBy: options.performedBy });
          totals.accountsCreated += r.accountsCreated;
          totals.transactionsCreated += r.transactionsCreated;
          totals.skippedExisting += r.skippedExisting;
          totals.errors.push(...r.errors.map((e) => ({ propertyId: String(property._id), ...e })));
          totals.processedProperties += 1;
        } catch (error: any) {
          totals.errors.push({ propertyId: String(property._id), error: error?.message || 'Unknown property backfill error' });
        }
      }

      if (!dryRun) {
        await extendLease(token, totals.processedProperties, lastProcessedId);
      }
    }

    if (!dryRun) {
      await finishState(token, 'completed', totals.processedProperties, lastProcessedId);
    }
  } catch (error: any) {
    if (!dryRun) {
      await finishState(token, 'failed', totals.processedProperties, lastProcessedId, error?.message || 'Backfill failed');
    }
    throw error;
  }

  totals.duration = Date.now() - start;
  return totals;
};

export const getTrustBackfillState = async () => {
  return MigrationState.findOne({ migrationName: MIGRATION_NAME }).lean();
};

