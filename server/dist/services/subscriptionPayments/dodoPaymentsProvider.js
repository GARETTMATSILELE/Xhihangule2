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
exports.DodoCheckoutError = void 0;
exports.dodoBrowserUrls = dodoBrowserUrls;
exports.createDodoPaymentsProvider = createDodoPaymentsProvider;
const dodoClient_1 = require("./dodoClient");
const dodoProductMap_1 = require("./dodoProductMap");
const providerAvailability_1 = require("./providerAvailability");
class DodoCheckoutError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}
exports.DodoCheckoutError = DodoCheckoutError;
function dodoBrowserUrls(paymentSessionId, env = process.env) {
    const configured = String(env.DODO_PAYMENTS_RETURN_URL || '').trim();
    const client = String(env.CLIENT_URL || env.PUBLIC_BASE_URL || '').trim();
    const base = configured || (client ? `${client.replace(/\/$/, '')}/billing/return` : '');
    if (!base || (env.NODE_ENV === 'production' && !configured && !client)) {
        throw new DodoCheckoutError('Dodo return URL is not configured.', 503, 'DODO_NOT_CONFIGURED');
    }
    const fallback = env.NODE_ENV === 'production' ? base : (base || 'http://localhost:3000/billing/return');
    const returnUrl = new URL(fallback);
    returnUrl.searchParams.set('paymentSessionId', paymentSessionId);
    returnUrl.searchParams.set('provider', 'dodo');
    const cancelUrl = new URL(returnUrl.toString());
    cancelUrl.searchParams.set('checkout', 'cancelled');
    return { returnUrl: returnUrl.toString(), cancelUrl: cancelUrl.toString() };
}
function createDodoPaymentsProvider(env = process.env) {
    return {
        id: 'dodo',
        createCheckout(input) {
            return __awaiter(this, void 0, void 0, function* () {
                const config = (0, providerAvailability_1.readDodoConfig)(env);
                if (!config.enabled)
                    throw new DodoCheckoutError('Dodo Payments is not enabled.', 403, 'DODO_DISABLED');
                if (!config.configured)
                    throw new DodoCheckoutError('Dodo Payments is not configured.', 503, 'DODO_NOT_CONFIGURED');
                if (input.currency !== 'USD' || !Number.isFinite(input.amount) || input.amount <= 0) {
                    throw new DodoCheckoutError('The subscription price is not valid.', 503, 'REGISTRATION_PRICE_NOT_CONFIGURED');
                }
                const productId = (0, dodoProductMap_1.resolveDodoProductId)(input.plan, input.cycle, env);
                if (!productId)
                    throw new DodoCheckoutError('No Dodo product is mapped for this subscription.', 503, 'DODO_PRODUCT_NOT_CONFIGURED');
                const gateway = (0, dodoClient_1.getDodoGateway)(env);
                if (!gateway)
                    throw new DodoCheckoutError('Dodo Payments is not configured.', 503, 'DODO_NOT_CONFIGURED');
                const product = yield gateway.products.retrieve(productId);
                const price = (0, dodoProductMap_1.readDodoProductPrice)(product);
                if (!price || !(0, dodoProductMap_1.cycleMatchesDodoPrice)(input.cycle, price) || price.cents !== (0, dodoProductMap_1.amountToCents)(input.amount)) {
                    throw new DodoCheckoutError('The Dodo product does not match the server subscription price.', 409, 'DODO_PRODUCT_MISMATCH');
                }
                const urls = dodoBrowserUrls(input.paymentSessionId, env);
                const body = {
                    product_cart: [{ product_id: productId, quantity: 1 }],
                    customer: { email: input.customerEmail, name: input.customerName },
                    return_url: urls.returnUrl,
                    cancel_url: urls.cancelUrl,
                    billing_currency: 'USD',
                    allowed_payment_method_types: ['credit', 'debit'],
                    metadata: {
                        mantis_payment_session_id: input.paymentSessionId,
                        mantis_subscription_id: input.subscriptionId,
                        mantis_company_id: input.companyId,
                        mantis_customer_id: input.customerId,
                        mantis_plan: input.plan,
                        mantis_cycle: input.cycle
                    }
                };
                const session = yield gateway.checkoutSessions.create(body);
                if (!session.checkout_url || !session.session_id) {
                    throw new DodoCheckoutError('Dodo did not return a hosted checkout.', 502, 'DODO_CHECKOUT_FAILED');
                }
                return {
                    redirectUrl: session.checkout_url,
                    provider: 'dodo',
                    providerTransactionId: session.session_id,
                    metadata: {
                        dodoCheckoutSessionId: session.session_id,
                        dodoProductId: productId,
                        mode: config.mode
                    }
                };
            });
        }
    };
}
