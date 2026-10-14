import http from 'http';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { Payment } from '../models/Payment';
import { OwnerRentNotice } from '../models/OwnerRentNotice';
import { notifyOwnerOfRentPayment } from '../services/ownerRentNotificationService';
import { buildOwnerRentEmail } from '../services/ownerRentNotificationPolicy';

const PASSWORD = 'Phase4b1-Accept-1';
const evidencePath = path.resolve(__dirname, '../../tmp/phase4b1-evidence.json');

function request(method: string, urlPath: string, token: string | null, body?: unknown) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 5000, path: urlPath, method, timeout: 120000,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(email: string) {
  const result = await request('POST', '/api/auth/login', null, { email, password: PASSWORD });
  const body = JSON.parse(result.text);
  if (!body.token) throw new Error(`login failed ${result.status}`);
  return body.token as string;
}

async function main() {
  if (process.env.NODE_ENV === 'production') process.exit(2);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  await connectDatabase();
  const host = String((mongoose.connection as any).host || '');
  if (host !== 'localhost' && host !== '127.0.0.1') process.exit(2);

  const testToken = await login(evidence.identities.testAdminEmail);
  const bToken = await login(evidence.identities.companyBAdminEmail);
  const aToken = await login(evidence.identities.companyAAdminEmail);
  const bPropertyId = '6acb543d271b8f101124081b';
  const bLeaseId = '6acb543d271b8f101124082e';
  const aLeaseId = evidence.records.leaseId;
  const tenantBody = evidence.http.find((row: any) => row.label === 'company B tenant')?.body;
  const bTenantId = tenantBody?._id || tenantBody?.data?._id || tenantBody?.tenant?._id;

  const stray = await Payment.find({
    companyId: evidence.identities.testCompanyId,
    propertyId: bPropertyId,
  }).select('_id status amount accountingComplete companyId propertyId createdAt').lean();

  const bPaysBefore = await Payment.countDocuments({ companyId: evidence.identities.companyBId });
  const testPaysBefore = await Payment.countDocuments({ companyId: evidence.identities.testCompanyId });
  const leaseDenied = await request('GET', `/api/leases/${bLeaseId}`, testToken);
  const leaseAllowed = await request('GET', `/api/leases/${aLeaseId}`, testToken);
  const paymentDenied = await request('POST', '/api/accountants/payments', testToken, {
    paymentType: 'rental', paymentDate: '2026-08-11', paymentMethod: 'cash', amount: 10, currency: 'USD',
    propertyId: bPropertyId, tenantId: bTenantId, rentalPeriodMonth: 8, rentalPeriodYear: 2026,
  });
  const bPaysAfter = await Payment.countDocuments({ companyId: evidence.identities.companyBId });
  const testPaysAfter = await Payment.countDocuments({ companyId: evidence.identities.testCompanyId });
  const aList = await request('GET', '/api/properties', aToken);
  const bList = await request('GET', '/api/properties', bToken);
  const aText = aList.text;
  const bText = bList.text;

  const payment = await Payment.findById(evidence.borrowdale.paymentId);
  const before = await OwnerRentNotice.findOne({ paymentId: payment?._id }).lean();
  if (payment) await notifyOwnerOfRentPayment(payment as any, { accountingComplete: payment.accountingComplete === true });
  const after = await OwnerRentNotice.find({ paymentId: payment?._id }).lean();
  const email = buildOwnerRentEmail({
    ownerName: 'PHASE4B1_TEST_OWNER Disposable',
    propertyName: 'PHASE4B1_TEST_PROPERTY',
    amount: 1000,
    currency: 'USD',
    paymentDate: new Date('2026-10-11'),
    agencyName: 'PHASE4B1_TEST_COMPANY',
  });

  const result = {
    strayCrossPayments: stray.map((row) => ({
      id: String(row._id), status: row.status, amount: row.amount, accountingComplete: (row as any).accountingComplete,
    })),
    leaseDenied: leaseDenied.status,
    leaseDeniedExposesProperty: leaseDenied.text.includes(bPropertyId),
    leaseAllowed: leaseAllowed.status,
    paymentDenied: paymentDenied.status,
    paymentDeniedBody: paymentDenied.text.slice(0, 300),
    companyBPaymentCountUnchanged: bPaysBefore === bPaysAfter,
    testCompanyPaymentCountUnchanged: testPaysBefore === testPaysAfter,
    companyAListStatus: aList.status,
    companyAListContainsBProperty: aText.includes(bPropertyId),
    companyBListStatus: bList.status,
    companyBListContainsOwnProperty: bText.includes(bPropertyId),
    idempotency: {
      beforeStatus: before?.status,
      beforeUpdatedAt: (before as any)?.updatedAt,
      afterCount: after.length,
      afterStatus: after[0]?.status,
      afterUpdatedAt: (after[0] as any)?.updatedAt,
      unchanged: String((before as any)?.updatedAt) === String((after[0] as any)?.updatedAt) && after.length === 1,
    },
    emailExposesTenantId: email.text.includes(String(evidence.records.tenantId)),
    emailExposesBank: /bank|account number/i.test(email.text),
    emailExcerpt: email.text,
  };
  evidence.securityRetest = result;
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
