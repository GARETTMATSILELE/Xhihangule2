using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Core.Interfaces
{
    public interface IPropertyRepository : IRepository<Property>
    {
        Task<IEnumerable<Property>> GetPropertiesByOwnerAsync(Guid ownerId);
        Task<IEnumerable<Property>> GetAvailablePropertiesAsync();
        Task<IEnumerable<Property>> GetPropertiesByTypeAsync(PropertyType type);
        Task<IEnumerable<Property>> GetPropertiesByStatusAsync(PropertyStatus status);
        Task<IEnumerable<Property>> GetPropertiesByCityAsync(string city);
        Task<IEnumerable<Property>> GetPropertiesByStateAsync(string state);
        Task<IEnumerable<Property>> GetPropertiesByPriceRangeAsync(decimal minPrice, decimal maxPrice);
        Task<IEnumerable<Property>> GetPropertiesByRentRangeAsync(decimal minRent, decimal maxRent);
        Task<IEnumerable<Property>> GetPropertiesWithExpiringLeasesAsync(int daysThreshold);
        Task<IEnumerable<Property>> GetPropertiesWithMaintenanceIssuesAsync();
        Task<Property> GetPropertyWithDetailsAsync(Guid id);
        Task<IEnumerable<Property>> SearchPropertiesAsync(string searchTerm);
        Task<IEnumerable<Property>> GetPropertiesByOwnerAndStatusAsync(Guid ownerId, PropertyStatus status);
        Task<IEnumerable<Property>> GetPropertiesByOwnerAndTypeAsync(Guid ownerId, PropertyType type);
        Task<IEnumerable<Property>> GetPropertiesByOwnerAndCityAsync(Guid ownerId, string city);
        Task<IEnumerable<Property>> GetPropertiesByOwnerAndStateAsync(Guid ownerId, string state);
        Task<IEnumerable<Property>> GetPropertiesByOwnerAndPriceRangeAsync(Guid ownerId, decimal minPrice, decimal maxPrice);
        Task<IEnumerable<Property>> GetPropertiesByOwnerAndRentRangeAsync(Guid ownerId, decimal minRent, decimal maxRent);
        Task<IEnumerable<Property>> GetPropertiesByOwnerAndExpiringLeasesAsync(Guid ownerId, int daysThreshold);
        Task<IEnumerable<Property>> GetPropertiesByOwnerAndMaintenanceIssuesAsync(Guid ownerId);
        Task<IEnumerable<Property>> GetPropertiesByOwnerAndSearchTermAsync(Guid ownerId, string searchTerm);
    }
} 