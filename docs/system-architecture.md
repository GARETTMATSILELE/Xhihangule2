# System Architecture Documentation

## Overview

The Azure Property Management System is a full-stack web application built with modern technologies to provide comprehensive property management capabilities. The system follows a microservices-inspired architecture with clear separation of concerns between frontend and backend components.

## Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **UI Library**: Material-UI (MUI) v5
- **State Management**: React Context API + useState/useEffect
- **Routing**: React Router v6
- **HTTP Client**: Axios
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + MUI Theme

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Express-validator
- **Logging**: Winston
- **File Upload**: Multer + Azure Blob Storage

### Infrastructure
- **Hosting**: Azure App Service
- **Database**: MongoDB Atlas
- **Storage**: Azure Blob Storage
- **Monitoring**: Application Insights
- **Email**: SendGrid + Azure Logic Apps

## System Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │    │  Node.js API    │    │   MongoDB       │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │   Pages     │ │    │ │ Controllers │ │    │ │ Collections │ │
│ │ Components  │ │◄──►│ │ Services    │ │◄──►│ │ Documents   │ │
│ │ Services    │ │    │ │ Models      │ │    │ │ Indexes     │ │
│ │ Contexts    │ │    │ │ Middleware  │ │    │ └─────────────┘ │
│ └─────────────┘ │    │ └─────────────┘ │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Azure Blob      │    │ Azure App       │    │ Azure Logic     │
│ Storage         │    │ Service         │    │ Apps            │
│ (Documents)     │    │ (Hosting)       │    │ (Email/Workflow)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Frontend Architecture

### Directory Structure
```
client/src/
├── components/           # Reusable UI components
│   ├── common/          # Shared components (buttons, forms, etc.)
│   ├── layout/          # Layout components (header, sidebar, etc.)
│   └── forms/           # Form components
├── pages/               # Page components organized by role
│   ├── AccountantDashboard/
│   │   ├── PropertyAccountDetailPage.tsx    # Main accounting interface
│   │   ├── PropertyAccountsPage.tsx         # Account listing
│   │   ├── WrittenInvoicesPage.tsx          # Invoice management
│   │   ├── CommissionsPage.tsx              # Commission tracking
│   │   ├── TasksPage.tsx                    # Task management
│   │   ├── AccountantPaymentsPage.tsx       # Payment processing
│   │   ├── DashboardOverview.tsx            # Dashboard summary
│   │   ├── LevyPaymentsPage.tsx             # Levy payment management
│   │   ├── ReportsPage.tsx                  # Financial reporting
│   │   └── SettingsPage.tsx                 # Accountant settings
│   ├── AdminDashboard/
│   │   ├── AdminDashboard.tsx               # Admin main dashboard
│   │   ├── AdminLeasesPage.tsx              # Lease management
│   │   └── ...                              # Other admin pages
│   ├── AgentDashboard/
│   │   ├── AgentDashboard.tsx               # Agent main dashboard
│   │   └── ...                              # Other agent pages
│   └── ...                                  # Other role-based pages
├── services/            # API service layer
│   ├── propertyAccountService.ts    # Property accounting API
│   ├── paymentService.ts            # Payment processing API
│   ├── propertyService.ts           # Property management API
│   ├── authService.ts               # Authentication API
│   └── ...                          # Other service files
├── contexts/           # React contexts for state management
│   ├── AuthContext.tsx              # Authentication state
│   └── ...                          # Other contexts
├── hooks/             # Custom React hooks
├── types/             # TypeScript type definitions
├── utils/             # Utility functions
├── config/            # Configuration files
└── assets/            # Static assets
```

### Key Components

#### PropertyAccountDetailPage.tsx (724 lines)
The main interface for property account management with the following features:

- **Summary Cards**: Real-time display of balance, income, expenses, and payouts
- **Owner Information**: Property owner details and contact information
- **Action Buttons**: Add expense and create payout functionality
- **Tabbed Interface**: Organized data presentation
  - Transactions Tab: Complete transaction history with running balance
  - Owner Payouts Tab: Payout management with status updates
  - Summary Tab: Account overview and quick actions
- **Dialogs**: Modal forms for expense and payout creation
- **Status Management**: Visual indicators for transaction and payout status

