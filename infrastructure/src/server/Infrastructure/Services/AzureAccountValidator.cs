using System;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Options;
using PropertyManagement.Infrastructure.Configuration;
using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.Resources;
using Azure.ResourceManager.AppService;
using Azure.ResourceManager.Storage;
using Azure.ResourceManager.KeyVault;

namespace PropertyManagement.Infrastructure.Services
{
    public interface IAzureAccountValidator
    {
        Task<AzureAccountValidationResult> ValidateAccountAsync();
    }

    public class AzureAccountValidationResult
    {
        public bool IsValid { get; set; }
        public string SubscriptionId { get; set; }
        public string TenantId { get; set; }
        public List<string> AvailableRegions { get; set; } = new List<string>();
        public List<string> MissingPermissions { get; set; } = new List<string>();
        public List<string> MissingResources { get; set; } = new List<string>();
        public List<string> Warnings { get; set; } = new List<string>();
    }

    public class AzureAccountValidator : IAzureAccountValidator
    {
        private readonly AzureSettings _azureSettings;
        private readonly ArmClient _armClient;

        public AzureAccountValidator(IOptions<AzureSettings> azureSettings)
        {
            _azureSettings = azureSettings.Value;
            
            // Initialize the ARM client with DefaultAzureCredential
            var credential = new DefaultAzureCredential();
            _armClient = new ArmClient(credential);
        }

        public async Task<AzureAccountValidationResult> ValidateAccountAsync()
        {
            var result = new AzureAccountValidationResult();
            
            try
            {
                // Get subscription information
                var subscription = await _armClient.GetDefaultSubscriptionAsync();
                result.SubscriptionId = subscription.Data.SubscriptionId;
                result.TenantId = subscription.Data.TenantId;
                result.IsValid = true;

                // Check available regions
                var locations = await subscription.GetLocationsAsync();
                foreach (var location in locations)
                {
                    result.AvailableRegions.Add(location.Name);
                }

                // Check if the specified region is available
                if (!result.AvailableRegions.Contains(_azureSettings.Region))
                {
                    result.Warnings.Add($"Specified region '{_azureSettings.Region}' is not available in your subscription.");
                }

                // Check for required resource providers
                await CheckResourceProvidersAsync(subscription, result);

                // Check for existing resources
                await CheckExistingResourcesAsync(subscription, result);

                // Check for required permissions
                await CheckPermissionsAsync(subscription, result);
            }
            catch (Exception ex)
            {
                result.IsValid = false;
                result.Warnings.Add($"Error validating Azure account: {ex.Message}");
            }

            return result;
        }

        private async Task CheckResourceProvidersAsync(SubscriptionResource subscription, AzureAccountValidationResult result)
        {
            var resourceProviders = await subscription.GetResourceProvidersAsync();
            var requiredProviders = new List<string>
            {
                "Microsoft.Web",           // App Service
                "Microsoft.Storage",       // Storage
                "Microsoft.KeyVault",      // Key Vault
                "Microsoft.Sql",           // SQL Database
                "Microsoft.Insights",      // Application Insights
                "Microsoft.Authorization"  // Role-based access control
            };

            foreach (var provider in requiredProviders)
            {
                bool found = false;
                await foreach (var rp in resourceProviders)
                {
                    if (rp.Data.Namespace == provider)
                    {
                        found = true;
                        break;
                    }
                }

                if (!found)
                {
                    result.MissingResources.Add($"Resource provider '{provider}' is not registered in your subscription.");
                }
            }
        }

        private async Task CheckExistingResourcesAsync(SubscriptionResource subscription, AzureAccountValidationResult result)
        {
            // Check for existing resource group
            var resourceGroup = await subscription.GetResourceGroupAsync(_azureSettings.ResourceGroup);
            if (resourceGroup == null)
            {
                result.Warnings.Add($"Resource group '{_azureSettings.ResourceGroup}' does not exist and will need to be created.");
            }

            // Check for existing app service
            var appServiceName = _azureSettings.AppServiceName;
            var appService = await subscription.GetWebAppsAsync();
            bool appServiceExists = false;
            await foreach (var app in appService)
            {
                if (app.Data.Name == appServiceName)
                {
                    appServiceExists = true;
                    break;
                }
            }

            if (!appServiceExists)
            {
                result.Warnings.Add($"App Service '{appServiceName}' does not exist and will need to be created.");
            }

            // Check for existing key vault
            var keyVaults = await subscription.GetKeyVaultsAsync();
            bool keyVaultExists = false;
            await foreach (var kv in keyVaults)
            {
                if (kv.Data.Name == "property-management-kv")
                {
                    keyVaultExists = true;
                    break;
                }
            }

            if (!keyVaultExists)
            {
                result.Warnings.Add($"Key Vault 'property-management-kv' does not exist and will need to be created.");
            }
        }

        private async Task CheckPermissionsAsync(SubscriptionResource subscription, AzureAccountValidationResult result)
        {
            // This is a simplified check - in a real implementation, you would use Azure RBAC APIs
            // to check for specific role assignments
            try
            {
                // Try to list resource groups as a basic permission check
                var resourceGroups = subscription.GetResourceGroups();
                await foreach (var rg in resourceGroups.GetAllAsync())
                {
                    // Just try to get the first one to verify permissions
                    break;
                }
            }
            catch (Exception)
            {
                result.MissingPermissions.Add("Insufficient permissions to manage resource groups.");
            }

            try
            {
                // Try to list web apps as a basic permission check
                var webApps = subscription.GetWebAppsAsync();
                await foreach (var app in webApps)
                {
                    // Just try to get the first one to verify permissions
                    break;
                }
            }
            catch (Exception)
            {
                result.MissingPermissions.Add("Insufficient permissions to manage web apps.");
            }
        }
    }
} 