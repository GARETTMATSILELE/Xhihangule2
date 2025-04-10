using System;
using System.Collections.Generic;

namespace PropertyManagement.Core.Models
{
    public class Lease
    {
        public Guid Id { get; set; }
        public Guid PropertyId { get; set; }
        public Guid TenantId { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public decimal MonthlyRent { get; set; }
        public decimal SecurityDeposit { get; set; }
        public decimal PetDeposit { get; set; }
        public bool IsPetAllowed { get; set; }
        public int MaxOccupants { get; set; }
        public bool IsUtilitiesIncluded { get; set; }
        public string UtilitiesDetails { get; set; }
        public int RentDueDay { get; set; }
        public decimal LateFee { get; set; }
        public int GracePeriod { get; set; }
        public LeaseStatus Status { get; set; }
        public string TerminationReason { get; set; }
        public DateTime? TerminationDate { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public virtual Property Property { get; set; }
        public virtual Tenant Tenant { get; set; }
        public virtual ICollection<Payment> Payments { get; set; }
        public virtual ICollection<Document> Documents { get; set; }
    }

    public enum LeaseStatus
    {
        Active,
        Pending,
        Terminated,
        Expired,
        Renewed
    }
} 