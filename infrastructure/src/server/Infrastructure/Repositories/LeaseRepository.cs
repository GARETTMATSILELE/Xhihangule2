using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using PropertyManagement.Core.Interfaces;
using PropertyManagement.Core.Models;
using PropertyManagement.Infrastructure.Data;

namespace PropertyManagement.Infrastructure.Repositories
{
    public class LeaseRepository : Repository<Lease>, ILeaseRepository
    {
        public LeaseRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<IEnumerable<Lease>> GetLeasesByPropertyAsync(Guid propertyId)
        {
            return await _dbSet
                .Where(l => l.PropertyId == propertyId)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .Include(l => l.Payments)
                .Include(l => l.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByTenantAsync(Guid tenantId)
        {
            return await _dbSet
                .Where(l => l.TenantId == tenantId)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .Include(l => l.Payments)
                .Include(l => l.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByStatusAsync(LeaseStatus status)
        {
            return await _dbSet
                .Where(l => l.Status == status)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetExpiringLeasesAsync(int daysThreshold)
        {
            var thresholdDate = DateTime.UtcNow.AddDays(daysThreshold);
            return await _dbSet
                .Where(l => l.EndDate <= thresholdDate && l.Status == LeaseStatus.Active)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByDateRangeAsync(DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(l => l.StartDate >= startDate && l.StartDate <= endDate)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByRentRangeAsync(decimal minRent, decimal maxRent)
        {
            return await _dbSet
                .Where(l => l.MonthlyRent >= minRent && l.MonthlyRent <= maxRent)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<Lease> GetLeaseWithDetailsAsync(Guid id)
        {
            return await _dbSet
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .Include(l => l.Payments)
                .Include(l => l.Documents)
                .FirstOrDefaultAsync(l => l.Id == id);
        }

        public async Task<IEnumerable<Lease>> SearchLeasesAsync(string searchTerm)
        {
            return await _dbSet
                .Where(l => l.Property.Name.Contains(searchTerm) || 
                           l.Property.Address.Contains(searchTerm) || 
                           l.Tenant.FirstName.Contains(searchTerm) || 
                           l.Tenant.LastName.Contains(searchTerm))
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByPropertyAndStatusAsync(Guid propertyId, LeaseStatus status)
        {
            return await _dbSet
                .Where(l => l.PropertyId == propertyId && l.Status == status)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByPropertyAndExpiringAsync(Guid propertyId, int daysThreshold)
        {
            var thresholdDate = DateTime.UtcNow.AddDays(daysThreshold);
            return await _dbSet
                .Where(l => l.PropertyId == propertyId && l.EndDate <= thresholdDate && l.Status == LeaseStatus.Active)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(l => l.PropertyId == propertyId && l.StartDate >= startDate && l.StartDate <= endDate)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByPropertyAndRentRangeAsync(Guid propertyId, decimal minRent, decimal maxRent)
        {
            return await _dbSet
                .Where(l => l.PropertyId == propertyId && l.MonthlyRent >= minRent && l.MonthlyRent <= maxRent)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByTenantAndStatusAsync(Guid tenantId, LeaseStatus status)
        {
            return await _dbSet
                .Where(l => l.TenantId == tenantId && l.Status == status)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByTenantAndExpiringAsync(Guid tenantId, int daysThreshold)
        {
            var thresholdDate = DateTime.UtcNow.AddDays(daysThreshold);
            return await _dbSet
                .Where(l => l.TenantId == tenantId && l.EndDate <= thresholdDate && l.Status == LeaseStatus.Active)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(l => l.TenantId == tenantId && l.StartDate >= startDate && l.StartDate <= endDate)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByTenantAndRentRangeAsync(Guid tenantId, decimal minRent, decimal maxRent)
        {
            return await _dbSet
                .Where(l => l.TenantId == tenantId && l.MonthlyRent >= minRent && l.MonthlyRent <= maxRent)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByOwnerAsync(Guid ownerId)
        {
            return await _dbSet
                .Where(l => l.Property.OwnerId == ownerId)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByOwnerAndStatusAsync(Guid ownerId, LeaseStatus status)
        {
            return await _dbSet
                .Where(l => l.Property.OwnerId == ownerId && l.Status == status)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByOwnerAndExpiringAsync(Guid ownerId, int daysThreshold)
        {
            var thresholdDate = DateTime.UtcNow.AddDays(daysThreshold);
            return await _dbSet
                .Where(l => l.Property.OwnerId == ownerId && l.EndDate <= thresholdDate && l.Status == LeaseStatus.Active)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByOwnerAndDateRangeAsync(Guid ownerId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(l => l.Property.OwnerId == ownerId && l.StartDate >= startDate && l.StartDate <= endDate)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<Lease>> GetLeasesByOwnerAndRentRangeAsync(Guid ownerId, decimal minRent, decimal maxRent)
        {
            return await _dbSet
                .Where(l => l.Property.OwnerId == ownerId && l.MonthlyRent >= minRent && l.MonthlyRent <= maxRent)
                .Include(l => l.Property)
                .Include(l => l.Tenant)
                .ToListAsync();
        }
    }
} 