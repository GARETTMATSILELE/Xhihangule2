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
exports.getDutyTypes = exports.createPublicHoliday = exports.listPublicHolidays = exports.reviewLeaveRequest = exports.createLeaveRequest = exports.listLeaveRequests = exports.upsertAgentAvailability = exports.listAgentAvailability = exports.generateDutyRoster = exports.deleteDutyShift = exports.updateDutyShift = exports.createDutyShift = exports.listDutyShifts = exports.listMunicipalBillsOverview = exports.getExecutiveDashboard = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const agencyOperationsService_1 = __importDefault(require("../services/agencyOperationsService"));
const dutyRosterService_1 = __importDefault(require("../services/dutyRosterService"));
const MunicipalPayment_1 = require("../models/MunicipalPayment");
const Property_1 = require("../models/Property");
const mongoose_1 = __importDefault(require("mongoose"));
const canAccessAgencyOperations = (req) => {
    var _a, _b;
    const roles = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.roles) || [(_b = req.user) === null || _b === void 0 ? void 0 : _b.role].filter(Boolean);
    return roles.some((r) => ['admin', 'principal', 'prea', 'agent', 'accountant'].includes(String(r)));
};
const getExecutiveDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    if (!canAccessAgencyOperations(req))
        throw new errorHandler_1.AppError('Access denied', 403);
    const { dateFrom, dateTo } = req.query;
    const data = yield agencyOperationsService_1.default.getExecutiveDashboard(req.user.companyId, dateFrom, dateTo);
    res.json({ success: true, data });
});
exports.getExecutiveDashboard = getExecutiveDashboard;
const listMunicipalBillsOverview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    if (!canAccessAgencyOperations(req))
        throw new errorHandler_1.AppError('Access denied', 403);
    const companyId = new mongoose_1.default.Types.ObjectId(req.user.companyId);
    const [properties, payments] = yield Promise.all([
        Property_1.Property.find({ companyId, levyOrMunicipalType: 'municipal' })
            .select('name address levyOrMunicipalAmount status')
            .lean(),
        MunicipalPayment_1.MunicipalPayment.find({ companyId }).sort({ paymentDate: -1 }).lean(),
    ]);
    const paidByProperty = new Map();
    for (const p of payments) {
        const pid = String(p.propertyId);
        const entry = paidByProperty.get(pid) || { amount: 0 };
        if (String(p.status).toLowerCase() === 'completed') {
            entry.amount += Number(p.amount || 0);
            const pd = new Date(p.paymentDate);
            if (!entry.lastPayment || pd > entry.lastPayment)
                entry.lastPayment = pd;
        }
        paidByProperty.set(pid, entry);
    }
    const now = new Date();
    const propertyRows = properties.map((prop) => {
        var _a;
        const pid = String(prop._id);
        const monthly = Number(prop.levyOrMunicipalAmount || 0);
        const paid = paidByProperty.get(pid);
        const paidAmount = (paid === null || paid === void 0 ? void 0 : paid.amount) || 0;
        const outstanding = Math.max(0, monthly - paidAmount);
        const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return {
            propertyId: pid,
            propertyName: prop.name,
            address: prop.address,
            currentBalance: monthly,
            outstandingBalance: outstanding,
            dueDate: dueDate.toISOString(),
            lastPayment: (_a = paid === null || paid === void 0 ? void 0 : paid.lastPayment) === null || _a === void 0 ? void 0 : _a.toISOString(),
            status: outstanding > 0 ? (dueDate < now ? 'overdue' : 'due') : 'current',
        };
    });
    const totalOutstanding = propertyRows.reduce((s, r) => s + r.outstandingBalance, 0);
    const inArrears = propertyRows.filter((r) => r.status === 'overdue').length;
    const dueThisMonth = propertyRows.filter((r) => r.status === 'due').length;
    res.json({
        success: true,
        data: {
            summary: { totalOutstanding, propertiesInArrears: inArrears, billsDueThisMonth: dueThisMonth, overdueAccounts: inArrears },
            properties: propertyRows,
            recentPayments: payments.slice(0, 50),
        },
    });
});
exports.listMunicipalBillsOverview = listMunicipalBillsOverview;
const listDutyShifts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    if (!canAccessAgencyOperations(req))
        throw new errorHandler_1.AppError('Access denied', 403);
    const data = yield dutyRosterService_1.default.listShifts(req.user.companyId, {
        from: req.query.from,
        to: req.query.to,
        agentId: req.query.agentId,
    });
    res.json({ success: true, data });
});
exports.listDutyShifts = listDutyShifts;
const createDutyShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    if (!canAccessAgencyOperations(req))
        throw new errorHandler_1.AppError('Access denied', 403);
    const data = yield dutyRosterService_1.default.createShift(req.user.companyId, Object.assign(Object.assign({}, req.body), { createdBy: req.user.userId }));
    res.status(201).json({ success: true, data });
});
exports.createDutyShift = createDutyShift;
const updateDutyShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    if (!canAccessAgencyOperations(req))
        throw new errorHandler_1.AppError('Access denied', 403);
    const data = yield dutyRosterService_1.default.updateShift(req.user.companyId, req.params.id, req.body);
    res.json({ success: true, data });
});
exports.updateDutyShift = updateDutyShift;
const deleteDutyShift = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    if (!canAccessAgencyOperations(req))
        throw new errorHandler_1.AppError('Access denied', 403);
    const data = yield dutyRosterService_1.default.deleteShift(req.user.companyId, req.params.id);
    res.json({ success: true, data });
});
exports.deleteDutyShift = deleteDutyShift;
const generateDutyRoster = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    if (!canAccessAgencyOperations(req))
        throw new errorHandler_1.AppError('Access denied', 403);
    const data = yield dutyRosterService_1.default.generateRoster(req.user.companyId, Object.assign(Object.assign({}, req.body), { createdBy: req.user.userId }));
    res.json({ success: true, data });
});
exports.generateDutyRoster = generateDutyRoster;
const listAgentAvailability = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    const data = yield dutyRosterService_1.default.listAvailability(req.user.companyId, req.query.agentId);
    res.json({ success: true, data });
});
exports.listAgentAvailability = listAgentAvailability;
const upsertAgentAvailability = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    const data = yield dutyRosterService_1.default.upsertAvailability(req.user.companyId, req.body);
    res.json({ success: true, data });
});
exports.upsertAgentAvailability = upsertAgentAvailability;
const listLeaveRequests = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    const data = yield dutyRosterService_1.default.listLeaveRequests(req.user.companyId, { status: req.query.status });
    res.json({ success: true, data });
});
exports.listLeaveRequests = listLeaveRequests;
const createLeaveRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    const data = yield dutyRosterService_1.default.createLeaveRequest(req.user.companyId, req.body);
    res.status(201).json({ success: true, data });
});
exports.createLeaveRequest = createLeaveRequest;
const reviewLeaveRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    const data = yield dutyRosterService_1.default.reviewLeaveRequest(req.user.companyId, req.params.id, req.body.status, req.user.userId);
    res.json({ success: true, data });
});
exports.reviewLeaveRequest = reviewLeaveRequest;
const listPublicHolidays = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    const data = yield dutyRosterService_1.default.listHolidays(req.user.companyId);
    res.json({ success: true, data });
});
exports.listPublicHolidays = listPublicHolidays;
const createPublicHoliday = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
        throw new errorHandler_1.AppError('Authentication with company required', 401);
    const data = yield dutyRosterService_1.default.createHoliday(req.user.companyId, req.body);
    res.status(201).json({ success: true, data });
});
exports.createPublicHoliday = createPublicHoliday;
const getDutyTypes = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.json({ success: true, data: dutyRosterService_1.default.getDutyTypes() });
});
exports.getDutyTypes = getDutyTypes;
