import mongoose from 'mongoose';
import { DutyRosterShift, DUTY_TYPES, DutyType } from '../models/DutyRosterShift';
import { AgentAvailability } from '../models/AgentAvailability';
import { LeaveRequest } from '../models/LeaveRequest';
import { PublicHoliday } from '../models/PublicHoliday';
import { User } from '../models/User';
import { Property } from '../models/Property';

const MS_DAY = 24 * 60 * 60 * 1000;

const toObjectId = (id: string) => new mongoose.Types.ObjectId(id);

function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const limit = new Date(end);
  limit.setHours(23, 59, 59, 999);
  while (cursor <= limit) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

class DutyRosterService {
  async listShifts(companyId: string, params?: { from?: string; to?: string; agentId?: string }) {
    const query: any = { companyId: toObjectId(companyId), status: { $ne: 'cancelled' } };
    if (params?.agentId) query.agentId = toObjectId(params.agentId);
    if (params?.from || params?.to) {
      query.shiftDate = {};
      if (params.from) query.shiftDate.$gte = new Date(params.from);
      if (params.to) query.shiftDate.$lte = new Date(params.to);
    }
    return DutyRosterShift.find(query)
      .populate('agentId', 'firstName lastName email')
      .sort({ shiftDate: 1 })
      .lean();
  }

  async createShift(companyId: string, data: {
    agentId: string;
    dutyType: DutyType;
    shiftDate: string;
    startTime?: string;
    endTime?: string;
    coverageArea?: string;
    notes?: string;
    vehicleAvailable?: boolean;
    createdBy?: string;
  }) {
    return DutyRosterShift.create({
      companyId: toObjectId(companyId),
      ...data,
      agentId: toObjectId(data.agentId),
      shiftDate: new Date(data.shiftDate),
      createdBy: data.createdBy ? toObjectId(data.createdBy) : undefined,
    });
  }

  async updateShift(companyId: string, shiftId: string, updates: Partial<{
    agentId: string;
    dutyType: DutyType;
    shiftDate: string;
    startTime: string;
    endTime: string;
    coverageArea: string;
    notes: string;
    status: string;
    vehicleAvailable: boolean;
  }>) {
    const payload: any = { ...updates };
    if (updates.agentId) payload.agentId = toObjectId(updates.agentId);
    if (updates.shiftDate) payload.shiftDate = new Date(updates.shiftDate);
    return DutyRosterShift.findOneAndUpdate(
      { _id: shiftId, companyId: toObjectId(companyId) },
      payload,
      { new: true }
    );
  }

  async deleteShift(companyId: string, shiftId: string) {
    return DutyRosterShift.findOneAndUpdate(
      { _id: shiftId, companyId: toObjectId(companyId) },
      { status: 'cancelled' },
      { new: true }
    );
  }

  async listAvailability(companyId: string, agentId?: string) {
    const query: any = { companyId: toObjectId(companyId) };
    if (agentId) query.agentId = toObjectId(agentId);
    return AgentAvailability.find(query).sort({ agentId: 1, dayOfWeek: 1 }).lean();
  }

  async upsertAvailability(companyId: string, data: {
    agentId: string;
    dayOfWeek: number;
    available: boolean;
    startTime?: string;
    endTime?: string;
    coverageAreas?: string[];
    skillLevel?: 'junior' | 'mid' | 'senior';
    vehicleAvailable?: boolean;
  }) {
    return AgentAvailability.findOneAndUpdate(
      {
        companyId: toObjectId(companyId),
        agentId: toObjectId(data.agentId),
        dayOfWeek: data.dayOfWeek,
      },
      { companyId: toObjectId(companyId), ...data, agentId: toObjectId(data.agentId) },
      { upsert: true, new: true }
    );
  }

  async listLeaveRequests(companyId: string, params?: { status?: string }) {
    const query: any = { companyId: toObjectId(companyId) };
    if (params?.status) query.status = params.status;
    return LeaveRequest.find(query).populate('agentId', 'firstName lastName email').sort({ startDate: -1 }).lean();
  }

  async createLeaveRequest(companyId: string, data: {
    agentId: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }) {
    return LeaveRequest.create({
      companyId: toObjectId(companyId),
      agentId: toObjectId(data.agentId),
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      reason: data.reason,
    });
  }

  async reviewLeaveRequest(companyId: string, leaveId: string, status: 'approved' | 'rejected', reviewedBy: string) {
    return LeaveRequest.findOneAndUpdate(
      { _id: leaveId, companyId: toObjectId(companyId) },
      { status, reviewedBy: toObjectId(reviewedBy), reviewedAt: new Date() },
      { new: true }
    );
  }

  async listHolidays(companyId: string) {
    return PublicHoliday.find({ companyId: toObjectId(companyId) }).sort({ date: 1 }).lean();
  }

  async createHoliday(companyId: string, data: { name: string; date: string; recurring?: boolean }) {
    return PublicHoliday.create({
      companyId: toObjectId(companyId),
      name: data.name,
      date: new Date(data.date),
      recurring: data.recurring || false,
    });
  }

