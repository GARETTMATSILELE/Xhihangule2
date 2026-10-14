import mongoose from 'mongoose';
import { Company } from '../models/Company';

export interface FiscalData {
  qrContent?: string;
  fiscalNumber?: string;
  deviceSerial?: string;
  documentNumber?: string;
  signature?: string;
  status: 'FISCALISATION_ATTEMPT' | 'FISCALISATION_SUCCESS' | 'FISCALISATION_FAILURE' | 'NOT_FISCALISED';
  fdmsReference?: string;
  fiscalisedAt?: Date;
  error?: string;
}

export const tryFiscalizeInvoice = async (
  companyId: string,
  invoicePayload: {
    _id?: string;
    totalAmount: number;
    taxAmount: number;
    taxPercentage: number;
    amountExcludingTax: number;
    createdAt?: Date | string;
  }
): Promise<FiscalData | null> => {
  try {
    const company = await Company.findById(new mongoose.Types.ObjectId(companyId));
    if (!company || !company.fiscalConfig || !company.fiscalConfig.enabled) {
      return { status: 'NOT_FISCALISED' };
    }

    const { tinNumber } = company;
    const deviceSerial = company.fiscalConfig.deviceSerial || undefined;

    // Local QR payload is an attempt only. It is not FDMS confirmation.
    const qrPayload = JSON.stringify({
      tin: tinNumber,
      total: invoicePayload.totalAmount,
      tax: invoicePayload.taxAmount,
      vat: invoicePayload.taxPercentage,
      net: invoicePayload.amountExcludingTax,
      ts: invoicePayload.createdAt ? new Date(invoicePayload.createdAt).toISOString() : new Date().toISOString(),
      inv: invoicePayload._id || undefined,
      dev: deviceSerial
    });

    return {
      qrContent: qrPayload,
      deviceSerial,
      status: 'NOT_FISCALISED',
      error: 'FDMS integration is not implemented; local QR is not a fiscal invoice'
    };
  } catch (e: any) {
    return { status: 'FISCALISATION_FAILURE', error: e?.message || 'Fiscalisation failed' };
  }
};



