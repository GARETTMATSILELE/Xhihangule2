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
exports.MaintenanceContractor = exports.CONTRACTOR_TRADES = void 0;
exports.contractorDirectoryFilter = contractorDirectoryFilter;
const mongoose_1 = __importStar(require("mongoose"));
exports.CONTRACTOR_TRADES = [
    'Plumber',
    'Electrician',
    'Builder',
    'Painter',
    'Pool Technician',
    'Landscaper',
    'Carpenter',
    'General Contractor',
    'Other',
];
const MaintenanceContractorSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    trade: { type: String, enum: exports.CONTRACTOR_TRADES, required: true },
    address: { type: String },
    notes: { type: String },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    active: { type: Boolean, default: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    skills: [{ type: String, trim: true }],
    serviceAreas: [{ type: String, trim: true }],
    availability: { type: String, trim: true },
    description: { type: String },
    verificationStatus: {
        type: String,
        enum: ['UNVERIFIED', 'PENDING', 'VERIFIED', 'SUSPENDED'],
        default: 'UNVERIFIED',
        index: true
    },
}, { timestamps: true, collection: 'maintenance_contractors' });
MaintenanceContractorSchema.index({ companyId: 1, companyName: 1 });
MaintenanceContractorSchema.index({ companyId: 1, trade: 1 });
exports.MaintenanceContractor = mongoose_1.default.model('MaintenanceContractor', MaintenanceContractorSchema);
/** Agency-owned vendors plus every active self-registered contractor, so any agency can offer them work. */
function contractorDirectoryFilter(agencyCompanyId) {
    return {
        verificationStatus: { $ne: 'SUSPENDED' },
        $or: [
            ...(agencyCompanyId ? [{ companyId: agencyCompanyId }] : []),
            { userId: { $exists: true, $ne: null }, active: true },
        ],
    };
}
