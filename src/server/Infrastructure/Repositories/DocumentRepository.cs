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
    public class DocumentRepository : Repository<Document>, IDocumentRepository
    {
        public DocumentRepository(ApplicationDbContext context) : base(context)
        {
        }

        public async Task<IEnumerable<Document>> GetDocumentsByPropertyAsync(Guid propertyId)
        {
            return await _dbSet
                .Where(d => d.PropertyId == propertyId)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByTenantAsync(Guid tenantId)
        {
            return await _dbSet
                .Where(d => d.TenantId == tenantId)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByLeaseAsync(Guid leaseId)
        {
            return await _dbSet
                .Where(d => d.LeaseId == leaseId)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByMaintenanceRequestAsync(Guid maintenanceRequestId)
        {
            return await _dbSet
                .Where(d => d.MaintenanceRequestId == maintenanceRequestId)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByPaymentAsync(Guid paymentId)
        {
            return await _dbSet
                .Where(d => d.PaymentId == paymentId)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByOwnerAsync(Guid ownerId)
        {
            return await _dbSet
                .Where(d => d.Property.OwnerId == ownerId)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByTypeAsync(DocumentType type)
        {
            return await _dbSet
                .Where(d => d.Type == type)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByStatusAsync(DocumentStatus status)
        {
            return await _dbSet
                .Where(d => d.Status == status)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByDateRangeAsync(DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(d => d.UploadDate >= startDate && d.UploadDate <= endDate)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<Document> GetDocumentWithDetailsAsync(Guid id)
        {
            return await _dbSet
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .FirstOrDefaultAsync(d => d.Id == id);
        }

        public async Task<IEnumerable<Document>> SearchDocumentsAsync(string searchTerm)
        {
            return await _dbSet
                .Where(d => d.Title.Contains(searchTerm) || 
                           d.Description.Contains(searchTerm) || 
                           d.FileName.Contains(searchTerm) || 
                           d.Property.Name.Contains(searchTerm) || 
                           d.Property.Address.Contains(searchTerm) || 
                           d.Tenant.FirstName.Contains(searchTerm) || 
                           d.Tenant.LastName.Contains(searchTerm))
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByPropertyAndTypeAsync(Guid propertyId, DocumentType type)
        {
            return await _dbSet
                .Where(d => d.PropertyId == propertyId && d.Type == type)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByPropertyAndStatusAsync(Guid propertyId, DocumentStatus status)
        {
            return await _dbSet
                .Where(d => d.PropertyId == propertyId && d.Status == status)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(d => d.PropertyId == propertyId && d.UploadDate >= startDate && d.UploadDate <= endDate)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByTenantAndTypeAsync(Guid tenantId, DocumentType type)
        {
            return await _dbSet
                .Where(d => d.TenantId == tenantId && d.Type == type)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByTenantAndStatusAsync(Guid tenantId, DocumentStatus status)
        {
            return await _dbSet
                .Where(d => d.TenantId == tenantId && d.Status == status)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(d => d.TenantId == tenantId && d.UploadDate >= startDate && d.UploadDate <= endDate)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByLeaseAndTypeAsync(Guid leaseId, DocumentType type)
        {
            return await _dbSet
                .Where(d => d.LeaseId == leaseId && d.Type == type)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByLeaseAndStatusAsync(Guid leaseId, DocumentStatus status)
        {
            return await _dbSet
                .Where(d => d.LeaseId == leaseId && d.Status == status)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByLeaseAndDateRangeAsync(Guid leaseId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(d => d.LeaseId == leaseId && d.UploadDate >= startDate && d.UploadDate <= endDate)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByMaintenanceRequestAndTypeAsync(Guid maintenanceRequestId, DocumentType type)
        {
            return await _dbSet
                .Where(d => d.MaintenanceRequestId == maintenanceRequestId && d.Type == type)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByMaintenanceRequestAndStatusAsync(Guid maintenanceRequestId, DocumentStatus status)
        {
            return await _dbSet
                .Where(d => d.MaintenanceRequestId == maintenanceRequestId && d.Status == status)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByMaintenanceRequestAndDateRangeAsync(Guid maintenanceRequestId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(d => d.MaintenanceRequestId == maintenanceRequestId && d.UploadDate >= startDate && d.UploadDate <= endDate)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByPaymentAndTypeAsync(Guid paymentId, DocumentType type)
        {
            return await _dbSet
                .Where(d => d.PaymentId == paymentId && d.Type == type)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByPaymentAndStatusAsync(Guid paymentId, DocumentStatus status)
        {
            return await _dbSet
                .Where(d => d.PaymentId == paymentId && d.Status == status)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByPaymentAndDateRangeAsync(Guid paymentId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(d => d.PaymentId == paymentId && d.UploadDate >= startDate && d.UploadDate <= endDate)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByOwnerAndTypeAsync(Guid ownerId, DocumentType type)
        {
            return await _dbSet
                .Where(d => d.Property.OwnerId == ownerId && d.Type == type)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByOwnerAndStatusAsync(Guid ownerId, DocumentStatus status)
        {
            return await _dbSet
                .Where(d => d.Property.OwnerId == ownerId && d.Status == status)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }

        public async Task<IEnumerable<Document>> GetDocumentsByOwnerAndDateRangeAsync(Guid ownerId, DateTime startDate, DateTime endDate)
        {
            return await _dbSet
                .Where(d => d.Property.OwnerId == ownerId && d.UploadDate >= startDate && d.UploadDate <= endDate)
                .Include(d => d.Property)
                .Include(d => d.Tenant)
                .Include(d => d.Lease)
                .Include(d => d.MaintenanceRequest)
                .Include(d => d.Payment)
                .ToListAsync();
        }
    }
} 