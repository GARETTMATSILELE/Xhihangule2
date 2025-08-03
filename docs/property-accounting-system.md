# Property Accounting System

## Overview

The Property Accounting System is a comprehensive real-time financial management solution for property management companies. It automatically tracks rental income, manages expenses, and handles owner payouts with full audit trails and error prevention. The system is built with React frontend and Node.js backend, using MongoDB for data persistence.

## Key Features

### 1. Real-time Income Tracking
- **Automatic Recording**: Rental payments are automatically recorded as income in property accounts
- **Commission Calculation**: Owner amounts are calculated after deducting commissions
- **Payment Integration**: Seamless integration with existing payment system
- **Balance Recalculation**: Automatic balance updates when payments are processed

### 2. Expense Management
- **Categorized Expenses**: Support for different expense categories (repair, maintenance, utilities, general, other)
- **Balance Validation**: Prevents expenses that exceed available balance
- **Audit Trail**: Complete transaction history with timestamps and user tracking
- **Real-time Updates**: Immediate UI updates when expenses are added

### 3. Owner Payout System
- **Secure Payments**: Multiple payment methods (bank transfer, cash, mobile money, check)
- **Status Management**: Track payout status (pending, completed, failed, cancelled)
- **Balance Protection**: Prevents payouts exceeding available balance
- **Document Generation**: Automatic generation of payment requests and acknowledgements
- **Status Updates**: Real-time status updates with visual indicators

### 4. Comprehensive Reporting
- **Real-time Balance**: Current balance calculation with running balance tracking
- **Transaction History**: Complete audit trail of all transactions
- **Summary Statistics**: Total income, expenses, and payouts
- **Date Tracking**: Last income, expense, and payout dates
- **Visual Indicators**: Color-coded transaction types and status indicators

## System Architecture

### Frontend (React + TypeScript)

#### Component Structure
```
PropertyAccountDetailPage/
├── Summary Cards (Balance, Income, Expenses, Payouts)
├── Owner Information Card
├── Action Buttons (Add Expense, Pay Owner)
├── Tabbed Interface
│   ├── Transactions Tab
│   │   └── Transaction Table with running balance
│   ├── Owner Payouts Tab
│   │   └── Payout Table with status management
│   └── Summary Tab
│       └── Account summary and quick actions
└── Dialogs
    ├── Add Expense Dialog
    └── Create Payout Dialog
```

#### Key Components

**PropertyAccountDetailPage.tsx** (724 lines)
- Main interface for property account management
- Tabbed interface for transactions, payouts, and summary
- Real-time balance calculation and display
- Expense and payout creation dialogs
- Status management for payouts

**PropertyAccountService.ts** (317 lines)
- Frontend service layer for API communication
- Data formatting and utility functions
- Running balance calculation
- Currency formatting and status helpers

### Backend (Node.js + Express + MongoDB)

#### API Structure
```
/api/accountant/property-accounts/
├── GET / - Get all company property accounts
├── GET /:propertyId - Get specific property account
├── GET /:propertyId/transactions - Get transaction history
├── POST /:propertyId/expense - Add expense
├── POST /:propertyId/payout - Create owner payout
├── PUT /:propertyId/payout/:payoutId/status - Update payout status
├── GET /:propertyId/payouts - Get payout history
├── POST /sync - Sync property accounts with payments
├── GET /:propertyId/payout/:payoutId/payment-request - Generate payment request
└── GET /:propertyId/payout/:payoutId/acknowledgement - Generate acknowledgement
```

#### Service Layer

**PropertyAccountService.ts** (538 lines)
- Singleton service pattern for consistent state management
- MongoDB transaction safety with session management
- Automatic income recording from payments
- Balance validation and recalculation
- Document generation for payouts

**PropertyAccountController.ts** (518 lines)
- Request handling and validation
- Error handling with custom AppError class
- Response formatting and status codes
- Authentication and authorization checks

## Database Schema

### PropertyAccount Model

