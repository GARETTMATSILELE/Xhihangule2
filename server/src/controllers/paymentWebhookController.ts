import crypto from 'crypto';
import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { Payment } from '../models/Payment';
import { Property } from '../models/Property';
import { emitEvent } from '../events/eventBus';
import { WebhookEventReceipt } from '../models/WebhookEventReceipt';
import { CommissionService, applyLevyPassThroughToSnapshot } from '../services/commissionService';
import {
  classifyPropertyFinancialKind,
  SALE_PAYMENT_INCOMPLETE_CODE,
  salePaymentIncompleteResponse,
  validateSalePaymentCompleteness,
  WEBHOOK_PAYMENT_TYPE_UNKNOWN_CODE
} from '../services/salePaymentCompleteness';
import { prepareIntroductionRentalCommission } from '../services/introductionCommissionService';
import { centralVatRateBlock, commissionVatFlagsFromPolicy, resolveCommissionVatPolicy, stampVatDecision } from '../services/vatPolicyService';
import { openReview } from '../services/taxObligationService';
import { introductionContextErrorResponse } from '../services/introductionLeaseContext';
import { mayPostSaleTrust } from '../services/transactionDomain';

const toSafeString = (v: unknown): string => String(v || '').trim();

const normalizeStatus = (raw: string): 'pending' | 'completed' | 'failed' => {
  const s = String(raw || '').toLowerCase();
  if (s === 'confirmed' || s === 'completed' || s === 'success') return 'completed';
  if (s === 'failed' || s === 'error') return 'failed';
  return 'pending';
};

export type WebhookCreatedFinancials =
  | {
      ok: true;
      paymentType: 'rental' | 'sale';
      agentId: mongoose.Types.ObjectId;
      commissionDetails: any;
      applyVatOnCommission: boolean;
      vatOnCommissionRate: number;
      vatCommissionTreatment?: 'inclusive' | 'exclusive';
      emitTrustEvent: boolean;
      tenantId?: mongoose.Types.ObjectId;
      leaseId?: mongoose.Types.ObjectId;
    }
  | {
      ok: false;
      code: string;
      message: string;
      missing?: string[];
      mismatches?: string[];
    };

/**
 * Classify from Property.rentalType only. Unknown must not be guessed as a sale.
 * Incomplete sales are rejected — never created with a zero commission snapshot.
 */
