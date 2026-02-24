import crypto from 'crypto';
import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { Payment } from '../models/Payment';
import { emitEvent } from '../events/eventBus';
import { WebhookEventReceipt } from '../models/WebhookEventReceipt';

const toSafeString = (v: unknown): string => String(v || '').trim();

const normalizeStatus = (raw: string): 'pending' | 'completed' | 'failed' => {
  const s = String(raw || '').toLowerCase();
  if (s === 'confirmed' || s === 'completed' || s === 'success') return 'completed';
  if (s === 'failed' || s === 'error') return 'failed';
  return 'pending';
};

const isSignatureValid = (body: unknown, signature: string | undefined): boolean => {
  const secret = process.env.WEBHOOK_SHARED_SECRET || '';
  if (!secret) return false;
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(body || {})).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

export const handlePaymentConfirmationWebhook = async (req: Request, res: Response) => {
  try {
    const signature = (req.headers['x-webhook-signature'] as string | undefined) || '';
    if (!isSignatureValid(req.body, signature)) {
      return res.status(401).json({ message: 'Invalid webhook signature' });
    }

    const {
      provider,
      eventId,
      externalTransactionId,
      paymentId,
      companyId,
      propertyId,
      payerId,
      amount,
      reference,
      date,
      status,
      paymentMethod,
      currency
    } = req.body || {};

    const normalizedStatus = normalizeStatus(String(status || 'pending'));
    if (!companyId || !propertyId || amount == null || !reference) {
      return res.status(400).json({ message: 'Missing required fields: companyId, propertyId, amount, reference' });
    }
    if (!mongoose.Types.ObjectId.isValid(String(companyId)) || !mongoose.Types.ObjectId.isValid(String(propertyId))) {
      return res.status(400).json({ message: 'Invalid companyId or propertyId' });
    }
    const providerName = toSafeString(provider || 'external');
    const providerEventId = toSafeString(eventId || externalTransactionId || paymentId || reference);
    if (!providerEventId) {
      return res.status(400).json({ message: 'eventId or externalTransactionId is required for webhook idempotency' });
    }

    const existingEvent = await WebhookEventReceipt.findOne({ provider: providerName, eventId: providerEventId });
    if (existingEvent?.status === 'processed') {
      return res.json({ message: 'Duplicate webhook ignored', eventId: providerEventId });
    }

    await WebhookEventReceipt.updateOne(
      { provider: providerName, eventId: providerEventId },
      {
        $setOnInsert: {
          provider: providerName,
          eventId: providerEventId,
          status: 'processing',
          companyId: new mongoose.Types.ObjectId(String(companyId))
        },
        $set: { status: 'processing', lastError: '' }
      },
      { upsert: true }
    );

    let payment = null as any;
    if (paymentId && mongoose.Types.ObjectId.isValid(String(paymentId))) {
      payment = await Payment.findOne({ _id: new mongoose.Types.ObjectId(String(paymentId)), companyId: new mongoose.Types.ObjectId(String(companyId)) });
    }
    if (!payment) {
      payment = await Payment.findOne({
        companyId: new mongoose.Types.ObjectId(String(companyId)),
        externalProvider: providerName,
        externalTransactionId: toSafeString(externalTransactionId || providerEventId)
      });
    }
    if (!payment) {
      payment = await Payment.findOne({
        companyId: new mongoose.Types.ObjectId(String(companyId)),
        referenceNumber: toSafeString(reference)
      });
    }

    if (payment) {
      payment.status = normalizedStatus as any;
      payment.paymentDate = date ? new Date(String(date)) : payment.paymentDate;
      payment.amount = Number(amount);
      payment.paymentMethod = (paymentMethod || payment.paymentMethod || 'bank_transfer') as any;
      payment.currency = (currency || payment.currency || 'USD') as any;
      (payment as any).externalProvider = providerName;
      (payment as any).externalTransactionId = toSafeString(externalTransactionId || providerEventId);
      await payment.save();
    } else {
      const payerObjectId = payerId && mongoose.Types.ObjectId.isValid(String(payerId))
        ? new mongoose.Types.ObjectId(String(payerId))
        : new mongoose.Types.ObjectId();

      payment = new Payment({
        paymentType: 'sale',
        propertyType: 'residential',
        propertyId: new mongoose.Types.ObjectId(String(propertyId)),
        tenantId: payerObjectId,
        agentId: payerObjectId,
        companyId: new mongoose.Types.ObjectId(String(companyId)),
        paymentDate: date ? new Date(String(date)) : new Date(),
        paymentMethod: (paymentMethod || 'bank_transfer') as any,
        amount: Number(amount),
        depositAmount: 0,
        referenceNumber: toSafeString(reference),
        notes: 'Created from payment confirmation webhook',
        processedBy: payerObjectId,
        commissionDetails: {
          totalCommission: 0,
          preaFee: 0,
          agentShare: 0,
          agencyShare: 0,
          vatOnCommission: 0,
          ownerAmount: Number(amount)
        },
        status: normalizedStatus,
        currency: (currency || 'USD') as any,
        externalProvider: providerName,
        externalTransactionId: toSafeString(externalTransactionId || providerEventId),
        rentalPeriodMonth: new Date().getMonth() + 1,
        rentalPeriodYear: new Date().getFullYear()
      });
      await payment.save();
    }

    if (normalizedStatus === 'completed') {
      const updateResult = await Payment.updateOne(
        { _id: payment._id, companyId: payment.companyId, trustEventEmittedAt: { $exists: false } },
        { $set: { trustEventEmittedAt: new Date(), lastTrustEventSource: 'webhook.payment-confirmation' } }
      );
      if (Number((updateResult as any).modifiedCount || 0)) {
        await emitEvent('payment.confirmed', {
          eventId: `payment.confirmed:${String(payment._id)}`,
          paymentId: String(payment._id),
          propertyId: String(payment.propertyId),
          payerId: String(payment.tenantId || ''),
          amount: Number(payment.amount || 0),
          reference: String(payment.referenceNumber || ''),
          date: new Date(payment.paymentDate || new Date()).toISOString(),
          companyId: String(payment.companyId),
          performedBy: String(payerId || payment.processedBy || '')
        });
      }
    }

    await WebhookEventReceipt.updateOne(
      { provider: providerName, eventId: providerEventId },
      {
        $set: {
          status: 'processed',
          paymentId: payment._id,
          processedAt: new Date(),
          lastError: ''
        }
      }
    );

    return res.json({ message: 'Webhook accepted', paymentId: String(payment._id), status: normalizedStatus });
  } catch (error: any) {
    try {
      const providerName = toSafeString((req.body || {}).provider || 'external');
      const providerEventId = toSafeString((req.body || {}).eventId || (req.body || {}).externalTransactionId || (req.body || {}).reference);
      if (providerEventId) {
        await WebhookEventReceipt.updateOne(
          { provider: providerName, eventId: providerEventId },
          { $set: { status: 'failed', lastError: error?.message || 'Webhook processing failed' } },
          { upsert: true }
        );
      }
    } catch {
      // noop
    }
    return res.status(500).json({ message: error?.message || 'Webhook processing failed' });
  }
};
