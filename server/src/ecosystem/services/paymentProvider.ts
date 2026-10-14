import { AppError } from '../../middleware/errorHandler';
import { EcosystemPaymentIntent } from '../models/commsAndPayments';
import { Tenant } from '../../models/Tenant';
import { Property } from '../../models/Property';
import { Lease } from '../../models/Lease';
import { isFlagEnabledForCompany } from '../flags';
import { Company } from '../../models/Company';

export interface PaymentProvider {
  initializePayment(input: {
    amount: number;
    currency: string;
    reference: string;
    metadata?: Record<string, any>;
  }): Promise<{ providerRef: string; checkoutUrl?: string }>;
  verifyPayment(providerRef: string): Promise<{ paid: boolean; amount?: number }>;
  handleWebhook(payload: any): Promise<{ providerRef: string; paid: boolean }>;
  refundPayment(providerRef: string, amount?: number): Promise<{ refunded: boolean }>;
}

class StubPaymentProvider implements PaymentProvider {
  async initializePayment(input: { amount: number; currency: string; reference: string }) {
    return { providerRef: `stub-${input.reference}`, checkoutUrl: undefined };
  }
  async verifyPayment(providerRef: string) {
    return { paid: Boolean(providerRef), amount: undefined };
  }
  async handleWebhook(payload: any) {
    return { providerRef: String(payload?.providerRef || ''), paid: payload?.paid === true };
  }
  async refundPayment() {
    return { refunded: false };
  }
}

export function getPaymentProvider(): PaymentProvider {
  const name = String(process.env.RENT_PAYMENT_PROVIDER || 'stub').toLowerCase();
  return new StubPaymentProvider();
}

export async function initializeTenantPayment(params: {
  tenantUserId: string;
  propertyId: string;
  amount: number;
  idempotencyKey: string;
  leaseId?: string;
}) {
  const property = await Property.findById(params.propertyId).select('companyId').lean();
  if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');
  const companyId = String(property.companyId);
  const company = await Company.findById(companyId).select('featureFlags').lean();
  if (!isFlagEnabledForCompany(company as any, 'onlinePaymentsEnabled')) {
    throw new AppError('Online payments are not enabled for this property/agency', 400, 'ONLINE_PAYMENTS_DISABLED');
  }

  const tenants = await Tenant.find({ userId: params.tenantUserId });
  const tenantIds = tenants.map((t) => t._id);
  const allowedPropertyIds = new Set(tenants.flatMap((t) => [String(t.propertyId || ''), ...(t.propertyIds || []).map(String)]));
  if (tenantIds.length) {
    const leases = await Lease.find({ tenantId: { $in: tenantIds }, propertyId: params.propertyId }).select('_id').lean();
    leases.forEach(() => allowedPropertyIds.add(String(params.propertyId)));
  }
  if (!allowedPropertyIds.has(String(params.propertyId))) {
    throw new AppError('You can only initialize payments for your own tenancy', 403, 'FORBIDDEN');
  }

  const existing = await EcosystemPaymentIntent.findOne({ idempotencyKey: params.idempotencyKey });
  if (existing) return existing;

  const tenant = tenants.find((t) => String(t.companyId) === companyId) || tenants[0];
  const provider = getPaymentProvider();
  const init = await provider.initializePayment({
    amount: params.amount,
    currency: 'USD',
    reference: params.idempotencyKey,
  });

  return EcosystemPaymentIntent.create({
    companyId,
    tenantUserId: params.tenantUserId,
    tenantId: tenant?._id,
    propertyId: params.propertyId,
    leaseId: params.leaseId,
    amount: params.amount,
    currency: 'USD',
    provider: process.env.RENT_PAYMENT_PROVIDER || 'stub',
    status: 'provider_created',
    idempotencyKey: params.idempotencyKey,
    providerRef: init.providerRef,
  });
}

export async function verifyAndPostTenantPayment(intentId: string, actorUserId?: string) {
  const intent = await EcosystemPaymentIntent.findById(intentId);
  if (!intent) throw new AppError('Payment intent not found', 404, 'NOT_FOUND');
  if (actorUserId && String(intent.tenantUserId) !== actorUserId) {
    throw new AppError('You can only verify your own payment intents', 403, 'FORBIDDEN');
  }
  if (intent.status === 'reconciled' && intent.paymentId) {
    return { intent, paymentId: intent.paymentId, posted: true };
  }

  const provider = getPaymentProvider();
  if (!intent.providerRef) throw new AppError('Provider reference missing', 400, 'PROVIDER_REF_MISSING');
  const verification = await provider.verifyPayment(intent.providerRef);
  if (!verification.paid) {
    intent.status = 'failed';
    await intent.save();
    throw new AppError('Payment not confirmed by provider', 409, 'PAYMENT_NOT_VERIFIED');
  }

  // Provider verification is not a financial post. Canonical Payment creation
  // remains the existing createPayment / postPaymentAccounting path so rent
  // allocation, commission, and tax metadata stay authoritative.
  intent.status = 'paid';
  await intent.save();

  return { intent, paymentId: intent.paymentId, posted: false };
}

export const PaymentProviderService = {
  getPaymentProvider,
  initializeTenantPayment,
  verifyAndPostTenantPayment,
};
