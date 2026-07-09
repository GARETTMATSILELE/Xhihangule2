export type AlertSeverity = 'critical' | 'attention' | 'healthy';

export interface OperationsAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  link: string;
  category: string;
}

export interface BusinessHealthKpis {
  totalProperties: number;
  occupiedProperties: number;
  vacantProperties: number;
  occupancyRate: number;
  propertiesUnderManagement: number;
  totalMonthlyRent: number;
  outstandingRent: number;
  outstandingMunicipalBills: number;
  outstandingLevies: number;
  openMaintenanceRequests: number;
  upcomingLeaseRenewals: number;
  activeAgents: number;
  trends: Record<string, 'up' | 'down' | 'flat'>;
}

export interface AgentPerformanceRow {
  agentId: string;
  agentName: string;
  propertiesManaged: number;
  propertiesLet: number;
  vacancyClosures: number;
  rentCollectionSuccess: number;
  maintenanceResolution: number;
  viewingsConducted: number;
  leasesSigned: number;
  inspectionCompletion: number;
  revenueGenerated: number;
}

export interface VacancyRow {
  propertyId: string;
  propertyName: string;
  address: string;
  daysVacant: number;
  expectedRevenueLoss: number;
  assignedAgentId?: string;
  assignedAgentName?: string;
  marketingStatus: string;
  viewingCount: number;
  applicationsReceived: number;
  agingLevel: 'green' | 'amber' | 'red';
}

export interface ExecutiveDashboardData {
  businessHealth: BusinessHealthKpis;
  alerts: OperationsAlert[];
  agentPerformance: {
    leaderboard: AgentPerformanceRow[];
    highlights: Record<string, AgentPerformanceRow | null>;
  };
  vacancies: VacancyRow[];
  leaseExpiries: Array<{
    leaseId: string;
    propertyId: string;
    propertyName: string;
    endDate: string;
    daysUntil: number;
    severity: AlertSeverity;
  }>;
  maintenanceOverview: { open: number; overdue: number };
  inspectionSchedule: any[];
  leadPipeline: {
    total: number;
    byStage: Array<{ stage: string; count: number }>;
    conversionRate: number;
    bySource: Array<{ label: string; count: number }>;
  };
  rosterSummary: Array<{
    id: string;
    agentId: string;
    agentName: string;
    dutyType: string;
    shiftDate: string;
    coverageArea?: string;
    status: string;
  }>;
  lastUpdated: string;
}

export type DutyType =
  | 'weekend_duty'
  | 'office_duty'
  | 'viewing_duty'
  | 'emergency_maintenance_duty'
  | 'owner_relations_duty'
  | 'on_call_duty';

export const DUTY_TYPE_LABELS: Record<DutyType, string> = {
  weekend_duty: 'Weekend Duty',
  office_duty: 'Office Duty',
  viewing_duty: 'Viewing Duty',
  emergency_maintenance_duty: 'Emergency Maintenance Duty',
  owner_relations_duty: 'Owner Relations Duty',
  on_call_duty: 'On-Call Duty',
};

export interface DutyRosterShift {
  _id: string;
  agentId: { _id: string; firstName?: string; lastName?: string; email?: string } | string;
  dutyType: DutyType;
  shiftDate: string;
  startTime?: string;
  endTime?: string;
  coverageArea?: string;
  notes?: string;
  status: string;
  vehicleAvailable?: boolean;
}

export interface MunicipalBillsOverview {
  summary: {
    totalOutstanding: number;
    propertiesInArrears: number;
    billsDueThisMonth: number;
    overdueAccounts: number;
  };
  properties: Array<{
    propertyId: string;
    propertyName: string;
    address: string;
    currentBalance: number;
    outstandingBalance: number;
    dueDate: string;
    lastPayment?: string;
    status: string;
  }>;
  recentPayments: any[];
}
