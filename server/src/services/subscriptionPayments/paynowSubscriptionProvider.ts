import { Request } from 'express';
import { initiatePaynowCheckout } from '../../controllers/paynowController';
import { SubscriptionPaymentProvider } from './paymentProvider';

export function createPaynowSubscriptionProvider(req: Request): SubscriptionPaymentProvider {
  return {
    id: 'paynow',
    async createCheckout(input) {
      if (input.cycle === 'quarterly') {
        const error: any = new Error('Paynow subscription checkout does not bill quarterly.');
        error.statusCode = 400;
        error.code = 'CYCLE_NOT_SUPPORTED';
        throw error;
      }
      const checkout = await initiatePaynowCheckout(req, {
        paymentSessionId: input.paymentSessionId,
        plan: input.plan,
        cycle: input.cycle,
        email: input.customerEmail,
        description: input.description
      });
      return {
        redirectUrl: checkout.redirectUrl,
        provider: 'paynow',
        providerTransactionId: checkout.reference,
        metadata: { pollUrl: checkout.pollUrl || '' }
      };
    }
  };
}
