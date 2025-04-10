using System;
using System.Collections.Generic;

namespace PropertyManagement.Core.Models
{
    public class MaintenanceRequest
    {
        public Guid Id { get; set; }
        public Guid PropertyId { get; set; }
        public Guid TenantId { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public MaintenanceCategory Category { get; set; }
        public MaintenancePriority Priority { get; set; }
        public MaintenanceStatus Status { get; set; }
        public DateTime RequestDate { get; set; }
        public DateTime? ScheduledDate { get; set; }
        public DateTime? CompletionDate { get; set; }
        public decimal? EstimatedCost { get; set; }
        public decimal? ActualCost { get; set; }
        public string AssignedTo { get; set; }
        public string Notes { get; set; }
        public bool IsEmergency { get; set; }
        public bool RequiresPropertyAccess { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public virtual Property Property { get; set; }
        public virtual Tenant Tenant { get; set; }
        public virtual ICollection<Document> Documents { get; set; }
        public virtual ICollection<MaintenanceComment> Comments { get; set; }
    }

    public enum MaintenanceCategory
    {
        Plumbing,
        Electrical,
        HVAC,
        Appliance,
        Structural,
        Painting,
        Cleaning,
        Landscaping,
        Pest,
        Other
    }

    public enum MaintenancePriority
    {
        Emergency,
        High,
        Medium,
        Low
    }

    public enum MaintenanceStatus
    {
        New,
        Assigned,
        InProgress,
        OnHold,
        Completed,
        Cancelled
    }
}

public class MaintenanceComment
{
    public Guid Id { get; set; }
    public Guid MaintenanceRequestId { get; set; }
    public string UserId { get; set; }
    public string Comment { get; set; }
    public DateTime CreatedAt { get; set; }
    public virtual MaintenanceRequest MaintenanceRequest { get; set; }
} 