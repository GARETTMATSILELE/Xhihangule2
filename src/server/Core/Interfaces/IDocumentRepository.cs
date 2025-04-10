using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Core.Interfaces
{
    public interface IDocumentRepository : IRepository<Document>
    {
        Task<IEnumerable<Document>> GetDocumentsByPropertyAsync(Guid propertyId);
        Task<IEnumerable<Document>> GetDocumentsByTenantAsync(Guid tenantId);
        Task<IEnumerable<Document>> GetDocumentsByLeaseAsync(Guid leaseId);
        Task<IEnumerable<Document>> GetDocumentsByMaintenanceRequestAsync(Guid maintenanceRequestId);
        Task<IEnumerable<Document>> GetDocumentsByOwnerAsync(Guid ownerId);
        Task<IEnumerable<Document>> GetDocumentsByTypeAsync(DocumentType type);
        Task<IEnumerable<Document>> GetDocumentsByStatusAsync(DocumentStatus status);
        Task<IEnumerable<Document>> GetDocumentsByDateRangeAsync(DateTime startDate, DateTime endDate);
        Task<Document> GetDocumentWithDetailsAsync(Guid id);
        Task<IEnumerable<Document>> SearchDocumentsAsync(string searchTerm);
        Task<IEnumerable<Document>> GetDocumentsByPropertyAndTypeAsync(Guid propertyId, DocumentType type);
        Task<IEnumerable<Document>> GetDocumentsByPropertyAndStatusAsync(Guid propertyId, DocumentStatus status);
        Task<IEnumerable<Document>> GetDocumentsByPropertyAndDateRangeAsync(Guid propertyId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Document>> GetDocumentsByTenantAndTypeAsync(Guid tenantId, DocumentType type);
        Task<IEnumerable<Document>> GetDocumentsByTenantAndStatusAsync(Guid tenantId, DocumentStatus status);
        Task<IEnumerable<Document>> GetDocumentsByTenantAndDateRangeAsync(Guid tenantId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Document>> GetDocumentsByLeaseAndTypeAsync(Guid leaseId, DocumentType type);
        Task<IEnumerable<Document>> GetDocumentsByLeaseAndStatusAsync(Guid leaseId, DocumentStatus status);
        Task<IEnumerable<Document>> GetDocumentsByLeaseAndDateRangeAsync(Guid leaseId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Document>> GetDocumentsByMaintenanceRequestAndTypeAsync(Guid maintenanceRequestId, DocumentType type);
        Task<IEnumerable<Document>> GetDocumentsByMaintenanceRequestAndStatusAsync(Guid maintenanceRequestId, DocumentStatus status);
        Task<IEnumerable<Document>> GetDocumentsByMaintenanceRequestAndDateRangeAsync(Guid maintenanceRequestId, DateTime startDate, DateTime endDate);
        Task<IEnumerable<Document>> GetDocumentsByOwnerAndTypeAsync(Guid ownerId, DocumentType type);
        Task<IEnumerable<Document>> GetDocumentsByOwnerAndStatusAsync(Guid ownerId, DocumentStatus status);
        Task<IEnumerable<Document>> GetDocumentsByOwnerAndDateRangeAsync(Guid ownerId, DateTime startDate, DateTime endDate);
    }
} 