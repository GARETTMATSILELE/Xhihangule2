import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import trustAccountService from './trustAccountService';

type PaymentConfirmedPayload = {
  paymentId: string;
  propertyId: string;
  payerId?: string;
  amount: number;
  reference?: string;
  date?: string;
  companyId: string;
  sourceEvent?: string;
  performedBy?: string;
};

type PaymentReversedPayload = {
  paymentId: string;
  reversalPaymentId?: string;
  companyId: string;
  sourceEvent?: string;
  performedBy?: string;
  reason?: string;
};

class TrustPaymentPostingService {
  async postBuyerPaymentToTrust(payload: PaymentConfirmedPayload) {
    const payment = await Payment.findById(payload.paymentId).lean();
    if (!payment) {
      throw new Error(`Payment not found: ${payload.paymentId}`);
    }

    const normalizedStatus = String((payment as any).status || '').toLowerCase();
    if (normalizedStatus !== 'completed' && normalizedStatus !== 'confirmed') {
      throw new Error(`Payment ${payload.paymentId} is not confirmed/completed`);
    }

    if (!mongoose.Types.ObjectId.isValid(String(payload.propertyId || ''))) {
      throw new Error('Invalid propertyId in payment event');
    }

    const result = await trustAccountService.recordBuyerPayment({
      companyId: String(payload.companyId),
      propertyId: String(payload.propertyId),
      amount: Number(payload.amount || 0),
      reference: payload.reference,
      paymentId: String(payload.paymentId),
      sourceEvent: payload.sourceEvent || 'payment.confirmed',
      createdBy: payload.performedBy
    });

    return result;
  }

  async reverseBuyerPaymentInTrust(payload: PaymentReversedPayload) {
    const originalPayment = await Payment.findById(payload.paymentId).lean();
    if (!originalPayment) {
      throw new Error(`Original payment not found: ${payload.paymentId}`);
    }

    if (String((originalPayment as any).paymentType || '').toLowerCase() !== 'sale') {
      return null;
    }

    const propertyId = String((originalPayment as any).propertyId || '');
    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      throw new Error('Invalid propertyId in reversal event');
    }

    const reversalPaymentId = String(payload.reversalPaymentId || '').trim();
    const reversalPayment =
      reversalPaymentId && mongoose.Types.ObjectId.isValid(reversalPaymentId)
        ? await Payment.findById(reversalPaymentId).lean()
        : null;

    const reversalAmountRaw =
      Number((reversalPayment as any)?.amount || 0) || -Math.abs(Number((originalPayment as any)?.amount || 0));
    const reversalAmount = Math.abs(reversalAmountRaw);
    if (reversalAmount <= 0) {
      throw new Error('Reversal amount must be greater than zero');
    }

    const result = await trustAccountService.reverseBuyerPayment({
      companyId: String(payload.companyId),
      propertyId,
      amount: reversalAmount,
      paymentId: reversalPaymentId || undefined,
      reference:
        String((reversalPayment as any)?.reference || '').trim() ||
        `reversal:${String(payload.paymentId)}${payload.reason ? `:${payload.reason}` : ''}`,
      sourceEvent: payload.sourceEvent || 'payment.reversed',
      createdBy: payload.performedBy
    });

    const trustAccountId = String((result as any)?.account?._id || '');
    if (trustAccountId) {
      try {
        await trustAccountService.calculateSettlement({
          companyId: String(payload.companyId),
          trustAccountId,
          createdBy: payload.performedBy
        });
      } catch (settlementError: any) {
        // Keep trust reversal successful even if settlement refresh is not applicable.
        console.warn('Skipping trust settlement refresh after reversal:', settlementError?.message || settlementError);
      }
      try {
        await trustAccountService.verifyAndRepairAccountInvariants({
          companyId: String(payload.companyId),
          trustAccountId,
          performedBy: payload.performedBy,
          sourceEvent: payload.sourceEvent || 'payment.reversed'
        });
      } catch (invariantError: any) {
        // Keep reversal resilient; invariants are repaired opportunistically.
        console.warn('Trust invariant check after reversal failed:', invariantError?.message || invariantError);
      }
    }

    return result;
  }
}

export default new TrustPaymentPostingService();
