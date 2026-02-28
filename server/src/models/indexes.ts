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
      { model: DashboardKpiSnapshot, name: 'DashboardKpiSnapshot' }
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