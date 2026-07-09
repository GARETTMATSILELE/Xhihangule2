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
exports.changePlan = exports.redeemVoucher = exports.getPaymentStatus = exports.createCheckout = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const plan_1 = require("../types/plan");
const BillingPayment_1 = require("../models/BillingPayment");
const Subscription_1 = require("../models/Subscription");
const Voucher_1 = require("../models/Voucher");
const PaymentSession_1 = require("../models/PaymentSession");
const Company_1 = require("../models/Company");
const billingActivationService_1 = require("../services/billingActivationService");
const crypto_1 = __importDefault(require("crypto"));
const createCheckout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { plan, cycle } = req.body || {};
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        return res.status(401).json({ message: 'Unauthorized' });
    if (!plan || !['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(plan))
        return res.status(400).json({ message: 'Invalid plan' });
    if (!cycle || !['monthly', 'yearly'].includes(cycle))
        return res.status(400).json({ message: 'Invalid cycle' });
    const cfg = plan_1.PLAN_CONFIG[plan];
    const amount = cfg.pricingUSD ? (cycle === 'monthly' ? cfg.pricingUSD.monthly : cfg.pricingUSD.yearly) : 0;
    const ref = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const idempotencyKey = req.get('idempotency-key') || `checkout:${req.user.companyId}:${plan}:${cycle}:${Date.now()}`;
    const subscription = yield Subscription_1.Subscription.findOneAndUpdate({ companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) }, { $setOnInsert: { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId), plan, cycle, status: 'past_due' } }, { upsert: true, new: true });
    const paymentSession = yield PaymentSession_1.PaymentSession.findOneAndUpdate({ idempotencyKey }, {
        $setOnInsert: {
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            userId: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId) ? new mongoose_1.default.Types.ObjectId(req.user.userId) : undefined,
            subscriptionId: subscription._id,
            idempotencyKey,
            provider: 'paynow',
            providerRef: ref,
            plan,
            billingCycle: cycle,
            amount,
            currency: 'USD',
            status: 'pending',
            metadata: { source: 'billing_checkout' }
        }
    }, { upsert: true, new: true });
    const payment = yield BillingPayment_1.BillingPayment.create({
        companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
        userId: ((_c = req.user) === null || _c === void 0 ? void 0 : _c.userId) ? new mongoose_1.default.Types.ObjectId(req.user.userId) : undefined,
        subscriptionId: subscription._id,
        paymentSessionId: paymentSession._id,
        plan,
        cycle,
        amount,
        currency: 'USD',
        method: 'card',
        provider: 'paynow',
        providerRef: ref,
        idempotencyKey,
        status: 'pending'
    });
    paymentSession.billingPaymentId = payment._id;
    yield paymentSession.save();
    // Deferred Paynow integration: return placeholder redirect URL (client can show instructions)
    const redirectUrl = `/billing/pending?ref=${encodeURIComponent(ref)}`;
    return res.json({
        redirectUrl,
        paymentId: payment._id,
        paymentSessionId: paymentSession._id,
        reference: ref,
        metadata: {
            companyId: req.user.companyId,
            userId: req.user.userId,
            plan,
            billingCycle: cycle,
            onboardingSessionId: paymentSession.onboardingSessionId
        }
    });
});
exports.createCheckout = createCheckout;
const getPaymentStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const payment = yield BillingPayment_1.BillingPayment.findById(req.params.id);
    if (!payment)
        return res.status(404).json({ message: 'Payment not found' });
    return res.json({ status: payment.status, providerRef: payment.providerRef });
});
exports.getPaymentStatus = getPaymentStatus;
const redeemVoucher = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { code, pin } = req.body;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        return res.status(401).json({ message: 'Unauthorized' });
    if (!code || !pin)
        return res.status(400).json({ message: 'Code and PIN required' });
    const voucher = yield Voucher_1.Voucher.findOne({ code });
    if (!voucher)
        return res.status(404).json({ message: 'Voucher not found' });
    // If voucher was issued for a specific company, enforce that constraint
    const intendedCompanyId = ((_b = voucher === null || voucher === void 0 ? void 0 : voucher.metadata) === null || _b === void 0 ? void 0 : _b.intendedCompanyId)
        ? String(voucher.metadata.intendedCompanyId)
        : undefined;
    if (intendedCompanyId && intendedCompanyId !== String(req.user.companyId)) {
        return res.status(403).json({ message: 'This voucher was not issued to your company' });
    }
    if (voucher.validFrom && voucher.validFrom > new Date())
        return res.status(400).json({ message: 'Voucher not yet valid' });
    if (voucher.validUntil && voucher.validUntil < new Date())
        return res.status(400).json({ message: 'Voucher expired' });
    if (voucher.status === 'Cancelled')
        return res.status(400).json({ message: 'Voucher cancelled' });
    if (voucher.redeemedAt)
        return res.status(400).json({ message: 'Voucher already redeemed' });
    const pinHash = crypto_1.default.createHash('sha256').update(pin).digest('hex');
    if (pinHash !== voucher.pinHash)
        return res.status(400).json({ message: 'Invalid PIN' });
    const now = new Date();
    const end = new Date();
    if (voucher.cycle === 'monthly')
        end.setMonth(end.getMonth() + 1);
    else
        end.setFullYear(end.getFullYear() + 1);
    const paymentSession = yield PaymentSession_1.PaymentSession.findOneAndUpdate({
        provider: 'cash',
        providerRef: voucher.code
    }, {
        $setOnInsert: {
            companyId: req.user.companyId,
            userId: ((_c = req.user) === null || _c === void 0 ? void 0 : _c.userId) ? new mongoose_1.default.Types.ObjectId(req.user.userId) : undefined,
            idempotencyKey: `voucher:${voucher.code}`,
            provider: 'cash',
            providerRef: voucher.code,
            plan: voucher.plan,
            billingCycle: voucher.cycle,
            amount: voucher.amount,
            currency: 'USD',
            status: 'pending',
            metadata: { voucherId: voucher._id }
        }
    }, { upsert: true, new: true });
    const activation = yield (0, billingActivationService_1.activateSubscriptionFromPayment)({
        paymentSessionId: paymentSession._id.toString(),
        provider: 'cash',
        providerRef: voucher.code,
        rawProviderResponse: { voucherId: voucher._id, code: voucher.code },
        paidAt: now
    });
    const subscription = activation.subscription || (yield Subscription_1.Subscription.findOne({ companyId: req.user.companyId }));
    yield Company_1.Company.findByIdAndUpdate(req.user.companyId, {
        $set: {
            plan: voucher.plan,
            propertyLimit: plan_1.PLAN_CONFIG[voucher.plan].propertyLimit,
            featureFlags: plan_1.PLAN_CONFIG[voucher.plan].featureFlags,
            tenantStatus: 'active',
            subscriptionStatus: 'active',
            subscriptionEndDate: subscription === null || subscription === void 0 ? void 0 : subscription.currentPeriodEnd
        }
    });
    yield Subscription_1.Subscription.findOneAndUpdate({ companyId: req.user.companyId }, {
        $set: {
            plan: voucher.plan,
            cycle: voucher.cycle,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: end
        }
    }, { upsert: true, new: true });
    voucher.redeemedAt = now;
    voucher.redeemedBy = new mongoose_1.default.Types.ObjectId(req.user.companyId);
    voucher.status = 'Redeemed';
    voucher.auditHistory = [
        ...(voucher.auditHistory || []),
        {
            action: 'Redeemed',
            userId: ((_d = req.user) === null || _d === void 0 ? void 0 : _d.userId) ? new mongoose_1.default.Types.ObjectId(req.user.userId) : undefined,
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            plan: voucher.plan,
            details: { code: voucher.code },
            createdAt: now
        }
    ];
    yield voucher.save();
    // Link any matching BillingPayment record (cash/voucher) to this subscription
    try {
        yield BillingPayment_1.BillingPayment.updateOne({
            provider: 'cash',
            method: 'voucher',
            providerRef: voucher.code
        }, {
            $set: {
                subscriptionId: subscription === null || subscription === void 0 ? void 0 : subscription._id,
                paymentSessionId: paymentSession._id,
                status: 'paid'
            }
        });
    }
    catch (e) {
        // Non-fatal
    }
    return res.json({ message: 'Voucher redeemed', subscription, paymentSession });
});
exports.redeemVoucher = redeemVoucher;
const changePlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { plan, cycle } = req.body || {};
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        return res.status(401).json({ message: 'Unauthorized' });
    if (plan && !['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(plan))
        return res.status(400).json({ message: 'Invalid plan' });
    if (cycle && !['monthly', 'yearly'].includes(cycle))
        return res.status(400).json({ message: 'Invalid cycle' });
    const subscription = yield Subscription_1.Subscription.findOneAndUpdate({ companyId: req.user.companyId }, { $set: Object.assign(Object.assign({}, (plan ? { plan } : {})), (cycle ? { cycle } : {})) }, { upsert: true, new: true });
    return res.json({ message: 'Subscription updated', subscription });
});
exports.changePlan = changePlan;
