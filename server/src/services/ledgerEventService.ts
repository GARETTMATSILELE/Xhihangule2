import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import LedgerEvent, { ILedgerEvent, LedgerEventType } from '../models/LedgerEvent';
import propertyAccountService from './propertyAccountService';
import { LEDGER_EVENT_PROCESSOR_GENERATION } from './ledgerMutationPolicy';
import {
  computeLedgerBackoffMs,
  isClaimableLedgerEvent,
  LEDGER_RETRY_LIMIT,
  ledgerRetryExhausted
} from './ledgerEventStateMachine';
import { classifyOperationalFailure, OperationalFailureClass } from './operationalFailure';
import { recordAuditEvent } from './auditService';
import { signalOperationalFailure } from './operationalSignal';
import { resolveFinancialReview, upsertFinancialReview } from './financialOperationVisibility';

const STALE_PROCESSING_MS = 5 * 60 * 1000;

class LedgerEventService {
  private static instance: LedgerEventService;
  private processing: boolean = false;

  public static getInstance(): LedgerEventService {
    if (!LedgerEventService.instance) {
      LedgerEventService.instance = new LedgerEventService();
    }
    return LedgerEventService.instance;
  }

  /**
   * Retry owner-income posting for a Payment that failed during live completion.
   * Invokes paymentAccountingOrchestrator. Do not enqueue from historical full-sync.
   */
  async enqueueOwnerIncomeEvent(paymentId: string): Promise<void> {
    await this.enqueueEvent('owner_income', paymentId);
  }

