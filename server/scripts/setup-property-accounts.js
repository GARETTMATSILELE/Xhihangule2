const mongoose = require('mongoose');
require('dotenv').config();

// Import models from compiled JavaScript files
const { Payment } = require('../dist/models/Payment');
const { Property } = require('../dist/models/Property');
const { User } = require('../dist/models/User');
const { accountingConnection } = require('../dist/config/database');

// Import PropertyAccount model to register the schema
require('../dist/models/PropertyAccount');

// Simple property account service for setup
class SetupPropertyAccountService {
  async getOrCreatePropertyAccount(propertyId) {
    try {
      const PropertyAccount = accountingConnection.model('PropertyAccount');
      let account = await PropertyAccount.findOne({ propertyId });
      
      if (!account) {
        // Get property details
        const property = await Property.findById(propertyId);
        if (!property) {
          throw new Error('Property not found');
        }

        // Get owner details
        let ownerName = 'Unknown Owner';
        if (property.ownerId) {
          const owner = await User.findById(property.ownerId);
          if (owner) {
            ownerName = `${owner.firstName} ${owner.lastName}`;
          }
        }

        // Create new account
        account = new PropertyAccount({
          propertyId: new mongoose.Types.ObjectId(propertyId),
          propertyName: property.name,
          propertyAddress: property.address,
          ownerId: property.ownerId,
          ownerName,
          transactions: [],
          ownerPayouts: [],
          runningBalance: 0,
          totalIncome: 0,
          totalExpenses: 0,
          totalOwnerPayouts: 0,
          isActive: true
        });

        await account.save();
        console.log(`✅ Created account for property: ${property.name}`);
      }

      return account;
    } catch (error) {
      console.error('Error in getOrCreatePropertyAccount:', error);
      throw error;
    }
  }

  async recordIncomeFromPayment(paymentId) {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'completed') {
        console.log(`Skipping income recording for payment ${paymentId} - status: ${payment.status}`);
        return;
      }

      // Get or create property account
      const account = await this.getOrCreatePropertyAccount(payment.propertyId.toString());
      
      // Check if income already recorded for this payment
      const existingTransaction = account.transactions.find(
        t => t.paymentId && t.paymentId.toString() === paymentId && t.type === 'income'
      );

      if (existingTransaction) {
        console.log(`Income already recorded for payment: ${paymentId}`);
        return;
      }

      // Calculate owner amount (income after commission)
      const ownerAmount = payment.commissionDetails?.ownerAmount || 0;
      
      if (ownerAmount <= 0) {
        console.warn(`Invalid owner amount for payment ${paymentId}: ${ownerAmount}`);
        return;
      }

      // Create income transaction (rental vs sale)
      const isSale = payment.paymentType === 'sale';
      const incomeTransaction = {
        type: 'income',
        amount: ownerAmount,
        date: payment.paymentDate || payment.createdAt,
        paymentId: new mongoose.Types.ObjectId(paymentId),
        description: isSale ? `Sale income - ${payment.referenceNumber}` : `Rental income - ${payment.referenceNumber}`,
        category: isSale ? 'sale_income' : 'rental_income',
        status: 'completed',
        processedBy: payment.processedBy,
        referenceNumber: payment.referenceNumber,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      account.transactions.push(incomeTransaction);
      await account.save();

      console.log(`Recorded income of ${ownerAmount} for property ${payment.propertyId} from payment ${paymentId}`);
    } catch (error) {
      console.error('Error recording income from payment:', error);
      throw error;
    }
  }
}

const setupService = new SetupPropertyAccountService();

async function setupPropertyAccounts() {
  try {
    console.log('🚀 Starting Property Account Setup...');
    
    // Connect to databases
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';
    await mongoose.connect(mongoUri);
    await accountingConnection.asPromise();
    
    console.log('✅ Connected to databases');
    
    // Get all properties
    const properties = await Property.find({});
    console.log(`📊 Found ${properties.length} properties`);
    
    // Get all completed rental payments
    const payments = await Payment.find({
      status: 'completed',
      paymentType: 'rental'
    });
    console.log(`💰 Found ${payments.length} completed rental payments`);
    
    let accountsCreated = 0;
    let paymentsSynced = 0;
    let errors = 0;
    
    // Create property accounts for all properties
    for (const property of properties) {
      try {
        const account = await setupService.getOrCreatePropertyAccount(property._id.toString());
        if (account.transactions.length === 0) {
          accountsCreated++;
        }
      } catch (error) {
        console.error(`❌ Error creating account for property ${property.name}:`, error.message);
        errors++;
      }
    }
    
    // Sync existing payments
    console.log('🔄 Syncing existing payments...');
    for (const payment of payments) {
      try {
        await setupService.recordIncomeFromPayment(payment._id.toString());
        paymentsSynced++;
        if (paymentsSynced % 10 === 0) {
          console.log(`📈 Synced ${paymentsSynced} payments...`);
        }
      } catch (error) {
        console.error(`❌ Error syncing payment ${payment._id}:`, error.message);
        errors++;
      }
    }
    
    // Summary
    console.log('\n📋 Setup Summary:');
    console.log(`   Properties processed: ${properties.length}`);
    console.log(`   New accounts created: ${accountsCreated}`);
    console.log(`   Payments synced: ${paymentsSynced}`);
    console.log(`   Errors encountered: ${errors}`);
    
    if (errors === 0) {
      console.log('🎉 Property Account Setup completed successfully!');
    } else {
      console.log('⚠️  Setup completed with some errors. Check logs above.');
    }
    
  } catch (error) {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    await accountingConnection.close();
    console.log('🔌 Disconnected from databases');
  }
}

