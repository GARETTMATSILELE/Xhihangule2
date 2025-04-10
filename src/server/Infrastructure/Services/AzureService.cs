using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using PropertyManagement.Infrastructure.Configuration;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;

namespace PropertyManagement.Infrastructure.Services
{
    public interface IAzureService
    {
        Task<string> GetSecretAsync(string secretName);
        Task<bool> ValidateAzureCredentialsAsync();
    }

    public class AzureService : IAzureService
    {
        private readonly AzureSettings _azureSettings;
        private readonly SecretClient _secretClient;

        public AzureService(IOptions<AzureSettings> azureSettings)
        {
            _azureSettings = azureSettings.Value;
            
            if (string.IsNullOrEmpty(_azureSettings.KeyVaultUri))
            {
                throw new ArgumentException("KeyVaultUri is not configured in AzureSettings");
            }
            
            // Initialize the SecretClient with DefaultAzureCredential
            var credential = new DefaultAzureCredential();
            _secretClient = new SecretClient(new Uri(_azureSettings.KeyVaultUri), credential);
        }

        public async Task<string> GetSecretAsync(string secretName)
        {
            try
            {
                var secret = await _secretClient.GetSecretAsync(secretName);
                return secret.Value.Value;
            }
            catch (Exception ex)
            {
                // Log the error appropriately
                throw new Exception($"Failed to retrieve secret {secretName}: {ex.Message}");
            }
        }

        public async Task<bool> ValidateAzureCredentialsAsync()
        {
            try
            {
                // Try to access Key Vault to validate credentials
                await foreach (var secret in _secretClient.GetPropertiesOfSecretsAsync())
                {
                    // Just try to get the first one to verify access
                    break;
                }
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }
    }
} 