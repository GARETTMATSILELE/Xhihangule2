import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from '../services/subscriptionService';
import { AppError } from '../middleware/errorHandler';

const subscriptionService = SubscriptionService.getInstance();

/**
 * Get trial status for the current user's company
 */
export const getTrialStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'No company associated with user' });
    }

    const trialStatus = await subscriptionService.checkTrialStatus(req.user.companyId);
    
    res.json({
      success: true,
      data: trialStatus
    });
  } catch (error) {
    console.error('Error getting trial status:', error);
    next(new AppError('Failed to get trial status', 500));
  }
};

/**
 * Convert trial to active subscription
 */
export const convertTrialToActive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { plan, cycle } = req.body;
    
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'No company associated with user' });
    }

    if (!plan || !['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan specified' });
    }

    if (!cycle || !['monthly', 'yearly'].includes(cycle)) {
      return res.status(400).json({ message: 'Invalid cycle specified' });
    }

    const subscription = await subscriptionService.convertTrialToActive(
      req.user.companyId,
      plan,
      cycle
    );

    // Update company subscription status
    await subscriptionService.updateCompanySubscriptionStatus(req.user.companyId);

    res.json({
      success: true,
      message: 'Trial successfully converted to active subscription',
      data: subscription
    });
  } catch (error) {
    console.error('Error converting trial to active:', error);
    next(new AppError('Failed to convert trial to active subscription', 500));
  }
};

/**
 * Extend trial period (admin function)
 */
export const extendTrial = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { companyId, additionalDays } = req.body;
    
    if (!companyId || !additionalDays) {
      return res.status(400).json({ message: 'Company ID and additional days required' });
    }

    const subscription = await subscriptionService.getSubscription(companyId);
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (subscription.status !== 'trial') {
      return res.status(400).json({ message: 'Can only extend trial subscriptions' });
    }

    // Extend trial end date
    const newTrialEndDate = new Date(subscription.trialEndDate || new Date());
    newTrialEndDate.setDate(newTrialEndDate.getDate() + additionalDays);

    subscription.trialEndDate = newTrialEndDate;
    await subscription.save();

    res.json({
      success: true,
      message: `Trial extended by ${additionalDays} days`,
      data: subscription
    });
  } catch (error) {
    console.error('Error extending trial:', error);
    next(new AppError('Failed to extend trial', 500));
  }
};

/**
 * Get subscription details
 */
export const getSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      return res.status(401).json({ message: 'No company associated with user' });
    }

    const subscription = await subscriptionService.getSubscription(req.user.companyId);
    
    if (!subscription) {
      return res.status(404).json({ message: 'No subscription found' });
    }

    res.json({
      success: true,
      data: subscription
    });
  } catch (error) {
    console.error('Error getting subscription:', error);
    next(new AppError('Failed to get subscription', 500));
  }
};










