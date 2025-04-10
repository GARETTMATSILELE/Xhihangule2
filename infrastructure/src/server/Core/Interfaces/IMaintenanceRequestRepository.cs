using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Core.Interfaces
{
    public interface IMaintenanceRequestRepository : IRepository<MaintenanceRequest>
    {
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAsync(Guid propertyId);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAsync(Guid tenantId);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByStatusAsync(MaintenanceStatus status);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPriorityAsync(MaintenancePriority priority);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByDateRangeAsync(DateTime startDate, DateTime endDate);
        Task<MaintenanceRequest> GetMaintenanceRequestWithDetailsAsync(Guid id);
        Task<IEnumerable<MaintenanceRequest>> SearchMaintenanceRequestsAsync(string searchTerm);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndStatusAsync(Guid propertyId, MaintenanceStatus status);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndPriorityAsync(Guid propertyId, MaintenancePriority priority);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndSearchTermAsync(Guid propertyId, string searchTerm);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndStatusAsync(Guid tenantId, MaintenanceStatus status);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndPriorityAsync(Guid tenantId, MaintenancePriority priority);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndSearchTermAsync(Guid tenantId, string searchTerm);
    }
} 