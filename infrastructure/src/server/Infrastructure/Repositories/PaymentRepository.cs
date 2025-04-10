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
    public class PaymentRepository : Repository<Payment>, IPaymentRepository
    {
        public PaymentRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByLeaseAsync(Guid leaseId)
        {
            return await _dbSet
                .Where(p => p.LeaseId == leaseId)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .Include(p => p.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByTenantAsync(Guid tenantId)
        {
            return await _dbSet
                .Where(p => p.TenantId == tenantId)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .Include(p => p.Documents)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByStatusAsync(PaymentStatus status)
        {
            return await _dbSet
                .Where(p => p.Status == status)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByTypeAsync(PaymentType type)
        {
            return await _dbSet
                .Where(p => p.Type == type)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByDateRangeAsync(DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(p => p.PaymentDate >= startDate && p.PaymentDate <= endDate)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByAmountRangeAsync(decimal minAmount, decimal maxAmount)
        {
            return await _dbSet
                .Where(p => p.Amount >= minAmount && p.Amount <= maxAmount)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<Payment> GetPaymentWithDetailsAsync(Guid id)
        {
            return await _dbSet
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .Include(p => p.Documents)
                .FirstOrDefaultAsync(p => p.Id == id);
        }

        public async Task<IEnumerable<Payment>> SearchPaymentsAsync(string searchTerm)
        {
            return await _dbSet
                .Where(p => p.ReferenceNumber.Contains(searchTerm) || 
                           p.Notes.Contains(searchTerm) || 
                           p.Property.Name.Contains(searchTerm) || 
                           p.Property.Address.Contains(searchTerm) || 
                           p.Tenant.FirstName.Contains(searchTerm) || 
                           p.Tenant.LastName.Contains(searchTerm))
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByLeaseAndStatusAsync(Guid leaseId, PaymentStatus status)
        {
            return await _dbSet
                .Where(p => p.LeaseId == leaseId && p.Status == status)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByLeaseAndTypeAsync(Guid leaseId, PaymentType type)
        {
            return await _dbSet
                .Where(p => p.LeaseId == leaseId && p.Type == type)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByLeaseAndDateRangeAsync(Guid leaseId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(p => p.LeaseId == leaseId && p.PaymentDate >= startDate && p.PaymentDate <= endDate)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByLeaseAndAmountRangeAsync(Guid leaseId, decimal minAmount, decimal maxAmount)
        {
            return await _dbSet
                .Where(p => p.LeaseId == leaseId && p.Amount >= minAmount && p.Amount <= maxAmount)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByTenantAndStatusAsync(Guid tenantId, PaymentStatus status)
        {
            return await _dbSet
                .Where(p => p.TenantId == tenantId && p.Status == status)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByTenantAndTypeAsync(Guid tenantId, PaymentType type)
        {
            return await _dbSet
                .Where(p => p.TenantId == tenantId && p.Type == type)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(p => p.TenantId == tenantId && p.PaymentDate >= startDate && p.PaymentDate <= endDate)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByTenantAndAmountRangeAsync(Guid tenantId, decimal minAmount, decimal maxAmount)
        {
            return await _dbSet
                .Where(p => p.TenantId == tenantId && p.Amount >= minAmount && p.Amount <= maxAmount)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByPropertyAsync(Guid propertyId)
        {
            return await _dbSet
                .Where(p => p.PropertyId == propertyId)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByPropertyAndStatusAsync(Guid propertyId, PaymentStatus status)
        {
            return await _dbSet
                .Where(p => p.PropertyId == propertyId && p.Status == status)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByPropertyAndTypeAsync(Guid propertyId, PaymentType type)
        {
            return await _dbSet
                .Where(p => p.PropertyId == propertyId && p.Type == type)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(p => p.PropertyId == propertyId && p.PaymentDate >= startDate && p.PaymentDate <= endDate)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByPropertyAndAmountRangeAsync(Guid propertyId, decimal minAmount, decimal maxAmount)
        {
            return await _dbSet
                .Where(p => p.PropertyId == propertyId && p.Amount >= minAmount && p.Amount <= maxAmount)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByOwnerAsync(Guid ownerId)
        {
            return await _dbSet
                .Where(p => p.Property.OwnerId == ownerId)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByOwnerAndStatusAsync(Guid ownerId, PaymentStatus status)
        {
            return await _dbSet
                .Where(p => p.Property.OwnerId == ownerId && p.Status == status)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByOwnerAndTypeAsync(Guid ownerId, PaymentType type)
        {
            return await _dbSet
                .Where(p => p.Property.OwnerId == ownerId && p.Type == type)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByOwnerAndDateRangeAsync(Guid ownerId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(p => p.Property.OwnerId == ownerId && p.PaymentDate >= startDate && p.PaymentDate <= endDate)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByOwnerAndAmountRangeAsync(Guid ownerId, decimal minAmount, decimal maxAmount)
        {
            return await _dbSet
                .Where(p => p.Property.OwnerId == ownerId && p.Amount >= minAmount && p.Amount <= maxAmount)
                .Include(p => p.Lease)
                .Include(p => p.Tenant)
                .Include(p => p.Property)
                .ToListAsync();
        }
    }
} 