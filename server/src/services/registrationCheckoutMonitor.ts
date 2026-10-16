import { PaymentSession } from '../models/PaymentSession';
import { logger } from '../utils/logger';

const STUCK_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * Detection only. Does not activate a company or retry a checkout.
 */
export async function logStuckRegistrationCheckouts(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MS);
  const rows = await PaymentSession.find({
    status: { $in: ['pending', 'provider_created'] },
    createdAt: { $lte: cutoff }
  }).select('_id companyId status provider createdAt').limit(50).lean();
  for (const row of rows as any[]) {
    logger.warn('registration_checkout_stuck', {
      correlationId: String(row._id),
      paymentSessionId: String(row._id),
      companyId: row.companyId ? String(row.companyId) : undefined,
      status: row.status,
      provider: row.provider,
      failureClass: 'permanent'
    });
  }
  return rows.length;
}
