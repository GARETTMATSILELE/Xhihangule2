import publicApi from '../api/publicApi';

/**
 * Sales-specific receipt service. Ensures returned receipt is tagged as a sale
 * and leverages the existing public receipt endpoint for company metadata.
 */
export const salesReceiptService = {
  async getSalesPaymentReceipt(id: string, companyId?: string): Promise<any> {
    const config: any = {};
    const defaultCompanyId = companyId || (typeof window !== 'undefined' ? localStorage.getItem('companyId') || undefined : undefined);
    if (defaultCompanyId) {
      config.params = { companyId: defaultCompanyId };
    }

    const resp = await publicApi.get(`/payments/public/${id}/receipt`, config);
    const receipt = resp.data?.data || resp.data;
    // Force sale-specific semantics for UI (Buyer label, sale totals, etc.)
    return {
      paymentType: 'sale',
      ...receipt,
    };
  }
};

export default salesReceiptService;





























