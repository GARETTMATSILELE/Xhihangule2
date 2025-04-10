using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using PropertyManagement.Core.Interfaces;
using PropertyManagement.Core.Models;
using PropertyManagement.Infrastructure.Data;

namespace PropertyManagement.Infrastructure.Services
{
    public class PropertyService : Service<Property>, IPropertyService
    {
        private readonly IPropertyRepository _propertyRepository;

        public PropertyService(ApplicationDbContext context, IPropertyRepository propertyRepository) 
            : base(context)
        {
            _propertyRepository = propertyRepository;
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAsync(Guid ownerId)
        {
            return await _propertyRepository.GetPropertiesByOwnerAsync(ownerId);
        }

        public async Task<IEnumerable<Property>> GetAvailablePropertiesAsync()
        {
            return await _propertyRepository.GetAvailablePropertiesAsync();
        }

        public async Task<IEnumerable<Property>> GetPropertiesByTypeAsync(PropertyType type)
        {
            return await _propertyRepository.GetPropertiesByTypeAsync(type);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByStatusAsync(PropertyStatus status)
        {
            return await _propertyRepository.GetPropertiesByStatusAsync(status);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByCityAsync(string city)
        {
            return await _propertyRepository.GetPropertiesByCityAsync(city);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByStateAsync(string state)
        {
            return await _propertyRepository.GetPropertiesByStateAsync(state);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByPriceRangeAsync(decimal minPrice, decimal maxPrice)
        {
            return await _propertyRepository.GetPropertiesByPriceRangeAsync(minPrice, maxPrice);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByRentRangeAsync(decimal minRent, decimal maxRent)
        {
            return await _propertyRepository.GetPropertiesByRentRangeAsync(minRent, maxRent);
        }

        public async Task<IEnumerable<Property>> GetPropertiesWithExpiringLeasesAsync(int daysThreshold)
        {
            return await _propertyRepository.GetPropertiesWithExpiringLeasesAsync(daysThreshold);
        }

        public async Task<IEnumerable<Property>> GetPropertiesWithMaintenanceIssuesAsync()
        {
            return await _propertyRepository.GetPropertiesWithMaintenanceIssuesAsync();
        }

        public async Task<Property> GetPropertyWithDetailsAsync(Guid id)
        {
            return await _propertyRepository.GetPropertyWithDetailsAsync(id);
        }

        public async Task<IEnumerable<Property>> SearchPropertiesAsync(string searchTerm)
        {
            return await _propertyRepository.SearchPropertiesAsync(searchTerm);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndStatusAsync(Guid ownerId, PropertyStatus status)
        {
            return await _propertyRepository.GetPropertiesByOwnerAndStatusAsync(ownerId, status);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndTypeAsync(Guid ownerId, PropertyType type)
        {
            return await _propertyRepository.GetPropertiesByOwnerAndTypeAsync(ownerId, type);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndCityAsync(Guid ownerId, string city)
        {
            return await _propertyRepository.GetPropertiesByOwnerAndCityAsync(ownerId, city);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndStateAsync(Guid ownerId, string state)
        {
            return await _propertyRepository.GetPropertiesByOwnerAndStateAsync(ownerId, state);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndPriceRangeAsync(Guid ownerId, decimal minPrice, decimal maxPrice)
        {
            return await _propertyRepository.GetPropertiesByOwnerAndPriceRangeAsync(ownerId, minPrice, maxPrice);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndRentRangeAsync(Guid ownerId, decimal minRent, decimal maxRent)
        {
            return await _propertyRepository.GetPropertiesByOwnerAndRentRangeAsync(ownerId, minRent, maxRent);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndExpiringLeasesAsync(Guid ownerId, int daysThreshold)
        {
            return await _propertyRepository.GetPropertiesByOwnerAndExpiringLeasesAsync(ownerId, daysThreshold);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndMaintenanceIssuesAsync(Guid ownerId)
        {
            return await _propertyRepository.GetPropertiesByOwnerAndMaintenanceIssuesAsync(ownerId);
        }

        public async Task<IEnumerable<Property>> GetPropertiesByOwnerAndSearchTermAsync(Guid ownerId, string searchTerm)
        {
            return await _propertyRepository.GetPropertiesByOwnerAndSearchTermAsync(ownerId, searchTerm);
        }
    }
} 