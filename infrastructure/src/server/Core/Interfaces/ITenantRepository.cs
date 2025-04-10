using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Core.Interfaces
{
    public interface ITenantRepository : IRepository<Tenant>
    {
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAsync(Guid propertyId);
        Task<IEnumerable<Tenant>> GetTenantsByStatusAsync(TenantStatus status);
        Task<IEnumerable<Tenant>> GetTenantsWithExpiringLeasesAsync(int daysThreshold);
        Task<IEnumerable<Tenant>> GetTenantsWithPastDuePaymentsAsync();
        Task<IEnumerable<Tenant>> GetTenantsWithMaintenanceRequestsAsync();
        Task<Tenant> GetTenantWithDetailsAsync(Guid id);
        Task<IEnumerable<Tenant>> SearchTenantsAsync(string searchTerm);
        Task<IEnumerable<Tenant>> GetTenantsByCityAsync(string city);
        Task<IEnumerable<Tenant>> GetTenantsByStateAsync(string state);
        Task<IEnumerable<Tenant>> GetTenantsByIncomeRangeAsync(decimal minIncome, decimal maxIncome);
        Task<IEnumerable<Tenant>> GetTenantsByLeaseStartDateRangeAsync(DateTime startDate, DateTime endDate);
        Task<IEnumerable<Tenant>> GetTenantsByLeaseEndDateRangeAsync(DateTime startDate, DateTime endDate);
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAndStatusAsync(Guid propertyId, TenantStatus status);
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAndExpiringLeasesAsync(Guid propertyId, int daysThreshold);
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAndPastDuePaymentsAsync(Guid propertyId);
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAndMaintenanceRequestsAsync(Guid propertyId);
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAndSearchTermAsync(Guid propertyId, string searchTerm);
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAndCityAsync(Guid propertyId, string city);
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAndStateAsync(Guid propertyId, string state);
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAndIncomeRangeAsync(Guid propertyId, decimal minIncome, decimal maxIncome);
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAndLeaseStartDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Tenant>> GetTenantsByPropertyAndLeaseEndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate);
    }
} 