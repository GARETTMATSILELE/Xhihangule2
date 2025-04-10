using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Core.Interfaces
{
    public interface IPaymentRepository : IRepository<Payment>
    {
        Task<IEnumerable<Payment>> GetPaymentsByLeaseAsync(Guid leaseId);
        Task<IEnumerable<Payment>> GetPaymentsByTenantAsync(Guid tenantId);
        Task<IEnumerable<Payment>> GetPaymentsByStatusAsync(PaymentStatus status);
        Task<IEnumerable<Payment>> GetPaymentsByTypeAsync(PaymentType type);
        Task<IEnumerable<Payment>> GetPaymentsByDateRangeAsync(DateTime startDate, DateTime endDate);
        Task<IEnumerable<Payment>> GetPaymentsByAmountRangeAsync(decimal minAmount, decimal maxAmount);
        Task<Payment> GetPaymentWithDetailsAsync(Guid id);
        Task<IEnumerable<Payment>> SearchPaymentsAsync(string searchTerm);
        Task<IEnumerable<Payment>> GetPaymentsByPropertyAsync(Guid propertyId);
        Task<IEnumerable<Payment>> GetPaymentsByOwnerAsync(Guid ownerId);
        Task<IEnumerable<Payment>> GetPaymentsByLeaseAndStatusAsync(Guid leaseId, PaymentStatus status);
        Task<IEnumerable<Payment>> GetPaymentsByLeaseAndTypeAsync(Guid leaseId, PaymentType type);
        Task<IEnumerable<Payment>> GetPaymentsByLeaseAndDateRangeAsync(Guid leaseId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Payment>> GetPaymentsByLeaseAndAmountRangeAsync(Guid leaseId, decimal minAmount, decimal maxAmount);
        Task<IEnumerable<Payment>> GetPaymentsByTenantAndStatusAsync(Guid tenantId, PaymentStatus status);
        Task<IEnumerable<Payment>> GetPaymentsByTenantAndTypeAsync(Guid tenantId, PaymentType type);
        Task<IEnumerable<Payment>> GetPaymentsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Payment>> GetPaymentsByTenantAndAmountRangeAsync(Guid tenantId, decimal minAmount, decimal maxAmount);
        Task<IEnumerable<Payment>> GetPaymentsByPropertyAndStatusAsync(Guid propertyId, PaymentStatus status);
        Task<IEnumerable<Payment>> GetPaymentsByPropertyAndTypeAsync(Guid propertyId, PaymentType type);
        Task<IEnumerable<Payment>> GetPaymentsByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Payment>> GetPaymentsByPropertyAndAmountRangeAsync(Guid propertyId, decimal minAmount, decimal maxAmount);
        Task<IEnumerable<Payment>> GetPaymentsByOwnerAndStatusAsync(Guid ownerId, PaymentStatus status);
        Task<IEnumerable<Payment>> GetPaymentsByOwnerAndTypeAsync(Guid ownerId, PaymentType type);
        Task<IEnumerable<Payment>> GetPaymentsByOwnerAndDateRangeAsync(Guid ownerId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Payment>> GetPaymentsByOwnerAndAmountRangeAsync(Guid ownerId, decimal minAmount, decimal maxAmount);
    }
} 