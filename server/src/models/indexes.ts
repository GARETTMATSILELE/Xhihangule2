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

// Helper function to listen for indexes
const listenForIndexes = (collection: mongoose.Collection, modelName: string) => {
  collection.indexes().then(indexes => {
    console.log(`${modelName} indexes:`, indexes);
  }).catch(error => {
    console.error(`Error getting ${modelName} indexes:`, error);
  });
};

// Listen for indexes for all models
listenForIndexes(Payment.collection, 'Payment');
listenForIndexes(Property.collection, 'Property');
listenForIndexes(Lease.collection, 'Lease');
listenForIndexes(Tenant.collection, 'Tenant');
listenForIndexes(Company.collection, 'Company');
listenForIndexes(MaintenanceRequest.collection, 'MaintenanceRequest');
listenForIndexes(ChartData.collection, 'ChartData');
listenForIndexes(User.collection, 'User');
listenForIndexes(PropertyOwner.collection, 'PropertyOwner');
listenForIndexes(File.collection, 'File');

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
    // Log existing indexes for all models
    const models = [
      { collection: User.collection, name: 'User' },
      { collection: Company.collection, name: 'Company' },
      { collection: Property.collection, name: 'Property' },
      { collection: Tenant.collection, name: 'Tenant' },
      { collection: Lease.collection, name: 'Lease' },
      { collection: Payment.collection, name: 'Payment' },
      { collection: MaintenanceRequest.collection, name: 'MaintenanceRequest' },
      { collection: ChartData.collection, name: 'ChartData' },
      { collection: PropertyOwner.collection, name: 'PropertyOwner' },
      { collection: File.collection, name: 'File' }
    ];

    for (const model of models) {
      const indexes = await model.collection.indexes();
      console.log(`${model.name} indexes:`, indexes);
    }

    console.log('All indexes verified successfully');
  } catch (error) {
    console.error('Error verifying indexes:', error);
    throw error;
  }
} 