export interface DashboardSummary {
  totalProperties: number;
  activeTenants: number;
  monthlyIncome: {
    collected: number;
    expected: number;
  };
  vacancies: number;
}

export interface MonthlyRentData {
  labels: string[];
  collected: number[];
  expected: number[];
}

export interface OccupancyData {
  occupied: number;
  vacant: number;
}

export interface Lease {
  id: number;
  property: string;
  unit: string;
  tenant: string;
  startDate: string;
  endDate: string;
}

export interface Expense {
  category: string;
  amount: number;
}

export interface Payment {
  id: number;
  tenant: string;
  property: string;
  amount: number;
  date: string;
  status: 'paid' | 'pending' | 'overdue';
}

export interface LeaseRenewal {
  id: number;
  tenant: string;
  property: string;
  currentEndDate: string;
  status: 'pending' | 'renewed' | 'expired';
}

export interface MaintenanceRequest {
  id: number;
  property: string;
  unit: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'completed';
}

export interface DelinquentTenant {
  id: number;
  tenant: string;
  property: string;
  amount: number;
  daysOverdue: number;
}

export interface DashboardData {
  summary: {
    totalProperties: number;
    activeTenants: number;
    monthlyIncome: {
      collected: number;
      expected: number;
    };
    vacancies: number;
  };
  monthlyRent: {
    labels: string[];
    collected: number[];
    expected: number[];
  };
  occupancy: {
    occupied: number;
    vacant: number;
  };
  leases: Array<{
    id: number;
    property: string;
    unit: string;
    tenant: string;
    startDate: string;
    endDate: string;
  }>;
  expenses: Array<{
    category: string;
    amount: number;
  }>;
  recentPayments: Array<{
    id: number;
    tenant: string;
    property: string;
    amount: number;
    date: string;
    status: 'paid' | 'pending' | 'overdue';
  }>;
  leaseRenewals: Array<{
    id: number;
    tenant: string;
    property: string;
    currentEndDate: string;
    status: 'pending' | 'renewed' | 'expired';
  }>;
  maintenanceRequests: Array<{
    id: number;
    property: string;
    unit: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'pending' | 'in-progress' | 'completed';
  }>;
  delinquentTenants: Array<{
    id: number;
    tenant: string;
    property: string;
    amount: number;
    daysOverdue: number;
  }>;
} 