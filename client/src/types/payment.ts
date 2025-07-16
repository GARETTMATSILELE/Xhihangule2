/**
 * Payment Management System
 * 
 * This module handles all payment-related functionality for the property management system.
 * 
 * Features:
 * - Multi-currency payment processing
 * - Payment receipt generation
 * - Payment history tracking
 * - Role-based access control
 * 
 * Payment Types:
 * - Payment: Core payment record with tenant, property, and lease linkage
 * - PaymentFormData: Data structure for payment form submission
 * - PaymentSummary: Aggregated payment statistics
 * 
 * Security:
 * - Only 'Accountant' and 'Admin' roles can modify payments
 * - All payment changes are audited
 * - Receipts are securely generated and stored
 * 
 * Database Schema:
 * - Payments table with currency, exchange rate, and audit fields
 * - Currencies table for exchange rate management
 * - Payment_audit_log for tracking changes
 * 
 * API Endpoints:
 * - POST /api/payments - Create new payment
 * - GET /api/payments - List payments with filters
 * - GET /api/payments/:id - Get payment details
 * - PUT /api/payments/:id - Update payment
 * - DELETE /api/payments/:id - Delete payment
 * - GET /api/payments/:id/receipt - Generate receipt
 * 
 * UI Components:
 * - PaymentForm: Payment entry form with validation
 * - PaymentList: Filterable payment history
 * - PaymentDetail: Detailed payment view with receipt
 * - PaymentSummary: Dashboard statistics
 */

export type PaymentType = 'introduction' | 'rental';
export type PropertyType = 'residential' | 'commercial';
export type PaymentMethod = 'cash' | 'bank_transfer';
export type PaymentStatus = 'pending' | 'completed' | 'failed';
export type Currency = 'USD' | 'ZWL';

// Runtime array of payment methods that matches the type
export const PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'bank_transfer',
];

export const SUPPORTED_CURRENCIES: Currency[] = ['USD', 'ZWL'];

export interface PaymentFormData {
  paymentType: PaymentType;
  propertyType: PropertyType;
  propertyId: string;
  tenantId: string;
  agentId: string;
  paymentDate: Date | null;
  paymentMethod: PaymentMethod;
  amount: number;
  depositAmount?: number;
  referenceNumber: string;
  notes: string;
  currency: Currency;
  leaseId: string;
  companyId: string;
  rentalPeriodMonth: number;
  rentalPeriodYear: number;
  rentUsed?: number;
}

export interface Payment {
  _id: string;
  paymentType: PaymentType;
  propertyType: PropertyType;
  propertyId: string;
  tenantId: string;
  agentId: string;
  companyId: string;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  amount: number;
  depositAmount?: number;
  referenceNumber: string;
  notes: string;
  processedBy: string;
  commissionDetails: {
    totalCommission: number;
    preaFee: number;
    agentShare: number;
    agencyShare: number;
    ownerAmount: number;
  };
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
  currency: Currency;
  leaseId: string;
  receiptUrl?: string;
  rentalPeriodMonth: number;
  rentalPeriodYear: number;
  rentUsed?: number;
}

// Extended Payment interface for populated data from backend
export interface PopulatedPayment extends Omit<Payment, 'propertyId' | 'tenantId' | 'agentId'> {
  propertyId: string | { _id: string; name: string; address: string };
  tenantId: string | { _id: string; firstName: string; lastName: string };
  agentId: string | { _id: string; firstName: string; lastName: string };
}

export interface PaymentFilter {
  startDate?: Date;
  endDate?: Date;
  paymentType?: PaymentType;
  propertyType?: PropertyType;
  status?: PaymentStatus;
  agentId?: string;
  tenantId?: string;
  propertyId?: string;
  paymentMethod?: PaymentMethod;
  currency?: Currency;
}

export interface PaymentSummary {
  totalIncome: number;
  totalPayments: number;
  overduePayments: number;
  pendingAmount: number;
  currencyBreakdown: {
    [key in Currency]?: number;
  };
} 