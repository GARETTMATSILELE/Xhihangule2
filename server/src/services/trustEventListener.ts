import { subscribe } from '../events/eventBus';
import trustPaymentPostingService from './trustPaymentPostingService';
import trustEventRetryService from './trustEventRetryService';
import { EventDedupRecord } from '../models/EventDedupRecord';

let unsubscribePaymentConfirmed: (() => void) | null = null;
let unsubscribePaymentReversed: (() => void) | null = null;
let started = false;

export const startTrustEventListener = () => {
  if (started) return;
  started = true;

  unsubscribePaymentConfirmed = subscribe<any>('payment.confirmed', async (payload) => {
    try {
      const eventId = String(payload?.eventId || `payment.confirmed:${String(payload?.paymentId || '')}`);
      const existingProcessed = await EventDedupRecord.findOne({
        scope: 'trust-payment-confirmed-listener',
        eventId,
        status: 'processed'
      }).lean();
      if (existingProcessed) return;

      const result = await trustPaymentPostingService.postBuyerPaymentToTrust({
        ...payload,
        sourceEvent: 'payment.confirmed'
      });
      await EventDedupRecord.updateOne(
        { scope: 'trust-payment-confirmed-listener', eventId },
        {
          $set: {
            status: 'processed',
            companyId: payload?.companyId || undefined,
            processedAt: new Date(),
            lastError: ''
          }
        },
        { upsert: true }
      );
      try {
        const { getIo } = await import('../config/socket');
        const io = getIo();
        if (io) {
          const trustAccountId = String((result as any)?.account?._id || '');
          const data = { trustAccountId, event: 'payment.confirmed', timestamp: new Date().toISOString() };
          io.to(`company-${String(payload?.companyId || '')}`).emit('trust.updated', data);
          io.to(`company-${String(payload?.companyId || '')}`).emit('trustAccountUpdated', data);
        }
      } catch {
        // non-fatal
      }
    } catch (error: any) {
      console.error('payment.confirmed handling failed:', error);
      const eventId = String(payload?.eventId || `payment.confirmed:${String(payload?.paymentId || '')}`);
      await EventDedupRecord.updateOne(
        { scope: 'trust-payment-confirmed-listener', eventId },
        { $set: { status: 'failed', companyId: payload?.companyId || undefined, lastError: error?.message || 'listener failed' } },
        { upsert: true }
      );
      await trustEventRetryService.enqueueFailure(
        'payment.confirmed',
        payload,
        error?.message || 'Listener failure',
        payload?.companyId
      );
    }
  });

  unsubscribePaymentReversed = subscribe<any>('payment.reversed', async (payload) => {
    try {
      const eventId = String(payload?.eventId || `payment.reversed:${String(payload?.paymentId || '')}`);
      const existingProcessed = await EventDedupRecord.findOne({
        scope: 'trust-payment-reversed-listener',
        eventId,
        status: 'processed'
      }).lean();
      if (existingProcessed) return;

      const result = await trustPaymentPostingService.reverseBuyerPaymentInTrust({
        ...payload,
        sourceEvent: 'payment.reversed'
      });

      await EventDedupRecord.updateOne(
        { scope: 'trust-payment-reversed-listener', eventId },
        {
          $set: {
            status: 'processed',
            companyId: payload?.companyId || undefined,
            processedAt: new Date(),
            lastError: ''
          }
        },
        { upsert: true }
      );
      try {
        const { getIo } = await import('../config/socket');
        const io = getIo();
        if (io) {
          const trustAccountId = String((result as any)?.account?._id || '');
          const data = {
            trustAccountId,
            event: 'payment.reversed',
            paymentId: String(payload?.paymentId || ''),
            timestamp: new Date().toISOString()
          };
          io.to(`company-${String(payload?.companyId || '')}`).emit('trust.updated', data);
          io.to(`company-${String(payload?.companyId || '')}`).emit('trustAccountUpdated', data);
        }
      } catch {
        // non-fatal
      }
    } catch (error: any) {
      const eventId = String(payload?.eventId || `payment.reversed:${String(payload?.paymentId || '')}`);
      await EventDedupRecord.updateOne(
        { scope: 'trust-payment-reversed-listener', eventId },
        { $set: { status: 'failed', companyId: payload?.companyId || undefined, lastError: error?.message || 'listener failed' } },
        { upsert: true }
      );
      await trustEventRetryService.enqueueFailure(
        'payment.reversed',
        payload,
        error?.message || 'Listener failure',
        payload?.companyId
      );
    }
  });

  trustEventRetryService.start();
};

export const stopTrustEventListener = () => {
  if (unsubscribePaymentConfirmed) {
    unsubscribePaymentConfirmed();
    unsubscribePaymentConfirmed = null;
  }
  if (unsubscribePaymentReversed) {
    unsubscribePaymentReversed();
    unsubscribePaymentReversed = null;
  }
  trustEventRetryService.stop();
  started = false;
};

export default {
  startTrustEventListener,
  stopTrustEventListener
};
