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
    public class MaintenanceRepository : Repository<MaintenanceRequest>, IMaintenanceRepository
    {
        public MaintenanceRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAsync(Guid propertyId)
        {
            return await _dbSet
                .Where(m => m.PropertyId == propertyId)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAsync(Guid tenantId)
        {
            return await _dbSet
                .Where(m => m.TenantId == tenantId)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByStatusAsync(MaintenanceStatus status)
        {
            return await _dbSet
                .Where(m => m.Status == status)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPriorityAsync(MaintenancePriority priority)
        {
            return await _dbSet
                .Where(m => m.Priority == priority)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByCategoryAsync(MaintenanceCategory category)
        {
            return await _dbSet
                .Where(m => m.Category == category)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByDateRangeAsync(DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(m => m.RequestDate >= startDate && m.RequestDate <= endDate)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByCostRangeAsync(decimal minCost, decimal maxCost)
        {
            return await _dbSet
                .Where(m => m.ActualCost >= minCost && m.ActualCost <= maxCost)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<MaintenanceRequest> GetMaintenanceRequestWithDetailsAsync(Guid id)
        {
            return await _dbSet
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .FirstOrDefaultAsync(m => m.Id == id);
        }

        public async Task<IEnumerable<MaintenanceRequest>> SearchMaintenanceRequestsAsync(string searchTerm)
        {
            return await _dbSet
                .Where(m => m.Title.Contains(searchTerm) || 
                           m.Description.Contains(searchTerm) || 
                           m.Property.Name.Contains(searchTerm) || 
                           m.Property.Address.Contains(searchTerm) || 
                           m.Tenant.FirstName.Contains(searchTerm) || 
                           m.Tenant.LastName.Contains(searchTerm))
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndStatusAsync(Guid propertyId, MaintenanceStatus status)
        {
            return await _dbSet
                .Where(m => m.PropertyId == propertyId && m.Status == status)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndPriorityAsync(Guid propertyId, MaintenancePriority priority)
        {
            return await _dbSet
                .Where(m => m.PropertyId == propertyId && m.Priority == priority)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndCategoryAsync(Guid propertyId, MaintenanceCategory category)
        {
            return await _dbSet
                .Where(m => m.PropertyId == propertyId && m.Category == category)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(m => m.PropertyId == propertyId && m.RequestDate >= startDate && m.RequestDate <= endDate)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndCostRangeAsync(Guid propertyId, decimal minCost, decimal maxCost)
        {
            return await _dbSet
                .Where(m => m.PropertyId == propertyId && m.ActualCost >= minCost && m.ActualCost <= maxCost)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndStatusAsync(Guid tenantId, MaintenanceStatus status)
        {
            return await _dbSet
                .Where(m => m.TenantId == tenantId && m.Status == status)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndPriorityAsync(Guid tenantId, MaintenancePriority priority)
        {
            return await _dbSet
                .Where(m => m.TenantId == tenantId && m.Priority == priority)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndCategoryAsync(Guid tenantId, MaintenanceCategory category)
        {
            return await _dbSet
                .Where(m => m.TenantId == tenantId && m.Category == category)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(m => m.TenantId == tenantId && m.RequestDate >= startDate && m.RequestDate <= endDate)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndCostRangeAsync(Guid tenantId, decimal minCost, decimal maxCost)
        {
            return await _dbSet
                .Where(m => m.TenantId == tenantId && m.ActualCost >= minCost && m.ActualCost <= maxCost)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAsync(Guid ownerId)
        {
            return await _dbSet
                .Where(m => m.Property.OwnerId == ownerId)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAndStatusAsync(Guid ownerId, MaintenanceStatus status)
        {
            return await _dbSet
                .Where(m => m.Property.OwnerId == ownerId && m.Status == status)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAndPriorityAsync(Guid ownerId, MaintenancePriority priority)
        {
            return await _dbSet
                .Where(m => m.Property.OwnerId == ownerId && m.Priority == priority)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAndCategoryAsync(Guid ownerId, MaintenanceCategory category)
        {
            return await _dbSet
                .Where(m => m.Property.OwnerId == ownerId && m.Category == category)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAndDateRangeAsync(Guid ownerId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(m => m.Property.OwnerId == ownerId && m.RequestDate >= startDate && m.RequestDate <= endDate)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAndCostRangeAsync(Guid ownerId, decimal minCost, decimal maxCost)
        {
            return await _dbSet
                .Where(m => m.Property.OwnerId == ownerId && m.ActualCost >= minCost && m.ActualCost <= maxCost)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .ToListAsync();
        }
    }
} 