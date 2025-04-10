using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Interfaces;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Infrastructure.Services
{
    public class PaymentService : Service<Payment>, IPaymentService
    {
        private readonly IPaymentRepository _paymentRepository;

        public PaymentService(IPaymentRepository paymentRepository) : base(paymentRepository)
        {
            _paymentRepository = paymentRepository;
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByLeaseAsync(Guid leaseId)
        {
            return await _paymentRepository.GetPaymentsByLeaseAsync(leaseId);
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByTenantAsync(Guid tenantId)
        {
            return await _paymentRepository.GetPaymentsByTenantAsync(tenantId);
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByStatusAsync(PaymentStatus status)
        {
            return await _paymentRepository.GetPaymentsByStatusAsync(status);
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByDateRangeAsync(DateTime startDate, DateTime endDate)
        {
            return await _paymentRepository.GetPaymentsByDateRangeAsync(startDate, endDate);
        }

        public async Task<Payment> GetPaymentWithDetailsAsync(Guid id)
        {
            return await _paymentRepository.GetPaymentWithDetailsAsync(id);
        }

        public async Task<IEnumerable<Payment>> SearchPaymentsAsync(string searchTerm)
        {
            return await _paymentRepository.SearchPaymentsAsync(searchTerm);
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByLeaseAndStatusAsync(Guid leaseId, PaymentStatus status)
        {
            return await _paymentRepository.GetPaymentsByLeaseAndStatusAsync(leaseId, status);
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByLeaseAndDateRangeAsync(Guid leaseId, DateTime startDate, DateTime endDate)
        {
            return await _paymentRepository.GetPaymentsByLeaseAndDateRangeAsync(leaseId, startDate, endDate);
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByLeaseAndSearchTermAsync(Guid leaseId, string searchTerm)
        {
            return await _paymentRepository.GetPaymentsByLeaseAndSearchTermAsync(leaseId, searchTerm);
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByTenantAndStatusAsync(Guid tenantId, PaymentStatus status)
        {
            return await _paymentRepository.GetPaymentsByTenantAndStatusAsync(tenantId, status);
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate)
        {
            return await _paymentRepository.GetPaymentsByTenantAndDateRangeAsync(tenantId, startDate, endDate);
        }

        public async Task<IEnumerable<Payment>> GetPaymentsByTenantAndSearchTermAsync(Guid tenantId, string searchTerm)
        {
            return await _paymentRepository.GetPaymentsByTenantAndSearchTermAsync(tenantId, searchTerm);
        }
    }
} 