/**
 * Registration payment-provider selection.
 * Uses a disposable local database and a mocked Dodo client.
 * Does not call Dodo, Paynow, or production.
 */
import mongoose from 'mongoose';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { Plan } from '../models/Plan';
import { Subscription } from '../models/Subscription';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { OnboardingService } from '../services/onboardingService';
import { readProviderAvailability, selectPaynowMethod, selectSubscriptionProvider } from '../services/subscriptionPayments/providerAvailability';
import { companyProfileWrite } from '../services/companyProfileWrite';
import { setDodoGatewayForTests } from '../services/subscriptionPayments/dodoClient';
import { startDodoSubscriptionCheckout } from '../services/subscriptionPayments/subscriptionCheckoutService';
import { processVerifiedDodoEvent } from '../services/subscriptionPayments/dodoWebhookService';

const TEST_DB = 'mongodb://127.0.0.1:27017/mantis_registration_provider_test';
const failures: string[] = [];

function check(condition: unknown, message: string) {
  if (!condition) failures.push(message);
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
}

function configure(extra: Record<string, string | undefined> = {}) {
  process.env.NODE_ENV = 'development';
  process.env.PAYNOW_ENABLED = 'true';
  process.env.PAYNOW_INTEGRATION_ID = 'registration-provider-test';
  process.env.PAYNOW_INTEGRATION_KEY = 'registration-provider-test';
  process.env.PAYNOW_MODE = 'test';
  process.env.PAYNOW_DISABLE_LOCAL_CONFIG = '1';
  delete process.env.PAYNOW_CARD_ENABLED;
  process.env.PAYNOW_ECOCASH_ENABLED = 'true';
  process.env.DODO_PAYMENTS_ENABLED = 'true';
  process.env.DODO_PAYMENTS_MODE = 'test';
  process.env.DODO_PAYMENTS_API_KEY = 'dodo_test_key';
  process.env.DODO_PAYMENTS_WEBHOOK_KEY = 'dodo-test-webhook-not-a-provider-secret';
  process.env.DODO_PAYMENTS_RETURN_URL = 'http://localhost:3000/billing/return';
  process.env.DODO_PAYMENTS_PRODUCT_INDIVIDUAL_MONTHLY = 'pdt_individual_monthly';
  process.env.DODO_PAYMENTS_PRODUCT_INDIVIDUAL_ANNUAL = 'pdt_individual_annual';
  process.env.DODO_PAYMENTS_PRODUCT_SME_MONTHLY = 'pdt_sme_monthly';
  process.env.DODO_PAYMENTS_PRODUCT_SME_ANNUAL = 'pdt_sme_annual';
  delete process.env.DODO_PAYMENTS_PRODUCT_MONTHLY;
  delete process.env.DODO_PAYMENTS_PRODUCT_QUARTERLY;
  delete process.env.DODO_PAYMENTS_PRODUCT_ANNUAL;
  delete process.env.DODO_PAYMENTS_PRODUCT_ENTERPRISE_MONTHLY;
  delete process.env.DODO_PAYMENTS_PRODUCT_ENTERPRISE_ANNUAL;
  delete process.env.ENTERPRISE_DIRECT_CHECKOUT;
  Object.entries(extra).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

function registrationInput(stamp: string, provider?: 'paynow' | 'dodo') {
  return {
    email: `${stamp}@example.test`,
    password: 'Register1pay',
    name: 'Registration Admin',
    plan: 'INDIVIDUAL' as const,
    billingCycle: 'monthly' as const,
    registrationMode: 'paid' as const,
    provider,
    company: {
      name: `Registration ${stamp}`,
      email: `${stamp}@example.test`,
      address: '1 Test Close',
      phone: '0772000000',
      country: 'Zimbabwe',
      companyType: 'INDIVIDUAL_LANDLORD' as const,
      workspaceType: 'individual' as const
    },
    idempotencyKey: stamp
  };
}

function fakeGateway(cents = 2000) {
  let created = 0;
  setDodoGatewayForTests({
    products: {
      retrieve: async (id: string) => ({
        price: { type: 'recurring_price', currency: 'USD', price: cents, payment_frequency_interval: 'Month', payment_frequency_count: 1, product_id: id }
      })
    },
    checkoutSessions: {
      create: async () => {
        created += 1;
        return { session_id: `cks_${created}`, checkout_url: `https://test.checkout.dodopayments.com/session/cks_${created}` };
      }
    },
    payments: { retrieve: async () => ({}) },
    webhooks: { unwrap: () => { throw new Error('not used'); } }
  } as any);
  return { created: () => created };
}

async function main() {
  if (/cosmos|azure|mantisafrica/i.test(TEST_DB) || mongoose.connection.readyState !== 0) process.exit(1);
  configure();
  const paynowOnly = { DODO_PAYMENTS_ENABLED: 'false' } as NodeJS.ProcessEnv;
  check((selectSubscriptionProvider(undefined, { ...process.env, ...paynowOnly }) as { provider?: string }).provider === 'paynow', 'Paynow is selected when it is the only provider');
  check((selectSubscriptionProvider('dodo', { ...process.env, DODO_PAYMENTS_ENABLED: 'false' }) as { code?: string }).code === 'DODO_DISABLED', 'disabled Dodo is rejected');
  check((selectSubscriptionProvider('paynow', { ...process.env, DODO_PAYMENTS_ENABLED: 'false' }) as { provider?: string }).provider === 'paynow', 'Paynow remains available when Dodo is disabled');
  configure({ DODO_PAYMENTS_API_KEY: '' });
  check((selectSubscriptionProvider('dodo') as { code?: string }).code === 'DODO_NOT_CONFIGURED', 'missing Dodo credentials leave Dodo unavailable');
  configure({ DODO_PAYMENTS_WEBHOOK_KEY: '' });
  check((selectSubscriptionProvider('dodo') as { code?: string }).code === 'DODO_NOT_CONFIGURED', 'a missing webhook secret leaves Dodo unavailable');
  configure({
    DODO_PAYMENTS_PRODUCT_INDIVIDUAL_MONTHLY: '',
    DODO_PAYMENTS_PRODUCT_INDIVIDUAL_ANNUAL: '',
    DODO_PAYMENTS_PRODUCT_SME_MONTHLY: '',
    DODO_PAYMENTS_PRODUCT_SME_ANNUAL: ''
  });
  check((selectSubscriptionProvider('dodo') as { code?: string }).code === 'DODO_NOT_CONFIGURED', 'missing product mappings leave Dodo unavailable');
  configure();
  check((selectSubscriptionProvider('card') as { code?: string }).code === 'PROVIDER_INVALID', 'an invalid provider is rejected');
  check((selectSubscriptionProvider(undefined) as { code?: string }).code === 'PROVIDER_REQUIRED', 'no provider is selected when both are available');
  check((selectSubscriptionProvider('paynow') as { provider?: string }).provider === 'paynow', 'Paynow can be selected explicitly');
  check((selectSubscriptionProvider('dodo') as { provider?: string }).provider === 'dodo', 'Dodo can be selected explicitly');
  const listed = readProviderAvailability();
  check(listed[0]?.id === 'dodo' && listed[1]?.id === 'paynow', 'Dodo is listed before Paynow');
  check(listed.find((item) => item.id === 'dodo')?.methods.some((method) => method.id === 'card') === true, 'Dodo offers card checkout');
  check(listed.find((item) => item.id === 'paynow')?.methods.some((method) => method.id === 'card') !== true, 'Paynow cards stay hidden unless enabled');
  check(listed.find((item) => item.id === 'paynow')?.methods.some((method) => method.id === 'ecocash') === true, 'Paynow offers EcoCash');
  check((selectPaynowMethod('card') as { code?: string }).code === 'PAYNOW_CARD_DISABLED', 'a Paynow card checkout is rejected while cards are disabled');
  const landlordProfile = companyProfileWrite({ name: 'Landlord', registrationNumber: '', tinNumber: ' ' }, 'INDIVIDUAL_LANDLORD');
  check(landlordProfile.$set.registrationNumber === undefined && landlordProfile.$unset.registrationNumber === 1 && landlordProfile.$unset.tinNumber === 1, 'a blank landlord registration number is removed instead of stored');

  await mongoose.connect(TEST_DB, { serverSelectionTimeoutMS: 8000, autoIndex: false });
  if (mongoose.connection.name !== 'mantis_registration_provider_test') process.exit(1);
  await mongoose.connection.dropDatabase();
  await Plan.create([
    { code: 'INDIVIDUAL', name: 'Individual', monthlyPrice: 20, annualPrice: 240, currency: 'USD', isActive: true },
    { code: 'SME', name: 'SME', monthlyPrice: 300, annualPrice: 3600, currency: 'USD', isActive: true },
    { code: 'ENTERPRISE', name: 'Enterprise', monthlyPrice: 600, annualPrice: 7200, currency: 'USD', isActive: true }
  ]);
  const service = OnboardingService.getInstance();
  const stamp = `reg-${Date.now()}`;

  let missingProvider = '';
  try {
    await service.start(registrationInput(`${stamp}-none`));
  } catch (error: any) {
    missingProvider = error?.code || '';
  }
  check(missingProvider === 'PROVIDER_REQUIRED' && !(await Company.findOne({ email: `${stamp}-none@example.test` })), 'registration without a provider does not create a company');

  const paynow = await service.start(registrationInput(`${stamp}-paynow`, 'paynow'));
  check(paynow.paymentSession.provider === 'paynow' && paynow.paymentSession.amount === 20 && paynow.paymentSession.currency === 'USD', 'Paynow registration stores the server price');
  check((await User.countDocuments({ companyId: paynow.company._id })) === 1 && (await Company.countDocuments({ _id: paynow.company._id })) === 1, 'Paynow registration creates one company and one user');

  const dodo = await service.start(registrationInput(`${stamp}-dodo`, 'dodo'));
  const gateway = fakeGateway();
  check(dodo.paymentSession.provider === 'dodo' && dodo.company.onboardingStatus === 'PENDING_PAYMENT' && dodo.subscription.status === 'past_due', 'Dodo registration stays pending before payment');
  check(gateway.created() === 0, 'choosing Dodo during registration does not call the payment provider');
  const repeated = await service.start({
    ...registrationInput(`${stamp}-dodo-repeat`, 'dodo'),
    email: dodo.user.email,
    company: { ...registrationInput(`${stamp}-dodo`, 'dodo').company, email: dodo.user.email }
  });
  check(String(repeated.company._id) === String(dodo.company._id) && (await Company.countDocuments({ normalizedEmail: dodo.user.email })) === 1, 'resuming a Dodo registration does not create another company');

  const switched = await service.start({
    ...registrationInput(`${stamp}-switch`, 'paynow'),
    email: dodo.user.email,
    company: { ...registrationInput(`${stamp}-dodo`, 'dodo').company, email: dodo.user.email }
  });
  check(switched.paymentSession.provider === 'paynow' && String(switched.paymentSession._id) === String(dodo.paymentSession._id), 'an unsent registration can change provider without a second charge');

  await PaymentSession.updateOne({ _id: dodo.paymentSession._id }, { $set: { provider: 'dodo', status: 'provider_created', metadata: { dodoCheckoutUrl: 'https://test.checkout.dodopayments.com/session/open' } } });
  let blocked = '';
  try {
    await service.start({
      ...registrationInput(`${stamp}-blocked`, 'paynow'),
      email: dodo.user.email,
      company: { ...registrationInput(`${stamp}-dodo`, 'dodo').company, email: dodo.user.email }
    });
  } catch (error: any) {
    blocked = error?.code || '';
  }
  check(blocked === 'PAYMENT_ATTEMPT_PENDING' && (await PaymentSession.countDocuments({ companyId: dodo.company._id })) === 1, 'a started checkout blocks the other provider');

  const started = await startDodoSubscriptionCheckout({
    user: { companyId: String(dodo.company._id), userId: String(dodo.user._id) },
    get: () => undefined
  } as any, { plan: 'INDIVIDUAL', cycle: 'monthly', openSession: await PaymentSession.findById(dodo.paymentSession._id) });
  check(started.status === 200 && gateway.created() === 1 && started.body.provider === 'dodo', 'Dodo registration checkout uses the hosted provider');
  const sessionId = String(started.body.paymentSessionId);
  const mismatch = await processVerifiedDodoEvent({
    type: 'payment.succeeded',
    data: { payment_id: 'pay_wrong', currency: 'USD', total_amount: 25000, metadata: { mantis_payment_session_id: sessionId } }
  }, 'msg_wrong_amount');
  check(mismatch.body.activated !== true && (await Company.findById(dodo.company._id))?.onboardingStatus === 'PENDING_PAYMENT', 'a mismatched payment amount does not activate registration');
  const failed = await processVerifiedDodoEvent({
    type: 'payment.failed',
    data: { payment_id: 'pay_failed', metadata: { mantis_payment_session_id: sessionId } }
  }, 'msg_failed');
  check(failed.status === 200 && (await Company.findById(dodo.company._id))?.subscriptionStatus !== 'active', 'a failed payment does not activate registration');
  await PaymentSession.updateOne({ _id: sessionId }, { $set: { status: 'provider_created' } });
  await BillingPayment.updateOne({ paymentSessionId: sessionId }, { $set: { status: 'pending' } });
  const paid = await processVerifiedDodoEvent({
    type: 'payment.succeeded',
    data: { payment_id: 'pay_reg', currency: 'USD', total_amount: 2000, metadata: { mantis_payment_session_id: sessionId }, customer: { customer_id: 'cus_reg' } }
  }, 'msg_paid');
  const duplicate = await processVerifiedDodoEvent({
    type: 'payment.succeeded',
    data: { payment_id: 'pay_reg', currency: 'USD', total_amount: 2000, metadata: { mantis_payment_session_id: sessionId } }
  }, 'msg_paid');
  const company = await Company.findById(dodo.company._id);
  check(paid.body.activated === true && duplicate.body.status === 'duplicate' && company?.subscriptionStatus === 'active' && (await Subscription.countDocuments({ companyId: dodo.company._id })) === 1 && (await User.countDocuments({ companyId: dodo.company._id })) === 1, 'a verified Dodo payment activates the same registration once');
  check((await mongoose.connection.collection('payments').countDocuments()) === 0, 'registration checkout does not create rental payments');

  let enterprise = '';
  try {
    await service.start({ ...registrationInput(`${stamp}-enterprise`, 'paynow'), plan: 'ENTERPRISE' });
  } catch (error: any) {
    enterprise = error?.code || '';
  }
  check(enterprise === 'ENTERPRISE_SALES_ONLY', 'Enterprise registration stays sales-only');

  await mongoose.disconnect();
  if (failures.length) {
    console.log(`${failures.length} failed`);
    process.exit(1);
  }
  console.log('Registration provider tests passed.');
  process.exit(0);
}

main().catch(async (error) => {
  console.error(error?.message || error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
