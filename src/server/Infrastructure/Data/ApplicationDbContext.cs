using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using PropertyManagement.Core.Models;

namespace PropertyManagement.Infrastructure.Data
{
    public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<Property> Properties { get; set; }
        public DbSet<PropertyOwner> PropertyOwners { get; set; }
        public DbSet<Tenant> Tenants { get; set; }
        public DbSet<Lease> Leases { get; set; }
        public DbSet<MaintenanceRequest> MaintenanceRequests { get; set; }
        public DbSet<MaintenanceComment> MaintenanceComments { get; set; }
        public DbSet<Payment> Payments { get; set; }
        public DbSet<Document> Documents { get; set; }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            base.OnModelCreating(builder);

            // Configure relationships and constraints
            builder.Entity<Property>()
                .HasOne(p => p.Owner)
                .WithMany(o => o.Properties)
                .HasForeignKey(p => p.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.Entity<Lease>()
                .HasOne(l => l.Property)
                .WithMany(p => p.Leases)
                .HasForeignKey(l => l.PropertyId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.Entity<Lease>()
                .HasOne(l => l.Tenant)
                .WithMany(t => t.Leases)
                .HasForeignKey(l => l.TenantId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.Entity<MaintenanceRequest>()
                .HasOne(m => m.Property)
                .WithMany(p => p.MaintenanceRequests)
                .HasForeignKey(m => m.PropertyId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.Entity<MaintenanceRequest>()
                .HasOne(m => m.Tenant)
                .WithMany(t => t.MaintenanceRequests)
                .HasForeignKey(m => m.TenantId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.Entity<MaintenanceComment>()
                .HasOne(mc => mc.MaintenanceRequest)
                .WithMany(mr => mr.Comments)
                .HasForeignKey(mc => mc.MaintenanceRequestId)
                .OnDelete(DeleteBehavior.Cascade);

            builder.Entity<Payment>()
                .HasOne(p => p.Lease)
                .WithMany(l => l.Payments)
                .HasForeignKey(p => p.LeaseId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.Entity<Payment>()
                .HasOne(p => p.Tenant)
                .WithMany(t => t.Payments)
                .HasForeignKey(p => p.TenantId)
                .OnDelete(DeleteBehavior.Restrict);

            // Configure indexes
            builder.Entity<Property>()
                .HasIndex(p => p.Address);

            builder.Entity<Property>()
                .HasIndex(p => p.OwnerId);

            builder.Entity<Tenant>()
                .HasIndex(t => t.Email);

            builder.Entity<Lease>()
                .HasIndex(l => l.PropertyId);

            builder.Entity<Lease>()
                .HasIndex(l => l.TenantId);

            builder.Entity<MaintenanceRequest>()
                .HasIndex(m => m.PropertyId);

            builder.Entity<MaintenanceRequest>()
                .HasIndex(m => m.TenantId);

            builder.Entity<Payment>()
                .HasIndex(p => p.LeaseId);

            builder.Entity<Payment>()
                .HasIndex(p => p.TenantId);

            builder.Entity<Document>()
                .HasIndex(d => d.PropertyId);

            builder.Entity<Document>()
                .HasIndex(d => d.TenantId);

            builder.Entity<Document>()
                .HasIndex(d => d.LeaseId);

            builder.Entity<Document>()
                .HasIndex(d => d.MaintenanceRequestId);

            builder.Entity<Document>()
                .HasIndex(d => d.PropertyOwnerId);
        }
    }
} 