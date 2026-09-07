export type PropertyAccountChangeIds = {
  paymentId?: string;
  propertyId?: string;
  accountId?: string;
  type?: string;
  eventType?: string;
};

function asId(value: any): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'object') {
    const inner = value._id || value.id;
    return inner ? String(inner) : undefined;
  }
  return String(value);
}

export function extractPropertyAccountChangeIds(source: any): PropertyAccountChangeIds {
  if (!source || typeof source !== 'object') return {};
  const payment = source.payment;
  return {
    type: source.type ? String(source.type) : undefined,
    eventType: source.eventType ? String(source.eventType) : undefined,
    paymentId: asId(source.paymentId) || asId(payment?._id),
    propertyId: asId(source.propertyId) || asId(payment?.propertyId),
    accountId: asId(source.accountId) || asId(payment?.accountId)
  };
}

export function dispatchPaymentsChanged(input: {
  type: string;
  payment?: any;
  paymentId?: string;
  propertyId?: string;
  accountId?: string;
}): void {
  const ids = extractPropertyAccountChangeIds(input);
  try {
    window.dispatchEvent(new CustomEvent('payments:changed', {
      detail: {
        type: input.type,
        payment: input.payment,
        ...(ids.paymentId ? { paymentId: ids.paymentId } : {}),
        ...(ids.propertyId ? { propertyId: ids.propertyId } : {}),
        ...(ids.accountId ? { accountId: ids.accountId } : {})
      }
    }));
  } catch {
    // ignore
  }
}
