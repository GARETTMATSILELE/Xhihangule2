using System;

namespace PropertyManagement.Core.Models
{
    public class Document
    {
        public Guid Id { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public string FileName { get; set; }
        public string ContentType { get; set; }
        public long FileSize { get; set; }
        public string BlobUrl { get; set; }
        public DocumentType Type { get; set; }
        public DocumentStatus Status { get; set; }
        public Guid? PropertyId { get; set; }
        public Guid? TenantId { get; set; }
        public Guid? LeaseId { get; set; }
        public Guid? MaintenanceRequestId { get; set; }
        public Guid? PropertyOwnerId { get; set; }
        public string UploadedBy { get; set; }
        public DateTime UploadDate { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public bool IsArchived { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public virtual Property Property { get; set; }
        public virtual Tenant Tenant { get; set; }
        public virtual Lease Lease { get; set; }
        public virtual MaintenanceRequest MaintenanceRequest { get; set; }
        public virtual PropertyOwner PropertyOwner { get; set; }
    }

    public enum DocumentType
    {
        Lease,
        RentalApplication,
        IdentificationDocument,
        IncomeVerification,
        InsuranceDocument,
        MaintenanceReport,
        Invoice,
        Receipt,
        Inspection,
        Legal,
        Other
    }

    public enum DocumentStatus
    {
        Active,
        Archived,
        Expired,
        Deleted
    }
} 