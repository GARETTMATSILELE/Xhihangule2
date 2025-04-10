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
    public class MaintenanceRequestRepository : Repository<MaintenanceRequest>, IMaintenanceRequestRepository
    {
        public MaintenanceRequestRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAsync(Guid propertyId)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.PropertyId == propertyId)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAsync(Guid tenantId)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.TenantId == tenantId)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByStatusAsync(MaintenanceStatus status)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.Status == status)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPriorityAsync(MaintenancePriority priority)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.Priority == priority)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByDateRangeAsync(DateTime startDate, DateTime endDate)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.RequestDate >= startDate && m.RequestDate <= endDate)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<MaintenanceRequest> GetMaintenanceRequestWithDetailsAsync(Guid id)
        {
            return await _context.Set<MaintenanceRequest>()
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .FirstOrDefaultAsync(m => m.Id == id);
        }

        public async Task<IEnumerable<MaintenanceRequest>> SearchMaintenanceRequestsAsync(string searchTerm)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.Title.Contains(searchTerm) || m.Description.Contains(searchTerm))
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndStatusAsync(Guid propertyId, MaintenanceStatus status)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.PropertyId == propertyId && m.Status == status)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndPriorityAsync(Guid propertyId, MaintenancePriority priority)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.PropertyId == propertyId && m.Priority == priority)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.PropertyId == propertyId && m.RequestDate >= startDate && m.RequestDate <= endDate)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndSearchTermAsync(Guid propertyId, string searchTerm)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.PropertyId == propertyId && (m.Title.Contains(searchTerm) || m.Description.Contains(searchTerm)))
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndStatusAsync(Guid tenantId, MaintenanceStatus status)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.TenantId == tenantId && m.Status == status)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndPriorityAsync(Guid tenantId, MaintenancePriority priority)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.TenantId == tenantId && m.Priority == priority)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.TenantId == tenantId && m.RequestDate >= startDate && m.RequestDate <= endDate)
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndSearchTermAsync(Guid tenantId, string searchTerm)
        {
            return await _context.Set<MaintenanceRequest>()
                .Where(m => m.TenantId == tenantId && (m.Title.Contains(searchTerm) || m.Description.Contains(searchTerm)))
                .Include(m => m.Property)
                .Include(m => m.Tenant)
                .Include(m => m.Documents)
                .Include(m => m.Comments)
                .ToListAsync();
        }
    }
} 