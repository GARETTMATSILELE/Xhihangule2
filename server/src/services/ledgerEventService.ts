import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import LedgerEvent, { ILedgerEvent, LedgerEventType } from '../models/LedgerEvent';
import propertyAccountService from './propertyAccountService';
import { LEDGER_EVENT_PROCESSOR_GENERATION } from './ledgerMutationPolicy';
import {
  computeLedgerBackoffMs,
  isClaimableLedgerEvent
} from './ledgerEventStateMachine';

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

  async enqueueOwnerIncomeEvent(paymentId: string): Promise<void> {
    await this.enqueueEvent('owner_income', paymentId);
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
      await LedgerEvent.create({
        type,
        paymentId: paymentId ? new mongoose.Types.ObjectId(paymentId) : undefined,
        levyPaymentId: metadata?.levyPaymentId
          ? new mongoose.Types.ObjectId(String(metadata.levyPaymentId))
          : undefined,
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
        $or: [
          { status: { $in: ['pending', 'failed'] }, nextAttemptAt: { $lte: now } },
          { status: 'processing', claimedAt: { $lte: staleBefore } }
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
        } catch (err: any) {
          const attempts = (ev.attemptCount || 0) + 1;
          ev.attemptCount = attempts;
          ev.status = 'failed';
          ev.lastError = err?.message ? String(err.message) : String(err);
          ev.nextAttemptAt = new Date(Date.now() + computeLedgerBackoffMs(attempts));
          ev.updatedAt = new Date();
          await ev.save();
          logger.warn(
            `LedgerEvent ${ev._id} failed (attempt ${attempts}), next try in ${Math.round(computeLedgerBackoffMs(attempts) / 1000)}s:`,
            ev.lastError
          );
        }
      }
    } catch (outer) {
      logger.error('LedgerEvent processing loop failed:', outer);
    } finally {
      this.processing = false;
    }
  }

  private async execute(ev: ILedgerEvent): Promise<void> {
    const paymentId = ev.paymentId ? ev.paymentId.toString() : '';
    if (ev.type === 'owner_income' && paymentId) {
      await propertyAccountService.recordIncomeFromPayment(paymentId);
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
    if (ev.type === 'agent_commission' && paymentId) {
      const agentAccountService = (await import('./agentAccountService')).default;
      await agentAccountService.syncCommissionForPayment(paymentId);
      return;
    }
    if (ev.type === 'company_commission' && paymentId) {
      const { Payment } = await import('../models/Payment');
      const accountingIntegrationService = (await import('./accountingIntegrationService')).default;
      const payment = await Payment.findById(paymentId);
      if (!payment) return;
      await accountingIntegrationService.postCompanyCommission(payment as any);
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
