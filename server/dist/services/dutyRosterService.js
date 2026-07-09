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
const DutyRosterShift_1 = require("../models/DutyRosterShift");
const AgentAvailability_1 = require("../models/AgentAvailability");
const LeaveRequest_1 = require("../models/LeaveRequest");
const PublicHoliday_1 = require("../models/PublicHoliday");
const User_1 = require("../models/User");
const Property_1 = require("../models/Property");
const MS_DAY = 24 * 60 * 60 * 1000;
const toObjectId = (id) => new mongoose_1.default.Types.ObjectId(id);
function eachDay(start, end) {
    const days = [];
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
function isWeekend(date) {
    const d = date.getDay();
    return d === 0 || d === 6;
}
class DutyRosterService {
    listShifts(companyId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = { companyId: toObjectId(companyId), status: { $ne: 'cancelled' } };
            if (params === null || params === void 0 ? void 0 : params.agentId)
                query.agentId = toObjectId(params.agentId);
            if ((params === null || params === void 0 ? void 0 : params.from) || (params === null || params === void 0 ? void 0 : params.to)) {
                query.shiftDate = {};
                if (params.from)
                    query.shiftDate.$gte = new Date(params.from);
                if (params.to)
                    query.shiftDate.$lte = new Date(params.to);
            }
            return DutyRosterShift_1.DutyRosterShift.find(query)
                .populate('agentId', 'firstName lastName email')
                .sort({ shiftDate: 1 })
                .lean();
        });
    }
    createShift(companyId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return DutyRosterShift_1.DutyRosterShift.create(Object.assign(Object.assign({ companyId: toObjectId(companyId) }, data), { agentId: toObjectId(data.agentId), shiftDate: new Date(data.shiftDate), createdBy: data.createdBy ? toObjectId(data.createdBy) : undefined }));
        });
    }
    updateShift(companyId, shiftId, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            const payload = Object.assign({}, updates);
            if (updates.agentId)
                payload.agentId = toObjectId(updates.agentId);
            if (updates.shiftDate)
                payload.shiftDate = new Date(updates.shiftDate);
            return DutyRosterShift_1.DutyRosterShift.findOneAndUpdate({ _id: shiftId, companyId: toObjectId(companyId) }, payload, { new: true });
        });
    }
    deleteShift(companyId, shiftId) {
        return __awaiter(this, void 0, void 0, function* () {
            return DutyRosterShift_1.DutyRosterShift.findOneAndUpdate({ _id: shiftId, companyId: toObjectId(companyId) }, { status: 'cancelled' }, { new: true });
        });
    }
    listAvailability(companyId, agentId) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = { companyId: toObjectId(companyId) };
            if (agentId)
                query.agentId = toObjectId(agentId);
            return AgentAvailability_1.AgentAvailability.find(query).sort({ agentId: 1, dayOfWeek: 1 }).lean();
        });
    }
    upsertAvailability(companyId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return AgentAvailability_1.AgentAvailability.findOneAndUpdate({
                companyId: toObjectId(companyId),
                agentId: toObjectId(data.agentId),
                dayOfWeek: data.dayOfWeek,
            }, Object.assign(Object.assign({ companyId: toObjectId(companyId) }, data), { agentId: toObjectId(data.agentId) }), { upsert: true, new: true });
        });
    }
    listLeaveRequests(companyId, params) {
        return __awaiter(this, void 0, void 0, function* () {
            const query = { companyId: toObjectId(companyId) };
            if (params === null || params === void 0 ? void 0 : params.status)
                query.status = params.status;
            return LeaveRequest_1.LeaveRequest.find(query).populate('agentId', 'firstName lastName email').sort({ startDate: -1 }).lean();
        });
    }
    createLeaveRequest(companyId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return LeaveRequest_1.LeaveRequest.create({
                companyId: toObjectId(companyId),
                agentId: toObjectId(data.agentId),
                startDate: new Date(data.startDate),
                endDate: new Date(data.endDate),
                reason: data.reason,
            });
        });
    }
    reviewLeaveRequest(companyId, leaveId, status, reviewedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            return LeaveRequest_1.LeaveRequest.findOneAndUpdate({ _id: leaveId, companyId: toObjectId(companyId) }, { status, reviewedBy: toObjectId(reviewedBy), reviewedAt: new Date() }, { new: true });
        });
    }
    listHolidays(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            return PublicHoliday_1.PublicHoliday.find({ companyId: toObjectId(companyId) }).sort({ date: 1 }).lean();
        });
    }
    createHoliday(companyId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return PublicHoliday_1.PublicHoliday.create({
                companyId: toObjectId(companyId),
                name: data.name,
                date: new Date(data.date),
                recurring: data.recurring || false,
            });
        });
    }
    generateRoster(companyId, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const start = new Date(options.from);
            const end = new Date(options.to);
            const dutyTypes = ((_a = options.dutyTypes) === null || _a === void 0 ? void 0 : _a.length) ? options.dutyTypes : ['weekend_duty', 'office_duty'];
            const [agents, availability, leaveRequests, holidays, existingShifts, properties] = yield Promise.all([
                User_1.User.find({ companyId: toObjectId(companyId), role: { $in: ['agent', 'sales'] } }).select('_id firstName lastName').lean(),
                AgentAvailability_1.AgentAvailability.find({ companyId: toObjectId(companyId) }).lean(),
                LeaveRequest_1.LeaveRequest.find({ companyId: toObjectId(companyId), status: 'approved' }).lean(),
                PublicHoliday_1.PublicHoliday.find({ companyId: toObjectId(companyId) }).lean(),
                DutyRosterShift_1.DutyRosterShift.find({
                    companyId: toObjectId(companyId),
                    shiftDate: { $gte: start, $lte: end },
                    status: { $ne: 'cancelled' },
                }).lean(),
                Property_1.Property.countDocuments({ companyId: toObjectId(companyId) }),
            ]);
            if (!agents.length)
                return { created: 0, shifts: [] };
            const workload = new Map();
            for (const s of existingShifts) {
                const aid = String(s.agentId);
                workload.set(aid, (workload.get(aid) || 0) + 1);
            }
            const isOnLeave = (agentId, date) => leaveRequests.some((lr) => {
                if (String(lr.agentId) !== agentId)
                    return false;
                const s = new Date(lr.startDate);
                const e = new Date(lr.endDate);
                return date >= s && date <= e;
            });
            const isHoliday = (date) => holidays.some((h) => {
                const hd = new Date(h.date);
                if (h.recurring) {
                    return hd.getMonth() === date.getMonth() && hd.getDate() === date.getDate();
                }
                return hd.toDateString() === date.toDateString();
            });
            const agentAvailableOnDay = (agentId, date) => {
                const dow = date.getDay();
                const rows = availability.filter((a) => String(a.agentId) === agentId);
                if (!rows.length)
                    return true;
                const row = rows.find((a) => a.dayOfWeek === dow);
                return row ? row.available !== false : true;
            };
            const pickAgent = (date, dutyType, excludeIds) => {
                var _a;
                const candidates = agents
                    .filter((a) => {
                    const id = String(a._id);
                    if (excludeIds.has(id))
                        return false;
                    if (isOnLeave(id, date))
                        return false;
                    if (!agentAvailableOnDay(id, date))
                        return false;
                    if (dutyType === 'weekend_duty' && !isWeekend(date))
                        return false;
                    if (dutyType === 'office_duty' && isWeekend(date))
                        return false;
                    return true;
                })
                    .map((a) => {
                    var _a;
                    const id = String(a._id);
                    const avail = availability.find((av) => String(av.agentId) === id);
                    const skillBonus = (avail === null || avail === void 0 ? void 0 : avail.skillLevel) === 'senior' ? 2 : (avail === null || avail === void 0 ? void 0 : avail.skillLevel) === 'mid' ? 1 : 0;
                    const vehicleBonus = (avail === null || avail === void 0 ? void 0 : avail.vehicleAvailable) && dutyType === 'viewing_duty' ? 3 : 0;
                    const areaBonus = options.coverageArea && ((_a = avail === null || avail === void 0 ? void 0 : avail.coverageAreas) === null || _a === void 0 ? void 0 : _a.includes(options.coverageArea)) ? 2 : 0;
                    const load = workload.get(id) || 0;
                    return { agent: a, score: skillBonus + vehicleBonus + areaBonus - load * 2 };
                })
                    .sort((a, b) => b.score - a.score);
                return ((_a = candidates[0]) === null || _a === void 0 ? void 0 : _a.agent) || null;
            };
            const created = [];
            const days = eachDay(start, end).filter((d) => !isHoliday(d));
            const recentWeekendAgents = [];
            for (const day of days) {
                for (const dutyType of dutyTypes) {
                    if (dutyType === 'weekend_duty' && !isWeekend(day))
                        continue;
                    if (dutyType === 'office_duty' && isWeekend(day))
                        continue;
                    const exclude = new Set();
                    if (dutyType === 'weekend_duty' && recentWeekendAgents.length) {
                        exclude.add(recentWeekendAgents[recentWeekendAgents.length - 1]);
                    }
                    const agent = pickAgent(day, dutyType, exclude);
                    if (!agent)
                        continue;
                    const agentId = String(agent._id);
                    const exists = existingShifts.some((s) => String(s.agentId) === agentId &&
                        new Date(s.shiftDate).toDateString() === day.toDateString() &&
                        s.dutyType === dutyType);
                    if (exists)
                        continue;
                    const shift = yield DutyRosterShift_1.DutyRosterShift.create({
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
                        if (recentWeekendAgents.length > 3)
                            recentWeekendAgents.shift();
                    }
                }
            }
            return { created: created.length, shifts: created, propertiesUnderManagement: properties };
        });
    }
    getDutyTypes() {
        return DutyRosterShift_1.DUTY_TYPES;
    }
}
exports.default = new DutyRosterService();
