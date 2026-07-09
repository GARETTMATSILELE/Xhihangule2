import mongoose from 'mongoose';
import { Property } from '../models/Property';
import { Lease } from '../models/Lease';
import { User } from '../models/User';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { Lead } from '../models/Lead';
import { Viewing } from '../models/Viewing';
import { Inspection } from '../models/Inspection';
import { PaymentRequest } from '../models/PaymentRequest';
import { MunicipalPayment } from '../models/MunicipalPayment';
import { DutyRosterShift } from '../models/DutyRosterShift';
import dashboardKpiService from './dashboardKpiService';
import { resolveInspectionStatus } from './inspectionScheduleEngine';

const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);
const MS_DAY = 24 * 60 * 60 * 1000;

export type AlertSeverity = 'critical' | 'attention' | 'healthy';

export interface OperationsAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  link: string;
  category: string;
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

class AgencyOperationsService {
  async getExecutiveDashboard(companyId: string, dateFrom?: string, dateTo?: string) {
    const companyObjectId = toObjectId(companyId);
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * MS_DAY);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_DAY);
    const rangeStart = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const rangeEnd = dateTo ? new Date(dateTo) : now;

    const [
      properties,
      leases,
      agents,
      maintenanceOpen,
      maintenanceOverdue,
      leads,
      viewings,
      inspections,
      paymentRequests,
      municipalPayments,
      kpiSnapshot,
      rosterShifts,
    ] = await Promise.all([
      Property.find({ companyId: companyObjectId }).select('name address status rent rentalType levyOrMunicipalType levyOrMunicipalAmount ownerId vacantSince updatedAt createdAt').lean(),
      Lease.find({ companyId: companyObjectId }).select('propertyId tenantId status startDate endDate').lean(),
      User.find({ companyId: companyObjectId, role: { $in: ['agent', 'sales'] } }).select('firstName lastName email role').lean(),
      MaintenanceRequest.countDocuments({
        companyId: companyObjectId,
        status: { $nin: ['closed', 'verified', 'completed', 'cancelled', 'rejected'] },
      }),
      MaintenanceRequest.find({
        companyId: companyObjectId,
        status: { $nin: ['closed', 'verified', 'completed', 'cancelled', 'rejected'] },
        createdAt: { $lt: thirtyDaysAgo },
      }).select('_id title propertyId createdAt status').limit(50).lean(),
      Lead.find({ companyId: companyObjectId, archivedAt: { $exists: false } }).select('name pipelineStage followUpStatus nextFollowUpDate assignedAgent source createdAt').lean(),
      Viewing.find({ companyId: companyObjectId }).select('propertyId leadId when status outcome').lean(),
      Inspection.find({ companyId: companyObjectId }).select('scheduledDate completedAt status type followUpRequired propertyId').lean(),
      PaymentRequest.find({ companyId: companyObjectId, 'approval.status': 'pending' }).select('reason propertyId developmentId reportHtml').limit(100).lean(),
      MunicipalPayment.find({ companyId: companyObjectId }).select('propertyId amount status paymentDate').lean(),
      dashboardKpiService.getCompanySnapshot(companyId),
      DutyRosterShift.find({
        companyId: companyObjectId,
        shiftDate: { $gte: now, $lte: new Date(now.getTime() + 7 * MS_DAY) },
        status: { $ne: 'cancelled' },
      })
        .populate('agentId', 'firstName lastName')
        .sort({ shiftDate: 1 })
        .limit(20)
        .lean(),
    ]);

    const rentalProperties = properties.filter((p: any) => {
      const rt = String(p.rentalType || '').toLowerCase();
      return rt !== 'sale' && rt !== 'sales';
    });

    const totalProperties = rentalProperties.length;
    const occupiedProperties = rentalProperties.filter((p: any) => p.status === 'rented').length;
    const vacantProperties = rentalProperties.filter((p: any) => p.status === 'available').length;
    const occupancyRate = totalProperties ? Math.round((occupiedProperties / totalProperties) * 100) : 0;
    const totalMonthlyRent = rentalProperties
      .filter((p: any) => p.status === 'rented')
      .reduce((sum: number, p: any) => sum + Number(p.rent || 0), 0);

    const activeLeases = leases.filter((l: any) => String(l.status || '').toLowerCase() === 'active');
    const upcomingRenewals = activeLeases.filter((l: any) => {
      if (!l.endDate) return false;
      const end = new Date(l.endDate);
      return end >= now && end <= thirtyDaysFromNow;
    }).length;

    const municipalProperties = rentalProperties.filter((p: any) => p.levyOrMunicipalType === 'municipal');
    let outstandingMunicipal = 0;
    const municipalByProperty = new Map<string, number>();
    for (const mp of municipalPayments as any[]) {
      if (String(mp.status).toLowerCase() === 'completed') {
        const pid = String(mp.propertyId);
        municipalByProperty.set(pid, (municipalByProperty.get(pid) || 0) + Number(mp.amount || 0));
      }
    }
    for (const prop of municipalProperties) {
      const pid = String((prop as any)._id);
      const monthly = Number((prop as any).levyOrMunicipalAmount || 0);
      const paid = municipalByProperty.get(pid) || 0;
      if (monthly > paid) outstandingMunicipal += monthly - paid;
    }

    const businessHealth = {
      totalProperties,
      occupiedProperties,
      vacantProperties,
      occupancyRate,
      propertiesUnderManagement: totalProperties,
      totalMonthlyRent,
      outstandingRent: Number(kpiSnapshot?.outstandingRentals || 0),
      outstandingMunicipalBills: outstandingMunicipal,
      outstandingLevies: Number(kpiSnapshot?.outstandingLevies || 0),
      openMaintenanceRequests: maintenanceOpen,
      upcomingLeaseRenewals: upcomingRenewals,
      activeAgents: agents.length,
      trends: {
        occupancyRate: occupancyRate >= 90 ? 'up' : occupancyRate >= 75 ? 'flat' : 'down',
        vacantProperties: vacantProperties > 0 ? 'up' : 'flat',
        outstandingRent: Number(kpiSnapshot?.outstandingRentals || 0) > 0 ? 'up' : 'flat',
      },
    };

    const alerts: OperationsAlert[] = [];

    for (const lease of activeLeases) {
      if (!lease.endDate) continue;
      const end = new Date(lease.endDate as any);
      if (end >= now && end <= thirtyDaysFromNow) {
        const prop = rentalProperties.find((p: any) => String(p._id) === String((lease as any).propertyId));
        alerts.push({
          id: `lease-expiry-${(lease as any)._id}`,
          severity: end.getTime() - now.getTime() <= 14 * MS_DAY ? 'critical' : 'attention',
          title: 'Lease expiring within 30 days',
          description: prop ? `${(prop as any).name || 'Property'} lease ends ${end.toLocaleDateString()}` : `Lease ends ${end.toLocaleDateString()}`,
          link: `/admin-dashboard/leases`,
          category: 'leases',
        });
      }
    }

    for (const prop of rentalProperties.filter((p: any) => p.status === 'available')) {
      const vacantSince = (prop as any).vacantSince ? new Date((prop as any).vacantSince) : new Date((prop as any).updatedAt || (prop as any).createdAt);
      const daysVacant = Math.floor((now.getTime() - vacantSince.getTime()) / MS_DAY);
      if (daysVacant >= 30) {
        alerts.push({
          id: `vacancy-${(prop as any)._id}`,
          severity: daysVacant >= 60 ? 'critical' : 'attention',
          title: 'Vacancy older than 30 days',
          description: `${(prop as any).name || 'Property'} vacant for ${daysVacant} days`,
          link: `/admin-dashboard/vacancies`,
          category: 'vacancies',
        });
      }
    }

    for (const m of maintenanceOverdue as any[]) {
      alerts.push({
        id: `maintenance-${m._id}`,
        severity: 'critical',
        title: 'Overdue maintenance job',
        description: m.title || 'Maintenance request overdue',
        link: `/admin-dashboard/maintenance`,
        category: 'maintenance',
      });
    }

    if (outstandingMunicipal > 0) {
      alerts.push({
        id: 'municipal-overdue',
        severity: 'attention',
        title: 'Municipal bills outstanding',
        description: `$${outstandingMunicipal.toLocaleString()} outstanding across portfolio`,
        link: `/admin-dashboard/municipal-bills`,
        category: 'municipal',
      });
    }

    for (const pr of paymentRequests as any[]) {
      alerts.push({
        id: `approval-${pr._id}`,
        severity: 'attention',
        title: 'Owner approval pending',
        description: pr.reason || 'Payment approval required',
        link: `/admin-dashboard/approvals`,
        category: 'approvals',
      });
    }

    for (const insp of inspections as any[]) {
      const effectiveStatus = resolveInspectionStatus(insp.scheduledDate, insp.completedAt, insp.status);
      if (effectiveStatus === 'overdue' || (insp.followUpRequired && !insp.completedAt)) {
        alerts.push({
          id: `inspection-${insp._id}`,
          severity: effectiveStatus === 'overdue' ? 'critical' : 'attention',
          title: 'Inspection report pending',
          description: `${String(insp.type || 'routine').replace(/_/g, ' ')} inspection requires attention`,
          link: `/admin-dashboard/inspections`,
          category: 'inspections',
        });
      }
    }

    const overdueFollowUps = (leads as any[]).filter((l) => {
      if (l.followUpStatus === 'overdue') return true;
      if (l.nextFollowUpDate && new Date(l.nextFollowUpDate) < now) return true;
      return false;
    });
    for (const lead of overdueFollowUps.slice(0, 10)) {
      alerts.push({
        id: `lead-followup-${lead._id}`,
        severity: 'attention',
        title: 'Agent follow-up overdue',
        description: `${lead.name} requires follow-up`,
        link: `/admin-dashboard/leads`,
        category: 'leads',
      });
    }

    alerts.sort((a, b) => {
      const order = { critical: 0, attention: 1, healthy: 2 };
      return order[a.severity] - order[b.severity];
    });

    const agentPerformance = await this.buildAgentPerformance(
      companyId,
      agents as any[],
      rentalProperties,
      leases as any[],
      leads as any[],
      viewings as any[],
      inspections as any[],
      rangeStart,
      rangeEnd
    );

    const vacancies = this.buildVacancyTracker(rentalProperties, leads as any[], viewings as any[]);

    const leaseExpiries = activeLeases
      .filter((l: any) => l.endDate)
      .map((l: any) => {
        const prop = rentalProperties.find((p: any) => String(p._id) === String(l.propertyId));
        const end = new Date(l.endDate);
        const daysUntil = Math.ceil((end.getTime() - now.getTime()) / MS_DAY);
        return {
          leaseId: String(l._id),
          propertyId: String(l.propertyId),
          propertyName: (prop as any)?.name || 'Property',
          endDate: end.toISOString(),
          daysUntil,
          severity: daysUntil <= 14 ? 'critical' : daysUntil <= 30 ? 'attention' : 'healthy',
        };
      })
      .filter((l) => l.daysUntil <= 90 && l.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 15);

    const leadPipeline = {
      total: leads.length,
      byStage: ['NEW', 'CONTACTED', 'VIEWING_SCHEDULED', 'VIEWED', 'APPLICATION_RECEIVED', 'APPROVED', 'LEASE_PENDING', 'CONVERTED', 'LOST'].map(
        (stage) => ({
          stage,
          count: (leads as any[]).filter((l) => (l.pipelineStage || 'NEW') === stage).length,
        })
      ),
      conversionRate: leads.length
        ? Math.round(((leads as any[]).filter((l) => l.pipelineStage === 'CONVERTED').length / leads.length) * 100)
        : 0,
      bySource: this.groupBy((leads as any[]).map((l) => l.source || 'Unknown')),
    };

    const inspectionSchedule = (inspections as any[])
      .map((i) => ({
        ...i,
        effectiveStatus: resolveInspectionStatus(i.scheduledDate, i.completedAt, i.status),
      }))
      .filter((i) => ['scheduled', 'upcoming', 'due_today', 'overdue'].includes(i.effectiveStatus))
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
      .slice(0, 10);

    const maintenanceOverview = {
      open: maintenanceOpen,
      overdue: (maintenanceOverdue as any[]).length,
    };

    const rosterSummary = (rosterShifts as any[]).map((s) => ({
      id: String(s._id),
      agentId: String(s.agentId?._id || s.agentId),
      agentName: s.agentId?.firstName
        ? `${s.agentId.firstName} ${s.agentId.lastName || ''}`.trim()
        : 'Agent',
      dutyType: s.dutyType,
      shiftDate: s.shiftDate,
      coverageArea: s.coverageArea,
      status: s.status,
    }));

    return {
      businessHealth,
      alerts: alerts.slice(0, 25),
      agentPerformance,
      vacancies: vacancies.slice(0, 20),
      leaseExpiries,
      maintenanceOverview,
      inspectionSchedule,
      leadPipeline,
      rosterSummary,
      lastUpdated: new Date().toISOString(),
    };
  }

  private groupBy(items: string[]): Array<{ label: string; count: number }> {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = item || 'Unknown';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  private buildVacancyTracker(properties: any[], leads: any[], viewings: any[]): VacancyRow[] {
    const now = new Date();
    return properties
      .filter((p) => p.status === 'available')
      .map((prop) => {
        const vacantSince = prop.vacantSince ? new Date(prop.vacantSince) : new Date(prop.updatedAt || prop.createdAt);
        const daysVacant = Math.max(0, Math.floor((now.getTime() - vacantSince.getTime()) / MS_DAY));
        const monthlyRent = Number(prop.rent || 0);
        const expectedRevenueLoss = Math.round((monthlyRent / 30) * daysVacant);
        const propertyLeads = leads.filter((l) =>
          (l.interestedPropertyIds || []).some((id: any) => String(id) === String(prop._id))
        );
        const propertyViewings = viewings.filter((v) => String(v.propertyId) === String(prop._id));
        const applications = propertyLeads.filter((l) =>
          ['APPLICATION_RECEIVED', 'APPROVED', 'LEASE_PENDING'].includes(l.pipelineStage || '')
        ).length;
        let agingLevel: 'green' | 'amber' | 'red' = 'green';
        if (daysVacant >= 30) agingLevel = 'red';
        else if (daysVacant >= 15) agingLevel = 'amber';
        return {
          propertyId: String(prop._id),
          propertyName: prop.name || 'Unnamed Property',
          address: prop.address || '',
          daysVacant,
          expectedRevenueLoss,
          assignedAgentId: prop.ownerId ? String(prop.ownerId) : undefined,
          marketingStatus: daysVacant < 7 ? 'Active' : daysVacant < 30 ? 'Needs Boost' : 'Urgent',
          viewingCount: propertyViewings.length,
          applicationsReceived: applications,
          agingLevel,
        };
      })
      .sort((a, b) => b.daysVacant - a.daysVacant);
  }

  private async buildAgentPerformance(
    companyId: string,
    agents: any[],
    properties: any[],
    leases: any[],
    leads: any[],
    viewings: any[],
    inspections: any[],
    rangeStart: Date,
    rangeEnd: Date
  ): Promise<{ leaderboard: AgentPerformanceRow[]; highlights: Record<string, AgentPerformanceRow | null> }> {
    const rows: AgentPerformanceRow[] = agents.map((agent) => {
      const agentId = String(agent._id);
      const agentName = `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email || 'Agent';
      const agentProperties = properties.filter((p) => String(p.ownerId) === agentId);
      const agentLeases = leases.filter(
        (l) =>
          String(l.status || '').toLowerCase() === 'active' &&
          agentProperties.some((p) => String(p._id) === String(l.propertyId))
      );
      const agentLeads = leads.filter((l) => String(l.assignedAgent) === agentId);
      const agentViewings = viewings.filter((v) => {
        const lead = leads.find((l) => String(l._id) === String(v.leadId));
        return String(lead?.assignedAgent) === agentId;
      });
      const convertedLeads = agentLeads.filter((l) => l.pipelineStage === 'CONVERTED');
      const agentInspections = inspections.filter((i) => String((i as any).ownerId) === agentId);
      const completedInspections = agentInspections.filter((i) => i.completedAt);

      return {
        agentId,
        agentName,
        propertiesManaged: agentProperties.length,
        propertiesLet: agentLeases.length,
        vacancyClosures: convertedLeads.length,
        rentCollectionSuccess: agentLeases.length
          ? Math.min(100, Math.round((agentLeases.length / Math.max(agentProperties.length, 1)) * 100))
          : 0,
        maintenanceResolution: 0,
        viewingsConducted: agentViewings.filter((v) => {
          const when = new Date(v.when);
          return when >= rangeStart && when <= rangeEnd;
        }).length,
        leasesSigned: convertedLeads.filter((l) => {
          const d = l.convertedAt ? new Date(l.convertedAt) : null;
          return d && d >= rangeStart && d <= rangeEnd;
        }).length,
        inspectionCompletion: agentInspections.length
          ? Math.round((completedInspections.length / agentInspections.length) * 100)
          : 0,
        revenueGenerated: agentLeases.reduce((sum, l) => {
          const prop = agentProperties.find((p) => String(p._id) === String(l.propertyId));
          return sum + Number(prop?.rent || 0);
        }, 0),
      };
    });

    rows.sort((a, b) => b.leasesSigned - a.leasesSigned || b.viewingsConducted - a.viewingsConducted);

    const pickTop = (key: keyof AgentPerformanceRow) =>
      [...rows].sort((a, b) => Number(b[key]) - Number(a[key]))[0] || null;

    return {
      leaderboard: rows,
      highlights: {
        topAgent: rows[0] || null,
        mostLeasesSigned: pickTop('leasesSigned'),
        highestOccupancy: pickTop('rentCollectionSuccess'),
        mostViewings: pickTop('viewingsConducted'),
        mostRevenue: pickTop('revenueGenerated'),
      },
    };
  }
}

export default new AgencyOperationsService();
