# Azure Property Management System

A full-stack property management solution built with React, .NET Core, and Azure services.

## Architecture Overview

- **Frontend**: React with TypeScript
- **Backend**: .NET Core 8.0 Web API
- **Database**: Azure SQL Database
- **Authentication**: Azure Active Directory B2C
- **Storage**: Azure Blob Storage
- **Monitoring**: Application Insights
- **Email Automation**: Azure Logic Apps with SendGrid

## Azure Services Used

- Azure App Service (Web App hosting)
- Azure SQL Database (Main database)
- Azure Active Directory B2C (Authentication)
- Azure Logic Apps (Workflow automation)
- Azure Blob Storage (Document management)
- Application Insights (Monitoring)
- Azure Key Vault (Secret management)

## Prerequisites

- .NET 8.0 SDK
- Node.js 18+ and npm
- Azure CLI
- Azure subscription
- Visual Studio 2022 or VS Code
- SQL Server Management Studio (optional)

## Project Structure

```
├── src/
│   ├── client/                 # React frontend
│   ├── server/                 # .NET Core backend
│   │   ├── API/               # Web API project
│   │   ├── Core/             # Domain models and interfaces
│   │   ├── Infrastructure/   # Data access and external services
│   │   └── Application/      # Business logic and DTOs
│   └── shared/                # Shared types and utilities
├── tests/                     # Test projects
├── docs/                      # Documentation
└── infrastructure/            # Azure infrastructure as code
```

## Local Development Setup

1. Clone the repository
2. Backend setup:
   ```bash
   cd src/server
   dotnet restore
   dotnet build
   cd API
   dotnet run
   ```

3. Frontend setup:
   ```bash
   cd src/client
   npm install
   npm start
   ```

4. Configure Azure services:
   - Create Azure AD B2C tenant
   - Set up Azure SQL Database
   - Configure Azure Blob Storage
   - Set up Application Insights
   - Configure Azure Logic Apps

## Environment Variables

Create a `.env` file in the client directory with:

```
REACT_APP_API_URL=http://localhost:5000
REACT_APP_AUTH_CLIENT_ID=your_client_id
REACT_APP_AUTH_AUTHORITY=your_authority
```

For the backend, update `appsettings.json` with your Azure configuration.

## Deployment

The application can be deployed using Azure DevOps or GitHub Actions. Deployment templates are provided in the `/infrastructure` directory.

## Features

### Admin Center
- User management
- Role assignment
- System configuration

### Property Management
- Property CRUD operations
- Tenant management
- Lease management
- Maintenance request tracking

### Accounting
- Rent collection
- Payment processing
- Financial reporting
- Tax documentation

### Document Management
- Secure document storage
- Document categorization
- Search functionality

## Security

- Azure AD B2C authentication
- Role-based access control
- Data encryption at rest and in transit
- Secure API endpoints
- Regular security audits

## Contributing

Please read CONTRIBUTING.md for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Azure Account Setup

This application requires an Azure account for deployment and hosting. Follow these steps to set up your Azure account:

1. **Sign in to Azure Portal**
   - Go to [Azure Portal](https://portal.azure.com)
   - Sign in with your account (garet.matsi@gmail.com)

2. **Create Required Resources**
   - Create a Resource Group named `property-management-rg`
   - Create an App Service named `property-management-app`
   - Create a Key Vault named `property-management-kv`
   - Create a SQL Database for the application

3. **Configure Application Settings**
   - Update the `appsettings.json` file with your Azure subscription details:
     - SubscriptionId
     - TenantId
     - ClientId
     - ClientSecret
     - KeyVaultUri

4. **Validate Azure Account**
   - Run the application
   - Navigate to the Swagger UI at `/swagger`
   - Authenticate as an admin user
   - Call the `GET /api/Azure/validate-account` endpoint to verify your Azure account is properly configured

## Development Setup

1. **Prerequisites**
   - .NET 7.0 SDK
   - Visual Studio 2022 or VS Code
   - Azure CLI

2. **Install Dependencies**
   ```bash
   dotnet restore
   ```

3. **Run the Application**
   ```bash
   dotnet run --project src/server
   ```

4. **Access the Application**
   - Web API: https://localhost:5001
   - Swagger UI: https://localhost:5001/swagger

## Azure Account Validation

The application includes a comprehensive Azure account validation system that checks:

- Subscription and tenant information
- Available regions in your subscription
- Required resource providers (App Service, Storage, Key Vault, SQL Database, etc.)
- Existing resources that match our naming conventions
- Required permissions for managing resources

If any issues are detected, the validation will provide detailed information about what needs to be fixed.

## Troubleshooting

If you encounter issues with Azure account validation:

1. **Authentication Issues**
   - Ensure you're signed in to Azure CLI: `az login`
   - Verify your account has the necessary permissions

2. **Missing Resource Providers**
   - Register the required resource providers in your subscription:
     ```bash
     az provider register --namespace Microsoft.Web
     az provider register --namespace Microsoft.Storage
     az provider register --namespace Microsoft.KeyVault
     az provider register --namespace Microsoft.Sql
     az provider register --namespace Microsoft.Insights
     az provider register --namespace Microsoft.Authorization
     ```

3. **Permission Issues**
   - Ensure your account has Contributor or Owner role on the resource group
   - Check that your account has Key Vault access policies configured

For more assistance, contact the development team. 