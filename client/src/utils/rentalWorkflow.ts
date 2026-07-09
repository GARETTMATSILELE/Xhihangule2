import { Property } from '../types/property';
import { Tenant } from '../types/tenant';
import { Lease } from '../types/lease';
import { Payment } from '../types/payment';

export type WorkflowStepKey =
  | 'propertyCreated'
  | 'ownerAssigned'
  | 'tenantPlaced'
  | 'leaseCreated'
  | 'billingActive'
  | 'occupancyActive'
  | 'inspectionCompliant';

export type WorkflowStatus =
  | 'Setup Incomplete'
  | 'Vacant'
  | 'Awaiting Lease'
  | 'Billing Missing'
  | 'Inspection Due'
  | 'Active Occupancy'
  | 'Lease Expiring';

export interface WorkflowStep {
  key: WorkflowStepKey;
  label: string;
  complete: boolean;
  missingLabel: string;
}

export interface WorkflowAction {
  label: string;
  path: string;
  intent?: 'primary' | 'secondary';
}

export interface PropertyWorkflowState {
  property: Property;
  propertyId: string;
  tenant?: Tenant;
  lease?: Lease;
  payments: Payment[];
  files: any[];
  ownerAssigned: boolean;
  completion: number;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  missingSteps: WorkflowStep[];
  recommendations: string[];
  quickActions: WorkflowAction[];
  leaseExpiresInDays?: number;
  inspectionDueCount?: number;
}

export interface WorkflowAlert {
  key: string;
  title: string;
  description: string;
  count: number;
  severity: 'info' | 'warning' | 'error' | 'success';
  path: string;
}

export interface WorkflowActivity {
  id: string;
  label: string;
  description: string;
  date?: Date;
  path: string;
}

export interface PortfolioWorkflowSummary {
  states: PropertyWorkflowState[];
  alerts: WorkflowAlert[];
  activity: WorkflowActivity[];
  completionAverage: number;
  incompleteCount: number;
  vacantCount: number;
  expiringLeaseCount: number;
  billingMissingCount: number;
}

const STEP_LABELS: Record<WorkflowStepKey, { label: string; missingLabel: string }> = {
  propertyCreated: { label: 'Property Created', missingLabel: 'Create property' },
  ownerAssigned: { label: 'Owner Assigned', missingLabel: 'Assign owner' },
  tenantPlaced: { label: 'Tenant Added', missingLabel: 'Add tenant' },
  leaseCreated: { label: 'Lease Created', missingLabel: 'Create lease' },
  billingActive: { label: 'Billing Configured', missingLabel: 'Configure billing' },
  occupancyActive: { label: 'Occupancy Active', missingLabel: 'Activate occupancy' },
  inspectionCompliant: { label: 'Inspection Compliant', missingLabel: 'Schedule inspection' },
};

export function getWorkflowId(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    if (value.$oid) return String(value.$oid);
    if (value._id) return getWorkflowId(value._id);
    if (value.id) return getWorkflowId(value.id);
  }
  return '';
}

function normalizeDate(value: any): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isActiveTenant(tenant: Tenant): boolean {
  return String(tenant.status || '').toLowerCase() === 'active';
}

function isTenantLinkedToProperty(tenant: Tenant, propertyId: string): boolean {
  const singlePropertyId = getWorkflowId((tenant as any).propertyId);
  const multiplePropertyIds = Array.isArray((tenant as any).propertyIds)
    ? ((tenant as any).propertyIds as any[]).map(getWorkflowId)
    : [];
  return singlePropertyId === propertyId || multiplePropertyIds.includes(propertyId);
}

function isLeaseLinkedToProperty(lease: Lease, propertyId: string): boolean {
  return getWorkflowId((lease as any).propertyId) === propertyId || getWorkflowId((lease as any).property?._id) === propertyId;
}

function isPaymentLinkedToProperty(payment: Payment, propertyId: string): boolean {
  return getWorkflowId((payment as any).propertyId) === propertyId || getWorkflowId((payment as any).property?._id) === propertyId;
}

function isFileLinkedToProperty(file: any, propertyId: string): boolean {
  return getWorkflowId(file?.propertyId) === propertyId || getWorkflowId(file?.property?._id) === propertyId;
}

