# Setup Development Environment Script
Write-Host "Checking development environment prerequisites..." -ForegroundColor Green

# Function to check if a command exists
function Test-Command($CommandName) {
    return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

# Check for .NET SDK
if (-not (Test-Command "dotnet")) {
    Write-Host ".NET SDK is not installed. Please install .NET 8.0 SDK from:" -ForegroundColor Red
    Write-Host "https://dotnet.microsoft.com/download/dotnet/8.0" -ForegroundColor Yellow
    exit 1
}

# Check for Node.js
if (-not (Test-Command "node")) {
    Write-Host "Node.js is not installed. Please install Node.js from:" -ForegroundColor Red
    Write-Host "https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check for npm
if (-not (Test-Command "npm")) {
    Write-Host "npm is not installed. Please install Node.js (includes npm) from:" -ForegroundColor Red
    Write-Host "https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check for Git
if (-not (Test-Command "git")) {
    Write-Host "Git is not installed. Please install Git from:" -ForegroundColor Red
    Write-Host "https://git-scm.com/downloads" -ForegroundColor Yellow
    exit 1
}

# Check for Azure CLI
if (-not (Test-Command "az")) {
    Write-Host "Azure CLI is not installed. Please install Azure CLI from:" -ForegroundColor Red
    Write-Host "https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Yellow
    exit 1
}

Write-Host "All prerequisites are installed!" -ForegroundColor Green

# Create solution structure
Write-Host "Creating solution structure..." -ForegroundColor Green

# Create directories
$directories = @(
    "src\client",
    "src\server\API",
    "src\server\Core",
    "src\server\Infrastructure",
    "src\server\Application",
    "src\shared",
    "tests",
    "docs",
    "infrastructure"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force
        Write-Host "Created directory: $dir" -ForegroundColor Gray
    }
}

# Create .NET solution and projects
Set-Location src\server
Write-Host "Creating .NET solution and projects..." -ForegroundColor Green

dotnet new sln -n PropertyManagement
dotnet new webapi -n API
dotnet new classlib -n Core
dotnet new classlib -n Infrastructure
dotnet new classlib -n Application

# Add projects to solution
dotnet sln add API\API.csproj
dotnet sln add Core\Core.csproj
dotnet sln add Infrastructure\Infrastructure.csproj
dotnet sln add Application\Application.csproj

# Add project references
Set-Location API
dotnet add reference ..\Core\Core.csproj
dotnet add reference ..\Infrastructure\Infrastructure.csproj
dotnet add reference ..\Application\Application.csproj

Set-Location ..\Infrastructure
dotnet add reference ..\Core\Core.csproj
dotnet add reference ..\Application\Application.csproj

Set-Location ..\Application
dotnet add reference ..\Core\Core.csproj

# Return to root directory
Set-Location ..\..\..

# Initialize React frontend
Write-Host "Setting up React frontend..." -ForegroundColor Green
Set-Location src\client
npx create-react-app . --template typescript

Write-Host "Development environment setup complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Install .NET SDK 8.0 if not already installed" -ForegroundColor White
Write-Host "2. Install Node.js if not already installed" -ForegroundColor White
Write-Host "3. Install Azure CLI if not already installed" -ForegroundColor White
Write-Host "4. Run 'az login' to connect to your Azure account" -ForegroundColor White
Write-Host "5. Follow the README.md for further setup instructions" -ForegroundColor White 