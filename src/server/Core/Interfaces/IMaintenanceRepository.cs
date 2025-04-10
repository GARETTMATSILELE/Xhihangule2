using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Core.Interfaces
{
    public interface IMaintenanceRepository : IRepository<MaintenanceRequest>
    {
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAsync(Guid propertyId);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAsync(Guid tenantId);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByStatusAsync(MaintenanceStatus status);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPriorityAsync(MaintenancePriority priority);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByCategoryAsync(MaintenanceCategory category);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByDateRangeAsync(DateTime startDate, DateTime endDate);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByCostRangeAsync(decimal minCost, decimal maxCost);
        Task<MaintenanceRequest> GetMaintenanceRequestWithDetailsAsync(Guid id);
        Task<IEnumerable<MaintenanceRequest>> SearchMaintenanceRequestsAsync(string searchTerm);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndStatusAsync(Guid propertyId, MaintenanceStatus status);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndPriorityAsync(Guid propertyId, MaintenancePriority priority);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndCategoryAsync(Guid propertyId, MaintenanceCategory category);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndCostRangeAsync(Guid propertyId, decimal minCost, decimal maxCost);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndStatusAsync(Guid tenantId, MaintenanceStatus status);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndPriorityAsync(Guid tenantId, MaintenancePriority priority);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndCategoryAsync(Guid tenantId, MaintenanceCategory category);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndCostRangeAsync(Guid tenantId, decimal minCost, decimal maxCost);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAsync(Guid ownerId);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAndStatusAsync(Guid ownerId, MaintenanceStatus status);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAndPriorityAsync(Guid ownerId, MaintenancePriority priority);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAndCategoryAsync(Guid ownerId, MaintenanceCategory category);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAndDateRangeAsync(Guid ownerId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByOwnerAndCostRangeAsync(Guid ownerId, decimal minCost, decimal maxCost);
    }
} 