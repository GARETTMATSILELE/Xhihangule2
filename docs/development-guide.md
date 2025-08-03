# Development Guide

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- MongoDB (local or cloud)
- Git
- VS Code (recommended)

### Setup
```bash
# Clone repository
git clone <repository-url>
cd property-management-system

# Install dependencies
cd server && npm install
cd ../client && npm install

# Environment setup
# Create .env files in server/ and client/ directories
```

### Environment Variables

**Backend (.env in server/):**
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/property-management
JWT_SECRET=your-jwt-secret
AZURE_STORAGE_CONNECTION_STRING=your-azure-storage-connection
SENDGRID_API_KEY=your-sendgrid-api-key
```

**Frontend (.env in client/):**
```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_AUTH_ENABLED=true
```

### Start Development
```bash
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend  
cd client && npm start
```

## Coding Standards

### TypeScript Standards
- **Interfaces**: PascalCase with 'I' prefix (`IPropertyAccount`)
- **Types**: PascalCase (`TransactionType`)
- **Functions**: camelCase (`calculateBalance`)
- **Classes**: PascalCase (`PropertyAccountService`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)

### File Organization
```typescript
// 1. Imports (external first, then internal)
import express from 'express';
import { PropertyAccount } from '../models/PropertyAccount';

// 2. Interfaces and Types
interface CreateExpenseRequest {
  amount: number;
  description: string;
}

// 3. Implementation
export const createExpense = async (req: Request, res: Response) => {
  // Implementation
};
```

### React Component Structure
```typescript
// 1. Imports
import React, { useState, useEffect } from 'react';

// 2. Interfaces
interface ComponentProps {
  propertyId: string;
}

// 3. Component
const Component: React.FC<ComponentProps> = ({ propertyId }) => {
  // 4. State
  const [data, setData] = useState(null);

  // 5. Effects
  useEffect(() => {
    // Effect logic
  }, [propertyId]);

  // 6. Event handlers
  const handleClick = () => {
    // Handler logic
  };

  // 7. Render
  return <div>{/* JSX */}</div>;
};
```

## Error Handling

### Backend Error Handling
```typescript
export class AppError extends Error {
  public statusCode: number;
  
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const createExpense = async (req: Request, res: Response) => {
  try {
    if (!req.params.propertyId) {
      throw new AppError('Property ID required', 400);
    }
    
    const result = await service.addExpense(req.params.propertyId, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({ success: false, message: 'Internal error' });
  }
};
```

### Frontend Error Handling
```typescript
const usePropertyAccount = (propertyId: string) => {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await service.getPropertyAccount(propertyId);
        setState({ data, loading: false, error: null });
      } catch (error) {
        setState({ data: null, loading: false, error: error.message });
      }
    };
    fetchData();
  }, [propertyId]);

  return state;
};
```

## Testing

### Backend Testing
```typescript
// Unit test example
describe('PropertyAccountService', () => {
  it('should add expense and update balance', async () => {
    const result = await service.addExpense(propertyId, expenseData);
    expect(result.totalExpenses).toBe(500);
    expect(result.runningBalance).toBe(-500);
  });
});
```

### Frontend Testing
```typescript
// Component test example
it('should display property information', async () => {
  render(<PropertyAccountDetail propertyId="123" />);
  await waitFor(() => {
    expect(screen.getByText('Test Property')).toBeInTheDocument();
  });
});
```

### Test Commands
```bash
# Backend
cd server && npm test

# Frontend  
cd client && npm test

# Coverage
npm run test:coverage
```

## Database Management

### Schema Design
```typescript
const PropertyAccountSchema = new Schema({
  propertyId: {
    type: Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
    index: true
  },
  runningBalance: {
    type: Number,
    default: 0,
    index: true
  },
  transactions: [TransactionSchema],
  ownerPayouts: [OwnerPayoutSchema]
}, {
  timestamps: true
});

