# API Documentation

## Overview

The Azure Property Management System API provides comprehensive endpoints for property management, accounting, payment processing, and user management. The API follows RESTful principles and uses JSON for data exchange.

## Base URL

- **Development**: `http://localhost:5000`
- **Production**: `https://your-domain.com`

## Authentication

All API endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Response Format

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

Error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information"
}
```

## Authentication Endpoints

### Login

**POST** `/api/auth/login`

Authenticate a user and receive a JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "accountant",
      "companyId": "507f1f77bcf86cd799439012"
    }
  }
}
```

### Register

**POST** `/api/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "firstName": "Jane",
  "lastName": "Smith",
  "role": "accountant",
  "companyId": "507f1f77bcf86cd799439012"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439013",
      "email": "newuser@example.com",
      "firstName": "Jane",
      "lastName": "Smith",
      "role": "accountant",
      "companyId": "507f1f77bcf86cd799439012"
    }
  },
  "message": "User registered successfully"
}
```

### Get Current User

**GET** `/api/auth/me`

Get the current authenticated user's information.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "accountant",
    "companyId": "507f1f77bcf86cd799439012",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Logout

**POST** `/api/auth/logout`

Logout the current user (token invalidation).

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Property Accounting Endpoints

### Get All Property Accounts

**GET** `/api/accountant/property-accounts`

Get all property accounts for the current company.

**Query Parameters:**
- `page` (optional): Page number for pagination
- `limit` (optional): Number of items per page
- `search` (optional): Search by property name or owner name

**Response:**
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "_id": "507f1f77bcf86cd799439014",
        "propertyId": "507f1f77bcf86cd799439015",
        "propertyName": "Sunset Apartments",
        "propertyAddress": "123 Main St, City, State",
        "ownerId": "507f1f77bcf86cd799439016",
        "ownerName": "John Smith",
        "runningBalance": 5000.00,
        "totalIncome": 15000.00,
        "totalExpenses": 8000.00,
        "totalOwnerPayouts": 2000.00,
        "lastIncomeDate": "2024-01-15T00:00:00.000Z",
        "lastExpenseDate": "2024-01-10T00:00:00.000Z",
        "lastPayoutDate": "2024-01-05T00:00:00.000Z",
        "isActive": true,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-15T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

### Get Property Account

**GET** `/api/accountant/property-accounts/:propertyId`

Get detailed information for a specific property account.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439014",
    "propertyId": "507f1f77bcf86cd799439015",
    "propertyName": "Sunset Apartments",
    "propertyAddress": "123 Main St, City, State",
    "ownerId": "507f1f77bcf86cd799439016",
    "ownerName": "John Smith",
    "transactions": [
      {
        "_id": "507f1f77bcf86cd799439017",
        "type": "income",
        "amount": 2000.00,
        "date": "2024-01-15T00:00:00.000Z",
        "description": "Rent payment for January 2024",
        "status": "completed",
        "createdAt": "2024-01-15T00:00:00.000Z"
      }
    ],
    "ownerPayouts": [
      {
        "_id": "507f1f77bcf86cd799439018",
        "amount": 1500.00,
        "date": "2024-01-05T00:00:00.000Z",
        "paymentMethod": "bank_transfer",
        "referenceNumber": "PAY-2024-001",
        "status": "completed",
        "recipientName": "John Smith",
        "createdAt": "2024-01-05T00:00:00.000Z"
      }
    ],
    "runningBalance": 5000.00,
    "totalIncome": 15000.00,
    "totalExpenses": 8000.00,
    "totalOwnerPayouts": 2000.00,
    "lastIncomeDate": "2024-01-15T00:00:00.000Z",
    "lastExpenseDate": "2024-01-10T00:00:00.000Z",
    "lastPayoutDate": "2024-01-05T00:00:00.000Z",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

### Get Property Transactions

**GET** `/api/accountant/property-accounts/:propertyId/transactions`

Get transaction history for a property with optional filtering.

