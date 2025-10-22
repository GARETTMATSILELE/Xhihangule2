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
exports.provideTrialInfo = exports.enforceTrialRestrictions = exports.checkTrialStatus = void 0;
const subscriptionService_1 = require("../services/subscriptionService");
const subscriptionService = subscriptionService_1.SubscriptionService.getInstance();
/**
 * Middleware to check trial status and handle expiration
 * This should be used on protected routes to ensure users are aware of their trial status
 */
const checkTrialStatus = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Skip trial check if user doesn't have a company
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return next();
        }
        const { isTrial, isExpired, daysRemaining, subscription } = yield subscriptionService.checkTrialStatus(req.user.companyId);
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
        }
        else if (isTrial) {
            // Add trial information to headers
            res.set('X-Trial-Active', 'true');
            res.set('X-Trial-Days-Remaining', daysRemaining.toString());
        }
        next();
    }
    catch (error) {
        console.error('Error checking trial status:', error);
        // Don't block the request if trial check fails
        next();
    }
});
exports.checkTrialStatus = checkTrialStatus;
/**
 * Middleware to enforce trial restrictions
 * This should be used on routes that should be restricted after trial expiration
 */
const enforceTrialRestrictions = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Skip if user doesn't have a company
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return next();
        }
        const { isTrial, isExpired } = yield subscriptionService.checkTrialStatus(req.user.companyId);
        if (isTrial && isExpired) {
            return res.status(402).json({
                error: 'Trial Expired',
                message: 'Your free trial has expired. Please upgrade to continue using this feature.',
                code: 'TRIAL_EXPIRED',
                upgradeUrl: '/billing/setup'
            });
        }
        next();
    }
    catch (error) {
        console.error('Error enforcing trial restrictions:', error);
        next();
    }
});
exports.enforceTrialRestrictions = enforceTrialRestrictions;
/**
 * Middleware to provide trial information to frontend
 * This adds trial status to the response for frontend consumption
 */
const provideTrialInfo = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // Skip if user doesn't have a company
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return next();
        }
        const { isTrial, isExpired, daysRemaining, subscription } = yield subscriptionService.checkTrialStatus(req.user.companyId);
        // Add trial information to response locals for use in responses
        res.locals.trialInfo = {
            isTrial,
            isExpired,
            daysRemaining,
            subscription
        };
        next();
    }
    catch (error) {
        console.error('Error providing trial info:', error);
        next();
    }
});
exports.provideTrialInfo = provideTrialInfo;
