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
// Helper function to listen for indexes
const listenForIndexes = (collection, modelName) => {
    collection.indexes().then(indexes => {
        console.log(`${modelName} indexes:`, indexes);
    }).catch(error => {
        console.error(`Error getting ${modelName} indexes:`, error);
    });
};
// Listen for indexes for all models
listenForIndexes(Payment_1.Payment.collection, 'Payment');
listenForIndexes(Property_1.Property.collection, 'Property');
listenForIndexes(Lease_1.Lease.collection, 'Lease');
listenForIndexes(Tenant_1.Tenant.collection, 'Tenant');
listenForIndexes(Company_1.Company.collection, 'Company');
listenForIndexes(MaintenanceRequest_1.MaintenanceRequest.collection, 'MaintenanceRequest');
listenForIndexes(ChartData_1.ChartData.collection, 'ChartData');
listenForIndexes(User_1.User.collection, 'User');
listenForIndexes(PropertyOwner_1.PropertyOwner.collection, 'PropertyOwner');
listenForIndexes(File_1.default.collection, 'File');
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
            // Log existing indexes for all models
            const models = [
                { collection: User_1.User.collection, name: 'User' },
                { collection: Company_1.Company.collection, name: 'Company' },
                { collection: Property_1.Property.collection, name: 'Property' },
                { collection: Tenant_1.Tenant.collection, name: 'Tenant' },
                { collection: Lease_1.Lease.collection, name: 'Lease' },
                { collection: Payment_1.Payment.collection, name: 'Payment' },
                { collection: MaintenanceRequest_1.MaintenanceRequest.collection, name: 'MaintenanceRequest' },
                { collection: ChartData_1.ChartData.collection, name: 'ChartData' },
                { collection: PropertyOwner_1.PropertyOwner.collection, name: 'PropertyOwner' },
                { collection: File_1.default.collection, name: 'File' }
            ];
            for (const model of models) {
                const indexes = yield model.collection.indexes();
                console.log(`${model.name} indexes:`, indexes);
            }
            console.log('All indexes verified successfully');
        }
        catch (error) {
            console.error('Error verifying indexes:', error);
            throw error;
        }
    });
}
