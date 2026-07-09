"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DutyRosterShift = exports.DUTY_TYPES = void 0;
const mongoose_1 = __importStar(require("mongoose"));
exports.DUTY_TYPES = [
    'weekend_duty',
    'office_duty',
    'viewing_duty',
    'emergency_maintenance_duty',
    'owner_relations_duty',
    'on_call_duty',
];
const DutyRosterShiftSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    agentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dutyType: { type: String, enum: exports.DUTY_TYPES, required: true },
    shiftDate: { type: Date, required: true, index: true },
    startTime: { type: String },
    endTime: { type: String },
    coverageArea: { type: String },
    notes: { type: String },
    status: {
        type: String,
        enum: ['scheduled', 'published', 'completed', 'cancelled'],
        default: 'scheduled',
    },
    vehicleAvailable: { type: Boolean, default: false },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
DutyRosterShiftSchema.index({ companyId: 1, shiftDate: 1 });
DutyRosterShiftSchema.index({ companyId: 1, agentId: 1, shiftDate: 1 });
exports.DutyRosterShift = mongoose_1.default.model('DutyRosterShift', DutyRosterShiftSchema, 'duty_roster_shifts');
exports.default = exports.DutyRosterShift;
