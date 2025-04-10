using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Core.Interfaces
{
    public interface ILeaseRepository : IRepository<Lease>
    {
        Task<IEnumerable<Lease>> GetLeasesByPropertyAsync(Guid propertyId);
        Task<IEnumerable<Lease>> GetLeasesByTenantAsync(Guid tenantId);
        Task<IEnumerable<Lease>> GetLeasesByStatusAsync(LeaseStatus status);
        Task<IEnumerable<Lease>> GetExpiringLeasesAsync(int daysThreshold);
        Task<IEnumerable<Lease>> GetLeasesByDateRangeAsync(DateTime startDate, DateTime endDate);
        Task<IEnumerable<Lease>> GetLeasesByRentRangeAsync(decimal minRent, decimal maxRent);
        Task<Lease> GetLeaseWithDetailsAsync(Guid id);
        Task<IEnumerable<Lease>> SearchLeasesAsync(string searchTerm);
        Task<IEnumerable<Lease>> GetLeasesByPropertyAndStatusAsync(Guid propertyId, LeaseStatus status);
        Task<IEnumerable<Lease>> GetLeasesByPropertyAndExpiringAsync(Guid propertyId, int daysThreshold);
        Task<IEnumerable<Lease>> GetLeasesByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Lease>> GetLeasesByPropertyAndRentRangeAsync(Guid propertyId, decimal minRent, decimal maxRent);
        Task<IEnumerable<Lease>> GetLeasesByTenantAndStatusAsync(Guid tenantId, LeaseStatus status);
        Task<IEnumerable<Lease>> GetLeasesByTenantAndExpiringAsync(Guid tenantId, int daysThreshold);
        Task<IEnumerable<Lease>> GetLeasesByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Lease>> GetLeasesByTenantAndRentRangeAsync(Guid tenantId, decimal minRent, decimal maxRent);
        Task<IEnumerable<Lease>> GetLeasesByOwnerAsync(Guid ownerId);
        Task<IEnumerable<Lease>> GetLeasesByOwnerAndStatusAsync(Guid ownerId, LeaseStatus status);
        Task<IEnumerable<Lease>> GetLeasesByOwnerAndExpiringAsync(Guid ownerId, int daysThreshold);
        Task<IEnumerable<Lease>> GetLeasesByOwnerAndDateRangeAsync(Guid ownerId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Lease>> GetLeasesByOwnerAndRentRangeAsync(Guid ownerId, decimal minRent, decimal maxRent);
    }
} 