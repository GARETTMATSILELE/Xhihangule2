using System;
using System.Collections.Generic;

namespace PropertyManagement.Core.Models
{
    public class Property
    {
        public Guid Id { get; set; }
        public string Name { get; set; }
        public string Address { get; set; }
        public string City { get; set; }
        public string State { get; set; }
        public string ZipCode { get; set; }
        public decimal PurchasePrice { get; set; }
        public DateTime PurchaseDate { get; set; }
        public decimal CurrentValue { get; set; }
        public int TotalUnits { get; set; }
        public decimal MonthlyRent { get; set; }
        public PropertyType Type { get; set; }
        public PropertyStatus Status { get; set; }
        public Guid OwnerId { get; set; }
        public virtual PropertyOwner Owner { get; set; }
        public virtual ICollection<Lease> Leases { get; set; }
        public virtual ICollection<MaintenanceRequest> MaintenanceRequests { get; set; }
        public virtual ICollection<Document> Documents { get; set; }
    }

    public enum PropertyType
    {
        SingleFamily,
        MultiFamily,
        Apartment,
        Condo,
        Commercial,
        Industrial,
        Land
    }

    public enum PropertyStatus
    {
        Available,
        Rented,
        UnderMaintenance,
        Listed,
        Sold
    }
} 