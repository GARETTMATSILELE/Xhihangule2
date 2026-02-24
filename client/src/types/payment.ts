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

export type PaymentType = 'rental' | 'sale' | 'introduction' | 'levy' | 'municipal';
export type PropertyType = 'residential' | 'commercial';
export type SaleMode = 'quick' | 'installment';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'credit_card' | 'mobile_money';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'reversed' | 'voided';
export type PostingStatus = 'draft' | 'posted' | 'reversed' | 'voided';
export type Currency = 'USD' | 'ZiG' | 'ZAR';

// Runtime array of payment methods that matches the type
export const PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'bank_transfer',
  'credit_card',
  'mobile_money',
];

export const SUPPORTED_CURRENCIES: Currency[] = ['USD', 'ZiG', 'ZAR'];

export interface PaymentFormData {
  paymentType: PaymentType;
  saleMode?: SaleMode;
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
  // Advance payment fields
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month: number; year: number };
  advancePeriodEnd?: { month: number; year: number };
  commissionDetails?: {
    totalCommission: number;
    preaFee: number;
    agentShare: number;
    agencyShare: number;
    vatOnCommission?: number;
    ownerAmount: number;
  };
  processedBy?: string;
  ownerId?: string;
  // Manual entry fields for properties/tenants not in database
  manualPropertyAddress?: string;
  manualTenantName?: string;
  buyerName?: string;
  sellerName?: string;
  // Provisional workflow
  isProvisional?: boolean;
  provisionalRelationshipType?: 'unknown' | 'management' | 'introduction';
  // Sales development linkage (optional)
  developmentId?: string;
  developmentUnitId?: string;
  // Sales VAT behavior
  vatIncluded?: boolean;
  vatRate?: number;
  vatAmount?: number;
}

export interface Payment {
  _id: string;
  paymentType: PaymentType;
  saleMode?: SaleMode;
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
    vatOnCommission?: number;
    ownerAmount: number;
  };
  status: PaymentStatus;
  postingStatus?: PostingStatus;
  createdAt: Date;
  updatedAt: Date;
  currency: Currency;
  leaseId: string;
  receiptUrl?: string;
  rentalPeriodMonth: number;
  rentalPeriodYear: number;
  rentUsed?: number;
  // Advance rental payment fields (optional)
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month: number; year: number };
  advancePeriodEnd?: { month: number; year: number };
  // Manual entry fields (optional)
  manualPropertyAddress?: string;
  manualTenantName?: string;
  buyerName?: string;
  sellerName?: string;
  // Provisional workflow
  isProvisional?: boolean;
  isInSuspense?: boolean;
  commissionFinalized?: boolean;
  provisionalRelationshipType?: 'unknown' | 'management' | 'introduction';
  // Sales development linkage (optional)
  developmentId?: string;
  developmentUnitId?: string;
  // Sales VAT metadata (optional)
  vatIncluded?: boolean;
  vatRate?: number;
  vatAmount?: number;
  reversalOfPaymentId?: string;
  reversalPaymentId?: string;
  correctedPaymentId?: string;
  reversedAt?: Date;
  reversalReason?: string;
  isCorrectionEntry?: boolean;
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
  saleMode?: SaleMode;
  propertyType?: PropertyType;
  status?: PaymentStatus;
  agentId?: string;
  tenantId?: string;
  propertyId?: string;
  paymentMethod?: PaymentMethod;
  currency?: Currency;
  // Custom filter to show only payments with a deposit portion
  onlyDeposits?: string; // 'true' to enable
  // Server-side pagination (optional)
  page?: number;
  limit?: number;
  paginate?: boolean | string;
  // Filter to exclude development-linked sales
  noDevelopment?: boolean;
  // Global search term (e.g., reference number, notes, etc.)
  search?: string;
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