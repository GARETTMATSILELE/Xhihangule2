using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Core.Interfaces
{
    public interface IPaymentService : IService<Payment>
    {
        Task<IEnumerable<Payment>> GetPaymentsByLeaseAsync(Guid leaseId);
        Task<IEnumerable<Payment>> GetPaymentsByTenantAsync(Guid tenantId);
        Task<IEnumerable<Payment>> GetPaymentsByStatusAsync(PaymentStatus status);
        Task<IEnumerable<Payment>> GetPaymentsByDateRangeAsync(DateTime startDate, DateTime endDate);
        Task<Payment> GetPaymentWithDetailsAsync(Guid id);
        Task<IEnumerable<Payment>> SearchPaymentsAsync(string searchTerm);
        Task<IEnumerable<Payment>> GetPaymentsByLeaseAndStatusAsync(Guid leaseId, PaymentStatus status);
        Task<IEnumerable<Payment>> GetPaymentsByLeaseAndDateRangeAsync(Guid leaseId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Payment>> GetPaymentsByLeaseAndSearchTermAsync(Guid leaseId, string searchTerm);
        Task<IEnumerable<Payment>> GetPaymentsByTenantAndStatusAsync(Guid tenantId, PaymentStatus status);
        Task<IEnumerable<Payment>> GetPaymentsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Payment>> GetPaymentsByTenantAndSearchTermAsync(Guid tenantId, string searchTerm);
    }
} 