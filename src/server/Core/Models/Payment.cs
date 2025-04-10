using System;

namespace PropertyManagement.Core.Models
{
    public class Payment
    {
        public Guid Id { get; set; }
        public Guid LeaseId { get; set; }
        public Guid TenantId { get; set; }
        public decimal Amount { get; set; }
        public DateTime DueDate { get; set; }
        public DateTime? PaymentDate { get; set; }
        public PaymentStatus Status { get; set; }
        public PaymentType Type { get; set; }
        public PaymentMethod Method { get; set; }
        public string TransactionId { get; set; }
        public string Notes { get; set; }
        public decimal? LateFee { get; set; }
        public bool IsLateFeeApplied { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public virtual Lease Lease { get; set; }
        public virtual Tenant Tenant { get; set; }
    }

    public enum PaymentStatus
    {
        Pending,
        Paid,
        Late,
        Overdue,
        Cancelled,
        Refunded
    }

    public enum PaymentType
    {
        Rent,
        SecurityDeposit,
        PetDeposit,
        LateFee,
        Utilities,
        Maintenance,
        Other
    }
} 