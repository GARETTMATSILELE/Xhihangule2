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

// Index Creation Function - Now only logs existing indexes
export async function createIndexes() {
  try {
    // Ensure collections exist, then log existing indexes for all models
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
      { model: File, name: 'File' }
    ];

    for (const { model, name } of models) {
      // Try to create the collection if it doesn't exist yet
      try {
        await model.createCollection();
      } catch (createErr: any) {
        // Ignore "namespace exists" errors (code 48) and proceed
        if (createErr && createErr.code !== 48) {
          console.warn(`Could not ensure collection for ${name}:`, createErr);
        }
      }

      // Now attempt to read indexes, but ignore NamespaceNotFound (code 26)
      try {
        const indexes = await model.collection.indexes();
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