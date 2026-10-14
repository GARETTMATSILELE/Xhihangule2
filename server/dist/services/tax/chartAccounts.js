"use strict";
/** Canonical GL codes for Phase 8 company vs client-money separation. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHASE8_CHART_SEEDS = exports.GL = void 0;
exports.GL = {
    COMPANY_BANK: '1001',
    CASH: '1002',
    TRUST_BANK: '1003',
    VAT_INPUT: '1101',
    TAX_PREPAYMENT: '1102',
    VAT_PAYABLE: '2101',
    COMMISSION_LIABILITY: '2102',
    OWNER_PAYABLE: '2103',
    SELLER_PAYABLE: '2104',
    ZIMRA_WITHHOLDING: '2105',
    TENANT_DEPOSITS: '2106',
    LEVY_PAYABLE: '2107',
    RETAINED_EARNINGS: '3001',
    AGENCY_REVENUE: '4001',
    SALES_COMMISSION_REVENUE: '4002',
    OPERATING_EXPENSE: '5001',
    COMMISSION_EXPENSE: '5002',
    VAT_EXPENSE: '5003'
};
exports.PHASE8_CHART_SEEDS = [
    { code: exports.GL.COMPANY_BANK, name: 'Company Bank', type: 'asset' },
    { code: exports.GL.CASH, name: 'Cash On Hand', type: 'asset' },
    { code: exports.GL.TRUST_BANK, name: 'Client Trust Bank', type: 'asset' },
    { code: exports.GL.VAT_INPUT, name: 'VAT Input', type: 'asset' },
    { code: exports.GL.TAX_PREPAYMENT, name: 'Tax unallocated / prepayment', type: 'asset' },
    { code: exports.GL.VAT_PAYABLE, name: 'VAT Payable', type: 'liability' },
    { code: exports.GL.COMMISSION_LIABILITY, name: 'Commission Liability', type: 'liability' },
    { code: exports.GL.OWNER_PAYABLE, name: 'Owner / Client Payable', type: 'liability' },
    { code: exports.GL.SELLER_PAYABLE, name: 'Seller Payable', type: 'liability' },
    { code: exports.GL.ZIMRA_WITHHOLDING, name: 'ZIMRA Withholding Payable', type: 'liability' },
    { code: exports.GL.TENANT_DEPOSITS, name: 'Tenant Deposits Payable', type: 'liability' },
    { code: exports.GL.LEVY_PAYABLE, name: 'Levy Payable', type: 'liability' },
    { code: exports.GL.RETAINED_EARNINGS, name: 'Retained Earnings', type: 'equity' },
    { code: exports.GL.AGENCY_REVENUE, name: 'Agency / Management Revenue', type: 'revenue' },
    { code: exports.GL.SALES_COMMISSION_REVENUE, name: 'Sales Commission Revenue', type: 'revenue' },
    { code: exports.GL.OPERATING_EXPENSE, name: 'Operating Expense', type: 'expense' },
    { code: exports.GL.COMMISSION_EXPENSE, name: 'Commission Expense', type: 'expense' },
    { code: exports.GL.VAT_EXPENSE, name: 'VAT Expense', type: 'expense' }
];
