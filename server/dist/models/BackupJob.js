"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const database_1 = require("../config/database");
const BackupJobSchema = new mongoose_1.Schema({
    provider: { type: String, enum: ['local', 's3'], required: true },
    key: { type: String },
    path: { type: String },
    status: { type: String, enum: ['pending', 'running', 'success', 'failed'], default: 'pending', index: true },
    sizeBytes: { type: Number },
    startedAt: { type: Date, default: Date.now, required: true },
    completedAt: { type: Date },
    error: { type: String }
}, { timestamps: true });
exports.default = database_1.mainConnection.model('BackupJob', BackupJobSchema, 'backupjobs');
