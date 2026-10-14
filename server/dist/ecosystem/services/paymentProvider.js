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
exports.PaymentProviderService = void 0;
exports.getPaymentProvider = getPaymentProvider;
exports.initializeTenantPayment = initializeTenantPayment;
exports.verifyAndPostTenantPayment = verifyAndPostTenantPayment;
const errorHandler_1 = require("../../middleware/errorHandler");
const commsAndPayments_1 = require("../models/commsAndPayments");
const Tenant_1 = require("../../models/Tenant");
const Property_1 = require("../../models/Property");
const Lease_1 = require("../../models/Lease");
const flags_1 = require("../flags");
const Company_1 = require("../../models/Company");
class StubPaymentProvider {
    initializePayment(input) {
        return __awaiter(this, void 0, void 0, function* () {
            return { providerRef: `stub-${input.reference}`, checkoutUrl: undefined };
        });
    }
    verifyPayment(providerRef) {
        return __awaiter(this, void 0, void 0, function* () {
            return { paid: Boolean(providerRef), amount: undefined };
        });
    }
    handleWebhook(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            return { providerRef: String((payload === null || payload === void 0 ? void 0 : payload.providerRef) || ''), paid: (payload === null || payload === void 0 ? void 0 : payload.paid) === true };
        });
    }
    refundPayment() {
        return __awaiter(this, void 0, void 0, function* () {
            return { refunded: false };
        });
    }
}
function getPaymentProvider() {
    const name = String(process.env.RENT_PAYMENT_PROVIDER || 'stub').toLowerCase();
    return new StubPaymentProvider();
}
function initializeTenantPayment(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const property = yield Property_1.Property.findById(params.propertyId).select('companyId').lean();
        if (!property)
            throw new errorHandler_1.AppError('Property not found', 404, 'NOT_FOUND');
        const companyId = String(property.companyId);
        const company = yield Company_1.Company.findById(companyId).select('featureFlags').lean();
        if (!(0, flags_1.isFlagEnabledForCompany)(company, 'onlinePaymentsEnabled')) {
            throw new errorHandler_1.AppError('Online payments are not enabled for this property/agency', 400, 'ONLINE_PAYMENTS_DISABLED');
        }
        const tenants = yield Tenant_1.Tenant.find({ userId: params.tenantUserId });
        const tenantIds = tenants.map((t) => t._id);
        const allowedPropertyIds = new Set(tenants.flatMap((t) => [String(t.propertyId || ''), ...(t.propertyIds || []).map(String)]));
        if (tenantIds.length) {
            const leases = yield Lease_1.Lease.find({ tenantId: { $in: tenantIds }, propertyId: params.propertyId }).select('_id').lean();
            leases.forEach(() => allowedPropertyIds.add(String(params.propertyId)));
        }
        if (!allowedPropertyIds.has(String(params.propertyId))) {
            throw new errorHandler_1.AppError('You can only initialize payments for your own tenancy', 403, 'FORBIDDEN');
        }
        const existing = yield commsAndPayments_1.EcosystemPaymentIntent.findOne({ idempotencyKey: params.idempotencyKey });
        if (existing)
            return existing;
        const tenant = tenants.find((t) => String(t.companyId) === companyId) || tenants[0];
        const provider = getPaymentProvider();
        const init = yield provider.initializePayment({
            amount: params.amount,
            currency: 'USD',
            reference: params.idempotencyKey,
        });
        return commsAndPayments_1.EcosystemPaymentIntent.create({
            companyId,
            tenantUserId: params.tenantUserId,
            tenantId: tenant === null || tenant === void 0 ? void 0 : tenant._id,
            propertyId: params.propertyId,
            leaseId: params.leaseId,
            amount: params.amount,
            currency: 'USD',
            provider: process.env.RENT_PAYMENT_PROVIDER || 'stub',
            status: 'provider_created',
            idempotencyKey: params.idempotencyKey,
            providerRef: init.providerRef,
        });
    });
}
function verifyAndPostTenantPayment(intentId, actorUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        const intent = yield commsAndPayments_1.EcosystemPaymentIntent.findById(intentId);
        if (!intent)
            throw new errorHandler_1.AppError('Payment intent not found', 404, 'NOT_FOUND');
        if (actorUserId && String(intent.tenantUserId) !== actorUserId) {
            throw new errorHandler_1.AppError('You can only verify your own payment intents', 403, 'FORBIDDEN');
        }
        if (intent.status === 'reconciled' && intent.paymentId) {
            return { intent, paymentId: intent.paymentId, posted: true };
        }
        const provider = getPaymentProvider();
        if (!intent.providerRef)
            throw new errorHandler_1.AppError('Provider reference missing', 400, 'PROVIDER_REF_MISSING');
        const verification = yield provider.verifyPayment(intent.providerRef);
        if (!verification.paid) {
            intent.status = 'failed';
            yield intent.save();
            throw new errorHandler_1.AppError('Payment not confirmed by provider', 409, 'PAYMENT_NOT_VERIFIED');
        }
        // Provider verification is not a financial post. Canonical Payment creation
        // remains the existing createPayment / postPaymentAccounting path so rent
        // allocation, commission, and tax metadata stay authoritative.
        intent.status = 'paid';
        yield intent.save();
        return { intent, paymentId: intent.paymentId, posted: false };
    });
}
exports.PaymentProviderService = {
    getPaymentProvider,
    initializeTenantPayment,
    verifyAndPostTenantPayment,
};
