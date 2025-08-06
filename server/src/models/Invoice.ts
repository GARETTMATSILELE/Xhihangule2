import { Schema, Document, Types } from 'mongoose';
import { accountingConnection } from '../config/database';

interface InvoiceItem {
  code: string;
  description: string;
  taxPercentage: number;
  netPrice: number;
}

interface ClientDetails {
  name: string;
  address: string;
  tinNumber?: string;
  vatNumber?: string;
}

interface BankAccount {
  accountNumber: string;
  accountName: string;
  accountType: 'USD NOSTRO' | 'ZiG';
  bankName: string;
  branchName: string;
  branchCode: string;
}

export interface IInvoice extends Document {
  companyId: Types.ObjectId;
  property: string;
  client: ClientDetails;
  subtotal: number;
  discount: number;
  amountExcludingTax: number;
  taxPercentage: number;
  taxAmount: number;
  totalAmount: number;
  dueDate: Date;
  items: InvoiceItem[];
  type: 'rental' | 'sale';
  saleDetails?: string;
  status: 'paid' | 'unpaid' | 'overdue';
  selectedBankAccount?: BankAccount;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceItemSchema = new Schema<InvoiceItem>({
  code: { type: String, required: true },
  description: { type: String, required: true },
  taxPercentage: { type: Number, required: true, default: 15 },
  netPrice: { type: Number, required: true }
});

const ClientDetailsSchema = new Schema<ClientDetails>({
  name: { type: String, required: true },
  address: { type: String, required: true },
  tinNumber: { type: String, required: false },
  vatNumber: { type: String, required: false }
});

const BankAccountSchema = new Schema<BankAccount>({
  accountNumber: { type: String, required: true },
  accountName: { type: String, required: true },
  accountType: { type: String, enum: ['USD NOSTRO', 'ZiG'], required: true },
  bankName: { type: String, required: true },
  branchName: { type: String, required: true },
  branchCode: { type: String, required: true }
});

const InvoiceSchema: Schema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  property: { type: String, required: true },
  client: { type: ClientDetailsSchema, required: true },
  subtotal: { type: Number, required: true, default: 0 },
  discount: { type: Number, required: true, default: 0 },
  amountExcludingTax: { type: Number, required: true, default: 0 },
  taxPercentage: { type: Number, required: true, default: 15 },
  taxAmount: { type: Number, required: true, default: 0 },
  totalAmount: { type: Number, required: true, default: 0 },
  dueDate: { type: Date, required: true },
  items: [InvoiceItemSchema],
  type: { type: String, enum: ['rental', 'sale'], required: true },
  saleDetails: { type: String },
  status: { type: String, enum: ['paid', 'unpaid', 'overdue'], default: 'unpaid' },
  selectedBankAccount: { type: BankAccountSchema, required: false },
}, { timestamps: true });

export const Invoice = accountingConnection.model<IInvoice>('Invoice', InvoiceSchema, 'invoices'); 