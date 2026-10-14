import mongoose from 'mongoose';
import { Payment, IPayment } from './Payment';
import { Property, IProperty } from './Property';
import { Lease } from './Lease';
import { Tenant } from './Tenant';
import { Company, ICompany } from './Company';
import { MaintenanceRequest, IMaintenanceRequest } from './MaintenanceRequest';
import { ChartData } from './ChartData';
import { User, IUser } from './User';
import { PropertyOwner, IPropertyOwner } from './PropertyOwner';
import File from './File';
import { ChartOfAccount } from './ChartOfAccount';
import { JournalEntry } from './JournalEntry';
import { JournalLine } from './JournalLine';
import { VatRecord } from './VatRecord';
import { CompanyBalance } from './CompanyBalance';
import { BankAccount } from './BankAccount';
import { BankTransaction } from './BankTransaction';
import { MaintenanceJob } from './MaintenanceJob';
import DashboardKpiSnapshot from './DashboardKpiSnapshot';
import { OnboardingSession } from './OnboardingSession';
import { PaymentSession } from './PaymentSession';
import { AuditLog } from './AuditLog';
import { MaintenanceContractor } from './MaintenanceContractor';
import { MaintenanceWorkOrder } from './MaintenanceWorkOrder';
import { MaintenanceActivity } from './MaintenanceActivity';
import { MaintenanceAttachmentRecord } from './MaintenanceAttachment';
import { MaintenanceQuote } from './MaintenanceQuote';
import { MaintenanceVerification } from './MaintenanceVerification';
import { OwnerDocument } from './OwnerDocument';
import { OwnerBankingDetails } from './OwnerBankingDetails';
import { OwnerPreferences } from './OwnerPreferences';
import { OwnershipHistory } from './OwnershipHistory';
import { Plan } from './Plan';
import { PlatformInvoice } from './PlatformInvoice';
import { CashPayment } from './CashPayment';
import { SupportTicket } from './SupportTicket';
import { DutyRosterShift } from './DutyRosterShift';
import { AgentAvailability } from './AgentAvailability';
import { LeaveRequest } from './LeaveRequest';
import { PublicHoliday } from './PublicHoliday';
import { LandlordFinancialTransaction } from './LandlordFinancialTransaction';
import { AccountingEventLog } from './AccountingEventLog';
import { TransactionTaxSnapshot } from './TransactionTaxSnapshot';
import { TaxPeriod } from './TaxPeriod';
import { TaxRule } from './TaxRule';
import { IndividualTaxProfile } from './IndividualTaxProfile';
import { IndividualVatRecord } from './IndividualVatRecord';
import { IndividualRentalTaxRecord } from './IndividualRentalTaxRecord';
import { IndividualRentalTaxPayment } from './IndividualRentalTaxPayment';
import { IndividualIncomeTaxRecord } from './IndividualIncomeTaxRecord';
import { IndividualIncomeTaxAdjustment } from './IndividualIncomeTaxAdjustment';
import { IndividualIncomeTaxPayment } from './IndividualIncomeTaxPayment';
import { IndividualTaxEvidence } from './IndividualTaxEvidence';
import { IndividualTaxComplianceReview } from './IndividualTaxComplianceReview';
import { IndividualTaxPack } from './IndividualTaxPack';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableMongoConnectionError = (error: any): boolean => {
  const labels: Set<string> | undefined = error?.[Symbol.for('errorLabels')];
  const hasRetryLabel =
    (labels instanceof Set && (labels.has('ResetPool') || labels.has('RetryableWriteError'))) ||
    (Array.isArray(error?.errorLabels) &&
      error.errorLabels.some((l: string) => l === 'ResetPool' || l === 'RetryableWriteError'));
  const message = String(error?.message || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();

  return (
    hasRetryLabel ||
    name.includes('mongonetworkerror') ||
    (message.includes('connection') && message.includes('closed')) ||
    message.includes('timed out')
  );
};

const withTransientRetry = async <T>(operation: () => Promise<T>, retries = 2): Promise<T> => {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableMongoConnectionError(error)) {
        throw error;
      }
      await wait(400 * (attempt + 1));
    }
  }
  throw lastError;
};

// Query Optimization Functions
export const optimizePaymentQueries = {
  getPaymentsByDateRange: async (startDate: Date, endDate: Date, companyId: string) => {
    return Payment.find({
      paymentDate: { $gte: startDate, $lte: endDate },
      companyId
    })
      .lean()
      .select('amount paymentDate status paymentMethod')
      .sort({ paymentDate: -1 });
  },

  getActiveLeases: async (companyId: string) => {
    return Lease.find({ companyId, status: 'active' })
      .lean()
      .select('propertyId tenantId startDate endDate rentAmount')
      .populate('propertyId', 'name address')
      .populate('tenantId', 'firstName lastName');
  },

  getPropertyStatus: async (companyId: string) => {
    return Property.find({ companyId })
      .lean()
      .select('name status type occupancyRate')
      .sort({ occupancyRate: -1 });
  }
};

