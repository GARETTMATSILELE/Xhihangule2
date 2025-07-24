import { Schema, Document, Types } from 'mongoose';
import { accountingConnection } from '../config/database';

interface Transaction {
  type: 'income' | 'expense';
  amount: number;
  date: Date;
  paymentId?: Types.ObjectId;
  description?: string;
}

export interface IPropertyAccount extends Document {
  propertyId: Types.ObjectId;
  transactions: Transaction[];
  runningBalance: number;
  lastUpdated: Date;
}

const TransactionSchema = new Schema<Transaction>({
  type: { type: String, enum: ['income', 'expense'], required: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
  description: { type: String }
});

const PropertyAccountSchema = new Schema<IPropertyAccount>({
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, unique: true },
  transactions: [TransactionSchema],
  runningBalance: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

export default accountingConnection.model<IPropertyAccount>('PropertyAccount', PropertyAccountSchema, 'propertyaccounts'); 