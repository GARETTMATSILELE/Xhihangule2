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
    public class PropertyRepository : Repository<Property>, IPropertyRepository
    {
        public PropertyRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAsync(Guid ownerId)
        {
            return await _dbSet
                .Where(p => p.OwnerId == ownerId)
                .Include(p => p.Owner)
                .Include(p => p.Leases)
                .Include(p => p.MaintenanceRequests)
                .Include(p => p.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetAvailablePropertiesAsync()
        {
            return await _dbSet
                .Where(p => p.Status == PropertyStatus.Available)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByTypeAsync(PropertyType type)
        {
            return await _dbSet
                .Where(p => p.Type == type)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByStatusAsync(PropertyStatus status)
        {
            return await _dbSet
                .Where(p => p.Status == status)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByCityAsync(string city)
        {
            return await _dbSet
                .Where(p => p.City == city)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByStateAsync(string state)
        {
            return await _dbSet
                .Where(p => p.State == state)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByPriceRangeAsync(decimal minPrice, decimal maxPrice)
        {
            return await _dbSet
                .Where(p => p.PurchasePrice >= minPrice && p.PurchasePrice <= maxPrice)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByRentRangeAsync(decimal minRent, decimal maxRent)
        {
            return await _dbSet
                .Where(p => p.MonthlyRent >= minRent && p.MonthlyRent <= maxRent)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesWithExpiringLeasesAsync(int daysThreshold)
        {
            var thresholdDate = DateTime.UtcNow.AddDays(daysThreshold);
            return await _dbSet
                .Where(p => p.Leases.Any(l => l.EndDate <= thresholdDate && l.Status == LeaseStatus.Active))
                .Include(p => p.Owner)
                .Include(p => p.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesWithMaintenanceIssuesAsync()
        {
            return await _dbSet
                .Where(p => p.MaintenanceRequests.Any(m => m.Status == MaintenanceStatus.New || m.Status == MaintenanceStatus.InProgress))
                .Include(p => p.Owner)
                .Include(p => p.MaintenanceRequests)
                .ToListAsync();
        }

        public async Task<Property> GetPropertyWithDetailsAsync(Guid id)
        {
            return await _dbSet
                .Include(p => p.Owner)
                .Include(p => p.Leases)
                .Include(p => p.MaintenanceRequests)
                .Include(p => p.Documents)
                .FirstOrDefaultAsync(p => p.Id == id);
        }

        public async Task<IEnumerable<Property>> SearchPropertiesAsync(string searchTerm)
        {
            return await _dbSet
                .Where(p => p.Name.Contains(searchTerm) || 
                           p.Address.Contains(searchTerm) || 
                           p.City.Contains(searchTerm) || 
                           p.State.Contains(searchTerm) || 
                           p.ZipCode.Contains(searchTerm))
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndStatusAsync(Guid ownerId, PropertyStatus status)
        {
            return await _dbSet
                .Where(p => p.OwnerId == ownerId && p.Status == status)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndTypeAsync(Guid ownerId, PropertyType type)
        {
            return await _dbSet
                .Where(p => p.OwnerId == ownerId && p.Type == type)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndCityAsync(Guid ownerId, string city)
        {
            return await _dbSet
                .Where(p => p.OwnerId == ownerId && p.City == city)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndStateAsync(Guid ownerId, string state)
        {
            return await _dbSet
                .Where(p => p.OwnerId == ownerId && p.State == state)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndPriceRangeAsync(Guid ownerId, decimal minPrice, decimal maxPrice)
        {
            return await _dbSet
                .Where(p => p.OwnerId == ownerId && p.PurchasePrice >= minPrice && p.PurchasePrice <= maxPrice)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndRentRangeAsync(Guid ownerId, decimal minRent, decimal maxRent)
        {
            return await _dbSet
                .Where(p => p.OwnerId == ownerId && p.MonthlyRent >= minRent && p.MonthlyRent <= maxRent)
                .Include(p => p.Owner)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndExpiringLeasesAsync(Guid ownerId, int daysThreshold)
        {
            var thresholdDate = DateTime.UtcNow.AddDays(daysThreshold);
            return await _dbSet
                .Where(p => p.OwnerId == ownerId && p.Leases.Any(l => l.EndDate <= thresholdDate && l.Status == LeaseStatus.Active))
                .Include(p => p.Owner)
                .Include(p => p.Leases)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndMaintenanceIssuesAsync(Guid ownerId)
        {
            return await _dbSet
                .Where(p => p.OwnerId == ownerId && p.MaintenanceRequests.Any(m => m.Status == MaintenanceStatus.New || m.Status == MaintenanceStatus.InProgress))
                .Include(p => p.Owner)
                .Include(p => p.MaintenanceRequests)
                .ToListAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndSearchTermAsync(Guid ownerId, string searchTerm)
        {
            return await _dbSet
                .Where(p => p.OwnerId == ownerId && 
                           (p.Name.Contains(searchTerm) || 
                            p.Address.Contains(searchTerm) || 
                            p.City.Contains(searchTerm) || 
                            p.State.Contains(searchTerm) || 
                            p.ZipCode.Contains(searchTerm)))
                .Include(p => p.Owner)
                .ToListAsync();
        }
    }
} 