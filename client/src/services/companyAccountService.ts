import api from '../api/axios';

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
  async createExpense(data: {
    amount: number;
    date?: string | Date;
    payee?: string;
    category?: string;
    reference?: string;
    description?: string;
    paymentMethod?: string;
  }): Promise<any> {
    const payload = {
      ...data,
      type: 'expense'
    };
    const res = await api.post('/accountants/company-account/transactions', payload);
    return res.data;
  }
};

export default companyAccountService;


