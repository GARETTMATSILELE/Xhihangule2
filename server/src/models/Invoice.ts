import { Schema, Document } from 'mongoose';
import { accountingConnection } from '../config/database';

export interface IInvoice extends Document {
  property: string;
  client: string;
  amount: number;
  dueDate: Date;
  description?: string;
  type: 'rental' | 'sale';
  saleDetails?: string;
  status: 'paid' | 'unpaid' | 'overdue';
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema: Schema = new Schema({
  property: { type: String, required: true },
  client: { type: String, required: true },
  amount: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  description: { type: String },
  type: { type: String, enum: ['rental', 'sale'], required: true },
  saleDetails: { type: String },
  status: { type: String, enum: ['paid', 'unpaid', 'overdue'], default: 'unpaid' },
}, { timestamps: true });

export const Invoice = accountingConnection.model<IInvoice>('Invoice', InvoiceSchema, 'invoices'); 