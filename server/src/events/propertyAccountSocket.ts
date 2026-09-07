import { getIo } from '../config/socket';
import { logger } from '../utils/logger';

export type PropertyAccountUpdatedEventType =
  | 'payment_recorded'
  | 'payment_reversed'
  | 'expense_recorded'
  | 'payout_recorded'
  | 'payout_updated'
  | 'account_adjusted'
  | 'pass_through_updated';

export interface PropertyAccountUpdatedPayload {
  companyId?: string | null;
  propertyId?: string | null;
  accountId?: string | null;
  paymentId?: string | null;
  eventType: PropertyAccountUpdatedEventType | string;
}

function compactPayload(payload: PropertyAccountUpdatedPayload): Record<string, string> {
  const data: Record<string, string> = { eventType: String(payload.eventType) };
  if (payload.companyId) data.companyId = String(payload.companyId);
  if (payload.propertyId) data.propertyId = String(payload.propertyId);
  if (payload.accountId) data.accountId = String(payload.accountId);
  if (payload.paymentId) data.paymentId = String(payload.paymentId);
  return data;
}

/**
 * Notification only. Never include calculated balances.
 * Emit only after the accounting mutation has already succeeded.
 */
export function emitPropertyAccountUpdated(payload: PropertyAccountUpdatedPayload): void {
  try {
    const io = getIo();
    const data = compactPayload(payload);
    if (!io) {
      if (process.env.NODE_ENV !== 'production') {
        logger.info('propertyAccount.updated skipped (socket not initialized)', data);
      }
      return;
    }
    if (!data.companyId) {
      logger.warn('propertyAccount.updated skipped (missing companyId)', data);
      return;
    }
    io.to(`company-${data.companyId}`).emit('propertyAccount.updated', data);
    if (process.env.NODE_ENV !== 'production') {
      logger.info('propertyAccount.updated emitted', data);
    }
  } catch (error) {
    logger.warn('Failed to emit propertyAccount.updated (non-fatal)', error);
  }
}