```typescript
interface IPropertyAccount extends Document {
  propertyId: Types.ObjectId;
  propertyName?: string;
  propertyAddress?: string;
  ownerId?: Types.ObjectId;
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
  _id?: Types.ObjectId;
  type: 'income' | 'expense' | 'owner_payout' | 'repair' | 'maintenance' | 'other';
  amount: number;
  date: Date;
  paymentId?: Types.ObjectId;
  description: string;
  category?: string;
  recipientId?: Types.ObjectId | string;
  recipientType?: 'owner' | 'contractor' | 'tenant' | 'other';
  referenceNumber?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processedBy?: Types.ObjectId;
  notes?: string;
  attachments?: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### OwnerPayout Model

```typescript
interface OwnerPayout {
  _id?: Types.ObjectId;
  amount: number;
  date: Date;
  paymentMethod: 'bank_transfer' | 'cash' | 'mobile_money' | 'check';
  referenceNumber: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  processedBy: Types.ObjectId;
  recipientId: Types.ObjectId;
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
  calculateRunningBalance(transactions: Transaction[]): { transactions: Transaction[]; finalBalance: number }
  formatCurrency(amount: number, currency: string = 'USD'): string
  getTransactionTypeLabel(type: string): string
  getPaymentMethodLabel(method: string): string
}
```

### 2. Component Structure

- **PropertyAccountDetailPage**: Main interface with tabs for transactions, payouts, and summary
- **Transaction Tables**: Detailed transaction history with running balance
- **Payout Management**: Create and manage owner payouts with status updates
- **Summary Cards**: Real-time financial overview with color-coded indicators

### 3. Real-time Updates

The interface automatically refreshes when operations are completed:

```typescript
const updatedAccount = await propertyAccountService.addExpense(propertyId, expenseData);
setAccount(updatedAccount);
```

### 4. UI Features

- **Material-UI Components**: Modern, responsive design
- **Tabbed Interface**: Organized data presentation
- **Dialog Forms**: Modal forms for data entry
- **Status Icons**: Visual indicators for transaction and payout status
- **Color Coding**: Green for income, red for expenses, blue for payouts
- **Loading States**: Spinner indicators during operations

## Error Handling

### 1. Validation Errors

- Amount validation (must be positive)
- Balance validation (insufficient funds)
- Required field validation
- Status validation for payouts
- Date validation for transactions

### 2. Database Errors

- Transaction rollback on failures
- Graceful handling of connection issues
- Retry mechanisms for critical operations
- Detailed error logging

### 3. User Feedback

- Clear error messages with Alert components
- Success confirmations
- Loading states during operations
- Form validation with helper text

## Security Features

### 1. Authentication

- All endpoints require accountant role
- User session validation
- Company-based access control
- JWT token validation

### 2. Data Validation

- Input sanitization
- Type checking with TypeScript
- Business rule validation
- SQL injection prevention

### 3. Audit Trail

- All operations logged with user and timestamp
- Complete transaction history
- Immutable transaction records
- User action tracking

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
- Local state management

### 3. Batch Operations

- Bulk sync operations for historical data
- Efficient transaction processing
- Minimal database round trips
- Optimized queries

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
- API response times

### 3. Business Metrics

- Total property accounts
- Average transaction volume
- Payout success rates
- Balance accuracy

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

## Deployment Considerations

### 1. Database Migration

- Schema updates for existing data
- Data migration scripts
- Backward compatibility
- Index optimization

### 2. Environment Configuration

- Database connection settings
- Logging configuration
- Error reporting setup
- Azure service configuration

### 3. Monitoring Setup

- Health checks for critical endpoints
- Database connection monitoring
- Performance alerting
- Error tracking

## Testing Strategy

### 1. Unit Tests

- Service layer testing
- Model validation testing
- Utility function testing
- Component testing

### 2. Integration Tests

- API endpoint testing
- Database transaction testing
- Payment integration testing
- Authentication testing

### 3. End-to-End Tests

- Complete user workflows
- Error scenario testing
- Performance testing
- Cross-browser testing

## Future Enhancements

### 1. Advanced Features

- Multi-currency support
- Tax calculation and reporting
- Automated reconciliation
- Bank statement import
- Financial forecasting

### 2. Integration Opportunities

- Accounting software integration (QuickBooks, Xero)
- Banking API integration
- Document management system
- Mobile app support
- Email automation

### 3. Analytics and Reporting

- Financial dashboards
- Trend analysis
- Predictive analytics
- Custom report generation
- Export capabilities (PDF, Excel)

## Conclusion

The Property Accounting System provides a robust, scalable solution for property financial management with comprehensive error handling, real-time updates, and full audit trails. The system ensures data integrity while providing an intuitive user experience for accountants and property managers. The modular architecture allows for easy extension and maintenance, while the comprehensive testing strategy ensures reliability and performance. 