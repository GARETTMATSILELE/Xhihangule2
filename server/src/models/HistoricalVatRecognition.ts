import mongoose, { Document, Schema, Types } from 'mongoose';

export type HistoricalVatRecognitionStatus = 'review' | 'approved' | 'recognised' | 'rejected';

export interface IHistoricalVatRecognition extends Document {
  companyId: Types.ObjectId;
  paymentId: Types.ObjectId;
  referenceNumber: string;
  receiptDate: Date;
  periodClass: 'before_registration' | 'on_or_after_registration';
  snapshotVatAmount: number;
  snapshotVatRate: number;
  recognitionAmount: number;
  status: HistoricalVatRecognitionStatus;
  physicalBookReference?: string;
  taxTreatmentBasis?: string;
  septemberTaxTreatmentApproved: boolean;
  recognitionReason?: string;
  blockedReason?: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  recognisedAt?: Date;
  rejectedBy?: Types.ObjectId;
  rejectedAt?: Date;
  journalEntryId?: Types.ObjectId;
  taxObligationId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const HistoricalVatRecognitionSchema = new Schema<IHistoricalVatRecognition>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    referenceNumber: { type: String, required: true },
    receiptDate: { type: Date, required: true },
    periodClass: { type: String, enum: ['before_registration', 'on_or_after_registration'], required: true },
    snapshotVatAmount: { type: Number, required: true },
    snapshotVatRate: { type: Number, required: true },
    recognitionAmount: { type: Number, required: true },
    status: { type: String, enum: ['review', 'approved', 'recognised', 'rejected'], required: true },
    physicalBookReference: { type: String, required: false },
    taxTreatmentBasis: { type: String, required: false },
    septemberTaxTreatmentApproved: { type: Boolean, default: false },
    recognitionReason: { type: String, required: false },
    blockedReason: { type: String, required: false },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    approvedAt: { type: Date, required: false },
    recognisedAt: { type: Date, required: false },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    rejectedAt: { type: Date, required: false },
    journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', required: false },
    taxObligationId: { type: Schema.Types.ObjectId, ref: 'TaxObligation', required: false }
  },
  { timestamps: true, collection: 'historicalvatrecognitions' }
);

HistoricalVatRecognitionSchema.index({ companyId: 1, paymentId: 1 }, { unique: true });

export const HistoricalVatRecognition = mongoose.model<IHistoricalVatRecognition>(
  'HistoricalVatRecognition',
  HistoricalVatRecognitionSchema
);
