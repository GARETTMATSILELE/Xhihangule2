# Setting Up GitHub Actions for Azure Deployment

This document explains how to set up GitHub Actions for deploying your Property Management application to Azure App Service.

## Prerequisites

1. An active Azure subscription
2. An Azure App Service created for your application
3. A GitHub repository for your code

## Setting Up Azure App Service

1. Sign in to the [Azure Portal](https://portal.azure.com)
2. Create a new App Service:
   - Click "Create a resource"
   - Search for "App Service"
   - Click "Create"
   - Fill in the required details:
     - Subscription: Select your subscription
     - Resource Group: Create a new one or select an existing one
     - Name: Choose a unique name (e.g., "property-management-app")
     - Publish: Code
     - Runtime stack: .NET 7 (LTS)
     - Operating System: Windows or Linux (your preference)
     - Region: Choose a region close to your users
   - Click "Review + create" and then "Create"

## Getting the Publish Profile

1. Once your App Service is created, navigate to it in the Azure Portal
2. In the left menu, click on "Overview"
3. Click on "Get publish profile" and download the file
4. Open the file in a text editor and copy its contents

## Setting Up GitHub Secrets

1. Go to your GitHub repository
2. Click on "Settings" > "Secrets and variables" > "Actions"
3. Click "New repository secret"
4. Add the following secrets:
   - Name: `AZURE_APP_NAME`
     - Value: The name of your Azure App Service (e.g., "property-management-app")
   - Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
     - Value: The entire contents of the publish profile file you downloaded

## Troubleshooting Azure Account Access

If you're having issues with your Azure account access:

1. Make sure you have an active subscription:
   - Go to [Azure Portal](https://portal.azure.com)
   - Click on "Subscriptions" in the left menu
   - Verify you have at least one active subscription

2. If you don't have a subscription:
   - Sign up for a free Azure account at [Azure Free Account](https://azure.microsoft.com/free/)
   - You'll need a credit card for verification, but you won't be charged for the free tier

3. If you have a subscription but can't access it:
   - Contact your Azure account administrator
   - They may need to assign you the appropriate role (e.g., Contributor or Owner)

## Testing the Workflow

1. Push your code to the main branch of your GitHub repository
2. Go to the "Actions" tab in your GitHub repository
3. You should see your workflow running
4. Check the logs for any errors

## Additional Configuration

For production deployments, consider:

1. Setting up staging environments
2. Adding environment-specific configuration
3. Implementing deployment approvals
4. Setting up monitoring and alerts 