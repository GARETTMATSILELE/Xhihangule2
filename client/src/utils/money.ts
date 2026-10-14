export type CurrencyCode = 'USD' | 'ZiG' | 'ZAR';

export interface InvoiceItemInput {
  description?: string;
  taxPercentage?: number;
  netPrice?: number;
  quantity?: number;
  unitPrice?: number;
}

export interface InvoiceTotals {
  subtotal: number;
  amountExcludingTax: number;
  taxAmount: number;
  totalAmount: number;
}

export function roundMoney(amount: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(Number(amount || 0) * factor) / factor;
}

export function calculateInvoiceTotals(items: InvoiceItemInput[], discount: number = 0, taxPercentage: number = 15): InvoiceTotals {
  const lines = (items || []).map((item) => {
    const qty = Number(item?.quantity ?? 1);
    const unit = Number(item?.unitPrice ?? item?.netPrice ?? 0);
    return {
      net: qty * unit,
      rate: item?.taxPercentage == null ? Number(taxPercentage || 0) : Number(item.taxPercentage || 0)
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.net, 0);
  const discountAmount = Number(discount || 0);
  const amountExcludingTax = subtotal - discountAmount;
  const rates = lines.map((line) => line.rate);
  const uniformRate = rates.length === 0 || rates.every((rate) => rate === rates[0]);
  const taxAmount = uniformRate
    ? (amountExcludingTax * Number(rates[0] ?? taxPercentage ?? 0)) / 100
    : lines.reduce((sum, line) => {
        const share = subtotal === 0 ? 0 : line.net / subtotal;
        const lineAfterDiscount = line.net - discountAmount * share;
        return sum + (lineAfterDiscount * line.rate) / 100;
      }, 0);
  const totalAmount = amountExcludingTax + taxAmount;
  return { subtotal, amountExcludingTax, taxAmount, totalAmount };
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'USD', opts?: { minimumFractionDigits?: number; maximumFractionDigits?: number }): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', ...opts }).format(Number(amount || 0));
  }
  if (currency === 'ZAR') {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', ...opts }).format(Number(amount || 0));
  }
  // ZiG formatting (no official ISO code in Intl), prefix with label
  const min = typeof opts?.minimumFractionDigits === 'number' ? opts?.minimumFractionDigits : 2;
  const max = typeof opts?.maximumFractionDigits === 'number' ? opts?.maximumFractionDigits : 2;
  return `ZiG ${new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max }).format(Number(amount || 0))}`;
}










