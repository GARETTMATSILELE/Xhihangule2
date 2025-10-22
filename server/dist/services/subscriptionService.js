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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Subscription_1 = require("../models/Subscription");
const Company_1 = require("../models/Company");
class SubscriptionService {
    constructor() {
        this.TRIAL_DURATION_DAYS = 14; // Default trial duration
    }
    static getInstance() {
        if (!SubscriptionService.instance) {
            SubscriptionService.instance = new SubscriptionService();
        }
        return SubscriptionService.instance;
    }
    /**
     * Create a trial subscription for a new company
     */
    createTrialSubscription(companyId_1) {
        return __awaiter(this, arguments, void 0, function* (companyId, plan = 'SME', trialDurationDays = this.TRIAL_DURATION_DAYS) {
            const now = new Date();
            const trialEndDate = new Date(now);
            trialEndDate.setDate(trialEndDate.getDate() + trialDurationDays);
            const subscription = new Subscription_1.Subscription({
                companyId: new mongoose_1.default.Types.ObjectId(companyId),
                plan,
                cycle: 'monthly', // Default to monthly for trials
                status: 'trial',
                trialStartDate: now,
                trialEndDate,
                trialDurationDays
            });
            yield subscription.save();
            console.log(`Created trial subscription for company ${companyId}:`, {
                plan,
                trialEndDate,
                durationDays: trialDurationDays
            });
            return subscription;
        });
    }
    /**
     * Check if a subscription is in trial and if it has expired
     */
    checkTrialStatus(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const subscription = yield Subscription_1.Subscription.findOne({
                companyId: new mongoose_1.default.Types.ObjectId(companyId)
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
        });
    }
    /**
     * Convert trial subscription to active paid subscription
     */
    convertTrialToActive(companyId, plan, cycle) {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const periodEnd = new Date(now);
            if (cycle === 'monthly') {
                periodEnd.setMonth(periodEnd.getMonth() + 1);
            }
            else {
                periodEnd.setFullYear(periodEnd.getFullYear() + 1);
            }
            const subscription = yield Subscription_1.Subscription.findOneAndUpdate({ companyId: new mongoose_1.default.Types.ObjectId(companyId) }, {
                $set: {
                    plan,
                    cycle,
                    status: 'active',
                    currentPeriodStart: now,
                    currentPeriodEnd: periodEnd,
                    nextPaymentAt: periodEnd
                }
            }, { upsert: true, new: true });
            console.log(`Converted trial to active subscription for company ${companyId}:`, {
                plan,
                cycle,
                periodEnd
            });
            return subscription;
        });
    }
    /**
     * Mark trial as expired
     */
    expireTrial(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const subscription = yield Subscription_1.Subscription.findOneAndUpdate({ companyId: new mongoose_1.default.Types.ObjectId(companyId) }, { $set: { status: 'expired' } }, { new: true });
            console.log(`Marked trial as expired for company ${companyId}`);
            return subscription;
        });
    }
    /**
     * Get subscription details for a company
     */
    getSubscription(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Subscription_1.Subscription.findOne({
                companyId: new mongoose_1.default.Types.ObjectId(companyId)
            });
        });
    }
    /**
     * Update company subscription status based on subscription
     */
    updateCompanySubscriptionStatus(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const subscription = yield this.getSubscription(companyId);
            if (!subscription)
                return;
            const { isTrial, isExpired } = yield this.checkTrialStatus(companyId);
            let subscriptionStatus;
            if (isExpired) {
                subscriptionStatus = 'expired';
            }
            else if (isTrial) {
                subscriptionStatus = 'trial';
            }
            else {
                subscriptionStatus = subscription.status;
            }
            yield Company_1.Company.findByIdAndUpdate(companyId, {
                subscriptionStatus,
                subscriptionEndDate: subscription.trialEndDate || subscription.currentPeriodEnd
            });
            console.log(`Updated company ${companyId} subscription status to: ${subscriptionStatus}`);
        });
    }
}
exports.SubscriptionService = SubscriptionService;
exports.default = SubscriptionService;
