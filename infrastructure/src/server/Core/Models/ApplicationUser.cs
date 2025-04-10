using System;
using Microsoft.AspNetCore.Identity;

namespace PropertyManagement.Core.Models
{
    public class ApplicationUser : IdentityUser
    {
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public UserRole Role { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? LastLogin { get; set; }
        public string ProfilePictureUrl { get; set; }
        public string TimeZone { get; set; }
        public string[] Permissions { get; set; }
    }

    public enum UserRole
    {
        Admin,
        PropertyManager,
        Accountant
    }

    public static class UserPermissions
    {
        public const string ManageUsers = "ManageUsers";
        public const string ManageRoles = "ManageRoles";
        public const string ManageProperties = "ManageProperties";
        public const string ManageTenants = "ManageTenants";
        public const string ManageLeases = "ManageLeases";
        public const string ManageMaintenance = "ManageMaintenance";
        public const string ManagePayments = "ManagePayments";
        public const string ManageDocuments = "ManageDocuments";
        public const string ViewReports = "ViewReports";
        public const string ManageSettings = "ManageSettings";
    }
} 