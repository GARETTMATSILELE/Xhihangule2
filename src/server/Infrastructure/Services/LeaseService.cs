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
    public class LeaseService : Service<Lease>, ILeaseService
    {
        private readonly ILeaseRepository _leaseRepository;
        private readonly ApplicationDbContext _context;

        public LeaseService(ApplicationDbContext context, ILeaseRepository leaseRepository)
            : base(context)
        {
            _context = context;
            _leaseRepository = leaseRepository;
        }

        public async Task<IEnumerable<Lease>> GetLeasesByPropertyAsync(Guid propertyId)
        {
            return await _leaseRepository.GetLeasesByPropertyAsync(propertyId);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByTenantAsync(Guid tenantId)
        {
            return await _leaseRepository.GetLeasesByTenantAsync(tenantId);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByStatusAsync(LeaseStatus status)
        {
            return await _leaseRepository.GetLeasesByStatusAsync(status);
        }

        public async Task<IEnumerable<Lease>> GetExpiringLeasesAsync(int daysThreshold)
        {
            return await _leaseRepository.GetExpiringLeasesAsync(daysThreshold);
        }

        public async Task<IEnumerable<Lease>> GetLeasesWithPastDuePaymentsAsync()
        {
            return await _leaseRepository.GetLeasesWithPastDuePaymentsAsync();
        }

        public async Task<Lease> GetLeaseWithDetailsAsync(Guid id)
        {
            return await _leaseRepository.GetLeaseWithDetailsAsync(id);
        }

        public async Task<IEnumerable<Lease>> SearchLeasesAsync(string searchTerm)
        {
            return await _leaseRepository.SearchLeasesAsync(searchTerm);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByStartDateAsync(DateTime startDate)
        {
            return await _leaseRepository.GetLeasesByStartDateAsync(startDate);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByEndDateAsync(DateTime endDate)
        {
            return await _leaseRepository.GetLeasesByEndDateAsync(endDate);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByRentRangeAsync(decimal minRent, decimal maxRent)
        {
            return await _leaseRepository.GetLeasesByRentRangeAsync(minRent, maxRent);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByPropertyAndStatusAsync(Guid propertyId, LeaseStatus status)
        {
            return await _leaseRepository.GetLeasesByPropertyAndStatusAsync(propertyId, status);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByPropertyAndExpiringAsync(Guid propertyId, int daysThreshold)
        {
            return await _leaseRepository.GetLeasesByPropertyAndExpiringAsync(propertyId, daysThreshold);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByPropertyAndPastDuePaymentsAsync(Guid propertyId)
        {
            return await _leaseRepository.GetLeasesByPropertyAndPastDuePaymentsAsync(propertyId);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByPropertyAndSearchTermAsync(Guid propertyId, string searchTerm)
        {
            return await _leaseRepository.GetLeasesByPropertyAndSearchTermAsync(propertyId, searchTerm);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByTenantAndStatusAsync(Guid tenantId, LeaseStatus status)
        {
            return await _leaseRepository.GetLeasesByTenantAndStatusAsync(tenantId, status);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByTenantAndExpiringAsync(Guid tenantId, int daysThreshold)
        {
            return await _leaseRepository.GetLeasesByTenantAndExpiringAsync(tenantId, daysThreshold);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByTenantAndPastDuePaymentsAsync(Guid tenantId)
        {
            return await _leaseRepository.GetLeasesByTenantAndPastDuePaymentsAsync(tenantId);
        }

        public async Task<IEnumerable<Lease>> GetLeasesByTenantAndSearchTermAsync(Guid tenantId, string searchTerm)
        {
            return await _leaseRepository.GetLeasesByTenantAndSearchTermAsync(tenantId, searchTerm);
        }
    }
} 