import { BaseRepository } from './base.repository';
import { Lease, ILease } from '../models/Lease';
import mongoose from 'mongoose';

export class LeaseRepository extends BaseRepository<ILease> {
  private static instance: LeaseRepository;

  private constructor() {
    super(Lease);
  }

  static getInstance(): LeaseRepository {
    if (!LeaseRepository.instance) {
      LeaseRepository.instance = new LeaseRepository();
    }
    return LeaseRepository.instance;
  }

  async findByCompanyId(companyId: string): Promise<ILease[]> {
    return this.find({ companyId });
  }

  async findByStatus(status: string): Promise<ILease[]> {
    return this.find({ status });
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<ILease[]> {
    return this.find({
      startDate: { $gte: startDate },
      endDate: { $lte: endDate }
    });
  }

  async findActiveLeases(): Promise<ILease[]> {
    const now = new Date();
    return this.find({
      startDate: { $lte: now },
      endDate: { $gte: now },
      status: 'active'
    });
  }

  async findExpiringLeases(daysThreshold: number): Promise<ILease[]> {
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
    
    return this.find({
      endDate: { $lte: thresholdDate },
      status: 'active'
    });
  }

  async updateLeaseStatus(id: string, status: 'active' | 'expired' | 'terminated'): Promise<ILease | null> {
    return this.update(id, { status });
  }

  async extendLease(id: string, newEndDate: Date): Promise<ILease | null> {
    return this.update(id, { endDate: newEndDate });
  }

  async bulkUpdateStatus(ids: string[], status: string): Promise<boolean> {
    try {
      await this.executeQuery(async () => {
        await this.model.updateMany(
          { _id: { $in: ids } },
          { $set: { status } }
        );
      });
      return true;
    } catch (error) {
      console.error('Failed to bulk update lease status:', error);
      return false;
    }
  }

  async getLeaseStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    upcoming: number;
  }> {
    const now = new Date();
    
    const [total, active, expired, upcoming] = await Promise.all([
      this.model.countDocuments(),
      this.model.countDocuments({
        startDate: { $lte: now },
        endDate: { $gte: now },
        status: 'active'
      }),
      this.model.countDocuments({
        endDate: { $lt: now },
        status: 'active'
      }),
      this.model.countDocuments({
        startDate: { $gt: now },
        status: 'pending'
      })
    ]);

    return { total, active, expired, upcoming };
  }
} 