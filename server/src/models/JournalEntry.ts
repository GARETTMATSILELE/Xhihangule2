import mongoose, { Schema, Document, Types } from 'mongoose';
import { COLLECTIONS } from '../config/collections';

export type JournalSourceModule = 'payment' | 'expense' | 'sale' | 'commission' | 'manual';

export interface IJournalEntry extends Document {
  companyId: Types.ObjectId;
  reference: string;
  description?: string;
  sourceModule: JournalSourceModule;
  sourceId?: string;
  status: 'posted';
  transactionDate: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

const JournalEntrySchema = new Schema<IJournalEntry>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    reference: { type: String, required: true, trim: true },
    description: { type: String, required: false },
    sourceModule: {
      type: String,
      enum: ['payment', 'expense', 'sale', 'commission', 'manual'],
      required: true
    },
    sourceId: { type: String, required: false },
    status: { type: String, enum: ['posted'], default: 'posted', immutable: true },
    transactionDate: { type: Date, required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: false }
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

JournalEntrySchema.index({ companyId: 1, transactionDate: -1 });
JournalEntrySchema.index({ companyId: 1, sourceModule: 1, transactionDate: -1 });
JournalEntrySchema.index({ companyId: 1, reference: 1 }, { unique: true });
JournalEntrySchema.index({ companyId: 1, sourceModule: 1, sourceId: 1 }, { unique: true, sparse: true });

// Journal entries are immutable and non-deletable.
JournalEntrySchema.pre('save', function(next) {
  if (!this.isNew && this.isModified()) {
    return next(new Error('Journal entries are immutable after posting.'));
  }
  return next();
});
JournalEntrySchema.pre('deleteOne', { document: false, query: true }, function(next) {
  next(new Error('Hard delete is disabled for journal entries.'));
});
JournalEntrySchema.pre('deleteMany', { document: false, query: true }, function(next) {
  next(new Error('Hard delete is disabled for journal entries.'));
});
JournalEntrySchema.pre('findOneAndDelete', function(next) {
  next(new Error('Hard delete is disabled for journal entries.'));
});

export const JournalEntry = mongoose.model<IJournalEntry>(
  'JournalEntry',
  JournalEntrySchema,
  COLLECTIONS.JOURNAL_ENTRIES
);
