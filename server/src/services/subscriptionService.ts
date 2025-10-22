import mongoose from 'mongoose';
import { Subscription } from '../models/Subscription';
import { Company } from '../models/Company';
import { Plan } from '../types/plan';

export class SubscriptionService {
  private static instance: SubscriptionService;
  private readonly TRIAL_DURATION_DAYS = 14; // Default trial duration

  public static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  /**
   * Create a trial subscription for a new company
   */
  public async createTrialSubscription(
    companyId: string, 
    plan: Plan = 'SME', 
    trialDurationDays: number = this.TRIAL_DURATION_DAYS
  ): Promise<any> {
    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + trialDurationDays);

    const subscription = new Subscription({
      companyId: new mongoose.Types.ObjectId(companyId),
      plan,
      cycle: 'monthly', // Default to monthly for trials
      status: 'trial',
      trialStartDate: now,
      trialEndDate,
      trialDurationDays
    });

    await subscription.save();
    console.log(`Created trial subscription for company ${companyId}:`, {
      plan,
      trialEndDate,
      durationDays: trialDurationDays
    });

    return subscription;
  }

  /**
   * Check if a subscription is in trial and if it has expired
   */
  public async checkTrialStatus(companyId: string): Promise<{
    isTrial: boolean;
    isExpired: boolean;
    daysRemaining: number;
    subscription: any;
  }> {
    const subscription = await Subscription.findOne({ 
      companyId: new mongoose.Types.ObjectId(companyId) 
    });

    if (!subscription) {
      return {
        isTrial: false,
        isExpired: false,
        daysRemaining: 0,
        subscription: null
      };
    }

    const isTrial = subscription.status === 'trial';
    const now = new Date();
    const isExpired = isTrial && subscription.trialEndDate ? subscription.trialEndDate < now : false;
    
    let daysRemaining = 0;
    if (isTrial && subscription.trialEndDate) {
      const diffTime = subscription.trialEndDate.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      isTrial,
      isExpired,
      daysRemaining: Math.max(0, daysRemaining),
      subscription
    };
  }

  /**
   * Convert trial subscription to active paid subscription
   */
  public async convertTrialToActive(
    companyId: string, 
    plan: Plan, 
    cycle: 'monthly' | 'yearly'
  ): Promise<any> {
    const now = new Date();
    const periodEnd = new Date(now);
    
    if (cycle === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    const subscription = await Subscription.findOneAndUpdate(
      { companyId: new mongoose.Types.ObjectId(companyId) },
      {
        $set: {
          plan,
          cycle,
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          nextPaymentAt: periodEnd
        }
      },
      { upsert: true, new: true }
    );

    console.log(`Converted trial to active subscription for company ${companyId}:`, {
      plan,
      cycle,
      periodEnd
    });

    return subscription;
  }

  /**
   * Mark trial as expired
   */
  public async expireTrial(companyId: string): Promise<any> {
    const subscription = await Subscription.findOneAndUpdate(
      { companyId: new mongoose.Types.ObjectId(companyId) },
      { $set: { status: 'expired' } },
      { new: true }
    );

    console.log(`Marked trial as expired for company ${companyId}`);
    return subscription;
  }

  /**
   * Get subscription details for a company
   */
  public async getSubscription(companyId: string): Promise<any> {
    return await Subscription.findOne({ 
      companyId: new mongoose.Types.ObjectId(companyId) 
    });
  }

  /**
   * Update company subscription status based on subscription
   */
  public async updateCompanySubscriptionStatus(companyId: string): Promise<void> {
    const subscription = await this.getSubscription(companyId);
    if (!subscription) return;

    const { isTrial, isExpired } = await this.checkTrialStatus(companyId);
    
    let subscriptionStatus: string;
    if (isExpired) {
      subscriptionStatus = 'expired';
    } else if (isTrial) {
      subscriptionStatus = 'trial';
    } else {
      subscriptionStatus = subscription.status;
    }

    await Company.findByIdAndUpdate(companyId, {
      subscriptionStatus,
      subscriptionEndDate: subscription.trialEndDate || subscription.currentPeriodEnd
    });

    console.log(`Updated company ${companyId} subscription status to: ${subscriptionStatus}`);
  }
}

export default SubscriptionService;