#### Service Layer Architecture
```typescript
// Example service structure
class PropertyAccountService {
  // API communication methods
  async getPropertyAccount(propertyId: string): Promise<PropertyAccount>
  async addExpense(propertyId: string, expenseData: ExpenseData): Promise<PropertyAccount>
  async createOwnerPayout(propertyId: string, payoutData: PayoutData): Promise<{ account: PropertyAccount; payout: OwnerPayout }>
  
  // Utility methods
  calculateRunningBalance(transactions: Transaction[]): { transactions: Transaction[]; finalBalance: number }
  formatCurrency(amount: number, currency: string = 'USD'): string
  getTransactionTypeLabel(type: string): string
  getPaymentMethodLabel(method: string): string
}
```

### State Management
The application uses React Context API for global state management:

```typescript
// AuthContext example
interface AuthContextType {
  user: User | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
```

## Backend Architecture

### Directory Structure
```
server/src/
├── controllers/         # Request handlers
│   ├── propertyAccountController.ts    # Property accounting logic
│   ├── paymentController.ts            # Payment processing logic
│   ├── authController.ts               # Authentication logic
│   ├── propertyController.ts           # Property management logic
│   └── ...                             # Other controllers
├── models/             # MongoDB schemas
│   ├── PropertyAccount.ts              # Property account schema
│   ├── Payment.ts                      # Payment schema
│   ├── Property.ts                     # Property schema
│   ├── User.ts                         # User schema
│   └── ...                             # Other models
├── services/           # Business logic layer
│   ├── propertyAccountService.ts       # Property accounting business logic
│   ├── paymentService.ts               # Payment processing business logic
│   ├── authService.ts                  # Authentication business logic
│   └── ...                             # Other services
├── routes/             # API route definitions
│   ├── accountantRoutes.ts             # Accountant-specific routes
│   ├── paymentRoutes.ts                # Payment routes
│   ├── authRoutes.ts                   # Authentication routes
│   ├── propertyRoutes.ts               # Property routes
│   └── ...                             # Other route files
├── middleware/         # Express middleware
│   ├── auth.ts                         # Authentication middleware
│   ├── roles.ts                        # Role-based access control
│   ├── errorHandler.ts                 # Error handling middleware
│   └── ...                             # Other middleware
├── config/             # Configuration files
│   ├── database.ts                     # Database configuration
│   └── ...                             # Other config files
├── utils/              # Utility functions
│   ├── logger.ts                       # Logging utilities
│   └── ...                             # Other utilities
├── types/              # TypeScript type definitions
├── app.ts              # Express application setup
└── index.ts            # Application entry point
```

### Key Components

#### PropertyAccountController.ts (518 lines)
Handles HTTP requests for property accounting operations:

```typescript
export const getPropertyAccount = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const account = await propertyAccountService.getOrCreatePropertyAccount(propertyId);
    res.json({ success: true, data: account });
  } catch (error) {
    // Error handling
  }
};
```

#### PropertyAccountService.ts (538 lines)
Singleton service implementing business logic:

```typescript
export class PropertyAccountService {
  private static instance: PropertyAccountService;

  public static getInstance(): PropertyAccountService {
    if (!PropertyAccountService.instance) {
      PropertyAccountService.instance = new PropertyAccountService();
    }
    return PropertyAccountService.instance;
  }

  async getOrCreatePropertyAccount(propertyId: string): Promise<IPropertyAccount>
  async addExpense(propertyId: string, expenseData: ExpenseData): Promise<IPropertyAccount>
  async createOwnerPayout(propertyId: string, payoutData: PayoutData): Promise<{ account: IPropertyAccount; payout: OwnerPayout }>
  async updatePayoutStatus(propertyId: string, payoutId: string, status: string): Promise<IPropertyAccount>
}
```

### API Structure

#### Authentication Routes
```
POST /api/auth/login          # User login
POST /api/auth/register       # User registration
POST /api/auth/logout         # User logout
GET /api/auth/me              # Get current user
```

#### Property Accounting Routes
```
GET /api/accountant/property-accounts                    # Get all property accounts
GET /api/accountant/property-accounts/:propertyId        # Get specific property account
GET /api/accountant/property-accounts/:propertyId/transactions  # Get transaction history
POST /api/accountant/property-accounts/:propertyId/expense      # Add expense
POST /api/accountant/property-accounts/:propertyId/payout       # Create owner payout
PUT /api/accountant/property-accounts/:propertyId/payout/:payoutId/status  # Update payout status
GET /api/accountant/property-accounts/:propertyId/payouts       # Get payout history
POST /api/accountant/property-accounts/sync                     # Sync property accounts
```

