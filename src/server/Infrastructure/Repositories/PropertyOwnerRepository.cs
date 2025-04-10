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
    public class PropertyOwnerRepository : Repository<PropertyOwner>, IPropertyOwnerRepository
    {
        public PropertyOwnerRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByCityAsync(string city)
        {
            return await _dbSet
                .Where(o => o.City == city)
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByStateAsync(string state)
        {
            return await _dbSet
                .Where(o => o.State == state)
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPaymentMethodAsync(PaymentMethod paymentMethod)
        {
            return await _dbSet
                .Where(o => o.PreferredPaymentMethod == paymentMethod)
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyTypeAsync(PropertyType propertyType)
        {
            return await _dbSet
                .Where(o => o.Properties.Any(p => p.Type == propertyType))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyStatusAsync(PropertyStatus propertyStatus)
        {
            return await _dbSet
                .Where(o => o.Properties.Any(p => p.Status == propertyStatus))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyCountRangeAsync(int minCount, int maxCount)
        {
            return await _dbSet
                .Where(o => o.Properties.Count >= minCount && o.Properties.Count <= maxCount)
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyValueRangeAsync(decimal minValue, decimal maxValue)
        {
            return await _dbSet
                .Where(o => o.Properties.Any(p => p.PurchasePrice >= minValue && p.PurchasePrice <= maxValue))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyRentRangeAsync(decimal minRent, decimal maxRent)
        {
            return await _dbSet
                .Where(o => o.Properties.Any(p => p.MonthlyRent >= minRent && p.MonthlyRent <= maxRent))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersWithExpiringLeasesAsync(int daysThreshold)
        {
            var thresholdDate = DateTime.UtcNow.AddDays(daysThreshold);
            return await _dbSet
                .Where(o => o.Properties.Any(p => p.Leases.Any(l => l.EndDate <= thresholdDate && l.Status == LeaseStatus.Active)))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersWithMaintenanceIssuesAsync()
        {
            return await _dbSet
                .Where(o => o.Properties.Any(p => p.MaintenanceRequests.Any(m => m.Status == MaintenanceStatus.Open || m.Status == MaintenanceStatus.InProgress)))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<PropertyOwner> GetPropertyOwnerWithDetailsAsync(Guid id)
        {
            return await _dbSet
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .FirstOrDefaultAsync(o => o.Id == id);
        }

        public async Task<IEnumerable<PropertyOwner>> SearchPropertyOwnersAsync(string searchTerm)
        {
            return await _dbSet
                .Where(o => o.FirstName.Contains(searchTerm) || 
                           o.LastName.Contains(searchTerm) || 
                           o.Email.Contains(searchTerm) || 
                           o.PhoneNumber.Contains(searchTerm) || 
                           o.Address.Contains(searchTerm) || 
                           o.City.Contains(searchTerm) || 
                           o.State.Contains(searchTerm) || 
                           o.ZipCode.Contains(searchTerm))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByCityAndPropertyTypeAsync(string city, PropertyType propertyType)
        {
            return await _dbSet
                .Where(o => o.City == city && o.Properties.Any(p => p.Type == propertyType))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByCityAndPropertyStatusAsync(string city, PropertyStatus propertyStatus)
        {
            return await _dbSet
                .Where(o => o.City == city && o.Properties.Any(p => p.Status == propertyStatus))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByCityAndPropertyCountRangeAsync(string city, int minCount, int maxCount)
        {
            return await _dbSet
                .Where(o => o.City == city && o.Properties.Count >= minCount && o.Properties.Count <= maxCount)
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByCityAndPropertyValueRangeAsync(string city, decimal minValue, decimal maxValue)
        {
            return await _dbSet
                .Where(o => o.City == city && o.Properties.Any(p => p.PurchasePrice >= minValue && p.PurchasePrice <= maxValue))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByCityAndPropertyRentRangeAsync(string city, decimal minRent, decimal maxRent)
        {
            return await _dbSet
                .Where(o => o.City == city && o.Properties.Any(p => p.MonthlyRent >= minRent && p.MonthlyRent <= maxRent))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByStateAndPropertyTypeAsync(string state, PropertyType propertyType)
        {
            return await _dbSet
                .Where(o => o.State == state && o.Properties.Any(p => p.Type == propertyType))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByStateAndPropertyStatusAsync(string state, PropertyStatus propertyStatus)
        {
            return await _dbSet
                .Where(o => o.State == state && o.Properties.Any(p => p.Status == propertyStatus))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByStateAndPropertyCountRangeAsync(string state, int minCount, int maxCount)
        {
            return await _dbSet
                .Where(o => o.State == state && o.Properties.Count >= minCount && o.Properties.Count <= maxCount)
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByStateAndPropertyValueRangeAsync(string state, decimal minValue, decimal maxValue)
        {
            return await _dbSet
                .Where(o => o.State == state && o.Properties.Any(p => p.PurchasePrice >= minValue && p.PurchasePrice <= maxValue))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByStateAndPropertyRentRangeAsync(string state, decimal minRent, decimal maxRent)
        {
            return await _dbSet
                .Where(o => o.State == state && o.Properties.Any(p => p.MonthlyRent >= minRent && p.MonthlyRent <= maxRent))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPaymentMethodAndPropertyTypeAsync(PaymentMethod paymentMethod, PropertyType propertyType)
        {
            return await _dbSet
                .Where(o => o.PreferredPaymentMethod == paymentMethod && o.Properties.Any(p => p.Type == propertyType))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPaymentMethodAndPropertyStatusAsync(PaymentMethod paymentMethod, PropertyStatus propertyStatus)
        {
            return await _dbSet
                .Where(o => o.PreferredPaymentMethod == paymentMethod && o.Properties.Any(p => p.Status == propertyStatus))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPaymentMethodAndPropertyCountRangeAsync(PaymentMethod paymentMethod, int minCount, int maxCount)
        {
            return await _dbSet
                .Where(o => o.PreferredPaymentMethod == paymentMethod && o.Properties.Count >= minCount && o.Properties.Count <= maxCount)
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPaymentMethodAndPropertyValueRangeAsync(PaymentMethod paymentMethod, decimal minValue, decimal maxValue)
        {
            return await _dbSet
                .Where(o => o.PreferredPaymentMethod == paymentMethod && o.Properties.Any(p => p.PurchasePrice >= minValue && p.PurchasePrice <= maxValue))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPaymentMethodAndPropertyRentRangeAsync(PaymentMethod paymentMethod, decimal minRent, decimal maxRent)
        {
            return await _dbSet
                .Where(o => o.PreferredPaymentMethod == paymentMethod && o.Properties.Any(p => p.MonthlyRent >= minRent && p.MonthlyRent <= maxRent))
                .Include(o => o.Properties)
                .Include(o => o.Documents)
                .ToListAsync();
        }
    }
} 