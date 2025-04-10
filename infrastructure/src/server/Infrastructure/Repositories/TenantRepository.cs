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
    public class TenantRepository : Repository<Tenant>, ITenantRepository
    {
        public TenantRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAsync(Guid propertyId)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId))
                .Include(t => t.Leases)
                .Include(t => t.MaintenanceRequests)
                .Include(t => t.Payments)
                .Include(t => t.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByStatusAsync(TenantStatus status)
        {
            return await _dbSet
                .Where(t => t.Status == status)
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsWithExpiringLeasesAsync(int daysThreshold)
        {
            var thresholdDate = DateTime.UtcNow.AddDays(daysThreshold);
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.EndDate <= thresholdDate && l.Status == LeaseStatus.Active))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsWithPastDuePaymentsAsync()
        {
            return await _dbSet
                .Where(t => t.Payments.Any(p => p.Status == PaymentStatus.Late || p.Status == PaymentStatus.Overdue))
                .Include(t => t.Payments)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsWithMaintenanceRequestsAsync()
        {
            return await _dbSet
                .Where(t => t.MaintenanceRequests.Any(m => m.Status == MaintenanceStatus.New || m.Status == MaintenanceStatus.InProgress))
                .Include(t => t.MaintenanceRequests)
                .ToListAsync();
        }

        public async Task<Tenant> GetTenantWithDetailsAsync(Guid id)
        {
            return await _dbSet
                .Include(t => t.Leases)
                .Include(t => t.MaintenanceRequests)
                .Include(t => t.Payments)
                .Include(t => t.Documents)
                .FirstOrDefaultAsync(t => t.Id == id);
        }

        public async Task<IEnumerable<Tenant>> SearchTenantsAsync(string searchTerm)
        {
            return await _dbSet
                .Where(t => t.FirstName.Contains(searchTerm) || 
                           t.LastName.Contains(searchTerm) || 
                           t.Email.Contains(searchTerm) || 
                           t.Phone.Contains(searchTerm))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByCityAsync(string city)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.Property.City == city))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByStateAsync(string state)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.Property.State == state))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByIncomeRangeAsync(decimal minIncome, decimal maxIncome)
        {
            return await _dbSet
                .Where(t => t.MonthlyIncome >= minIncome && t.MonthlyIncome <= maxIncome)
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByLeaseStartDateRangeAsync(DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.StartDate >= startDate && l.StartDate <= endDate))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByLeaseEndDateRangeAsync(DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.EndDate >= startDate && l.EndDate <= endDate))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndStatusAsync(Guid propertyId, TenantStatus status)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId) && t.Status == status)
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndExpiringLeasesAsync(Guid propertyId, int daysThreshold)
        {
            var thresholdDate = DateTime.UtcNow.AddDays(daysThreshold);
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId && l.EndDate <= thresholdDate && l.Status == LeaseStatus.Active))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndPastDuePaymentsAsync(Guid propertyId)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId) && 
                           t.Payments.Any(p => p.Status == PaymentStatus.Late || p.Status == PaymentStatus.Overdue))
                .Include(t => t.Leases)
                .Include(t => t.Payments)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndMaintenanceRequestsAsync(Guid propertyId)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId) && 
                           t.MaintenanceRequests.Any(m => m.Status == MaintenanceStatus.New || m.Status == MaintenanceStatus.InProgress))
                .Include(t => t.Leases)
                .Include(t => t.MaintenanceRequests)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndSearchTermAsync(Guid propertyId, string searchTerm)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId) && 
                           (t.FirstName.Contains(searchTerm) || 
                            t.LastName.Contains(searchTerm) || 
                            t.Email.Contains(searchTerm) || 
                            t.Phone.Contains(searchTerm)))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndCityAsync(Guid propertyId, string city)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId && l.Property.City == city))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndStateAsync(Guid propertyId, string state)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId && l.Property.State == state))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndIncomeRangeAsync(Guid propertyId, decimal minIncome, decimal maxIncome)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId) && 
                           t.MonthlyIncome >= minIncome && t.MonthlyIncome <= maxIncome)
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndLeaseStartDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId && l.StartDate >= startDate && l.StartDate <= endDate))
                .Include(t => t.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndLeaseEndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(t => t.Leases.Any(l => l.PropertyId == propertyId && l.EndDate >= startDate && l.EndDate <= endDate))
                .Include(t => t.Leases)
                .ToListAsync();
        }
    }
} 