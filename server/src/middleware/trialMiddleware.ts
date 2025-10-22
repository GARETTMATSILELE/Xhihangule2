import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from '../services/subscriptionService';
import { AppError } from './errorHandler';

const subscriptionService = SubscriptionService.getInstance();

/**
 * Middleware to check trial status and handle expiration
 * This should be used on protected routes to ensure users are aware of their trial status
 */
export const checkTrialStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip trial check if user doesn't have a company
    if (!req.user?.companyId) {
      return next();
    }

    const { isTrial, isExpired, daysRemaining, subscription } = await subscriptionService.checkTrialStatus(
      req.user.companyId
    );

    // Add trial information to request object for use in controllers
    req.trialStatus = {
      isTrial,
      isExpired,
      daysRemaining,
      subscription
    };

    // If trial is expired, we might want to restrict access or show warnings
    if (isExpired) {
      // For now, we'll just add a warning header
      res.set('X-Trial-Expired', 'true');
      res.set('X-Trial-Days-Remaining', '0');
    } else if (isTrial) {
      // Add trial information to headers
      res.set('X-Trial-Active', 'true');
      res.set('X-Trial-Days-Remaining', daysRemaining.toString());
    }

    next();
  } catch (error) {
    console.error('Error checking trial status:', error);
    // Don't block the request if trial check fails
    next();
  }
};

/**
 * Middleware to enforce trial restrictions
 * This should be used on routes that should be restricted after trial expiration
 */
export const enforceTrialRestrictions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip if user doesn't have a company
    if (!req.user?.companyId) {
      return next();
    }

    const { isTrial, isExpired } = await subscriptionService.checkTrialStatus(req.user.companyId);

    if (isTrial && isExpired) {
      return res.status(402).json({
        error: 'Trial Expired',
        message: 'Your free trial has expired. Please upgrade to continue using this feature.',
        code: 'TRIAL_EXPIRED',
        upgradeUrl: '/billing/setup'
      });
    }

    next();
  } catch (error) {
    console.error('Error enforcing trial restrictions:', error);
    next();
  }
};

/**
 * Middleware to provide trial information to frontend
 * This adds trial status to the response for frontend consumption
 */
export const provideTrialInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip if user doesn't have a company
    if (!req.user?.companyId) {
      return next();
    }

    const { isTrial, isExpired, daysRemaining, subscription } = await subscriptionService.checkTrialStatus(
      req.user.companyId
    );

    // Add trial information to response locals for use in responses
    res.locals.trialInfo = {
      isTrial,
      isExpired,
      daysRemaining,
      subscription
    };

    next();
  } catch (error) {
    console.error('Error providing trial info:', error);
    next();
  }
};

// Extend Request interface to include trial status
declare global {
  namespace Express {
    interface Request {
      trialStatus?: {
        isTrial: boolean;
        isExpired: boolean;
        daysRemaining: number;
        subscription: any;
      };
    }
  }
}

