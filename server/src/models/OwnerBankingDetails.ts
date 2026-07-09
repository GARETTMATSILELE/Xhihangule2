import mongoose, { Schema, Document } from 'mongoose';

export interface IOwnerBankingDetails extends Document {
  ownerId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  bankName?: string;
  branchName?: string;
  accountName?: string;
  accountNumber?: string;
  swiftCode?: string;
  updatedAt: Date;
  createdAt: Date;
}

const OwnerBankingDetailsSchema = new Schema<IOwnerBankingDetails>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'PropertyOwner', required: true, unique: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    bankName: { type: String },
    branchName: { type: String },
    accountName: { type: String },
    accountNumber: { type: String },
    swiftCode: { type: String },
  },
  { timestamps: true, collection: 'owner_banking_details' }
);

export const OwnerBankingDetails = mongoose.model<IOwnerBankingDetails>(
  'OwnerBankingDetails',
  OwnerBankingDetailsSchema
);
