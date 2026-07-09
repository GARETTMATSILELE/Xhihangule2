"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const Property_1 = require("../models/Property");
const Lease_1 = require("../models/Lease");
const User_1 = require("../models/User");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const Lead_1 = require("../models/Lead");
const Viewing_1 = require("../models/Viewing");
const Inspection_1 = require("../models/Inspection");
const PaymentRequest_1 = require("../models/PaymentRequest");
const MunicipalPayment_1 = require("../models/MunicipalPayment");
const DutyRosterShift_1 = require("../models/DutyRosterShift");
const dashboardKpiService_1 = __importDefault(require("./dashboardKpiService"));
const inspectionScheduleEngine_1 = require("./inspectionScheduleEngine");
const toObjectId = (id) => new mongoose_1.default.Types.ObjectId(id);
const MS_DAY = 24 * 60 * 60 * 1000;
class AgencyOperationsService {
    getExecutiveDashboard(companyId, dateFrom, dateTo) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = toObjectId(companyId);
            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * MS_DAY);
            const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_DAY);
            const rangeStart = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
            const rangeEnd = dateTo ? new Date(dateTo) : now;
            const [properties, leases, agents, maintenanceOpen, maintenanceOverdue, leads, viewings, inspections, paymentRequests, municipalPayments, kpiSnapshot, rosterShifts,] = yield Promise.all([
                Property_1.Property.find({ companyId: companyObjectId }).select('name address status rent rentalType levyOrMunicipalType levyOrMunicipalAmount ownerId vacantSince updatedAt createdAt').lean(),
                Lease_1.Lease.find({ companyId: companyObjectId }).select('propertyId tenantId status startDate endDate').lean(),
                User_1.User.find({ companyId: companyObjectId, role: { $in: ['agent', 'sales'] } }).select('firstName lastName email role').lean(),
                MaintenanceRequest_1.MaintenanceRequest.countDocuments({
                    companyId: companyObjectId,
                    status: { $nin: ['closed', 'verified', 'completed', 'cancelled', 'rejected'] },
                }),
                MaintenanceRequest_1.MaintenanceRequest.find({
                    companyId: companyObjectId,
                    status: { $nin: ['closed', 'verified', 'completed', 'cancelled', 'rejected'] },
                    createdAt: { $lt: thirtyDaysAgo },
                }).select('_id title propertyId createdAt status').limit(50).lean(),
                Lead_1.Lead.find({ companyId: companyObjectId, archivedAt: { $exists: false } }).select('name pipelineStage followUpStatus nextFollowUpDate assignedAgent source createdAt').lean(),
                Viewing_1.Viewing.find({ companyId: companyObjectId }).select('propertyId leadId when status outcome').lean(),
                Inspection_1.Inspection.find({ companyId: companyObjectId }).select('scheduledDate completedAt status type followUpRequired propertyId').lean(),
                PaymentRequest_1.PaymentRequest.find({ companyId: companyObjectId, 'approval.status': 'pending' }).select('reason propertyId developmentId reportHtml').limit(100).lean(),
                MunicipalPayment_1.MunicipalPayment.find({ companyId: companyObjectId }).select('propertyId amount status paymentDate').lean(),
                dashboardKpiService_1.default.getCompanySnapshot(companyId),
                DutyRosterShift_1.DutyRosterShift.find({
                    companyId: companyObjectId,
                    shiftDate: { $gte: now, $lte: new Date(now.getTime() + 7 * MS_DAY) },
                    status: { $ne: 'cancelled' },
                })
                    .populate('agentId', 'firstName lastName')
                    .sort({ shiftDate: 1 })
                    .limit(20)
                    .lean(),
            ]);
            const rentalProperties = properties.filter((p) => {
                const rt = String(p.rentalType || '').toLowerCase();
                return rt !== 'sale' && rt !== 'sales';
            });
            const totalProperties = rentalProperties.length;
            const occupiedProperties = rentalProperties.filter((p) => p.status === 'rented').length;
            const vacantProperties = rentalProperties.filter((p) => p.status === 'available').length;
            const occupancyRate = totalProperties ? Math.round((occupiedProperties / totalProperties) * 100) : 0;
            const totalMonthlyRent = rentalProperties
                .filter((p) => p.status === 'rented')
                .reduce((sum, p) => sum + Number(p.rent || 0), 0);
            const activeLeases = leases.filter((l) => String(l.status || '').toLowerCase() === 'active');
            const upcomingRenewals = activeLeases.filter((l) => {
                if (!l.endDate)
                    return false;
                const end = new Date(l.endDate);
                return end >= now && end <= thirtyDaysFromNow;
            }).length;
            const municipalProperties = rentalProperties.filter((p) => p.levyOrMunicipalType === 'municipal');
            let outstandingMunicipal = 0;
            const municipalByProperty = new Map();
            for (const mp of municipalPayments) {
                if (String(mp.status).toLowerCase() === 'completed') {
                    const pid = String(mp.propertyId);
                    municipalByProperty.set(pid, (municipalByProperty.get(pid) || 0) + Number(mp.amount || 0));
                }
            }
            for (const prop of municipalProperties) {
                const pid = String(prop._id);
                const monthly = Number(prop.levyOrMunicipalAmount || 0);
                const paid = municipalByProperty.get(pid) || 0;
                if (monthly > paid)
                    outstandingMunicipal += monthly - paid;
            }
            const businessHealth = {
                totalProperties,
                occupiedProperties,
                vacantProperties,
                occupancyRate,
                propertiesUnderManagement: totalProperties,
                totalMonthlyRent,
                outstandingRent: Number((kpiSnapshot === null || kpiSnapshot === void 0 ? void 0 : kpiSnapshot.outstandingRentals) || 0),
                outstandingMunicipalBills: outstandingMunicipal,
                outstandingLevies: Number((kpiSnapshot === null || kpiSnapshot === void 0 ? void 0 : kpiSnapshot.outstandingLevies) || 0),
                openMaintenanceRequests: maintenanceOpen,
                upcomingLeaseRenewals: upcomingRenewals,
                activeAgents: agents.length,
                trends: {
                    occupancyRate: occupancyRate >= 90 ? 'up' : occupancyRate >= 75 ? 'flat' : 'down',
                    vacantProperties: vacantProperties > 0 ? 'up' : 'flat',
                    outstandingRent: Number((kpiSnapshot === null || kpiSnapshot === void 0 ? void 0 : kpiSnapshot.outstandingRentals) || 0) > 0 ? 'up' : 'flat',
                },
            };
            const alerts = [];
            for (const lease of activeLeases) {
                if (!lease.endDate)
                    continue;
                const end = new Date(lease.endDate);
                if (end >= now && end <= thirtyDaysFromNow) {
                    const prop = rentalProperties.find((p) => String(p._id) === String(lease.propertyId));
                    alerts.push({
                        id: `lease-expiry-${lease._id}`,
                        severity: end.getTime() - now.getTime() <= 14 * MS_DAY ? 'critical' : 'attention',
                        title: 'Lease expiring within 30 days',
                        description: prop ? `${prop.name || 'Property'} lease ends ${end.toLocaleDateString()}` : `Lease ends ${end.toLocaleDateString()}`,
                        link: `/admin-dashboard/leases`,
                        category: 'leases',
                    });
                }
            }
            for (const prop of rentalProperties.filter((p) => p.status === 'available')) {
                const vacantSince = prop.vacantSince ? new Date(prop.vacantSince) : new Date(prop.updatedAt || prop.createdAt);
                const daysVacant = Math.floor((now.getTime() - vacantSince.getTime()) / MS_DAY);
                if (daysVacant >= 30) {
                    alerts.push({
                        id: `vacancy-${prop._id}`,
                        severity: daysVacant >= 60 ? 'critical' : 'attention',
                        title: 'Vacancy older than 30 days',
                        description: `${prop.name || 'Property'} vacant for ${daysVacant} days`,
                        link: `/admin-dashboard/vacancies`,
                        category: 'vacancies',
                    });
                }
            }
            for (const m of maintenanceOverdue) {
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
            for (const pr of paymentRequests) {
                alerts.push({
                    id: `approval-${pr._id}`,
                    severity: 'attention',
                    title: 'Owner approval pending',
                    description: pr.reason || 'Payment approval required',
                    link: `/admin-dashboard/approvals`,
                    category: 'approvals',
                });
            }
            for (const insp of inspections) {
                const effectiveStatus = (0, inspectionScheduleEngine_1.resolveInspectionStatus)(insp.scheduledDate, insp.completedAt, insp.status);
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
            const overdueFollowUps = leads.filter((l) => {
                if (l.followUpStatus === 'overdue')
                    return true;
                if (l.nextFollowUpDate && new Date(l.nextFollowUpDate) < now)
                    return true;
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
            const agentPerformance = yield this.buildAgentPerformance(companyId, agents, rentalProperties, leases, leads, viewings, inspections, rangeStart, rangeEnd);
            const vacancies = this.buildVacancyTracker(rentalProperties, leads, viewings);
            const leaseExpiries = activeLeases
                .filter((l) => l.endDate)
                .map((l) => {
                const prop = rentalProperties.find((p) => String(p._id) === String(l.propertyId));
                const end = new Date(l.endDate);
                const daysUntil = Math.ceil((end.getTime() - now.getTime()) / MS_DAY);
                return {
                    leaseId: String(l._id),
                    propertyId: String(l.propertyId),
                    propertyName: (prop === null || prop === void 0 ? void 0 : prop.name) || 'Property',
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
                byStage: ['NEW', 'CONTACTED', 'VIEWING_SCHEDULED', 'VIEWED', 'APPLICATION_RECEIVED', 'APPROVED', 'LEASE_PENDING', 'CONVERTED', 'LOST'].map((stage) => ({
                    stage,
                    count: leads.filter((l) => (l.pipelineStage || 'NEW') === stage).length,
                })),
                conversionRate: leads.length
                    ? Math.round((leads.filter((l) => l.pipelineStage === 'CONVERTED').length / leads.length) * 100)
                    : 0,
                bySource: this.groupBy(leads.map((l) => l.source || 'Unknown')),
            };
            const inspectionSchedule = inspections
                .map((i) => (Object.assign(Object.assign({}, i), { effectiveStatus: (0, inspectionScheduleEngine_1.resolveInspectionStatus)(i.scheduledDate, i.completedAt, i.status) })))
                .filter((i) => ['scheduled', 'upcoming', 'due_today', 'overdue'].includes(i.effectiveStatus))
                .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
                .slice(0, 10);
            const maintenanceOverview = {
                open: maintenanceOpen,
                overdue: maintenanceOverdue.length,
            };
            const rosterSummary = rosterShifts.map((s) => {
                var _a, _b;
                return ({
                    id: String(s._id),
                    agentId: String(((_a = s.agentId) === null || _a === void 0 ? void 0 : _a._id) || s.agentId),
                    agentName: ((_b = s.agentId) === null || _b === void 0 ? void 0 : _b.firstName)
                        ? `${s.agentId.firstName} ${s.agentId.lastName || ''}`.trim()
                        : 'Agent',
                    dutyType: s.dutyType,
                    shiftDate: s.shiftDate,
                    coverageArea: s.coverageArea,
                    status: s.status,
                });
            });
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
        });
    }
    groupBy(items) {
        const map = new Map();
        for (const item of items) {
            const key = item || 'Unknown';
            map.set(key, (map.get(key) || 0) + 1);
        }
        return Array.from(map.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count);
    }
    buildVacancyTracker(properties, leads, viewings) {
        const now = new Date();
        return properties
            .filter((p) => p.status === 'available')
            .map((prop) => {
            const vacantSince = prop.vacantSince ? new Date(prop.vacantSince) : new Date(prop.updatedAt || prop.createdAt);
            const daysVacant = Math.max(0, Math.floor((now.getTime() - vacantSince.getTime()) / MS_DAY));
            const monthlyRent = Number(prop.rent || 0);
            const expectedRevenueLoss = Math.round((monthlyRent / 30) * daysVacant);
            const propertyLeads = leads.filter((l) => (l.interestedPropertyIds || []).some((id) => String(id) === String(prop._id)));
            const propertyViewings = viewings.filter((v) => String(v.propertyId) === String(prop._id));
            const applications = propertyLeads.filter((l) => ['APPLICATION_RECEIVED', 'APPROVED', 'LEASE_PENDING'].includes(l.pipelineStage || '')).length;
            let agingLevel = 'green';
            if (daysVacant >= 30)
                agingLevel = 'red';
            else if (daysVacant >= 15)
                agingLevel = 'amber';
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
    buildAgentPerformance(companyId, agents, properties, leases, leads, viewings, inspections, rangeStart, rangeEnd) {
        return __awaiter(this, void 0, void 0, function* () {
            const rows = agents.map((agent) => {
                const agentId = String(agent._id);
                const agentName = `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email || 'Agent';
                const agentProperties = properties.filter((p) => String(p.ownerId) === agentId);
                const agentLeases = leases.filter((l) => String(l.status || '').toLowerCase() === 'active' &&
                    agentProperties.some((p) => String(p._id) === String(l.propertyId)));
                const agentLeads = leads.filter((l) => String(l.assignedAgent) === agentId);
                const agentViewings = viewings.filter((v) => {
                    const lead = leads.find((l) => String(l._id) === String(v.leadId));
                    return String(lead === null || lead === void 0 ? void 0 : lead.assignedAgent) === agentId;
                });
                const convertedLeads = agentLeads.filter((l) => l.pipelineStage === 'CONVERTED');
                const agentInspections = inspections.filter((i) => String(i.ownerId) === agentId);
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
                        return sum + Number((prop === null || prop === void 0 ? void 0 : prop.rent) || 0);
                    }, 0),
                };
            });
            rows.sort((a, b) => b.leasesSigned - a.leasesSigned || b.viewingsConducted - a.viewingsConducted);
            const pickTop = (key) => [...rows].sort((a, b) => Number(b[key]) - Number(a[key]))[0] || null;
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
        });
    }
}
exports.default = new AgencyOperationsService();