export const resolveWebhookCreatedPaymentFinancials = async (input: {
  companyId: string;
  propertyId: string;
  amount: number;
  paymentDate: Date;
  payerObjectId?: mongoose.Types.ObjectId;
  tenantId?: unknown;
  leaseId?: unknown;
}): Promise<WebhookCreatedFinancials> => {
  const property = await Property.findById(input.propertyId)
    .select('rentalType commission vatOnCommission vatCommissionTreatment agentId rent')
    .lean();
  const kind = classifyPropertyFinancialKind((property as any)?.rentalType);
  if (!property || kind === 'unknown') {
    return {
      ok: false,
      code: WEBHOOK_PAYMENT_TYPE_UNKNOWN_CODE,
      message: 'Webhook payment type cannot be classified from Property.rentalType.',
      missing: ['property.rentalType']
    };
  }

  const propertyAgent = (property as any)?.agentId
    ? new mongoose.Types.ObjectId(String((property as any).agentId))
    : undefined;
  if (!propertyAgent && !input.payerObjectId) {
    return {
      ok: false,
      code: 'WEBHOOK_ACTOR_REQUIRED',
      message: 'Webhook payment requires a valid payerId or a property agent.',
      missing: ['payerId']
    };
  }
  const agentId = propertyAgent || input.payerObjectId!;
  const amount = Number(input.amount || 0);

  if (kind === 'sale') {
    const percent = Number((property as any)?.commission || 0);
    const computed = await CommissionService.calculate(
      amount,
      percent,
      new mongoose.Types.ObjectId(String(input.companyId))
    );
    const completeness = validateSalePaymentCompleteness({
      amount,
      commissionDetails: computed
    });
    if (!completeness.ok) {
      return {
        ok: false,
        code: SALE_PAYMENT_INCOMPLETE_CODE,
        message: 'Sale payment is missing required financial data.',
        missing: completeness.missing
      };
    }
    return {
      ok: true,
      paymentType: 'sale',
      agentId,
      commissionDetails: computed,
      applyVatOnCommission: false,
      vatOnCommissionRate: 0,
      vatCommissionTreatment: undefined,
      emitTrustEvent: true
    };
  }

  const rentalType = String((property as any)?.rentalType || '').toLowerCase();
  const propertyVatRequested = Boolean((property as any)?.vatOnCommission);
  const isIntroduction = rentalType === 'introduction';
  const commissionVatPolicy = await resolveCommissionVatPolicy({
    companyId: String(input.companyId),
    paymentDate: input.paymentDate,
    property: {
      vatOnCommission: propertyVatRequested,
      vatCommissionTreatment: (property as any)?.vatCommissionTreatment
    },
    requestedVatOnCommission: propertyVatRequested,
    requestedTreatment: (property as any)?.vatCommissionTreatment,
    commissionType: isIntroduction ? 'introduction' : 'management'
  });
  const blockedVatRate = centralVatRateBlock(commissionVatPolicy);
  if (blockedVatRate) {
    return { ok: false, code: blockedVatRate.code, message: blockedVatRate.message };
  }
  const commissionVat = commissionVatFlagsFromPolicy(commissionVatPolicy);
  if (commissionVatPolicy.reviewRequired && commissionVatPolicy.reviewReason) {
    await openReview({
      companyId: String(input.companyId),
      kind: commissionVatPolicy.reviewReason,
      title: 'VAT on commission requires review',
      detail: commissionVatPolicy.reason,
      propertyId: String(input.propertyId)
    });
  }
  if (isIntroduction) {
    const prepared = await prepareIntroductionRentalCommission({
      companyId: input.companyId,
      propertyId: input.propertyId,
      tenantId: input.tenantId,
      leaseId: input.leaseId,
      rentAllocated: amount,
      levyAllocated: 0,
      vatOnCommission: commissionVat.vatOnCommission,
      vatTreatment: commissionVat.vatTreatment,
      vatRate: commissionVat.vatRate,
      paymentDate: input.paymentDate,
      propertyRent: Number((property as any)?.rent || 0)
    });
    if (!prepared.ok) {
      return {
        ok: false,
        code: prepared.code,
        message: prepared.message,
        missing: (prepared as any).missing,
        mismatches: (prepared as any).mismatches
      };
    }
    return {
      ok: true,
      paymentType: 'rental',
      agentId,
      commissionDetails: stampVatDecision(prepared.snapshot, commissionVatPolicy),
      applyVatOnCommission: prepared.result.vatOnCommission,
      vatOnCommissionRate: Number(prepared.result.vatRate || 0),
      vatCommissionTreatment: prepared.result.vatTreatment,
      emitTrustEvent: false,
      tenantId: new mongoose.Types.ObjectId(prepared.context.tenantId),
      leaseId: new mongoose.Types.ObjectId(prepared.context.leaseId)
    };
  }

  const commissionResult = await CommissionService.calculateForProperty({
    companyId: input.companyId,
    grossRent: amount,
    levy: 0,
    commissionPercentage: Number((property as any)?.commission || 0),
    vatOnCommission: commissionVat.vatOnCommission,
    vatTreatment: commissionVat.vatTreatment,
    vatRate: commissionVat.vatRate,
    paymentDate: input.paymentDate
  });
  return {
    ok: true,
    paymentType: 'rental',
    agentId,
    commissionDetails: stampVatDecision(applyLevyPassThroughToSnapshot(commissionResult, amount, 0), commissionVatPolicy),
    applyVatOnCommission: commissionResult.vatOnCommission,
    vatOnCommissionRate: Number(commissionResult.vatRate || 0),
    vatCommissionTreatment: commissionResult.vatTreatment,
    emitTrustEvent: false
  };
};

