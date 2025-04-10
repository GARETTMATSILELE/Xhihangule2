# Comprehensive test solution for Property Management application
Write-Host "Running comprehensive test solution for Property Management application..." -ForegroundColor Green

# Function to check if a command exists
function Test-CommandExists {
    param ($command)
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = 'stop'
    try {
        if (Get-Command $command) { return $true }
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $oldPreference
    }
}

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Cyan

# Check .NET SDK
if (Test-CommandExists "dotnet") {
    $dotnetVersion = dotnet --version
    Write-Host "  .NET SDK version: $dotnetVersion" -ForegroundColor Green
    
    if ($dotnetVersion -lt "8.0.0") {
        Write-Host "  WARNING: .NET SDK version is below 8.0.0. Consider upgrading." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ERROR: .NET SDK not found. Please install .NET 8.0 SDK." -ForegroundColor Red
    exit 1
}

# Check Azure CLI
if (Test-CommandExists "az") {
    $azVersion = az --version | Select-Object -First 1
    Write-Host "  Azure CLI version: $azVersion" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Azure CLI not found. Some tests will be skipped." -ForegroundColor Yellow
}

# Check if we're in the right directory
$currentDir = Get-Location
$serverDir = Join-Path $currentDir "src\server"
if (Test-Path $serverDir) {
    Write-Host "  Found server directory: $serverDir" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Server directory not found. Make sure you're running this script from the project root." -ForegroundColor Red
    exit 1
}

# Navigate to the server directory
Set-Location -Path $serverDir

# Check project file
$projectFile = "PropertyManagement.csproj"
if (Test-Path $projectFile) {
    Write-Host "  Found project file: $projectFile" -ForegroundColor Green
    
    # Check target framework
    $targetFramework = Select-String -Path $projectFile -Pattern "TargetFramework" | ForEach-Object { $_.Line }
    Write-Host "  Target framework: $targetFramework" -ForegroundColor Green
    
    if ($targetFramework -notlike "*net8.0*") {
        Write-Host "  WARNING: Target framework is not .NET 8.0. This may cause issues." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ERROR: Project file not found. Make sure you're in the right directory." -ForegroundColor Red
    exit 1
}

# Check appsettings files
$appsettingsFiles = @("appsettings.json", "appsettings.Development.json")
foreach ($file in $appsettingsFiles) {
    if (Test-Path $file) {
        Write-Host "  Found $file" -ForegroundColor Green
        
        # Check for Azure settings
        $azureSettings = Select-String -Path $file -Pattern "AzureSettings" | ForEach-Object { $_.Line }
        if ($azureSettings) {
            Write-Host "    Contains Azure settings" -ForegroundColor Green
        } else {
            Write-Host "    WARNING: No Azure settings found in $file" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  WARNING: $file not found" -ForegroundColor Yellow
    }
}

# Restore dependencies
Write-Host "Restoring dependencies..." -ForegroundColor Cyan
$restoreResult = dotnet restore
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Dependencies restored successfully" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Failed to restore dependencies" -ForegroundColor Red
    Write-Host $restoreResult
    exit 1
}

# Build the application
Write-Host "Building the application..." -ForegroundColor Cyan
$buildResult = dotnet build --configuration Release
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Application built successfully" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Failed to build application" -ForegroundColor Red
    Write-Host $buildResult
    exit 1
}

# Run tests
Write-Host "Running tests..." -ForegroundColor Cyan
$testResult = dotnet test --no-build
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Tests passed successfully" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Some tests failed" -ForegroundColor Yellow
    Write-Host $testResult
}

# Create publish directory if it doesn't exist
$publishDir = "./publish"
if (-not (Test-Path -Path $publishDir)) {
    New-Item -ItemType Directory -Path $publishDir | Out-Null
    Write-Host "  Created publish directory: $publishDir" -ForegroundColor Green
}

# Publish the application
Write-Host "Publishing the application..." -ForegroundColor Cyan
$publishResult = dotnet publish --configuration Release --output $publishDir
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Application published successfully" -ForegroundColor Green
    
    # List the published files
    Write-Host "  Published files:" -ForegroundColor Cyan
    Get-ChildItem -Path $publishDir | ForEach-Object {
        Write-Host "    - $($_.Name)" -ForegroundColor White
    }
    
    # Check for key files
    $keyFiles = @("PropertyManagement.dll", "PropertyManagement.exe", "appsettings.json", "web.config")
    foreach ($file in $keyFiles) {
        if (Test-Path (Join-Path $publishDir $file)) {
            Write-Host "    Found key file: $file" -ForegroundColor Green
        } else {
            Write-Host "    WARNING: Key file not found: $file" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  ERROR: Failed to publish application" -ForegroundColor Red
    Write-Host $publishResult
    exit 1
}

# Check Azure App Service configuration
if (Test-CommandExists "az") {
    Write-Host "Checking Azure App Service configuration..." -ForegroundColor Cyan
    
    # Check if logged in to Azure
    $loginStatus = az account show 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Logged in to Azure" -ForegroundColor Green
        
        # Get subscription ID
        $subscriptionId = az account show --query id -o tsv
        Write-Host "  Subscription ID: $subscriptionId" -ForegroundColor Green
        
        # Check if App Service exists
        $appServiceName = "XihangulePM" # Update this to match your App Service name
        $resourceGroup = "property-management-rg" # Update this to match your resource group
        
        $appService = az webapp show --name $appServiceName --resource-group $resourceGroup 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  App Service found: $appServiceName" -ForegroundColor Green
            
            # Check .NET version
            $dotnetVersion = az webapp config show --name $appServiceName --resource-group $resourceGroup --query netFrameworkVersion -o tsv
            Write-Host "  .NET version: $dotnetVersion" -ForegroundColor Green
            
            if ($dotnetVersion -notlike "*8.0*") {
                Write-Host "  WARNING: App Service .NET version is not 8.0. This may cause issues." -ForegroundColor Yellow
            }
        } else {
            Write-Host "  WARNING: App Service not found: $appServiceName" -ForegroundColor Yellow
            Write-Host "  Make sure the App Service name and resource group are correct." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  WARNING: Not logged in to Azure. Run 'az login' to log in." -ForegroundColor Yellow
    }
}

# Summary
Write-Host "`nTest Solution Summary:" -ForegroundColor Green
Write-Host "  - .NET SDK: $dotnetVersion" -ForegroundColor White
Write-Host "  - Project: $projectFile" -ForegroundColor White
Write-Host "  - Build: Success" -ForegroundColor White
if ($LASTEXITCODE -eq 0) {
    Write-Host "  - Tests: Passed" -ForegroundColor White
} else {
    Write-Host "  - Tests: Failed" -ForegroundColor White
}
Write-Host "  - Publish: Success" -ForegroundColor White
Write-Host "  - Published files: $(Get-ChildItem -Path $publishDir | Measure-Object | Select-Object -ExpandProperty Count)" -ForegroundColor White

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Review any warnings or errors above" -ForegroundColor White
Write-Host "  2. Fix any issues before deploying to Azure" -ForegroundColor White
Write-Host "  3. Deploy to Azure using GitHub Actions or Azure CLI" -ForegroundColor White

# Return to the original directory
Set-Location -Path $currentDir 