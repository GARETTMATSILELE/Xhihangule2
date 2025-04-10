using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore.Storage;
using PropertyManagement.Core.Interfaces;
using PropertyManagement.Infrastructure.Data;

namespace PropertyManagement.Infrastructure.Repositories
{
    public class UnitOfWork : IUnitOfWork
    {
        private readonly ApplicationDbContext _context;
        private IDbContextTransaction _transaction;
        private IPropertyRepository _propertyRepository;
        private IPropertyOwnerRepository _propertyOwnerRepository;
        private ITenantRepository _tenantRepository;
        private ILeaseRepository _leaseRepository;
        private IMaintenanceRepository _maintenanceRepository;
        private IPaymentRepository _paymentRepository;
        private IDocumentRepository _documentRepository;

        public UnitOfWork(ApplicationDbContext context)
        {
            _context = context;
        }

        public IPropertyRepository Properties => 
            _propertyRepository ??= new PropertyRepository(_context);

        public IPropertyOwnerRepository PropertyOwners => 
            _propertyOwnerRepository ??= new PropertyOwnerRepository(_context);

        public ITenantRepository Tenants => 
            _tenantRepository ??= new TenantRepository(_context);

        public ILeaseRepository Leases => 
            _leaseRepository ??= new LeaseRepository(_context);

        public IMaintenanceRepository MaintenanceRequests => 
            _maintenanceRepository ??= new MaintenanceRepository(_context);

        public IPaymentRepository Payments => 
            _paymentRepository ??= new PaymentRepository(_context);

        public IDocumentRepository Documents => 
            _documentRepository ??= new DocumentRepository(_context);

        public async Task<int> SaveChangesAsync()
        {
            return await _context.SaveChangesAsync();
        }

        public async Task BeginTransactionAsync()
        {
            _transaction = await _context.Database.BeginTransactionAsync();
        }

        public async Task CommitTransactionAsync()
        {
            try
            {
                await _transaction?.CommitAsync();
            }
            finally
            {
                await _transaction?.DisposeAsync();
                _transaction = null;
            }
        }

        public async Task RollbackTransactionAsync()
        {
            try
            {
                await _transaction?.RollbackAsync();
            }
            finally
            {
                await _transaction?.DisposeAsync();
                _transaction = null;
            }
        }

        public void Dispose()
        {
            _context.Dispose();
        }
    }
} 