const isSignatureValid = (body: unknown, signature: string | undefined): boolean => {
  const secret = process.env.WEBHOOK_SHARED_SECRET || '';
  if (!secret) return false;
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(body || {})).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(String(signature).trim(), 'hex');
  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
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
      tenantId,
      leaseId,
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
          companyId: new mongoose.Types.ObjectId(String(companyId))
        },
        $set: { status: 'processing', lastError: '' }
      },
      { upsert: true }
    );

    const failWebhook = async (failure: { code: string; message: string; missing?: string[]; mismatches?: string[] }) => {
      await WebhookEventReceipt.updateOne(
        { provider: providerName, eventId: providerEventId },
        {
          $set: {
            status: 'failed',
            lastError: `${failure.code}: ${(failure.missing || failure.mismatches || []).join(', ') || failure.message}`
          }
        }
      );
      const body =
        failure.code === SALE_PAYMENT_INCOMPLETE_CODE
          ? salePaymentIncompleteResponse(failure.missing || [])
          : introductionContextErrorResponse({
              code: failure.code,
              message: failure.message,
              missing: failure.missing,
              mismatches: failure.mismatches
            });
      return res.status(400).json(body);
    };

    let payment = null as any;
    let emitTrustEvent = true;
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
      const previousStatus = String(payment.status || '');
      const alreadyCompleted = previousStatus === 'completed' && payment.isProvisional !== true;
      payment.status = normalizedStatus as any;
      (payment as any).externalProvider = providerName;
      (payment as any).externalTransactionId = toSafeString(externalTransactionId || providerEventId);
      if (!alreadyCompleted) {
        payment.paymentDate = date ? new Date(String(date)) : payment.paymentDate;
        payment.amount = Number(amount);
        payment.paymentMethod = (paymentMethod || payment.paymentMethod || 'bank_transfer') as any;
        payment.currency = (currency || payment.currency || 'USD') as any;
      }
      if (normalizedStatus === 'completed' && previousStatus !== 'completed') {
        const { activateAccountingTrackingForCompletion } = await import('../services/paymentAccountingReconciliation');
        activateAccountingTrackingForCompletion(payment);
      }
      await payment.save();
    } else {
      const payerObjectId = payerId && mongoose.Types.ObjectId.isValid(String(payerId))
        ? new mongoose.Types.ObjectId(String(payerId))
        : undefined;
      const paymentDateValue = date ? new Date(String(date)) : new Date();
      const createdFinancials = await resolveWebhookCreatedPaymentFinancials({
        companyId: String(companyId),
        propertyId: String(propertyId),
        amount: Number(amount),
        paymentDate: paymentDateValue,
        payerObjectId,
        tenantId,
        leaseId
      });
      if (!createdFinancials.ok) {
        return failWebhook(createdFinancials);
      }
      emitTrustEvent = createdFinancials.emitTrustEvent;

      const requestedTenant = tenantId && mongoose.Types.ObjectId.isValid(String(tenantId))
        ? new mongoose.Types.ObjectId(String(tenantId))
        : undefined;
      const tenantForPayment = createdFinancials.tenantId
        || requestedTenant
        || (createdFinancials.paymentType === 'sale' ? undefined : payerObjectId);
      if (createdFinancials.paymentType !== 'sale' && !tenantForPayment) {
        return failWebhook({
          code: 'WEBHOOK_TENANT_REQUIRED',
          message: 'A rental webhook payment requires a valid tenantId or payerId.',
          missing: ['tenantId']
        });
      }
      const processedBy = payerObjectId || createdFinancials.agentId;

      payment = new Payment({
        paymentType: createdFinancials.paymentType,
        transactionDomain: createdFinancials.paymentType === 'sale' ? 'SALE' : 'RENTAL',
        propertyType: 'residential',
        propertyId: new mongoose.Types.ObjectId(String(propertyId)),
        tenantId: tenantForPayment,
        leaseId: createdFinancials.leaseId,
        agentId: createdFinancials.agentId,
        companyId: new mongoose.Types.ObjectId(String(companyId)),
        paymentDate: paymentDateValue,
        paymentMethod: (paymentMethod || 'bank_transfer') as any,
        amount: Number(amount),
        depositAmount: 0,
        referenceNumber: toSafeString(reference),
        notes: 'Created from payment confirmation webhook',
        processedBy,
        commissionDetails: createdFinancials.commissionDetails,
        applyVatOnCommission: createdFinancials.applyVatOnCommission,
        vatOnCommissionRate: createdFinancials.vatOnCommissionRate,
        vatCommissionTreatment: createdFinancials.vatCommissionTreatment,
        status: normalizedStatus,
        accountingStatus: normalizedStatus === 'completed' ? 'pending' : undefined,
        accountingComplete: normalizedStatus === 'completed' ? false : undefined,
        currency: (currency || 'USD') as any,
        externalProvider: providerName,
        externalTransactionId: toSafeString(externalTransactionId || providerEventId),
        rentalPeriodMonth: new Date().getMonth() + 1,
        rentalPeriodYear: new Date().getFullYear()
      });
      await payment.save();
    }

    if (normalizedStatus === 'completed') {
      let accountingComplete = false;
      try {
        const { ensurePaymentAccountingPosted } = await import('../services/paymentAccountingReconciliation');
        const postResult = await ensurePaymentAccountingPosted(String(payment._id));
        accountingComplete = postResult.accountingComplete === true;
      } catch (postErr: any) {
        console.warn('Webhook payment accounting post failed:', postErr?.message || postErr);
      }
      if (accountingComplete) {
        try {
          const { notifyOwnerOfRentPayment } = await import('../services/ownerRentNotificationService');
          void notifyOwnerOfRentPayment(payment, { accountingComplete: true });
        } catch (noticeErr: any) {
          console.warn('[owner-rent-notice] webhook notification was not queued', noticeErr?.message || noticeErr);
        }
      }
      if (mayPostSaleTrust(payment)) {
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
