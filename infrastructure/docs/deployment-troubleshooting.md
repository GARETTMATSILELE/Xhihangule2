# Troubleshooting Azure App Service Deployment

This guide helps you troubleshoot the "Some jobs were not successful" error when deploying to Azure App Service.

## Step 1: Check GitHub Actions Logs

1. Go to your GitHub repository
2. Click on the "Actions" tab
3. Find the failed workflow run (XihangulePM, Attempt #2)
4. Click on the failed job to see the detailed logs
5. Look for red error messages that indicate what specifically failed

## Step 2: Verify Azure App Service Configuration

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to your App Service (XihangulePM)
3. In the left menu, click on "Configuration"
4. Verify the following settings:
   - .NET version is set to 8.0
   - Application stack is set to .NET Core
   - Platform is set to 64-bit

## Step 3: Check GitHub Secrets

1. Go to your GitHub repository
2. Click on "Settings" > "Secrets and variables" > "Actions"
3. Verify that these secrets are correctly set:
   - `AZURE_APP_NAME`: Should match your App Service name (XihangulePM)
   - `AZURE_WEBAPP_PUBLISH_PROFILE`: Should contain a valid publish profile

## Step 4: Verify Project Structure

Make sure your repository structure matches what's expected in the workflow:

```
/
├── src/
│   └── server/
│       └── PropertyManagement.csproj
└── .github/
    └── workflows/
        └── azure-deploy.yml
```

## Step 5: Common Issues and Solutions

### Issue: Azure Authentication Failed
- **Symptoms**: Error messages about authentication or authorization
- **Solution**: 
  - Generate a new publish profile from Azure App Service
  - Update the `AZURE_WEBAPP_PUBLISH_PROFILE` secret with the new profile

### Issue: Build Failed
- **Symptoms**: Error messages during the build step
- **Solution**:
  - Check for compilation errors in your code
  - Verify all NuGet packages are properly referenced
  - Make sure your .NET version is compatible with all dependencies

### Issue: Publish Failed
- **Symptoms**: Error messages during the publish step
- **Solution**:
  - Check if the publish directory is created correctly
  - Verify that all required files are included in the publish output

### Issue: Deployment Failed
- **Symptoms**: Error messages during the deployment step
- **Solution**:
  - Check if the App Service name is correct
  - Verify that the publish profile has the necessary permissions
  - Make sure the App Service is running and accessible

### Issue: .NET Version Mismatch
- **Symptoms**: Errors about incompatible .NET versions
- **Solution**:
  - Make sure your Azure App Service is configured for .NET 8.0
  - Update your App Service configuration in the Azure Portal
  - If you can't change the App Service version, revert your project to .NET 7.0

## Step 6: Test Locally

Before pushing to GitHub, test your application locally:

```bash
cd src/server
dotnet restore
dotnet build
dotnet publish -c Release -o ./publish
```

## Step 7: Contact Support

If you've tried all the above steps and still encounter issues:

1. Collect the detailed error logs from GitHub Actions
2. Take screenshots of your Azure App Service configuration
3. Contact Azure support or your organization's IT department 