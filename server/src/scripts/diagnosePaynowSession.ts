/**
 * Read-only diagnosis for one Paynow subscription reference.
 * Prints status and the reason it is unreconciled. It does not update any record.
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

import mongoose from 'mongoose';
import { PaymentSession } from '../models/PaymentSession';
import { AuditLog } from '../models/AuditLog';
import { Company } from '../models/Company';
import { explainUnreconciledPaynowSession } from '../services/registrationPaymentPolicy';

function databaseUri(): string {
  const configured = [process.env.MONGODB_URI, process.env.MONGODB_URI_PROPERTY, process.env.CUSTOMCONNSTR_MONGODB_URI]
    .map((value) => String(value || '').trim())
    .find(Boolean);
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') throw new Error('MONGODB_URI is required');
  return 'mongodb://127.0.0.1:27017/property-management';
}

async function main() {
  const reference = String(process.argv[2] || '').trim();
  if (!reference) {
    console.error('Usage: npm run paynow:diagnose -- SUBS-reference');
    process.exit(1);
  }
  await mongoose.connect(databaseUri(), { serverSelectionTimeoutMS: 8000 });
  const sessions = await PaymentSession.find({ provider: 'paynow', providerRef: reference })
    .select('status amount currency companyId metadata updatedAt rawProviderResponse')
    .lean();
  if (sessions.length > 1) {
    console.log(JSON.stringify({
      reference,
      database: mongoose.connection.name,
      classification: 'ambiguous',
      sessionCount: sessions.length,
      writeAllowed: false,
      reason: 'More than one session uses this reference. No session was changed.'
    }, null, 2));
    await mongoose.disconnect();
    return;
  }
  const session = sessions[0];
  const verifiedAuditCount = session
    ? await AuditLog.countDocuments({ entityId: String(session._id), action: 'payment.verified' })
    : 0;
  const company = session
    ? await Company.findById(session.companyId).select('onboardingStatus subscriptionStatus').lean()
    : null;
  const explanation = explainUnreconciledPaynowSession({
    found: Boolean(session),
    status: session?.status,
    verifiedAuditCount
  });
  const stored = session?.rawProviderResponse as { paynowReference?: string } | undefined;
  console.log(JSON.stringify({
    reference,
    database: mongoose.connection.name,
    ...explanation,
    status: session?.status || null,
    amount: session?.amount ?? null,
    currency: session?.currency || null,
    paynowReference: stored?.paynowReference || null,
    paynowMode: (session?.metadata as { paynowMode?: string } | undefined)?.paynowMode || null,
    verifiedAuditCount,
    companyOnboardingStatus: (company as { onboardingStatus?: string } | null)?.onboardingStatus || null,
    companySubscriptionStatus: (company as { subscriptionStatus?: string } | null)?.subscriptionStatus || null,
    updatedAt: session?.updatedAt || null
  }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(String((error as { message?: string })?.message || error).slice(0, 200));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