#### Property Management Routes
```
GET /api/properties           # Get all properties
POST /api/properties          # Create property
PUT /api/properties/:id       # Update property
DELETE /api/properties/:id    # Delete property
```

#### Payment Processing Routes
```
GET /api/payments             # Get all payments
POST /api/payments            # Create payment
PUT /api/payments/:id/status  # Update payment status
GET /api/payments/:id         # Get payment details
```

## Database Schema

### Property Account Collection
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

### Transaction Subdocument
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

### Owner Payout Subdocument
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

## Security Architecture

### Authentication & Authorization
- **JWT Tokens**: Secure token-based authentication
- **Role-based Access Control**: Admin, Accountant, Agent, Property Owner roles
- **Company Isolation**: Multi-tenant data isolation
- **Session Management**: Secure session handling

### Data Protection
- **Input Validation**: Comprehensive input sanitization
- **SQL Injection Prevention**: Parameterized queries with Mongoose
- **XSS Protection**: Content Security Policy headers
- **CSRF Protection**: Cross-Site Request Forgery prevention

### API Security
- **Rate Limiting**: Request rate limiting
- **CORS Configuration**: Cross-Origin Resource Sharing setup
- **HTTPS Enforcement**: Secure communication
- **Error Handling**: Secure error responses

## Performance Optimizations

### Database Optimizations
```typescript
// Indexes for optimal query performance
PropertyAccountSchema.index({ propertyId: 1 });
PropertyAccountSchema.index({ ownerId: 1 });
PropertyAccountSchema.index({ 'transactions.date': -1 });
PropertyAccountSchema.index({ 'ownerPayouts.date': -1 });
PropertyAccountSchema.index({ runningBalance: 1 });
```

### Frontend Optimizations
- **Code Splitting**: Route-based code splitting
- **Lazy Loading**: Component lazy loading
- **Caching**: API response caching
- **Optimistic Updates**: Immediate UI feedback

### Backend Optimizations
- **Connection Pooling**: Database connection management
- **Query Optimization**: Efficient MongoDB queries
- **Caching**: Redis caching for frequently accessed data
- **Compression**: Response compression

## Monitoring & Logging

### Application Monitoring
- **Application Insights**: Azure monitoring and analytics
- **Custom Logging**: Winston-based structured logging
- **Performance Metrics**: Database query performance tracking
- **Error Tracking**: Comprehensive error monitoring

### Business Metrics
- **Transaction Volume**: Number of transactions processed
- **Payment Success Rates**: Payment processing success metrics
- **User Activity**: User engagement and activity tracking
- **System Health**: Application health and availability

## Deployment Architecture

### Development Environment
- **Local Development**: Docker containers for local development
- **Hot Reloading**: Frontend and backend hot reloading
- **Environment Variables**: Configuration management
- **Database Seeding**: Test data population

### Production Environment
- **Azure App Service**: Web application hosting
- **MongoDB Atlas**: Cloud database hosting
- **Azure Blob Storage**: Document storage
- **CDN**: Content delivery network for static assets

### CI/CD Pipeline
- **GitHub Actions**: Automated deployment workflows
- **Environment Promotion**: Dev → Staging → Production
- **Automated Testing**: Unit, integration, and E2E tests
- **Rollback Capability**: Quick rollback to previous versions

## Scalability Considerations

### Horizontal Scaling
- **Load Balancing**: Azure Application Gateway
- **Database Sharding**: MongoDB sharding for large datasets
- **Microservices**: Potential migration to microservices architecture
- **Caching Layer**: Redis for session and data caching

### Vertical Scaling
- **Resource Optimization**: Memory and CPU optimization
- **Database Optimization**: Query optimization and indexing
- **Code Optimization**: Performance-critical code optimization
- **Infrastructure Scaling**: Azure auto-scaling capabilities

## Future Architecture Enhancements

### Planned Improvements
- **Microservices Migration**: Breaking down monolithic backend
- **Event-Driven Architecture**: Message queues for async processing
- **GraphQL API**: Flexible API querying
- **Real-time Features**: WebSocket integration for live updates

### Technology Upgrades
- **React 19**: Latest React features and performance improvements
- **Node.js 20+**: Latest Node.js LTS version
- **MongoDB 7+**: Latest MongoDB features
- **TypeScript 5+**: Latest TypeScript features

## Conclusion

The Azure Property Management System follows modern web application architecture patterns with clear separation of concerns, scalable design, and comprehensive security measures. The modular architecture allows for easy maintenance and future enhancements while providing a robust foundation for property management operations. 