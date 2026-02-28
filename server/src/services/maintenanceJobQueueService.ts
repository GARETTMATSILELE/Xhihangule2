import os from 'os';
import { MaintenanceJob, IMaintenanceJob, MaintenanceJobOperation } from '../models/MaintenanceJob';
import propertyAccountService from './propertyAccountService';
import { logger } from '../utils/logger';

const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.MAINTENANCE_QUEUE_POLL_INTERVAL_MS || 5000));
const LEASE_MS = Math.max(15000, Number(process.env.MAINTENANCE_QUEUE_LEASE_MS || 120000));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.MAINTENANCE_QUEUE_MAX_ATTEMPTS || 3));

class MaintenanceJobQueueService {
  private static instance: MaintenanceJobQueueService;
  private timer: NodeJS.Timeout | null = null;
  private processing = false;
  private readonly workerId = `${os.hostname()}:${process.pid}`;

  static getInstance(): MaintenanceJobQueueService {
    if (!MaintenanceJobQueueService.instance) {
      MaintenanceJobQueueService.instance = new MaintenanceJobQueueService();
    }
    return MaintenanceJobQueueService.instance;
  }

  async enqueue(
    operation: MaintenanceJobOperation,
    payload: { companyId?: string; requestedBy?: string; runAfter?: Date }
  ): Promise<{ job: IMaintenanceJob; deduplicated: boolean }> {
    const existing = await MaintenanceJob.findOne({
      operation,
      companyId: payload.companyId || '',
      status: { $in: ['pending', 'running'] }
    })
      .sort({ createdAt: -1 })
      .lean();

    if (existing) {
      return { job: existing as any, deduplicated: true };
    }

    const created = await MaintenanceJob.create({
      operation,
      companyId: payload.companyId || '',
      requestedBy: payload.requestedBy || '',
      status: 'pending',
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      runAfter: payload.runAfter || new Date()
    });
    return { job: created, deduplicated: false };
  }

  async getJobById(jobId: string, companyId?: string): Promise<any | null> {
    return MaintenanceJob.findOne({
      _id: jobId,
      ...(companyId ? { companyId } : {})
    }).lean();
  }

  async listRecentJobs(companyId: string, operation?: MaintenanceJobOperation, limit = 20): Promise<any[]> {
    return MaintenanceJob.find({
      companyId,
      ...(operation ? { operation } : {})
    })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
    logger.info(`Maintenance queue started (poll=${POLL_INTERVAL_MS}ms, worker=${this.workerId})`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.requeueExpiredLeases();
      const job = await this.claimNextJob();
      if (!job) return;
      await this.executeJob(job);
    } catch (error) {
      logger.error('Maintenance queue tick failed:', error);
    } finally {
      this.processing = false;
    }
  }

  private async requeueExpiredLeases(): Promise<void> {
    const now = new Date();
    await MaintenanceJob.updateMany(
      {
        status: 'running',
        leaseExpiresAt: { $lt: now }
      },
      {
        $set: {
          status: 'pending',
          runAfter: new Date(now.getTime() + 5000),
          workerId: '',
          leaseExpiresAt: undefined
        }
      }
    );
  }

  private async claimNextJob(): Promise<IMaintenanceJob | null> {
    const now = new Date();
    return MaintenanceJob.findOneAndUpdate(
      {
        status: 'pending',
        runAfter: { $lte: now }
      },
      {
        $set: {
          status: 'running',
          workerId: this.workerId,
          startedAt: new Date(),
          leaseExpiresAt: new Date(Date.now() + LEASE_MS),
          finishedAt: undefined
        },
        $inc: { attempts: 1 }
      },
      {
        sort: { runAfter: 1, createdAt: 1 },
        new: true
      }
    );
  }

  private async executeJob(job: IMaintenanceJob): Promise<void> {
    try {
      let result: any = {};
      if (job.operation === 'sync_property_accounts') {
        await propertyAccountService.syncPropertyAccountsWithPayments();
        const migrated = await propertyAccountService.migrateSalesLedgerForCompany();
        result = { migrated };
      } else if (job.operation === 'ensure_development_ledgers') {
        result = await propertyAccountService.ensureDevelopmentLedgersAndBackfillPayments({
          companyId: job.companyId || undefined
        });
      } else {
        throw new Error(`Unknown maintenance operation: ${String(job.operation)}`);
      }

      await MaintenanceJob.updateOne(
        { _id: job._id, status: 'running' },
        {
          $set: {
            status: 'completed',
            result,
            finishedAt: new Date(),
            leaseExpiresAt: undefined,
            lastError: undefined
          }
        }
      );
    } catch (error: any) {
      const message = String(error?.message || error);
      const attempts = Number(job.attempts || 0);
      const maxAttempts = Number(job.maxAttempts || MAX_ATTEMPTS);
      const retryable = attempts < maxAttempts;
      const backoffMs = Math.min(300000, 5000 * Math.max(1, attempts));

      await MaintenanceJob.updateOne(
        { _id: job._id, status: 'running' },
        {
          $set: {
            status: retryable ? 'pending' : 'failed',
            runAfter: retryable ? new Date(Date.now() + backoffMs) : new Date(),
            lastError: message,
            finishedAt: retryable ? undefined : new Date(),
            leaseExpiresAt: undefined
          }
        }
      );
      logger.error(`Maintenance job ${String(job._id)} failed (${job.operation}):`, error);
    }
  }
}

export default MaintenanceJobQueueService.getInstance();
