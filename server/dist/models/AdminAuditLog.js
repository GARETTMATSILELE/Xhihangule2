"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const AdminAuditLogSchema = new mongoose_1.Schema({
    actorId: { type: String, required: true, index: true },
    actorEmail: { type: String },
    action: { type: String, required: true, index: true },
    payload: { type: mongoose_1.Schema.Types.Mixed },
    result: { type: mongoose_1.Schema.Types.Mixed },
    success: { type: Boolean, default: false, index: true },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    durationMs: { type: Number },
    error: { type: String }
}, { timestamps: true });
exports.default = database_1.mainConnection.model('AdminAuditLog', AdminAuditLogSchema, 'adminauditlogs');
