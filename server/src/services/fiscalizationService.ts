import mongoose from 'mongoose';
import { Company } from '../models/Company';

export interface FiscalData {
  qrContent?: string;
  fiscalNumber?: string;
  deviceSerial?: string;
  documentNumber?: string;
  signature?: string;
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
      return null;
    }

    const { tinNumber } = company;
    const deviceSerial = company.fiscalConfig.deviceSerial || undefined;

    // Placeholder implementation: construct a QR payload; replace with agent/FDMS call when available
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
      deviceSerial
    };
  } catch (e) {
    // Fail-open: if anything goes wrong, return null so invoice still saves
    return null;
  }
};



