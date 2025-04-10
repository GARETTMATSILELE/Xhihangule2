using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Core.Interfaces
{
    public interface IPropertyOwnerRepository : IRepository<PropertyOwner>
    {
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByCityAsync(string city);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByStateAsync(string state);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPaymentMethodAsync(PaymentMethod paymentMethod);
        Task<PropertyOwner> GetPropertyOwnerWithDetailsAsync(Guid id);
        Task<IEnumerable<PropertyOwner>> SearchPropertyOwnersAsync(string searchTerm);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyTypeAsync(PropertyType propertyType);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyStatusAsync(PropertyStatus propertyStatus);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyCountRangeAsync(int minCount, int maxCount);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByTotalPropertyValueRangeAsync(decimal minValue, decimal maxValue);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByTotalMonthlyRentRangeAsync(decimal minRent, decimal maxRent);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyAndCityAsync(Guid propertyId, string city);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyAndStateAsync(Guid propertyId, string state);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyAndTypeAsync(Guid propertyId, PropertyType propertyType);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyAndStatusAsync(Guid propertyId, PropertyStatus propertyStatus);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyAndValueRangeAsync(Guid propertyId, decimal minValue, decimal maxValue);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByPropertyAndRentRangeAsync(Guid propertyId, decimal minRent, decimal maxRent);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByLeaseAsync(Guid leaseId);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByLeaseAndStatusAsync(Guid leaseId, LeaseStatus leaseStatus);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByLeaseAndDateRangeAsync(Guid leaseId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByLeaseAndRentRangeAsync(Guid leaseId, decimal minRent, decimal maxRent);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByMaintenanceRequestAsync(Guid maintenanceRequestId);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByMaintenanceRequestAndStatusAsync(Guid maintenanceRequestId, MaintenanceStatus maintenanceStatus);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByMaintenanceRequestAndPriorityAsync(Guid maintenanceRequestId, MaintenancePriority maintenancePriority);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByMaintenanceRequestAndDateRangeAsync(Guid maintenanceRequestId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<PropertyOwner>> GetPropertyOwnersByMaintenanceRequestAndCostRangeAsync(Guid maintenanceRequestId, decimal minCost, decimal maxCost);
    }
} 