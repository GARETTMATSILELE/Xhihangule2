using System;

namespace PropertyManagement.Infrastructure.Configuration
{
    public class AzureSettings
    {
        public string AccountEmail { get; set; } = "garet.matsi@gmail.com";
        public string SubscriptionId { get; set; }
        public string TenantId { get; set; }
        public string ClientId { get; set; }
        public string ClientSecret { get; set; }
        public string StorageConnectionString { get; set; }
        public string KeyVaultUri { get; set; }
        public string AppServiceName { get; set; }
        public string ResourceGroup { get; set; }
        public string Region { get; set; } = "eastus";
    }
} 