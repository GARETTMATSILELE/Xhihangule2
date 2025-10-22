"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSubscription = exports.extendTrial = exports.convertTrialToActive = exports.getTrialStatus = void 0;
const subscriptionService_1 = require("../services/subscriptionService");
const errorHandler_1 = require("../middleware/errorHandler");
const subscriptionService = subscriptionService_1.SubscriptionService.getInstance();
/**
 * Get trial status for the current user's company
 */
const getTrialStatus = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'No company associated with user' });
        }
        const trialStatus = yield subscriptionService.checkTrialStatus(req.user.companyId);
        res.json({
            success: true,
            data: trialStatus
        });
    }
    catch (error) {
        console.error('Error getting trial status:', error);
        next(new errorHandler_1.AppError('Failed to get trial status', 500));
    }
});
exports.getTrialStatus = getTrialStatus;
/**
 * Convert trial to active subscription
 */
const convertTrialToActive = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { plan, cycle } = req.body;
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'No company associated with user' });
        }
        if (!plan || !['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(plan)) {
            return res.status(400).json({ message: 'Invalid plan specified' });
        }
        if (!cycle || !['monthly', 'yearly'].includes(cycle)) {
            return res.status(400).json({ message: 'Invalid cycle specified' });
        }
        const subscription = yield subscriptionService.convertTrialToActive(req.user.companyId, plan, cycle);
        // Update company subscription status
        yield subscriptionService.updateCompanySubscriptionStatus(req.user.companyId);
        res.json({
            success: true,
            message: 'Trial successfully converted to active subscription',
            data: subscription
        });
    }
    catch (error) {
        console.error('Error converting trial to active:', error);
        next(new errorHandler_1.AppError('Failed to convert trial to active subscription', 500));
    }
});
exports.convertTrialToActive = convertTrialToActive;
/**
 * Extend trial period (admin function)
 */
const extendTrial = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { companyId, additionalDays } = req.body;
        if (!companyId || !additionalDays) {
            return res.status(400).json({ message: 'Company ID and additional days required' });
        }
        const subscription = yield subscriptionService.getSubscription(companyId);
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
        yield subscription.save();
        res.json({
            success: true,
            message: `Trial extended by ${additionalDays} days`,
            data: subscription
        });
    }
    catch (error) {
        console.error('Error extending trial:', error);
        next(new errorHandler_1.AppError('Failed to extend trial', 500));
    }
});
exports.extendTrial = extendTrial;
/**
 * Get subscription details
 */
const getSubscription = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'No company associated with user' });
        }
        const subscription = yield subscriptionService.getSubscription(req.user.companyId);
        if (!subscription) {
            return res.status(404).json({ message: 'No subscription found' });
        }
        res.json({
            success: true,
            data: subscription
        });
    }
    catch (error) {
        console.error('Error getting subscription:', error);
        next(new errorHandler_1.AppError('Failed to get subscription', 500));
    }
});
exports.getSubscription = getSubscription;