// Indexes for performance
PropertyAccountSchema.index({ companyId: 1, isActive: 1 });
PropertyAccountSchema.index({ 'transactions.date': -1 });
```

### Migration Scripts
```typescript
// scripts/migrations/add-company-id.ts
export const addCompanyIdToAccounts = async () => {
  const accounts = await PropertyAccount.find({ companyId: { $exists: false } });
  
  for (const account of accounts) {
    const property = await Property.findById(account.propertyId);
    if (property?.companyId) {
      account.companyId = property.companyId;
      await account.save();
    }
  }
};
```

## API Development

### Controller Pattern
```typescript
export const controllerName = async (req: Request, res: Response) => {
  try {
    // 1. Validate input
    const { error } = validateSchema(req.body);
    if (error) throw new AppError(error.message, 400);

    // 2. Extract parameters
    const { id } = req.params;

    // 3. Call service
    const result = await service.methodName(id, req.body);

    // 4. Return response
    res.json({ success: true, data: result });
  } catch (error) {
    handleError(error, res);
  }
};
```

### Validation
```typescript
export const createExpenseSchema = Joi.object({
  amount: Joi.number().positive().required(),
  description: Joi.string().min(1).max(500).required(),
  category: Joi.string().valid('general', 'repair', 'maintenance')
});
```

## Frontend Development

### Custom Hooks
```typescript
const usePropertyAccount = (propertyId: string) => {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await service.getPropertyAccount(propertyId);
        setState({ data, loading: false, error: null });
      } catch (error) {
        setState({ data: null, loading: false, error: error.message });
      }
    };
    fetchData();
  }, [propertyId]);

  return state;
};
```

### Form Handling
```typescript
const useForm = <T>(initialValues: T, validationSchema: any) => {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<T>>({});

  const handleChange = (field: keyof T, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = () => {
    try {
      validationSchema.validateSync(values, { abortEarly: false });
      setErrors({});
      return true;
    } catch (error) {
      const newErrors: Partial<T> = {};
      error.inner.forEach((err: any) => {
        newErrors[err.path as keyof T] = err.message;
      });
      setErrors(newErrors);
      return false;
    }
  };

  return { values, errors, handleChange, validate, setValues };
};
```

## Deployment

### Environment Setup
```bash
# Production environment
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database
JWT_SECRET=your-production-secret
CORS_ORIGIN=https://your-domain.com
```

### Build Process
```bash
# Backend
cd server && npm run build

# Frontend
cd client && npm run build
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 5000
CMD ["node", "dist/index.js"]
```

### Azure Deployment
```yaml
# .github/workflows/deploy.yml
name: Deploy to Azure
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    - name: Build and Deploy
      run: |
        cd server && npm ci && npm run build
        cd ../client && npm ci && npm run build
    - name: Deploy to Azure
      uses: azure/webapps-deploy@v2
      with:
        app-name: 'property-management-app'
        publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
```

## Troubleshooting

### Common Issues

**Database Connection:**
```bash
# Check MongoDB connection
mongosh "mongodb://localhost:27017/property-management"

# Reset indexes
npm run db:reset-indexes
```

**Build Issues:**
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install

# Check TypeScript errors
npx tsc --noEmit
```

**Runtime Issues:**
```bash
# Check logs
npm run logs

# Monitor memory
node --inspect dist/index.js
```

### Performance Optimization

**Database:**
```typescript
// Use projection
const accounts = await PropertyAccount.find(
  { companyId },
  'propertyName runningBalance'
);

// Use aggregation
const summary = await PropertyAccount.aggregate([
  { $match: { companyId } },
  { $group: {
    _id: null,
    totalBalance: { $sum: '$runningBalance' }
  }}
]);
```

**Frontend:**
```typescript
// Use React.memo
const ExpensiveComponent = React.memo(({ data }) => {
  return <div>{/* Component */}</div>;
});

// Use useMemo
const expensiveValue = useMemo(() => {
  return calculateExpensiveValue(data);
}, [data]);
```

### Monitoring
```typescript
// Structured logging
logger.info('Property account created', {
  propertyId: account.propertyId,
  userId: req.user.id
});

// Performance monitoring
const startTime = Date.now();
await performOperation();
logger.info('Operation completed', {
  duration: Date.now() - startTime
});
```

This development guide provides essential information for setting up, developing, and deploying the Azure Property Management System. Follow these standards to maintain code quality and ensure consistent development practices. 