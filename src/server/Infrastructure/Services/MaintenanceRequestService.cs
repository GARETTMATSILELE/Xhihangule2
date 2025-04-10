using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Interfaces;
using PropertyManagement.Core.Models;
using PropertyManagement.Infrastructure.Data;

namespace PropertyManagement.Infrastructure.Services
{
    public class MaintenanceRequestService : Service<MaintenanceRequest>, IMaintenanceRequestService
    {
        private readonly IMaintenanceRequestRepository _maintenanceRequestRepository;

        public MaintenanceRequestService(ApplicationDbContext context, IMaintenanceRequestRepository maintenanceRequestRepository)
            : base(context)
        {
            _maintenanceRequestRepository = maintenanceRequestRepository;
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAsync(Guid propertyId)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByPropertyAsync(propertyId);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAsync(Guid tenantId)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByTenantAsync(tenantId);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByStatusAsync(MaintenanceRequestStatus status)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByStatusAsync(status);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPriorityAsync(MaintenanceRequestPriority priority)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByPriorityAsync(priority);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByDateRangeAsync(DateTime startDate, DateTime endDate)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByDateRangeAsync(startDate, endDate);
        }

        public async Task<MaintenanceRequest> GetMaintenanceRequestWithDetailsAsync(Guid id)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestWithDetailsAsync(id);
        }

        public async Task<IEnumerable<MaintenanceRequest>> SearchMaintenanceRequestsAsync(string searchTerm)
        {
            return await _maintenanceRequestRepository.SearchMaintenanceRequestsAsync(searchTerm);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndStatusAsync(Guid propertyId, MaintenanceRequestStatus status)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByPropertyAndStatusAsync(propertyId, status);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndPriorityAsync(Guid propertyId, MaintenanceRequestPriority priority)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByPropertyAndPriorityAsync(propertyId, priority);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByPropertyAndDateRangeAsync(propertyId, startDate, endDate);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByPropertyAndSearchTermAsync(Guid propertyId, string searchTerm)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByPropertyAndSearchTermAsync(propertyId, searchTerm);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndStatusAsync(Guid tenantId, MaintenanceRequestStatus status)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByTenantAndStatusAsync(tenantId, status);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndPriorityAsync(Guid tenantId, MaintenanceRequestPriority priority)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByTenantAndPriorityAsync(tenantId, priority);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByTenantAndDateRangeAsync(tenantId, startDate, endDate);
        }

        public async Task<IEnumerable<MaintenanceRequest>> GetMaintenanceRequestsByTenantAndSearchTermAsync(Guid tenantId, string searchTerm)
        {
            return await _maintenanceRequestRepository.GetMaintenanceRequestsByTenantAndSearchTermAsync(tenantId, searchTerm);
        }
    }
} 