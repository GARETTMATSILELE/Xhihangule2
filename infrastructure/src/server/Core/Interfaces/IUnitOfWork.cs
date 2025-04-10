using System;
using System.Threading.Tasks;

namespace PropertyManagement.Core.Interfaces
{
    public interface IUnitOfWork : IDisposable
    {
        IPropertyRepository Properties { get; }
        IPropertyOwnerRepository PropertyOwners { get; }
        ITenantRepository Tenants { get; }
        ILeaseRepository Leases { get; }
        IMaintenanceRepository MaintenanceRequests { get; }
        IPaymentRepository Payments { get; }
        IDocumentRepository Documents { get; }

        Task<int> SaveChangesAsync();
        Task BeginTransactionAsync();
        Task CommitTransactionAsync();
        Task RollbackTransactionAsync();
    }
} 