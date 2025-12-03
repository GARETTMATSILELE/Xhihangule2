"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const SystemSettingSchema = new mongoose_1.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose_1.Schema.Types.Mixed },
    version: { type: Number },
    startedAt: { type: Date },
    completedAt: { type: Date },
    lastError: { type: String },
}, { timestamps: true });
SystemSettingSchema.index({ key: 1 }, { unique: true });
exports.default = database_1.mainConnection.model('SystemSetting', SystemSettingSchema, 'systemsettings');
