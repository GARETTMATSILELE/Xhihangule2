import { TrustEventFailureLog } from '../models/TrustEventFailureLog';
import trustPaymentPostingService from './trustPaymentPostingService';

const MAX_ATTEMPTS = 5;
const PROCESS_INTERVAL_MS = 60_000;

class TrustEventRetryService {
  private timer: NodeJS.Timeout | null = null;
  private started = false;

  private calcNextRetry(attempts: number): Date {
    const backoffMinutes = Math.min(60, Math.pow(2, Math.max(0, attempts - 1)));
    return new Date(Date.now() + backoffMinutes * 60_000);
  }

  async enqueueFailure(eventName: string, payload: Record<string, unknown>, errorMessage: string, companyId?: string) {
    await TrustEventFailureLog.create({
      companyId,
      eventName,
      payload,
      errorMessage,
      attempts: 1,
      status: 'pending',
      nextRetryAt: this.calcNextRetry(1),
      lastTriedAt: new Date()
    });
  }

  async processPending(): Promise<void> {
    const now = new Date();
    const jobs = await TrustEventFailureLog.find({
      status: 'pending',
      nextRetryAt: { $lte: now }
    })
      .sort({ nextRetryAt: 1 })
      .limit(50);

    for (const job of jobs) {
      try {
        if (job.eventName === 'payment.confirmed') {
          await trustPaymentPostingService.postBuyerPaymentToTrust(job.payload as any);
        } else if (job.eventName === 'payment.reversed') {
          await trustPaymentPostingService.reverseBuyerPaymentInTrust(job.payload as any);
        }
        job.status = 'resolved';
        job.errorMessage = '';
        job.lastTriedAt = new Date();
        await job.save();
      } catch (error: any) {
        const nextAttempts = Number(job.attempts || 1) + 1;
        job.attempts = nextAttempts;
        job.errorMessage = error?.message || 'Retry failed';
        job.lastTriedAt = new Date();
        if (nextAttempts >= MAX_ATTEMPTS) {
          job.status = 'dead';
        } else {
          job.status = 'pending';
          job.nextRetryAt = this.calcNextRetry(nextAttempts);
        }
        await job.save();
      }
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.timer = setInterval(() => {
      void this.processPending();
    }, PROCESS_INTERVAL_MS);
  }

  stop() {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export default new TrustEventRetryService();
