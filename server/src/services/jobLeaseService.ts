import crypto from 'crypto';
import os from 'os';
import SystemSetting from '../models/SystemSetting';
import { logger } from '../utils/logger';

export { canMutateLease, isLeaseAvailable } from './jobLeaseGuards';

// Reuses SystemSetting (unique `key`) so no accounting schema change.
// lastError holds the owner token; completedAt is the lease expiry.

const DEFAULT_LEASE_MS = Math.max(30_000, Number(process.env.SCHEDULED_JOB_LEASE_MS || 180_000));
const KEY_PREFIX = 'job_lease:';

export function getScheduledJobLeaseMs(): number {
  return DEFAULT_LEASE_MS;
}

export function getLeaseRenewIntervalMs(leaseMs: number = DEFAULT_LEASE_MS): number {
  return Math.max(10_000, Math.floor(leaseMs / 3));
}

export function leaseKey(jobName: string): string {
  return `${KEY_PREFIX}${jobName}`;
}

export async function acquireJobLease(
  jobName: string,
  leaseMs: number = DEFAULT_LEASE_MS
): Promise<{ token: string; ownerId: string } | null> {
  const now = new Date();
  const token = crypto.randomUUID();
  const ownerId = `${os.hostname()}:${process.pid}:${token.slice(0, 8)}`;
  const key = leaseKey(jobName);
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);

  try {
    const claimed = await SystemSetting.findOneAndUpdate(
      {
        key,
        $or: [
          { lastError: { $in: [null, ''] } },
          { lastError: { $exists: false } },
          { completedAt: { $exists: false } },
          { completedAt: null },
          { completedAt: { $lte: now } }
        ]
      },
      {
        $setOnInsert: { key, version: 1 },
        $set: {
          lastError: token,
          startedAt: now,
          completedAt: leaseExpiresAt,
          value: {
            kind: 'job_lease',
            ownerToken: token,
            ownerId,
            leaseExpiresAt,
            acquiredAt: now,
            renewedAt: now
          }
        }
      },
      { upsert: true, new: true }
    );

    if (!claimed || String(claimed.lastError || '') !== token) {
      return null;
    }
    return { token, ownerId };
  } catch (error: any) {
    if (error?.code === 11000) {
      return null;
    }
    throw error;
  }
}

export async function renewJobLease(
  jobName: string,
  token: string,
  leaseMs: number = DEFAULT_LEASE_MS
): Promise<boolean> {
  const leaseExpiresAt = new Date(Date.now() + leaseMs);
  const result = await SystemSetting.updateOne(
    { key: leaseKey(jobName), lastError: token },
    {
      $set: {
        completedAt: leaseExpiresAt,
        'value.leaseExpiresAt': leaseExpiresAt,
        'value.renewedAt': new Date()
      }
    }
  );
  return Number((result as any)?.matchedCount || 0) > 0;
}

export async function releaseJobLease(jobName: string, token: string): Promise<void> {
  await SystemSetting.updateOne(
    { key: leaseKey(jobName), lastError: token },
    {
      $set: {
        lastError: '',
        completedAt: new Date(0),
        'value.ownerToken': '',
        'value.ownerId': '',
        'value.leaseExpiresAt': new Date(0)
      }
    }
  );
}

export async function runWithJobLease<T>(
  jobName: string,
  fn: () => Promise<T>,
  leaseMs: number = DEFAULT_LEASE_MS
): Promise<{ skipped: boolean; result?: T }> {
  const acquired = await acquireJobLease(jobName, leaseMs);
  if (!acquired) {
    logger.info(`Scheduled job skipped; lease held by another worker`, { jobName });
    return { skipped: true };
  }

  const renewEveryMs = getLeaseRenewIntervalMs(leaseMs);
  const timer = setInterval(() => {
    void renewJobLease(jobName, acquired.token, leaseMs).then((ok) => {
      if (!ok) {
        logger.warn(`Scheduled job lease renewal failed`, { jobName, ownerId: acquired.ownerId });
      }
    }).catch((error) => {
      logger.warn(`Scheduled job lease renewal error`, { jobName, error });
    });
  }, renewEveryMs);

  try {
    const result = await fn();
    return { skipped: false, result };
  } finally {
    clearInterval(timer);
    try {
      await releaseJobLease(jobName, acquired.token);
    } catch (error) {
      logger.warn(`Scheduled job lease release failed`, { jobName, error });
    }
  }
}
