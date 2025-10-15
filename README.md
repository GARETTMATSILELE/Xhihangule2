# Azure Property Management System

A comprehensive full-stack property management solution built with React, Node.js, and Azure services, featuring advanced property accounting, payment processing, and financial management capabilities.

## Architecture Overview

- **Frontend**: React 18 with TypeScript and Material-UI
- **Backend**: Node.js with Express and TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT-based authentication with role-based access control
- **Storage**: Azure Blob Storage for document management
- **Monitoring**: Application Insights and custom logging
- **Email Automation**: Azure Logic Apps with SendGrid integration

## Azure Services Used

- Azure App Service (Web App hosting)
- Azure SQL Database (Main database)
- Azure Blob Storage (Document management)
- Azure Logic Apps (Workflow automation)
- Application Insights (Monitoring and analytics)
- Azure Key Vault (Secret management)
- Azure Active Directory (Authentication)

## Prerequisites

- Node.js 18+ and npm
- MongoDB (local or cloud)
- Azure CLI
- Azure subscription
- Visual Studio Code or similar IDE

## Project Structure

```
├── client/                    # React frontend application
│   ├── public/               # Static files
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/           # Page components
│   │   │   ├── AccountantDashboard/  # Property accounting features
│   │   │   ├── AdminDashboard/       # Admin management
│   │   │   ├── AgentDashboard/       # Agent features
│   │   │   └── ...                  # Other role-based pages
│   │   ├── services/        # API service layer
│   │   ├── contexts/        # React contexts
│   │   ├── hooks/          # Custom React hooks
│   │   ├── types/          # TypeScript type definitions
│   │   └── utils/          # Utility functions
│   └── package.json
├── server/                   # Backend Node.js application
│   ├── src/
│   │   ├── controllers/     # Request handlers
│   │   ├── models/         # MongoDB schemas
│   │   ├── services/       # Business logic
│   │   ├── routes/         # API route definitions
│   │   ├── middleware/     # Express middleware
│   │   ├── config/         # Configuration files
│   │   └── utils/          # Utility functions
│   └── package.json
├── docs/                    # Documentation
└── infrastructure/          # Azure infrastructure as code
```

## Development Setup

### Backend Setup
```bash
cd server
npm install
npm run dev
```

### Frontend Setup
```bash
cd client
npm install
npm start
```

## Environment Variables

Create a `.env` file in the server directory with:

```
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
AZURE_STORAGE_CONNECTION_STRING=your_azure_storage_connection_string

# Email (choose one)
# If using SMTP (default in-app nodemailer):
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM="Your App <no-reply@yourdomain.com>"

# Frontend base URL for password reset links
APP_BASE_URL=http://localhost:3000
```

For the client, create a `.env` file with:

```
REACT_APP_API_URL=http://localhost:5000
REACT_APP_AUTH_ENABLED=true
```

## Core Features

### 1. Property Accounting System
- **Real-time Financial Tracking**: Automatic income recording from rental payments
- **Expense Management**: Categorized expense tracking with balance validation
- **Owner Payout System**: Secure payment processing with multiple payment methods
- **Comprehensive Reporting**: Real-time balance, transaction history, and financial summaries
- **Audit Trail**: Complete transaction history with timestamps and user tracking

### 2. User Management & Authentication
- **Role-based Access Control**: Admin, Accountant, Agent, and Property Owner roles
- **Company-based Isolation**: Multi-tenant architecture with company-specific data
- **JWT Authentication**: Secure token-based authentication
- **User Profile Management**: Comprehensive user profile and settings

### 3. Property Management
- **Property CRUD Operations**: Complete property lifecycle management
- **Owner Management**: Property owner registration and management
- **Tenant Management**: Tenant registration and lease management
- **Document Management**: Secure document storage and categorization

### 4. Payment Processing
- **Rent Collection**: Automated rent collection and tracking
- **Payment Methods**: Multiple payment method support
- **Commission Calculation**: Automatic commission calculations for agents
- **Payment Status Tracking**: Real-time payment status updates

### 5. Maintenance & Communication
- **Maintenance Requests**: Complete maintenance request lifecycle
- **Communication System**: Integrated messaging and notifications
- **File Management**: Secure file upload and storage
- **Reporting**: Comprehensive reporting and analytics

## API Endpoints

### Authentication
```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/logout
GET /api/auth/me
POST /api/auth/forgot-password
POST /api/auth/reset-password
```

### Property Accounting
```
GET /api/accountant/property-accounts
GET /api/accountant/property-accounts/:propertyId
POST /api/accountant/property-accounts/:propertyId/expense
POST /api/accountant/property-accounts/:propertyId/payout
PUT /api/accountant/property-accounts/:propertyId/payout/:payoutId/status
```

### Property Management
```
GET /api/properties
POST /api/properties
PUT /api/properties/:id
DELETE /api/properties/:id
```

### Payment Processing
```
GET /api/payments
POST /api/payments
PUT /api/payments/:id/status
GET /api/payments/:id
```

## Database Schema

### Property Account Model
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

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-based Access Control**: Granular permissions based on user roles
- **Input Validation**: Comprehensive input sanitization and validation
- **Data Encryption**: Encryption at rest and in transit
- **Audit Logging**: Complete audit trail for all operations
- **Company Isolation**: Multi-tenant data isolation

## Password Reset (Forgot/Reset)

The app supports secure password resets via email.

- Request: `POST /api/auth/forgot-password` with `{ email }`. Always returns a generic success message to prevent account enumeration.
- Email: Generates a one-time token (15-minute expiry) and emails a link to `APP_BASE_URL/reset-password?token=...&email=...`.
- Reset: `POST /api/auth/reset-password` with `{ token, email, password }` to set a new password and invalidate the token.

Setup:
- Configure SMTP env vars (see Environment Variables).
- Ensure `APP_BASE_URL` points to your frontend (e.g., `http://localhost:3000`).

Frontend routes:
- `/forgot-password`: enter email to request a reset link
- `/reset-password`: set new password using token link

## Performance Optimizations

- **Database Indexing**: Optimized MongoDB indexes for query performance
- **Caching Strategy**: Frontend caching for improved user experience
- **Connection Pooling**: Efficient database connection management
- **Lazy Loading**: Component and route-based code splitting
- **Optimistic Updates**: Immediate UI feedback for better UX

## Monitoring and Logging

- **Application Logs**: Structured logging with different log levels
- **Performance Metrics**: Database query performance and API response times
- **Error Tracking**: Comprehensive error handling and reporting
- **Business Metrics**: Key performance indicators and analytics

## Deployment

The application can be deployed using:

1. **Azure App Service**: For both frontend and backend
2. **Azure DevOps**: CI/CD pipeline automation
3. **GitHub Actions**: Automated deployment workflows
4. **Docker**: Containerized deployment

## Testing Strategy

- **Unit Tests**: Component and service-level testing
- **Integration Tests**: API endpoint testing
- **End-to-End Tests**: Complete user workflow testing
- **Performance Tests**: Load and stress testing

## Contributing

Please read CONTRIBUTING.md for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For technical support or questions, please contact the development team or create an issue in the project repository. 