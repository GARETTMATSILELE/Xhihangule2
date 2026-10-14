export const ECOSYSTEM_FLAGS = {
  TENANT_PORTAL_ENABLED: 'tenantPortalEnabled',
  CONTRACTOR_PORTAL_ENABLED: 'contractorPortalEnabled',
  PROPERTY_MARKETPLACE_ENABLED: 'propertyMarketplaceEnabled',
  MAINTENANCE_QUOTES_ENABLED: 'maintenanceQuotesEnabled',
  ONLINE_PAYMENTS_ENABLED: 'onlinePaymentsEnabled',
  MULTICHANNEL_NOTIFICATIONS_ENABLED: 'multichannelNotificationsEnabled',
  TENANT_REFERENCES_ENABLED: 'tenantReferencesEnabled',
  CONTRACTOR_RATINGS_ENABLED: 'contractorRatingsEnabled',
} as const;

export const VIEWING_STATUSES = [
  'REQUESTED',
  'UNDER_REVIEW',
  'CONFIRMED',
  'RESCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'DECLINED',
] as const;
export type ViewingStatus = (typeof VIEWING_STATUSES)[number];

export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'SENT_TO_OWNER',
  'OWNER_APPROVED',
  'OWNER_DECLINED',
  'MORE_INFORMATION_REQUIRED',
  'APPROVED',
  'DECLINED',
  'WITHDRAWN',
  'LEASE_PREPARATION',
  'LEASE_SIGNED',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const MAINTENANCE_CATEGORIES = [
  'PLUMBING',
  'ELECTRICAL',
  'WATER',
  'SECURITY',
  'APPLIANCE',
  'STRUCTURAL',
  'GARDEN',
  'CLEANING',
  'OTHER',
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export const MAINTENANCE_URGENCY = ['LOW', 'NORMAL', 'URGENT', 'EMERGENCY'] as const;
export type MaintenanceUrgency = (typeof MAINTENANCE_URGENCY)[number];

export const ECOSYSTEM_MAINTENANCE_STATUSES = [
  'REPORTED',
  'UNDER_REVIEW',
  'QUOTE_REQUESTED',
  'QUOTE_RECEIVED',
  'OWNER_APPROVAL',
  'APPROVED',
  'CONTRACTOR_ASSIGNED',
  'AUTHORISED',
  'SCHEDULED',
  'WORK_IN_PROGRESS',
  'COMPLETED',
  'TENANT_CONFIRMATION',
  'REOPENED',
  'CLOSED',
  'DECLINED',
] as const;
export type EcosystemMaintenanceStatus = (typeof ECOSYSTEM_MAINTENANCE_STATUSES)[number];

export const QUOTE_STATUSES = [
  'DRAFT',
  'INVITED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'SELECTED',
  'SENT_TO_OWNER',
  'OWNER_APPROVED',
  'OWNER_DECLINED',
  'EXPIRED',
  'WITHDRAWN',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const CONTRACTOR_JOB_STATUSES = [
  'INVITED',
  'QUOTE_REQUESTED',
  'QUOTE_SUBMITTED',
  'SELECTED',
  'AUTHORISED',
  'ACCEPTED',
  'SCHEDULED',
  'WORK_IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
  'CLOSED',
] as const;
export type ContractorJobStatus = (typeof CONTRACTOR_JOB_STATUSES)[number];

export const OWNER_DECISIONS = ['APPROVE', 'DECLINE', 'REQUEST_CHANGES', 'REQUEST_ANOTHER_QUOTE'] as const;
export type OwnerDecision = (typeof OWNER_DECISIONS)[number];

export const BROADCAST_SCOPES = ['TENANT', 'PROPERTY', 'BUILDING', 'PORTFOLIO', 'ALL_AGENCY_TENANTS'] as const;
export type BroadcastScope = (typeof BROADCAST_SCOPES)[number];

export const BROADCAST_PRIORITIES = ['NORMAL', 'IMPORTANT', 'URGENT', 'EMERGENCY'] as const;
export type BroadcastPriority = (typeof BROADCAST_PRIORITIES)[number];

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const DELIVERY_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const TEMPLATE_KEYS = [
  'VIEWING_REQUESTED',
  'VIEWING_CONFIRMED',
  'VIEWING_DECLINED',
  'VIEWING_RESCHEDULED',
  'APPLICATION_SUBMITTED',
  'APPLICATION_APPROVED',
  'APPLICATION_DECLINED',
  'RENT_PAYMENT_RECEIVED',
  'RENT_PAYMENT_REMINDER',
  'MAINTENANCE_REQUEST_RECEIVED',
  'QUOTE_REQUESTED',
  'QUOTE_RECEIVED',
  'QUOTE_SENT_TO_OWNER',
  'OWNER_QUOTE_APPROVED',
  'OWNER_QUOTE_DECLINED',
  'CONTRACTOR_AUTHORISED',
  'WORK_COMPLETED',
  'MAINTENANCE_REOPENED',
  'BROADCAST_MESSAGE',
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const LEGACY_STATUS_FROM_ECOSYSTEM: Record<string, string> = {
  REPORTED: 'draft',
  UNDER_REVIEW: 'draft',
  QUOTE_REQUESTED: 'draft',
  QUOTE_RECEIVED: 'draft',
  OWNER_APPROVAL: 'awaiting_approval',
  APPROVED: 'approved',
  CONTRACTOR_ASSIGNED: 'assigned',
  AUTHORISED: 'assigned',
  SCHEDULED: 'in_progress',
  WORK_IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  TENANT_CONFIRMATION: 'verified',
  REOPENED: 'in_progress',
  CLOSED: 'closed',
  DECLINED: 'rejected',
};

export const AUTHORISED_JOB_STATUSES: ContractorJobStatus[] = [
  'AUTHORISED',
  'ACCEPTED',
  'SCHEDULED',
  'WORK_IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
];
