import { logger } from '../utils/logger';

/**
 * A structured error log. This process does not configure an external alert
 * transport. Azure log capture of the console is not proof that an alert fired.
 */
export function signalOperationalFailure(signal: string, details: Record<string, unknown> = {}): void {
  logger.error(signal, {
    signal,
    alertRequested: true,
    alertDelivery: 'not_configured',
    ...details
  });
}
