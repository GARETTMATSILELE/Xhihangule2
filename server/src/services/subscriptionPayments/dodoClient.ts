import DodoPayments from 'dodopayments';
import { readDodoConfig } from './providerAvailability';

export type DodoGateway = Pick<DodoPayments, 'checkoutSessions' | 'products' | 'payments' | 'webhooks'>;

let gatewayOverride: DodoGateway | null | undefined;

export function setDodoGatewayForTests(gateway: DodoGateway | null | undefined) {
  gatewayOverride = gateway;
}

export function createDodoGateway(env: NodeJS.ProcessEnv = process.env): DodoGateway | null {
  const config = readDodoConfig(env);
  if (!config.apiKey || config.mode === 'invalid') return null;
  return new DodoPayments({
    bearerToken: config.apiKey,
    webhookKey: config.webhookKey || null,
    environment: config.mode === 'live' ? 'live_mode' : 'test_mode'
  });
}

export function getDodoGateway(env: NodeJS.ProcessEnv = process.env): DodoGateway | null {
  if (gatewayOverride !== undefined) return gatewayOverride;
  return createDodoGateway(env);
}
