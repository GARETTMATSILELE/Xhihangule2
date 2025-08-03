export enum MaintenancePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'emergency'
}

export enum MaintenanceCategory {
  GENERAL = 'GENERAL',
  PLUMBING = 'PLUMBING',
  ELECTRICAL = 'ELECTRICAL',
  HVAC = 'HVAC',
  STRUCTURAL = 'STRUCTURAL',
  APPLIANCE = 'APPLIANCE',
  LANDSCAPING = 'LANDSCAPING',
  SECURITY = 'security',
  OTHER = 'OTHER'
}

export enum MaintenanceStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface MaintenanceAttachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

export interface MaintenanceComment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: Date;
  attachments?: MaintenanceAttachment[];
}

export interface MaintenanceAccessWindow {
  start: Date;
  end: Date;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
}

export interface MaintenanceRequest {
  _id?: string;
  propertyId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status?: string;
  estimatedCost?: number;
  attachments?: string[];
  messages?: any[];
  ownerApprovalStatus: 'pending' | 'approved' | 'rejected';
  category: MaintenanceCategory;
  accessWindow: {
    start: Date;
    end: Date;
  };
  createdByName: string;
  comments: MaintenanceComment[];
  auditLog: {
    action: string;
    timestamp: Date;
    user: string;
    details?: string;
  }[];
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaintenanceCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  requestId: string;
  property: string;
  propertyName: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
} 