function isInspectionLinkedToProperty(inspection: any, propertyId: string): boolean {
  return getWorkflowId(inspection?.propertyId) === propertyId || getWorkflowId(inspection?.property?._id) === propertyId;
}

function inspectionNeedsAttention(inspection: any): boolean {
  const status = String(inspection?.effectiveStatus || inspection?.status || '').toLowerCase();
  return ['due_today', 'overdue', 'missed', 'rescheduled'].includes(status);
}

function isCompletedPayment(payment: Payment): boolean {
  const status = String((payment as any).status || '').toLowerCase();
  return status === 'completed' || status === 'success' || status === 'paid';
}

function getLeaseDaysUntilExpiry(lease?: Lease): number | undefined {
  const endDate = normalizeDate((lease as any)?.endDate);
  if (!endDate) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function pickCurrentLease(leases: Lease[]): Lease | undefined {
  if (!leases.length) return undefined;
  const now = new Date();
  const active = leases.find((lease) => {
    const status = String((lease as any).status || '').toLowerCase();
    const start = normalizeDate((lease as any).startDate);
    const end = normalizeDate((lease as any).endDate);
    const withinDates = (!start || start <= now) && (!end || end >= now);
    return status === 'active' && withinDates;
  });
  if (active) return active;
  return [...leases].sort((a, b) => {
    const aDate = normalizeDate((a as any).startDate)?.getTime() || 0;
    const bDate = normalizeDate((b as any).startDate)?.getTime() || 0;
    return bDate - aDate;
  })[0];
}

function buildQuickActions(propertyId: string, state: Partial<PropertyWorkflowState>): WorkflowAction[] {
  const detailPath = `/agent-dashboard/properties/${propertyId}`;
  const actions: WorkflowAction[] = [];
  if (!state.ownerAssigned) actions.push({ label: 'Assign Owner', path: '/agent-dashboard/property-owners', intent: 'primary' });
  if (!state.tenant) actions.push({ label: 'Add Tenant', path: `/agent-dashboard/tenants?propertyId=${propertyId}`, intent: 'primary' });
  if (!state.lease) actions.push({ label: 'Create Lease', path: `/agent-dashboard/leases?propertyId=${propertyId}`, intent: state.tenant ? 'primary' : 'secondary' });
  if (!state.payments?.some(isCompletedPayment)) actions.push({ label: 'Record Payment', path: `/agent-dashboard/payments?propertyId=${propertyId}`, intent: 'secondary' });
  actions.push({ label: 'Open Property Hub', path: detailPath, intent: 'secondary' });
  return actions;
}

export function buildPropertyWorkflowState(
  property: Property,
  data: {
    tenants?: Tenant[];
    leases?: Lease[];
    payments?: Payment[];
    files?: any[];
    inspections?: any[];
  } = {}
): PropertyWorkflowState {
  const propertyId = getWorkflowId(property?._id);
  const tenants = (data.tenants || []).filter((tenant) => isTenantLinkedToProperty(tenant, propertyId));
  const activeTenant = tenants.find(isActiveTenant) || tenants[0];
  const propertyLeases = (data.leases || []).filter((lease) => isLeaseLinkedToProperty(lease, propertyId));
  const lease = pickCurrentLease(propertyLeases);
  const payments = (data.payments || []).filter((payment) => isPaymentLinkedToProperty(payment, propertyId));
  const files = (data.files || []).filter((file) => isFileLinkedToProperty(file, propertyId));
  const inspections = (data.inspections || []).filter((inspection) => isInspectionLinkedToProperty(inspection, propertyId));
  const ownerAssigned = Boolean(getWorkflowId((property as any).propertyOwnerId) || getWorkflowId((property as any).ownerId));
  const billingActive = payments.some(isCompletedPayment) || Boolean(lease && Number((lease as any).rentAmount || (lease as any).monthlyRent || 0) > 0);
  const occupancyActive = Boolean(activeTenant && lease && String((property as any).status || '').toLowerCase() === 'rented');
  const leaseExpiresInDays = getLeaseDaysUntilExpiry(lease);
  const isExpiring = typeof leaseExpiresInDays === 'number' && leaseExpiresInDays >= 0 && leaseExpiresInDays <= 60;
  const inspectionDueCount = inspections.filter(inspectionNeedsAttention).length;
  const inspectionCompliant = !lease || inspections.length > 0;

  const steps: WorkflowStep[] = [
    { key: 'propertyCreated', complete: Boolean(propertyId), ...STEP_LABELS.propertyCreated },
    { key: 'ownerAssigned', complete: ownerAssigned, ...STEP_LABELS.ownerAssigned },
    { key: 'tenantPlaced', complete: Boolean(activeTenant), ...STEP_LABELS.tenantPlaced },
    { key: 'leaseCreated', complete: Boolean(lease), ...STEP_LABELS.leaseCreated },
    { key: 'billingActive', complete: billingActive, ...STEP_LABELS.billingActive },
    { key: 'occupancyActive', complete: occupancyActive, ...STEP_LABELS.occupancyActive },
    { key: 'inspectionCompliant', complete: inspectionCompliant && inspectionDueCount === 0, ...STEP_LABELS.inspectionCompliant },
  ];

  const completeCount = steps.filter((step) => step.complete).length;
  const missingSteps = steps.filter((step) => !step.complete);
  const completion = Math.round((completeCount / steps.length) * 100);

  let status: WorkflowStatus = 'Setup Incomplete';
  if (!activeTenant) status = 'Vacant';
  else if (!lease) status = 'Awaiting Lease';
  else if (!billingActive) status = 'Billing Missing';
  else if (inspectionDueCount > 0 || !inspectionCompliant) status = 'Inspection Due';
  else if (isExpiring) status = 'Lease Expiring';
  else if (occupancyActive || (activeTenant && lease && billingActive)) status = 'Active Occupancy';

  const recommendations: string[] = [];
  if (!ownerAssigned) recommendations.push('Assign a property owner so responsibility is clear.');
  if (!activeTenant) recommendations.push('Add a tenant to move the property out of vacancy.');
  if (activeTenant && !lease) recommendations.push('Create a lease for the active tenant.');
  if (lease && !payments.some(isCompletedPayment)) recommendations.push('Record or configure the first rental payment.');
  if (isExpiring) recommendations.push('Review the lease expiry and prepare a renewal or vacancy plan.');
  if (!inspectionCompliant) recommendations.push('Generate lease-driven inspections for this occupancy period.');
  if (inspectionDueCount > 0) recommendations.push('Review overdue, due, or rescheduled inspections.');
  if (!files.length) recommendations.push('Upload lease or property documents when available.');

  return {
    property,
    propertyId,
    tenant: activeTenant,
    lease,
    payments,
    files,
    ownerAssigned,
    completion,
    status,
    steps,
    missingSteps,
    recommendations,
    quickActions: buildQuickActions(propertyId, { ownerAssigned, tenant: activeTenant, lease, payments }).concat(
      !inspectionCompliant || inspectionDueCount > 0
        ? [{ label: 'Open Inspections', path: `/agent-dashboard/inspections?propertyId=${propertyId}`, intent: 'primary' as const }]
        : []
    ),
    leaseExpiresInDays,
    inspectionDueCount,
  };
}

function buildAlert(key: string, title: string, description: string, count: number, severity: WorkflowAlert['severity'], path: string): WorkflowAlert | null {
  if (count <= 0) return null;
  return { key, title, description, count, severity, path };
}

function getRecordDate(record: any): Date | undefined {
  return normalizeDate(record?.updatedAt) || normalizeDate(record?.createdAt) || normalizeDate(record?.paymentDate) || normalizeDate(record?.uploadedAt);
}

export function buildWorkflowActivity(
  items: {
    properties?: Property[];
    tenants?: Tenant[];
    leases?: Lease[];
    payments?: Payment[];
    files?: any[];
    inspections?: any[];
  },
  basePath = '/agent-dashboard'
): WorkflowActivity[] {
  const activity: WorkflowActivity[] = [];

  (items.properties || []).forEach((property) => {
    const id = getWorkflowId(property._id);
    activity.push({
      id: `property-${id}`,
      label: 'Property added',
      description: property.name || property.address || 'Property record updated',
      date: getRecordDate(property),
      path: `${basePath}/properties/${id}`,
    });
  });

  (items.tenants || []).forEach((tenant) => {
    activity.push({
      id: `tenant-${getWorkflowId(tenant._id)}`,
      label: 'Tenant added',
      description: `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || tenant.email || 'Tenant record updated',
      date: getRecordDate(tenant),
      path: `${basePath}/tenants`,
    });
  });

  (items.leases || []).forEach((lease) => {
    const propertyId = getWorkflowId((lease as any).propertyId);
    activity.push({
      id: `lease-${getWorkflowId(lease._id)}`,
      label: 'Lease created',
      description: propertyId ? 'Lease linked to property' : 'Lease record updated',
      date: getRecordDate(lease),
      path: propertyId ? `${basePath}/properties/${propertyId}` : `${basePath}/leases`,
    });
  });

  (items.payments || []).forEach((payment) => {
    activity.push({
      id: `payment-${getWorkflowId(payment._id)}`,
      label: 'Payment received',
      description: `${(payment as any).currency || '$'} ${Number((payment as any).amount || 0).toLocaleString()}`,
      date: getRecordDate(payment),
      path: `${basePath}/payments`,
    });
  });

  (items.files || []).forEach((file) => {
    activity.push({
      id: `file-${getWorkflowId(file?._id) || file?.fileName}`,
      label: 'File uploaded',
      description: file?.fileName || 'Property file uploaded',
      date: getRecordDate(file),
      path: `${basePath}/files`,
    });
  });

  (items.inspections || []).forEach((inspection) => {
    const propertyId = getWorkflowId(inspection?.propertyId) || getWorkflowId(inspection?.property?._id);
    activity.push({
      id: `inspection-${getWorkflowId(inspection._id)}`,
      label: 'Inspection updated',
      description: `${String(inspection.type || 'routine').replace('_', ' ')} inspection ${inspection.effectiveStatus || inspection.status || 'scheduled'}`,
      date: getRecordDate(inspection) || normalizeDate(inspection?.scheduledDate),
      path: `${basePath}/inspections${propertyId ? `?propertyId=${propertyId}` : ''}`,
    });
  });

  return activity
    .filter((item) => item.date)
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
    .slice(0, 8);
}

export function buildPortfolioWorkflowSummary(
  data: {
    properties?: Property[];
    tenants?: Tenant[];
    leases?: Lease[];
    payments?: Payment[];
    files?: any[];
    inspections?: any[];
  },
  basePath = '/agent-dashboard'
): PortfolioWorkflowSummary {
  const states = (data.properties || []).map((property) => buildPropertyWorkflowState(property, data));
  const incompleteCount = states.filter((state) => state.completion < 100).length;
  const vacantCount = states.filter((state) => state.status === 'Vacant').length;
  const missingLeaseCount = states.filter((state) => state.tenant && !state.lease).length;
  const billingMissingCount = states.filter((state) => state.lease && !state.payments.some(isCompletedPayment)).length;
  const expiringLeaseCount = states.filter((state) => state.status === 'Lease Expiring').length;
  const inspectionDueCount = states.filter((state) => state.status === 'Inspection Due').length;
  const completionAverage = states.length
    ? Math.round(states.reduce((total, state) => total + state.completion, 0) / states.length)
    : 0;

  const alerts = [
    buildAlert('incomplete', 'Incomplete setups', 'Properties still need owner, tenant, lease, billing, or occupancy steps.', incompleteCount, 'warning', `${basePath}/workflow`),
    buildAlert('vacant', 'Vacant properties', 'Properties awaiting tenants.', vacantCount, 'info', `${basePath}/properties`),
    buildAlert('missing-leases', 'Properties missing leases', 'Tenanted properties that still need lease records.', missingLeaseCount, 'warning', `${basePath}/leases`),
    buildAlert('billing-missing', 'Billing setup missing', 'Active leases without a recorded completed payment.', billingMissingCount, 'error', `${basePath}/payments`),
    buildAlert('expiring-leases', 'Leases expiring soon', 'Leases ending within the next 60 days.', expiringLeaseCount, 'warning', `${basePath}/leases`),
    buildAlert('inspections-due', 'Inspections need attention', 'Properties with overdue, due, rescheduled, or missing lease inspections.', inspectionDueCount, 'warning', `${basePath}/inspections`),
  ].filter(Boolean) as WorkflowAlert[];

  return {
    states,
    alerts,
    activity: buildWorkflowActivity(data, basePath),
    completionAverage,
    incompleteCount,
    vacantCount,
    expiringLeaseCount,
    billingMissingCount,
  };
}
