using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using PropertyManagement.Core.Interfaces;
using PropertyManagement.Core.Models;
using PropertyManagement.Infrastructure.Data;
using PropertyManagement.Infrastructure.Repositories;

namespace PropertyManagement.Infrastructure.Services
{
    public class TenantService : Service<Tenant>, ITenantService
    {
        private readonly ITenantRepository _tenantRepository;

        public TenantService(ApplicationDbContext context, ITenantRepository tenantRepository)
            : base(context)
        {
            _tenantRepository = tenantRepository;
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAsync(Guid propertyId)
        {
            return await _tenantRepository.GetTenantsByPropertyAsync(propertyId);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByStatusAsync(TenantStatus status)
        {
            return await _tenantRepository.GetTenantsByStatusAsync(status);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsWithExpiringLeasesAsync(int daysThreshold)
        {
            return await _tenantRepository.GetTenantsWithExpiringLeasesAsync(daysThreshold);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsWithPastDuePaymentsAsync()
        {
            return await _tenantRepository.GetTenantsWithPastDuePaymentsAsync();
        }

        public async Task<IEnumerable<Tenant>> GetTenantsWithMaintenanceRequestsAsync()
        {
            return await _tenantRepository.GetTenantsWithMaintenanceRequestsAsync();
        }

        public async Task<Tenant> GetTenantWithDetailsAsync(Guid id)
        {
            return await _tenantRepository.GetTenantWithDetailsAsync(id);
        }

        public async Task<IEnumerable<Tenant>> SearchTenantsAsync(string searchTerm)
        {
            return await _tenantRepository.SearchTenantsAsync(searchTerm);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByCityAsync(string city)
        {
            return await _tenantRepository.GetTenantsByCityAsync(city);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByStateAsync(string state)
        {
            return await _tenantRepository.GetTenantsByStateAsync(state);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByIncomeRangeAsync(decimal minIncome, decimal maxIncome)
        {
            return await _tenantRepository.GetTenantsByIncomeRangeAsync(minIncome, maxIncome);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByLeaseStartDateAsync(DateTime startDate)
        {
            return await _tenantRepository.GetTenantsByLeaseStartDateAsync(startDate);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByLeaseEndDateAsync(DateTime endDate)
        {
            return await _tenantRepository.GetTenantsByLeaseEndDateAsync(endDate);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndStatusAsync(Guid propertyId, TenantStatus status)
        {
            return await _tenantRepository.GetTenantsByPropertyAndStatusAsync(propertyId, status);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndExpiringLeasesAsync(Guid propertyId, int daysThreshold)
        {
            return await _tenantRepository.GetTenantsByPropertyAndExpiringLeasesAsync(propertyId, daysThreshold);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndPastDuePaymentsAsync(Guid propertyId)
        {
            return await _tenantRepository.GetTenantsByPropertyAndPastDuePaymentsAsync(propertyId);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndMaintenanceRequestsAsync(Guid propertyId)
        {
            return await _tenantRepository.GetTenantsByPropertyAndMaintenanceRequestsAsync(propertyId);
        }

        public async Task<IEnumerable<Tenant>> GetTenantsByPropertyAndSearchTermAsync(Guid propertyId, string searchTerm)
        {
            return await _tenantRepository.GetTenantsByPropertyAndSearchTermAsync(propertyId, searchTerm);
        }
    }
} 