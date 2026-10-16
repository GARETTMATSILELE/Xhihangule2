import api from '../api/axios';

type ExpensePayload = {
  amount: number;
  date?: string | Date;
  payee?: string;
  category?: string;
  reference?: string;
  description?: string;
  paymentMethod?: string;
};

let pendingExpenseKey = '';
let pendingExpenseIdentity = '';

function expenseIdentity(data: ExpensePayload): string {
  return JSON.stringify({
    amount: data.amount,
    date: data.date ? String(data.date) : '',
    payee: data.payee || '',
    category: data.category || '',
    reference: data.reference || '',
    description: data.description || '',
    paymentMethod: data.paymentMethod || ''
  });
}

function newExpenseKey(): string {
  const bytes = new Uint8Array(16);
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error('A browser random source is required for an expense idempotency key');
  }
  cryptoObj.getRandomValues(bytes);
  const token = Array.from(bytes).map((value) => value.toString(16).padStart(2, '0')).join('');
  return `company-expense:${token}`;
}

export function companyExpenseIdempotencyKey(data: ExpensePayload): string {
  const identity = expenseIdentity(data);
  if (pendingExpenseKey && pendingExpenseIdentity === identity) return pendingExpenseKey;
  pendingExpenseKey = newExpenseKey();
  pendingExpenseIdentity = identity;
  return pendingExpenseKey;
}

export function clearCompanyExpenseIdempotency(): void {
  pendingExpenseKey = '';
  pendingExpenseIdentity = '';
}

export interface CompanyAccountSummary {
  runningBalance: number;
  totalIncome: number;
  totalExpenses: number;
}

export const companyAccountService = {
  async getSummary(): Promise<CompanyAccountSummary> {
    const res = await api.get('/accountants/company-account/summary');
    return res.data;
  },
  async getTransactions(): Promise<{ transactions: any[]; runningBalance: number }> {
    const res = await api.get('/accountants/company-account/transactions');
    return res.data;
  },
  async createExpense(data: ExpensePayload): Promise<any> {
    const payload = {
      ...data,
      type: 'expense'
    };
    const idempotencyKey = companyExpenseIdempotencyKey(data);
    const res = await api.post('/accountants/company-account/transactions', payload, {
      headers: { 'Idempotency-Key': idempotencyKey }
    });
    clearCompanyExpenseIdempotency();
    return res.data;
  }
};

export default companyAccountService;


