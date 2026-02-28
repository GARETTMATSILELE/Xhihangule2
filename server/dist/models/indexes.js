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
const ChartOfAccount_1 = require("./ChartOfAccount");
const JournalEntry_1 = require("./JournalEntry");
const JournalLine_1 = require("./JournalLine");
const VatRecord_1 = require("./VatRecord");
const CompanyBalance_1 = require("./CompanyBalance");
const BankAccount_1 = require("./BankAccount");
const BankTransaction_1 = require("./BankTransaction");
const MaintenanceJob_1 = require("./MaintenanceJob");
const DashboardKpiSnapshot_1 = __importDefault(require("./DashboardKpiSnapshot"));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryableMongoConnectionError = (error) => {
    const labels = error === null || error === void 0 ? void 0 : error[Symbol.for('errorLabels')];
    const hasRetryLabel = (labels instanceof Set && (labels.has('ResetPool') || labels.has('RetryableWriteError'))) ||
        (Array.isArray(error === null || error === void 0 ? void 0 : error.errorLabels) &&
            error.errorLabels.some((l) => l === 'ResetPool' || l === 'RetryableWriteError'));
    const message = String((error === null || error === void 0 ? void 0 : error.message) || '').toLowerCase();
    const name = String((error === null || error === void 0 ? void 0 : error.name) || '').toLowerCase();
    return (hasRetryLabel ||
        name.includes('mongonetworkerror') ||
        (message.includes('connection') && message.includes('closed')) ||
        message.includes('timed out'));
};
const withTransientRetry = (operation_1, ...args_1) => __awaiter(void 0, [operation_1, ...args_1], void 0, function* (operation, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return yield operation();
        }
        catch (error) {
            lastError = error;
            if (attempt === retries || !isRetryableMongoConnectionError(error)) {
                throw error;
            }
            yield wait(400 * (attempt + 1));
        }
    }
    throw lastError;
});
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
// Ensure indexes for all core models at startup.
// This is critical in environments where autoIndex is disabled.
function createIndexes() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Ensure collections exist, create indexes, then log current index state.
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
                { model: File_1.default, name: 'File' },
                { model: ChartOfAccount_1.ChartOfAccount, name: 'ChartOfAccount' },
                { model: JournalEntry_1.JournalEntry, name: 'JournalEntry' },
                { model: JournalLine_1.JournalLine, name: 'JournalLine' },
                { model: VatRecord_1.VatRecord, name: 'VatRecord' },
                { model: CompanyBalance_1.CompanyBalance, name: 'CompanyBalance' },
                { model: BankAccount_1.BankAccount, name: 'BankAccount' },
                { model: BankTransaction_1.BankTransaction, name: 'BankTransaction' },
                { model: MaintenanceJob_1.MaintenanceJob, name: 'MaintenanceJob' },
                { model: DashboardKpiSnapshot_1.default, name: 'DashboardKpiSnapshot' }
            ];
            for (const { model, name } of models) {
                // Try to create the collection if it doesn't exist yet
                try {
                    yield withTransientRetry(() => model.createCollection());
                }
                catch (createErr) {
                    // Ignore "namespace exists" errors (code 48) and proceed
                    if (createErr && createErr.code !== 48) {
                        console.warn(`Could not ensure collection for ${name}:`, createErr);
                    }
                }
                // Create indexes declared in schemas (does not drop existing indexes).
                // Avoid throwing hard on duplicate-key/index-conflict issues so the app can still boot.
                try {
                    yield withTransientRetry(() => model.createIndexes());
                }
                catch (indexCreateErr) {
                    const code = Number(indexCreateErr === null || indexCreateErr === void 0 ? void 0 : indexCreateErr.code);
                    const message = String((indexCreateErr === null || indexCreateErr === void 0 ? void 0 : indexCreateErr.message) || '');
                    const isNonFatalIndexConflict = code === 85 || // IndexOptionsConflict
                        code === 86 || // IndexKeySpecsConflict
                        code === 11000 || // Duplicate key when creating unique index
                        message.toLowerCase().includes('duplicate key') ||
                        message.toLowerCase().includes('already exists');
                    if (isNonFatalIndexConflict) {
                        console.warn(`Non-fatal index creation issue for ${name}:`, message);
                    }
                    else {
                        console.error(`Error creating indexes for ${name}:`, indexCreateErr);
                    }
                }
                // Now attempt to read indexes, but ignore NamespaceNotFound (code 26)
                try {
                    const indexes = yield withTransientRetry(() => model.collection.indexes());
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
