import { SubscriptionCycle, SubscriptionProviderId } from './providerAvailability';

export interface SubscriptionCheckoutRequest {
  paymentSessionId: string;
  companyId: string;
  subscriptionId: string;
  customerId: string;
  customerEmail: string;
  customerName: string;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  cycle: SubscriptionCycle;
  amount: number;
  currency: 'USD';
  description: string;
}

export interface SubscriptionCheckoutResult {
  redirectUrl: string;
  provider: SubscriptionProviderId;
  providerTransactionId: string;
  metadata: Record<string, string>;
}

export interface SubscriptionPaymentProvider {
  id: SubscriptionProviderId;
  createCheckout(input: SubscriptionCheckoutRequest): Promise<SubscriptionCheckoutResult>;
}