  /**
   * One visible failed owner-income event. It is not claimable for automatic retry
   * and it does not post a second owner-income row.
   */
  async recordPermanentOwnerIncomeFailure(paymentId: string, message: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(paymentId)) return false;
    const paymentObjectId = new mongoose.Types.ObjectId(paymentId);
    const existing = await LedgerEvent.findOne({
      type: 'owner_income',
      paymentId: paymentObjectId,
      processorGeneration: LEDGER_EVENT_PROCESSOR_GENERATION
    }).select('_id').lean();
    if (existing) return true;
    const companyId = await this.companyIdForPayment(paymentId);
    await LedgerEvent.create({
      type: 'owner_income',
      paymentId: paymentObjectId,
      companyId,
      correlationId: paymentId,
      status: 'failed',
      failureClass: 'permanent',
      attemptCount: LEDGER_RETRY_LIMIT,
      lastError: message.slice(0, 200),
      exhaustedAt: new Date(),
      processorGeneration: LEDGER_EVENT_PROCESSOR_GENERATION,
      metadata: { reason: 'OWNER_INCOME_AMOUNT_MISSING' }
    });
    return true;
  }

  async enqueueEvent(
    type: LedgerEventType,
    paymentId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const filter: Record<string, unknown> = {
        type,
        status: { $in: ['pending', 'processing', 'failed'] },
        processorGeneration: LEDGER_EVENT_PROCESSOR_GENERATION
      };
      if (paymentId) filter.paymentId = new mongoose.Types.ObjectId(paymentId);
      if (metadata?.levyPaymentId) {
        filter.levyPaymentId = new mongoose.Types.ObjectId(String(metadata.levyPaymentId));
      }
      const existing = await LedgerEvent.findOne(filter).lean();
      if (existing) return;
      const companyId = await this.companyIdForPayment(paymentId);
      await LedgerEvent.create({
        type,
        paymentId: paymentId ? new mongoose.Types.ObjectId(paymentId) : undefined,
        levyPaymentId: metadata?.levyPaymentId
          ? new mongoose.Types.ObjectId(String(metadata.levyPaymentId))
          : undefined,
        companyId,
        correlationId: paymentId || (metadata?.levyPaymentId ? String(metadata.levyPaymentId) : undefined),
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: new Date(),
        processorGeneration: LEDGER_EVENT_PROCESSOR_GENERATION,
        metadata
      } as Partial<ILedgerEvent>);
    } catch (e) {
      logger.warn('Failed to enqueue ledger event:', (e as any)?.message || e);
      throw e;
    }
  }

  /**
   * Atomically claim one due event. Generation 2 only — Phase 5A pending
   * generation-less events are left untouched for Phase 5C.
   */
  async claimNext(now: Date = new Date()): Promise<ILedgerEvent | null> {
    const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
    const claimed = await LedgerEvent.findOneAndUpdate(
      {
        processorGeneration: LEDGER_EVENT_PROCESSOR_GENERATION,
        $and: [
          { $or: [{ attemptCount: { $lt: LEDGER_RETRY_LIMIT } }, { attemptCount: { $exists: false } }] },
          {
            $or: [
              { status: { $in: ['pending', 'failed'] }, nextAttemptAt: { $lte: now } },
              { status: 'processing', claimedAt: { $lte: staleBefore } }
            ]
          }
        ]
      },
      {
        $set: {
          status: 'processing',
          claimedAt: now,
          updatedAt: now
        }
      },
      { sort: { createdAt: 1 }, new: true }
    );
    return claimed;
  }

  async processPending(limit: number = 50): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      for (let i = 0; i < limit; i++) {
        const ev = await this.claimNext();
        if (!ev) break;
        if (!isClaimableLedgerEvent({
          status: 'processing',
          claimedAt: ev.claimedAt,
          processorGeneration: ev.processorGeneration,
          now: new Date(),
          staleProcessingMs: STALE_PROCESSING_MS,
          requiredGeneration: LEDGER_EVENT_PROCESSOR_GENERATION
        }) && ev.status !== 'processing') {
          continue;
        }
        try {
          await this.execute(ev);
          ev.status = 'completed';
          ev.lastError = undefined;
          ev.updatedAt = new Date();
          await ev.save();
          const eventPaymentId = ev.paymentId ? String(ev.paymentId) : '';
          if (eventPaymentId) {
            try {
              const { refreshPaymentAccountingStatus } = await import('./paymentAccountingReconciliation');
              await refreshPaymentAccountingStatus(eventPaymentId);
            } catch (refreshErr: any) {
              logger.warn('LedgerEvent accounting status refresh failed', {
                paymentId: eventPaymentId,
                error: refreshErr?.message || refreshErr
              });
            }
          }
        } catch (err: any) {
          const failureClass = classifyOperationalFailure(err);
          const attempts = failureClass === 'transient'
            ? (ev.attemptCount || 0) + 1
            : LEDGER_RETRY_LIMIT;
          await this.recordEventFailure(ev, err, failureClass, attempts);
        }
      }
    } catch (outer) {
      logger.error('LedgerEvent processing loop failed:', outer);
    } finally {
      this.processing = false;
    }
  }

  private async companyIdForPayment(paymentId?: string): Promise<mongoose.Types.ObjectId | undefined> {
    if (!paymentId || !mongoose.Types.ObjectId.isValid(paymentId)) return undefined;
    const { Payment } = await import('../models/Payment');
    const payment = await Payment.findById(paymentId).select('companyId').lean();
    return payment?.companyId ? new mongoose.Types.ObjectId(String(payment.companyId)) : undefined;
  }

  private async recordEventFailure(
    ev: ILedgerEvent,
    err: unknown,
    failureClass: OperationalFailureClass,
    attempts: number
  ): Promise<void> {
    const exhausted = ledgerRetryExhausted(attempts) || failureClass !== 'transient';
    ev.attemptCount = attempts;
    ev.status = 'failed';
    ev.failureClass = failureClass;
    ev.lastError = (err as { message?: string })?.message
      ? String((err as { message?: string }).message).slice(0, 200)
      : 'ledger event failed';
    ev.correlationId = ev.correlationId || (ev.paymentId ? String(ev.paymentId) : String(ev._id));
    if (!ev.companyId && ev.paymentId) {
      ev.companyId = await this.companyIdForPayment(String(ev.paymentId));
    }
    ev.nextAttemptAt = exhausted ? undefined : new Date(Date.now() + computeLedgerBackoffMs(attempts));
    ev.exhaustedAt = exhausted ? new Date() : undefined;
    ev.updatedAt = new Date();
    await ev.save();
    logger.warn('ledger_event_failed', {
      correlationId: ev.correlationId,
      eventId: String(ev._id),
      companyId: ev.companyId ? String(ev.companyId) : undefined,
      sourceId: ev.paymentId ? String(ev.paymentId) : undefined,
      type: ev.type,
      attemptCount: attempts,
      failureClass,
      retryExhausted: exhausted
    });
    if (exhausted) {
      signalOperationalFailure('LEDGER_RETRY_EXHAUSTED', {
        correlationId: ev.correlationId,
        eventId: String(ev._id),
        companyId: ev.companyId ? String(ev.companyId) : undefined,
        sourceId: ev.paymentId ? String(ev.paymentId) : (ev.levyPaymentId ? String(ev.levyPaymentId) : undefined),
        type: ev.type,
        attemptCount: attempts,
        failureClass,
        lastAttemptAt: ev.updatedAt.toISOString()
      });
      if (ev.companyId) {
        await upsertFinancialReview({
          companyId: String(ev.companyId),
          component: 'LEDGER_RETRY_EXHAUSTED',
          operationId: String(ev._id),
          paymentId: ev.paymentId ? String(ev.paymentId) : undefined,
          missingRecord: `ledger event ${ev.type}`,
          issueType: 'missing',
          actual: failureClass,
          recommendedReview: `Ledger event ${String(ev._id)} for company ${String(ev.companyId)} is ${failureClass} after ${attempts} attempts. Correlation ${ev.correlationId}. Reason: ${ev.lastError}. ${failureClass === 'transient' ? 'An authorised retry repeats this same event.' : 'This failure is not automatically retried.'} Do not create a new financial operation and do not rewrite historical amounts.`
        });
      }
    }
  }

  /**
   * Authorised retry of one existing ledger event. This does not create a second event.
   * Permanent and conflict failures are refused. The worker retry limit is unchanged.
   */
  async retryFailedEvent(
    eventId: string,
    companyId: string,
    audit?: { userId?: string; requestId?: string }
  ): Promise<{ status: 'completed'; retriedExistingEvent: true; auditPersisted: boolean }> {
    const correlationId = audit?.requestId || eventId;
    const auditFailure = async (result: string, operation?: string) => {
      await recordAuditEvent({
        userId: audit?.userId,
        companyId,
        action: 'ledger.retry',
        entityType: 'LedgerEvent',
        entityId: eventId,
        status: 'failure',
        metadata: { operation: operation || 'unknown', result, correlationId }
      });
    };
    if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(companyId)) {
      await auditFailure('LEDGER_EVENT_COMPANY_MISMATCH');
      const error: any = new Error('Ledger event was not found for this company');
      error.code = 'LEDGER_EVENT_COMPANY_MISMATCH';
      throw error;
    }
    const existing = await LedgerEvent.findById(eventId);
    if (!existing || existing.status !== 'failed') {
      await auditFailure('LEDGER_EVENT_NOT_RETRYABLE', existing?.type);
      const error: any = new Error('Only a failed ledger event can be retried');
      error.code = 'LEDGER_EVENT_NOT_RETRYABLE';
      throw error;
    }
    if (existing.failureClass !== 'transient') {
      await auditFailure('LEDGER_EVENT_NOT_RETRYABLE', existing.type);
      const error: any = new Error('Permanent and conflict failures are not retried automatically or by this action');
      error.code = 'LEDGER_EVENT_NOT_RETRYABLE';
      throw error;
    }
    const ownerCompany = existing.companyId || await this.companyIdForPayment(existing.paymentId ? String(existing.paymentId) : undefined);
    if (!ownerCompany || String(ownerCompany) !== companyId) {
      await auditFailure('LEDGER_EVENT_COMPANY_MISMATCH', existing.type);
      const error: any = new Error('Ledger event was not found for this company');
      error.code = 'LEDGER_EVENT_COMPANY_MISMATCH';
      throw error;
    }
    const operationCorrelation = audit?.requestId || existing.correlationId || eventId;
    const started = await recordAuditEvent({
      userId: audit?.userId,
      companyId,
      action: 'ledger.retry',
      entityType: 'LedgerEvent',
      entityId: eventId,
      status: 'success',
      metadata: { operation: existing.type, result: 'started', correlationId: operationCorrelation }
    });
    if (!started) {
      const error: any = new Error('Ledger retry was not started because the audit event could not be stored');
      error.code = 'AUDIT_PERSIST_FAILED';
      throw error;
    }
    const claimed = await LedgerEvent.findOneAndUpdate(
      { _id: existing._id, status: 'failed', failureClass: 'transient' },
      { $set: { status: 'processing', claimedAt: new Date(), companyId: ownerCompany } },
      { new: true }
    );
    if (!claimed) {
      await auditFailure('LEDGER_EVENT_ALREADY_CLAIMED', existing.type);
      const error: any = new Error('This ledger event is already being retried');
      error.code = 'LEDGER_EVENT_ALREADY_CLAIMED';
      throw error;
    }
    try {
      await this.execute(claimed);
      claimed.status = 'completed';
      claimed.lastError = undefined;
      claimed.updatedAt = new Date();
      await claimed.save();
      await resolveFinancialReview(
        companyId,
        'LEDGER_RETRY_EXHAUSTED',
        String(claimed._id),
        'The existing ledger event completed. No new financial operation was created.'
      );
      if (claimed.paymentId) {
        try {
          const { refreshPaymentAccountingStatus } = await import('./paymentAccountingReconciliation');
          await refreshPaymentAccountingStatus(String(claimed.paymentId));
        } catch (refreshErr: any) {
          logger.warn('LedgerEvent accounting status refresh failed', {
            paymentId: String(claimed.paymentId),
            error: refreshErr?.message || refreshErr
          });
        }
      }
      const auditPersisted = await recordAuditEvent({
        userId: audit?.userId,
        companyId,
        action: 'ledger.retry',
        entityType: 'LedgerEvent',
        entityId: eventId,
        status: 'success',
        metadata: { operation: claimed.type, result: 'completed', correlationId: operationCorrelation }
      });
      if (!auditPersisted) await this.recordMissingRetryAudit(claimed, operationCorrelation, 'completed');
      return { status: 'completed', retriedExistingEvent: true, auditPersisted };
    } catch (err) {
      const failureClass = classifyOperationalFailure(err);
      const attempts = failureClass === 'transient' ? (claimed.attemptCount || 0) + 1 : LEDGER_RETRY_LIMIT;
      await this.recordEventFailure(claimed, err, failureClass, attempts);
      const auditPersisted = await recordAuditEvent({
        userId: audit?.userId,
        companyId,
        action: 'ledger.retry',
        entityType: 'LedgerEvent',
        entityId: eventId,
        status: 'failure',
        metadata: { operation: claimed.type, result: failureClass, correlationId: operationCorrelation }
      });
      if (!auditPersisted) await this.recordMissingRetryAudit(claimed, operationCorrelation, failureClass);
      throw err;
    }
  }

  /**
   * The financial outcome is already stored. A missing audit event is recorded
   * without reversing that outcome and without posting it again.
   */
  private async recordMissingRetryAudit(ev: ILedgerEvent, correlationId: string, result: string): Promise<void> {
    try {
      ev.metadata = { ...(ev.metadata || {}), auditPersisted: false, auditGapResult: result, auditCorrelationId: correlationId };
      ev.markModified('metadata');
      await ev.save();
    } catch (error) {
      logger.error('ledger_retry_audit_gap_unpersisted', {
        correlationId,
        eventId: String(ev._id),
        result,
        error: String((error as { message?: string })?.message || error).slice(0, 200)
      });
      return;
    }
    if (!ev.companyId) {
      logger.error('ledger_retry_audit_gap_unpersisted', { correlationId, eventId: String(ev._id), result });
      return;
    }
    try {
      await upsertFinancialReview({
        companyId: String(ev.companyId),
        component: 'AUDIT_EVENT_MISSING',
        operationId: String(ev._id),
        paymentId: ev.paymentId ? String(ev.paymentId) : undefined,
        missingRecord: 'ledger retry audit event',
        issueType: 'missing',
        recommendedReview: `Ledger retry ${String(ev._id)} kept its financial outcome, and the audit event was not stored. Correlation ${correlationId}. Result ${result}. Do not post this operation again.`
      });
    } catch (error) {
      logger.error('ledger_retry_audit_gap_unpersisted', {
        correlationId,
        eventId: String(ev._id),
        result,
        error: String((error as { message?: string })?.message || error).slice(0, 200)
      });
    }
  }

  private async execute(ev: ILedgerEvent): Promise<void> {
    const paymentId = ev.paymentId ? ev.paymentId.toString() : '';
    if (ev.type === 'journal' && paymentId) {
      const { Payment } = await import('../models/Payment');
      const accountingIntegrationService = (await import('./accountingIntegrationService')).default;
      const payment = await Payment.findById(paymentId);
      if (!payment) throw new Error(`Payment not found: ${paymentId}`);
      await accountingIntegrationService.syncPaymentReceived(payment as any);
      return;
    }
    if ((ev.type === 'owner_income' || ev.type === 'agent_commission' || ev.type === 'company_commission') && paymentId) {
      const { postPaymentAccounting } = await import('./paymentAccountingOrchestrator');
      const result = await postPaymentAccounting(paymentId);
      if (result.status === 'partial' || result.status === 'failed') {
        throw new Error(result.errors.join('; ') || 'accounting projection still incomplete');
      }
      return;
    }
    if (ev.type === 'payment_reversal' && paymentId) {
      const { reversePaymentAccounting } = await import('./paymentAccountingOrchestrator');
      const result = await reversePaymentAccounting(paymentId, {
        reason: String((ev.metadata as any)?.reason || 'ledger_event_retry'),
        reversalPaymentId: (ev.metadata as any)?.reversalPaymentId
          ? String((ev.metadata as any).reversalPaymentId)
          : undefined
      });
      if (result.status === 'partial' || result.status === 'failed') {
        throw new Error(result.errors.join('; ') || 'reversal still incomplete');
      }
      return;
    }
    if (ev.type === 'levy_collection') {
      const levyPaymentId = ev.levyPaymentId ? String(ev.levyPaymentId) : String((ev.metadata as any)?.levyPaymentId || '');
      if (!levyPaymentId) throw new Error('levy_collection event missing levyPaymentId');
      await this.repostLevyCollection(levyPaymentId);
      return;
    }
    if (ev.type === 'levy_payout') {
      const levyPaymentId = ev.levyPaymentId ? String(ev.levyPaymentId) : String((ev.metadata as any)?.levyPaymentId || '');
      if (!levyPaymentId) throw new Error('levy_payout event missing levyPaymentId');
      await this.repostLevyPayout(levyPaymentId);
      return;
    }
  }

  private async repostLevyCollection(levyPaymentId: string): Promise<void> {
    const { LevyPayment } = await import('../models/LevyPayment');
    const levy = await LevyPayment.findById(levyPaymentId);
    if (!levy) throw new Error(`LevyPayment ${levyPaymentId} not found`);
    await propertyAccountService.recordPassThroughCollection({
      propertyId: String(levy.propertyId),
      companyId: String(levy.companyId),
      chargeType: 'LEVY',
      amount: Number(levy.amount || 0),
      date: levy.paymentDate,
      levyPaymentId: String(levy._id),
      referenceNumber: levy.referenceNumber,
      description: `Levies collected - ${levy.referenceNumber || levy._id}`,
      processedBy: String(levy.processedBy || ''),
      notes: levy.notes,
      idempotencyKey: `levy-payment:${String(levy._id)}:collection`
    });
  }

  private async repostLevyPayout(levyPaymentId: string): Promise<void> {
    const { LevyPayment } = await import('../models/LevyPayment');
    const levy = await LevyPayment.findById(levyPaymentId);
    if (!levy) throw new Error(`LevyPayment ${levyPaymentId} not found`);
    const payout: any = levy.get('payout') || {};
    await propertyAccountService.recordPassThroughPayment({
      propertyId: String(levy.propertyId),
      companyId: String(levy.companyId),
      chargeType: 'LEVY',
      amount: Number(levy.amount || 0),
      date: payout.payoutDate ? new Date(payout.payoutDate) : new Date(),
      levyPaymentId: String(levy._id),
      referenceNumber: payout.payoutReference || levy.referenceNumber,
      description: `Levies paid - ${payout.payoutReference || levy.referenceNumber || levy._id}`,
      processedBy: String(payout.processedBy || levy.processedBy || ''),
      notes: payout.notes,
      idempotencyKey: `levy-payment:${String(levy._id)}:payout`
    });
  }
}

export default LedgerEventService.getInstance();
