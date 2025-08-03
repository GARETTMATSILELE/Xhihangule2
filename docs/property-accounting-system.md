# Property Accounting System

## Overview

The Property Accounting System is a comprehensive solution for managing property finances in real-time. It automatically tracks rental income, manages expenses, and handles owner payouts with full audit trails and error prevention.

## Key Features

### 1. Real-time Income Tracking
- **Automatic Recording**: Rental payments are automatically recorded as income in property accounts
- **Commission Calculation**: Owner amounts are calculated after deducting commissions
- **Payment Integration**: Seamless integration with existing payment system

### 2. Expense Management
- **Categorized Expenses**: Support for different expense categories (repair, maintenance, utilities, etc.)
- **Balance Validation**: Prevents expenses that exceed available balance
- **Audit Trail**: Complete transaction history with timestamps and user tracking

### 3. Owner Payout System
- **Secure Payments**: Multiple payment methods (bank transfer, cash, mobile money, check)
- **Status Management**: Track payout status (pending, completed, failed, cancelled)
- **Balance Protection**: Prevents payouts exceeding available balance
- **Document Generation**: Automatic generation of payment requests and acknowledgements

### 4. Comprehensive Reporting
- **Real-time Balance**: Current balance calculation
- **Transaction History**: Complete audit trail of all transactions
- **Summary Statistics**: Total income, expenses, and payouts
- **Date Tracking**: Last income, expense, and payout dates

## Database Schema

### PropertyAccount Model

```typescript
interface IPropertyAccount {
  propertyId: ObjectId;
  propertyName?: string;
  propertyAddress?: string;
  ownerId?: ObjectId;
  ownerName?: string;
  transactions: Transaction[];
  ownerPayouts: OwnerPayout[];
  runningBalance: number;
  totalIncome: number;
  totalExpenses: number;
  totalOwnerPayouts: number;
  lastIncomeDate?: Date;
  lastExpenseDate?: Date;
  lastPayoutDate?: Date;
  isActive: boolean;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Transaction Model

```typescript
interface Transaction {
  type: 'income' | 'expense' | 'owner_payout' | 'repair' | 'maintenance' | 'other';
  amount: number;
  date: Date;
  paymentId?: ObjectId;
  description: string;
  category?: string;
  recipientId?: ObjectId | string;
  recipientType?: 'owner' | 'contractor' | 'tenant' | 'other';
  referenceNumber?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processedBy?: ObjectId;
  notes?: string;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### OwnerPayout Model

```typescript
interface OwnerPayout {
  amount: number;
  date: Date;
  paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
  referenceNumber: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processedBy: ObjectId;
  recipientId: ObjectId;
  recipientName: string;
  recipientBankDetails?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  };
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## API Endpoints

### Property Account Management

```
GET /api/accountant/property-accounts
GET /api/accountant/property-accounts/:propertyId
GET /api/accountant/property-accounts/:propertyId/transactions
POST /api/accountant/property-accounts/:propertyId/expense
POST /api/accountant/property-accounts/:propertyId/payout
PUT /api/accountant/property-accounts/:propertyId/payout/:payoutId/status
GET /api/accountant/property-accounts/:propertyId/payouts
POST /api/accountant/property-accounts/sync
```

### Document Generation

```
GET /api/accountant/property-accounts/:propertyId/payout/:payoutId/payment-request
GET /api/accountant/property-accounts/:propertyId/payout/:payoutId/acknowledgement
```

## Implementation Details

### 1. Service Layer Architecture

The system uses a singleton service pattern for consistent state management:

```typescript
class PropertyAccountService {
  private static instance: PropertyAccountService;
  