**Query Parameters:**
- `type` (optional): Filter by transaction type (income, expense, owner_payout, repair, maintenance, other)
- `startDate` (optional): Filter transactions from this date
- `endDate` (optional): Filter transactions to this date
- `category` (optional): Filter by expense category
- `status` (optional): Filter by transaction status
- `page` (optional): Page number for pagination
- `limit` (optional): Number of items per page

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "_id": "507f1f77bcf86cd799439017",
        "type": "income",
        "amount": 2000.00,
        "date": "2024-01-15T00:00:00.000Z",
        "paymentId": "507f1f77bcf86cd799439019",
        "description": "Rent payment for January 2024",
        "category": "rent",
        "status": "completed",
        "processedBy": "507f1f77bcf86cd799439011",
        "notes": "Monthly rent payment",
        "createdAt": "2024-01-15T00:00:00.000Z",
        "updatedAt": "2024-01-15T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 15,
      "pages": 2
    }
  }
}
```

### Add Expense

**POST** `/api/accountant/property-accounts/:propertyId/expense`

Add a new expense to a property account.

**Request Body:**
```json
{
  "amount": 500.00,
  "date": "2024-01-16T00:00:00.000Z",
  "description": "Plumbing repair",
  "category": "repair",
  "recipientId": "507f1f77bcf86cd799439020",
  "recipientType": "contractor",
  "notes": "Emergency plumbing repair for unit 2B"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "account": {
      "_id": "507f1f77bcf86cd799439014",
      "runningBalance": 4500.00,
      "totalExpenses": 8500.00,
      "lastExpenseDate": "2024-01-16T00:00:00.000Z",
      "updatedAt": "2024-01-16T00:00:00.000Z"
    },
    "transaction": {
      "_id": "507f1f77bcf86cd799439021",
      "type": "expense",
      "amount": 500.00,
      "date": "2024-01-16T00:00:00.000Z",
      "description": "Plumbing repair",
      "category": "repair",
      "status": "completed",
      "createdAt": "2024-01-16T00:00:00.000Z"
    }
  },
  "message": "Expense added successfully"
}
```

### Create Owner Payout

**POST** `/api/accountant/property-accounts/:propertyId/payout`

Create a new owner payout from the property account.

**Request Body:**
```json
{
  "amount": 2000.00,
  "paymentMethod": "bank_transfer",
  "recipientId": "507f1f77bcf86cd799439016",
  "recipientName": "John Smith",
  "recipientBankDetails": {
    "bankName": "First National Bank",
    "accountNumber": "1234567890",
    "accountName": "John Smith"
  },
  "notes": "Monthly owner payout for January 2024"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "account": {
      "_id": "507f1f77bcf86cd799439014",
      "runningBalance": 2500.00,
      "totalOwnerPayouts": 4000.00,
      "lastPayoutDate": "2024-01-16T00:00:00.000Z",
      "updatedAt": "2024-01-16T00:00:00.000Z"
    },
    "payout": {
      "_id": "507f1f77bcf86cd799439022",
      "amount": 2000.00,
      "date": "2024-01-16T00:00:00.000Z",
      "paymentMethod": "bank_transfer",
      "referenceNumber": "PAY-2024-002",
      "status": "pending",
      "recipientName": "John Smith",
      "createdAt": "2024-01-16T00:00:00.000Z"
    }
  },
  "message": "Owner payout created successfully"
}
```

### Update Payout Status

**PUT** `/api/accountant/property-accounts/:propertyId/payout/:payoutId/status`

Update the status of an owner payout.

**Request Body:**
```json
{
  "status": "completed"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "account": {
      "_id": "507f1f77bcf86cd799439014",
      "runningBalance": 2500.00,
      "totalOwnerPayouts": 4000.00,
      "updatedAt": "2024-01-16T00:00:00.000Z"
    },
    "payout": {
      "_id": "507f1f77bcf86cd799439022",
      "status": "completed",
      "updatedAt": "2024-01-16T00:00:00.000Z"
    }
  },
  "message": "Payout status updated successfully"
}
```

### Get Payout History

**GET** `/api/accountant/property-accounts/:propertyId/payouts`

Get the payout history for a property.

**Query Parameters:**
- `status` (optional): Filter by payout status
- `startDate` (optional): Filter payouts from this date
- `endDate` (optional): Filter payouts to this date
- `page` (optional): Page number for pagination
- `limit` (optional): Number of items per page

**Response:**
```json
{
  "success": true,
  "data": {
    "payouts": [
      {
        "_id": "507f1f77bcf86cd799439022",
        "amount": 2000.00,
        "date": "2024-01-16T00:00:00.000Z",
        "paymentMethod": "bank_transfer",
        "referenceNumber": "PAY-2024-002",
        "status": "completed",
        "recipientName": "John Smith",
        "recipientBankDetails": {
          "bankName": "First National Bank",
          "accountNumber": "1234567890",
          "accountName": "John Smith"
        },
        "notes": "Monthly owner payout for January 2024",
        "createdAt": "2024-01-16T00:00:00.000Z",
        "updatedAt": "2024-01-16T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 5,
      "pages": 1
    }
  }
}
```

### Sync Property Accounts

**POST** `/api/accountant/property-accounts/sync`

Sync property accounts with existing payment data.

**Request Body:**
```json
{
  "propertyIds": ["507f1f77bcf86cd799439015"],
  "startDate": "2024-01-01T00:00:00.000Z",
  "endDate": "2024-01-31T00:00:00.000Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "syncedAccounts": 1,
    "newTransactions": 5,
    "totalIncome": 10000.00
  },
  "message": "Property accounts synced successfully"
}
```

### Generate Payment Request Document

**GET** `/api/accountant/property-accounts/:propertyId/payout/:payoutId/payment-request`

Generate a payment request document for an owner payout.

**Response:**
```json
{
  "success": true,
  "data": {
    "documentUrl": "https://storage.blob.core.windows.net/documents/payment-request-PAY-2024-002.pdf",
    "documentId": "507f1f77bcf86cd799439023"
  }
}
```

### Generate Acknowledgement Document

**GET** `/api/accountant/property-accounts/:propertyId/payout/:payoutId/acknowledgement`

Generate an acknowledgement document for a completed payout.

**Response:**
```json
{
  "success": true,
  "data": {
    "documentUrl": "https://storage.blob.core.windows.net/documents/acknowledgement-PAY-2024-002.pdf",
    "documentId": "507f1f77bcf86cd799439024"
  }
}
```

## Property Management Endpoints

### Get All Properties

**GET** `/api/properties`

Get all properties for the current company.

**Query Parameters:**
- `page` (optional): Page number for pagination
- `limit` (optional): Number of items per page
- `search` (optional): Search by property name or address
- `status` (optional): Filter by property status

**Response:**
```json
{
  "success": true,
  "data": {
    "properties": [
      {
        "_id": "507f1f77bcf86cd799439015",
        "name": "Sunset Apartments",
        "address": "123 Main St, City, State",
        "type": "apartment",
        "units": 12,
        "ownerId": "507f1f77bcf86cd799439016",
        "status": "active",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

### Get Property

**GET** `/api/properties/:id`

Get detailed information for a specific property.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439015",
    "name": "Sunset Apartments",
    "address": "123 Main St, City, State",
    "type": "apartment",
    "units": 12,
    "ownerId": "507f1f77bcf86cd799439016",
    "ownerName": "John Smith",
    "status": "active",
    "description": "Modern apartment complex with amenities",
    "amenities": ["pool", "gym", "parking"],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Create Property

**POST** `/api/properties`

Create a new property.

**Request Body:**
```json
{
  "name": "New Property",
  "address": "456 Oak St, City, State",
  "type": "house",
  "units": 1,
  "ownerId": "507f1f77bcf86cd799439016",
  "description": "Single family home",
  "amenities": ["garage", "garden"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439025",
    "name": "New Property",
    "address": "456 Oak St, City, State",
    "type": "house",
    "units": 1,
    "ownerId": "507f1f77bcf86cd799439016",
    "status": "active",
    "createdAt": "2024-01-16T00:00:00.000Z",
    "updatedAt": "2024-01-16T00:00:00.000Z"
  },
  "message": "Property created successfully"
}
```

### Update Property

**PUT** `/api/properties/:id`

Update an existing property.

**Request Body:**
```json
{
  "name": "Updated Property Name",
  "description": "Updated property description"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439015",
    "name": "Updated Property Name",
    "description": "Updated property description",
    "updatedAt": "2024-01-16T00:00:00.000Z"
  },
  "message": "Property updated successfully"
}
```

### Delete Property

**DELETE** `/api/properties/:id`

Delete a property (soft delete).

**Response:**
```json
{
  "success": true,
  "message": "Property deleted successfully"
}
```

## Payment Processing Endpoints

### Get All Payments

**GET** `/api/payments`

Get all payments for the current company.

**Query Parameters:**
- `page` (optional): Page number for pagination
- `limit` (optional): Number of items per page
- `status` (optional): Filter by payment status
- `propertyId` (optional): Filter by property
- `tenantId` (optional): Filter by tenant
- `startDate` (optional): Filter payments from this date
- `endDate` (optional): Filter payments to this date

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "_id": "507f1f77bcf86cd799439019",
        "propertyId": "507f1f77bcf86cd799439015",
        "tenantId": "507f1f77bcf86cd799439026",
        "amount": 2000.00,
        "type": "rent",
        "status": "completed",
        "dueDate": "2024-01-01T00:00:00.000Z",
        "paidDate": "2024-01-15T00:00:00.000Z",
        "paymentMethod": "bank_transfer",
        "referenceNumber": "PAY-2024-001",
        "createdAt": "2024-01-15T00:00:00.000Z",
        "updatedAt": "2024-01-15T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 50,
      "pages": 5
    }
  }
}
```

### Get Payment

**GET** `/api/payments/:id`

Get detailed information for a specific payment.

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439019",
    "propertyId": "507f1f77bcf86cd799439015",
    "propertyName": "Sunset Apartments",
    "tenantId": "507f1f77bcf86cd799439026",
    "tenantName": "Jane Doe",
    "amount": 2000.00,
    "type": "rent",
    "status": "completed",
    "dueDate": "2024-01-01T00:00:00.000Z",
    "paidDate": "2024-01-15T00:00:00.000Z",
    "paymentMethod": "bank_transfer",
    "referenceNumber": "PAY-2024-001",
    "notes": "Monthly rent payment",
    "createdAt": "2024-01-15T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

### Create Payment

**POST** `/api/payments`

Create a new payment record.

**Request Body:**
```json
{
  "propertyId": "507f1f77bcf86cd799439015",
  "tenantId": "507f1f77bcf86cd799439026",
  "amount": 2000.00,
  "type": "rent",
  "dueDate": "2024-02-01T00:00:00.000Z",
  "paymentMethod": "bank_transfer",
  "notes": "Monthly rent payment for February 2024"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439027",
    "propertyId": "507f1f77bcf86cd799439015",
    "tenantId": "507f1f77bcf86cd799439026",
    "amount": 2000.00,
    "type": "rent",
    "status": "pending",
    "dueDate": "2024-02-01T00:00:00.000Z",
    "paymentMethod": "bank_transfer",
    "referenceNumber": "PAY-2024-003",
    "createdAt": "2024-01-16T00:00:00.000Z",
    "updatedAt": "2024-01-16T00:00:00.000Z"
  },
  "message": "Payment created successfully"
}
```

### Update Payment Status

**PUT** `/api/payments/:id/status`

Update the status of a payment.

**Request Body:**
```json
{
  "status": "completed",
  "paidDate": "2024-01-16T00:00:00.000Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439027",
    "status": "completed",
    "paidDate": "2024-01-16T00:00:00.000Z",
    "updatedAt": "2024-01-16T00:00:00.000Z"
  },
  "message": "Payment status updated successfully"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input data |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation error |
| 500 | Internal Server Error - Server error |

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **Authentication endpoints**: 5 requests per minute
- **Property accounting endpoints**: 100 requests per minute
- **Property management endpoints**: 100 requests per minute
- **Payment processing endpoints**: 100 requests per minute

## Pagination

List endpoints support pagination with the following parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)

Response includes pagination metadata:

```json
{
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

## Filtering and Search

Many endpoints support filtering and search:

- **Search**: Text search across relevant fields
- **Date ranges**: Filter by date ranges using `startDate` and `endDate`
- **Status filtering**: Filter by status values
- **ID filtering**: Filter by related entity IDs

## File Upload

File upload endpoints support:

- **Maximum file size**: 10MB
- **Supported formats**: PDF, DOC, DOCX, JPG, PNG
- **Storage**: Azure Blob Storage
- **Security**: File type validation and virus scanning

## Webhooks

The API supports webhooks for real-time notifications:

- **Payment status changes**
- **Property account updates**
- **New transactions**
- **Payout status changes**

Webhook endpoints require authentication and support retry logic for failed deliveries. 