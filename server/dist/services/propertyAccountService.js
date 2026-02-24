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
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const Development_1 = require("../models/Development");
const DevelopmentUnit_1 = require("../models/DevelopmentUnit");
const uuid_1 = require("uuid");
// Upgrade legacy indexes: allow separate ledgers per property
let ledgerIndexUpgradePromise = null;
class PropertyAccountService {
    static getInstance() {
        if (!PropertyAccountService.instance) {
            PropertyAccountService.instance = new PropertyAccountService();
        }
        return PropertyAccountService.instance;
    }
    /**
     * Infer ledger type strictly from the entity itself.
     * - Property.rentalType:
     *   - 'introduction' | 'management' → 'rental'
     *   - 'sale' → 'sale'
     * - Development or DevelopmentUnit id → 'sale'
     * Throws if the type cannot be determined. No defaults.
     */
    inferLedgerTypeForProperty(propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            // Try as Property first
            const property = yield Property_1.Property.findById(propertyId).lean();
            if (property) {
                const rt = String((property === null || property === void 0 ? void 0 : property.rentalType) || '').toLowerCase();
                if (rt === 'introduction' || rt === 'management')
                    return 'rental';
                if (rt === 'sale')
                    return 'sale';
                throw new errorHandler_1.AppError('Unable to determine ledger type: property.rentalType must be introduction, management, or sale', 400);
            }
            // If not a Property, allow Development/DevelopmentUnit ids as sales ledgers
            const dev = yield Development_1.Development.findById(propertyId).select('_id').lean();
            if (dev)
                return 'sale';
            const unit = yield DevelopmentUnit_1.DevelopmentUnit.findById(propertyId).select('_id').lean();
            if (unit)
                return 'sale';
            throw new errorHandler_1.AppError('Unable to determine ledger type: entity not found', 404);
        });
    }
    /**
     * Get or create property account
     */
    getOrCreatePropertyAccount(propertyId, ledgerType) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            try {
                // Ensure indexes support multi-ledger before any creates
                yield this.ensureLedgerIndexes();
                console.log('getOrCreatePropertyAccount called with propertyId:', propertyId);
                console.log('Converting to ObjectId:', new mongoose_1.default.Types.ObjectId(propertyId));
                // If caller passed no explicit ledgerType, infer it
                const effectiveLedger = ledgerType !== null && ledgerType !== void 0 ? ledgerType : yield this.inferLedgerTypeForProperty(propertyId);
                let account = yield PropertyAccount_1.default.findOne({ propertyId: new mongoose_1.default.Types.ObjectId(propertyId), ledgerType: effectiveLedger });
                console.log('Database query result:', account ? 'Found account' : 'No account found');
                // If a legacy ledger (without ledgerType) also exists for this property, prefer it when it appears more complete.
                // This ensures older, accurate ledgers remain visible in the UI when a newer, partial ledger was created.
                if (account) {
                    try {
                        const legacy = yield PropertyAccount_1.default.findOne({
                            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
                            $or: [{ ledgerType: { $exists: false } }, { ledgerType: null }]
                        });
                        if (legacy) {
                            const legacyIncome = Number((legacy === null || legacy === void 0 ? void 0 : legacy.totalIncome) || 0);
                            const currentIncome = Number((account === null || account === void 0 ? void 0 : account.totalIncome) || 0);
                            const legacyTxCount = Array.isArray(legacy === null || legacy === void 0 ? void 0 : legacy.transactions) ? legacy.transactions.length : 0;
                            const currentTxCount = Array.isArray(account === null || account === void 0 ? void 0 : account.transactions) ? account.transactions.length : 0;
                            // Prefer legacy if it has equal/greater totalIncome or more transactions (heuristic for completeness)
                            if (legacyIncome >= currentIncome || legacyTxCount > currentTxCount) {
                                account = legacy;
                            }
                        }
                    }
                    catch (_g) { }
                }
                // If no account of the requested ledgerType exists, but a legacy ledger exists,
                // adopt the legacy ledger by assigning the appropriate ledgerType instead of creating a new doc.
                if (!account) {
                    try {
                        const legacy = yield PropertyAccount_1.default.findOne({
                            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
                            $or: [{ ledgerType: { $exists: false } }, { ledgerType: null }]
                        });
                        if (legacy) {
                            legacy.ledgerType = effectiveLedger;
                            try {
                                yield legacy.save();
                                yield this.recalculateBalance(legacy);
                                account = legacy;
                            }
                            catch (adoptErr) {
                                // If a concurrent create slipped in and caused a duplicate-key on (propertyId, ledgerType),
                                // fall back to loading the newly created account.
                                const isDup = ((adoptErr === null || adoptErr === void 0 ? void 0 : adoptErr.code) === 11000) || /E11000 duplicate key error/.test(String((adoptErr === null || adoptErr === void 0 ? void 0 : adoptErr.message) || ''));
                                if (isDup) {
                                    const reloaded = yield PropertyAccount_1.default.findOne({ propertyId: new mongoose_1.default.Types.ObjectId(propertyId), ledgerType: effectiveLedger });
                                    if (reloaded) {
                                        account = reloaded;
                                    }
                                    else {
                                        throw adoptErr;
                                    }
                                }
                                else {
                                    throw adoptErr;
                                }
                            }
                        }
                    }
                    catch (_h) { }
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
                        catch (_j) { }
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
                        catch (_k) { }
                        const unitLabel = (unit === null || unit === void 0 ? void 0 : unit.unitCode) || ((unit === null || unit === void 0 ? void 0 : unit.unitNumber) ? `Unit ${unit.unitNumber}` : 'Development Unit');
                        displayName = devLabel ? `${unitLabel} - ${devLabel}` : unitLabel;
                    }
                    // Create new account
                    account = new PropertyAccount_1.default({
                        propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
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
                        isActive: true
                    });
                    try {
                        yield account.save();
                    }
                    catch (saveErr) {
                        const isDup = ((saveErr === null || saveErr === void 0 ? void 0 : saveErr.code) === 11000) || /E11000 duplicate key error/.test(String((saveErr === null || saveErr === void 0 ? void 0 : saveErr.message) || ''));
                        if (isDup) {
                            const reloaded = yield PropertyAccount_1.default.findOne({ propertyId: new mongoose_1.default.Types.ObjectId(propertyId), ledgerType: effectiveLedger });
                            if (reloaded) {
                                account = reloaded;
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
                else {
                    // Recalculate balance for existing account
                    yield this.recalculateBalance(account);
                }
                return account;
            }
            catch (error) {
                logger_1.logger.error('Error in getOrCreatePropertyAccount:', error);
                throw error;
            }
        });
    }
    // One-time index upgrade to support { propertyId, ledgerType } uniqueness
    ensureLedgerIndexes() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!ledgerIndexUpgradePromise) {
                ledgerIndexUpgradePromise = (() => __awaiter(this, void 0, void 0, function* () {
                    try {
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
                        // Ensure unique compound index exists and is partial on non-archived docs
                        const compound = indexes.find((idx) => idx.name === 'propertyId_1_ledgerType_1');
                        const compoundIsGood = compound &&
                            compound.unique === true &&
                            compound.partialFilterExpression &&
                            compound.partialFilterExpression.isArchived &&
                            compound.partialFilterExpression.isArchived.$ne === true;
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
                            try {
                                yield PropertyAccount_1.default.collection.createIndex({ propertyId: 1, ledgerType: 1 }, { unique: true, partialFilterExpression: { isArchived: { $ne: true } } });
                                console.log('Created partial unique compound index propertyId_1_ledgerType_1 on PropertyAccount.');
                            }
                            catch (createErr) {
                                console.warn('Could not create partial compound index:', (createErr === null || createErr === void 0 ? void 0 : createErr.message) || createErr);
                            }
                        }
                        // Ensure owner payouts unique index includes ledgerType and uses partial filter (no sparse)
                        const opIdx = indexes.find((idx) => idx.name === 'propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1');
                        const opGood = opIdx && opIdx.unique === true && opIdx.partialFilterExpression && opIdx.partialFilterExpression.isArchived && opIdx.partialFilterExpression.isArchived.$ne === true && opIdx.partialFilterExpression['ownerPayouts.referenceNumber'];
                        if (!opGood) {
                            try {
                                if (opIdx)
                                    yield PropertyAccount_1.default.collection.dropIndex('propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1');
                            }
                            catch (_a) { }
                            try {
                                yield PropertyAccount_1.default.collection.createIndex({ propertyId: 1, ledgerType: 1, 'ownerPayouts.referenceNumber': 1 }, { unique: true, partialFilterExpression: { isArchived: { $ne: true }, 'ownerPayouts.referenceNumber': { $exists: true, $type: 'string' } } });
                                console.log('Created partial unique owner payout index propertyId_1_ledgerType_1_ownerPayouts.referenceNumber_1.');
                            }
                            catch (createErr) {
                                console.warn('Could not create owner payout compound index:', (createErr === null || createErr === void 0 ? void 0 : createErr.message) || createErr);
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
                        const txGood = txIdx && txIdx.unique === true && txIdx.partialFilterExpression && txIdx.partialFilterExpression.isArchived && txIdx.partialFilterExpression.isArchived.$ne === true && txIdx.partialFilterExpression['transactions.paymentId'];
                        if (!txGood) {
                            try {
                                if (txIdx)
                                    yield PropertyAccount_1.default.collection.dropIndex('propertyId_1_ledgerType_1_transactions.paymentId_1');
                            }
                            catch (_b) { }
                            try {
                                yield PropertyAccount_1.default.collection.createIndex({ propertyId: 1, ledgerType: 1, 'transactions.paymentId': 1 }, { unique: true, partialFilterExpression: { isArchived: { $ne: true }, 'transactions.paymentId': { $exists: true } } });
                                console.log('Created partial unique transactions index propertyId_1_ledgerType_1_transactions.paymentId_1.');
                            }
                            catch (createErr) {
                                console.warn('Could not create transactions compound index:', (createErr === null || createErr === void 0 ? void 0 : createErr.message) || createErr);
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
            // Calculate totals from transactions
            const totalIncome = account.transactions
                .filter(t => t.type === 'income' && t.status === 'completed')
                .reduce((sum, t) => sum + t.amount, 0);
            const totalExpenses = account.transactions
                .filter(t => t.type !== 'income' && t.status === 'completed')
                .reduce((sum, t) => sum + t.amount, 0);
            const totalOwnerPayouts = account.ownerPayouts
                .filter(p => p.status === 'completed')
                .reduce((sum, p) => sum + p.amount, 0);
            // Calculate running balance
            const newRunningBalance = totalIncome - totalExpenses - totalOwnerPayouts;
            // Update the account if balance has changed
            if (account.runningBalance !== newRunningBalance) {
                account.runningBalance = newRunningBalance;
                account.totalIncome = totalIncome;
                account.totalExpenses = totalExpenses;
                account.totalOwnerPayouts = totalOwnerPayouts;
                account.lastUpdated = new Date();
                // Use updateOne instead of save() to avoid triggering pre-save middleware
                yield PropertyAccount_1.default.updateOne({ _id: account._id }, {
                    $set: {
                        runningBalance: newRunningBalance,
                        totalIncome: totalIncome,
                        totalExpenses: totalExpenses,
                        totalOwnerPayouts: totalOwnerPayouts,
                        lastUpdated: new Date()
                    }
                });
                console.log(`Recalculated balance for property ${account.propertyId} (${account.ledgerType || 'rental'}): ${newRunningBalance}`);
            }
        });
    }
    reconcileReversedPaymentArtifacts(account) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const paymentIds = Array.from(new Set((account.transactions || [])
                    .map((t) => String((t === null || t === void 0 ? void 0 : t.paymentId) || ''))
                    .filter(Boolean)));
                if (!paymentIds.length)
                    return;
                const reversedPayments = yield Payment_1.Payment.find({
                    _id: { $in: paymentIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) },
                    status: 'reversed'
                })
                    .select('_id reversalPaymentId')
                    .lean();
                if (!reversedPayments.length)
                    return;
                const reversedSet = new Set(reversedPayments.map((p) => String(p._id)));
                const reversalSet = new Set(reversedPayments
                    .map((p) => ((p === null || p === void 0 ? void 0 : p.reversalPaymentId) ? String(p.reversalPaymentId) : ''))
                    .filter(Boolean));
                let changed = false;
                for (const tx of (account.transactions || [])) {
                    const txPid = String((tx === null || tx === void 0 ? void 0 : tx.paymentId) || '');
                    if (!txPid)
                        continue;
                    const isReversedChain = reversedSet.has(txPid) || reversalSet.has(txPid);
                    if (!isReversedChain)
                        continue;
                    if (tx.type === 'income' && String(tx.status || '') === 'completed') {
                        tx.status = 'cancelled';
                        tx.updatedAt = new Date();
                        tx.notes = tx.notes || 'Auto-cancelled due to payment reversal';
                        changed = true;
                    }
                    if (tx.type === 'expense' &&
                        String(tx.category || '') === 'payment_reversal' &&
                        String(tx.status || '') === 'completed') {
                        tx.status = 'cancelled';
                        tx.updatedAt = new Date();
                        tx.notes = tx.notes || 'Auto-cancelled after reversal-chain cleanup';
                        changed = true;
                    }
                }
                if (changed) {
                    // Bypass immutable ledger middleware for reconciliation maintenance writes.
                    yield PropertyAccount_1.default.collection.updateOne({ _id: account._id }, { $set: { transactions: account.transactions, lastUpdated: new Date() } });
                }
            }
            catch (e) {
                logger_1.logger.warn('Failed to reconcile reversed payment artifacts (non-fatal):', e);
            }
        });
    }
    /**
     * Record income from rental payments
     */
    recordIncomeFromPayment(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const payment = yield Payment_1.Payment.findById(paymentId);
                if (!payment) {
                    throw new errorHandler_1.AppError('Payment not found', 404);
                }
                // Reversal rows and correction entries must not be posted as new income.
                if (payment.reversalOfPaymentId)
                    return;
                if (Number(payment.amount || 0) < 0)
                    return;
                if (payment.status !== 'completed') {
                    logger_1.logger.info(`Skipping income recording for payment ${paymentId} - status: ${payment.status}`);
                    return;
                }
                // Guard: exclude deposit-only payments from income
                const deposit = payment.depositAmount || 0;
                if (deposit > 0 && (payment.amount <= deposit)) {
                    logger_1.logger.info(`Skipping income for deposit-only payment ${paymentId} (amount: ${payment.amount}, deposit: ${deposit})`);
                    return;
                }
                // Get or create property account (rental vs sale)
                const chosenLedger = payment.paymentType === 'sale' ? 'sale' : 'rental';
                const isSale = payment.paymentType === 'sale';
                let devId = payment === null || payment === void 0 ? void 0 : payment.developmentId;
                const unitId = payment === null || payment === void 0 ? void 0 : payment.developmentUnitId;
                const targets = [];
                if (isSale) {
                    if (unitId)
                        targets.push({ id: unitId.toString(), ledger: 'sale' });
                    if (!devId && unitId) {
                        try {
                            const unitDoc = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).select('developmentId');
                            devId = unitDoc === null || unitDoc === void 0 ? void 0 : unitDoc.developmentId;
                        }
                        catch (_c) { }
                    }
                    if (devId)
                        targets.push({ id: devId.toString(), ledger: 'sale' });
                    if (!unitId && !devId)
                        targets.push({ id: payment.propertyId.toString(), ledger: 'sale' });
                }
                else {
                    targets.push({ id: payment.propertyId.toString(), ledger: 'rental' });
                }
                let postedToAtLeastOneTarget = false;
                let notFoundCount = 0;
                for (const target of targets) {
                    let account = null;
                    try {
                        account = yield this.getOrCreatePropertyAccount(target.id, target.ledger);
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
                    // Check if income already recorded for this payment
                    const existingTransaction = account.transactions.find(t => { var _a; return ((_a = t.paymentId) === null || _a === void 0 ? void 0 : _a.toString()) === paymentId && t.type === 'income'; });
                    if (existingTransaction) {
                        logger_1.logger.info(`Income already recorded for payment: ${paymentId} on account ${String(account._id)}`);
                        postedToAtLeastOneTarget = true;
                        continue;
                    }
                    const ownerAmount = ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount) || 0;
                    const totalPaid = payment.amount || 0;
                    const depositPortion = payment.depositAmount || 0;
                    const totalCommission = ((_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.totalCommission) || 0;
                    // Align rental income with commission-calculated owner amount (legacy behavior).
                    // Deposit-only payments are already excluded above.
                    const incomeAmount = isSale
                        ? Math.max(0, ownerAmount)
                        : Math.max(0, ownerAmount);
                    if (incomeAmount <= 0) {
                        logger_1.logger.info(`Skipping income for payment ${paymentId} due to deposit exclusion or zero owner income (computed=${incomeAmount}).`);
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
                        status: 'completed',
                        processedBy: payment.processedBy,
                        referenceNumber: payment.referenceNumber,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    yield PropertyAccount_1.default.updateOne({ _id: account._id, 'transactions.paymentId': { $ne: new mongoose_1.default.Types.ObjectId(paymentId) } }, {
                        $push: { transactions: incomeTransaction },
                        $set: { lastUpdated: new Date() }
                    });
                    const fresh = yield PropertyAccount_1.default.findById(account._id);
                    if (fresh) {
                        yield this.recalculateBalance(fresh);
                    }
                    logger_1.logger.info(`Recorded income of ${incomeAmount} to account ${String(account._id)} (target ${target.id}, ledger ${target.ledger}) from payment ${paymentId}`);
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
                const targets = [];
                const isSale = payment.paymentType === 'sale';
                let devId = payment === null || payment === void 0 ? void 0 : payment.developmentId;
                const unitId = payment === null || payment === void 0 ? void 0 : payment.developmentUnitId;
                if (isSale) {
                    if (unitId)
                        targets.push({ id: unitId.toString(), ledger: 'sale' });
                    if (!devId && unitId) {
                        try {
                            const unitDoc = yield DevelopmentUnit_1.DevelopmentUnit.findById(unitId).select('developmentId');
                            devId = unitDoc === null || unitDoc === void 0 ? void 0 : unitDoc.developmentId;
                        }
                        catch (_a) { }
                    }
                    if (devId)
                        targets.push({ id: devId.toString(), ledger: 'sale' });
                    if (!unitId && !devId)
                        targets.push({ id: payment.propertyId.toString(), ledger: 'sale' });
                }
                else {
                    targets.push({ id: payment.propertyId.toString(), ledger: 'rental' });
                }
                for (const target of targets) {
                    const account = yield this.getOrCreatePropertyAccount(target.id, target.ledger);
                    const originalIncomeIds = (account.transactions || [])
                        .filter((t) => t.type === 'income' &&
                        String(t.paymentId || '') === String(payment._id || '') &&
                        String(t.status || '') === 'completed')
                        .map((t) => t._id)
                        .filter(Boolean);
                    // Clean up accidental legacy posting of reversal payment as income.
                    const reversalPaymentId = payment.reversalPaymentId ? String(payment.reversalPaymentId) : '';
                    const reversalIncomeIds = (account.transactions || [])
                        .filter((t) => t.type === 'income' &&
                        reversalPaymentId &&
                        String(t.paymentId || '') === reversalPaymentId &&
                        String(t.status || '') === 'completed')
                        .map((t) => t._id)
                        .filter(Boolean);
                    const idsToCancel = [...originalIncomeIds, ...reversalIncomeIds];
                    if (idsToCancel.length > 0) {
                        yield PropertyAccount_1.default.updateOne({ _id: account._id }, {
                            $set: {
                                'transactions.$[t].status': 'cancelled',
                                'transactions.$[t].updatedAt': new Date(),
                                'transactions.$[t].notes': (opts === null || opts === void 0 ? void 0 : opts.reason) || 'Payment reversed',
                                lastUpdated: new Date()
                            }
                        }, {
                            arrayFilters: [{ 't._id': { $in: idsToCancel } }]
                        });
                    }
                    // Retire old expense-based reversal rows for this payment to avoid duplicate noise.
                    yield PropertyAccount_1.default.updateOne({ _id: account._id }, {
                        $set: {
                            'transactions.$[t].status': 'cancelled',
                            'transactions.$[t].updatedAt': new Date(),
                            lastUpdated: new Date()
                        }
                    }, {
                        arrayFilters: [{
                                't.type': 'expense',
                                't.category': 'payment_reversal',
                                't.paymentId': new mongoose_1.default.Types.ObjectId(paymentId),
                                't.status': 'completed'
                            }]
                    });
                    const fresh = yield PropertyAccount_1.default.findById(account._id);
                    if (fresh) {
                        yield this.recalculateBalance(fresh);
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Error reversing income from payment:', error);
                throw error;
            }
        });
    }
    /**
     * Ensure ledgers for developments (with units) exist and backfill existing sale payments into those ledgers.
     * - Cross-references Developments and DevelopmentUnits
     * - Creates sale ledgers per development if missing (idempotent)
     * - Posts existing completed sale payments tied to the development or its units
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
                const existing = yield PropertyAccount_1.default.findOne({
                    propertyId: new mongoose_1.default.Types.ObjectId(dev._id),
                    ledgerType: 'sale'
                });
                if (!existing) {
                    yield this.getOrCreatePropertyAccount(dev._id.toString(), 'sale');
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
                // Backfill incomes into dev ledger (and unit ledger if missing) idempotently
                for (const p of salePayments) {
                    try {
                        yield this.recordIncomeFromPayment(p._id.toString());
                        backfillInvocations++;
                    }
                    catch (e) {
                        console.warn(`Backfill failed for payment ${String(p._id)} on development ${String(dev._id)}:`, (e === null || e === void 0 ? void 0 : e.message) || e);
                    }
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
                const account = yield this.getOrCreatePropertyAccount(propertyId, ledgerType);
                if (account.runningBalance < expenseData.amount) {
                    throw new errorHandler_1.AppError('Insufficient balance for this expense', 400);
                }
                const expenseTransaction = {
                    type: 'expense',
                    amount: expenseData.amount,
                    date: expenseData.date,
                    description: expenseData.description,
                    category: expenseData.category || 'general',
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
                let res = yield PropertyAccount_1.default.updateOne(Object.assign({ _id: account._id, runningBalance: { $gte: expenseData.amount }, 'transactions.idempotencyKey': { $ne: idKey } }, (previousLastUpdated ? { lastUpdated: previousLastUpdated } : {})), {
                    $push: { transactions: expenseTransaction },
                    $set: { lastUpdated: new Date() }
                });
                if ((res === null || res === void 0 ? void 0 : res.modifiedCount) === 0) {
                    // Retry once with refreshed state
                    const fresh = yield PropertyAccount_1.default.findById(account._id);
                    if (fresh) {
                        yield this.recalculateBalance(fresh);
                        res = yield PropertyAccount_1.default.updateOne({
                            _id: fresh._id,
                            runningBalance: { $gte: expenseData.amount },
                            'transactions.idempotencyKey': { $ne: idKey }
                        }, {
                            $push: { transactions: expenseTransaction },
                            $set: { lastUpdated: new Date() }
                        });
                    }
                }
                const reloaded = yield PropertyAccount_1.default.findById(account._id);
                if (reloaded)
                    yield this.recalculateBalance(reloaded);
                logger_1.logger.info(`Added expense (idempotent, guarded) of ${expenseData.amount} to property ${propertyId}`);
                return (yield this.getPropertyAccount(propertyId));
            }
            catch (error) {
                logger_1.logger.error('Error adding expense:', error);
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
                const account = yield this.getPropertyAccount(propertyId, ledgerType);
                if (account.runningBalance < payoutData.amount) {
                    throw new errorHandler_1.AppError('Insufficient balance for this payout', 400);
                }
                const referenceNumber = `PAYOUT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const payout = {
                    amount: payoutData.amount,
                    date: new Date(),
                    paymentMethod: payoutData.paymentMethod,
                    referenceNumber,
                    idempotencyKey: idKey,
                    status: 'pending',
                    processedBy: new mongoose_1.default.Types.ObjectId(payoutData.processedBy),
                    recipientId: new mongoose_1.default.Types.ObjectId(payoutData.recipientId),
                    recipientName: payoutData.recipientName,
                    recipientBankDetails: payoutData.recipientBankDetails,
                    notes: payoutData.notes,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                yield PropertyAccount_1.default.updateOne({ _id: account._id, 'ownerPayouts.idempotencyKey': { $ne: idKey } }, { $push: { ownerPayouts: payout }, $set: { lastUpdated: new Date() } });
                const fresh = yield PropertyAccount_1.default.findById(account._id);
                if (fresh)
                    yield this.recalculateBalance(fresh);
                logger_1.logger.info(`Created owner payout (idempotent) of ${payoutData.amount} for property ${propertyId}`);
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
                const accounts = yield PropertyAccount_1.default.find({ propertyId: pid });
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
                // Atomic status transition
                const now = new Date();
                if (targetPayout.status === 'pending' && status === 'completed') {
                    if (targetAccount.runningBalance < targetPayout.amount) {
                        throw new errorHandler_1.AppError('Insufficient balance to complete payout', 400);
                    }
                    const res = yield PropertyAccount_1.default.updateOne({
                        _id: targetAccount._id,
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
                        ownerPayouts: { $elemMatch: { _id: new mongoose_1.default.Types.ObjectId(payoutId) } }
                    }, {
                        $set: { 'ownerPayouts.$.status': status, 'ownerPayouts.$.updatedAt': now, lastUpdated: now }
                    });
                    if ((res === null || res === void 0 ? void 0 : res.modifiedCount) === 0) {
                        throw new errorHandler_1.AppError('Payout status update conflict', 409);
                    }
                }
                const fresh = yield PropertyAccount_1.default.findById(targetAccount._id);
                if (fresh)
                    yield this.recalculateBalance(fresh);
                logger_1.logger.info(`Updated payout ${payoutId} status to ${status} for property ${propertyId} on ledger ${String(targetAccount.ledgerType || 'unknown')}`);
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
    getPropertyAccount(propertyId, ledgerType) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            try {
                // Ensure indexes are healthy and up-to-date (partial unique with archive support)
                yield this.ensureLedgerIndexes();
                const pid = new mongoose_1.default.Types.ObjectId(propertyId);
                // Prefer exact ledgerType; consider legacy records without ledgerType as candidates as well.
                const effectiveLedger = ledgerType || (yield this.inferLedgerTypeForProperty(propertyId));
                const candidates = yield PropertyAccount_1.default.find({
                    propertyId: pid,
                    isArchived: { $ne: true },
                    $or: [{ ledgerType: effectiveLedger }, { ledgerType: { $exists: false } }, { ledgerType: null }]
                });
                let account = null;
                if (!candidates || candidates.length === 0) {
                    // Create if missing
                    account = (yield this.getOrCreatePropertyAccount(propertyId, effectiveLedger));
                }
                else if (candidates.length === 1) {
                    account = candidates[0];
                }
                else {
                    // Multiple ledgers found (duplicates/legacy). Pick the most complete deterministically.
                    const score = (acc) => {
                        const txCount = Array.isArray(acc.transactions) ? acc.transactions.length : 0;
                        const payoutCount = Array.isArray(acc.ownerPayouts) ? acc.ownerPayouts.length : 0;
                        const income = Number(acc.totalIncome || 0);
                        const updated = acc.lastUpdated ? new Date(acc.lastUpdated).getTime() : 0;
                        return { txCount, payoutCount, income, updated };
                    };
                    // Prefer legacy (missing/null ledgerType) as authoritative if present
                    const prefer = candidates.filter(c => c.ledgerType == null);
                    const pool = prefer.length > 0 ? prefer : candidates;
                    let best = pool[0];
                    for (const c of pool.slice(1)) {
                        const a = score(best);
                        const b = score(c);
                        const aScore = a.txCount + a.payoutCount;
                        const bScore = b.txCount + b.payoutCount;
                        if (bScore > aScore || (bScore === aScore && (b.income > a.income || (b.income === a.income && b.updated > a.updated)))) {
                            best = c;
                        }
                    }
                    account = best;
                }
                if (!account)
                    throw new errorHandler_1.AppError('Property account not found', 404);
                // Update owner information if missing or outdated
                if (!account.ownerName || account.ownerName === 'Unknown Owner') {
                    const property = yield Property_1.Property.findById(propertyId);
                    if (property) {
                        let ownerName = 'Unknown Owner';
                        let ownerId = null;
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
                        if (ownerId) {
                            account.ownerId = ownerId;
                            account.ownerName = ownerName;
                            yield account.save();
                        }
                    }
                    else {
                        // Fallback: resolve via Development document
                        const development = yield Development_1.Development.findById(propertyId);
                        if (development) {
                            const first = ((_a = development.owner) === null || _a === void 0 ? void 0 : _a.firstName) || '';
                            const last = ((_b = development.owner) === null || _b === void 0 ? void 0 : _b.lastName) || '';
                            const companyName = ((_c = development.owner) === null || _c === void 0 ? void 0 : _c.companyName) || '';
                            const combined = `${first} ${last}`.trim();
                            const ownerName = combined || companyName || 'Unknown Owner';
                            account.ownerName = ownerName;
                            yield account.save();
                        }
                        else {
                            // Fallback: resolve via DevelopmentUnit -> parent Development
                            const unit = yield DevelopmentUnit_1.DevelopmentUnit.findById(propertyId);
                            if (unit) {
                                try {
                                    const dev = yield Development_1.Development.findById(unit.developmentId);
                                    const first = ((_d = dev === null || dev === void 0 ? void 0 : dev.owner) === null || _d === void 0 ? void 0 : _d.firstName) || '';
                                    const last = ((_e = dev === null || dev === void 0 ? void 0 : dev.owner) === null || _e === void 0 ? void 0 : _e.lastName) || '';
                                    const companyName = ((_f = dev === null || dev === void 0 ? void 0 : dev.owner) === null || _f === void 0 ? void 0 : _f.companyName) || '';
                                    const combined = `${first} ${last}`.trim();
                                    const ownerName = combined || companyName || 'Unknown Owner';
                                    account.ownerName = ownerName;
                                    yield account.save();
                                }
                                catch (_g) { }
                            }
                        }
                    }
                }
                // Defensive backfill for sales ledger: ensure owner income for each completed sale payment exists
                if (effectiveLedger === 'sale') {
                    try {
                        // Determine whether this account is for a Development, a Development Unit, or a Property
                        const devExists = yield Development_1.Development.exists({ _id: pid });
                        const unitExists = yield DevelopmentUnit_1.DevelopmentUnit.exists({ _id: pid });
                        const present = new Set((account.transactions || [])
                            .filter(t => t.type === 'income' && (t.category === 'sale_income' || !t.category))
                            .map(t => String(t.paymentId || ''))
                            .filter(Boolean));
                        const baseFilter = {
                            paymentType: 'sale',
                            status: 'completed',
                            isProvisional: { $ne: true },
                            isInSuspense: { $ne: true },
                            $or: [
                                { commissionFinalized: true },
                                { commissionFinalized: { $exists: false } }
                            ]
                        };
                        if (devExists) {
                            baseFilter.developmentId = pid;
                        }
                        else if (unitExists) {
                            baseFilter.developmentUnitId = pid;
                        }
                        else {
                            baseFilter.propertyId = pid;
                        }
                        const payments = yield Payment_1.Payment.find(baseFilter).select('_id');
                        const missing = payments.map(p => String(p._id)).filter(id => !present.has(id));
                        for (const mid of missing) {
                            try {
                                yield this.recordIncomeFromPayment(mid);
                            }
                            catch (e) {
                                console.warn(`Sales ledger backfill failed for payment ${mid}:`, (e === null || e === void 0 ? void 0 : e.message) || e);
                            }
                        }
                        if (missing.length > 0) {
                            account = (yield this.getOrCreatePropertyAccount(propertyId, 'sale'));
                        }
                    }
                    catch (defErr) {
                        console.warn('Sales ledger defensive backfill error (non-fatal):', defErr);
                    }
                }
                // Recalculate balance for the account
                const finalAccount = account;
                yield this.reconcileReversedPaymentArtifacts(finalAccount);
                yield this.recalculateBalance(finalAccount);
                return finalAccount;
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
    /**
     * Sync all property accounts with payment data
     */
    syncPropertyAccountsWithPayments() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Starting property account sync with payments...');
                // Get all completed payments (rental and sale) to ensure owner income is posted
                const payments = yield Payment_1.Payment.find({
                    status: 'completed'
                });
                let syncedCount = 0;
                for (const payment of payments) {
                    try {
                        yield this.recordIncomeFromPayment(payment._id.toString());
                        syncedCount++;
                    }
                    catch (error) {
                        logger_1.logger.error(`Failed to sync payment ${payment._id}:`, error);
                    }
                }
                logger_1.logger.info(`Property account sync completed. Synced ${syncedCount} payments.`);
            }
            catch (error) {
                logger_1.logger.error('Error syncing property accounts:', error);
                throw error;
            }
        });
    }
    /**
     * Get transaction history with filters
     */
    getTransactionHistory(propertyId_1, filters_1) {
        return __awaiter(this, arguments, void 0, function* (propertyId, filters, ledgerType = 'rental') {
            try {
                const account = yield this.getPropertyAccount(propertyId, ledgerType);
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
                // Choose keeper: prefer legacy (missing/null ledgerType), then by most entries, then latest lastUpdated
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
                        yield PropertyAccount_1.default.updateMany({ _id: { $in: ids } }, { $set: { isArchived: true, lastUpdated: new Date() } });
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
            const rentalAccounts = yield PropertyAccount_1.default.find(Object.assign(Object.assign({}, filter), { ledgerType: { $in: [null, 'rental'] } }));
            for (const rental of rentalAccounts) {
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
                    // Remove from rental ledger
                    rental.transactions = rental.transactions.filter(t => !(t.type === 'income' && t.category === 'sale_income'));
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
            // Bypass Mongoose middleware to delete the source document permanently
            yield PropertyAccount_1.default.collection.deleteOne({ _id: source._id });
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
                        const existingSale = yield PropertyAccount_1.default.findOne({ propertyId: acc.propertyId, ledgerType: 'sale' });
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
exports.default = PropertyAccountService.getInstance();
// Convenience named export for scripts/tools that call this migration directly
function migrateSalesLedgerForCompany(companyPropertyIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const service = PropertyAccountService.getInstance();
        return service.migrateSalesLedgerForCompany(companyPropertyIds);
    });
}
// One-off maintenance: remove duplicate income transactions per (type,paymentId) for a given property ledger
function reconcilePropertyLedgerDuplicates(propertyId, ledgerType) {
    return __awaiter(this, void 0, void 0, function* () {
        const service = PropertyAccountService.getInstance();
        const account = yield service.getPropertyAccount(propertyId, ledgerType);
        const tx = Array.isArray(account.transactions) ? account.transactions : [];
        const byKey = Object.create(null);
        for (const t of tx) {
            const pid = (t === null || t === void 0 ? void 0 : t.paymentId) ? String(t.paymentId) : '';
            if (!pid)
                continue; // only dedupe entries that reference a payment
            const key = `${t.type}:${pid}`;
            if (!byKey[key])
                byKey[key] = [];
            byKey[key].push({ _id: t._id, date: new Date(t.date) });
        }
        const toRemove = [];
        let kept = 0;
        for (const key of Object.keys(byKey)) {
            const list = byKey[key];
            if (list.length <= 1) {
                kept += list.length;
                continue;
            }
            // Keep the earliest by date, remove the rest
            const sorted = list.slice().sort((a, b) => a.date.getTime() - b.date.getTime());
            kept += 1;
            toRemove.push(...sorted.slice(1).map(i => i._id).filter(Boolean));
        }
        if (toRemove.length > 0) {
            // Use native collection update to bypass immutability middleware intentionally for repair
            yield PropertyAccount_1.default.collection.updateOne({ _id: account._id }, { $pull: { transactions: { _id: { $in: toRemove } } } });
            const fresh = yield PropertyAccount_1.default.findById(account._id);
            if (fresh) {
                yield service.recalculateBalance(fresh);
            }
        }
        return { removed: toRemove.length, kept, accountId: String(account._id) };
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
        const svc = PropertyAccountService.getInstance();
        if (typeof svc.ensureLedgerIndexes === 'function') {
            yield svc.ensureLedgerIndexes();
        }
    });
}
// Orchestrated maintenance: normalize legacy types, merge duplicates (keeping legacy), reconcile duplicate tx, recalc
function runPropertyLedgerMaintenance(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const service = PropertyAccountService.getInstance();
        yield initializePropertyAccountIndexes();
        const migrated = yield service.migrateLegacyLedgerTypesForCompany((options === null || options === void 0 ? void 0 : options.companyId) || undefined, { dryRun: Boolean(options === null || options === void 0 ? void 0 : options.dryRun) });
        let groupsChanged = false;
        if (!(options === null || options === void 0 ? void 0 : options.dryRun)) {
            // Scope accounts by company if provided (via Properties/Developments/Units)
            let accountFilter = {};
            if (options === null || options === void 0 ? void 0 : options.companyId) {
                const [props, devs] = yield Promise.all([
                    Property_1.Property.find({ companyId: options.companyId }).select('_id'),
                    Development_1.Development.find({ companyId: options.companyId }).select('_id')
                ]);
                const devIds = devs.map((d) => d._id);
                let unitIds = [];
                try {
                    unitIds = yield DevelopmentUnit_1.DevelopmentUnit.find({ developmentId: { $in: devIds } }).distinct('_id');
                }
                catch (_a) { }
                const ids = [...props.map(p => p._id), ...devIds, ...unitIds];
                accountFilter.propertyId = { $in: ids };
            }
            const accounts = yield PropertyAccount_1.default.find(Object.assign(Object.assign({}, accountFilter), { isArchived: { $ne: true } }));
            // Use internal merge with legacy preference
            const svcAny = service;
            if (typeof svcAny.mergeDuplicateAccounts === 'function') {
                groupsChanged = yield svcAny.mergeDuplicateAccounts(accounts);
            }
            // Reconcile duplicate income transactions per account
            const propertyIds = Array.from(new Set(accounts.map(a => String(a.propertyId))));
            let removals = 0;
            for (const pid of propertyIds) {
                try {
                    const res = yield reconcilePropertyLedgerDuplicates(pid);
                    removals += res.removed || 0;
                }
                catch (_b) { }
            }
            return {
                migrated,
                deduped: { groupsChanged },
                reconciled: { accountsProcessed: propertyIds.length, removals }
            };
        }
        return {
            migrated,
            deduped: { groupsChanged: false },
            reconciled: { accountsProcessed: 0, removals: 0 }
        };
    });
}
