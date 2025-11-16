import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import LedgerEvent, { ILedgerEvent } from '../models/LedgerEvent';
import propertyAccountService from './propertyAccountService';

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
    try {
      const pid = new mongoose.Types.ObjectId(paymentId);
      // Upsert a pending event only if there isn't already one pending/processing
      const existing = await LedgerEvent.findOne({
        type: 'owner_income',
        paymentId: pid,
        status: { $in: ['pending', 'processing', 'failed'] }
      }).lean();
      if (existing) return;
      await LedgerEvent.create({
        type: 'owner_income',
        paymentId: pid,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: new Date()
      } as Partial<ILedgerEvent>);
    } catch (e) {
      logger.warn('Failed to enqueue owner income event:', (e as any)?.message || e);
    }
  }

  private computeNextBackoffMs(attempt: number): number {
    // Exponential backoff with jitter: base 5s, cap 10m
    const base = 5000; // 5 seconds
    const cap = 10 * 60 * 1000; // 10 minutes
    const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
    const jitter = Math.floor(Math.random() * Math.min(3000, exp * 0.2));
    return exp + jitter;
  }

  async processPending(limit: number = 50): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const now = new Date();
      const items = await LedgerEvent.find({
        status: { $in: ['pending', 'failed'] },
        nextAttemptAt: { $lte: now }
      }).sort({ createdAt: 1 }).limit(limit);

      for (const ev of items) {
        try {
          // Mark processing to avoid double work in concurrent runners
          ev.status = 'processing';
          ev.updatedAt = new Date();
          await ev.save();

          await propertyAccountService.recordIncomeFromPayment(ev.paymentId.toString());

          ev.status = 'completed';
          ev.lastError = undefined;
          ev.updatedAt = new Date();
          await ev.save();
        } catch (err: any) {
          const attempts = (ev.attemptCount || 0) + 1;
          ev.attemptCount = attempts;
          ev.status = 'failed';
          ev.lastError = err?.message ? String(err.message) : String(err);
          const backoffMs = this.computeNextBackoffMs(attempts);
          ev.nextAttemptAt = new Date(Date.now() + backoffMs);
          ev.updatedAt = new Date();
          await ev.save();
          logger.warn(`LedgerEvent ${ev._id} failed (attempt ${attempts}), next try in ${Math.round(backoffMs/1000)}s:`, ev.lastError);
        }
      }
    } catch (outer) {
      logger.error('LedgerEvent processing loop failed:', outer);
    } finally {
      this.processing = false;
    }
  }
}

export default LedgerEventService.getInstance();


