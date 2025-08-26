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
exports.optimizePaymentQueries = void 0;
exports.createIndexes = createIndexes;
const Payment_1 = require("./Payment");
const Property_1 = require("./Property");
const Lease_1 = require("./Lease");
const Tenant_1 = require("./Tenant");
const Company_1 = require("./Company");
const MaintenanceRequest_1 = require("./MaintenanceRequest");
const ChartData_1 = require("./ChartData");
const User_1 = require("./User");
const PropertyOwner_1 = require("./PropertyOwner");
const File_1 = __importDefault(require("./File"));
// Query Optimization Functions
exports.optimizePaymentQueries = {
    getPaymentsByDateRange: (startDate, endDate, companyId) => __awaiter(void 0, void 0, void 0, function* () {
        return Payment_1.Payment.find({
            paymentDate: { $gte: startDate, $lte: endDate },
            companyId
        })
            .lean()
            .select('amount paymentDate status paymentMethod')
            .sort({ paymentDate: -1 });
    }),
    getActiveLeases: (companyId) => __awaiter(void 0, void 0, void 0, function* () {
        return Lease_1.Lease.find({ companyId, status: 'active' })
            .lean()
            .select('propertyId tenantId startDate endDate rentAmount')
            .populate('propertyId', 'name address')
            .populate('tenantId', 'firstName lastName');
    }),
    getPropertyStatus: (companyId) => __awaiter(void 0, void 0, void 0, function* () {
        return Property_1.Property.find({ companyId })
            .lean()
            .select('name status type occupancyRate')
            .sort({ occupancyRate: -1 });
    })
};
// Index Creation Function - Now only logs existing indexes
function createIndexes() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Ensure collections exist, then log existing indexes for all models
            const models = [
                { model: User_1.User, name: 'User' },
                { model: Company_1.Company, name: 'Company' },
                { model: Property_1.Property, name: 'Property' },
                { model: Tenant_1.Tenant, name: 'Tenant' },
                { model: Lease_1.Lease, name: 'Lease' },
                { model: Payment_1.Payment, name: 'Payment' },
                { model: MaintenanceRequest_1.MaintenanceRequest, name: 'MaintenanceRequest' },
                { model: ChartData_1.ChartData, name: 'ChartData' },
                { model: PropertyOwner_1.PropertyOwner, name: 'PropertyOwner' },
                { model: File_1.default, name: 'File' }
            ];
            for (const { model, name } of models) {
                // Try to create the collection if it doesn't exist yet
                try {
                    yield model.createCollection();
                }
                catch (createErr) {
                    // Ignore "namespace exists" errors (code 48) and proceed
                    if (createErr && createErr.code !== 48) {
                        console.warn(`Could not ensure collection for ${name}:`, createErr);
                    }
                }
                // Now attempt to read indexes, but ignore NamespaceNotFound (code 26)
                try {
                    const indexes = yield model.collection.indexes();
                    console.log(`${name} indexes:`, indexes);
                }
                catch (error) {
                    if (error && error.code === 26) {
                        // Collection still does not exist; skip noisy error
                        console.log(`${name} collection not found yet; skipping index check`);
                    }
                    else {
                        console.error(`Error getting ${name} indexes:`, error);
                    }
                }
            }
            console.log('All indexes verified successfully');
        }
        catch (error) {
            console.error('Error verifying indexes:', error);
            throw error;
        }
    });
}