async function validatePropertyAccounts() {
  try {
    console.log('🔍 Validating Property Accounts...');
    
    // Connect to databases
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';
    await mongoose.connect(mongoUri);
    await accountingConnection.asPromise();
    
    // Get all property accounts
    const PropertyAccount = accountingConnection.model('PropertyAccount');
    const accounts = await PropertyAccount.find({});
    
    console.log(`📊 Found ${accounts.length} property accounts`);
    
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalPayouts = 0;
    let totalBalance = 0;
    
    for (const account of accounts) {
      totalIncome += account.totalIncome;
      totalExpenses += account.totalExpenses;
      totalPayouts += account.totalOwnerPayouts;
      totalBalance += account.runningBalance;
      
      // Validate balance calculation
      const expectedBalance = account.totalIncome - account.totalExpenses - account.totalOwnerPayouts;
      if (Math.abs(account.runningBalance - expectedBalance) > 0.01) {
        console.warn(`⚠️  Balance mismatch for property ${account.propertyName}: expected ${expectedBalance}, got ${account.runningBalance}`);
      }
    }
    
    console.log('\n📋 Validation Summary:');
    console.log(`   Total Income: $${totalIncome.toFixed(2)}`);
    console.log(`   Total Expenses: $${totalExpenses.toFixed(2)}`);
    console.log(`   Total Payouts: $${totalPayouts.toFixed(2)}`);
    console.log(`   Total Balance: $${totalBalance.toFixed(2)}`);
    
    const calculatedBalance = totalIncome - totalExpenses - totalPayouts;
    console.log(`   Calculated Balance: $${calculatedBalance.toFixed(2)}`);
    
    if (Math.abs(totalBalance - calculatedBalance) < 0.01) {
      console.log('✅ Balance validation passed!');
    } else {
      console.log('❌ Balance validation failed!');
    }
    
  } catch (error) {
    console.error('💥 Validation failed:', error);
  } finally {
    await mongoose.disconnect();
    await accountingConnection.close();
  }
}

async function cleanupOrphanedAccounts() {
  try {
    console.log('🧹 Cleaning up orphaned property accounts...');
    
    // Connect to databases
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/property-management';
    await mongoose.connect(mongoUri);
    await accountingConnection.asPromise();
    
    // Get all property accounts
    const PropertyAccount = accountingConnection.model('PropertyAccount');
    const accounts = await PropertyAccount.find({});
    
    let orphanedCount = 0;
    
    for (const account of accounts) {
      // Check if property still exists
      const property = await Property.findById(account.propertyId);
      if (!property) {
        console.log(`🗑️  Removing orphaned account for property ${account.propertyId}`);
        await PropertyAccount.findByIdAndDelete(account._id);
        orphanedCount++;
      }
    }
    
    console.log(`✅ Cleaned up ${orphanedCount} orphaned accounts`);
    
  } catch (error) {
    console.error('💥 Cleanup failed:', error);
  } finally {
    await mongoose.disconnect();
    await accountingConnection.close();
  }
}

// Command line interface
const command = process.argv[2];

switch (command) {
  case 'setup':
    setupPropertyAccounts();
    break;
  case 'validate':
    validatePropertyAccounts();
    break;
  case 'cleanup':
    cleanupOrphanedAccounts();
    break;
  default:
    console.log('Usage: node setup-property-accounts.js [setup|validate|cleanup]');
    console.log('');
    console.log('Commands:');
    console.log('  setup    - Initialize property accounts and sync existing payments');
    console.log('  validate - Validate property account balances and data integrity');
    console.log('  cleanup  - Remove orphaned property accounts');
    process.exit(1);
} 