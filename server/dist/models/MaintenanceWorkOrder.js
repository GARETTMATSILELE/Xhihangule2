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
exports.MaintenanceWorkOrder = exports.WORK_ORDER_STATUSES = void 0;
const mongoose_1 = __importStar(require("mongoose"));
exports.WORK_ORDER_STATUSES = ['Assigned', 'In Progress', 'Completed', 'Cancelled'];
const MaintenanceWorkOrderSchema = new mongoose_1.Schema({
    workOrderNumber: { type: String, required: true, unique: true, index: true },
    maintenanceRequestId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceRequest', required: true, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    contractorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'MaintenanceContractor', index: true },
    assignedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    assignedDate: { type: Date },
    targetCompletionDate: { type: Date },
    completionDate: { type: Date },
    status: { type: String, enum: exports.WORK_ORDER_STATUSES, default: 'Assigned', index: true },
    notes: { type: String },
}, { timestamps: true, collection: 'maintenance_work_orders' });
MaintenanceWorkOrderSchema.index({ companyId: 1, maintenanceRequestId: 1 }, { unique: true });
exports.MaintenanceWorkOrder = mongoose_1.default.model('MaintenanceWorkOrder', MaintenanceWorkOrderSchema);
