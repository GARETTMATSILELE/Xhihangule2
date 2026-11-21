import { CheckoutSessionCreateParams } from 'dodopayments/resources/checkout-sessions';
import { getDodoGateway } from './dodoClient';
import { amountToCents, cycleMatchesDodoPrice, readDodoProductPrice, resolveDodoProductId } from './dodoProductMap';
import { SubscriptionPaymentProvider } from './paymentProvider';
import { readDodoConfig } from './providerAvailability';

export class DodoCheckoutError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function dodoBrowserUrls(paymentSessionId: string, env: NodeJS.ProcessEnv = process.env): { returnUrl: string; cancelUrl: string } {
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

export function createDodoPaymentsProvider(env: NodeJS.ProcessEnv = process.env): SubscriptionPaymentProvider {
  return {
    id: 'dodo',
    async createCheckout(input) {
      const config = readDodoConfig(env);
      if (!config.enabled) throw new DodoCheckoutError('Dodo Payments is not enabled.', 403, 'DODO_DISABLED');
      if (!config.configured) throw new DodoCheckoutError('Dodo Payments is not configured.', 503, 'DODO_NOT_CONFIGURED');
      if (input.currency !== 'USD' || !Number.isFinite(input.amount) || input.amount <= 0) {
        throw new DodoCheckoutError('The subscription price is not valid.', 503, 'REGISTRATION_PRICE_NOT_CONFIGURED');
      }
      const productId = resolveDodoProductId(input.plan, input.cycle, env);
      if (!productId) throw new DodoCheckoutError('No Dodo product is mapped for this subscription.', 503, 'DODO_PRODUCT_NOT_CONFIGURED');
      const gateway = getDodoGateway(env);
      if (!gateway) throw new DodoCheckoutError('Dodo Payments is not configured.', 503, 'DODO_NOT_CONFIGURED');
      const product = await gateway.products.retrieve(productId);
      const price = readDodoProductPrice(product as { price?: { currency?: string; price?: number; type?: string; payment_frequency_count?: number; payment_frequency_interval?: string } });
      if (!price || !cycleMatchesDodoPrice(input.cycle, price) || price.cents !== amountToCents(input.amount)) {
        throw new DodoCheckoutError('The Dodo product does not match the server subscription price.', 409, 'DODO_PRODUCT_MISMATCH');
      }
      const urls = dodoBrowserUrls(input.paymentSessionId, env);
      const body: CheckoutSessionCreateParams = {
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
      const session = await gateway.checkoutSessions.create(body);
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
    }
  };
}