  async generateRoster(companyId: string, options: {
    from: string;
    to: string;
    dutyTypes?: DutyType[];
    coverageArea?: string;
    createdBy?: string;
  }) {
    const start = new Date(options.from);
    const end = new Date(options.to);
    const dutyTypes = options.dutyTypes?.length ? options.dutyTypes : (['weekend_duty', 'office_duty'] as DutyType[]);

    const [agents, availability, leaveRequests, holidays, existingShifts, properties] = await Promise.all([
      User.find({ companyId: toObjectId(companyId), role: { $in: ['agent', 'sales'] } }).select('_id firstName lastName').lean(),
      AgentAvailability.find({ companyId: toObjectId(companyId) }).lean(),
      LeaveRequest.find({ companyId: toObjectId(companyId), status: 'approved' }).lean(),
      PublicHoliday.find({ companyId: toObjectId(companyId) }).lean(),
      DutyRosterShift.find({
        companyId: toObjectId(companyId),
        shiftDate: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' },
      }).lean(),
      Property.countDocuments({ companyId: toObjectId(companyId) }),
    ]);

    if (!agents.length) return { created: 0, shifts: [] };

    const workload = new Map<string, number>();
    for (const s of existingShifts as any[]) {
      const aid = String(s.agentId);
      workload.set(aid, (workload.get(aid) || 0) + 1);
    }

    const isOnLeave = (agentId: string, date: Date) =>
      (leaveRequests as any[]).some((lr) => {
        if (String(lr.agentId) !== agentId) return false;
        const s = new Date(lr.startDate);
        const e = new Date(lr.endDate);
        return date >= s && date <= e;
      });

    const isHoliday = (date: Date) =>
      (holidays as any[]).some((h) => {
        const hd = new Date(h.date);
        if (h.recurring) {
          return hd.getMonth() === date.getMonth() && hd.getDate() === date.getDate();
        }
        return hd.toDateString() === date.toDateString();
      });

    const agentAvailableOnDay = (agentId: string, date: Date) => {
      const dow = date.getDay();
      const rows = (availability as any[]).filter((a) => String(a.agentId) === agentId);
      if (!rows.length) return true;
      const row = rows.find((a) => a.dayOfWeek === dow);
      return row ? row.available !== false : true;
    };

    const pickAgent = (date: Date, dutyType: DutyType, excludeIds: Set<string>) => {
      const candidates = (agents as any[])
        .filter((a) => {
          const id = String(a._id);
          if (excludeIds.has(id)) return false;
          if (isOnLeave(id, date)) return false;
          if (!agentAvailableOnDay(id, date)) return false;
          if (dutyType === 'weekend_duty' && !isWeekend(date)) return false;
          if (dutyType === 'office_duty' && isWeekend(date)) return false;
          return true;
        })
        .map((a) => {
          const id = String(a._id);
          const avail = (availability as any[]).find((av) => String(av.agentId) === id);
          const skillBonus = avail?.skillLevel === 'senior' ? 2 : avail?.skillLevel === 'mid' ? 1 : 0;
          const vehicleBonus = avail?.vehicleAvailable && dutyType === 'viewing_duty' ? 3 : 0;
          const areaBonus =
            options.coverageArea && avail?.coverageAreas?.includes(options.coverageArea) ? 2 : 0;
          const load = workload.get(id) || 0;
          return { agent: a, score: skillBonus + vehicleBonus + areaBonus - load * 2 };
        })
        .sort((a, b) => b.score - a.score);

      return candidates[0]?.agent || null;
    };

    const created: any[] = [];
    const days = eachDay(start, end).filter((d) => !isHoliday(d));
    const recentWeekendAgents: string[] = [];

    for (const day of days) {
      for (const dutyType of dutyTypes) {
        if (dutyType === 'weekend_duty' && !isWeekend(day)) continue;
        if (dutyType === 'office_duty' && isWeekend(day)) continue;

        const exclude = new Set<string>();
        if (dutyType === 'weekend_duty' && recentWeekendAgents.length) {
          exclude.add(recentWeekendAgents[recentWeekendAgents.length - 1]);
        }

        const agent = pickAgent(day, dutyType, exclude);
        if (!agent) continue;

        const agentId = String(agent._id);
        const exists = (existingShifts as any[]).some(
          (s) =>
            String(s.agentId) === agentId &&
            new Date(s.shiftDate).toDateString() === day.toDateString() &&
            s.dutyType === dutyType
        );
        if (exists) continue;

        const shift = await DutyRosterShift.create({
          companyId: toObjectId(companyId),
          agentId: toObjectId(agentId),
          dutyType,
          shiftDate: day,
          coverageArea: options.coverageArea,
          status: 'scheduled',
          createdBy: options.createdBy ? toObjectId(options.createdBy) : undefined,
        });
        created.push(shift);
        workload.set(agentId, (workload.get(agentId) || 0) + 1);
        if (dutyType === 'weekend_duty') {
          recentWeekendAgents.push(agentId);
          if (recentWeekendAgents.length > 3) recentWeekendAgents.shift();
        }
      }
    }

    return { created: created.length, shifts: created, propertiesUnderManagement: properties };
  }

  getDutyTypes() {
    return DUTY_TYPES;
  }
}

export default new DutyRosterService();
