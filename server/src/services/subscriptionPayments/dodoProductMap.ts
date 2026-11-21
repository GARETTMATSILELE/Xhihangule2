import { Plan } from '../../models/Plan';
import { chargeForPlan } from '../systemPlanService';
import { dodoProductEnv, SubscriptionCycle } from './providerAvailability';

export interface DodoPrice {
  cents: number;
  currency: string;
  recurring: boolean;
  interval: string;
  count: number;
}

export function readDodoProductPrice(product: { price?: { currency?: string; price?: number; type?: string; payment_frequency_count?: number; payment_frequency_interval?: string } | null }): DodoPrice | null {
  const price = product?.price;
  if (!price || !Number.isFinite(Number(price.price))) return null;
  return {
    cents: Math.round(Number(price.price)),
    currency: String(price.currency || '').toUpperCase(),
    recurring: price.type === 'recurring_price',
    interval: String(price.payment_frequency_interval || ''),
    count: Number(price.payment_frequency_count || 0)
  };
}

export function cycleMatchesDodoPrice(cycle: SubscriptionCycle, price: DodoPrice): boolean {
  if (!price.recurring || price.currency !== 'USD') return false;
  if (cycle === 'monthly') return price.interval === 'Month' && price.count === 1;
  if (cycle === 'quarterly') return price.interval === 'Month' && price.count === 3;
  return price.interval === 'Year' && price.count === 1;
}

export function resolveDodoProductId(plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE', cycle: SubscriptionCycle, env: NodeJS.ProcessEnv = process.env): string {
  return dodoProductEnv(cycle, plan, env);
}

export async function subscriptionListPrice(plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE', cycle: SubscriptionCycle): Promise<number | null> {
  if (cycle === 'quarterly') {
    const row = await Plan.findOne({ code: plan, isActive: true }).select('quarterlyPrice').lean();
    const price = Number((row as { quarterlyPrice?: number } | null)?.quarterlyPrice || 0);
    return Number.isFinite(price) && price > 0 ? price : null;
  }
  return chargeForPlan(plan, cycle);
}

export function amountToCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}
