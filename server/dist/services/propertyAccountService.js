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
exports.PropertyAccountService = void 0;
exports.migrateSalesLedgerForCompany = migrateSalesLedgerForCompany;
exports.reconcilePropertyLedgerDuplicates = reconcilePropertyLedgerDuplicates;
exports.ensureDevelopmentLedgersAndBackfillPayments = ensureDevelopmentLedgersAndBackfillPayments;
exports.initializePropertyAccountIndexes = initializePropertyAccountIndexes;
exports.runPropertyLedgerMaintenance = runPropertyLedgerMaintenance;
const mongoose_1 = __importDefault(require("mongoose"));
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const Payment_1 = require("../models/Payment");
const Property_1 = require("../models/Property");
const PropertyOwner_1 = require("../models/PropertyOwner");
const User_1 = require("../models/User");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const Development_1 = require("../models/Development");
const DevelopmentUnit_1 = require("../models/DevelopmentUnit");
const SystemSetting_1 = __importDefault(require("../models/SystemSetting"));
const uuid_1 = require("uuid");
const database_1 = require("../config/database");
const chargeTypeService_1 = __importDefault(require("./chargeTypeService"));
const propertyAccountSocket_1 = require("../events/propertyAccountSocket");
const paymentAccountingCompleteness_1 = require("./paymentAccountingCompleteness");
const accountingPostingPolicy_1 = require("./accountingPostingPolicy");
const transactionDomain_1 = require("./transactionDomain");
const propertyAccountDuplicateInventory_1 = require("./propertyAccountDuplicateInventory");
const propertyAccountTotals_1 = require("./propertyAccountTotals");
const ledgerMutationPolicy_1 = require("./ledgerMutationPolicy");
const testFailureSeam_1 = require("./testFailureSeam");
// Upgrade legacy indexes: allow separate ledgers per property
let ledgerIndexUpgradePromise = null;
const PASS_THROUGH_TYPE_LABELS = {
    LEVY: 'Levies',
    WATER: 'Water Recoveries',
    ELECTRICITY: 'Electricity Recoveries',
    RATES: 'Rates',
    SECURITY: 'Security',
    INSURANCE: 'Insurance Recoveries',
    MUNICIPAL: 'Municipal Charges',
    OTHER: 'Other Pass-Through Charges'
};
class PropertyAccountService {
    static getInstance() {
        if (!PropertyAccountService.instance) {
            PropertyAccountService.instance = new PropertyAccountService();
        }
        return PropertyAccountService.instance;
    }
    isDuplicateKeyError(error) {
        return ((error === null || error === void 0 ? void 0 : error.code) === 11000 ||
            /duplicate key/i.test(String((error === null || error === void 0 ? void 0 : error.message) || '')));
    }
    getFirstEnv(keys) {
        for (const key of keys) {
            const value = process.env[key];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
        return '';
    }
    getResolvedMongoUris() {
        const mainUri = this.getFirstEnv([
            'MONGODB_URI',
            'MONGODB_URI_PROPERTY',
            'CUSTOMCONNSTR_MONGODB_URI',
            'CUSTOMCONNSTR_MONGODB_URI_PROPERTY',
            'AZURE_COSMOS_CONNECTIONSTRING',
        ]);
        const accountingUri = this.getFirstEnv([
            'ACCOUNTING_DB_URI',
            'MONGODB_URI_ACCOUNTING',
            'CUSTOMCONNSTR_ACCOUNTING_DB_URI',
            'CUSTOMCONNSTR_MONGODB_URI_ACCOUNTING',
        ]);
        return { mainUri, accountingUri };
    }
    isCosmosMongoEndpoint() {
        var _a;
        const { mainUri, accountingUri } = this.getResolvedMongoUris();
        if (/cosmos\.azure\.com/i.test(`${mainUri} ${accountingUri}`)) {
            return true;
        }
        // Fallback to active runtime connections in case env URIs are masked or transformed by platform settings.
        try {
            const defaultHost = String(((_a = mongoose_1.default.connection) === null || _a === void 0 ? void 0 : _a.host) || '');
            const mainHost = String((database_1.mainConnection === null || database_1.mainConnection === void 0 ? void 0 : database_1.mainConnection.host) || '');
            const accountingHost = String((database_1.accountingConnection === null || database_1.accountingConnection === void 0 ? void 0 : database_1.accountingConnection.host) || '');
            return /cosmos\.azure\.com/i.test(`${defaultHost} ${mainHost} ${accountingHost}`);
        }
        catch (_b) {
            return false;
        }
    }
    isCosmosPartialFilterUnsupported(error) {
        const message = String((error === null || error === void 0 ? void 0 : error.message) || '').toLowerCase();
        return (message.includes('partialfilterexpression') ||
            message.includes('$and only supported in partialfilterexpression at top level'));
    }
    normalizeLedgerType(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return normalized === 'sale' ? 'sale' : 'rental';
    }
    resolveCompanyIdForEntity(entityId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const property = yield Property_1.Property.findById(entityId).select('companyId').lean();
                if (property === null || property === void 0 ? void 0 : property.companyId)
                    return String(property.companyId);
                const development = yield Development_1.Development.findById(entityId).select('companyId').lean();
                if (development === null || development === void 0 ? void 0 : development.companyId)
                    return String(development.companyId);
                const unit = yield DevelopmentUnit_1.DevelopmentUnit.findById(entityId).select('developmentId').lean();
                if (unit === null || unit === void 0 ? void 0 : unit.developmentId) {
                    const parent = yield Development_1.Development.findById(unit.developmentId).select('companyId').lean();
                    if (parent === null || parent === void 0 ? void 0 : parent.companyId)
                        return String(parent.companyId);
                }
            }
            catch (error) {
                logger_1.logger.warn('Failed to resolve companyId for property-account socket emit', { entityId, error });
            }
            return undefined;
        });
    }
    notifyAccountUpdated(opts) {
        void (() => __awaiter(this, void 0, void 0, function* () {
            try {
                let companyId = opts.companyId ? String(opts.companyId) : undefined;
                if (!companyId && opts.propertyId) {
                    companyId = yield this.resolveCompanyIdForEntity(opts.propertyId);
                }
                (0, propertyAccountSocket_1.emitPropertyAccountUpdated)({
                    companyId,
                    propertyId: opts.propertyId,
                    accountId: opts.accountId ? String(opts.accountId) : undefined,
                    paymentId: opts.paymentId,
                    eventType: opts.eventType
                });
            }
            catch (error) {
                logger_1.logger.warn('propertyAccount.updated notify failed (non-fatal)', error);
            }
        }))();
    }
    shouldRunOneTimeDuplicateCleanup() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const key = PropertyAccountService.ONE_TIME_DUPLICATE_CLEANUP_KEY;
                const existing = yield SystemSetting_1.default.findOne({ key }).lean();
                if (existing === null || existing === void 0 ? void 0 : existing.completedAt)
                    return false;
                if ((existing === null || existing === void 0 ? void 0 : existing.startedAt) && !(existing === null || existing === void 0 ? void 0 : existing.completedAt)) {
                    // Another instance likely started this already; skip to avoid duplicate heavy scans.
                    return false;
                }
                yield SystemSetting_1.default.updateOne({ key }, { $setOnInsert: { key, version: 1, startedAt: new Date() } }, { upsert: true });
                return true;
            }
            catch (e) {
                console.warn('Could not evaluate one-time duplicate cleanup state; proceeding defensively without heavy cleanup:', (e === null || e === void 0 ? void 0 : e.message) || e);
                return false;
            }
        });
    }
    markOneTimeDuplicateCleanupComplete(result) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const key = PropertyAccountService.ONE_TIME_DUPLICATE_CLEANUP_KEY;
                yield SystemSetting_1.default.updateOne({ key }, {
                    $set: {
                        completedAt: new Date(),
                        value: result,
                        lastError: undefined
                    },
                    $setOnInsert: { key, version: 1, startedAt: new Date() }
                }, { upsert: true });
            }
            catch (e) {
                console.warn('Could not mark one-time duplicate cleanup as complete:', (e === null || e === void 0 ? void 0 : e.message) || e);
            }
        });
    }
    markOneTimeDuplicateCleanupError(error) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const key = PropertyAccountService.ONE_TIME_DUPLICATE_CLEANUP_KEY;
                yield SystemSetting_1.default.updateOne({ key }, {
                    $set: {
                        lastError: String((error === null || error === void 0 ? void 0 : error.message) || error),
                        startedAt: new Date()
                    },
                    $setOnInsert: { key, version: 1 }
                }, { upsert: true });
            }
            catch (_a) { }
        });
    }
    normalizeActiveLedgerTypes() {
        return __awaiter(this, void 0, void 0, function* () {
            const accounts = yield PropertyAccount_1.default.find({
                isArchived: false,
                $or: [
                    { ledgerType: { $exists: false } },
                    { ledgerType: null },
                    { ledgerType: '' },
                    { ledgerType: { $nin: ['rental', 'sale'] } }
                ]
            }).select('_id propertyId ledgerType');
            let modified = 0;
            for (const account of accounts) {
                try {
                    const resolution = yield this.resolveLedgerTypeForProperty(String(account.propertyId), 'normalizeActiveLedgerTypes', String(account._id));
                    const result = yield PropertyAccount_1.default.updateOne({ _id: account._id, isArchived: false }, { $set: { ledgerType: resolution.ledgerType, lastUpdated: new Date() } });
                    modified += Number((result === null || result === void 0 ? void 0 : result.modifiedCount) || 0);
                }
                catch (error) {
                    logger_1.logger.warn('Skipping PropertyAccount ledgerType normalization because Property business type could not be resolved', {
                        propertyId: String(account.propertyId || ''),
                        propertyAccountId: String(account._id || ''),
                        currentLedgerType: String(account.ledgerType || ''),
                        error: (error === null || error === void 0 ? void 0 : error.message) || String(error)
                    });
                }
            }
            return modified;
        });
    }
    // Keep one active ledger per (propertyId, normalized ledgerType), archive the rest.
    archiveDuplicateActiveLedgers() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const normalized = yield this.normalizeActiveLedgerTypes();
                if (normalized > 0) {
                    console.log(`Normalized ${normalized} PropertyAccount ledgerType values to canonical values before duplicate cleanup.`);
                }
            }
            catch (normalizeErr) {
                console.warn('Could not normalize active ledgerType values before duplicate cleanup:', (normalizeErr === null || normalizeErr === void 0 ? void 0 : normalizeErr.message) || normalizeErr);
            }
            const active = yield PropertyAccount_1.default.find({ isArchived: false })
                .select('_id propertyId ledgerType lastUpdated createdAt')
                .sort({ lastUpdated: -1, createdAt: -1 });
            const seen = new Set();
            const archiveIds = [];
            for (const account of active) {
                const normalizedLedger = this.normalizeLedgerType(account.ledgerType);
                const key = `${String(account.propertyId)}|${normalizedLedger}`;
                if (seen.has(key)) {
                    archiveIds.push(account._id);
                }
                else {
                    seen.add(key);
                }
            }
            if (archiveIds.length === 0)
                return 0;
            const result = yield PropertyAccount_1.default.updateMany({ _id: { $in: archiveIds } }, { $set: { isArchived: true, lastUpdated: new Date() } });
            return Number((result === null || result === void 0 ? void 0 : result.modifiedCount) || 0);
        });
    }
    resolveLedgerTypeForProperty(propertyId_1) {
        return __awaiter(this, arguments, void 0, function* (propertyId, callingService = 'unknown', propertyAccountId) {
            const property = yield Property_1.Property.findById(propertyId).lean();
            if (property) {
                const rt = String((property === null || property === void 0 ? void 0 : property.rentalType) || '').toLowerCase();
                let ledgerType = null;
                if (rt === 'introduction' || rt === 'management')
                    ledgerType = 'rental';
                if (rt === 'sale')
                    ledgerType = 'sale';
                if (!ledgerType) {
                    throw new errorHandler_1.AppError('Unable to determine ledger type: Property.rentalType must be sale, management, or introduction', 400);
                }
                logger_1.logger.info('Resolved PropertyAccount ledger type from Property.rentalType', {
                    propertyId,
                    propertyBusinessType: rt,
                    resolvedLedgerType: ledgerType,
                    callingService,
                    propertyAccountId
                });
                return { ledgerType, businessType: rt };
            }
            // Backward compatibility for existing development/unit sale ledgers. This is
            // still resolved centrally here; callers must not assume the ledger type.
            const dev = yield Development_1.Development.findById(propertyId).select('_id').lean();
            if (dev) {
                logger_1.logger.warn('Resolved ledger type for Development through compatibility resolver', {
                    propertyId,
                    propertyBusinessType: 'development',
                    resolvedLedgerType: 'sale',
                    callingService,
                    propertyAccountId
                });
                return { ledgerType: 'sale', businessType: 'development' };
            }
            const unit = yield DevelopmentUnit_1.DevelopmentUnit.findById(propertyId).select('_id').lean();
            if (unit) {
                logger_1.logger.warn('Resolved ledger type for DevelopmentUnit through compatibility resolver', {
                    propertyId,
                    propertyBusinessType: 'development_unit',
                    resolvedLedgerType: 'sale',
                    callingService,
                    propertyAccountId
                });
                return { ledgerType: 'sale', businessType: 'development_unit' };
            }
            throw new errorHandler_1.AppError('Unable to determine ledger type: entity not found', 404);
        });
    }
    activeAccountCandidatesQuery(propertyId, ledgerType) {
        return {
            propertyId,
            ledgerType,
            isArchived: false,
            isActive: { $ne: false }
        };
    }
    activeAccountQuery(propertyId, ledgerType) {
        return {
            propertyId,
            ledgerType,
            isArchived: false,
            isActive: { $ne: false }
        };
    }
    validateWritableAccount(account, propertyId, callingFunction) {
        if (!account) {
            throw new errorHandler_1.AppError(`PropertyAccount not found for writable operation (${callingFunction})`, 404);
        }
        if (account.isArchived === true) {
            throw new errorHandler_1.AppError(`Refusing to write to archived PropertyAccount ${String(account._id)} in ${callingFunction}`, 409);
        }
        if (account.isActive === false) {
            throw new errorHandler_1.AppError(`Refusing to write to inactive PropertyAccount ${String(account._id)} in ${callingFunction}`, 409);
        }
        if (String(account.propertyId) !== String(propertyId)) {
            throw new errorHandler_1.AppError(`PropertyAccount ${String(account._id)} does not belong to requested property ${propertyId}`, 409);
        }
        this.logWritableAccountSelection(account, callingFunction);
        return account;
    }
    logWritableAccountSelection(account, callingFunction) {
        logger_1.logger.info('Selected PropertyAccount for write', {
            propertyId: String(account.propertyId),
            propertyAccountId: String(account._id),
            isArchived: Boolean(account.isArchived),
            ledgerType: String(account.ledgerType || 'legacy'),
            callingFunction
        });
    }
    normalizePassThroughType(type) {
        const normalized = String(type || 'OTHER')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_]+/g, '_')
            .replace(/^_+|_+$/g, '');
        return normalized || 'OTHER';
    }
    getPassThroughLabel(type) {
        const normalized = this.normalizePassThroughType(type);
        return PASS_THROUGH_TYPE_LABELS[normalized] || normalized
            .toLowerCase()
            .split('_')
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }
    recalculatePassThroughAccounts(accounts = []) {
        let collected = 0;
        let paid = 0;
        const normalizedAccounts = accounts.map((account) => {
            const plain = (account === null || account === void 0 ? void 0 : account.toObject) ? account.toObject() : account;
            const type = this.normalizePassThroughType(plain === null || plain === void 0 ? void 0 : plain.type);
            const transactions = Array.isArray(plain === null || plain === void 0 ? void 0 : plain.transactions) ? plain.transactions : [];
            const totalCollected = transactions
                .filter((tx) => (tx === null || tx === void 0 ? void 0 : tx.type) === 'collection' && (tx === null || tx === void 0 ? void 0 : tx.status) === 'completed')
                .reduce((sum, tx) => sum + Number((tx === null || tx === void 0 ? void 0 : tx.amount) || 0), 0);
            const totalPaid = transactions
                .filter((tx) => (tx === null || tx === void 0 ? void 0 : tx.type) === 'payment' && (tx === null || tx === void 0 ? void 0 : tx.status) === 'completed')
                .reduce((sum, tx) => sum + Number((tx === null || tx === void 0 ? void 0 : tx.amount) || 0), 0);
            collected += totalCollected;
            paid += totalPaid;
            return Object.assign(Object.assign({}, plain), { type, label: (plain === null || plain === void 0 ? void 0 : plain.label) || this.getPassThroughLabel(type), totalCollected: Number(totalCollected.toFixed(2)), totalPaid: Number(totalPaid.toFixed(2)), runningBalance: Number((totalCollected - totalPaid).toFixed(2)), transactions, lastUpdated: new Date() });
        });
        return {
            accounts: normalizedAccounts,
            collected: Number(collected.toFixed(2)),
            paid: Number(paid.toFixed(2)),
            outstanding: Number((collected - paid).toFixed(2))
        };
    }
    upsertPassThroughTransaction(accounts, chargeType, transaction, duplicatePredicate) {
        const type = this.normalizePassThroughType(chargeType);
        const nextAccounts = (Array.isArray(accounts) ? accounts : []).map((account) => {
            const plain = (account === null || account === void 0 ? void 0 : account.toObject) ? account.toObject() : account;
            return Object.assign(Object.assign({}, plain), { type: this.normalizePassThroughType(plain === null || plain === void 0 ? void 0 : plain.type), transactions: Array.isArray(plain === null || plain === void 0 ? void 0 : plain.transactions) ? [...plain.transactions] : [] });
        });
        let target = nextAccounts.find((account) => this.normalizePassThroughType(account === null || account === void 0 ? void 0 : account.type) === type);
        if (!target) {
            target = {
                type,
                label: this.getPassThroughLabel(type),
                runningBalance: 0,
                totalCollected: 0,
                totalPaid: 0,
                transactions: [],
                lastUpdated: new Date()
            };
            nextAccounts.push(target);
        }
        const exists = (target.transactions || []).some(duplicatePredicate);
        if (exists) {
            return { accounts: nextAccounts, inserted: false };
        }
        target.transactions.push(transaction);
        return { accounts: nextAccounts, inserted: true };
    }
    reloadWritableAccount(accountId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const fresh = yield PropertyAccount_1.default.findOne({
                _id: accountId,
                isArchived: false,
                isActive: { $ne: false }
            });
            if (!fresh) {
                return this.validateWritableAccount(yield this.getOrCreatePropertyAccount(propertyId), propertyId, 'reloadWritableAccount');
            }
            return this.validateWritableAccount(fresh, propertyId, 'reloadWritableAccount');
        });
    }
    /**
     * Append a pass-through row without replacing the sibling buckets/transactions.
     */
    pushPassThroughTransactionAtomic(opts) {
        return __awaiter(this, void 0, void 0, function* () {
            const { account, propertyId, chargeType, transaction, idKey } = opts;
            const type = this.normalizePassThroughType(chargeType);
            const amountIncCollected = Number(opts.incrementCollected || 0);
            const amountIncPaid = Number(opts.incrementPaid || 0);
            const already = yield PropertyAccount_1.default.findOne({
                _id: account._id,
                'passThroughAccounts.transactions.idempotencyKey': idKey
            }).select('_id').lean();
            if (already)
                return 'duplicate';
            const intoBucket = yield PropertyAccount_1.default.updateOne({
                _id: account._id,
                propertyId: account.propertyId,
                isArchived: false,
                isActive: { $ne: false },
                passThroughAccounts: {
                    $elemMatch: {
                        type,
                        'transactions.idempotencyKey': { $ne: idKey }
                    }
                }
            }, {
                $push: { 'passThroughAccounts.$.transactions': transaction },
                $inc: {
                    passThroughCollected: amountIncCollected,
                    passThroughPaid: amountIncPaid,
                    ledgerRevision: 1
                },
                $set: { lastUpdated: new Date() }
            });
            if (Number(intoBucket.modifiedCount || 0) > 0) {
                const fresh = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false });
                if (fresh)
                    yield this.recalculateBalance(fresh);
                return 'inserted';
            }
            const created = yield PropertyAccount_1.default.updateOne({
                _id: account._id,
                propertyId: account.propertyId,
                isArchived: false,
                isActive: { $ne: false },
                'passThroughAccounts.type': { $ne: type },
                'passThroughAccounts.transactions.idempotencyKey': { $ne: idKey }
            }, {
                $push: {
                    passThroughAccounts: {
                        type,
                        label: this.getPassThroughLabel(type),
                        runningBalance: amountIncCollected - amountIncPaid,
                        totalCollected: amountIncCollected,
                        totalPaid: amountIncPaid,
                        transactions: [transaction],
                        lastUpdated: new Date()
                    }
                },
                $inc: {
                    passThroughCollected: amountIncCollected,
                    passThroughPaid: amountIncPaid,
                    ledgerRevision: 1
                },
                $set: { lastUpdated: new Date() }
            });
            if (Number(created.modifiedCount || 0) > 0) {
                const fresh = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false });
                if (fresh)
                    yield this.recalculateBalance(fresh);
                return 'inserted';
            }
            const raced = yield PropertyAccount_1.default.findOne({
                _id: account._id,
                'passThroughAccounts.transactions.idempotencyKey': idKey
            }).select('_id').lean();
            if (raced)
                return 'duplicate';
            const retry = yield PropertyAccount_1.default.updateOne({
                _id: account._id,
                propertyId: account.propertyId,
                isArchived: false,
                isActive: { $ne: false },
                passThroughAccounts: {
                    $elemMatch: {
                        type,
                        'transactions.idempotencyKey': { $ne: idKey }
                    }
                }
            }, {
                $push: { 'passThroughAccounts.$.transactions': transaction },
                $inc: {
                    passThroughCollected: amountIncCollected,
                    passThroughPaid: amountIncPaid,
                    ledgerRevision: 1
                },
                $set: { lastUpdated: new Date() }
            });
            if (Number(retry.modifiedCount || 0) > 0) {
                const fresh = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false });
                if (fresh)
                    yield this.recalculateBalance(fresh);
                return 'inserted';
            }
            logger_1.logger.warn('Pass-through atomic push matched no document', { propertyId, type, idKey });
            return 'duplicate';
        });
    }
    calculatePassThroughSummary(account) {
        const summary = this.recalculatePassThroughAccounts((account === null || account === void 0 ? void 0 : account.passThroughAccounts) || []);
        const byType = {};
        for (const passThroughAccount of summary.accounts) {
            const type = this.normalizePassThroughType(passThroughAccount.type);
            byType[type] = {
                label: passThroughAccount.label || this.getPassThroughLabel(type),
                collected: Number(passThroughAccount.totalCollected || 0),
                paid: Number(passThroughAccount.totalPaid || 0),
                outstanding: Number(passThroughAccount.runningBalance || 0)
            };
        }
        return Object.assign(Object.assign({}, summary), { byType });
    }
    recordPassThroughCollection(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const amount = Number(input.amount || 0);
            if (amount <= 0) {
                throw new errorHandler_1.AppError('Pass-through collection amount must be greater than 0', 400);
            }
            const chargeType = this.normalizePassThroughType(input.chargeType);
            const chargeTypeConfig = yield chargeTypeService_1.default.getChargeTypeByCode(chargeType, input.companyId, { throwIfMissing: true });
            if ((chargeTypeConfig === null || chargeTypeConfig === void 0 ? void 0 : chargeTypeConfig.category) !== 'PASS_THROUGH') {
                throw new errorHandler_1.AppError(`Charge type ${chargeType} is not configured as pass-through`, 400);
            }
            const idKey = input.idempotencyKey || `pass-through:${chargeType}:collection:${input.paymentId || (0, uuid_1.v4)()}`;
            const account = this.validateWritableAccount(yield this.getOrCreatePropertyAccount(input.propertyId), input.propertyId, 'recordPassThroughCollection');
            const transaction = {
                type: 'collection',
                amount,
                date: input.date || new Date(),
                paymentId: input.paymentId ? new mongoose_1.default.Types.ObjectId(input.paymentId) : undefined,
                levyPaymentId: input.levyPaymentId ? new mongoose_1.default.Types.ObjectId(input.levyPaymentId) : undefined,
                chargeTypeCode: chargeTypeConfig === null || chargeTypeConfig === void 0 ? void 0 : chargeTypeConfig.code,
                chargeTypeId: chargeTypeConfig === null || chargeTypeConfig === void 0 ? void 0 : chargeTypeConfig._id,
                idempotencyKey: idKey,
                description: input.description || `${(chargeTypeConfig === null || chargeTypeConfig === void 0 ? void 0 : chargeTypeConfig.name) || this.getPassThroughLabel(chargeType)} collected`,
                referenceNumber: input.referenceNumber,
                status: 'completed',
                processedBy: input.processedBy ? new mongoose_1.default.Types.ObjectId(input.processedBy) : undefined,
                notes: input.notes,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const pushed = yield this.pushPassThroughTransactionAtomic({
                account,
                propertyId: input.propertyId,
                chargeType,
                transaction,
                idKey,
                incrementCollected: amount
            });
            if (pushed === 'duplicate') {
                return account;
            }
            this.notifyAccountUpdated({
                companyId: input.companyId,
                propertyId: input.propertyId,
                accountId: account._id,
                paymentId: input.paymentId,
                eventType: 'pass_through_updated'
            });
            return this.reloadWritableAccount(account._id, input.propertyId);
        });
    }
    recordPassThroughPayment(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const amount = Number(input.amount || 0);
            if (amount <= 0) {
                throw new errorHandler_1.AppError('Pass-through payment amount must be greater than 0', 400);
            }
            const chargeType = this.normalizePassThroughType(input.chargeType);
            const chargeTypeConfig = yield chargeTypeService_1.default.getChargeTypeByCode(chargeType, input.companyId, { throwIfMissing: true });
            if ((chargeTypeConfig === null || chargeTypeConfig === void 0 ? void 0 : chargeTypeConfig.category) !== 'PASS_THROUGH') {
                throw new errorHandler_1.AppError(`Charge type ${chargeType} is not configured as pass-through`, 400);
            }
            const idKey = input.idempotencyKey || `pass-through:${chargeType}:payment:${input.levyPaymentId || input.paymentId || (0, uuid_1.v4)()}`;
            const account = this.validateWritableAccount(yield this.getOrCreatePropertyAccount(input.propertyId, input.ledgerType), input.propertyId, 'recordPassThroughPayment');
            const transaction = {
                type: 'payment',
                amount,
                date: input.date || new Date(),
                paymentId: input.paymentId ? new mongoose_1.default.Types.ObjectId(input.paymentId) : undefined,
                levyPaymentId: input.levyPaymentId ? new mongoose_1.default.Types.ObjectId(input.levyPaymentId) : undefined,
                chargeTypeCode: chargeTypeConfig === null || chargeTypeConfig === void 0 ? void 0 : chargeTypeConfig.code,
                chargeTypeId: chargeTypeConfig === null || chargeTypeConfig === void 0 ? void 0 : chargeTypeConfig._id,
                idempotencyKey: idKey,
                description: input.description || `${(chargeTypeConfig === null || chargeTypeConfig === void 0 ? void 0 : chargeTypeConfig.name) || this.getPassThroughLabel(chargeType)} paid`,
                referenceNumber: input.referenceNumber,
                status: 'completed',
                processedBy: input.processedBy ? new mongoose_1.default.Types.ObjectId(input.processedBy) : undefined,
                notes: input.notes,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const pushed = yield this.pushPassThroughTransactionAtomic({
                account,
                propertyId: input.propertyId,
                chargeType,
                transaction,
                idKey,
                incrementPaid: amount
            });
            if (pushed === 'duplicate') {
                return account;
            }
            this.notifyAccountUpdated({
                companyId: input.companyId,
                propertyId: input.propertyId,
                accountId: account._id,
                paymentId: input.paymentId,
                eventType: 'pass_through_updated'
            });
            return this.reloadWritableAccount(account._id, input.propertyId);
        });
    }
    getCompanyPassThroughSummary(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [properties, developments] = yield Promise.all([
                Property_1.Property.find({ companyId }).select('_id').lean(),
                Development_1.Development.find({ companyId }).select('_id').lean()
            ]);
            const propertyIds = properties.map((property) => property._id);
            const developmentIds = developments.map((development) => development._id);
            let unitIds = [];
            if (developmentIds.length > 0) {
                try {
                    const units = yield DevelopmentUnit_1.DevelopmentUnit.find({ developmentId: { $in: developmentIds } }).select('_id').lean();
                    unitIds = units.map((unit) => unit._id);
                }
                catch (_a) { }
            }
            const allIds = [...propertyIds, ...developmentIds, ...unitIds];
            if (allIds.length === 0) {
                return { totalCollected: 0, totalPaid: 0, totalOutstanding: 0, byType: {} };
            }
            const accounts = yield PropertyAccount_1.default.find({
                propertyId: { $in: allIds },
                isArchived: false,
                isActive: { $ne: false }
            })
                .select('passThroughAccounts passThroughCollected passThroughPaid passThroughOutstanding')
                .lean();
            const byType = {};
            let totalCollected = 0;
            let totalPaid = 0;
            for (const account of accounts) {
                const summary = this.calculatePassThroughSummary(account);
                totalCollected += summary.collected;
                totalPaid += summary.paid;
                for (const [type, row] of Object.entries(summary.byType)) {
                    byType[type] = byType[type] || { label: row.label, collected: 0, paid: 0, outstanding: 0 };
                    byType[type].collected = Number((byType[type].collected + row.collected).toFixed(2));
                    byType[type].paid = Number((byType[type].paid + row.paid).toFixed(2));
                    byType[type].outstanding = Number((byType[type].outstanding + row.outstanding).toFixed(2));
                }
            }
            return {
                totalCollected: Number(totalCollected.toFixed(2)),
                totalPaid: Number(totalPaid.toFixed(2)),
                totalOutstanding: Number((totalCollected - totalPaid).toFixed(2)),
                byType
            };
        });
    }
    /**
     * Get or create property account
     */
    getOrCreatePropertyAccount(propertyId, ledgerOverride) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            try {
                const effectiveLedger = ledgerOverride !== null && ledgerOverride !== void 0 ? ledgerOverride : (yield this.resolveLedgerTypeForProperty(propertyId, 'getOrCreatePropertyAccount')).ledgerType;
                const propertyObjectId = new mongoose_1.default.Types.ObjectId(propertyId);
                const activeAccounts = yield PropertyAccount_1.default.find(this.activeAccountCandidatesQuery(propertyObjectId, effectiveLedger));
                if (activeAccounts.length > 1) {
                    throw new errorHandler_1.AppError(`Multiple active PropertyAccounts found for property ${propertyId} (${effectiveLedger}); refusing to choose a writable ledger`, 409);
                }
                let account = activeAccounts[0];
                if (account) {
                    return this.validateWritableAccount(account, propertyId, 'getOrCreatePropertyAccount');
                }
                if (!account) {
                    // Try resolve as a Property; if not found, try as a Development; then as a Development Unit
                    const property = yield Property_1.Property.findById(propertyId);
                    const development = property ? null : yield Development_1.Development.findById(propertyId);
                    const unit = (property || development) ? null : yield DevelopmentUnit_1.DevelopmentUnit.findById(propertyId);
                    if (!property && !development && !unit) {
                        throw new errorHandler_1.AppError('Property not found', 404);
                    }
                    // Get owner details
                    let ownerName = 'Unknown Owner';
                    let ownerId = null;
                    if (property) {
                        // Resolve owner via PropertyOwner linkage
                        if (property.ownerId) {
                            const owner = yield PropertyOwner_1.PropertyOwner.findById(property.ownerId);
                            if (owner) {
                                ownerName = `${owner.firstName} ${owner.lastName}`.trim();
                                ownerId = owner._id;
                            }
                        }
                        if (!ownerId) {
                            const owner = yield PropertyOwner_1.PropertyOwner.findOne({
                                properties: { $in: [new mongoose_1.default.Types.ObjectId(propertyId)] }
                            });
                            if (owner) {
                                ownerName = `${owner.firstName} ${owner.lastName}`.trim();
                                ownerId = owner._id;
                            }
                        }
                    }
                    else if (development) {
                        // Resolve owner from Development.owner first/last name
                        const first = ((_a = development.owner) === null || _a === void 0 ? void 0 : _a.firstName) || '';
                        const last = ((_b = development.owner) === null || _b === void 0 ? void 0 : _b.lastName) || '';
                        const companyName = ((_c = development.owner) === null || _c === void 0 ? void 0 : _c.companyName) || '';
                        const combined = `${first} ${last}`.trim();
                        ownerName = combined || companyName || 'Unknown Owner';
                    }
                    else if (unit) {
                        // Unit-level: pull owner info from parent development
                        try {
                            const devParent = yield Development_1.Development.findById(unit.developmentId);
                            const first = ((_d = devParent === null || devParent === void 0 ? void 0 : devParent.owner) === null || _d === void 0 ? void 0 : _d.firstName) || '';
                            const last = ((_e = devParent === null || devParent === void 0 ? void 0 : devParent.owner) === null || _e === void 0 ? void 0 : _e.lastName) || '';
                            const companyName = ((_f = devParent === null || devParent === void 0 ? void 0 : devParent.owner) === null || _f === void 0 ? void 0 : _f.companyName) || '';
                            const combined = `${first} ${last}`.trim();
                            ownerName = combined || companyName || 'Unknown Owner';
                        }
                        catch (_g) { }
                    }
                    // Compute display name/address before create
                    let displayName = '';
                    let displayAddress = '';
                    if (property) {
                        displayName = property.name || '';
                        displayAddress = property.address || '';
                    }
                    else if (development) {
                        displayName = (development === null || development === void 0 ? void 0 : development.name) || '';
                        displayAddress = (development === null || development === void 0 ? void 0 : development.address) || '';
                    }
                    else if (unit) {
                        let devLabel = '';
                        try {
                            const devParent = yield Development_1.Development.findById(unit.developmentId);
                            devLabel = (devParent === null || devParent === void 0 ? void 0 : devParent.name) || '';
                            displayAddress = (devParent === null || devParent === void 0 ? void 0 : devParent.address) || '';
                        }
                        catch (_h) { }
                        const unitLabel = (unit === null || unit === void 0 ? void 0 : unit.unitCode) || ((unit === null || unit === void 0 ? void 0 : unit.unitNumber) ? `Unit ${unit.unitNumber}` : 'Development Unit');
                        displayName = devLabel ? `${unitLabel} - ${devLabel}` : unitLabel;
                    }
                    // Create new account
                    account = new PropertyAccount_1.default({
                        propertyId: propertyObjectId,
                        ledgerType: effectiveLedger,
                        propertyName: displayName,
                        propertyAddress: displayAddress,
                        ownerId: ownerId,
                        ownerName,
                        transactions: [],
                        ownerPayouts: [],
                        runningBalance: 0,
                        totalIncome: 0,
                        totalExpenses: 0,
                        totalOwnerPayouts: 0,
                        isActive: true,
                        isArchived: false
                    });
                    try {
                        yield account.save();
                    }
                    catch (saveErr) {
                        const isDup = this.isDuplicateKeyError(saveErr);
                        if (isDup) {
                            const reloaded = yield PropertyAccount_1.default.find(this.activeAccountCandidatesQuery(propertyObjectId, effectiveLedger));
                            if (reloaded.length === 1) {
                                account = reloaded[0];
                            }
                            else if (reloaded.length > 1) {
                                throw new errorHandler_1.AppError(`Multiple active PropertyAccounts found for property ${propertyId} after concurrent create; refusing to choose a writable ledger`, 409);
                            }
                            else {
                                throw saveErr;
                            }
                        }
                        else {
                            throw saveErr;
                        }
                    }
                    logger_1.logger.info(`Created new property account for property: ${propertyId}`);
                }
                return this.validateWritableAccount(account, propertyId, 'getOrCreatePropertyAccount');
            }
            catch (error) {
                logger_1.logger.error('Error in getOrCreatePropertyAccount:', error);
                throw error;
            }
        });
    }
    // One-time index upgrade to support { propertyId, ledgerType } uniqueness.
    // Phase 5B: never create/drop indexes or mutate documents unless explicitly enabled.
    ensureLedgerIndexes() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(0, ledgerMutationPolicy_1.isIndexCreationAllowed)()) {
                return;
            }
            if (!ledgerIndexUpgradePromise) {
                ledgerIndexUpgradePromise = (() => __awaiter(this, void 0, void 0, function* () {
                    try {
                        const cosmosMongo = this.isCosmosMongoEndpoint();
                        const runOneTimeDuplicateCleanup = yield this.shouldRunOneTimeDuplicateCleanup();
                        // Cosmos Mongo partial indexes do not support `$ne` in filter expressions.
                        // Normalize legacy docs so active records are explicitly `isArchived: false`.
                        try {
                            yield PropertyAccount_1.default.collection.updateMany({
                                $or: [
                                    { isArchived: { $exists: false } },
                                    { isArchived: null }
                                ]
                            }, { $set: { isArchived: false } });
                        }
                        catch (normalizeErr) {
                            console.warn('Could not normalize isArchived defaults before index migration:', (normalizeErr === null || normalizeErr === void 0 ? void 0 : normalizeErr.message) || normalizeErr);
                        }
                        const indexes = yield PropertyAccount_1.default.collection.indexes();
                        const legacyUniqueByProperty = indexes.find((idx) => idx.name === 'propertyId_1' && idx.unique === true);
                        if (legacyUniqueByProperty) {
                            try {
                                yield PropertyAccount_1.default.collection.dropIndex('propertyId_1');
                                console.log('Dropped legacy unique index propertyId_1 on PropertyAccount.');
                            }
                            catch (dropErr) {
                                console.warn('Could not drop legacy index propertyId_1:', (dropErr === null || dropErr === void 0 ? void 0 : dropErr.message) || dropErr);
                            }
                        }
                        // Drop legacy ownerPayout unique index that doesn't include ledgerType and may not be sparse
                        const legacyOwnerPayout = indexes.find((idx) => idx.name === 'propertyId_1_ownerPayouts.referenceNumber_1');
                        if (legacyOwnerPayout) {
                            try {
                                yield PropertyAccount_1.default.collection.dropIndex('propertyId_1_ownerPayouts.referenceNumber_1');
                                console.log('Dropped legacy index propertyId_1_ownerPayouts.referenceNumber_1 on PropertyAccount.');
                            }
                            catch (dropErr) {
                                console.warn('Could not drop legacy ownerPayout index:', (dropErr === null || dropErr === void 0 ? void 0 : dropErr.message) || dropErr);
                            }
                        }
                        // Run heavy duplicate cleanup only once (persisted via SystemSetting) to avoid load on every restart.
                        if (runOneTimeDuplicateCleanup) {
                            console.warn('Skipping PropertyAccount duplicate archival during index migration. ' +
                                'Archive-without-merge hides owner income. Reconcile duplicates explicitly first.');
                        }
                        else {
                            console.log('Skipping heavy duplicate cleanup (already completed or in progress).');
                        }
                        // Ensure unique compound index exists and is partial on non-archived docs
                        const compound = indexes.find((idx) => idx.name === 'propertyId_1_ledgerType_1');
                        const compoundIsGood = compound &&
                            compound.unique === true &&
                            compound.partialFilterExpression &&
                            compound.partialFilterExpression.isArchived === false;
                        if (!compoundIsGood) {
                            try {
                                if (compound) {
                                    yield PropertyAccount_1.default.collection.dropIndex('propertyId_1_ledgerType_1');
                                    console.log('Dropped existing compound index propertyId_1_ledgerType_1 to recreate as partial unique.');
                                }
                            }
                            catch (dropErr) {
                                console.warn('Could not drop compound index:', (dropErr === null || dropErr === void 0 ? void 0 : dropErr.message) || dropErr);
                            }
                            let createdCompound = false;
                            let lastCompoundError = null;
                            for (let attempt = 1; attempt <= 3; attempt++) {
                                try {
                                    yield PropertyAccount_1.default.collection.createIndex({ propertyId: 1, ledgerType: 1 }, { unique: true, partialFilterExpression: { isArchived: false } });
                                    console.log(`Created partial unique compound index propertyId_1_ledgerType_1 on attempt ${attempt}.`);
                                    createdCompound = true;
                                    break;
                                }
                                catch (createErr) {
                                    lastCompoundError = createErr;
                                    if (this.isDuplicateKeyError(createErr)) {
                                        console.warn('Partial unique index was not created because duplicate PropertyAccounts exist. ' +
                                            'Duplicates must be reconciled without archiving history before the index can be enabled. ' +
                                            'ALLOW_ACCOUNTING_INDEX_MIGRATION must stay unset in production until that reconciliation is proven.');
                                        break;
                                    }
                                    else {
                                        break;
                                    }
                                }
                            }
                            if (!createdCompound) {
                                console.warn('Could not create partial compound index after cleanup retries:', (lastCompoundError === null || lastCompoundError === void 0 ? void 0 : lastCompoundError.message) || lastCompoundError);
                            }
                        }
                        // Ensure owner payouts unique index includes ledgerType and uses partial filter (no sparse)
                        const opIdx = indexes.find((idx) => idx.name === 'propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1');
                        const opGood = opIdx &&
                            opIdx.unique === true &&
                            ((cosmosMongo && opIdx.sparse === true) ||
                                (!cosmosMongo &&
                                    opIdx.partialFilterExpression &&
                                    opIdx.partialFilterExpression.isArchived === false &&
                                    opIdx.partialFilterExpression['ownerPayouts.referenceNumber']));
                        if (!opGood) {
                            try {
                                if (opIdx)
                                    yield PropertyAccount_1.default.collection.dropIndex('propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1');
                            }
                            catch (_a) { }
                            try {
                                const options = cosmosMongo
                                    // Cosmos Mongo has limitations on nested partial expressions.
                                    ? { unique: true, sparse: true }
                                    : { unique: true, partialFilterExpression: { isArchived: false, 'ownerPayouts.referenceNumber': { $exists: true, $type: 'string' } } };
                                yield PropertyAccount_1.default.collection.createIndex({ propertyId: 1, ledgerType: 1, 'ownerPayouts.referenceNumber': 1 }, options);
                                console.log('Created partial unique owner payout index propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1.');
                            }
                            catch (createErr) {
                                if (!cosmosMongo && this.isCosmosPartialFilterUnsupported(createErr)) {
                                    try {
                                        yield PropertyAccount_1.default.collection.createIndex({ propertyId: 1, ledgerType: 1, 'ownerPayouts.referenceNumber': 1 }, { unique: true, sparse: true });
                                        console.log('Created sparse unique owner payout index propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1 after partial filter rejection.');
                                    }
                                    catch (retryErr) {
                                        console.warn('Could not create owner payout compound index (including sparse fallback):', (retryErr === null || retryErr === void 0 ? void 0 : retryErr.message) || retryErr);
                                    }
                                }
                                else {
                                    console.warn('Could not create owner payout compound index:', (createErr === null || createErr === void 0 ? void 0 : createErr.message) || createErr);
                                }
                            }
                        }
                        // Ensure transactions.paymentId uniqueness is scoped per property ledger
                        const legacyTxIndex = indexes.find((idx) => idx.name === 'transactions.paymentId_1');
                        if (legacyTxIndex) {
                            try {
                                yield PropertyAccount_1.default.collection.dropIndex('transactions.paymentId_1');
                                console.log('Dropped legacy index transactions.paymentId_1 on PropertyAccount.');
                            }
                            catch (dropErr) {
                                console.warn('Could not drop legacy transactions.paymentId index:', (dropErr === null || dropErr === void 0 ? void 0 : dropErr.message) || dropErr);
                            }
                        }
                        const txIdx = indexes.find((idx) => idx.name === 'propertyId_1_ledgerType_1_transactions.paymentId_1');
                        const txGood = txIdx &&
                            txIdx.unique === true &&
                            ((cosmosMongo && txIdx.sparse === true) ||
                                (!cosmosMongo &&
                                    txIdx.partialFilterExpression &&
                                    txIdx.partialFilterExpression.isArchived === false &&
                                    txIdx.partialFilterExpression['transactions.paymentId']));
                        if (!txGood) {
                            try {
                                if (txIdx)
                                    yield PropertyAccount_1.default.collection.dropIndex('propertyId_1_ledgerType_1_transactions.paymentId_1');
                            }
                            catch (_b) { }
                            try {
                                const options = cosmosMongo
                                    // Cosmos Mongo has limitations on nested partial expressions.
                                    ? { unique: true, sparse: true }
                                    : { unique: true, partialFilterExpression: { isArchived: false, 'transactions.paymentId': { $exists: true } } };
                                yield PropertyAccount_1.default.collection.createIndex({ propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 }, options);
                                console.log('Created partial unique transactions index propertyId_1_ledgerType_1_transactions.paymentId_1.');
                            }
                            catch (createErr) {
                                if (!cosmosMongo && this.isCosmosPartialFilterUnsupported(createErr)) {
                                    try {
                                        yield PropertyAccount_1.default.collection.createIndex({ propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 }, { unique: true, sparse: true });
                                        console.log('Created sparse unique transactions index propertyId_1_ledgerType_1_transactions.paymentId_1 after partial filter rejection.');
                                    }
                                    catch (retryErr) {
                                        console.warn('Could not create transactions compound index (including sparse fallback):', (retryErr === null || retryErr === void 0 ? void 0 : retryErr.message) || retryErr);
                                    }
                                }
                                else {
                                    console.warn('Could not create transactions compound index:', (createErr === null || createErr === void 0 ? void 0 : createErr.message) || createErr);
                                }
                            }
                        }
                    }
                    catch (e) {
                        console.warn('Failed to verify/upgrade PropertyAccount indexes:', (e === null || e === void 0 ? void 0 : e.message) || e);
                    }
                }))();
            }
            return ledgerIndexUpgradePromise;
        });
    }
    /**
     * Recalculate balance for an existing account
     */
    recalculateBalance(account) {
        return __awaiter(this, void 0, void 0, function* () {
            this.validateWritableAccount(account, String(account.propertyId), 'recalculateBalance');
            const totals = (0, propertyAccountTotals_1.computePropertyAccountTotals)(account);
            const revision = Number(account.ledgerRevision || 0);
            const scalarsUnchanged = account.runningBalance === totals.runningBalance &&
                Number(account.totalIncome || 0) === totals.totalIncome &&
                Number(account.totalExpenses || 0) === totals.totalExpenses &&
                Number(account.totalOwnerPayouts || 0) === totals.totalOwnerPayouts &&
                Number(account.passThroughCollected || 0) === totals.passThroughCollected &&
                Number(account.passThroughPaid || 0) === totals.passThroughPaid &&
                Number(account.passThroughOutstanding || 0) === totals.passThroughOutstanding &&
                Number(account.netOwnerBalance || 0) === totals.runningBalance;
            if (scalarsUnchanged)
                return;
            account.runningBalance = totals.runningBalance;
            account.totalIncome = totals.totalIncome;
            account.totalExpenses = totals.totalExpenses;
            account.totalOwnerPayouts = totals.totalOwnerPayouts;
            account.passThroughCollected = totals.passThroughCollected;
            account.passThroughPaid = totals.passThroughPaid;
            account.passThroughOutstanding = totals.passThroughOutstanding;
            account.netOwnerBalance = totals.runningBalance;
            account.lastUpdated = new Date();
            // Never $set passThroughAccounts/transactions arrays â€” concurrent $push must win.
            const result = yield PropertyAccount_1.default.updateOne({
                _id: account._id,
                propertyId: account.propertyId,
                isArchived: false,
                isActive: { $ne: false },
                $or: [{ ledgerRevision: revision }, { ledgerRevision: { $exists: false } }]
            }, {
                $set: {
                    runningBalance: totals.runningBalance,
                    totalIncome: totals.totalIncome,
                    totalExpenses: totals.totalExpenses,
                    totalOwnerPayouts: totals.totalOwnerPayouts,
                    passThroughCollected: totals.passThroughCollected,
                    passThroughPaid: totals.passThroughPaid,
                    passThroughOutstanding: totals.passThroughOutstanding,
                    netOwnerBalance: totals.runningBalance,
                    lastUpdated: new Date()
                },
                $inc: { ledgerRevision: 1 }
            });
            if (Number(result.modifiedCount || 0) === 0 && Number(result.matchedCount || 0) === 0) {
                const fresh = yield PropertyAccount_1.default.findOne({
                    _id: account._id,
                    isArchived: false,
                    isActive: { $ne: false }
                });
                if (fresh && String(fresh.ledgerRevision || 0) !== String(revision)) {
                    logger_1.logger.warn('Skipped stale PropertyAccount total write', {
                        accountId: String(account._id),
                        expectedRevision: revision,
                        actualRevision: fresh.ledgerRevision
                    });
                }
            }
        });
    }
    reconcileReversedPaymentArtifacts(_account) {
        return __awaiter(this, void 0, void 0, function* () {
            // Counter-postings neutralise a reversal. Cancelling the original income would erase history.
            return;
        });
    }
    ownerIncomeCompletenessDeps() {
        return {
            resolveLedgerTypeForProperty: (propertyId) => this.resolveLedgerTypeForProperty(propertyId, 'recordIncomeFromPayment'),
            getCompatibilityChargeLines: (payment, companyId) => chargeTypeService_1.default.getCompatibilityChargeLines(payment, companyId),
            findActivePropertyAccounts: (propertyId, ledgerType) => __awaiter(this, void 0, void 0, function* () {
                const pid = new mongoose_1.default.Types.ObjectId(propertyId);
                return PropertyAccount_1.default.find(this.activeAccountCandidatesQuery(pid, ledgerType))
                    .select({
                    propertyId: 1,
                    ledgerType: 1,
                    isArchived: 1,
                    isActive: 1,
                    'transactions.type': 1,
                    'transactions.paymentId': 1,
                    'transactions.status': 1,
                    'transactions.idempotencyKey': 1,
                    'passThroughAccounts.type': 1,
                    'passThroughAccounts.transactions.type': 1,
                    'passThroughAccounts.transactions.paymentId': 1,
                    'passThroughAccounts.transactions.status': 1,
                    'passThroughAccounts.transactions.idempotencyKey': 1
                })
                    .lean();
            }),
            findDevelopmentIdForUnit: (unitId) => __awaiter(this, void 0, void 0, function* () {
                const unitDoc = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).select('developmentId').lean();
                return (unitDoc === null || unitDoc === void 0 ? void 0 : unitDoc.developmentId) ? String(unitDoc.developmentId) : undefined;
            })
        };
    }
    /**
     * Append a completed row to the property ledger. Used by individualAccountingService
     * only — rent still posts through recordIncomeFromPayment.
     */
    appendManualLedgerTransaction(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.validateWritableAccount(yield this.getOrCreatePropertyAccount(input.propertyId), input.propertyId, 'appendManualLedgerTransaction');
            const existing = (account.transactions || []).find((tx) => String(tx.idempotencyKey || '') === input.idempotencyKey);
            if (existing) {
                return {
                    accountId: account._id,
                    transactionId: existing._id
                };
            }
            const row = {
                type: input.transaction.type,
                amount: Number(input.transaction.amount),
                date: input.transaction.date,
                idempotencyKey: input.idempotencyKey,
                description: input.transaction.description,
                category: input.transaction.category,
                transactionCategory: input.transaction.transactionCategory,
                accountingTreatment: input.transaction.accountingTreatment,
                referenceNumber: input.transaction.referenceNumber,
                status: input.transaction.status || 'completed',
                processedBy: input.transaction.processedBy,
                notes: input.transaction.notes,
                attachments: input.transaction.attachments || [],
                createdAt: new Date(),
                updatedAt: new Date()
            };
            yield PropertyAccount_1.default.updateOne({
                _id: account._id,
                propertyId: account.propertyId,
                isArchived: false,
                isActive: { $ne: false },
                'transactions.idempotencyKey': { $ne: input.idempotencyKey }
            }, {
                $push: { transactions: row },
                $set: { lastUpdated: new Date() }
            });
            const fresh = yield PropertyAccount_1.default.findOne({
                _id: account._id,
                isArchived: false,
                isActive: { $ne: false }
            });
            if (fresh)
                yield this.recalculateBalance(fresh);
            const posted = ((fresh === null || fresh === void 0 ? void 0 : fresh.transactions) || []).find((tx) => String(tx.idempotencyKey || '') === input.idempotencyKey);
            return {
                accountId: account._id,
                transactionId: posted === null || posted === void 0 ? void 0 : posted._id
            };
        });
    }
    /**
     * Record income from a completed Payment onto the property ledger.
   *
   * Call only from paymentAccountingOrchestrator (live completion) or from
   * explicit authorised repair, which itself calls the orchestrator.
   * Do not call from scheduled jobs, GET handlers, integrity, or historical sync.
   */
    recordIncomeFromPayment(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const payment = yield Payment_1.Payment.findById(paymentId);
                if (!payment) {
                    throw new errorHandler_1.AppError('Payment not found', 404);
                }
                const policy = (0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)(payment);
                if (!policy.allowed) {
                    logger_1.logger.info(`Skipping income recording for payment ${paymentId} - ${policy.reason}`);
                    return;
                }
                try {
                    const completeness = yield (0, paymentAccountingCompleteness_1.checkPaymentAccountingCompleteness)(payment, this.ownerIncomeCompletenessDeps());
                    if ((0, paymentAccountingCompleteness_1.shouldSkipRecordIncomePosting)(completeness)) {
                        logger_1.logger.debug('payment completeness check passed', { paymentId: String(payment._id) });
                        return;
                    }
                    logger_1.logger.debug(`payment completeness check failed: ${completeness.reason || 'not_proven'}`, {
                        paymentId: String(payment._id)
                    });
                }
                catch (_c) {
                    logger_1.logger.debug('payment completeness check failed: completeness_error', { paymentId: String(payment._id) });
                }
                const domain = (0, transactionDomain_1.historicalTransactionDomain)(payment);
                if (!domain) {
                    throw new errorHandler_1.AppError(`Payment ${paymentId} has no authoritative transaction domain`, 409);
                }
                const isSale = domain === 'SALE';
                const ledgerType = (0, transactionDomain_1.ledgerForDomain)(domain);
                const targets = yield (0, paymentAccountingCompleteness_1.buildOwnerIncomeLedgerTargets)({
                    isSale,
                    ledgerType,
                    propertyId: String(payment.propertyId),
                    developmentId: payment === null || payment === void 0 ? void 0 : payment.developmentId,
                    developmentUnitId: payment === null || payment === void 0 ? void 0 : payment.developmentUnitId,
                    findDevelopmentIdForUnit: (unitId) => __awaiter(this, void 0, void 0, function* () {
                        try {
                            const unitDoc = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).select('developmentId');
                            return (unitDoc === null || unitDoc === void 0 ? void 0 : unitDoc.developmentId) ? String(unitDoc.developmentId) : undefined;
                        }
                        catch (_a) {
                            return undefined;
                        }
                    }),
                    unitLookupErrors: 'swallow'
                });
                let postedToAtLeastOneTarget = false;
                let notFoundCount = 0;
                const chargeLines = isSale
                    ? []
                    : yield chargeTypeService_1.default.getCompatibilityChargeLines(payment, payment.companyId);
                const passThroughLines = chargeLines.filter(line => line.chargeType.category === 'PASS_THROUGH');
                const passThroughTotal = passThroughLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
                const propertyExpenseLines = chargeLines.filter(line => line.chargeType.category === 'PROPERTY_EXPENSE');
                const propertyExpenseTotal = propertyExpenseLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
                const propertyIncomeLines = chargeLines.filter(line => line.chargeType.ownerIncome && line.chargeType.category === 'PROPERTY_INCOME');
                const primaryIncomeChargeType = (_a = propertyIncomeLines[0]) === null || _a === void 0 ? void 0 : _a.chargeType;
                const ownerIncomeAmount = (0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({
                    isSale,
                    ownerAmount: ((_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.ownerAmount) || 0,
                    passThroughTotal
                });
                if (Number(payment.amount || 0) > 0 && ownerIncomeAmount <= 0) {
                    throw new transactionDomain_1.OwnerIncomeAmountMissingError(paymentId);
                }
                const ownerSeamKey = String(paymentId);
                const ownerSeams = global.__phase26OwnerSeam || (global.__phase26OwnerSeam = new Set());
                if (process.env.NODE_ENV !== 'production' &&
                    process.env.MANTIS_TEST_SEAM === '1' &&
                    String(payment.notes || '').includes('PHASE26_FAIL_OWNER_INCOME') &&
                    !ownerSeams.has(ownerSeamKey)) {
                    ownerSeams.add(ownerSeamKey);
                    throw new Error('PHASE26_FAIL_OWNER_INCOME');
                }
                for (const target of targets) {
                    let account = null;
                    try {
                        account = yield this.getOrCreatePropertyAccount(target.id, ledgerType);
                    }
                    catch (e) {
                        const message = String((e === null || e === void 0 ? void 0 : e.message) || '');
                        const status = Number((e === null || e === void 0 ? void 0 : e.statusCode) || (e === null || e === void 0 ? void 0 : e.status) || 0);
                        // Treat missing entity as a non-fatal condition for this payment target
                        if (status === 404 ||
                            /not found|entity not found/i.test(message) ||
                            status === 400 && /unable to determine ledger type/i.test(message)) {
                            notFoundCount++;
                            continue;
                        }
                        throw e;
                    }
                    account = this.validateWritableAccount(account, target.id, 'recordIncomeFromPayment');
                    const incomeAmount = ownerIncomeAmount;
                    const recordPassThroughIfNeeded = () => __awaiter(this, void 0, void 0, function* () {
                        const grouped = new Map();
                        for (const line of passThroughLines) {
                            const existing = grouped.get(line.chargeType.code) || { amount: 0, line };
                            existing.amount += Number(line.amount || 0);
                            grouped.set(line.chargeType.code, existing);
                        }
                        for (const [code, row] of grouped) {
                            if (row.amount <= 0)
                                continue;
                            yield this.recordPassThroughCollection({
                                propertyId: target.id,
                                companyId: payment.companyId ? String(payment.companyId) : undefined,
                                chargeType: code,
                                amount: row.amount,
                                date: payment.paymentDate || payment.createdAt,
                                paymentId,
                                levyPaymentId: code === 'LEVY' && payment.linkedLevyPaymentId ? String(payment.linkedLevyPaymentId) : undefined,
                                referenceNumber: payment.referenceNumber,
                                description: `${row.line.chargeType.name} collected - ${payment.referenceNumber}`,
                                processedBy: payment.processedBy ? String(payment.processedBy) : undefined,
                                notes: payment.notes,
                                idempotencyKey: `payment:${paymentId}:pass-through:${code}`
                            });
                        }
                    });
                    const recordConfiguredExpensesIfNeeded = () => __awaiter(this, void 0, void 0, function* () {
                        var _a, _b;
                        if (propertyExpenseTotal <= 0)
                            return;
                        const idKey = `payment:${paymentId}:configured-expense`;
                        const existingExpense = account.transactions.find(t => String(t.idempotencyKey || '') === idKey);
                        if (existingExpense)
                            return;
                        const expenseTransaction = {
                            type: 'expense',
                            amount: propertyExpenseTotal,
                            date: payment.paymentDate || payment.createdAt,
                            idempotencyKey: idKey,
                            description: `Configured property expense - ${payment.referenceNumber}`,
                            category: 'configured_expense',
                            transactionCategory: 'OTHER',
                            accountingTreatment: 'PROPERTY_EXPENSE',
                            chargeTypeCode: (_a = propertyExpenseLines[0]) === null || _a === void 0 ? void 0 : _a.chargeType.code,
                            chargeTypeId: (_b = propertyExpenseLines[0]) === null || _b === void 0 ? void 0 : _b.chargeType._id,
                            status: 'completed',
                            processedBy: payment.processedBy,
                            referenceNumber: payment.referenceNumber,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        yield PropertyAccount_1.default.updateOne({
                            _id: account._id,
                            propertyId: account.propertyId,
                            isArchived: false,
                            isActive: { $ne: false },
                            'transactions.idempotencyKey': { $ne: idKey }
                        }, { $push: { transactions: expenseTransaction }, $set: { lastUpdated: new Date() } });
                        const freshAfterExpense = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false, isActive: { $ne: false } });
                        if (freshAfterExpense)
                            yield this.recalculateBalance(freshAfterExpense);
                    });
                    // Check if income already recorded for this payment
                    const existingTransaction = account.transactions.find(t => { var _a; return ((_a = t.paymentId) === null || _a === void 0 ? void 0 : _a.toString()) === paymentId && t.type === 'income'; });
                    if (existingTransaction) {
                        logger_1.logger.info(`Income already recorded for payment: ${paymentId} on account ${String(account._id)}`);
                        yield recordPassThroughIfNeeded();
                        yield recordConfiguredExpensesIfNeeded();
                        postedToAtLeastOneTarget = true;
                        continue;
                    }
                    if (incomeAmount <= 0) {
                        logger_1.logger.info(`Skipping income for payment ${paymentId} due to deposit exclusion or zero owner income (computed=${incomeAmount}).`);
                        yield recordPassThroughIfNeeded();
                        yield recordConfiguredExpensesIfNeeded();
                        if (passThroughTotal > 0 || propertyExpenseTotal > 0) {
                            postedToAtLeastOneTarget = true;
                            this.notifyAccountUpdated({
                                companyId: payment.companyId,
                                propertyId: target.id,
                                accountId: account._id,
                                paymentId,
                                eventType: 'payment_recorded'
                            });
                        }
                        continue;
                    }
                    const incomeDescription = isSale
                        ? `Sale income - ${payment.referenceNumber}`
                        : `Rental income - ${payment.referenceNumber}`;
                    const incomeCategory = isSale ? 'sale_income' : 'rental_income';
                    const incomeTransaction = {
                        type: 'income',
                        amount: incomeAmount,
                        date: payment.paymentDate || payment.createdAt,
                        paymentId: new mongoose_1.default.Types.ObjectId(paymentId),
                        idempotencyKey: `payment:${paymentId}`,
                        description: incomeDescription,
                        category: incomeCategory,
                        transactionCategory: isSale ? 'OTHER' : ((primaryIncomeChargeType === null || primaryIncomeChargeType === void 0 ? void 0 : primaryIncomeChargeType.code) === 'RENT' ? 'RENT' : 'OTHER'),
                        accountingTreatment: 'PROPERTY_INCOME',
                        chargeTypeCode: primaryIncomeChargeType === null || primaryIncomeChargeType === void 0 ? void 0 : primaryIncomeChargeType.code,
                        chargeTypeId: primaryIncomeChargeType === null || primaryIncomeChargeType === void 0 ? void 0 : primaryIncomeChargeType._id,
                        status: 'completed',
                        processedBy: payment.processedBy,
                        referenceNumber: payment.referenceNumber,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    yield PropertyAccount_1.default.updateOne({
                        _id: account._id,
                        propertyId: account.propertyId,
                        isArchived: false,
                        isActive: { $ne: false },
                        'transactions.idempotencyKey': { $ne: `payment:${paymentId}` }
                    }, {
                        $push: { transactions: incomeTransaction },
                        $set: { lastUpdated: new Date() }
                    });
                    const fresh = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false, isActive: { $ne: false } });
                    if (fresh) {
                        yield this.recalculateBalance(fresh);
                    }
                    yield recordPassThroughIfNeeded();
                    yield recordConfiguredExpensesIfNeeded();
                    logger_1.logger.info(`Accounting ledger successfully updated for payment ${paymentId} on account ${String(account._id)} (target ${target.id}, ledger ${target.ledger}, income=${incomeAmount})`);
                    this.notifyAccountUpdated({
                        companyId: payment.companyId,
                        propertyId: target.id,
                        accountId: account._id,
                        paymentId,
                        eventType: 'payment_recorded'
                    });
                    postedToAtLeastOneTarget = true;
                }
                // If we could not post to any target and every attempt failed due to missing entities,
                // place the payment in suspense to avoid repeated degradation.
                if (!postedToAtLeastOneTarget && notFoundCount >= targets.length && targets.length > 0) {
                    try {
                        yield Payment_1.Payment.updateOne({ _id: payment._id, isInSuspense: { $ne: true } }, { $set: { isInSuspense: true } });
                        logger_1.logger.warn(`Payment ${String(payment._id)} placed in suspense (no backing property/development/unit found)`);
                    }
                    catch (_d) { }
                }
            }
            catch (error) {
                logger_1.logger.error('Error recording income from payment:', error);
                throw error;
            }
        });
    }
    reverseIncomeFromPayment(paymentId, opts) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const payment = yield Payment_1.Payment.findById(paymentId);
                if (!payment) {
                    throw new errorHandler_1.AppError('Payment not found', 404);
                }
                const domain = (0, transactionDomain_1.historicalTransactionDomain)(payment);
                if (!domain) {
                    throw new errorHandler_1.AppError(`Payment ${paymentId} has no authoritative transaction domain`, 409);
                }
                const targets = [];
                const isSale = domain === 'SALE';
                const ledgerType = (0, transactionDomain_1.ledgerForDomain)(domain);
                let devId = payment === null || payment === void 0 ? void 0 : payment.developmentId;
                const unitId = payment === null || payment === void 0 ? void 0 : payment.developmentUnitId;
                if (isSale) {
                    if (unitId)
                        targets.push({ id: unitId.toString(), ledger: ledgerType });
                    if (!devId && unitId) {
                        try {
                            const unitDoc = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).select('developmentId');
                            devId = unitDoc === null || unitDoc === void 0 ? void 0 : unitDoc.developmentId;
                        }
                        catch (_a) { }
                    }
                    if (devId)
                        targets.push({ id: devId.toString(), ledger: ledgerType });
                    if (!unitId && !devId)
                        targets.push({ id: payment.propertyId.toString(), ledger: ledgerType });
                }
                else {
                    targets.push({ id: payment.propertyId.toString(), ledger: ledgerType });
                }
                (0, testFailureSeam_1.throwOnceIfArmed)(paymentId, `${String(payment.notes || '')} ${String((opts === null || opts === void 0 ? void 0 : opts.reason) || '')}`, 'PHASE27_FAIL_OWNER');
                const chargeLines = isSale
                    ? []
                    : yield chargeTypeService_1.default.getCompatibilityChargeLines(payment, payment.companyId);
                const passThroughLines = chargeLines.filter(line => line.chargeType.category === 'PASS_THROUGH');
                let countered = false;
                for (const target of targets) {
                    const account = this.validateWritableAccount(yield this.getOrCreatePropertyAccount(target.id, target.ledger), target.id, 'reverseIncomeFromPayment');
                    const groupedPassThrough = new Map();
                    for (const line of passThroughLines) {
                        const existing = groupedPassThrough.get(line.chargeType.code) || { amount: 0, line };
                        existing.amount += Number(line.amount || 0);
                        groupedPassThrough.set(line.chargeType.code, existing);
                    }
                    for (const [code, row] of groupedPassThrough) {
                        if (row.amount <= 0)
                            continue;
                        yield this.recordPassThroughPayment({
                            propertyId: target.id,
                            companyId: payment.companyId ? String(payment.companyId) : undefined,
                            chargeType: code,
                            amount: row.amount,
                            date: new Date(),
                            paymentId,
                            levyPaymentId: code === 'LEVY' && payment.linkedLevyPaymentId ? String(payment.linkedLevyPaymentId) : undefined,
                            referenceNumber: payment.referenceNumber,
                            description: `${row.line.chargeType.name} reversal - ${payment.referenceNumber || paymentId}`,
                            processedBy: opts === null || opts === void 0 ? void 0 : opts.processedBy,
                            notes: (opts === null || opts === void 0 ? void 0 : opts.reason) || 'Payment reversal',
                            idempotencyKey: `payment:${paymentId}:pass-through:${code}:reversal`,
                            ledgerType: target.ledger
                        });
                    }
                    const originalIncome = (account.transactions || []).filter((t) => t.type === 'income' &&
                        String(t.paymentId || '') === String(payment._id || '') &&
                        String(t.status || '') === 'completed' &&
                        !t.reversesPaymentId);
                    const postedIncome = Number(originalIncome.reduce((sum, t) => sum + Number(t.amount || 0), 0).toFixed(2));
                    const incomeKey = `payment:${paymentId}:owner-income:reversal:${target.id}`;
                    const incomeAlready = (account.transactions || []).some((t) => String(t.idempotencyKey || '') === incomeKey && String(t.status || '') === 'completed');
                    if (postedIncome > 0 && !incomeAlready) {
                        const counter = {
                            type: 'expense',
                            amount: postedIncome,
                            date: new Date(),
                            reversesPaymentId: payment._id,
                            idempotencyKey: incomeKey,
                            description: `Reversal of owner income ${String(payment.referenceNumber || paymentId)}`,
                            category: 'payment_reversal',
                            transactionCategory: 'OTHER',
                            accountingTreatment: 'PROPERTY_EXPENSE',
                            status: 'completed',
                            notes: (opts === null || opts === void 0 ? void 0 : opts.reason) || 'Payment reversal',
                            referenceNumber: `REV-OWN-${String(payment.referenceNumber || paymentId)}`,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        yield PropertyAccount_1.default.updateOne({
                            _id: account._id,
                            propertyId: account.propertyId,
                            isArchived: false,
                            isActive: { $ne: false },
                            'transactions.idempotencyKey': { $ne: incomeKey }
                        }, { $push: { transactions: counter }, $set: { lastUpdated: new Date() } });
                        countered = true;
                    }
                    else if (postedIncome > 0 && incomeAlready) {
                        countered = true;
                    }
                    const configuredExpenses = (account.transactions || []).filter((t) => t.type === 'expense' &&
                        String(t.category || '') === 'configured_expense' &&
                        String(t.status || '') === 'completed' &&
                        (String(t.idempotencyKey || '') === `payment:${paymentId}:configured-expense` ||
                            String(t.paymentId || '') === String(payment._id || '')));
                    for (const expense of configuredExpenses) {
                        const expenseKey = `payment:${paymentId}:configured-expense:reversal:${String(expense._id || target.id)}`;
                        const expenseAlready = (account.transactions || []).some((t) => String(t.idempotencyKey || '') === expenseKey);
                        if (expenseAlready || Number(expense.amount || 0) <= 0)
                            continue;
                        yield PropertyAccount_1.default.updateOne({
                            _id: account._id,
                            propertyId: account.propertyId,
                            isArchived: false,
                            isActive: { $ne: false },
                            'transactions.idempotencyKey': { $ne: expenseKey }
                        }, {
                            $push: {
                                transactions: {
                                    type: 'income',
                                    amount: Number(Number(expense.amount || 0).toFixed(2)),
                                    date: new Date(),
                                    reversesPaymentId: payment._id,
                                    idempotencyKey: expenseKey,
                                    description: `Reversal of configured expense ${String(payment.referenceNumber || paymentId)}`,
                                    category: 'payment_reversal',
                                    transactionCategory: 'OTHER',
                                    accountingTreatment: 'PROPERTY_INCOME',
                                    status: 'completed',
                                    notes: (opts === null || opts === void 0 ? void 0 : opts.reason) || 'Payment reversal',
                                    createdAt: new Date(),
                                    updatedAt: new Date()
                                }
                            },
                            $set: { lastUpdated: new Date() }
                        });
                    }
                    const fresh = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false, isActive: { $ne: false } });
                    if (fresh) {
                        yield this.recalculateBalance(fresh);
                    }
                    this.notifyAccountUpdated({
                        companyId: payment.companyId,
                        propertyId: target.id,
                        accountId: account._id,
                        paymentId,
                        eventType: 'payment_reversed'
                    });
                }
                return { countered };
            }
            catch (error) {
                logger_1.logger.error('Error reversing income from payment:', error);
                throw error;
            }
        });
    }
    /**
     * EXPLICIT HISTORICAL BACKFILL for development sale ledgers.
     * Call only from the authorised admin migration endpoint after confirm=true.
     * Never from GET, integrity, or scheduled reconciliation.
     */
    ensureDevelopmentLedgersAndBackfillPayments(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyFilter = {};
            if (options === null || options === void 0 ? void 0 : options.companyId) {
                companyFilter.companyId = new mongoose_1.default.Types.ObjectId(options.companyId);
            }
            // Find all developmentIds that actually have units
            const devIdsWithUnits = yield DevelopmentUnit_1.DevelopmentUnit.distinct('developmentId', {});
            if (!Array.isArray(devIdsWithUnits) || devIdsWithUnits.length === 0) {
                return { developmentsProcessed: 0, ledgersCreated: 0, paymentsScanned: 0, backfillInvocations: 0 };
            }
            // Load developments that belong to the company (if provided) and have units
            const devQuery = { _id: { $in: devIdsWithUnits } };
            Object.assign(devQuery, companyFilter);
            const developments = yield Development_1.Development.find(devQuery)
                .select('_id name companyId')
                .limit(typeof (options === null || options === void 0 ? void 0 : options.limit) === 'number' && options.limit > 0 ? options.limit : 0);
            let ledgersCreated = 0;
            let paymentsScanned = 0;
            let backfillInvocations = 0;
            for (const dev of developments) {
                // Ensure a 'sale' ledger exists for the development (guarded by unique index)
                const existing = yield PropertyAccount_1.default.findOne(this.activeAccountQuery(new mongoose_1.default.Types.ObjectId(dev._id), 'sale'));
                if (!existing) {
                    yield this.getOrCreatePropertyAccount(dev._id.toString());
                    ledgersCreated++;
                }
                // Find payments tied to this development directly or via its units
                const unitIds = yield DevelopmentUnit_1.DevelopmentUnit.find({ developmentId: dev._id }).select('_id');
                const unitIdList = unitIds.map((u) => u._id);
                if (unitIdList.length === 0) {
                    continue;
                }
                const salePayments = yield Payment_1.Payment.find({
                    paymentType: 'sale',
                    status: 'completed',
                    isProvisional: { $ne: true },
                    isInSuspense: { $ne: true },
                    $or: [
                        { developmentId: new mongoose_1.default.Types.ObjectId(dev._id) },
                        { developmentUnitId: { $in: unitIdList } }
                    ]
                }).select('_id');
                paymentsScanned += salePayments.length;
                if (salePayments.length > 0) {
                    logger_1.logger.info('Development ledger ensured. Historical sale payments were not replayed.', {
                        developmentId: String(dev._id),
                        payments: salePayments.length
                    });
                }
            }
            return {
                developmentsProcessed: developments.length,
                ledgersCreated,
                paymentsScanned,
                backfillInvocations
            };
        });
    }
    /**
     * Add expense to property account
     */
    addExpense(propertyId, expenseData, ledgerType) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (expenseData.amount <= 0) {
                    throw new errorHandler_1.AppError('Expense amount must be greater than 0', 400);
                }
                // Ensure idempotency for all expense creations (generate if missing)
                const idKey = (expenseData.idempotencyKey && expenseData.idempotencyKey.trim().length > 0)
                    ? expenseData.idempotencyKey.trim()
                    : `expense:${(0, uuid_1.v4)()}`;
                const account = this.validateWritableAccount(yield this.getOrCreatePropertyAccount(propertyId), propertyId, 'addExpense');
                if (account.runningBalance < expenseData.amount) {
                    throw new errorHandler_1.AppError('Insufficient balance for this expense', 400);
                }
                const expenseTransaction = {
                    type: 'expense',
                    amount: expenseData.amount,
                    date: expenseData.date,
                    description: expenseData.description,
                    category: expenseData.category || 'general',
                    transactionCategory: String(expenseData.category || '').toLowerCase().includes('maintenance') ? 'MAINTENANCE' : 'OTHER',
                    accountingTreatment: 'PROPERTY_EXPENSE',
                    recipientId: expenseData.recipientId,
                    recipientType: expenseData.recipientType,
                    status: 'completed',
                    processedBy: new mongoose_1.default.Types.ObjectId(expenseData.processedBy),
                    notes: expenseData.notes,
                    referenceNumber: `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    idempotencyKey: idKey,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                // Atomic, guarded append using idempotencyKey and balance check.
                const previousLastUpdated = account.lastUpdated ? new Date(account.lastUpdated) : undefined;
                let res = yield PropertyAccount_1.default.updateOne(Object.assign({ _id: account._id, propertyId: account.propertyId, isArchived: false, isActive: { $ne: false }, runningBalance: { $gte: expenseData.amount }, 'transactions.idempotencyKey': { $ne: idKey } }, (previousLastUpdated ? { lastUpdated: previousLastUpdated } : {})), {
                    $push: { transactions: expenseTransaction },
                    $set: { lastUpdated: new Date() }
                });
                if ((res === null || res === void 0 ? void 0 : res.modifiedCount) === 0) {
                    // Retry once with refreshed state
                    const fresh = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false, isActive: { $ne: false } });
                    if (fresh) {
                        yield this.recalculateBalance(fresh);
                        res = yield PropertyAccount_1.default.updateOne({
                            _id: fresh._id,
                            propertyId: fresh.propertyId,
                            isArchived: false,
                            isActive: { $ne: false },
                            runningBalance: { $gte: expenseData.amount },
                            'transactions.idempotencyKey': { $ne: idKey }
                        }, {
                            $push: { transactions: expenseTransaction },
                            $set: { lastUpdated: new Date() }
                        });
                    }
                }
                const reloaded = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false, isActive: { $ne: false } });
                if (reloaded)
                    yield this.recalculateBalance(reloaded);
                logger_1.logger.info(`Added expense (idempotent, guarded) of ${expenseData.amount} to property ${propertyId}`);
                this.notifyAccountUpdated({
                    propertyId,
                    accountId: (reloaded === null || reloaded === void 0 ? void 0 : reloaded._id) || account._id,
                    eventType: 'expense_recorded'
                });
                return (yield this.getPropertyAccount(propertyId));
            }
            catch (error) {
                logger_1.logger.error('Error adding expense:', error);
                throw error;
            }
        });
    }
    /**
     * Add an opening balance adjustment to a property account.
     *
     * Opening balance entries affect running balance only. They are intentionally
     * excluded from operational income/expense totals and the general ledger sync.
     */
    addOpeningBalanceAdjustment(propertyId, openingBalanceData, ledgerType) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const amount = Number(openingBalanceData.amount || 0);
                if (amount <= 0) {
                    throw new errorHandler_1.AppError('Opening balance amount must be greater than 0', 400);
                }
                if (!['credit', 'debit'].includes(openingBalanceData.direction)) {
                    throw new errorHandler_1.AppError('Opening balance direction must be credit or debit', 400);
                }
                const effectiveDate = openingBalanceData.date instanceof Date
                    ? openingBalanceData.date
                    : new Date(openingBalanceData.date);
                if (Number.isNaN(effectiveDate.getTime())) {
                    throw new errorHandler_1.AppError('Valid opening balance date is required', 400);
                }
                const idKey = (openingBalanceData.idempotencyKey && openingBalanceData.idempotencyKey.trim().length > 0)
                    ? openingBalanceData.idempotencyKey.trim()
                    : `opening-balance:${(0, uuid_1.v4)()}`;
                const account = this.validateWritableAccount(yield this.getOrCreatePropertyAccount(propertyId), propertyId, 'addOpeningBalanceAdjustment');
                const referenceNumber = `OB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const directionLabel = openingBalanceData.direction === 'credit' ? 'Credit' : 'Debit';
                const openingBalanceTransaction = {
                    type: 'opening_balance',
                    amount,
                    direction: openingBalanceData.direction,
                    date: effectiveDate,
                    description: ((_a = openingBalanceData.description) === null || _a === void 0 ? void 0 : _a.trim()) || `Opening balance ${directionLabel.toLowerCase()}`,
                    category: 'opening_balance',
                    transactionCategory: 'OPENING_BALANCE',
                    accountingTreatment: 'SYSTEM',
                    status: 'completed',
                    processedBy: new mongoose_1.default.Types.ObjectId(openingBalanceData.processedBy),
                    notes: openingBalanceData.notes,
                    referenceNumber,
                    idempotencyKey: idKey,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                yield PropertyAccount_1.default.updateOne({
                    _id: account._id,
                    propertyId: account.propertyId,
                    isArchived: false,
                    isActive: { $ne: false },
                    'transactions.idempotencyKey': { $ne: idKey }
                }, {
                    $push: { transactions: openingBalanceTransaction },
                    $set: { lastUpdated: new Date() }
                });
                const reloaded = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false, isActive: { $ne: false } });
                if (reloaded)
                    yield this.recalculateBalance(reloaded);
                logger_1.logger.info(`Added opening balance ${openingBalanceData.direction} of ${amount} to property ${propertyId}`);
                this.notifyAccountUpdated({
                    propertyId,
                    accountId: (reloaded === null || reloaded === void 0 ? void 0 : reloaded._id) || account._id,
                    eventType: 'account_adjusted'
                });
                return (yield this.getPropertyAccount(propertyId));
            }
            catch (error) {
                logger_1.logger.error('Error adding opening balance adjustment:', error);
                throw error;
            }
        });
    }
    /**
     * Create owner payout
     */
    createOwnerPayout(propertyId, payoutData, ledgerType) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (payoutData.amount <= 0) {
                    throw new errorHandler_1.AppError('Payout amount must be greater than 0', 400);
                }
                // Ensure idempotency for payout creation (generate if missing)
                const idKey = (payoutData.idempotencyKey && payoutData.idempotencyKey.trim().length > 0)
                    ? payoutData.idempotencyKey.trim()
                    : `payout:${(0, uuid_1.v4)()}`;
                const account = this.validateWritableAccount(yield this.getOrCreatePropertyAccount(propertyId), propertyId, 'createOwnerPayout');
                if (account.runningBalance < payoutData.amount) {
                    throw new errorHandler_1.AppError('Insufficient balance for this payout', 400);
                }
                const referenceNumber = `PAYOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const payoutStatus = payoutData.autoComplete ? 'completed' : 'pending';
                const payout = {
                    amount: payoutData.amount,
                    date: new Date(),
                    paymentMethod: payoutData.paymentMethod,
                    referenceNumber,
                    idempotencyKey: idKey,
                    status: payoutStatus,
                    processedBy: new mongoose_1.default.Types.ObjectId(payoutData.processedBy),
                    recipientId: new mongoose_1.default.Types.ObjectId(payoutData.recipientId),
                    recipientName: payoutData.recipientName,
                    recipientBankDetails: payoutData.recipientBankDetails,
                    notes: payoutData.notes,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                yield PropertyAccount_1.default.updateOne({ _id: account._id, propertyId: account.propertyId, isArchived: false, isActive: { $ne: false }, 'ownerPayouts.idempotencyKey': { $ne: idKey } }, { $push: { ownerPayouts: payout }, $set: { lastUpdated: new Date() } });
                const fresh = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false, isActive: { $ne: false } });
                if (fresh)
                    yield this.recalculateBalance(fresh);
                logger_1.logger.info(`Created owner payout (idempotent) of ${payoutData.amount} for property ${propertyId}`);
                this.notifyAccountUpdated({
                    propertyId,
                    accountId: (fresh === null || fresh === void 0 ? void 0 : fresh._id) || account._id,
                    eventType: 'payout_recorded'
                });
                return { account: (yield this.getPropertyAccount(propertyId)), payout };
            }
            catch (error) {
                logger_1.logger.error('Error creating owner payout:', error);
                throw error;
            }
        });
    }
    /**
     * Update payout status
     */
    updatePayoutStatus(propertyId, payoutId, status, processedBy) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const pid = new mongoose_1.default.Types.ObjectId(propertyId);
                // Fetch all ledgers for this property (rental/sale) and locate the payout
                const accounts = yield PropertyAccount_1.default.find({ propertyId: pid, isArchived: false, isActive: { $ne: false } });
                if (!accounts || accounts.length === 0) {
                    throw new errorHandler_1.AppError('Property account not found', 404);
                }
                let targetAccount = null;
                let targetPayout;
                for (const acc of accounts) {
                    const found = acc.ownerPayouts.find(p => { var _a; return ((_a = p._id) === null || _a === void 0 ? void 0 : _a.toString()) === payoutId; });
                    if (found) {
                        targetAccount = acc;
                        targetPayout = found;
                        break;
                    }
                }
                if (!targetAccount || !targetPayout) {
                    throw new errorHandler_1.AppError('Payout not found', 404);
                }
                targetAccount = this.validateWritableAccount(targetAccount, propertyId, 'updatePayoutStatus');
                // Atomic status transition
                const now = new Date();
                if (targetPayout.status === 'pending' && status === 'completed') {
                    if (targetAccount.runningBalance < targetPayout.amount) {
                        throw new errorHandler_1.AppError('Insufficient balance to complete payout', 400);
                    }
                    const res = yield PropertyAccount_1.default.updateOne({
                        _id: targetAccount._id,
                        propertyId: targetAccount.propertyId,
                        isArchived: false,
                        isActive: { $ne: false },
                        runningBalance: { $gte: targetPayout.amount },
                        ownerPayouts: { $elemMatch: { _id: new mongoose_1.default.Types.ObjectId(payoutId), status: 'pending' } }
                    }, {
                        $set: { 'ownerPayouts.$.status': 'completed', 'ownerPayouts.$.updatedAt': now, lastUpdated: now }
                    });
                    if ((res === null || res === void 0 ? void 0 : res.modifiedCount) === 0) {
                        throw new errorHandler_1.AppError('Unable to complete payout due to insufficient balance or concurrent update', 409);
                    }
                }
                else {
                    const res = yield PropertyAccount_1.default.updateOne({
                        _id: targetAccount._id,
                        propertyId: targetAccount.propertyId,
                        isArchived: false,
                        isActive: { $ne: false },
                        ownerPayouts: { $elemMatch: { _id: new mongoose_1.default.Types.ObjectId(payoutId) } }
                    }, {
                        $set: { 'ownerPayouts.$.status': status, 'ownerPayouts.$.updatedAt': now, lastUpdated: now }
                    });
                    if ((res === null || res === void 0 ? void 0 : res.modifiedCount) === 0) {
                        throw new errorHandler_1.AppError('Payout status update conflict', 409);
                    }
                }
                const fresh = yield PropertyAccount_1.default.findOne({ _id: targetAccount._id, isArchived: false, isActive: { $ne: false } });
                if (fresh)
                    yield this.recalculateBalance(fresh);
                logger_1.logger.info(`Updated payout ${payoutId} status to ${status} for property ${propertyId} on ledger ${String(targetAccount.ledgerType || 'unknown')}`);
                this.notifyAccountUpdated({
                    propertyId,
                    accountId: (fresh === null || fresh === void 0 ? void 0 : fresh._id) || targetAccount._id,
                    eventType: 'payout_updated'
                });
                return (yield this.getPropertyAccount(propertyId, targetAccount.ledgerType));
            }
            catch (error) {
                logger_1.logger.error('Error updating payout status:', error);
                throw error;
            }
        });
    }
    /**
     * Get property account with summary
     */
    getPropertyAccount(propertyId, ledger) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const pid = new mongoose_1.default.Types.ObjectId(propertyId);
                // An explicit ledger is historical account identity. Property.rentalType is only
                // the current-state default when the caller did not name a ledger.
                const effectiveLedger = ledger !== null && ledger !== void 0 ? ledger : (yield this.resolveLedgerTypeForProperty(propertyId, 'getPropertyAccount')).ledgerType;
                const candidates = yield PropertyAccount_1.default.find({
                    propertyId: pid,
                    isArchived: { $ne: true },
                    isActive: { $ne: false },
                    ledgerType: effectiveLedger
                });
                let account = null;
                if (!candidates || candidates.length === 0) {
                    throw new errorHandler_1.AppError('Property account not found', 404);
                }
                else if (candidates.length === 1) {
                    account = candidates[0];
                }
                else {
                    throw new errorHandler_1.AppError(`Multiple active PropertyAccounts found for property ${propertyId} (${effectiveLedger}); refusing to choose a ledger`, 409);
                }
                if (!account)
                    throw new errorHandler_1.AppError('Property account not found', 404);
                const display = account;
                const totals = (0, propertyAccountTotals_1.computePropertyAccountTotals)(display);
                display.runningBalance = totals.runningBalance;
                display.totalIncome = totals.totalIncome;
                display.totalExpenses = totals.totalExpenses;
                display.totalOwnerPayouts = totals.totalOwnerPayouts;
                display.passThroughCollected = totals.passThroughCollected;
                display.passThroughPaid = totals.passThroughPaid;
                display.passThroughOutstanding = totals.passThroughOutstanding;
                display.netOwnerBalance = totals.runningBalance;
                return display;
            }
            catch (error) {
                logger_1.logger.error('Error getting property account:', error);
                throw error;
            }
        });
    }
    /**
     * Get all property accounts for a company
     */
    getCompanyPropertyAccounts(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get all properties and developments for the company
                const [properties, developments] = yield Promise.all([
                    Property_1.Property.find({ companyId }),
                    Development_1.Development.find({ companyId })
                ]);
                const propertyIds = properties.map(p => p._id);
                const developmentIds = developments.map(d => d._id);
                // Also include development units for these developments
                let unitIds = [];
                try {
                    const units = yield DevelopmentUnit_1.DevelopmentUnit.find({ developmentId: { $in: developmentIds } }).select('_id');
                    unitIds = units.map((u) => u._id);
                }
                catch (_a) { }
                const allIds = [...propertyIds, ...developmentIds, ...unitIds];
                let accounts = yield PropertyAccount_1.default.find({
                    propertyId: { $in: allIds },
                    isArchived: { $ne: true }
                }).sort({ lastUpdated: -1 });
                return accounts;
            }
            catch (error) {
                logger_1.logger.error('Error getting company property accounts:', error);
                throw error;
            }
        });
    }
    syncPropertyMetadata(property) {
        return __awaiter(this, void 0, void 0, function* () {
            const account = this.validateWritableAccount(yield this.getOrCreatePropertyAccount(property._id.toString()), property._id.toString(), 'syncPropertyMetadata');
            const updates = {
                propertyName: property.name,
                propertyAddress: property.address,
                ownerId: property.ownerId,
                isActive: property.isActive !== false,
                lastUpdated: new Date()
            };
            if (property.ownerId) {
                const owner = yield User_1.User.findById(property.ownerId);
                if (owner) {
                    updates.ownerName = `${owner.firstName} ${owner.lastName}`;
                }
            }
            yield PropertyAccount_1.default.updateOne({ _id: account._id, isArchived: false, isActive: { $ne: false } }, { $set: updates });
        });
    }
    updateOwnerNameForActiveAccounts(ownerId, ownerName) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield PropertyAccount_1.default.updateMany({ ownerId, isArchived: false, isActive: { $ne: false } }, { $set: { ownerName, lastUpdated: new Date() } }, { maxTimeMS: 5000 });
            return Number((result === null || result === void 0 ? void 0 : result.modifiedCount) || 0);
        });
    }
    removeOwnerReferenceFromActiveAccounts(ownerId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield PropertyAccount_1.default.updateMany({ ownerId, isArchived: false, isActive: { $ne: false } }, {
                $unset: { ownerId: 1, ownerName: 1 },
                $set: { lastUpdated: new Date() }
            }, { maxTimeMS: 5000 });
            return Number((result === null || result === void 0 ? void 0 : result.modifiedCount) || 0);
        });
    }
    clearOwnerReferenceForAccount(accountId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield PropertyAccount_1.default.updateOne({ _id: accountId, isArchived: false, isActive: { $ne: false } }, { $unset: { ownerId: 1, ownerName: 1 }, $set: { lastUpdated: new Date() } });
            return Number((result === null || result === void 0 ? void 0 : result.modifiedCount) || 0) > 0;
        });
    }
    archiveLedgersForProperty(propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield PropertyAccount_1.default.updateMany({ propertyId }, { $set: { isActive: false, isArchived: true, lastUpdated: new Date() } }, { maxTimeMS: 5000 });
            return Number((result === null || result === void 0 ? void 0 : result.modifiedCount) || 0);
        });
    }
    archiveLedgerById(accountId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield PropertyAccount_1.default.updateOne({ _id: accountId, isArchived: { $ne: true } }, { $set: { isArchived: true, isActive: false, lastUpdated: new Date() } });
            return Number((result === null || result === void 0 ? void 0 : result.modifiedCount) || 0) > 0;
        });
    }
    cancelPaymentReference(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            const propertyAccount = yield PropertyAccount_1.default.findOne({
                'transactions.paymentId': paymentId,
                isArchived: false,
                isActive: { $ne: false }
            });
            if (!propertyAccount)
                return false;
            const transaction = propertyAccount.transactions.find((t) => t.paymentId && t.paymentId.toString() === paymentId);
            if (!transaction)
                return false;
            this.validateWritableAccount(propertyAccount, String(propertyAccount.propertyId), 'cancelPaymentReference');
            const updateResult = yield PropertyAccount_1.default.updateOne({
                _id: propertyAccount._id,
                propertyId: propertyAccount.propertyId,
                isArchived: false,
                isActive: { $ne: false },
                transactions: { $elemMatch: { _id: transaction._id, status: { $ne: 'cancelled' } } }
            }, {
                $set: {
                    'transactions.$.status': 'cancelled',
                    'transactions.$.updatedAt': new Date(),
                    lastUpdated: new Date()
                }
            });
            if (Number((updateResult === null || updateResult === void 0 ? void 0 : updateResult.modifiedCount) || 0) > 0) {
                const fresh = yield PropertyAccount_1.default.findOne({
                    _id: propertyAccount._id,
                    isArchived: false,
                    isActive: { $ne: false }
                });
                if (fresh) {
                    yield this.recalculateBalance(fresh);
                }
                return true;
            }
            return false;
        });
    }
    /**
     * EXPLICIT HISTORICAL BACKFILL. Call only from the authorised admin migration
     * endpoint after confirm=true and a non-empty reason. Never from GET, integrity,
     * or scheduled reconciliation.
     */
    syncPropertyAccountsWithPayments(options) {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.warn('Historical payment replay is disabled. Use the read-only duplicate inventory and single-payment repair.', {
                companyId: (options === null || options === void 0 ? void 0 : options.companyId) || null
            });
            throw new errorHandler_1.AppError('HISTORICAL_REPLAY_DISABLED: property-account sync no longer posts or replays payments. Detect gaps and repair one payment at a time.', 409);
        });
    }
    getLedgerEntityIdsForCompany(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const trimmed = String(companyId || '').trim();
            if (!trimmed || !mongoose_1.default.Types.ObjectId.isValid(trimmed)) {
                return [];
            }
            const companyObjectId = new mongoose_1.default.Types.ObjectId(trimmed);
            const [properties, developments] = yield Promise.all([
                Property_1.Property.find({ companyId: companyObjectId }).select('_id').lean(),
                Development_1.Development.find({ companyId: companyObjectId }).select('_id').lean()
            ]);
            const developmentIds = developments.map((row) => row._id);
            const units = developmentIds.length
                ? yield DevelopmentUnit_1.DevelopmentUnit.find({ developmentId: { $in: developmentIds } }).select('_id').lean()
                : [];
            return [...properties, ...developments, ...units].map((row) => String(row._id));
        });
    }
    /**
     * Get transaction history with filters
     */
    getTransactionHistory(propertyId, filters, legacyLedgerHint) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = yield this.getPropertyAccount(propertyId, legacyLedgerHint);
                let transactions = account.transactions;
                // Apply filters
                if (filters.type) {
                    transactions = transactions.filter(t => t.type === filters.type);
                }
                if (filters.startDate) {
                    transactions = transactions.filter(t => t.date >= filters.startDate);
                }
                if (filters.endDate) {
                    transactions = transactions.filter(t => t.date <= filters.endDate);
                }
                if (filters.category) {
                    transactions = transactions.filter(t => t.category === filters.category);
                }
                if (filters.status) {
                    transactions = transactions.filter(t => t.status === filters.status);
                }
                // Sort by date descending
                return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
            }
            catch (error) {
                logger_1.logger.error('Error getting transaction history:', error);
                throw error;
            }
        });
    }
    /**
     * Get payout history
     */
    getPayoutHistory(propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const account = yield this.getPropertyAccount(propertyId);
                return account.ownerPayouts.sort((a, b) => b.date.getTime() - a.date.getTime());
            }
            catch (error) {
                logger_1.logger.error('Error getting payout history:', error);
                throw error;
            }
        });
    }
    /**
     * Merge duplicate PropertyAccount documents in-memory and persist the cleanup.
     * Duplicates are defined by same propertyId and effective ledgerType
     * (null/undefined ledgerType is normalized to 'rental' for legacy records).
     *
     * Returns true if any changes were made (merged or deleted).
     */
    mergeDuplicateAccounts(accounts) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(accounts) || accounts.length === 0)
                return false;
            accounts = accounts.filter(acc => acc.isArchived !== true && acc.isActive !== false);
            if (accounts.length === 0)
                return false;
            const groupsMap = Object.create(null);
            for (const acc of accounts) {
                const pid = String(acc.propertyId);
                const ledgerRaw = acc.ledgerType;
                const ledger = ledgerRaw === 'sale' ? 'sale' : 'rental';
                const key = `${pid}|${ledger}`;
                if (!groupsMap[key])
                    groupsMap[key] = [];
                groupsMap[key].push(acc);
            }
            const groups = Object.entries(groupsMap).map(([key, items]) => ({ key, items }));
            let anyChanged = false;
            for (const group of groups) {
                if (group.items.length <= 1)
                    continue;
                const [groupPropertyId, groupLedger] = group.key.split('|');
                const plan = (0, propertyAccountDuplicateInventory_1.classifyDuplicateGroup)(groupPropertyId, groupLedger, group.items.map((account) => ({
                    id: String(account._id),
                    propertyId: String(account.propertyId),
                    ledgerType: account.ledgerType || groupLedger,
                    isArchived: account.isArchived === true,
                    isActive: account.isActive !== false,
                    transactions: (account.transactions || []),
                    ownerPayouts: (account.ownerPayouts || []),
                    createdAt: account.createdAt
                })));
                if (!plan.automaticMergeAllowed) {
                    logger_1.logger.warn('Refusing automatic duplicate merge', {
                        propertyId: groupPropertyId,
                        ledgerType: groupLedger,
                        classification: plan.classification,
                        reason: plan.reason
                    });
                    continue;
                }
                // Choose keeper from the safe classification, then by financial history.
                const legacy = group.items.filter(i => i.ledgerType == null);
                const candidates = legacy.length > 0 ? legacy : group.items;
                const pickScore = (i) => {
                    const count = (Array.isArray(i.transactions) ? i.transactions.length : 0) + (Array.isArray(i.ownerPayouts) ? i.ownerPayouts.length : 0);
                    const updated = i.lastUpdated ? new Date(i.lastUpdated).getTime() : 0;
                    return { count, updated };
                };
                let keeper = candidates[0];
                for (const c of candidates.slice(1)) {
                    const a = pickScore(keeper);
                    const b = pickScore(c);
                    if (b.count > a.count || (b.count === a.count && b.updated > a.updated)) {
                        keeper = c;
                    }
                }
                const toMergeAndDelete = group.items.filter(i => String(i._id) !== String(keeper._id));
                if (toMergeAndDelete.length === 0)
                    continue;
                // Build uniqueness sets for transactions and payouts on keeper
                const txKeys = new Set();
                for (const t of (keeper.transactions || [])) {
                    const pid = (t === null || t === void 0 ? void 0 : t.paymentId) ? String(t.paymentId) : '';
                    const key = pid
                        ? `pid:${pid}`
                        : `free:${t.type}:${t.referenceNumber || ''}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`;
                    txKeys.add(key);
                }
                const payoutKeys = new Map(); // referenceNumber -> index in keeper.ownerPayouts
                for (let i = 0; i < (keeper.ownerPayouts || []).length; i++) {
                    const p = keeper.ownerPayouts[i];
                    const ref = p.referenceNumber || String(p._id || '');
                    payoutKeys.set(ref, i);
                }
                // Normalize ledgerType on keeper if missing
                if (!keeper.ledgerType) {
                    const ledger = group.key.endsWith('|sale') ? 'sale' : 'rental';
                    keeper.ledgerType = ledger;
                }
                // Merge each duplicate into keeper
                for (const dup of toMergeAndDelete) {
                    // Merge transactions (dedupe by paymentId if present, else by derived key)
                    for (const t of (dup.transactions || [])) {
                        const pid = (t === null || t === void 0 ? void 0 : t.paymentId) ? String(t.paymentId) : '';
                        const key = pid
                            ? `pid:${pid}`
                            : `free:${t.type}:${t.referenceNumber || ''}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`;
                        if (!txKeys.has(key)) {
                            // Push shallow copy and remove _id to let MongoDB assign a new one
                            const copy = Object.assign({}, t);
                            delete copy._id;
                            keeper.transactions.push(copy);
                            txKeys.add(key);
                        }
                    }
                    // Merge owner payouts (dedupe by referenceNumber; prefer completed or latest updatedAt)
                    for (const p of (dup.ownerPayouts || [])) {
                        const ref = p.referenceNumber || String(p._id || '');
                        if (!payoutKeys.has(ref)) {
                            const copy = Object.assign({}, p);
                            delete copy._id;
                            keeper.ownerPayouts.push(copy);
                            payoutKeys.set(ref, (keeper.ownerPayouts || []).length - 1);
                        }
                        else {
                            const idx = payoutKeys.get(ref);
                            const existing = keeper.ownerPayouts[idx];
                            const preferNew = (existing.status !== 'completed' && p.status === 'completed') ||
                                (new Date(p.updatedAt || p.createdAt).getTime() > new Date(existing.updatedAt || existing.createdAt).getTime());
                            if (preferNew) {
                                keeper.ownerPayouts[idx] = Object.assign(Object.assign({}, p), { _id: existing._id }); // keep existing _id slot
                            }
                        }
                    }
                }
                // Persist keeper and recalculate balance
                try {
                    this.validateWritableAccount(keeper, String(keeper.propertyId), 'mergeDuplicateAccounts');
                    yield keeper.save();
                    yield this.recalculateBalance(keeper);
                }
                catch (e) {
                    console.warn('Keeper save failed during account dedupe:', (e === null || e === void 0 ? void 0 : e.message) || e);
                }
                // Archive duplicates instead of deleting (to respect immutable ledger policy and avoid unique conflicts)
                try {
                    const ids = toMergeAndDelete.map(d => d._id);
                    if (ids.length > 0) {
                        yield PropertyAccount_1.default.updateMany({ _id: { $in: ids }, isArchived: false }, { $set: { isArchived: true, lastUpdated: new Date() } });
                    }
                    anyChanged = true;
                    logger_1.logger.info(`Merged and archived ${ids.length} duplicate account(s) for key ${group.key}`);
                }
                catch (e) {
                    console.warn('Failed to archive duplicates during account dedupe:', (e === null || e === void 0 ? void 0 : e.message) || e);
                }
            }
            return anyChanged;
        });
    }
    /**
     * One-time migration: move sale income transactions from rental ledger to sale ledger per property.
     * Safe to run multiple times (idempotent using transaction.paymentId uniqueness).
     */
    migrateSalesLedgerForCompany(companyPropertyIds) {
        return __awaiter(this, void 0, void 0, function* () {
            let moved = 0;
            let propertiesAffected = 0;
            const filter = {};
            if (Array.isArray(companyPropertyIds) && companyPropertyIds.length > 0) {
                filter.propertyId = { $in: companyPropertyIds.map(id => new mongoose_1.default.Types.ObjectId(id)) };
            }
            const rentalAccounts = yield PropertyAccount_1.default.find(Object.assign(Object.assign({}, filter), { isArchived: false, isActive: { $ne: false }, ledgerType: { $in: [null, 'rental'] } }));
            for (const rental of rentalAccounts) {
                this.validateWritableAccount(rental, String(rental.propertyId), 'migrateSalesLedgerForCompany');
                const saleTx = (rental.transactions || []).filter(t => t.type === 'income' && t.category === 'sale_income');
                if (saleTx.length === 0)
                    continue;
                const saleAccount = yield this.getOrCreatePropertyAccount(rental.propertyId.toString(), 'sale');
                // Move each tx if not already present in sale ledger (by paymentId)
                let movedHere = 0;
                for (const tx of saleTx) {
                    const exists = saleAccount.transactions.some(st => st.type === 'income' && st.paymentId && tx.paymentId && st.paymentId.toString() === tx.paymentId.toString());
                    if (exists)
                        continue;
                    {
                        const copy = Object.assign({}, tx);
                        delete copy._id;
                        saleAccount.transactions.push(copy);
                    }
                    movedHere++;
                    moved++;
                }
                if (movedHere > 0) {
                    for (const tx of rental.transactions || []) {
                        if (tx.type === 'income' && tx.category === 'sale_income') {
                            tx.status = 'cancelled';
                            tx.updatedAt = new Date();
                        }
                    }
                    this.validateWritableAccount(saleAccount, String(saleAccount.propertyId), 'migrateSalesLedgerForCompany');
                    yield saleAccount.save();
                    yield rental.save();
                    yield this.recalculateBalance(saleAccount);
                    yield this.recalculateBalance(rental);
                    propertiesAffected++;
                }
            }
            return { moved, propertiesAffected };
        });
    }
    /**
     * Merge a source PropertyAccount into a target PropertyAccount (cross-ledger merge).
     * Deduplicates transactions by paymentId or derived key, and payouts by referenceNumber.
     */
    mergeAccountsCrossLedger(source, target) {
        return __awaiter(this, void 0, void 0, function* () {
            let mergedTransactions = 0;
            let mergedPayouts = 0;
            this.validateWritableAccount(source, String(source.propertyId), 'mergeAccountsCrossLedger:source');
            this.validateWritableAccount(target, String(target.propertyId), 'mergeAccountsCrossLedger:target');
            // Build uniqueness sets from target
            const txKeys = new Set();
            for (const t of (target.transactions || [])) {
                const pid = (t === null || t === void 0 ? void 0 : t.paymentId) ? String(t.paymentId) : '';
                const key = pid
                    ? `pid:${pid}`
                    : `free:${t.type}:${t.referenceNumber || ''}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`;
                txKeys.add(key);
            }
            const payoutKeys = new Map(); // referenceNumber -> index
            for (let i = 0; i < (target.ownerPayouts || []).length; i++) {
                const p = target.ownerPayouts[i];
                const ref = p.referenceNumber || String(p._id || '');
                payoutKeys.set(ref, i);
            }
            // Merge transactions
            for (const t of (source.transactions || [])) {
                const pid = (t === null || t === void 0 ? void 0 : t.paymentId) ? String(t.paymentId) : '';
                const key = pid
                    ? `pid:${pid}`
                    : `free:${t.type}:${t.referenceNumber || ''}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`;
                if (!txKeys.has(key)) {
                    const copy = Object.assign({}, t);
                    delete copy._id;
                    target.transactions.push(copy);
                    txKeys.add(key);
                    mergedTransactions++;
                }
            }
            // Merge payouts (prefer completed or latest updatedAt)
            for (const p of (source.ownerPayouts || [])) {
                const ref = p.referenceNumber || String(p._id || '');
                if (!payoutKeys.has(ref)) {
                    const copy = Object.assign({}, p);
                    delete copy._id;
                    target.ownerPayouts.push(copy);
                    payoutKeys.set(ref, (target.ownerPayouts || []).length - 1);
                    mergedPayouts++;
                }
                else {
                    const idx = payoutKeys.get(ref);
                    const existing = target.ownerPayouts[idx];
                    const preferNew = (existing.status !== 'completed' && p.status === 'completed') ||
                        (new Date(p.updatedAt || p.createdAt).getTime() > new Date(existing.updatedAt || existing.createdAt).getTime());
                    if (preferNew) {
                        target.ownerPayouts[idx] = Object.assign(Object.assign({}, p), { _id: existing._id });
                    }
                }
            }
            yield target.save();
            yield this.recalculateBalance(target);
            yield PropertyAccount_1.default.updateOne({ _id: source._id, isArchived: false }, { $set: { isArchived: true, isActive: false, lastUpdated: new Date() } });
            return { mergedTransactions, mergedPayouts };
        });
    }
    /**
     * One-off migration: Normalize legacy ledger types to 'sale' where appropriate.
     * - For properties with rentalType 'sale', or when the id is a development/development unit.
     * - Merges into existing sale ledgers if present (cross-ledger), otherwise updates ledgerType.
     */
    migrateLegacyLedgerTypesForCompany(companyId, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const dryRun = Boolean(options === null || options === void 0 ? void 0 : options.dryRun);
            const details = [];
            let examined = 0;
            let updated = 0;
            let merged = 0;
            let skipped = 0;
            let errors = 0;
            try {
                // Discover all property-like ids scoped by company when provided
                let propertyFilter = {};
                let developmentFilter = {};
                if (companyId) {
                    propertyFilter.companyId = companyId;
                    developmentFilter.companyId = companyId;
                }
                const [properties, developments] = yield Promise.all([
                    Property_1.Property.find(propertyFilter).select('_id rentalType').lean(),
                    Development_1.Development.find(developmentFilter).select('_id').lean()
                ]);
                const propertyIds = properties.map(p => String(p._id));
                const developmentIds = developments.map(d => String(d._id));
                let unitIds = [];
                if (developmentIds.length > 0) {
                    try {
                        const units = yield DevelopmentUnit_1.DevelopmentUnit.find({ developmentId: { $in: developmentIds } }).select('_id').lean();
                        unitIds = units.map(u => String(u._id));
                    }
                    catch (_a) {
                        // ignore unit lookup failures
                    }
                }
                const salePropertyIdSet = new Set(properties
                    .filter((p) => String((p === null || p === void 0 ? void 0 : p.rentalType) || '').toLowerCase() === 'sale')
                    .map((p) => String(p._id)));
                const developmentIdSet = new Set(developmentIds);
                const unitIdSet = new Set(unitIds);
                const allIdsSet = new Set([...propertyIds, ...developmentIds, ...unitIds]);
                // Query candidate legacy accounts: missing ledgerType or 'rental'
                const candidates = yield PropertyAccount_1.default.find({
                    propertyId: { $in: Array.from(allIdsSet).map(id => new mongoose_1.default.Types.ObjectId(id)) },
                    isArchived: false,
                    isActive: { $ne: false },
                    $or: [{ ledgerType: { $exists: false } }, { ledgerType: null }, { ledgerType: 'rental' }]
                });
                for (const acc of candidates) {
                    examined++;
                    const pid = String(acc.propertyId);
                    const shouldBeSale = salePropertyIdSet.has(pid) || developmentIdSet.has(pid) || unitIdSet.has(pid);
                    if (!shouldBeSale) {
                        skipped++;
                        details.push({ propertyId: pid, action: 'skipped', reason: 'Not a sale/development entity' });
                        continue;
                    }
                    if (acc.ledgerType === 'sale') {
                        skipped++;
                        details.push({ propertyId: pid, action: 'skipped', reason: 'Already sale ledger' });
                        continue;
                    }
                    try {
                        // If a sale ledger already exists for this property, merge into it; else update this one to sale
                        const existingSale = yield PropertyAccount_1.default.findOne({ propertyId: acc.propertyId, ledgerType: 'sale', isArchived: false, isActive: { $ne: false } });
                        if (existingSale && String(existingSale._id) !== String(acc._id)) {
                            if (dryRun) {
                                merged++;
                                details.push({ propertyId: pid, action: 'merged', reason: 'Would merge into existing sale ledger (dry-run)' });
                            }
                            else {
                                yield this.mergeAccountsCrossLedger(acc, existingSale);
                                merged++;
                                details.push({ propertyId: pid, action: 'merged' });
                            }
                            continue;
                        }
                        // No existing sale ledger: flip ledgerType to 'sale'
                        if (dryRun) {
                            updated++;
                            details.push({ propertyId: pid, action: 'updated', reason: 'Would set ledgerType to sale (dry-run)' });
                        }
                        else {
                            this.validateWritableAccount(acc, String(acc.propertyId), 'migrateLegacyLedgerTypesForCompany');
                            acc.ledgerType = 'sale';
                            yield acc.save();
                            yield this.recalculateBalance(acc);
                            updated++;
                            details.push({ propertyId: pid, action: 'updated' });
                        }
                    }
                    catch (e) {
                        errors++;
                        details.push({ propertyId: String(acc.propertyId), action: 'error', reason: (e === null || e === void 0 ? void 0 : e.message) || 'unknown' });
                    }
                }
            }
            catch (outer) {
                errors++;
                details.push({ propertyId: '', action: 'error', reason: (outer === null || outer === void 0 ? void 0 : outer.message) || 'migration failed' });
            }
            return { examined, updated, merged, skipped, errors, details };
        });
    }
}
exports.PropertyAccountService = PropertyAccountService;
PropertyAccountService.ONE_TIME_DUPLICATE_CLEANUP_KEY = 'property_account_duplicate_cleanup_v1';
exports.default = PropertyAccountService.getInstance();
// Convenience named export for scripts/tools that call this migration directly
function migrateSalesLedgerForCompany(companyPropertyIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const service = PropertyAccountService.getInstance();
        return service.migrateSalesLedgerForCompany(companyPropertyIds);
    });
}
// Explicit maintenance only. Identical income copies may be cancelled after classification.
// Ambiguous, cross-ledger, and reversal rows are preserved.
function reconcilePropertyLedgerDuplicates(propertyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const service = PropertyAccountService.getInstance();
        const account = yield service.getPropertyAccount(propertyId);
        service.validateWritableAccount(account, propertyId, 'reconcilePropertyLedgerDuplicates');
        const tx = Array.isArray(account.transactions) ? account.transactions : [];
        const plan = (0, propertyAccountDuplicateInventory_1.classifyLedgerTransactionDuplicates)(tx.map((line) => ({
            _id: line._id,
            type: line.type,
            status: line.status,
            amount: line.amount,
            category: line.category,
            paymentId: line.paymentId,
            reversesPaymentId: line.reversesPaymentId,
            idempotencyKey: line.idempotencyKey,
            date: line.date,
            ledgerType: account.ledgerType
        })));
        const kept = tx.length - (plan.classification === 'SAFE_IDENTICAL' ? plan.cancelIds.length : 0);
        if (plan.classification !== 'SAFE_IDENTICAL' || plan.cancelIds.length === 0) {
            return {
                removed: 0,
                kept: tx.length,
                accountId: String(account._id),
                classification: plan.classification,
                reason: plan.reason,
                mutated: false
            };
        }
        yield PropertyAccount_1.default.updateOne({ _id: account._id, propertyId: account.propertyId, isArchived: false, isActive: { $ne: false } }, {
            $set: {
                'transactions.$[t].status': 'cancelled',
                'transactions.$[t].updatedAt': new Date(),
                lastUpdated: new Date()
            }
        }, {
            arrayFilters: [{
                    't._id': {
                        $in: plan.cancelIds.map((id) => (mongoose_1.default.Types.ObjectId.isValid(id) ? new mongoose_1.default.Types.ObjectId(id) : id))
                    }
                }]
        });
        const fresh = yield PropertyAccount_1.default.findOne({ _id: account._id, isArchived: false, isActive: { $ne: false } });
        if (fresh) {
            yield service.recalculateBalance(fresh);
        }
        return {
            removed: plan.cancelIds.length,
            kept,
            accountId: String(account._id),
            classification: plan.classification,
            reason: plan.reason,
            mutated: true
        };
    });
}
// Convenience export to ensure development ledgers exist and backfill payments
function ensureDevelopmentLedgersAndBackfillPayments(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const service = PropertyAccountService.getInstance();
        return service.ensureDevelopmentLedgersAndBackfillPayments(opts);
    });
}
// Initialize/upgrade property account indexes at startup
function initializePropertyAccountIndexes() {
    return __awaiter(this, void 0, void 0, function* () {
        const { isIndexCreationAllowed } = yield Promise.resolve().then(() => __importStar(require('./ledgerMutationPolicy')));
        if (!isIndexCreationAllowed()) {
            return;
        }
        const svc = PropertyAccountService.getInstance();
        if (typeof svc.ensureLedgerIndexes === 'function') {
            yield svc.ensureLedgerIndexes();
        }
    });
}
// Detection-only. Duplicate merges stay on the confirmed per-property endpoint,
// and only SAFE_DUPLICATE groups are eligible there.
function runPropertyLedgerMaintenance(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const service = PropertyAccountService.getInstance();
        const migrated = yield service.migrateLegacyLedgerTypesForCompany((options === null || options === void 0 ? void 0 : options.companyId) || undefined, { dryRun: true });
        return {
            migrated,
            deduped: { groupsChanged: false },
            reconciled: { accountsProcessed: 0, removals: 0 }
        };
    });
}
