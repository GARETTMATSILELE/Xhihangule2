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
  payoutMethod?: 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque';
  notes?: string;
  referenceNumber: string;
  receiptFileName?: string;
  receiptContentType?: string;
  receiptUploadedAt?: string;
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

function getApiBaseUrl(): string {
  const configured = (api as any)?.defaults?.baseURL;
  return String(configured || '/api').replace(/\/+$/, '');
}

function openApiUrl(path: string): void {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  window.open(`${base}${normalizedPath}`, '_blank');
}

function openBlobInNewTab(blob: Blob): void {
  const objectUrl = window.URL.createObjectURL(blob);
  window.open(objectUrl, '_blank');
  // Revoke after a short delay to avoid breaking new tab load.
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
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
    openApiUrl(`/vat/payouts/${encodeURIComponent(payoutId)}/ack`);
  },
  async uploadPayoutReceipt(payoutId: string, file: File) {
    const formData = new FormData();
    formData.append('receipt', file);
    const res = await api.post(`/vat/payouts/${encodeURIComponent(payoutId)}/receipt`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    } as any);
    return (res as any)?.data || res;
  },
  async openPayoutReceipt(payoutId: string) {
    const res = await api.get(`/vat/payouts/${encodeURIComponent(payoutId)}/receipt`, {
      responseType: 'blob'
    } as any);
    const blob = (res as any)?.data instanceof Blob ? (res as any).data : new Blob([(res as any)?.data]);
    openBlobInNewTab(blob);
  },
  async openPropertySummary(propertyId: string, start: Date, end: Date) {
    const url = `/vat/properties/${encodeURIComponent(propertyId)}/summary?start=${encodeURIComponent(toISODateString(start))}&end=${encodeURIComponent(toISODateString(end))}`;
    const res = await api.get(url, { responseType: 'blob' } as any);
    const blob = (res as any)?.data instanceof Blob ? (res as any).data : new Blob([(res as any)?.data]);
    openBlobInNewTab(blob);
  }
};

export default vatService;