  public static getInstance(): PropertyAccountService {
    if (!PropertyAccountService.instance) {
      PropertyAccountService.instance = new PropertyAccountService();
    }
    return PropertyAccountService.instance;
  }
}
```

### 2. Transaction Safety

All operations use MongoDB transactions to ensure data consistency:

```typescript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // Perform operations
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

### 3. Automatic Income Recording

When payments are created, income is automatically recorded:

```typescript
// In payment controller
await propertyAccountService.recordIncomeFromPayment(payment._id.toString());
```

### 4. Balance Validation

All expense and payout operations validate available balance:

```typescript
if (account.runningBalance < amount) {
  throw new AppError('Insufficient balance for this operation', 400);
}
```

### 5. Pre-save Middleware

Automatic calculation of totals and balances:

```typescript
PropertyAccountSchema.pre('save', function(next) {
  this.totalIncome = this.transactions
    .filter(t => t.type === 'income' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
  
  this.runningBalance = this.totalIncome - this.totalExpenses - this.totalOwnerPayouts;
  next();
});
```

## Frontend Implementation

### 1. Service Layer

```typescript
class PropertyAccountService {
  async getPropertyAccount(propertyId: string): Promise<PropertyAccount>
  async addExpense(propertyId: string, expenseData: ExpenseData): Promise<PropertyAccount>
  async createOwnerPayout(propertyId: string, payoutData: PayoutData): Promise<{ account: PropertyAccount; payout: OwnerPayout }>
  async updatePayoutStatus(propertyId: string, payoutId: string, status: string): Promise<PropertyAccount>
}
```

### 2. Component Structure

- **PropertyAccountDetailPage**: Main interface with tabs for transactions, payouts, and summary
- **Transaction Tables**: Detailed transaction history with running balance
- **Payout Management**: Create and manage owner payouts
- **Summary Cards**: Real-time financial overview

### 3. Real-time Updates

The interface automatically refreshes when operations are completed:

```typescript
const updatedAccount = await propertyAccountService.addExpense(propertyId, expenseData);
setAccount(updatedAccount);
```

## Error Handling

### 1. Validation Errors

- Amount validation (must be positive)
- Balance validation (insufficient funds)
- Required field validation
- Status validation for payouts

### 2. Database Errors

- Transaction rollback on failures
- Graceful handling of connection issues
- Retry mechanisms for critical operations

### 3. User Feedback

- Clear error messages
- Success confirmations
- Loading states during operations

## Security Features

### 1. Authentication

- All endpoints require accountant role
- User session validation
- Company-based access control

### 2. Data Validation

- Input sanitization
- Type checking
- Business rule validation

### 3. Audit Trail

- All operations logged with user and timestamp
- Complete transaction history
- Immutable transaction records

## Performance Optimizations

### 1. Database Indexes

```typescript
PropertyAccountSchema.index({ propertyId: 1 });
PropertyAccountSchema.index({ ownerId: 1 });
PropertyAccountSchema.index({ 'transactions.date': -1 });
PropertyAccountSchema.index({ 'ownerPayouts.date': -1 });
PropertyAccountSchema.index({ runningBalance: 1 });
```

### 2. Caching Strategy

- Property account data cached in frontend
- Optimistic updates for better UX
- Background sync for data consistency

### 3. Batch Operations

- Bulk sync operations for historical data
- Efficient transaction processing
- Minimal database round trips

## Monitoring and Logging

### 1. Application Logs

```typescript
logger.info(`Recorded income of ${ownerAmount} for property ${propertyId}`);
logger.error('Error recording income from payment:', error);
```

### 2. Performance Metrics

- Transaction processing time
- Database query performance
- Error rates and types

### 3. Business Metrics

- Total property accounts
- Average transaction volume
- Payout success rates

## Deployment Considerations

### 1. Database Migration

- Schema updates for existing data
- Data migration scripts
- Backward compatibility

### 2. Environment Configuration

- Database connection settings
- Logging configuration
- Error reporting setup

### 3. Monitoring Setup

- Health checks for critical endpoints
- Database connection monitoring
- Performance alerting

## Testing Strategy

### 1. Unit Tests

- Service layer testing
- Model validation testing
- Utility function testing

### 2. Integration Tests

- API endpoint testing
- Database transaction testing
- Payment integration testing

### 3. End-to-End Tests

- Complete user workflows
- Error scenario testing
- Performance testing

## Future Enhancements

### 1. Advanced Features

- Multi-currency support
- Tax calculation and reporting
- Automated reconciliation
- Bank statement import

### 2. Integration Opportunities

- Accounting software integration
- Banking API integration
- Document management system
- Mobile app support

### 3. Analytics and Reporting

- Financial dashboards
- Trend analysis
- Predictive analytics
- Custom report generation

## Conclusion

The Property Accounting System provides a robust, scalable solution for property financial management with comprehensive error handling, real-time updates, and full audit trails. The system ensures data integrity while providing an intuitive user experience for accountants and property managers. 