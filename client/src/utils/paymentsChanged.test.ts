import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  dispatchPaymentsChanged,
  extractPropertyAccountChangeIds,
  unwrapPaymentResponse
} from './paymentsChanged';

const accountantApiResponse = {
  message: 'Payment processed successfully',
  payment: {
    _id: '123',
    propertyId: 'property123',
    tenantId: 'tenant123',
    leaseId: 'lease123'
  }
};

const salesPayment = {
  _id: 'sale-1',
  propertyId: 'property-sale',
  paymentType: 'sale'
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('unwrapPaymentResponse', () => {
  it('unwraps accountant { message, payment } to the payment record', () => {
    const created = unwrapPaymentResponse(accountantApiResponse);
    expect(created).toEqual(accountantApiResponse.payment);
    expect(created).not.toHaveProperty('message');
    expect(created._id).toBe('123');
    expect(created.propertyId).toBe('property123');
  });

  it('keeps an already-unwrapped sales payment unchanged', () => {
    expect(unwrapPaymentResponse(salesPayment)).toEqual(salesPayment);
  });

  it('unwraps sales { payment } the same way SalesPaymentsPage does', () => {
    const created = { payment: salesPayment };
    const createdPayment = unwrapPaymentResponse(created);
    expect(createdPayment).toEqual(salesPayment);
    expect(createdPayment.paymentType).toBe('sale');
  });

  it('unwraps { data: payment } agent-style responses', () => {
    expect(unwrapPaymentResponse({ status: 'success', data: salesPayment })).toEqual(salesPayment);
  });
});

describe('accountant payment event → targeted Property Account refresh', () => {
  it('dispatches the actual payment with propertyId, not the wrapper', () => {
    const seen: any[] = [];
    const listener = (event: Event) => {
      seen.push((event as CustomEvent).detail);
    };
    window.addEventListener('payments:changed', listener);

    const created = unwrapPaymentResponse(accountantApiResponse);
    dispatchPaymentsChanged({ type: 'created', payment: created });

    window.removeEventListener('payments:changed', listener);

    expect(seen).toHaveLength(1);
    expect(seen[0].payment).toEqual(accountantApiResponse.payment);
    expect(seen[0].payment).not.toHaveProperty('message');
    expect(seen[0].paymentId).toBe('123');
    expect(seen[0].propertyId).toBe('property123');

    const ids = extractPropertyAccountChangeIds(seen[0]);
    expect(ids.propertyId).toBe('property123');
    expect(ids.paymentId).toBe('123');

    const currentPropertyId = 'property123';
    const wouldSkipTargetedRefresh =
      Boolean(ids.propertyId) &&
      ids.propertyId !== currentPropertyId;
    expect(wouldSkipTargetedRefresh).toBe(false);
  });

  it('still extracts propertyId if a caller passes the accountant wrapper by mistake', () => {
    const seen: any[] = [];
    const listener = (event: Event) => {
      seen.push((event as CustomEvent).detail);
    };
    window.addEventListener('payments:changed', listener);
    dispatchPaymentsChanged({ type: 'created', payment: accountantApiResponse });
    window.removeEventListener('payments:changed', listener);

    expect(seen[0].propertyId).toBe('property123');
    expect(seen[0].payment._id).toBe('123');
    expect(seen[0].payment).not.toEqual(accountantApiResponse);
  });

  it('does not change sales dispatch behaviour', () => {
    const createdPayment = ( { payment: salesPayment } as any)?.payment || ({ payment: salesPayment } as any)?.data || { payment: salesPayment };
    const seen: any[] = [];
    const listener = (event: Event) => {
      seen.push((event as CustomEvent).detail);
    };
    window.addEventListener('payments:changed', listener);
    dispatchPaymentsChanged({ type: 'created', payment: createdPayment });
    window.removeEventListener('payments:changed', listener);

    expect(seen[0].payment).toEqual(salesPayment);
    expect(seen[0].propertyId).toBe('property-sale');
    expect(seen[0].paymentId).toBe('sale-1');
  });
});
