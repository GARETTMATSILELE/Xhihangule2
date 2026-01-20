import api from '../api';

export interface VatSummaryResponse {
  totalVat: number;
}

export interface VatTransactionItem {
  paymentId: string;
  vatAmount: number;
  paymentDate: string;
  referenceNumber?: string;
  tenantId?: string;
}

export interface VatPayoutItem {
  _id: string;
  totalAmount: number;
  date: string;
  status: 'pending' | 'completed' | 'cancelled';
  recipientName?: string;
  referenceNumber: string;
}

export interface VatPropertyGroup {
  property: {
    _id: string;
    name: string;
    address: string;
    ownerName?: string;
  };
  totalVat: number;
  transactions: VatTransactionItem[];
  payouts: VatPayoutItem[];
}

function toISODateString(d: Date): string {
  return new Date(d).toISOString();
}

const vatService = {
  async getSummary(start: Date, end: Date): Promise<VatSummaryResponse> {
    const res = await api.get(`/vat/summary?start=${encodeURIComponent(toISODateString(start))}&end=${encodeURIComponent(toISODateString(end))}`);
    return (res as any)?.data || res;
  },
  async getTransactions(start: Date, end: Date): Promise<VatPropertyGroup[]> {
    const res = await api.get(`/vat/transactions?start=${encodeURIComponent(toISODateString(start))}&end=${encodeURIComponent(toISODateString(end))}`);
    const data = (res as any)?.data || res;
    return Array.isArray(data) ? data : [];
  },
  async createPayout(payload: { propertyId: string; start: Date; end: Date; recipientName?: string; payoutMethod?: string; notes?: string; recipientId?: string; }) {
    const body = {
      propertyId: payload.propertyId,
      start: toISODateString(payload.start),
      end: toISODateString(payload.end),
      recipientName: payload.recipientName,
      payoutMethod: payload.payoutMethod,
      notes: payload.notes,
      recipientId: payload.recipientId
    };
    const res = await api.post('/vat/payouts', body);
    return (res as any)?.data || res;
  },
  openPayoutAck(payoutId: string) {
    window.open(`/api/vat/payouts/${encodeURIComponent(payoutId)}/ack`, '_blank');
  },
  openPropertySummary(propertyId: string, start: Date, end: Date) {
    const url = `/api/vat/properties/${encodeURIComponent(propertyId)}/summary?start=${encodeURIComponent(toISODateString(start))}&end=${encodeURIComponent(toISODateString(end))}`;
    window.open(url, '_blank');
  }
};

export default vatService;