// Ensure indexes for all core models at startup.
// This is critical in environments where autoIndex is disabled.
export async function createIndexes() {
  try {
    // Ensure collections exist, create indexes, then log current index state.
    const models = [
      { model: User, name: 'User' },
      { model: Company, name: 'Company' },
      { model: Property, name: 'Property' },
      { model: Tenant, name: 'Tenant' },
      { model: Lease, name: 'Lease' },
      { model: Payment, name: 'Payment' },
      { model: MaintenanceRequest, name: 'MaintenanceRequest' },
      { model: ChartData, name: 'ChartData' },
      { model: PropertyOwner, name: 'PropertyOwner' },
      { model: File, name: 'File' },
      { model: ChartOfAccount, name: 'ChartOfAccount' },
      { model: JournalEntry, name: 'JournalEntry' },
      { model: JournalLine, name: 'JournalLine' },
      { model: VatRecord, name: 'VatRecord' },
      { model: CompanyBalance, name: 'CompanyBalance' },
      { model: BankAccount, name: 'BankAccount' },
      { model: BankTransaction, name: 'BankTransaction' },
      { model: MaintenanceJob, name: 'MaintenanceJob' },
      { model: DashboardKpiSnapshot, name: 'DashboardKpiSnapshot' },
      { model: OnboardingSession, name: 'OnboardingSession' },
      { model: PaymentSession, name: 'PaymentSession' },
      { model: AuditLog, name: 'AuditLog' },
      { model: MaintenanceContractor, name: 'MaintenanceContractor' },
      { model: MaintenanceWorkOrder, name: 'MaintenanceWorkOrder' },
      { model: MaintenanceActivity, name: 'MaintenanceActivity' },
      { model: MaintenanceAttachmentRecord, name: 'MaintenanceAttachmentRecord' },
      { model: MaintenanceQuote, name: 'MaintenanceQuote' },
      { model: MaintenanceVerification, name: 'MaintenanceVerification' },
      { model: OwnerDocument, name: 'OwnerDocument' },
      { model: OwnerBankingDetails, name: 'OwnerBankingDetails' },
      { model: OwnerPreferences, name: 'OwnerPreferences' },
      { model: OwnershipHistory, name: 'OwnershipHistory' },
      { model: Plan, name: 'Plan' },
      { model: PlatformInvoice, name: 'PlatformInvoice' },
      { model: CashPayment, name: 'CashPayment' },
      { model: SupportTicket, name: 'SupportTicket' },
      { model: DutyRosterShift, name: 'DutyRosterShift' },
      { model: AgentAvailability, name: 'AgentAvailability' },
      { model: LeaveRequest, name: 'LeaveRequest' },
      { model: PublicHoliday, name: 'PublicHoliday' },
      { model: LandlordFinancialTransaction, name: 'LandlordFinancialTransaction' },
      { model: AccountingEventLog, name: 'AccountingEventLog' },
      { model: TransactionTaxSnapshot, name: 'TransactionTaxSnapshot' },
      { model: TaxPeriod, name: 'TaxPeriod' },
      { model: TaxRule, name: 'TaxRule' },
      { model: IndividualTaxProfile, name: 'IndividualTaxProfile' },
      { model: IndividualVatRecord, name: 'IndividualVatRecord' },
      { model: IndividualRentalTaxRecord, name: 'IndividualRentalTaxRecord' },
      { model: IndividualRentalTaxPayment, name: 'IndividualRentalTaxPayment' },
      { model: IndividualIncomeTaxRecord, name: 'IndividualIncomeTaxRecord' },
      { model: IndividualIncomeTaxAdjustment, name: 'IndividualIncomeTaxAdjustment' },
      { model: IndividualIncomeTaxPayment, name: 'IndividualIncomeTaxPayment' },
      { model: IndividualTaxEvidence, name: 'IndividualTaxEvidence' },
      { model: IndividualTaxComplianceReview, name: 'IndividualTaxComplianceReview' },
      { model: IndividualTaxPack, name: 'IndividualTaxPack' },
    ];

    for (const { model, name } of models) {
      // Try to create the collection if it doesn't exist yet
      try {
        await withTransientRetry(() => model.createCollection());
      } catch (createErr: any) {
        // Ignore "namespace exists" errors (code 48) and proceed
        if (createErr && createErr.code !== 48) {
          console.warn(`Could not ensure collection for ${name}:`, createErr);
        }
      }

      // Create indexes declared in schemas (does not drop existing indexes).
      // Avoid throwing hard on duplicate-key/index-conflict issues so the app can still boot.
      try {
        await withTransientRetry(() => model.createIndexes());
      } catch (indexCreateErr: any) {
        const code = Number(indexCreateErr?.code);
        const message = String(indexCreateErr?.message || '');
        const isNonFatalIndexConflict =
          code === 85 || // IndexOptionsConflict
          code === 86 || // IndexKeySpecsConflict
          code === 11000 || // Duplicate key when creating unique index
          message.toLowerCase().includes('duplicate key') ||
          message.toLowerCase().includes('already exists');

        if (isNonFatalIndexConflict) {
          console.warn(`Non-fatal index creation issue for ${name}:`, message);
          if ((name === 'OnboardingSession' || name === 'PaymentSession') && (code === 85 || code === 86) && message.includes('idempotencyKey')) {
            console.warn(
              `${name} idempotencyKey uniqueness is not active. The existing index uses the same name without the requested unique option. Startup will not drop or recreate it.`
            );
          }
        } else {
          console.error(`Error creating indexes for ${name}:`, indexCreateErr);
        }
      }

      // Now attempt to read indexes, but ignore NamespaceNotFound (code 26)
      try {
        const indexes = await withTransientRetry(() => model.collection.indexes());
        console.log(`${name} indexes:`, indexes);
      } catch (error: any) {
        if (error && error.code === 26) {
          // Collection still does not exist; skip noisy error
          console.log(`${name} collection not found yet; skipping index check`);
        } else {
          console.error(`Error getting ${name} indexes:`, error);
        }
      }
    }

    console.log('All indexes verified successfully');
  } catch (error) {
    console.error('Error verifying indexes:', error);
    throw error;
  }
} 