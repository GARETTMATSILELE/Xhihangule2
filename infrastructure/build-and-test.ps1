# Build and test script for Property Management application
Write-Host "Building and testing Property Management application..." -ForegroundColor Green

# Navigate to the server directory
Set-Location -Path "src/server"

# Restore dependencies
Write-Host "Restoring dependencies..." -ForegroundColor Cyan
dotnet restore

# Build the application
Write-Host "Building the application..." -ForegroundColor Cyan
dotnet build --configuration Release

# Run tests
Write-Host "Running tests..." -ForegroundColor Cyan
dotnet test --no-build

# Create publish directory if it doesn't exist
if (-not (Test-Path -Path "./publish")) {
    New-Item -ItemType Directory -Path "./publish" | Out-Null
}

# Publish the application
Write-Host "Publishing the application..." -ForegroundColor Cyan
dotnet publish --configuration Release --output ./publish

# Check if publish was successful
if (Test-Path -Path "./publish") {
    Write-Host "Publish successful! Files are in the ./publish directory." -ForegroundColor Green
    Write-Host "You can now deploy these files to Azure App Service." -ForegroundColor Green
    
    # List the published files
    Write-Host "Published files:" -ForegroundColor Cyan
    Get-ChildItem -Path "./publish" | ForEach-Object {
        Write-Host "  - $($_.Name)" -ForegroundColor White
    }
} else {
    Write-Host "Publish failed. Check the error messages above." -ForegroundColor Red
}

# Return to the original directory
Set-Location -Path "../../" 