using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Core.Interfaces
{
    public interface ILeaseService : IService<Lease>
    {
        Task<IEnumerable<Lease>> GetLeasesByPropertyAsync(Guid propertyId);
        Task<IEnumerable<Lease>> GetLeasesByTenantAsync(Guid tenantId);
        Task<IEnumerable<Lease>> GetLeasesByStatusAsync(LeaseStatus status);
        Task<IEnumerable<Lease>> GetExpiringLeasesAsync(int daysThreshold);
        Task<IEnumerable<Lease>> GetLeasesWithPastDuePaymentsAsync();
        Task<Lease> GetLeaseWithDetailsAsync(Guid id);
        Task<IEnumerable<Lease>> SearchLeasesAsync(string searchTerm);
        Task<IEnumerable<Lease>> GetLeasesByStartDateAsync(DateTime startDate);
        Task<IEnumerable<Lease>> GetLeasesByEndDateAsync(DateTime endDate);
        Task<IEnumerable<Lease>> GetLeasesByRentRangeAsync(decimal minRent, decimal maxRent);
        Task<IEnumerable<Lease>> GetLeasesByPropertyAndStatusAsync(Guid propertyId, LeaseStatus status);
        Task<IEnumerable<Lease>> GetLeasesByPropertyAndExpiringAsync(Guid propertyId, int daysThreshold);
        Task<IEnumerable<Lease>> GetLeasesByPropertyAndPastDuePaymentsAsync(Guid propertyId);
        Task<IEnumerable<Lease>> GetLeasesByPropertyAndSearchTermAsync(Guid propertyId, string searchTerm);
        Task<IEnumerable<Lease>> GetLeasesByTenantAndStatusAsync(Guid tenantId, LeaseStatus status);
        Task<IEnumerable<Lease>> GetLeasesByTenantAndExpiringAsync(Guid tenantId, int daysThreshold);
        Task<IEnumerable<Lease>> GetLeasesByTenantAndPastDuePaymentsAsync(Guid tenantId);
        Task<IEnumerable<Lease>> GetLeasesByTenantAndSearchTermAsync(Guid tenantId, string searchTerm);
    }
} 